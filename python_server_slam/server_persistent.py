import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty
import threading
import time
import collections

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2
import slam_service_pb2_grpc

# Configuration des logs
import logging
LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
DEBUG_CLIENT = False
DEBUG_LOGS = True

logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG if DEBUG_LOGS else logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('[%(asctime)s][%(name)s][%(levelname)s] %(message)s')
handler.setFormatter(formatter)
logger.handlers = [handler]

def apply_voxel_grid_filter(pointcloud, voxel_size=0.01):
    """Filtre voxel grid existant"""
    voxel_dict = collections.defaultdict(list)

    for point in pointcloud.points:
        voxel_idx = (
            int(point.x / voxel_size),
            int(point.y / voxel_size),
            int(point.z / voxel_size)
        )
        voxel_dict[voxel_idx].append(point)

    filtered_points = []
    for points in voxel_dict.values():
        n = len(points)
        centroid_x = sum(p.x for p in points) / n
        centroid_y = sum(p.y for p in points) / n
        centroid_z = sum(p.z for p in points) / n

        closest_point = min(
            points,
            key=lambda p: (p.x - centroid_x) ** 2 + (p.y - centroid_y) ** 2 + (p.z - centroid_z) ** 2
        )

        new_point = type(closest_point)()
        new_point.x = centroid_x
        new_point.y = centroid_y
        new_point.z = centroid_z
        if hasattr(closest_point, 'r') and hasattr(closest_point, 'g') and hasattr(closest_point, 'b'):
            new_point.r = closest_point.r
            new_point.g = closest_point.g
            new_point.b = closest_point.b

        filtered_points.append(new_point)

    new_pointcloud = type(pointcloud)()
    new_pointcloud.points.extend(filtered_points)
    return new_pointcloud


class PersistentDataCache:
    """Cache persistant pour stocker toutes les données SLAM"""
    
    def __init__(self):
        self._lock = threading.RLock()
        self._all_points = []  # Tous les points reçus
        self._all_poses = []   # Toutes les poses reçues
        self._voxel_cache = {}  # Cache des voxels pour éviter les doublons
        self._sequence_number = 0
        
    def add_slam_data(self, pointcloudlist, poselist, indexlist, voxel_size=0.01):
        """Ajoute des données SLAM au cache persistant"""
        with self._lock:
            new_points = []
            new_poses = []
            
            pc_list = pointcloudlist.pointclouds
            pose_list = poselist.poses if poselist and poselist.poses else []
            
            for i, pc in enumerate(pc_list):
                # Filtrage voxel
                filtered_pc = apply_voxel_grid_filter(pc, voxel_size=voxel_size)
                points = filtered_pc.points
                
                # Vérification des voxels pour éviter les doublons
                for point in points:
                    voxel_key = (
                        int(point.x / voxel_size),
                        int(point.y / voxel_size),
                        int(point.z / voxel_size)
                    )
                    
                    if voxel_key not in self._voxel_cache:
                        self._voxel_cache[voxel_key] = True
                        new_points.append(point)
                        
                        # Pose associée
                        pose_for_this_pc = pose_list[i] if i < len(pose_list) else (pose_list[-1] if pose_list else None)
                        if pose_for_this_pc:
                            new_poses.append(pose_for_this_pc)
            
            # Ajouter au cache global
            self._all_points.extend(new_points)
            self._all_poses.extend(new_poses)
            self._sequence_number += 1
            
            logger.info(f"Cache mis à jour: {len(new_points)} nouveaux points, total: {len(self._all_points)}")
            return len(new_points)
    
    def get_all_data_batched(self, batch_size=1000):
        """Retourne toutes les données par batches"""
        with self._lock:
            total_points = len(self._all_points)
            total_poses = len(self._all_poses)
            
            logger.info(f"Envoi de toutes les données: {total_points} points, {total_poses} poses")
            
            for i in range(0, total_points, batch_size):
                end_idx = min(i + batch_size, total_points)
                
                # Batch de points
                batch_pointcloud = pointcloud_pb2.PointCloud()
                batch_pointcloud.points.extend(self._all_points[i:end_idx])
                batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                batch_pointcloudlist.pointclouds.append(batch_pointcloud)
                
                # Batch de poses correspondant
                batch_poselist = pointcloud_pb2.PoseList()
                if i < total_poses:
                    pose_end_idx = min(end_idx, total_poses)
                    batch_poselist.poses.extend(self._all_poses[i:pose_end_idx])
                
                batch_indexlist = pointcloud_pb2.Index()
                
                yield pointcloud_pb2.SlamData(
                    pointcloudlist=batch_pointcloudlist,
                    poselist=batch_poselist,
                    indexlist=batch_indexlist
                )
    
    def get_stats(self):
        """Retourne les statistiques du cache"""
        with self._lock:
            return {
                'total_points': len(self._all_points),
                'total_poses': len(self._all_poses),
                'unique_voxels': len(self._voxel_cache),
                'sequence_number': self._sequence_number
            }


