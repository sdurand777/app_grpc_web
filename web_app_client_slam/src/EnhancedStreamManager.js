// EnhancedStreamManager.js - Version simplifiée
import { SlamService } from './SlamService.js';
import { PoseService } from './PoseService.js';
import { ClientSessionManager } from './ClientSessionManager.js';

export class EnhancedStreamManager {
    constructor(serverUrl = 'http://192.168.51.30:8080') {
        this.serverUrl = serverUrl;
        this.slam = null;
        this.pose = null;
        this.isActive = false;
        this.reconnectDelay = 3000;
        this.maxRetries = 5;
        this.retryCount = 0;
        
        this.sessionManager = new ClientSessionManager(serverUrl);    

        // Session simple
        this.sessionId = null;
        this.sessionStartTime = null;
        
        // Statistiques de streaming
        this.stats = {
            pointCloudsReceived: 0,
            posesReceived: 0,
            startTime: null,
            lastPacketTime: null
        };
        
        // Callbacks
        this.callbacks = {
            onPointCloudData: null,
            onPoseData: null,
            onPacketReceived: null,
            onError: null,
            onStatusChange: null,
            onSessionUpdate: null
        };
    }

    // Configuration des callbacks
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // Créer les services GRPC
    createServices() {
        this.slam = new SlamService(this.serverUrl);
        this.pose = new PoseService(this.serverUrl);
    }

    // Configuration des handlers de stream SIMPLIFIÉS
    setupStreamHandlers() {
        if (!this.slam || !this.pose) {
            throw new Error('Services not initialized');
        }

        // Handler pour les point clouds - SIMPLIFIÉ
        this.slam.onData((err, res) => {
            if (err) {
                this.handleStreamError('SLAM', err);
            } else {
                this.stats.pointCloudsReceived++;
                this.stats.lastPacketTime = Date.now();
                
                // Passer directement les données au callback avec le sessionId
                if (this.callbacks.onPointCloudData) {
                    this.callbacks.onPointCloudData(res, this.sessionId);
                }
                
                if (this.callbacks.onPacketReceived) {
                    this.callbacks.onPacketReceived();
                }
            }
        });

        // Handler pour les poses - SIMPLIFIÉ
        this.pose.onPoses((err, res) => {
            if (err) {
                this.handleStreamError('Pose', err);
            } else {
                this.stats.posesReceived++;
                this.stats.lastPacketTime = Date.now();
                
                // Passer directement les données au callback avec le sessionId
                if (this.callbacks.onPoseData) {
                    this.callbacks.onPoseData(res, this.sessionId);
                }
            }
        });
    }

    // Gestion des erreurs de stream
    handleStreamError(streamType, error) {
        console.error(`${streamType} stream error:`, error);
        
        if (this.callbacks.onError) {
            this.callbacks.onError(streamType, error);
        }

        if (this.isActive && this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`${streamType} stream error, attempting reconnection (${this.retryCount}/${this.maxRetries})...`);
            
            this.isActive = false;
            setTimeout(() => this.start(), this.reconnectDelay);
        } else if (this.retryCount >= this.maxRetries) {
            console.error(`Max retries reached for ${streamType} stream`);
            this.stop();
        }
    }

    // Démarrer le streaming
    async start() {
        if (this.isActive) {
            console.log('Streaming already active');
            return true;
        }

        try {


            console.log('Initializing session manager...');
            await this.sessionManager.init();

            // Vérifier la session avec gestion de retry intégrée
            console.log('Checking session status...');
            const sessionStatus = await this.sessionManager.checkAndUpdateSession();

            // Mettre à jour les statistiques
            this.stats.startTime = Date.now();
            this.stats.pointCloudsReceived = 0;
            this.stats.posesReceived = 0;
            this.stats.totalPoints = 0;

            if (this.onSessionUpdate) {
                this.onSessionUpdate(sessionStatus);
            }

            console.log('Session status:', sessionStatus);

            
            // Mettre à jour les statistiques
            this.stats.startTime = Date.now();
            this.stats.pointCloudsReceived = 0;
            this.stats.posesReceived = 0;
            
            // Démarrer le streaming GRPC
            console.log('Starting GRPC streaming...');
            this.createServices();
            this.setupStreamHandlers();
            this.isActive = true;
            this.retryCount = 0;
            
            console.log('GRPC streaming started successfully');
            
            if (this.callbacks.onStatusChange) {
                this.callbacks.onStatusChange('connected');
            }
            
            return true;
            
        } catch (error) {
            console.error('Failed to start streaming:', error);
            this.isActive = false;
            
            if (this.callbacks.onStatusChange) {
                this.callbacks.onStatusChange('error', error);
            }
            
            // Auto-retry
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Auto-retry in ${this.reconnectDelay}ms (${this.retryCount}/${this.maxRetries})`);
                setTimeout(() => this.start(), this.reconnectDelay);
            }
            
            return false;
        }
    }

    // Arrêter le streaming
    stop() {
        this.isActive = false;
        this.retryCount = 0;
        
        if (this.slam && typeof this.slam.disconnect === 'function') {
            this.slam.disconnect();
        }
        if (this.pose && typeof this.pose.disconnect === 'function') {
            this.pose.disconnect();
        }
        
        console.log('Streaming stopped');
        
        if (this.callbacks.onStatusChange) {
            this.callbacks.onStatusChange('disconnected');
        }
    }

    // Redémarrer le streaming
    async restart() {
        console.log('Restarting streaming...');
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.start();
    }

    // Forcer une nouvelle session
    async forceNewSession() {
        console.log('Forcing new session...');
        this.sessionId = null;
        this.sessionStartTime = null;
        return this.restart();
    }

    // Obtenir les statistiques de streaming
    getStreamingStats() {
        const now = Date.now();
        const runtime = this.stats.startTime ? now - this.stats.startTime : 0;
        
        return {
            ...this.stats,
            runtime,
            sessionId: this.sessionId,
            averagePointCloudsPerSecond: runtime > 0 ? (this.stats.pointCloudsReceived / (runtime / 1000)).toFixed(2) : 0,
            averagePosesPerSecond: runtime > 0 ? (this.stats.posesReceived / (runtime / 1000)).toFixed(2) : 0,
            timeSinceLastPacket: this.stats.lastPacketTime ? now - this.stats.lastPacketTime : null
        };
    }
}
