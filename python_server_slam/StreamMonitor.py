import os
import sys
import threading
import time
import logging

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
logger = logging.getLogger(LOGGER_NAME)

class StreamMonitor:
    """Moniteur basé sur l'état de la session - avec reset correct du flag"""
    def __init__(self, timeout_seconds=5):
        self.timeout_seconds = timeout_seconds
        self.last_data_time = None
        self.is_active = False
        self.lock = threading.Lock()
        self.monitor_thread = None
        self.callbacks = []
        self.has_received_data = False
        
        # Pour la surveillance de la session
        self.session_manager = None
        self.last_session_check_time = None
        self.session_check_interval = 2.0
        self.has_had_active_session = False
        
    def set_session_manager(self, session_manager):
        """Injection du session manager pour vérifier l'état"""
        self.session_manager = session_manager
        
    def start(self):
        """Démarre le monitoring du stream"""
        self.is_active = True
        self.last_data_time = None
        self.has_received_data = False
        self.last_session_check_time = time.time()
        self.has_had_active_session = False
        
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        logger.info(f"🚀 Stream monitor démarré - Mode session-based")
        
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
        """Boucle de monitoring basée sur l'état de la session"""
        logger.info("🔄 Boucle de monitoring démarrée - Mode session-based")
        
        while self.is_active:
            time.sleep(1)
            current_time = time.time()
            
            with self.lock:
                # Condition de timeout classique
                should_timeout_classic = False
                time_since_last_data = float('inf')
                
                if self.has_received_data and self.last_data_time is not None:
                    time_since_last_data = current_time - self.last_data_time
                    should_timeout_classic = time_since_last_data > self.timeout_seconds
            
            # Vérifier l'état de la session
            session_active = True
            session_id = ''
            
            if self.session_manager:
                session_info = self.session_manager.get_session_info()
                session_active = session_info.get('is_active', False)
                session_id = session_info.get('session_id', '')
                
                # Marquer qu'on a eu une session active
                if session_active and session_id:
                    if not self.has_had_active_session:
                        logger.info(f"✅ Première session active détectée: '{session_id}'")
                    self.has_had_active_session = True
                
                # Log périodique
                if int(current_time) % 20 == 0:
                    logger.debug(f"📊 État session: {'active' if session_active else 'inactive'} ('{session_id}'), "
                               f"Had active: {self.has_had_active_session}")
            
            # Condition de timeout
            should_timeout = (
                self.has_had_active_session and
                not session_active and
                (should_timeout_classic or time_since_last_data > 2.0)
            )
            
            if should_timeout:
                logger.warning(f"⏰ Timeout déclenché:")
                logger.warning(f"  - Session active: {session_active}")
                logger.warning(f"  - Session ID: '{session_id}'")
                logger.warning(f"  - Avait session active: {self.has_had_active_session}")
                logger.warning(f"  - Temps depuis dernières données: {time_since_last_data:.1f}s")
                
                # Appeler tous les callbacks
                for callback in self.callbacks:
                    try:
                        logger.info("📞 Appel callback de nettoyage")
                        callback()
                        logger.info("✅ Callback terminé")
                    except Exception as e:
                        logger.error(f"Erreur dans callback de timeout: {e}")
                        import traceback
                        traceback.print_exc()
                
                # IMPORTANT: Reset complet après nettoyage pour nouvelle session
                with self.lock:
                    self.has_received_data = False
                    self.last_data_time = None
                    self.has_had_active_session = False  # RESET pour permettre nouvelle session
                
                logger.info("🔄 Flags réinitialisés - prêt pour nouvelle session")
                
                # NE PAS SORTIR de la boucle - continuer pour la prochaine session
                # break  # <-- SUPPRIMÉ
        
        logger.info("🔚 Fin boucle monitoring")
