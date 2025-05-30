// DataBaseManager.js

export class DataBaseManager {
    constructor(dbName = 'SessionDB') {
        this.dbName = dbName;
        this.sessionStoreName = 'sessionInfo';
        this.chunksStoreName = 'chunks';
        this.db = null;
    }

    // Ouvre la base IndexedDB avec les deux stores
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2); // Version 2 pour ajouter le store chunks

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store pour les infos de session (existant)
                if (!db.objectStoreNames.contains(this.sessionStoreName)) {
                    db.createObjectStore(this.sessionStoreName, { keyPath: 'id' });
                }
                
                // Nouveau store pour les chunks
                if (!db.objectStoreNames.contains(this.chunksStoreName)) {
                    const chunksStore = db.createObjectStore(this.chunksStoreName, { keyPath: 'chunkId' });
                    
                    // Index pour faciliter les recherches
                    chunksStore.createIndex('sequenceNumber', 'sequenceNumber', { unique: false });
                    chunksStore.createIndex('sessionId', 'sessionId', { unique: false });
                    chunksStore.createIndex('sessionSequence', ['sessionId', 'sequenceNumber'], { unique: true });
                    
                    console.log('📦 Store chunks créé avec index');
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('🔗 Base de données ouverte');
                resolve();
            };

            request.onerror = (event) => {
                reject(`Erreur d'ouverture IndexedDB: ${event.target.errorCode}`);
            };
        });
    }

    // === GESTION DES SESSIONS (code existant) ===
    
    // Sauvegarde une sessionInfo (clé fixe 'current')
    async saveSessionInfo(sessionInfo) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.sessionStoreName], 'readwrite');
            const store = transaction.objectStore(this.sessionStoreName);
            const request = store.put({ id: 'current', data: sessionInfo });

            request.onsuccess = () => {
                console.log('💾 Session info sauvegardée dans IndexedDB.');
                resolve();
            };

            request.onerror = (event) => {
                reject(`Erreur de sauvegarde: ${event.target.errorCode}`);
            };
        });
    }

    // Récupère la sessionInfo
    async getSessionInfo() {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.sessionStoreName], 'readonly');
            const store = transaction.objectStore(this.sessionStoreName);
            const request = store.get('current');

            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log('📤 Session info récupérée depuis IndexedDB.');
                    resolve(result.data);
                } else {
                    console.warn('⚠️ Aucune session info trouvée en cache.');
                    resolve(null);
                }
            };

            request.onerror = (event) => {
                reject(`Erreur de lecture: ${event.target.errorCode}`);
            };
        });
    }

    // Supprime la sessionInfo
    async clearSessionInfo() {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.sessionStoreName], 'readwrite');
            const store = transaction.objectStore(this.sessionStoreName);
            const request = store.delete('current');

            request.onsuccess = () => {
                console.log('🗑️ Session info supprimée du cache.');
                resolve();
            };

            request.onerror = (event) => {
                reject(`Erreur de suppression: ${event.target.errorCode}`);
            };
        });
    }

    // === GESTION DES CHUNKS ===

    // Sauvegarde un chunk avec ses données de pointcloud
    async saveChunk(chunkData) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readwrite');
            const store = transaction.objectStore(this.chunksStoreName);
            
            // Structure du chunk à sauvegarder
            const chunkRecord = {
                chunkId: chunkData.chunkId,
                sequenceNumber: chunkData.sequenceNumber,
                sessionId: chunkData.sessionId,
                timestamp: chunkData.timestamp || Date.now(),
                coords: chunkData.coords, // Float32Array
                colors: chunkData.colors, // Float32Array
                pointCount: chunkData.coords ? chunkData.coords.length / 3 : 0,
                savedAt: Date.now()
            };

            const request = store.put(chunkRecord);

            request.onsuccess = () => {
                console.log(`💾 Chunk sauvegardé: ${chunkData.chunkId} (seq: ${chunkData.sequenceNumber})`);
                resolve();
            };

            request.onerror = (event) => {
                reject(`Erreur sauvegarde chunk: ${event.target.errorCode}`);
            };
        });
    }

    // Récupère un chunk par son ID
    async getChunk(chunkId) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readonly');
            const store = transaction.objectStore(this.chunksStoreName);
            const request = store.get(chunkId);

            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`📤 Chunk récupéré: ${chunkId}`);
                    resolve(result);
                } else {
                    console.warn(`⚠️ Chunk non trouvé: ${chunkId}`);
                    resolve(null);
                }
            };

            request.onerror = (event) => {
                reject(`Erreur lecture chunk: ${event.target.errorCode}`);
            };
        });
    }

    // Récupère tous les chunks d'une session
    async getChunksBySession(sessionId) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readonly');
            const store = transaction.objectStore(this.chunksStoreName);
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);

            request.onsuccess = (event) => {
                const chunks = event.target.result;
                console.log(`📤 ${chunks.length} chunks récupérés pour session: ${sessionId}`);
                resolve(chunks);
            };

            request.onerror = (event) => {
                reject(`Erreur lecture chunks par session: ${event.target.errorCode}`);
            };
        });
    }


    // Pour DataBaseManager.js, ajoutez cette méthode pour récupérer tous les chunks :
    async getAllChunksOrdered() {
        try {
            await this.open();
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['chunks'], 'readonly');
                const store = transaction.objectStore('chunks');
                const index = store.index('sequenceNumber');
                const request = index.getAll();
                
                request.onsuccess = () => {
                    const chunks = request.result;
                    // Trier par sequenceNumber
                    chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                    console.log(`📦 ${chunks.length} chunks récupérés (tous)`)
                    resolve(chunks);
                };
                
                request.onerror = () => {
                    console.error('❌ Erreur récupération chunks:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Erreur getAllChunksOrdered:', error);
            throw error;
        }
    }


    // Récupère les chunks d'une session dans l'ordre des sequence numbers
    async getChunksBySessionOrdered(sessionId) {
        const chunks = await this.getChunksBySession(sessionId);
        return chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    }

    // Récupère un chunk par sessionId et sequenceNumber
    async getChunkBySequence(sessionId, sequenceNumber) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readonly');
            const store = transaction.objectStore(this.chunksStoreName);
            const index = store.index('sessionSequence');
            const request = index.get([sessionId, sequenceNumber]);

            request.onsuccess = (event) => {
                const result = event.target.result;
                if (result) {
                    console.log(`📤 Chunk récupéré: session ${sessionId}, seq ${sequenceNumber}`);
                    resolve(result);
                } else {
                    console.warn(`⚠️ Chunk non trouvé: session ${sessionId}, seq ${sequenceNumber}`);
                    resolve(null);
                }
            };

            request.onerror = (event) => {
                reject(`Erreur lecture chunk par séquence: ${event.target.errorCode}`);
            };
        });
    }

    // Supprime tous les chunks d'une session
    async clearChunksBySession(sessionId) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readwrite');
            const store = transaction.objectStore(this.chunksStoreName);
            const index = store.index('sessionId');
            const request = index.openCursor(IDBKeyRange.only(sessionId));

            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`🗑️ ${deletedCount} chunks supprimés pour session: ${sessionId}`);
                    resolve(deletedCount);
                }
            };

            request.onerror = (event) => {
                reject(`Erreur suppression chunks: ${event.target.errorCode}`);
            };
        });
    }

    // Obtient des statistiques sur les chunks stockés
    async getChunksStats() {


        console.log("getChunksStats Method");
        if (!this.db) 
        {
            console.log("open database");
            await this.open();
        }
        else
        {
            console.log("Found existing DataBase proceeding");
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readonly');
            const store = transaction.objectStore(this.chunksStoreName);
            const request = store.openCursor();

            const stats = {
                totalChunks: 0,
                totalPoints: 0,
                sessions: new Set(),
                oldestTimestamp: null,
                newestTimestamp: null,
                totalSize: 0
            };

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const chunk = cursor.value;
                    stats.totalChunks++;
                    stats.totalPoints += chunk.pointCount || 0;
                    stats.sessions.add(chunk.sessionId);
                    
                    if (!stats.oldestTimestamp || chunk.timestamp < stats.oldestTimestamp) {
                        stats.oldestTimestamp = chunk.timestamp;
                    }
                    if (!stats.newestTimestamp || chunk.timestamp > stats.newestTimestamp) {
                        stats.newestTimestamp = chunk.timestamp;
                    }

                    // Estimation de la taille (coords + colors)
                    if (chunk.coords && chunk.colors) {
                        stats.totalSize += chunk.coords.byteLength + chunk.colors.byteLength;
                    }

                    cursor.continue();
                } else {
                    stats.sessions = Array.from(stats.sessions);
                    stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
                    
                    console.log('📊 Statistiques chunks:', stats);
                    resolve(stats);
                }
            };

            request.onerror = (event) => {
                reject(`Erreur lecture stats: ${event.target.errorCode}`);
            };
        });
    }

    // Vérifie si un chunk existe déjà
    async chunkExists(chunkId) {
        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readonly');
            const store = transaction.objectStore(this.chunksStoreName);
            const request = store.count(chunkId);

            request.onsuccess = (event) => {
                resolve(event.target.result > 0);
            };

            request.onerror = (event) => {
                reject(`Erreur vérification chunk: ${event.target.errorCode}`);
            };
        });
    }

    // Nettoie tous les chunks (utile pour debug)
    async clearAllChunks() {

        console.log("clearAllChunks method");

        if (!this.db) await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunksStoreName], 'readwrite');
            const store = transaction.objectStore(this.chunksStoreName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('🗑️ Tous les chunks supprimés');
                resolve();
            };

            request.onerror = (event) => {
                reject(`Erreur nettoyage chunks: ${event.target.errorCode}`);
            };
        });
    }
}
