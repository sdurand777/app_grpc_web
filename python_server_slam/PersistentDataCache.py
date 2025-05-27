import threading
import os

from utils import apply_voxel_grid_filter

# Ajoutez ces imports
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2

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



# persistent data cache server side
class PersistentDataCache:
    """Cache persistant pour stocker toutes les données SLAM"""
    
    def __init__(self, session_manager):
        self._lock = threading.RLock()
        self._all_points = []
        self._all_poses = []
        self._voxel_cache = {}
        self._sequence_number = 0
        self._session_manager = session_manager
        
    def add_slam_data(self, pointcloudlist, poselist, indexlist, voxel_size=0.01):
        """Ajoute des données SLAM au cache persistant"""
        with self._lock:
            # Si c'est les premières données d'une nouvelle session, on peut nettoyer
            if self._sequence_number == 0 and self._session_manager._is_active:
                self.clear_cache()
            
            new_points = []
            new_poses = []
            
            pc_list = pointcloudlist.pointclouds
            pose_list = poselist.poses if poselist and poselist.poses else []
            
            for i, pc in enumerate(pc_list):
                filtered_pc = apply_voxel_grid_filter(pc, voxel_size=voxel_size)
                points = filtered_pc.points
                
                for point in points:
                    voxel_key = (
                        int(point.x / voxel_size),
                        int(point.y / voxel_size),
                        int(point.z / voxel_size)
                    )
                    
                    if voxel_key not in self._voxel_cache:
                        self._voxel_cache[voxel_key] = True
                        new_points.append(point)
                        
                        pose_for_this_pc = pose_list[i] if i < len(pose_list) else (pose_list[-1] if pose_list else None)
                        if pose_for_this_pc:
                            new_poses.append(pose_for_this_pc)
            
            self._all_points.extend(new_points)
            self._all_poses.extend(new_poses)
            self._sequence_number += 1
            
            logger.info(f"Cache mis à jour: {len(new_points)} nouveaux points, total: {len(self._all_points)}")
            return len(new_points)
    
    def clear_cache(self):
        """Nettoie le cache pour une nouvelle session"""
        with self._lock:
            logger.info(f"Nettoyage du cache: {len(self._all_points)} points supprimés")
            self._all_points = []
            self._all_poses = []
            self._voxel_cache = {}
            self._sequence_number = 0
    
    def get_all_data_batched(self, batch_size=1000, include_metadata=False):
        """Retourne toutes les données par batches avec métadonnées de session"""
        with self._lock:
            total_points = len(self._all_points)
            total_poses = len(self._all_poses)
            session_info = self._session_manager.get_session_info()
            
            logger.info(f"Envoi de toutes les données: {total_points} points, {total_poses} poses")
            
            # Premier batch avec métadonnées
            first_batch = True
            
            for i in range(0, total_points, batch_size):
                end_idx = min(i + batch_size, total_points)
                
                batch_pointcloud = pointcloud_pb2.PointCloud()
                batch_pointcloud.points.extend(self._all_points[i:end_idx])
                batch_pointcloudlist = pointcloud_pb2.PointCloudList()
                batch_pointcloudlist.pointclouds.append(batch_pointcloud)
                
                batch_poselist = pointcloud_pb2.PoseList()
                if i < total_poses:
                    pose_end_idx = min(end_idx, total_poses)
                    batch_poselist.poses.extend(self._all_poses[i:pose_end_idx])
                
                batch_indexlist = pointcloud_pb2.Index()
                
                # Ajouter les métadonnées de session dans le premier batch
                if first_batch and include_metadata:
                    # Vous devrez ajouter ces champs au proto
                    # batch_indexlist.session_id = session_info['session_id']
                    # batch_indexlist.is_new_session = True
                    first_batch = False
                
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
                'sequence_number': self._sequence_number,
                'session_info': self._session_manager.get_session_info()
            }


