import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_exp')
sys.path.append(gen_python_path)

import slam_service_pb2
import slam_service_pb2_grpc
import pointcloud_pb2
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

    # RPC ConnectPointCloudWithPose service pour recevoir le PCD et la pose du client
    def ConnectSlamData(self, request_iterator, context):
        print("Réception des slam data du client...")

        for data in request_iterator:

            total_points = 0  # Variable pour compter les points globaux

            pointcloudlist = data.pointcloudlist
            poselist = data.poselist
            indexlist = data.indexlist

            #print(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds et {len(pointcloudlist.pointclouds.points)} points.")


            if DEBUG_CLIENT:
                logger.debug(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds")
                logger.debug(f"Reçu une liste de poses avec : {len(poselist.poses)} poses")
                logger.debug(f"Reçu une liste de kfs avec : {len(indexlist.index)} indices")
                logger.debug(f"Liste des indices : {list(indexlist.index)}")



            # print(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds")
            # print(f"Reçu une liste de poses avec : {len(poselist.poses)} poses")
            # print(f"Reçu une liste de kfs avec : {len(indexlist.index)} indices")
            # # Afficher la liste d'indices
            # print(f"Liste des indices : {list(indexlist.index)}")

            # Calculer le nombre global de points
            for pointcloud in pointcloudlist.pointclouds:
                total_points += len(pointcloud.points)  # Ajouter le nombre de points dans chaque PointCloud

            if DEBUG_CLIENT:
                logger.debug(f"Nombre total de points dans ces pointclouds : {total_points}")

            #print(f"Nombre total de points dans ces pointclouds : {total_points}")

            # Stocker le nuage de points et la pose
            self.slam_data.append((pointcloudlist, poselist, indexlist))

        
        if DEBUG_CLIENT:
            logger.debug("--------- fin de réception --------")

        #print("--------- fin de réception --------")
        return Empty()  # Réponse vide pour confirmer



    # def GetSlamData(self, request, context):
    #     logger.info("Envoi des slam data au client ...")
    #     try:
    #         BATCH_SIZE = 100000
    #         TIMEOUT_EMPTY = 2.0  # Temps d'attente (s) sans nouveau pointcloud avant d'envoyer le dernier batch
    #         self._send_buffer_points = getattr(self, "_send_buffer_points", [])
    #         self._send_buffer_poses = getattr(self, "_send_buffer_poses", [])
    #         self._send_buffer_indices = getattr(self, "_send_buffer_indices", [])
    #
    #         last_receive_time = time.time()
    #
    #         while True:
    #             data_received = False
    #
    #             if self.slam_data:
    #                 sent_batches = 0
    #                 total_sent_points = 0
    #
    #                 for pointcloudlist, poselist, indexlist in self.slam_data:
    #
    #                     filtered_pointclouds = [
    #                         apply_voxel_grid_filter(pc, voxel_size=0.02) for pc in pointcloudlist.pointclouds
    #                     ]
    #                     latest_pose = poselist.poses[-1] if poselist.poses else None
    #                     latest_index = indexlist.index[-1] if indexlist.index else None
    #
    #                     # On insère tous les points dans le buffer SANS filtrer
    #                     #for pc in pointcloudlist.pointclouds:
    #                     for pc in filtered_pointclouds:
    #
    #                         for point in pc.points:
    #                             self._send_buffer_points.append(point)
    #                             if latest_pose:
    #                                 self._send_buffer_poses.append(latest_pose)
    #                             if latest_index is not None:
    #                                 self._send_buffer_indices.append(latest_index)
    #
    #
    #                         # Dès qu'on atteint le seuil, on envoie (filtré)
    #                         while len(self._send_buffer_points) >= BATCH_SIZE:
    #                             # ----- FILTRAGE SUR LE BATCH COMPLET -----
    #                             # Création d'un PointCloud temporaire pour appliquer le filtre
    #                             batch_pointcloud = pointcloud_pb2.PointCloud()
    #                             batch_pointcloud.points.extend(self._send_buffer_points[:BATCH_SIZE])
    #
    #                             # Filtrage du batch complet (on suppose que apply_voxel_grid_filter attend un PointCloud)
    #                             batch_pointcloud_filtered = apply_voxel_grid_filter(batch_pointcloud, voxel_size=0.02)
    #                             # Si le filtre retourne un PointCloudList, adapte en conséquence
    #                             # (ex: batch_pointcloud_filtered = apply_voxel_grid_filter([batch_pointcloud], voxel_size=0.01)[0])
    #
    #                             # Création des structures à envoyer
    #                             batch_pointcloudlist = pointcloud_pb2.PointCloudList()
    #                             batch_pointcloudlist.pointclouds.append(batch_pointcloud_filtered)
    #
    #                             batch_poselist = pointcloud_pb2.PoseList()
    #                             if self._send_buffer_poses:
    #                                 batch_poselist.poses.append(self._send_buffer_poses[0])
    #
    #                             batch_indexlist = pointcloud_pb2.Index()
    #                             if self._send_buffer_indices:
    #                                 batch_indexlist.index.append(self._send_buffer_indices[0])
    #
    #                             if DEBUG_LOGS:
    #                                 logger.debug(f"Envoi d'un batch de {BATCH_SIZE} points (filtré) au client.")
    #
    #                             yield pointcloud_pb2.SlamData(
    #                                 pointcloudlist=batch_pointcloudlist,
    #                                 poselist=batch_poselist,
    #                                 indexlist=batch_indexlist
    #                             )
    #                             sent_batches += 1
    #                             total_sent_points += BATCH_SIZE
    #
    #                             # On retire les points déjà envoyés
    #                             self._send_buffer_points = self._send_buffer_points[BATCH_SIZE:]
    #                             self._send_buffer_poses = self._send_buffer_poses[BATCH_SIZE:]
    #                             self._send_buffer_indices = self._send_buffer_indices[BATCH_SIZE:]
    #
    #                             last_receive_time = time.time()
    #                             data_received = True
    #
    #                 self.slam_data = []
    #                 if sent_batches > 0:
    #                     logger.info(f"Total envoyé : {total_sent_points} points en {sent_batches} batchs.")
    #             else:
    #                 # Si on n'a pas reçu de nouvelle donnée depuis TIMEOUT_EMPTY et qu'il reste un buffer incomplet, alors on l'envoie !
    #                 if self._send_buffer_points and (time.time() - last_receive_time > TIMEOUT_EMPTY):
    #                     last_count = len(self._send_buffer_points)
    #                     batch_pointcloud = pointcloud_pb2.PointCloud()
    #                     batch_pointcloud.points.extend(self._send_buffer_points)
    #
    #                     batch_pointcloudlist = pointcloud_pb2.PointCloudList()
    #                     batch_pointcloudlist.pointclouds.append(batch_pointcloud)
    #
    #                     batch_poselist = pointcloud_pb2.PoseList()
    #                     if self._send_buffer_poses:
    #                         batch_poselist.poses.append(self._send_buffer_poses[0])
    #
    #                     batch_indexlist = pointcloud_pb2.Index()
    #                     if self._send_buffer_indices:
    #                         batch_indexlist.index.append(self._send_buffer_indices[0])
    #
    #                     if DEBUG_LOGS:
    #                         logger.debug(f"Envoi du dernier batch de {last_count} points au client (timeout ou fin de stream).")
    #                     yield pointcloud_pb2.SlamData(
    #                         pointcloudlist=batch_pointcloudlist,
    #                         poselist=batch_poselist,
    #                         indexlist=batch_indexlist
    #                     )
    #
    #                     last_receive_time = time.time()
    #                     data_received = True
    #
    #                     logger.info(f"Total envoyé : {last_count} points en 1 batch (incomplet).")
    #                     self._send_buffer_points = []
    #                     self._send_buffer_poses = []
    #                     self._send_buffer_indices = []
    #                 # Sleep plus court pour la réactivité
    #                 time.sleep(0.05)
    #     except grpc.RpcError as e:
    #         logger.error(f"Erreur RPC : {e.code()}, message : {e.details()}")
    #         context.set_code(grpc.StatusCode.INTERNAL)
    #         context.set_details("Erreur lors de l'envoi des points et poses.")



    # def GetSlamData(self, request, context):
    #     logger.info("Envoi des slam data au client ...")
    #     try:
    #         BATCH_SIZE = 1000
    #         TIMEOUT_EMPTY = 2.0  # s
    #         VOXEL_SIZE_SEND = 0.01
    #         last_receive_time = time.time()
    #         buffer_points_to_send = []
    #         buffer_poses_to_send = []
    #
    #         def point_to_voxel(point, voxel_size):
    #             return (int(point.x / voxel_size), int(point.y / voxel_size), int(point.z / voxel_size))
    #
    #         while True:
    #             if self.slam_data:
    #                 for pointcloudlist, poselist, indexlist in self.slam_data:
    #                     for pc in pointcloudlist.pointclouds:
    #                         filtered_pc = apply_voxel_grid_filter(pc, voxel_size=VOXEL_SIZE_SEND)
    #                         points = filtered_pc.points
    #                         # Map points to voxels
    #                         voxels = [point_to_voxel(p, VOXEL_SIZE_SEND) for p in points]
    #                         # Utiliser set pour batch filter
    #                         new_voxels = set(voxels) - self._sent_voxel_set
    #                         # Garde uniquement les points avec voxel nouveau
    #                         new_points = [p for p, v in zip(points, voxels) if v in new_voxels]
    #                         # Mets à jour le set historique avec les voxels envoyés
    #                         self._sent_voxel_set.update(new_voxels)
    #                         buffer_points_to_send.extend(new_points)
    #                 self.slam_data = []
    #                 last_receive_time = time.time()
    #
    #             # Envoi batch FIFO
    #             while len(buffer_points_to_send) >= BATCH_SIZE:
    #                 batch_pointcloud = pointcloud_pb2.PointCloud()
    #                 batch_pointcloud.points.extend(buffer_points_to_send[:BATCH_SIZE])
    #                 batch_pointcloudlist = pointcloud_pb2.PointCloudList()
    #                 batch_pointcloudlist.pointclouds.append(batch_pointcloud)
    #                 batch_poselist = pointcloud_pb2.PoseList()
    #                 batch_indexlist = pointcloud_pb2.Index()
    #                 # Ajoute la gestion pose/index si besoin ici
    #
    #                 logger.debug(f"Envoi d'un batch optimisé de {BATCH_SIZE} points nouveaux au client.")
    #                 yield pointcloud_pb2.SlamData(
    #                     pointcloudlist=batch_pointcloudlist,
    #                     poselist=batch_poselist,
    #                     indexlist=batch_indexlist
    #                 )
    #                 buffer_points_to_send = buffer_points_to_send[BATCH_SIZE:]
    #
    #             # Timeout
    #             if buffer_points_to_send and (time.time() - last_receive_time > TIMEOUT_EMPTY):
    #                 batch_pointcloud = pointcloud_pb2.PointCloud()
    #                 batch_pointcloud.points.extend(buffer_points_to_send)
    #                 batch_pointcloudlist = pointcloud_pb2.PointCloudList()
    #                 batch_pointcloudlist.pointclouds.append(batch_pointcloud)
    #                 batch_poselist = pointcloud_pb2.PoseList()
    #                 batch_indexlist = pointcloud_pb2.Index()
    #                 # Ajoute la gestion pose/index si besoin ici
    #
    #                 logger.debug(f"Envoi du dernier batch optimisé de {len(buffer_points_to_send)} points (timeout).")
    #                 yield pointcloud_pb2.SlamData(
    #                     pointcloudlist=batch_pointcloudlist,
    #                     poselist=batch_poselist,
    #                     indexlist=batch_indexlist
    #                 )
    #                 buffer_points_to_send = []
    #
    #             time.sleep(0.05)
    #     except grpc.RpcError as e:
    #         logger.error(f"Erreur RPC : {e.code()}, message : {e.details()}")
    #         context.set_code(grpc.StatusCode.INTERNAL)
    #         context.set_details("Erreur lors de l'envoi des points et poses.")



    def GetSlamData(self, request, context):
        logger.info("Envoi des slam data au client ...")
        try:
            BATCH_SIZE = 1000
            TIMEOUT_EMPTY = 2.0  # s
            VOXEL_SIZE_SEND = 0.01
            last_receive_time = time.time()
            buffer_points_to_send = []
            buffer_poses_to_send = []

            def point_to_voxel(point, voxel_size):
                return (int(point.x / voxel_size), int(point.y / voxel_size), int(point.z / voxel_size))

            while True:
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

                            # Stocker les points filtrés et la pose associée (autant de fois qu'il y a de points)
                            buffer_points_to_send.extend(new_points)
                            # Prend la pose d'indice i si elle existe, sinon la dernière pose dispo, sinon rien
                            pose_for_this_pc = pose_list[i] if i < len(pose_list) else (pose_list[-1] if pose_list else None)
                            if pose_for_this_pc:
                                buffer_poses_to_send.extend([pose_for_this_pc] * len(new_points))
                    self.slam_data = []
                    last_receive_time = time.time()

                # Envoi batch FIFO (points et poses synchronisés)
                while len(buffer_points_to_send) >= BATCH_SIZE:
                    batch_pointcloud = pointcloud_pb2.PointCloud()
                    batch_pointcloud.points.extend(buffer_points_to_send[:BATCH_SIZE])
                    batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                    batch_pointcloudlist.pointclouds.append(batch_pointcloud)

                    # Création du batch PoseList synchronisé
                    batch_poselist = pointcloud_pb2.PoseList()
                    # On prend les poses associées aux points du batch (même indexation)
                    batch_poselist.poses.extend(buffer_poses_to_send[:BATCH_SIZE])

                    batch_indexlist = pointcloud_pb2.Index()
                    # Optionnel : index, à gérer selon ton protocole

                    logger.debug(f"batch_poselist {batch_poselist.poses}")

                    logger.debug(f"Envoi d'un batch optimisé de {BATCH_SIZE} points nouveaux au client avec poses associées.")
                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=batch_pointcloudlist,
                        poselist=batch_poselist,
                        indexlist=batch_indexlist
                    )
                    buffer_points_to_send = buffer_points_to_send[BATCH_SIZE:]
                    buffer_poses_to_send = buffer_poses_to_send[BATCH_SIZE:]

                # Timeout
                if buffer_points_to_send and (time.time() - last_receive_time > TIMEOUT_EMPTY):
                    batch_pointcloud = pointcloud_pb2.PointCloud()
                    batch_pointcloud.points.extend(buffer_points_to_send)
                    batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                    batch_pointcloudlist.pointclouds.append(batch_pointcloud)

                    batch_poselist = pointcloud_pb2.PoseList()
                    batch_poselist.poses.extend(buffer_poses_to_send)

                    batch_indexlist = pointcloud_pb2.Index()
                    # Optionnel : index, à gérer selon ton protocole

                    logger.debug(f"Envoi du dernier batch optimisé de {len(buffer_points_to_send)} points (timeout) avec poses associées.")
                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=batch_pointcloudlist,
                        poselist=batch_poselist,
                        indexlist=batch_indexlist
                    )
                    buffer_points_to_send = []
                    buffer_poses_to_send = []

                time.sleep(0.05)
        except grpc.RpcError as e:
            logger.error(f"Erreur RPC : {e.code()}, message : {e.details()}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Erreur lors de l'envoi des points et poses.")



# definition du serveur
def serve():
    # creation instance grpc serveur pool de 10 threads avec chaque thread qui peut gerer une requete RPC distincte
    #server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),  # 50 Mo
            ('grpc.max_send_message_length', 50 * 1024 * 1024),     # 50 Mo
        ]
    )

    # ajoute implementation SlamService au serveur definie ci dessus
    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(SlamServiceServicer(), server)
    # ajoute port de connexion au serveur
    server.add_insecure_port('[::]:9090')  # Port pour le proxy
    server.add_insecure_port('[::]:50051')  # Port pour le client
    print("Le serveur est en cours d'exécution sur le port 9090 et 50051...")
    # lance le serveur
    server.start()
    # attend une commande pour stopper le serveur
    server.wait_for_termination()

# lancement app
if __name__ == '__main__':
    serve()
