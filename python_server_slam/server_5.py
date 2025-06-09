# server_3.py - Version mise à jour avec gestion des chunks et timeout
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

# PersistentCache pour garder les donnees en cache serveur pour un nouveu client
from PersistentDataCache2 import PersistentDataCache
# session manager pour garder les infos sur la session en cours
from SessionManager import SessionManager
# Stream Monitor pour monitorer le stream pour gerer la fin du SLAM
from StreamMonitor import StreamMonitor

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
        
        # Moniteur de stream basé sur l'état de la session
        self.stream_monitor = StreamMonitor(timeout_seconds=5)  # Timeout plus long
        self.stream_monitor.set_session_manager(self.session_manager)  # NOUVEAU: Injection
        self.stream_monitor.add_timeout_callback(self._handle_stream_timeout)
        self.stream_monitor.start()

    def _handle_stream_timeout(self):
        """Gère le timeout du stream"""
        logger.warning("🏁 Fin du stream détectée - nettoyage en cours...")
        
        # Sauvegarder les stats finales
        session_info = self.session_manager.get_session_info()
        stats = self.persistent_cache.get_stats()
        
        # Calculer la durée de session de manière sûre
        session_duration = 0
        if session_info.get('start_time'):
            try:
                # Si start_time est une string ISO, la convertir
                if isinstance(session_info['start_time'], str):
                    from datetime import datetime
                    start_dt = datetime.fromisoformat(session_info['start_time'])
                    start_timestamp = start_dt.timestamp()
                else:
                    start_timestamp = session_info['start_time']
                
                session_duration = time.time() - start_timestamp
            except Exception as e:
                logger.warning(f"Erreur calcul durée session: {e}")
                session_duration = 0
        
        logger.info(f"📊 Statistiques finales de la session {session_info.get('session_id', 'N/A')}:")
        logger.info(f"  - Durée: {session_duration:.1f}s")
        logger.info(f"  - Total chunks: {stats['total_chunks']}")
        logger.info(f"  - Total points: {stats['total_points']}")
        logger.info(f"  - Taille cache: {stats.get('cache_size_mb', 0):.2f} MB")
        
        # Forcer la création d'un dernier chunk si nécessaire
        try:
            final_chunk = self.persistent_cache.flush_pending()
            if final_chunk:
                logger.info(f"💾 Chunk final créé: {final_chunk}")
        except Exception as e:
            logger.error(f"Erreur lors de la création du chunk final: {e}")
        
        # Réinitialiser la session
        logger.info("🔄 Réinitialisation de la session...")
        self.session_manager.clear_session()
        
        # Nettoyer le cache
        logger.info("🗑️ Nettoyage du cache...")
        self.persistent_cache.clear_cache()
        
        # Réinitialiser les buffers
        self.slam_data = []
        self._global_buffer_poses = []
        
        # Nettoyer les états clients
        with self._client_lock:
            self._client_states.clear()
        
        logger.info("✅ Nettoyage terminé - prêt pour une nouvelle session")

        # verification session vide
        session_info = self.session_manager.get_session_info()

        logger.info(f"Session actuelle : {session_info}")



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
        
        # Mettre à jour l'activité
        self.stream_monitor.update_activity()
        
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
            # Mettre à jour l'activité
            self.stream_monitor.update_activity()
            
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
        
        # Signaler l'activité au monitor (nouvelles keyframes reçues)
        self.stream_monitor.update_activity()
        
        # Mettre à jour la session comme active
        current_session = self.session_manager.get_session_info()
        if not current_session.get('is_active'):
            # Créer une nouvelle session active si nécessaire
            from slam_service_pb2 import SessionInfo as ProtoSessionInfo
            session_update = ProtoSessionInfo(
                session_id=current_session.get('session_id', f'SLAM-{int(time.time())}'),
                start_time=current_session.get('start_time', datetime.now().isoformat()),
                is_active=True,
                clients_connected=current_session.get('clients_connected', 0)
            )
            self.session_manager.update_from_proto(session_update)
        
        data_count = 0
        try:
            for data in request_iterator:
                # Créer des chunks à partir des données reçues
                chunk_ids = self.persistent_cache.add_slam_data(
                    data.pointcloudlist, 
                    data.poselist, 
                    data.indexlist, 
                    self.VOXEL_SIZE_SEND
                )
                
                data_count += 1
                
                if DEBUG_CLIENT and chunk_ids:
                    logger.debug(f"Créé {len(chunk_ids)} nouveaux chunks")
            
            # Forcer la création d'un dernier chunk avec les données restantes
            final_chunk = self.persistent_cache.flush_pending()
            if final_chunk:
                logger.debug(f"Chunk final créé: {final_chunk}")
                
            if DEBUG_CLIENT:
                stats = self.persistent_cache.get_stats()
                logger.debug(f"Cache stats: {stats}")
                
        except grpc.RpcError as e:
            logger.error(f"Erreur dans ConnectSlamData: {e}")
        finally:
            # Marquer la fin du stream
            logger.info(f"📡 Stream ConnectSlamData terminé ({data_count} paquets dans cette connexion)")
            
        return Empty()


    def GetSlamData(self, request, context):
        """Envoi des données SLAM avec support pour la synchronisation intelligente"""
        client_id = str(uuid.uuid4())
        
        # Mettre à jour l'activité
        self.stream_monitor.update_activity()
        
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
                # logger.info(f"📊 Cache client pour {client_id}:")
                # logger.info(f"  - lastSequence: {client_cache_info.get('lastSequence', -1)}")
                # logger.info(f"  - sessionId: {client_cache_info.get('sessionId', '')}")
                # logger.info(f"  - chunkCount: {client_cache_info.get('chunkCount', 0)}")
            except Exception as e:
                logger.error(f"Erreur parsing custom-header-1: {e}")
        
        client_last_sequence = client_cache_info.get('lastSequence', -1)
        client_session_id = client_cache_info.get('sessionId', '')
        

        # Vérification simple basée uniquement sur is_active
        session_info = self.session_manager.get_session_info()
        initial_session_id = session_info.get('session_id', '')
        is_active = session_info.get('is_active', False)
        
        logger.info(f"📋 État initial serveur:")
        logger.info(f"  - Session ID: '{initial_session_id}'")
        logger.info(f"  - Active: {is_active}")
        
        # SIMPLE: Rejeter seulement si session inactive
        if not is_active:
            logger.warning("❌ Session inactive - fermeture connexion")
            return
 

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








    def GetSessionInfo(self, request, context):
        # PAS de mise à jour d'activité ici car c'est juste une requête d'info
        # qui ne devrait pas réinitialiser le timeout
        
        # AJOUTER CES LIGNES pour voir les metadata
        metadata = dict(context.invocation_metadata())
        # logger.info(f"🧪 Metadata reçus dans GetSessionInfo: {metadata}")

        # Récupérer custom-header-1
        custom_data = metadata.get('custom-header-1', '')
        if custom_data:
            try:
                import json
                parsed_data = json.loads(custom_data)
                # logger.info(f"✅ METADATA CUSTOM: {parsed_data}")
                # logger.info(f"  - lastSequence: {parsed_data.get('lastSequence')}")
                # logger.info(f"  - cacheSize: {parsed_data.get('cacheSize')}")
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



    # def SetSessionInfo(self, request, context):
    #     """Endpoint pour recevoir/mettre à jour les informations de session depuis un client"""
    #     try:
    #         # Mettre à jour l'activité
    #         self.stream_monitor.update_activity()
    #         
    #         self.session_manager.update_from_proto(request)
    #         
    #         if not request.is_active:
    #             logger.info("Session marquée comme inactive, nettoyage du cache...")
    #             self.persistent_cache.clear_cache()
    #         
    #     except Exception as e:
    #         logger.error(f"Erreur lors de la mise à jour de SessionInfo: {e}")
    #         context.set_code(grpc.StatusCode.INTERNAL)
    #         context.set_details(f"Erreur lors de la mise à jour: {str(e)}")
    #         
    #     return Empty()


    def SetSessionInfo(self, request, context):
        """Endpoint pour recevoir/mettre à jour les informations de session depuis un client"""
        try:
            # NOUVEAU: Log de l'état de la session reçue
            logger.info(f"📝 SetSessionInfo reçu:")
            logger.info(f"  - Session ID: {request.session_id}")
            logger.info(f"  - Active: {request.is_active}")
            logger.info(f"  - Start time: {request.start_time}")
            logger.info(f"  - Clients: {request.clients_connected}")
            
            # Mettre à jour l'activité du monitor si la session est active
            if request.is_active:
                self.stream_monitor.update_activity()
                logger.debug("🔄 Session active - activité mise à jour")
            
            # Mettre à jour le session manager
            self.session_manager.update_from_proto(request)
            
            # Si session marquée comme inactive, préparer le nettoyage
            if not request.is_active:
                logger.warning("🛑 Session marquée comme inactive par le client")
                logger.info("🗑️ Préparation du nettoyage du cache...")
                # Ne pas nettoyer immédiatement, laisser le StreamMonitor gérer ça
            else:
                logger.debug("✅ Session active confirmée par le client")
            
        except Exception as e:
            logger.error(f"Erreur lors de la mise à jour de SessionInfo: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Erreur lors de la mise à jour: {str(e)}")
            
        return Empty()


    def shutdown(self):
        """Arrêt propre du service"""
        logger.info("🛑 Arrêt du service SLAM...")
        self.stream_monitor.stop()




def serve():
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),
            ('grpc.max_send_message_length', 50 * 1024 * 1024),
        ]
    )

    servicer = SlamServiceServicer()
    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(servicer, server)
    server.add_insecure_port('[::]:9090')
    server.add_insecure_port('[::]:50051')
    print("Le serveur est en cours d'exécution sur le port 9090 et 50051...")
    server.start()
    
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Interruption détectée, arrêt en cours...")
        servicer.shutdown()
        server.stop(grace=5)

if __name__ == '__main__':
    serve()
