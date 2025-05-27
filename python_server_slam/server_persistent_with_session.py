import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty
import threading
import time
import collections
import uuid
from datetime import datetime

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2
import slam_service_pb2_grpc

# import filter voxels
from utils import apply_voxel_grid_filter

# import data cache
from PersistentDataCache import PersistentDataCache

# import session manager
from SessionManager import SessionManager


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



# server grpc to define the grpc services
class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    def __init__(self):
        # Gestionnaire de session
        self.session_manager = SessionManager()
        
        # Cache persistant avec gestion de session
        self.persistent_cache = PersistentDataCache(self.session_manager)
        
        # Buffers temporaires
        self.slam_data = []
        self._global_buffer_poses = []
        
        # Configuration
        self.BATCH_SIZE = 1000
        self.VOXEL_SIZE_SEND = 0.01
        self.TIMEOUT_EMPTY = 2.0
        
        # Indicateur de nouvelles données
        self._has_new_data = False
        self._new_data_lock = threading.Lock()

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
        
        # Marquer qu'on reçoit de nouvelles données
        with self._new_data_lock:
            self._has_new_data = True
        
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
            
            # Aussi ajouter aux buffers temporaires
            self.slam_data.append((pointcloudlist, poselist, indexlist))
        
        if DEBUG_CLIENT:
            stats = self.persistent_cache.get_stats()
            logger.debug(f"Cache stats: {stats}")
            
        return Empty()



    def GetSessionInfo(self, request, context):
        """Endpoint pour obtenir les informations de session"""
        session_info = self.session_manager.get_session_info()
        
        # Utilisez pointcloud_pb2 au lieu de slam_service_pb2
        return pointcloud_pb2.SessionInfo(
            session_id=session_info['session_id'],
            start_time=session_info['start_time'],
            is_active=session_info['is_active'],
            clients_connected=session_info['clients_connected']
        )

    def SetSessionInfo(self, request, context):
        """Endpoint pour recevoir/mettre à jour les informations de session depuis un client"""
        logger.info(f"Réception de SessionInfo depuis un client:")
        logger.info(f"  - Session ID: {request.session_id}")
        logger.info(f"  - Start Time: {request.start_time}")
        logger.info(f"  - Is Active: {request.is_active}")
        logger.info(f"  - Clients Connected: {request.clients_connected}")
        
        # Ici vous pouvez ajouter la logique pour traiter les informations reçues
        # Par exemple, mettre à jour le session_manager ou effectuer des actions spécifiques
        
        # Exemple de traitement (à adapter selon vos besoins):
        try:
            # Si vous voulez mettre à jour certaines informations dans le session_manager
            self.session_manager.update_session_info(request.session_id, request.start_time, request.is_active)
            
            # Pour l'instant, on log juste les informations reçues
            logger.info("SessionInfo traité avec succès")
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement de SessionInfo: {e}")
            # Optionnel: lever une exception gRPC si nécessaire
            # context.set_code(grpc.StatusCode.INTERNAL)
            # context.set_details(f"Erreur lors du traitement: {str(e)}")
            
        return Empty()

    def GetSlamData(self, request, context):
        """Envoi des données SLAM avec support pour nouveaux clients"""
        logger.info("Client connecté pour GetSlamData")
        
        # Ajouter le client
        self.session_manager.add_client()
        
        try:
            # Vérifier s'il y a de nouvelles données (indique une nouvelle session)
            with self._new_data_lock:
                if self._has_new_data:
                    # Nettoyer le cache pour la nouvelle session
                    self.persistent_cache.clear_cache()
                    self._has_new_data = False
            
            # 1. Envoyer toutes les données historiques
            logger.info("Envoi des données historiques du cache...")
            for slam_data_batch in self.persistent_cache.get_all_data_batched(
                self.BATCH_SIZE, include_metadata=True
            ):
                yield slam_data_batch
            
            logger.info("Données historiques envoyées, passage en mode temps réel...")
            
            # 2. Mode temps réel
            buffer_points_to_send = []
            buffer_poses_to_send = []
            last_receive_time = time.time()
            sent_voxel_set = set()
            
            def point_to_voxel(point, voxel_size):
                return (int(point.x / voxel_size), int(point.y / voxel_size), int(point.z / voxel_size))
            
            while True:
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

                # Envoi des batches
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

                # Timeout pour le dernier batch
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
        finally:
            # Retirer le client
            self.session_manager.remove_client()


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
