import threading
import time
from datetime import datetime
import uuid
import os

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

# session manager simplifié
class SessionManager:
    """Gère simplement les informations de session en mémoire"""
    
    def __init__(self):
        self._lock = threading.RLock()
        # Stocker les informations de session
        self._session_id = ""
        self._start_time = ""
        self._is_active = False
        self._clients_connected = 0
        
        logger.info("SessionManager initialisé")
    
    def get_session_info(self):
        """Retourne les informations de session actuelles"""
        with self._lock:
            return {
                'session_id': self._session_id,
                'start_time': self._start_time,
                'is_active': self._is_active,
                'clients_connected': self._clients_connected
            }
    
    def update_session_info(self, session_id, start_time, is_active, clients_connected):
        """
        Met à jour les informations de session
        
        Args:
            session_id (str): ID de session
            start_time (str): Heure de début (format ISO8601)
            is_active (bool): État actif de la session
            clients_connected (int): Nombre de clients connectés
        """
        with self._lock:
            logger.info(f"Mise à jour SessionInfo:")
            logger.info(f"  - Session ID: '{self._session_id}' -> '{session_id}'")
            logger.info(f"  - Start Time: '{self._start_time}' -> '{start_time}'")
            logger.info(f"  - Is Active: {self._is_active} -> {is_active}")
            logger.info(f"  - Clients Connected: {self._clients_connected} -> {clients_connected}")
            
            self._session_id = session_id
            self._start_time = start_time
            self._is_active = is_active
            self._clients_connected = clients_connected
            
            logger.info("SessionInfo mis à jour avec succès")
    
    def update_from_proto(self, session_info_proto):
        """
        Met à jour depuis un objet SessionInfo protobuf
        
        Args:
            session_info_proto: Objet SessionInfo de pointcloud_pb2
        """
        self.update_session_info(
            session_info_proto.session_id,
            session_info_proto.start_time,
            session_info_proto.is_active,
            session_info_proto.clients_connected
        )
    
    def clear_session(self):
        """Efface toutes les informations de session"""
        with self._lock:
            logger.info("Effacement des informations de session")
            self._session_id = ""
            self._start_time = ""
            self._is_active = False
            self._clients_connected = 0
    
    def set_session_id(self, session_id):
        """Met à jour uniquement l'ID de session"""
        with self._lock:
            logger.debug(f"Mise à jour session ID: '{self._session_id}' -> '{session_id}'")
            self._session_id = session_id
    
    def set_active_state(self, is_active):
        """Met à jour uniquement l'état actif"""
        with self._lock:
            logger.debug(f"Mise à jour état actif: {self._is_active} -> {is_active}")
            self._is_active = is_active
    
    def set_clients_count(self, clients_connected):
        """Met à jour uniquement le nombre de clients"""
        with self._lock:
            logger.debug(f"Mise à jour clients connectés: {self._clients_connected} -> {clients_connected}")
            self._clients_connected = clients_connected
    
    def increment_clients(self):
        """Incrémente le nombre de clients connectés"""
        with self._lock:
            self._clients_connected += 1
            logger.debug(f"Client ajouté, total: {self._clients_connected}")
            return self._clients_connected
    
    def decrement_clients(self):
        """Décrémente le nombre de clients connectés"""
        with self._lock:
            if self._clients_connected > 0:
                self._clients_connected -= 1
            logger.debug(f"Client retiré, total: {self._clients_connected}")
            return self._clients_connected
    
    def __str__(self):
        """Représentation string du SessionManager"""
        with self._lock:
            return (f"SessionManager(id='{self._session_id}', "
                   f"active={self._is_active}, "
                   f"clients={self._clients_connected}, "
                   f"start='{self._start_time}')")
