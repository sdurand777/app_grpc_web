// SimplifiedStreamManager.js
import { SlamService } from './SlamService.js';
import { DatabaseManager } from './DatabaseManager.js';
import { SessionService } from './SessionService.js';
import { ClientSessionManager } from './ClientSessionManager.js';

export class SimplifiedStreamManager {
    constructor(serverUrl = 'http://192.168.51.30:8080') {
        this.serverUrl = serverUrl;
        this.slam = null;
        this.sessionService = new SessionService(serverUrl);
        this.sessionManager = new ClientSessionManager(serverUrl);    
        this.db = new DatabaseManager();
        this.sessionId = null;
        this.isActive = false;
        
        // Statistiques
        this.stats = {
            chunksReceived: 0,
            chunksFromCache: 0,
            chunksFromServer: 0,
            lastSequenceNumber: -1
        };
        
        // Callbacks
        this.callbacks = {
            onChunkReceived: null,
            onError: null,
            onStatusChange: null,
            onSessionUpdate: null
        };
    }

    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    async init() {
        await this.db.init();
        console.log('StreamManager initialized with database');
    }

    async start() {
        if (this.isActive) return;

        try {
            this.isActive = true;
            
            // Créer le service GRPC
            this.slam = new SlamService(this.serverUrl);
            
            // Obtenir les infos de session du serveur
            // Vérifier la session avec gestion de retry intégrée
            console.log('Checking session status...');
            const sessionStatus = await this.sessionManager.checkAndUpdateSession();

            console.log("Get session info")
            const sessionInfo = await this.sessionService.getSessionInfo();
            this.sessionId = sessionInfo.sessionId;
            
            console.log('Session info:', sessionInfo);
            
            // Notifier la mise à jour de session
            if (this.callbacks.onSessionUpdate) {
                this.callbacks.onSessionUpdate({
                    sessionId: sessionInfo.sessionId,
                    isNewSession: false, // À déterminer
                    totalChunks: sessionInfo.totalChunks
                });
            }
            
            // Sauvegarder la session
            await this.db.saveSession(sessionInfo);
            await this.db.setCurrentSessionId(sessionInfo.sessionId);
            
            // Démarrer la synchronisation
            await this.synchronizeAndStream();
            
        } catch (error) {
            console.error('Failed to start streaming:', error);
            this.isActive = false;
            if (this.callbacks.onError) {
                this.callbacks.onError('startup', error);
            }
        }
    }

    async synchronizeAndStream() {
        try {
            // 1. Charger les chunks depuis le cache local
            console.log('Loading chunks from local cache...');
            const cachedChunks = await this.db.getChunksBySession(this.sessionId);
            const cachedChunkIds = new Set(cachedChunks.map(c => c.chunk_id));
            
            // Traiter les chunks cachés
            for (const chunk of cachedChunks) {
                this.stats.chunksFromCache++;
                if (this.callbacks.onChunkReceived) {
                    this.callbacks.onChunkReceived(chunk.data, 'cache');
                }
                this.stats.lastSequenceNumber = Math.max(
                    this.stats.lastSequenceNumber, 
                    chunk.sequence_number
                );
            }
            
            console.log(`Loaded ${cachedChunks.length} chunks from cache`);
            
            // 2. Obtenir l'état de sync du serveur
            const syncStatus = await this.slam.getSyncStatus();
            console.log('Server sync status:', syncStatus);
            
            // 3. Identifier les chunks manquants
            const serverChunkIds = new Set(syncStatus.availableChunkIds);
            const missingChunkIds = [];
            
            for (const chunkId of serverChunkIds) {
                if (!cachedChunkIds.has(chunkId)) {
                    missingChunkIds.push(chunkId);
                }
            }
            
            console.log(`Found ${missingChunkIds.length} missing chunks`);
            
            // 4. Récupérer les chunks manquants si nécessaire
            if (missingChunkIds.length > 0) {
                await this.fetchMissingChunks(missingChunkIds);
            }
            
            // 5. Démarrer le streaming temps réel
            this.startRealtimeStreaming();
            
        } catch (error) {
            console.error('Synchronization error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('sync', error);
            }
        }
    }

