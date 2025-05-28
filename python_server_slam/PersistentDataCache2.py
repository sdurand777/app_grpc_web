# PersistentDataCache.py - Version améliorée avec gestion des chunks
import threading
import os
import uuid
import time
from collections import OrderedDict

from utils import apply_voxel_grid_filter

import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2

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

class ChunkMetadata:
    """Métadonnées pour un chunk"""
    def __init__(self, chunk_id, sequence_number, session_id):
        self.chunk_id = chunk_id
        self.sequence_number = sequence_number
        self.session_id = session_id
        self.timestamp = int(time.time() * 1000)
        self.point_count = 0
        self.size_bytes = 0

class PersistentDataCache:
    """Cache persistant avec gestion des chunks identifiés"""
    
    def __init__(self, session_manager):
        self._lock = threading.RLock()
        self._session_manager = session_manager
        
        # Stockage des chunks avec métadonnées
        self._chunks = OrderedDict()  # chunk_id -> (metadata, slam_data)
        self._sequence_counter = 0
        self._voxel_cache = {}
        
        # Buffer temporaire pour accumulation
        self._temp_points = []
        self._temp_poses = []
        self._temp_indices = []
        
        # Configuration
        self.CHUNK_SIZE = 1000  # Points par chunk
        self.MAX_CHUNKS = 10000  # Limite de chunks en mémoire
        
    def generate_chunk_id(self):
        """Génère un ID unique pour un chunk"""
        return f"{self._session_manager.get_session_info()['session_id']}_{self._sequence_counter}_{uuid.uuid4().hex[:8]}"
    

    def add_slam_data(self, pointcloudlist, poselist, indexlist, voxel_size=0.01):
        """Ajoute des données SLAM et crée des chunks"""
        with self._lock:
            session_info = self._session_manager.get_session_info()
            
            # Traiter et filtrer les points
            pc_list = pointcloudlist.pointclouds
            pose_list = poselist.poses if poselist and poselist.poses else []
            
            for i, pc in enumerate(pc_list):
                filtered_pc = apply_voxel_grid_filter(pc, voxel_size=voxel_size)
                
                for point in filtered_pc.points:
                    voxel_key = (
                        int(point.x / voxel_size),
                        int(point.y / voxel_size),
                        int(point.z / voxel_size)
                    )
                    
                    if voxel_key not in self._voxel_cache:
                        self._voxel_cache[voxel_key] = True
                        self._temp_points.append(point)
                        
                        if i < len(pose_list):
                            self._temp_poses.append(pose_list[i])
                        elif pose_list:
                            self._temp_poses.append(pose_list[-1])
            
            # Créer des chunks si on a assez de points
            chunks_created = []
            while len(self._temp_points) >= self.CHUNK_SIZE:
                chunk_id, chunk_data = self._create_chunk()
                if chunk_id:
                    chunks_created.append(chunk_id)
            
            logger.info(f"Créé {len(chunks_created)} chunks, points en attente: {len(self._temp_points)}")
            return chunks_created
    


    def _create_chunk(self):
        """Crée un chunk à partir du buffer temporaire"""
        if len(self._temp_points) < self.CHUNK_SIZE:
            return None, None
        
        # Extraire les points pour ce chunk
        chunk_points = self._temp_points[:self.CHUNK_SIZE]
        chunk_poses = self._temp_poses[:min(self.CHUNK_SIZE, len(self._temp_poses))]
        
        # Créer le protobuf
        pointcloud = pointcloud_pb2.PointCloud()
        pointcloud.points.extend(chunk_points)
        
        pointcloudlist = pointcloud_pb2.PointCloudList()
        pointcloudlist.pointclouds.append(pointcloud)
        
        poselist = pointcloud_pb2.PoseList()
        if chunk_poses:
            poselist.poses.extend(chunk_poses)
        
        indexlist = pointcloud_pb2.Index()
        
        # Créer le SlamData avec ID
        chunk_id = self.generate_chunk_id()
        slam_data = pointcloud_pb2.SlamData(
            pointcloudlist=pointcloudlist,
            poselist=poselist,
            indexlist=indexlist,
            chunk_id=chunk_id,
            sequence_number=self._sequence_counter
        )
        
        # Créer les métadonnées
        metadata = ChunkMetadata(
            chunk_id=chunk_id,
            sequence_number=self._sequence_counter,
            session_id=self._session_manager.get_session_info()['session_id']
        )
        metadata.point_count = len(chunk_points)
        
        # Stocker le chunk
        self._chunks[chunk_id] = (metadata, slam_data)
        self._sequence_counter += 1
        
        # Nettoyer le buffer
        self._temp_points = self._temp_points[self.CHUNK_SIZE:]
        self._temp_poses = self._temp_poses[min(self.CHUNK_SIZE, len(self._temp_poses)):]
        
        # Gérer la limite de chunks
        if len(self._chunks) > self.MAX_CHUNKS:
            # Supprimer les plus anciens
            oldest_key = next(iter(self._chunks))
            del self._chunks[oldest_key]
        
        logger.debug(f"Chunk créé: {chunk_id}, sequence: {metadata.sequence_number}, points: {metadata.point_count}")
        return chunk_id, slam_data
    
    def get_chunk(self, chunk_id):
        """Récupère un chunk spécifique"""
        with self._lock:
            if chunk_id in self._chunks:
                return self._chunks[chunk_id][1]  # Retourne le slam_data
            return None
    
    def get_chunks_after_sequence(self, sequence_number, session_id):
        """Récupère tous les chunks après un numéro de séquence"""
        with self._lock:
            chunks = []
            for chunk_id, (metadata, slam_data) in self._chunks.items():
                if metadata.session_id == session_id and metadata.sequence_number > sequence_number:
                    chunks.append(slam_data)
            return sorted(chunks, key=lambda x: x.sequence_number)
    
    def get_sync_status(self, session_id):
        """Retourne l'état de synchronisation"""
        with self._lock:
            session_chunks = [
                (chunk_id, metadata) 
                for chunk_id, (metadata, _) in self._chunks.items()
                if metadata.session_id == session_id
            ]
            
            return {
                'session_id': session_id,
                'total_chunks': len(session_chunks),
                'latest_sequence_number': self._sequence_counter - 1 if self._sequence_counter > 0 else -1,
                'available_chunk_ids': [chunk_id for chunk_id, _ in session_chunks]
            }
    
    def clear_cache(self):
        """Nettoie le cache pour une nouvelle session"""
        with self._lock:
            logger.info(f"Nettoyage du cache: {len(self._chunks)} chunks supprimés")
            self._chunks.clear()
            self._voxel_cache.clear()
            self._temp_points.clear()
            self._temp_poses.clear()
            self._temp_indices.clear()
            self._sequence_counter = 0
    
    def flush_pending(self):
        """Force la création d'un chunk avec les données en attente"""
        with self._lock:
            if self._temp_points:
                # Créer un chunk même s'il est plus petit que CHUNK_SIZE
                original_size = self.CHUNK_SIZE
                self.CHUNK_SIZE = min(len(self._temp_points), self.CHUNK_SIZE)
                chunk_id, chunk_data = self._create_chunk()
                self.CHUNK_SIZE = original_size
                return chunk_id
            return None
    
    def get_all_chunks_for_session(self, session_id):
        """Récupère tous les chunks d'une session dans l'ordre"""
        with self._lock:
            session_chunks = []
            for chunk_id, (metadata, slam_data) in self._chunks.items():
                if metadata.session_id == session_id:
                    session_chunks.append((metadata.sequence_number, slam_data))
            
            # Trier par numéro de séquence
            session_chunks.sort(key=lambda x: x[0])
            return [slam_data for _, slam_data in session_chunks]
    
    def get_stats(self):
        """Retourne les statistiques du cache"""
        with self._lock:
            total_points = sum(metadata.point_count for metadata, _ in self._chunks.values())
            return {
                'total_chunks': len(self._chunks),
                'total_points': total_points,
                'unique_voxels': len(self._voxel_cache),
                'sequence_number': self._sequence_counter,
                'pending_points': len(self._temp_points),
                'session_info': self._session_manager.get_session_info()
            }
