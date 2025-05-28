// DatabaseManager.js - Version améliorée avec gestion des chunks
export class DatabaseManager {
    constructor() {
        this.dbName = 'SlamVisualizerDB';
        this.version = 4; // Incrémenté pour la nouvelle structure
        this.db = null;
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
                
                // Store pour les chunks avec leur ID
                if (!db.objectStoreNames.contains('chunks')) {
                    const chunkStore = db.createObjectStore('chunks', { keyPath: 'chunk_id' });
                    chunkStore.createIndex('session_id', 'session_id', { unique: false });
                    chunkStore.createIndex('sequence_number', 'sequence_number', { unique: false });
                    chunkStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Store pour l'état de synchronisation
                if (!db.objectStoreNames.contains('sync_state')) {
                    const syncStore = db.createObjectStore('sync_state', { keyPath: 'session_id' });
                    syncStore.createIndex('last_sync', 'last_sync', { unique: false });
                }
                
                // Conserver les autres stores existants
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    // Sauvegarde d'un chunk
    async saveChunk(chunkData) {
        const transaction = this.db.transaction(['chunks'], 'readwrite');
        const store = transaction.objectStore('chunks');
        
        const chunk = {
            chunk_id: chunkData.chunk_id || chunkData.chunkId,
            sequence_number: chunkData.sequence_number || chunkData.sequenceNumber,
            session_id: chunkData.session_id || chunkData.sessionId,
            timestamp: chunkData.timestamp || Date.now(),
            data: chunkData // Stocker toutes les données
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(chunk);
            request.onsuccess = () => {
                console.log(`✅ Chunk saved: ${chunk.chunk_id}`);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error(`❌ Error saving chunk: ${chunk.chunk_id}`, request.error);
                reject(request.error);
            };
        });
    }

    // Récupérer tous les chunks d'une session
    async getChunksBySession(sessionId) {
        const transaction = this.db.transaction(['chunks'], 'readonly');
        const store = transaction.objectStore('chunks');
        const index = store.index('session_id');
        const request = index.getAll(sessionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const chunks = request.result.sort((a, b) => a.sequence_number - b.sequence_number);
                console.log(`Found ${chunks.length} chunks for session ${sessionId}`);
                resolve(chunks);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Récupérer les IDs des chunks existants
    async getExistingChunkIds(sessionId) {
        const chunks = await this.getChunksBySession(sessionId);
        return chunks.map(chunk => chunk.chunk_id);
    }

    // Récupérer le dernier numéro de séquence
    async getLastSequenceNumber(sessionId) {
        const chunks = await this.getChunksBySession(sessionId);
        if (chunks.length === 0) return -1;
        
        return Math.max(...chunks.map(chunk => chunk.sequence_number));
    }

    // Sauvegarder l'état de synchronisation
    async saveSyncState(sessionId, syncState) {
        const transaction = this.db.transaction(['sync_state'], 'readwrite');
        const store = transaction.objectStore('sync_state');
        
        const state = {
            session_id: sessionId,
            last_sequence_number: syncState.lastSequenceNumber,
            last_sync: Date.now(),
            total_chunks: syncState.totalChunks
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(state);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Récupérer l'état de synchronisation
    async getSyncState(sessionId) {
        const transaction = this.db.transaction(['sync_state'], 'readonly');
        const store = transaction.objectStore('sync_state');
        const request = store.get(sessionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Nettoyer les chunks d'une session
    async clearSessionChunks(sessionId) {
        const transaction = this.db.transaction(['chunks', 'sync_state'], 'readwrite');
        
        // Supprimer les chunks
        const chunkStore = transaction.objectStore('chunks');
        const chunkIndex = chunkStore.index('session_id');
        const chunkRequest = chunkIndex.getAllKeys(sessionId);
        
        await new Promise((resolve, reject) => {
            chunkRequest.onsuccess = async () => {
                const keys = chunkRequest.result;
                for (const key of keys) {
                    await chunkStore.delete(key);
                }
                resolve();
            };
            chunkRequest.onerror = reject;
        });
        
        // Supprimer l'état de sync
        const syncStore = transaction.objectStore('sync_state');
        await syncStore.delete(sessionId);
        
        console.log(`Cleared all chunks for session ${sessionId}`);
    }

    // [Garder les autres méthodes existantes pour la compatibilité]
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
                        console.warn('Session not found:', result.value);
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

    async saveMetadata(key, value) {
        const transaction = this.db.transaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value, timestamp: Date.now() });
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

    async clearAll() {
        const transaction = this.db.transaction(['chunks', 'sync_state', 'sessions', 'metadata'], 'readwrite');
        
        await Promise.all([
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('chunks').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('sync_state').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('sessions').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            }),
            new Promise((resolve, reject) => {
                const req = transaction.objectStore('metadata').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            })
        ]);
        
        console.log('Database cleared successfully');
    }

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
        
        return stats;
    }
}
