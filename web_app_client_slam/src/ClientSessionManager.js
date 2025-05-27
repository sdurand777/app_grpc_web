// ClientSessionManager.js
import { SessionService } from './SessionService.js';
import { DatabaseManager } from './DatabaseManager.js';

export class ClientSessionManager {
    constructor(serverUrl) {
        this.sessionService = new SessionService(serverUrl);
        this.db = new DatabaseManager();
        this.currentSession = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        await this.db.init();
        this.isInitialized = true;
    }

    async checkAndUpdateSession() {
        try {
            let serverSession = null;
            let retryCount = 0;
            const maxRetries = 30; // Limite pour éviter boucle infinie (30 secondes max)
            const retryDelay = 1000; // 1 seconde entre les tentatives
            
            // Boucler tant que sessionId n'est pas rempli
            while (!serverSession?.sessionId && retryCount < maxRetries) {
                if (retryCount > 0) {
                    console.log(`Waiting for valid sessionId... attempt ${retryCount}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                
                try {
                    // Récupérer les infos de session du serveur
                    serverSession = await this.sessionService.getSessionInfo();
                    console.log('Server session info:', serverSession);
                    
                    // Vérifier si le sessionId est valide (non vide et non null)
                    if (!serverSession?.sessionId || serverSession.sessionId === '') {
                        console.log('SessionId is empty or null, retrying...');
                        serverSession = null; // Reset pour continuer la boucle
                    }
                } catch (serviceError) {
                    console.log(`Error getting session info (attempt ${retryCount + 1}):`, serviceError.message);
                    // On continue la boucle même en cas d'erreur du service
                }
                
                retryCount++;
            }
            
            // Vérifier si on a finalement obtenu un sessionId valide
            if (!serverSession?.sessionId) {
                throw new Error(`Failed to get valid sessionId after ${maxRetries} attempts`);
            }
            
            console.log('Valid sessionId obtained:', serverSession.sessionId);
            
            // Récupérer la session locale stockée
            const localSession = await this.db.getCurrentSession();
            console.log('Local session info:', localSession);
            
            // Comparer les sessions
            const needsUpdate = this.shouldUpdateSession(localSession, serverSession);
            
            if (needsUpdate) {
                console.log('New session detected, clearing local data...');
                
                // Si c'est une nouvelle session, nettoyer les anciennes données
                if (localSession) {
                    await this.db.clearSession(localSession.sessionId);
                }
                
                // Sauvegarder la nouvelle session
                await this.db.saveSession(serverSession);
                await this.db.setCurrentSessionId(serverSession.sessionId);
                
                this.currentSession = serverSession;
                
                return {
                    isNewSession: true,
                    sessionId: serverSession.sessionId,
                    hasLocalData: false
                };
            } else {
                console.log('Same session, checking for local data...');
                
                // Vérifier si on a des données locales pour cette session
                const hasData = await this.db.hasDataForSession(serverSession.sessionId);
                
                this.currentSession = serverSession;
                
                return {
                    isNewSession: false,
                    sessionId: serverSession.sessionId,
                    hasLocalData: hasData
                };
            }
        } catch (error) {
            console.error('Error checking session:', error);
            throw error;
        }
    }

    shouldUpdateSession(localSession, serverSession) {
        // Si pas de session locale, c'est une nouvelle session
        if (!localSession) return true;
        
        // Si les IDs sont différents, c'est une nouvelle session
        if (localSession.sessionId !== serverSession.sessionId) return true;
        
        // Si le serveur indique que la session n'est plus active
        if (!serverSession.isActive) return true;
        
        // Si les temps de début sont différents (au cas où le serveur a redémarré)
        if (localSession.startTime !== serverSession.startTime) return true;
        
        return false;
    }

    async loadDataFromCache(onPointCloudData, onPoseData) {
        if (!this.currentSession) {
            throw new Error('No current session');
        }
        
        console.log('Loading data from local cache...');
        
        // Charger les chunks de points
        const pointChunks = await this.db.getPointChunksBySession(this.currentSession.sessionId);
        console.log(`Found ${pointChunks.length} point chunks in cache`);
        
        for (const chunk of pointChunks) {
            if (onPointCloudData) {
                // Convertir le format de stockage au format attendu par le visualiseur
                const pointCloudData = {
                    pointcloudlist: {
                        pointclouds: [{
                            points: this.reconstructPoints(chunk.coords, chunk.colors)
                        }]
                    }
                };
                onPointCloudData(pointCloudData);
            }
        }
        
        // Charger les poses
        const poses = await this.db.getPosesBySession(this.currentSession.sessionId);
        console.log(`Found ${poses.length} poses in cache`);
        
        for (const pose of poses) {
            if (onPoseData) {
                // Convertir le format de stockage au format attendu
                const poseData = {
                    poses: [{
                        matrix: pose.matrix,
                        position: pose.position,
                        trajectoryIndex: pose.trajectoryIndex
                    }]
                };
                onPoseData(poseData);
            }
        }
        
        console.log('Finished loading from cache');
    }

    reconstructPoints(coords, colors) {
        const points = [];
        for (let i = 0; i < coords.length; i += 3) {
            points.push({
                x: coords[i],
                y: coords[i + 1],
                z: coords[i + 2],
                r: colors[i],
                g: colors[i + 1],
                b: colors[i + 2]
            });
        }
        return points;
    }

    async savePointChunk(coords, colors, chunkIndex) {
        if (!this.currentSession) {
            throw new Error('No current session');
        }
        
        return this.db.savePointChunk(coords, colors, chunkIndex, this.currentSession.sessionId);
    }

    async savePose(poseMatrix, position, trajectoryIndex) {
        if (!this.currentSession) {
            throw new Error('No current session');
        }
        
        return this.db.savePose(poseMatrix, position, trajectoryIndex, this.currentSession.sessionId);
    }

    async getStorageInfo() {
        return this.db.getStorageInfo();
    }

    get sessionId() {
        return this.currentSession?.sessionId;
    }

    get isActive() {
        return this.currentSession?.isActive;
    }
}
