import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2
import slam_service_pb2_grpc
import time

import collections

# loggin
import logging
import os

# Définir le nom du logger avec le nom du fichier
LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]  # 'server_slam'

DEBUG_CLIENT = False
DEBUG_LOGS = True  # <--- Active ou désactive les logs debug ici

logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG if DEBUG_LOGS else logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('[%(asctime)s][%(name)s][%(levelname)s] %(message)s')
handler.setFormatter(formatter)
logger.handlers = [handler]


def apply_voxel_grid_filter(pointcloud, voxel_size=0.01):
    """
    Réduit la densité d'un nuage de points en appliquant un filtre de type grille voxel.
    Pour chaque voxel, le point représentatif est positionné au centroïde des points du voxel,
    et sa couleur est celle du point le plus proche du centroïde.
    :param pointcloud: Objet PointCloud contenant une liste de points avec des attributs x, y, z, r, g, b.
    :param voxel_size: Taille du voxel en mètres.
    :return: Nouvel objet PointCloud filtré.
    """
    voxel_dict = collections.defaultdict(list)

    # Regrouper les points par voxel
    for point in pointcloud.points:
        voxel_idx = (
            int(point.x / voxel_size),
            int(point.y / voxel_size),
            int(point.z / voxel_size)
        )
        voxel_dict[voxel_idx].append(point)

    # Calculer le centroïde de chaque voxel et attribuer la couleur du point le plus proche
    filtered_points = []
    for points in voxel_dict.values():
        n = len(points)
        centroid_x = sum(p.x for p in points) / n
        centroid_y = sum(p.y for p in points) / n
        centroid_z = sum(p.z for p in points) / n

        # Trouver le point le plus proche du centroïde
        closest_point = min(
            points,
            key=lambda p: (p.x - centroid_x) ** 2 + (p.y - centroid_y) ** 2 + (p.z - centroid_z) ** 2
        )

        # Créer un nouveau point avec la position du centroïde et la couleur du point le plus proche
        new_point = type(closest_point)()
        new_point.x = centroid_x
        new_point.y = centroid_y
        new_point.z = centroid_z
        if hasattr(closest_point, 'r') and hasattr(closest_point, 'g') and hasattr(closest_point, 'b'):
            new_point.r = closest_point.r
            new_point.g = closest_point.g
            new_point.b = closest_point.b

        filtered_points.append(new_point)

    # Créer un nouveau PointCloud avec les points filtrés
    new_pointcloud = type(pointcloud)()
    new_pointcloud.points.extend(filtered_points)
    return new_pointcloud