class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    def __init__(self):
        # Cache persistant partagé
        self.persistent_cache = PersistentDataCache()
        
        # Buffers temporaires pour les nouveaux clients
        self.slam_data = []
        self._global_buffer_poses = []
        
        # Configuration
        self.BATCH_SIZE = 1000
        self.VOXEL_SIZE_SEND = 0.01
        self.TIMEOUT_EMPTY = 2.0

    def ConnectPoses(self, request_iterator, context):
        """Réception d'un stream de PoseList côté client."""
        logger.info("Réception d'un stream PoseList (ConnectPoses) du client...")
        
        for poselist in request_iterator:
            logger.debug(f"Reçu PoseList contenant {len(poselist.poses)} poses.")
            self._global_buffer_poses.append(poselist)
        return Empty()

    def GetPoses(self, request, context):
        """Envoi d'un stream de PoseList vers le client."""
        logger.info("Envoi d'un stream PoseList (GetPoses) au client...")
        sent_count = 0
        try:
            while True:
                while sent_count < len(self._global_buffer_poses):
                    poselist = self._global_buffer_poses[sent_count]
                    logger.debug(f"Envoi PoseList {sent_count} contenant {len(poselist.poses)} poses")
                    yield poselist
                    sent_count += 1
                time.sleep(0.1)
        except grpc.RpcError as e:
            logger.error(f"Erreur RPC dans GetPoses: {e.code()}, message : {e.details()}")

    def ConnectSlamData(self, request_iterator, context):
        """Réception des données SLAM du client avec stockage persistant"""
        logger.info("Réception des slam data du client...")
        
        for data in request_iterator:
            pointcloudlist = data.pointcloudlist
            poselist = data.poselist
            indexlist = data.indexlist
            
            if DEBUG_CLIENT:
                total_points = sum(len(pc.points) for pc in pointcloudlist.pointclouds)
                logger.debug(f"Reçu {len(pointcloudlist.pointclouds)} pointclouds, {total_points} points")
            
            # Ajouter au cache persistant
            new_points_count = self.persistent_cache.add_slam_data(
                pointcloudlist, poselist, indexlist, self.VOXEL_SIZE_SEND
            )
            
            # Aussi ajouter aux buffers temporaires pour les clients connectés
            self.slam_data.append((pointcloudlist, poselist, indexlist))
        
        if DEBUG_CLIENT:
            stats = self.persistent_cache.get_stats()
            logger.debug(f"Cache stats: {stats}")
            
        return Empty()

    def GetSlamData(self, request, context):
        """Envoi des données SLAM avec support pour nouveaux clients"""
        logger.info("Client connecté pour GetSlamData")
        
        try:
            # 1. D'abord envoyer toutes les données historiques du cache
            logger.info("Envoi des données historiques du cache...")
            for slam_data_batch in self.persistent_cache.get_all_data_batched(self.BATCH_SIZE):
                yield slam_data_batch
            
            logger.info("Données historiques envoyées, passage en mode temps réel...")
            
            # 2. Ensuite, continuer avec les nouvelles données en temps réel
            buffer_points_to_send = []
            buffer_poses_to_send = []
            last_receive_time = time.time()
            sent_voxel_set = set()  # Voxels déjà envoyés pour ce client
            
            def point_to_voxel(point, voxel_size):
                return (int(point.x / voxel_size), int(point.y / voxel_size), int(point.z / voxel_size))
            
            while True:
                # Traitement des nouvelles données
                if self.slam_data:
                    for pointcloudlist, poselist, indexlist in self.slam_data:
                        pc_list = pointcloudlist.pointclouds
                        pose_list = poselist.poses if poselist and poselist.poses else []

                        for i, pc in enumerate(pc_list):
                            filtered_pc = apply_voxel_grid_filter(pc, voxel_size=self.VOXEL_SIZE_SEND)
                            points = filtered_pc.points
                            voxels = [point_to_voxel(p, self.VOXEL_SIZE_SEND) for p in points]
                            new_voxels = set(voxels) - sent_voxel_set
                            new_points = [p for p, v in zip(points, voxels) if v in new_voxels]
                            sent_voxel_set.update(new_voxels)

                            buffer_points_to_send.extend(new_points)
                            pose_for_this_pc = pose_list[i] if i < len(pose_list) else (pose_list[-1] if pose_list else None)
                            if pose_for_this_pc:
                                buffer_poses_to_send.extend([pose_for_this_pc] * len(new_points))
                    
                    self.slam_data = []
                    last_receive_time = time.time()

                # Envoi des batches temps réel
                while len(buffer_points_to_send) >= self.BATCH_SIZE:
                    batch_pointcloud = pointcloud_pb2.PointCloud()
                    batch_pointcloud.points.extend(buffer_points_to_send[:self.BATCH_SIZE])
                    batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                    batch_pointcloudlist.pointclouds.append(batch_pointcloud)

                    batch_poselist = pointcloud_pb2.PoseList()
                    batch_poselist.poses.extend(buffer_poses_to_send[:self.BATCH_SIZE])

                    batch_indexlist = pointcloud_pb2.Index()

                    yield pointcloud_pb2.SlamData(
                        pointcloudlist=batch_pointcloudlist,
                        poselist=batch_poselist,
                        indexlist=batch_indexlist
                    )
                    buffer_points_to_send = buffer_points_to_send[self.BATCH_SIZE:]
                    buffer_poses_to_send = buffer_poses_to_send[self.BATCH_SIZE:]

                # Timeout pour envoyer le dernier batch
                if buffer_points_to_send and (time.time() - last_receive_time > self.TIMEOUT_EMPTY):
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

                time.sleep(0.05)
                
        except grpc.RpcError as e:
            logger.error(f"Client déconnecté: {e.code()}")


def serve():
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),
            ('grpc.max_send_message_length', 50 * 1024 * 1024),
        ]
    )

    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(SlamServiceServicer(), server)
    server.add_insecure_port('[::]:9090')
    server.add_insecure_port('[::]:50051')
    print("Le serveur est en cours d'exécution sur le port 9090 et 50051...")
    server.start()
    server.wait_for_termination()


if __name__ == '__main__':
    serve()