    async fetchMissingChunks(chunkIds) {
        console.log(`Fetching ${chunkIds.length} missing chunks from server...`);
        
        const chunkRequest = {
            session_id: this.sessionId,
            missing_chunk_ids: chunkIds,
            last_sequence_number: this.stats.lastSequenceNumber
        };
        
        // Utiliser le service pour récupérer les chunks spécifiques
        this.slam.getSpecificChunks(chunkRequest, async (err, chunk) => {
            if (err) {
                console.error('Error fetching chunk:', err);
                return;
            }
            
            // Sauvegarder le chunk
            await this.db.saveChunk(chunk);
            
            // Traiter le chunk
            this.stats.chunksFromServer++;
            if (this.callbacks.onChunkReceived) {
                this.callbacks.onChunkReceived(chunk, 'server-recovery');
            }
            
            this.stats.lastSequenceNumber = Math.max(
                this.stats.lastSequenceNumber,
                chunk.sequence_number || chunk.sequenceNumber
            );
        });
    }

    startRealtimeStreaming() {
        console.log('Starting realtime streaming...');
        
        // Configurer le handler pour le stream temps réel
        this.slam.onData(async (err, slamData) => {
            if (err) {
                console.error('Stream error:', err);
                if (this.callbacks.onError) {
                    this.callbacks.onError('stream', err);
                }
                return;
            }
            
            // Vérifier si c'est un nouveau chunk
            const chunkId = slamData.chunk_id || slamData.chunkId;
            const sequenceNumber = slamData.sequence_number || slamData.sequenceNumber;
            
            if (chunkId && sequenceNumber > this.stats.lastSequenceNumber) {
                // Sauvegarder le nouveau chunk
                await this.db.saveChunk(slamData);
                
                // Traiter le chunk
                this.stats.chunksReceived++;
                if (this.callbacks.onChunkReceived) {
                    this.callbacks.onChunkReceived(slamData, 'realtime');
                }
                
                this.stats.lastSequenceNumber = sequenceNumber;
                
                // Mettre à jour l'état de sync périodiquement
                if (this.stats.chunksReceived % 10 === 0) {
                    await this.db.saveSyncState(this.sessionId, {
                        lastSequenceNumber: this.stats.lastSequenceNumber,
                        totalChunks: this.stats.chunksReceived + this.stats.chunksFromCache
                    });
                }
            }
        });
        
        if (this.callbacks.onStatusChange) {
            this.callbacks.onStatusChange('streaming');
        }
    }

    async stop() {
        this.isActive = false;
        
        if (this.slam && typeof this.slam.disconnect === 'function') {
            this.slam.disconnect();
        }
        
        // Sauvegarder l'état final
        if (this.sessionId) {
            await this.db.saveSyncState(this.sessionId, {
                lastSequenceNumber: this.stats.lastSequenceNumber,
                totalChunks: this.stats.chunksReceived + this.stats.chunksFromCache
            });
        }
        
        console.log('Streaming stopped');
        
        if (this.callbacks.onStatusChange) {
            this.callbacks.onStatusChange('stopped');
        }
    }

    async forceNewSession() {
        // Arrêter le streaming actuel
        await this.stop();
        
        // Nettoyer les données de la session courante
        if (this.sessionId) {
            await this.db.clearSessionChunks(this.sessionId);
        }
        
        // Réinitialiser les stats
        this.stats = {
            chunksReceived: 0,
            chunksFromCache: 0,
            chunksFromServer: 0,
            lastSequenceNumber: -1
        };
        
        // Redémarrer
        await this.start();
    }

    getStats() {
        return {
            ...this.stats,
            sessionId: this.sessionId,
            isActive: this.isActive
        };
    }
}
