
import os
import sys
import threading
import time
import logging

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
logger = logging.getLogger(LOGGER_NAME)

class StreamMonitor:
    """Moniteur pour détecter la fin du stream"""
    def __init__(self, timeout_seconds=5):
        self.timeout_seconds = timeout_seconds
        self.last_data_time = None  # None jusqu'à la première donnée
        self.is_active = False
        self.lock = threading.Lock()
        self.monitor_thread = None
        self.callbacks = []
        self.has_received_data = False  # Flag pour savoir si on a déjà reçu des données
        
    def start(self):
        """Démarre le monitoring du stream"""
        self.is_active = True
        self.last_data_time = None  # Reset à None au démarrage
        self.has_received_data = False
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        logger.info(f"🚀 Stream monitor démarré (timeout: {self.timeout_seconds}s)")
        
    def stop(self):
        """Arrête le monitoring"""
        self.is_active = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1)
        logger.info("🛑 Stream monitor arrêté")
        
    def update_activity(self):
        """Met à jour le timestamp de la dernière activité"""
        with self.lock:
            self.last_data_time = time.time()
            if not self.has_received_data:
                self.has_received_data = True
                logger.info("📡 Première donnée reçue - monitoring actif")
            
    def add_timeout_callback(self, callback):
        """Ajoute un callback à appeler en cas de timeout"""
        self.callbacks.append(callback)
        
    def _monitor_loop(self):
        """Boucle de monitoring du timeout"""
        while self.is_active:
            time.sleep(1)  # Vérifier toutes les secondes
            
            with self.lock:
                # Ne pas vérifier le timeout si on n'a pas encore reçu de données
                if not self.has_received_data or self.last_data_time is None:
                    continue
                    
                time_since_last_data = time.time() - self.last_data_time
                
            if time_since_last_data > self.timeout_seconds:
                logger.warning(f"⏰ Timeout détecté: {time_since_last_data:.1f}s sans données")
                
                # Appeler tous les callbacks
                for callback in self.callbacks:
                    try:
                        callback()
                    except Exception as e:
                        logger.error(f"Erreur dans callback de timeout: {e}")
                        import traceback
                        traceback.print_exc()
                
                # Réinitialiser pour éviter de déclencher en boucle
                with self.lock:
                    self.has_received_data = False  # Reset le flag
                    self.last_data_time = None

