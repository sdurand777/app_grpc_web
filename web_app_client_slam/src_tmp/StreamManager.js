// StreamManager to deal with grpc channels

import { SlamService } from './SlamService.js';
import { PoseService } from './PoseService.js';

export class StreamManager {
    constructor(serverUrl = 'http://192.168.51.30:8080') {
        this.serverUrl = serverUrl;
        this.slam = null;
        this.pose = null;
        this.isActive = false;
        this.reconnectDelay = 3000;
        this.maxRetries = 5;
        this.retryCount = 0;
        
        // Callbacks
        this.onPointCloudData = null;
        this.onPoseData = null;
        this.onPacketReceived = null;
        this.onError = null;
        this.onStatusChange = null;
    }

    // Configuration des callbacks
    setCallbacks({ onPointCloudData, onPoseData, onPacketReceived, onError, onStatusChange }) {
        this.onPointCloudData = onPointCloudData;
        this.onPoseData = onPoseData;
        this.onPacketReceived = onPacketReceived;
        this.onError = onError;
        this.onStatusChange = onStatusChange;
    }

    // Créer les services GRPC
    createServices() {
        this.slam = new SlamService(this.serverUrl);
        this.pose = new PoseService(this.serverUrl);
    }

    // Configuration des handlers de stream
    setupStreamHandlers() {
        if (!this.slam || !this.pose) {
            throw new Error('Services not initialized');
        }

        // Handler pour les point clouds
        this.slam.onData((err, res) => {
            if (err) {
                this.handleStreamError('SLAM', err);
            } else {
                if (this.onPointCloudData) this.onPointCloudData(res);
                if (this.onPacketReceived) this.onPacketReceived();
            }
        });

        // Handler pour les poses
        this.pose.onPoses((err, res) => {
            if (err) {
                this.handleStreamError('Pose', err);
            } else {
                if (this.onPoseData) this.onPoseData(res);
            }
        });
    }

    // Gestion des erreurs de stream
    handleStreamError(streamType, error) {
        console.error(`${streamType} stream error:`, error);
        
        if (this.onError) {
            this.onError(streamType, error);
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
            console.log('Starting GRPC streaming...');
            
            this.createServices();
            this.setupStreamHandlers();
            this.isActive = true;
            this.retryCount = 0;
            
            console.log('GRPC streaming started successfully');
            
            if (this.onStatusChange) {
                this.onStatusChange('connected');
            }
            
            return true;
            
        } catch (error) {
            console.error('Failed to start streaming:', error);
            this.isActive = false;
            
            if (this.onStatusChange) {
                this.onStatusChange('error', error);
            }
            
            // Auto-retry
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.start(), this.reconnectDelay * 2);
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
        
        if (this.onStatusChange) {
            this.onStatusChange('disconnected');
        }
    }

    // Redémarrer le streaming
    async restart() {
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.start();
    }

    // Getters
    get status() {
        return this.isActive ? 'connected' : 'disconnected';
    }

    get services() {
        return { slam: this.slam, pose: this.pose };
    }
}
