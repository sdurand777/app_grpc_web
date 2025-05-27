// DatabaseManager.js
export class DatabaseManager {
    constructor() {
        this.dbName = 'SlamVisualizerDB';
        this.version = 3; // Incrémenté pour les améliorations
        this.db = null;
        this.CHUNK_SIZE = 10000; // Nombre de points par chunk
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store pour les chunks de points
                if (!db.objectStoreNames.contains('pointChunks')) {
                    const pointStore = db.createObjectStore('pointChunks', { keyPath: 'id', autoIncrement: true });
                    pointStore.createIndex('timestamp', 'timestamp', { unique: false });
                    pointStore.createIndex('sessionId', 'sessionId', { unique: false });
                    pointStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
                }
                
                // Store pour les poses
                if (!db.objectStoreNames.contains('poses')) {
                    const poseStore = db.createObjectStore('poses', { keyPath: 'id', autoIncrement: true });
                    poseStore.createIndex('timestamp', 'timestamp', { unique: false });
                    poseStore.createIndex('sessionId', 'sessionId', { unique: false });
                    poseStore.createIndex('trajectoryIndex', 'trajectoryIndex', { unique: false });
                }
                
                // Store pour les métadonnées
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                
                // Store pour les sessions
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }
            };
        });
    }

    // Gestion des sessions
    async saveSession(sessionInfo) {
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        
        const session = {
            sessionId: sessionInfo.sessionId,
            startTime: sessionInfo.startTime,
            isActive: sessionInfo.isActive,
            clientsConnected: sessionInfo.clientsConnected || 0,
            lastUpdated: Date.now(),
            createdAt: sessionInfo.createdAt || Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(session);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSession(sessionId) {
        const transaction = this.db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        const request = store.get(sessionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getCurrentSession() {
        const transaction = this.db.transaction(['metadata'], 'readonly');
        const store = transaction.objectStore('metadata');
        const request = store.get('currentSessionId');
        
        return new Promise((resolve, reject) => {
            request.onsuccess = async () => {
                const result = request.result;
                if (result && result.value) {
                    try {
                        const session = await this.getSession(result.value);
                        resolve(session);
                    } catch (error) {
                        console.warn('Session not found in sessions store:', result.value);
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async setCurrentSessionId(sessionId) {
        return this.saveMetadata('currentSessionId', sessionId);
    }

    // Méthode pour nettoyer les anciennes sessions (optionnel)
    async cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000) { // 24h par défaut
        const cutoffTime = Date.now() - maxAge;
        const transaction = this.db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const index = store.index('lastUpdated');
        
        const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const session = cursor.value;
                    console.log('Cleaning up old session:', session.sessionId);
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Sauvegarde des points par chunks avec sessionId
    async savePointChunk(coords, colors, chunkIndex, sessionId) {
        console.log(`🗄️ DB: Saving point chunk ${chunkIndex} for session ${sessionId}`);
        
        const transaction = this.db.transaction(['pointChunks'], 'readwrite');
        const store = transaction.objectStore('pointChunks');
        
        const chunk = {
            coords: coords,
            colors: colors,
            chunkIndex: chunkIndex,
            sessionId: sessionId,
            timestamp: Date.now(),
            pointCount: coords.length / 3
        };
        
        console.log(`🗄️ DB: Chunk object created:`, {
            chunkIndex: chunk.chunkIndex,
            sessionId: chunk.sessionId,
            pointCount: chunk.pointCount,
            coordsType: chunk.coords.constructor.name,
            colorsType: chunk.colors.constructor.name,
            timestamp: chunk.timestamp
        });
        
        return new Promise((resolve, reject) => {
            const request = store.put(chunk);
            request.onsuccess = () => {
                console.log(`✅ DB: Point chunk ${chunkIndex} saved with ID:`, request.result);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error(`❌ DB: Error saving point chunk ${chunkIndex}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Sauvegarde d'une pose avec sessionId
    async savePose(poseMatrix, position, trajectoryIndex, sessionId) {
        const transaction = this.db.transaction(['poses'], 'readwrite');
        const store = transaction.objectStore('poses');
        
        const pose = {
            matrix: poseMatrix,
            position: position,
            trajectoryIndex: trajectoryIndex,
            sessionId: sessionId,
            timestamp: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(pose);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Sauvegarde des métadonnées
    async saveMetadata(key, value) {
        const transaction = this.db.transaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value, timestamp: Date.now() });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Récupération des métadonnées
    async getMetadata(key) {
        const transaction = this.db.transaction(['metadata'], 'readonly');
        const store = transaction.objectStore('metadata');
        const request = store.get(key);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    // Récupération de tous les chunks de points pour une session
    async getPointChunksBySession(sessionId) {
        console.log(`🔍 DB: Getting point chunks for session: ${sessionId}`);
        
        const transaction = this.db.transaction(['pointChunks'], 'readonly');
        const store = transaction.objectStore('pointChunks');
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const chunks = request.result.sort((a, b) => a.chunkIndex - b.chunkIndex);
                console.log(`📊 DB: Found ${chunks.length} point chunks for session ${sessionId}`);
                
                if (chunks.length > 0) {
                    console.log(`📊 DB: First chunk details:`, {
                        id: chunks[0].id,
                        chunkIndex: chunks[0].chunkIndex,
                        pointCount: chunks[0].pointCount,
                        timestamp: chunks[0].timestamp,
                        hasCoords: !!chunks[0].coords,
                        hasColors: !!chunks[0].colors
                    });
                    
                    const totalPoints = chunks.reduce((sum, chunk) => sum + (chunk.pointCount || 0), 0);
                    console.log(`📊 DB: Total points across all chunks: ${totalPoints}`);
                }
                
                resolve(chunks);
            };
            request.onerror = () => {
                console.error(`❌ DB: Error getting point chunks for session ${sessionId}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Récupération de toutes les poses pour une session
    async getPosesBySession(sessionId) {
        console.log(`🔍 DB: Getting poses for session: ${sessionId}`);
        
        const transaction = this.db.transaction(['poses'], 'readonly');
        const store = transaction.objectStore('poses');
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const poses = request.result.sort((a, b) => a.trajectoryIndex - b.trajectoryIndex);
                console.log(`📊 DB: Found ${poses.length} poses for session ${sessionId}`);
                
                if (poses.length > 0) {
                    console.log(`📊 DB: First pose details:`, {
                        id: poses[0].id,
                        trajectoryIndex: poses[0].trajectoryIndex,
                        timestamp: poses[0].timestamp,
                        hasMatrix: !!poses[0].matrix,
                        hasPosition: !!poses[0].position
                    });
                }
                
                resolve(poses);
            };
            request.onerror = () => {
                console.error(`❌ DB: Error getting poses for session ${sessionId}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Vider toutes les données d'une session
    async clearSession(sessionId) {
        const transaction = this.db.transaction(['pointChunks', 'poses', 'sessions'], 'readwrite');
        
        try {
            // Supprimer les chunks de points
            const pointStore = transaction.objectStore('pointChunks');
            const pointIndex = pointStore.index('sessionId');
            const pointRequest = pointIndex.getAllKeys(sessionId);
            
            await new Promise((resolve, reject) => {
                pointRequest.onsuccess = async () => {
                    const keys = pointRequest.result;
                    for (const key of keys) {
                        await pointStore.delete(key);
                    }
                    resolve();
                };
                pointRequest.onerror = reject;
            });
            
            // Supprimer les poses
            const poseStore = transaction.objectStore('poses');
            const poseIndex = poseStore.index('sessionId');
            const poseRequest = poseIndex.getAllKeys(sessionId);
            
            await new Promise((resolve, reject) => {
                poseRequest.onsuccess = async () => {
                    const keys = poseRequest.result;
                    for (const key of keys) {
                        await poseStore.delete(key);
                    }
                    resolve();
                };
                poseRequest.onerror = reject;
            });
            
            // Supprimer la session elle-même
            const sessionStore = transaction.objectStore('sessions');
            await sessionStore.delete(sessionId);
            
            console.log(`Session ${sessionId} cleared successfully`);
            
        } catch (error) {
            console.error(`Error clearing session ${sessionId}:`, error);
            throw error;
        }
    }

    // Vider toute la base de données
    async clearAll() {
        const transaction = this.db.transaction(['pointChunks', 'poses', 'metadata', 'sessions'], 'readwrite');
        
        await Promise.all([
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('pointChunks').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('poses').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('metadata').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('sessions').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            })
        ]);
        
        console.log('Database cleared successfully');
    }

    // Vérifier si des données existent pour une session
    async hasDataForSession(sessionId) {
        console.log(`🔍 DB: Checking if data exists for session: ${sessionId}`);
        
        const chunks = await this.getPointChunksBySession(sessionId);
        const poses = await this.getPosesBySession(sessionId);
        
        const hasData = chunks.length > 0 || poses.length > 0;
        
        console.log(`📊 DB: Data check result for session ${sessionId}:`, {
            pointChunks: chunks.length,
            poses: poses.length,
            hasData: hasData
        });
        
        return hasData;
    }

    // Obtenir des statistiques sur une session
    async getSessionStats(sessionId) {
        console.log(`📊 DB: Getting session stats for: ${sessionId}`);
        
        const chunks = await this.getPointChunksBySession(sessionId);
        const poses = await this.getPosesBySession(sessionId);
        
        const totalPoints = chunks.reduce((sum, chunk) => sum + (chunk.pointCount || 0), 0);
        const dataSize = chunks.reduce((sum, chunk) => {
            const coordsSize = chunk.coords ? chunk.coords.byteLength : 0;
            const colorsSize = chunk.colors ? chunk.colors.byteLength : 0;
            return sum + coordsSize + colorsSize;
        }, 0);
        
        const stats = {
            sessionId,
            pointChunks: chunks.length,
            totalPoints,
            poses: poses.length,
            dataSize
        };
        
        console.log(`📊 DB: Session stats calculated:`, stats);
        
        return stats;
    }

    // Obtenir la taille approximative de la DB
    async getStorageInfo() {
        const stats = {};
        
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            stats.storage = {
                usage: estimate.usage,
                quota: estimate.quota,
                usageInMB: (estimate.usage / 1024 / 1024).toFixed(2),
                quotaInMB: (estimate.quota / 1024 / 1024).toFixed(2),
                percentageUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2)
            };
        }
        
        // Compter les éléments dans chaque store
        try {
            const counts = await Promise.all([
                this.countRecords('pointChunks'),
                this.countRecords('poses'),
                this.countRecords('sessions'),
                this.countRecords('metadata')
            ]);
            
            stats.records = {
                pointChunks: counts[0],
                poses: counts[1],
                sessions: counts[2],
                metadata: counts[3]
            };
        } catch (error) {
            console.warn('Could not get record counts:', error);
        }
        
        return stats;
    }

    // Méthode utilitaire pour compter les enregistrements
    async countRecords(storeName) {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
