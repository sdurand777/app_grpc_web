# server_2.py - Version mise à jour avec gestion des chunks
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

from utils import apply_voxel_grid_filter
from PersistentDataCache2 import PersistentDataCache
from SessionManager import SessionManager

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

class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    def __init__(self):
        # Gestionnaires
        self.session_manager = SessionManager()
        self.persistent_cache = PersistentDataCache(self.session_manager)
        
        # Buffers temporaires pour compatibilité
        self.slam_data = []
        self._global_buffer_poses = []
        
        # Configuration
        self.VOXEL_SIZE_SEND = 0.01
        
        # Suivi des clients et leurs états
        self._client_states = {}  # client_id -> last_sequence_number
        self._client_lock = threading.Lock()

    def GetSyncStatus(self, request, context):
        """Retourne l'état de synchronisation pour la session courante"""
        session_info = self.session_manager.get_session_info()
        sync_status = self.persistent_cache.get_sync_status(session_info['session_id'])
        
        return pointcloud_pb2.SyncStatus(
            session_id=sync_status['session_id'],
            total_chunks=sync_status['total_chunks'],
            latest_sequence_number=sync_status['latest_sequence_number'],
            available_chunk_ids=sync_status['available_chunk_ids']
        )
    
    def GetSpecificChunks(self, request, context):
        """Envoie des chunks spécifiques demandés par le client"""
        logger.info(f"Client demande {len(request.missing_chunk_ids)} chunks manquants")
        
        for chunk_id in request.missing_chunk_ids:
            slam_data = self.persistent_cache.get_chunk(chunk_id)
            if slam_data:
                # Convertir en DataChunk
                data_chunk = pointcloud_pb2.DataChunk(
                    chunk_id=slam_data.chunk_id,
                    sequence_number=slam_data.sequence_number,
                    session_id=request.session_id,
                    timestamp=int(time.time() * 1000)
                )
                
                # Copier les données
                if slam_data.pointcloudlist and slam_data.pointcloudlist.pointclouds:
                    data_chunk.pointcloud.CopyFrom(slam_data.pointcloudlist.pointclouds[0])
                
                if slam_data.poselist and slam_data.poselist.poses:
                    data_chunk.pose.CopyFrom(slam_data.poselist.poses[0])
                
                yield data_chunk
                
                logger.debug(f"Envoyé chunk manquant: {chunk_id}")
            else:
                logger.warning(f"Chunk demandé non trouvé: {chunk_id}")

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
        """Réception des données SLAM et création de chunks"""
        logger.info("Réception des slam data du client...")
        
        for data in request_iterator:
            # Créer des chunks à partir des données reçues
            chunk_ids = self.persistent_cache.add_slam_data(
                data.pointcloudlist, 
                data.poselist, 
                data.indexlist, 
                self.VOXEL_SIZE_SEND
            )
            
            if DEBUG_CLIENT and chunk_ids:
                logger.debug(f"Créé {len(chunk_ids)} nouveaux chunks")
        
        # Forcer la création d'un dernier chunk avec les données restantes
        final_chunk = self.persistent_cache.flush_pending()
        if final_chunk:
            logger.debug(f"Chunk final créé: {final_chunk}")
            
        if DEBUG_CLIENT:
            stats = self.persistent_cache.get_stats()
            logger.debug(f"Cache stats: {stats}")
            
        return Empty()


    def GetSlamData(self, request, context):
        """Envoi des données SLAM avec support pour la synchronisation intelligente"""
        client_id = str(uuid.uuid4())
        
        # Extraire les infos du cache client depuis custom-header-1
        metadata = dict(context.invocation_metadata())
        client_cache_info = {
            'lastSequence': -1,
            'sessionId': '',
            'chunkCount': 0
        }
        
        # Parser custom-header-1
        custom_data = metadata.get('custom-header-1', '')
        if custom_data:
            try:
                import json
                client_cache_info = json.loads(custom_data)
                logger.info(f"📊 Cache client pour {client_id}:")
                logger.info(f"  - lastSequence: {client_cache_info.get('lastSequence', -1)}")
                logger.info(f"  - sessionId: {client_cache_info.get('sessionId', '')}")
                logger.info(f"  - chunkCount: {client_cache_info.get('chunkCount', 0)}")
            except Exception as e:
                logger.error(f"Erreur parsing custom-header-1: {e}")
        
        client_last_sequence = client_cache_info.get('lastSequence', -1)
        client_session_id = client_cache_info.get('sessionId', '')
        
        # Ajouter le client
        client_count = self.session_manager.increment_clients()
        logger.debug(f"Nombre de clients connectés: {client_count}")
        
        try:
            session_info = self.session_manager.get_session_info()
            session_id = session_info['session_id']
            
            # Initialiser l'état du client
            with self._client_lock:
                self._client_states[client_id] = client_last_sequence
            
            # Décider quoi envoyer basé sur l'état du cache client
            if client_session_id != session_id or client_last_sequence == -1:
                # Nouvelle session ou premier connect - envoyer tout
                logger.info(f"❌ Cache invalide ou nouvelle session - envoi complet")
                logger.info(f"  - Client session: '{client_session_id}' vs Server session: '{session_id}'")
                historical_chunks = self.persistent_cache.get_all_chunks_for_session(session_id)
                logger.info(f"📤 Envoi de {len(historical_chunks)} chunks (historique complet)")
            else:
                # Session existante - envoyer seulement les nouveaux chunks
                logger.info(f"✅ Cache valide - envoi incrémental après sequence {client_last_sequence}")
                historical_chunks = self.persistent_cache.get_chunks_after_sequence(
                    client_last_sequence, session_id
                )
                logger.info(f"📤 Envoi de {len(historical_chunks)} nouveaux chunks seulement")
                
                # Stats d'optimisation
                total_chunks = self.persistent_cache.get_stats()['total_chunks']
                saved_chunks = total_chunks - len(historical_chunks)
                if saved_chunks > 0:
                    logger.info(f"🚀 Optimisation: {saved_chunks} chunks économisés grâce au cache client")
            
            # Envoyer les chunks nécessaires
            sent_count = 0
            for slam_data in historical_chunks:
                yield slam_data
                sent_count += 1
                
                # Mettre à jour le dernier numéro de séquence envoyé
                with self._client_lock:
                    self._client_states[client_id] = slam_data.sequence_number
                    
                # Log de progression pour les gros envois
                if sent_count % 100 == 0:
                    logger.debug(f"Progression: {sent_count}/{len(historical_chunks)} chunks envoyés")
            
            logger.info(f"✅ Envoi initial terminé: {sent_count} chunks")
            
            # 2. Mode temps réel - surveiller les nouveaux chunks
            logger.info("🎯 Passage en mode temps réel...")
            last_check_time = time.time()
            
            while True:
                current_time = time.time()
                
                # Vérifier les nouveaux chunks toutes les 100ms
                if current_time - last_check_time > 0.1:
                    with self._client_lock:
                        last_sequence = self._client_states[client_id]
                    
                    # Récupérer les nouveaux chunks
                    new_chunks = self.persistent_cache.get_chunks_after_sequence(
                        last_sequence, session_id
                    )
                    
                    # Envoyer les nouveaux chunks
                    for slam_data in new_chunks:
                        yield slam_data
                        
                        with self._client_lock:
                            self._client_states[client_id] = slam_data.sequence_number
                        
                        logger.debug(f"📦 Nouveau chunk temps réel: {slam_data.chunk_id}")
                    
                    last_check_time = current_time
                
                # Petite pause pour éviter la surcharge CPU
                time.sleep(0.05)
                
        except grpc.RpcError as e:
            logger.error(f"Client {client_id} déconnecté: {e.code()}")
        finally:
            # Nettoyer l'état du client
            with self._client_lock:
                if client_id in self._client_states:
                    del self._client_states[client_id]
            
            # Retirer le client
            client_count = self.session_manager.decrement_clients()
            logger.debug(f"Client déconnecté, clients restants: {client_count}")

    # def GetSlamData(self, request, context):
    #     """Envoi des données SLAM avec support pour la synchronisation"""
    #     client_id = str(uuid.uuid4())
    #     logger.info(f"Client {client_id} connecté pour GetSlamData")
    #     
    #     # Ajouter le client
    #     client_count = self.session_manager.increment_clients()
    #     logger.debug(f"Nombre de clients connectés: {client_count}")
    #     
    #     try:
    #         session_info = self.session_manager.get_session_info()
    #         session_id = session_info['session_id']
    #         
    #         # Initialiser l'état du client
    #         with self._client_lock:
    #             self._client_states[client_id] = -1
    #         
    #         # 1. Envoyer tous les chunks existants
    #         logger.info(f"Envoi des chunks historiques pour session {session_id}...")
    #         historical_chunks = self.persistent_cache.get_all_chunks_for_session(session_id)
    #         
    #         for slam_data in historical_chunks:
    #             yield slam_data
    #             
    #             # Mettre à jour le dernier numéro de séquence envoyé
    #             with self._client_lock:
    #                 self._client_states[client_id] = slam_data.sequence_number
    #         
    #         logger.info(f"Envoyé {len(historical_chunks)} chunks historiques")
    #         
    #         # 2. Mode temps réel - surveiller les nouveaux chunks
    #         logger.info("Passage en mode temps réel...")
    #         last_check_time = time.time()
    #         
    #         while True:
    #             current_time = time.time()
    #             
    #             # Vérifier les nouveaux chunks toutes les 100ms
    #             if current_time - last_check_time > 0.1:
    #                 with self._client_lock:
    #                     last_sequence = self._client_states[client_id]
    #                 
    #                 # Récupérer les nouveaux chunks
    #                 new_chunks = self.persistent_cache.get_chunks_after_sequence(
    #                     last_sequence, session_id
    #                 )
    #                 
    #                 # Envoyer les nouveaux chunks
    #                 for slam_data in new_chunks:
    #                     yield slam_data
    #                     
    #                     with self._client_lock:
    #                         self._client_states[client_id] = slam_data.sequence_number
    #                     
    #                     logger.debug(f"Envoyé nouveau chunk: {slam_data.chunk_id}")
    #                 
    #                 last_check_time = current_time
    #             
    #             # Petite pause pour éviter la surcharge CPU
    #             time.sleep(0.05)
    #             
    #     except grpc.RpcError as e:
    #         logger.error(f"Client {client_id} déconnecté: {e.code()}")
    #     finally:
    #         # Nettoyer l'état du client
    #         with self._client_lock:
    #             if client_id in self._client_states:
    #                 del self._client_states[client_id]
    #         
    #         # Retirer le client
    #         client_count = self.session_manager.decrement_clients()
    #         logger.debug(f"Client déconnecté, clients restants: {client_count}")

    def GetSessionInfo(self, request, context):

        # # AJOUTER CES LIGNES pour voir les metadata
        metadata = dict(context.invocation_metadata())
        logger.info(f"🧪 Metadata reçus dans GetSessionInfo: {metadata}")
        # 
        # # Chercher spécifiquement nos metadata custom
        # custom_headers = {k: v for k, v in metadata.items() if k.startswith('x-') and k not in ['x-user-agent', 'x-grpc-web', 'x-forwarded-proto', 'x-request-id']}
        # if custom_headers:
        #     logger.info(f"✅ METADATA CUSTOM TROUVÉS: {custom_headers}")
        # else:
        #     logger.info("❌ Aucun metadata custom trouvé")
        #
        #
        # metadata = dict(context.invocation_metadata())
        
        # Récupérer custom-header-1
        custom_data = metadata.get('custom-header-1', '')
        if custom_data:
            try:
                import json
                parsed_data = json.loads(custom_data)
                logger.info(f"✅ METADATA CUSTOM: {parsed_data}")
                logger.info(f"  - lastSequence: {parsed_data.get('lastSequence')}")
                logger.info(f"  - cacheSize: {parsed_data.get('cacheSize')}")
            except:
                pass

        """Endpoint pour obtenir les informations de session"""
        session_info = self.session_manager.get_session_info()
        stats = self.persistent_cache.get_stats()
        
        return pointcloud_pb2.SessionInfo(
            session_id=session_info['session_id'],
            start_time=session_info['start_time'],
            is_active=session_info['is_active'],
            clients_connected=session_info['clients_connected'],
            total_chunks=stats['total_chunks']
        )

    def SetSessionInfo(self, request, context):
        """Endpoint pour recevoir/mettre à jour les informations de session depuis un client"""
        try:
            self.session_manager.update_from_proto(request)
            
            if not request.is_active:
                logger.info("Session marquée comme inactive, nettoyage du cache...")
                self.persistent_cache.clear_cache()
            
        except Exception as e:
            logger.error(f"Erreur lors de la mise à jour de SessionInfo: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Erreur lors de la mise à jour: {str(e)}")
            
        return Empty()

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