# slam service rpc implementation des services RPC
class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    # constructor
    def __init__(self):
        self.point_clouds = []  # Stocker les points reçus
        self.point_clouds_with_poses = []
        self.slam_data = []
        self._send_buffer_points = []

        self._global_buffer_points = []  # <--- Buffer global
        self._global_buffer_poses = []
        self._global_buffer_indices = []

        self._sent_voxel_set = set()  # Stocke les voxels déjà envoyés
        
        # ========== NOUVEAU: Gestion des sessions ==========
        self.session_active = False
        self.session_start_time = None
        self.last_data_time = None

    def start_new_session(self):
        """Démarre une nouvelle session de streaming"""
        self.session_active = True
        self.session_start_time = time.time()
        self.last_data_time = time.time()
        # Réinitialiser les buffers pour une nouvelle session
        self._sent_voxel_set = set()
        logger.info("🎬 Nouvelle session de streaming démarrée")

    def update_session_activity(self):
        """Met à jour le timestamp de la dernière activité"""
        self.last_data_time = time.time()

    def is_session_expired(self):
        """Vérifie si la session a expiré (pas d'activité depuis 1 seconde)"""
        if not self.session_active or not self.last_data_time:
            return True
        return (time.time() - self.last_data_time) > 1.0

    def ConnectPoses(self, request_iterator, context):
        """Réception d'un stream de PoseList côté client."""
        logger.info("Réception d'un stream PoseList (ConnectPoses) du client...")

        for poselist in request_iterator:
            logger.debug(f"Reçu PoseList contenant {len(poselist.poses)} poses.")
            self._global_buffer_poses.append(poselist)
            self.update_session_activity()  # Marquer l'activité
        return Empty()

    def GetPoses(self, request, context):
        logger.info("Envoi d'un stream PoseList (GetPoses) au client...")
        
        # Démarrer une nouvelle session
        self.start_new_session()
        
        sent_count = 0
        try:
            while True:
                # Vérifier si la session a expiré
                if self.is_session_expired():
                    logger.info("📴 Session expirée - arrêt du streaming")
                    self.session_active = False
                    break
                
                # Envoie tous les nouveaux PoseList non envoyés
                while sent_count < len(self._global_buffer_poses):
                    poselist = self._global_buffer_poses[sent_count]
                    logger.info(f"Envoi PoseList {sent_count} contenant {len(poselist.poses)} poses")
                    yield poselist
                    sent_count += 1
                    self.update_session_activity()
                    
                time.sleep(0.1)
        except grpc.RpcError as e:
            logger.error(f"Erreur RPC dans GetPoses: {e.code()}, message : {e.details()}")
            self.session_active = False

    # RPC ConnectPointCloudWithPose service pour recevoir le PCD et la pose du client
    def ConnectSlamData(self, request_iterator, context):
        for data in request_iterator:
            total_points = 0
            pointcloudlist = data.pointcloudlist
            poselist = data.poselist
            indexlist = data.indexlist

            if DEBUG_CLIENT:
                logger.debug(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds")
                logger.debug(f"Reçu une liste de poses avec : {len(poselist.poses)} poses")
                logger.debug(f"Reçu une liste de kfs avec : {len(indexlist.index)} indices")

            # Calculer le nombre global de points
            for pointcloud in pointcloudlist.pointclouds:
                total_points += len(pointcloud.points)

            if DEBUG_CLIENT:
                logger.debug(f"Nombre total de points dans ces pointclouds : {total_points}")

            # Stocker le nuage de points et la pose
            self.slam_data.append((pointcloudlist, poselist, indexlist))
            self.update_session_activity()  # Marquer l'activité

        if DEBUG_CLIENT:
            logger.debug("--------- fin de réception --------")
        return Empty()

    def GetSlamData(self, request, context):
        try:
            BATCH_SIZE = 1000
            TIMEOUT_EMPTY = 2.0  # s
            VOXEL_SIZE_SEND = 0.01
            last_receive_time = time.time()
            buffer_points_to_send = []
            buffer_poses_to_send = []
            
            # ========== NOUVEAU: Flag de début de session ==========
            session_started = False

            def point_to_voxel(point, voxel_size):
                return (int(point.x / voxel_size), int(point.y / voxel_size), int(point.z / voxel_size))

            # Démarrer une nouvelle session
            self.start_new_session()

            while True:
                # ========== NOUVEAU: Envoyer le flag de session au début ==========
                if not session_started:
                    # Créer un message spécial pour indiquer le début de session
                    session_flag_pointcloud = pointcloud_pb2.PointCloud()
                    # Ajouter un point spécial avec des coordonnées impossibles pour signaler le début
                    session_point = pointcloud_pb2.Point()
                    session_point.x = -999999.0  # Coordonnée impossible
                    session_point.y = -999999.0
                    session_point.z = -999999.0
                    session_point.r = 255  # Rouge pour signaler
                    session_point.g = 0
                    session_point.b = 0
                    session_flag_pointcloud.points.append(session_point)
                    
                    session_flag_pointcloudlist = pointcloud_pb2.PointCloudList()
                    session_flag_pointcloudlist.pointclouds.append(session_flag_pointcloud)
                    
                    session_flag_poselist = pointcloud_pb2.PoseList()
                    session_flag_indexlist = pointcloud_pb2.Index()
                    
                    logger.info("🚀 Envoi du flag de début de session au client")
                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=session_flag_pointcloudlist,
                        poselist=session_flag_poselist,
                        indexlist=session_flag_indexlist
                    )
                    session_started = True

                # Vérifier si la session a expiré
                if self.is_session_expired():
                    logger.info("📴 Session expirée dans GetSlamData - arrêt du streaming")
                    break

                if self.slam_data:
                    for pointcloudlist, poselist, indexlist in self.slam_data:
                        pc_list = pointcloudlist.pointclouds
                        pose_list = poselist.poses if poselist and poselist.poses else []

                        # Associer chaque pointcloud à sa pose (par index)
                        for i, pc in enumerate(pc_list):
                            filtered_pc = apply_voxel_grid_filter(pc, voxel_size=VOXEL_SIZE_SEND)
                            points = filtered_pc.points
                            voxels = [point_to_voxel(p, VOXEL_SIZE_SEND) for p in points]
                            new_voxels = set(voxels) - self._sent_voxel_set
                            new_points = [p for p, v in zip(points, voxels) if v in new_voxels]
                            self._sent_voxel_set.update(new_voxels)

                            # Stocker les points filtrés et la pose associée
                            buffer_points_to_send.extend(new_points)
                            pose_for_this_pc = pose_list[i] if i < len(pose_list) else (pose_list[-1] if pose_list else None)
                            if pose_for_this_pc:
                                buffer_poses_to_send.extend([pose_for_this_pc] * len(new_points))
                    
                    self.slam_data = []
                    last_receive_time = time.time()
                    self.update_session_activity()  # Marquer l'activité

                # Envoi batch FIFO (points et poses synchronisés)
                while len(buffer_points_to_send) >= BATCH_SIZE:
                    batch_pointcloud = pointcloud_pb2.PointCloud()
                    batch_pointcloud.points.extend(buffer_points_to_send[:BATCH_SIZE])
                    batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                    batch_pointcloudlist.pointclouds.append(batch_pointcloud)

                    batch_poselist = pointcloud_pb2.PoseList()
                    batch_poselist.poses.extend(buffer_poses_to_send[:BATCH_SIZE])

                    batch_indexlist = pointcloud_pb2.Index()

                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=batch_pointcloudlist,
                        poselist=batch_poselist,
                        indexlist=batch_indexlist
                    )
                    buffer_points_to_send = buffer_points_to_send[BATCH_SIZE:]
                    buffer_poses_to_send = buffer_poses_to_send[BATCH_SIZE:]
                    self.update_session_activity()

                # Timeout
                if buffer_points_to_send and (time.time() - last_receive_time > TIMEOUT_EMPTY):
                    batch_pointcloud = pointcloud_pb2.PointCloud()
                    batch_pointcloud.points.extend(buffer_points_to_send)
                    batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                    batch_pointcloudlist.pointclouds.append(batch_pointcloud)

                    batch_poselist = pointcloud_pb2.PoseList()
                    batch_poselist.poses.extend(buffer_poses_to_send)

                    batch_indexlist = pointcloud_pb2.Index()

                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=batch_pointcloudlist,
                        poselist=batch_poselist,
                        indexlist=batch_indexlist
                    )
                    buffer_points_to_send = []
                    buffer_poses_to_send = []
                    self.update_session_activity()

                time.sleep(0.05)
                
        except grpc.RpcError as e:
            logger.error(f"Erreur RPC : {e.code()}, message : {e.details()}")
            self.session_active = False
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Erreur lors de l'envoi des points et poses.")

# definition du serveur
def serve():
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),  # 50 Mo
            ('grpc.max_send_message_length', 50 * 1024 * 1024),     # 50 Mo
        ]
    )

    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(SlamServiceServicer(), server)
    server.add_insecure_port('[::]:9090')  # Port pour le proxy
    server.add_insecure_port('[::]:50051')  # Port pour le client
    print("Le serveur est en cours d'exécution sur le port 9090 et 50051...")
    server.start()
    server.wait_for_termination()

# lancement app
if __name__ == '__main__':
    serve()
