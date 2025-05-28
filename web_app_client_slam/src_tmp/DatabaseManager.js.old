// DatabaseManager.js
export class DatabaseManager {
    constructor() {
        this.dbName = 'SlamVisualizerDB';
        this.version = 1;
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
                }
                
                // Store pour les poses
                if (!db.objectStoreNames.contains('poses')) {
                    const poseStore = db.createObjectStore('poses', { keyPath: 'id', autoIncrement: true });
                    poseStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Store pour les métadonnées
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    // Sauvegarde des points par chunks
    async savePointChunk(coords, colors, chunkIndex) {
        const transaction = this.db.transaction(['pointChunks'], 'readwrite');
        const store = transaction.objectStore('pointChunks');
        
        const chunk = {
            coords: coords,
            colors: colors,
            chunkIndex: chunkIndex,
            timestamp: Date.now()
        };
        
        return store.put(chunk);
    }

    // Sauvegarde d'une pose
    async savePose(poseMatrix, position, trajectoryIndex) {
        const transaction = this.db.transaction(['poses'], 'readwrite');
        const store = transaction.objectStore('poses');
        
        const pose = {
            matrix: poseMatrix,
            position: position,
            trajectoryIndex: trajectoryIndex,
            timestamp: Date.now()
        };
        
        return store.put(pose);
    }

    // Sauvegarde des métadonnées
    async saveMetadata(key, value) {
        const transaction = this.db.transaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        return store.put({ key, value });
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

    // Récupération de tous les chunks de points
    async getAllPointChunks() {
        const transaction = this.db.transaction(['pointChunks'], 'readonly');
        const store = transaction.objectStore('pointChunks');
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Récupération de toutes les poses
    async getAllPoses() {
        const transaction = this.db.transaction(['poses'], 'readonly');
        const store = transaction.objectStore('poses');
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Vider la base de données
    async clearAll() {
        const transaction = this.db.transaction(['pointChunks', 'poses', 'metadata'], 'readwrite');
        
        await Promise.all([
            transaction.objectStore('pointChunks').clear(),
            transaction.objectStore('poses').clear(),
            transaction.objectStore('metadata').clear()
        ]);
    }

    // Obtenir la taille approximative de la DB
    async getStorageInfo() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                usageInMB: (estimate.usage / 1024 / 1024).toFixed(2),
                quotaInMB: (estimate.quota / 1024 / 1024).toFixed(2)
            };
        }
        return null;
    }
}
