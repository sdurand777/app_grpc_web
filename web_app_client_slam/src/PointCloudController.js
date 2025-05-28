// File: src/PointCloudController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';
import { enablePointDistanceMeasurement } from './PointDistanceMeasurement.js';
import { transpose16, applyPoseToMesh } from './utils.js';
import { DataBaseManager } from './DataBaseManager.js';

export class PointCloudController {
    /**
        * @param {THREE.Scene} scene
        * @param {Worker} worker
        */
    constructor(scene, camera, renderer, worker, dbManager) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.worker = worker;
        this.maxPoints = 20000000;
        this.writeIndex = 0;
        this.displayCount = 0;

        // picking distance 
        this.pick_ratio = 0.01; // keep 1% of pcd
        this.max_pick_points = 200000; // buffer max for picking
        this.pickPositions = [] // tableau de floats
        this.pickOriginalIndices = [] // index dans le buffer principal

        // etat du bouton de trajectory
        this.trajectoryVisible = true;

        // Database manager pour sauvegarder les chunks
        // this.dbManager = new DataBaseManager();
        // this.initDatabase();

        this.dbManager = dbManager;

        // init geometry
        this._initGeometry();
        // enable picking
        this.enableDistanceMeasurement();
        // setup worker
        this._setupWorker();
    }

    // Initialise la base de données
    async initDatabase() {
        try {
            await this.dbManager.open();
            console.log('✅ Base de données initialisée');
        } catch (error) {
            console.error('❌ Erreur initialisation DB:', error);
        }
    }

    // Initialise la géométrie et les buffers
    _initGeometry() {
        this.posArr = new Float32Array(this.maxPoints * 3);
        this.colArr = new Float32Array(this.maxPoints * 3);
        this.geom = new THREE.BufferGeometry();
        this.posAttr = new THREE.BufferAttribute(this.posArr, 3).setUsage(DynamicDrawUsage);
        this.colAttr = new THREE.BufferAttribute(this.colArr, 3).setUsage(DynamicDrawUsage);
        this.posAttr.updateRange = { offset: 0, count: 0 };
        this.colAttr.updateRange = { offset: 0, count: 0 };
        this.geom.setAttribute('position', this.posAttr);
        this.geom.setAttribute('color', this.colAttr);
        this.geom.setDrawRange(0, 0);
        const mat = new THREE.PointsMaterial({ vertexColors: true, size: 0.01 });
        this.points = new THREE.Points(this.geom, mat);
        this.points.frustumCulled = false;
        this.scene.add(this.points);

        // geometry for picking
        this.pickgeom = new THREE.BufferGeometry();
        this.pickgeom.setAttribute('position', new THREE.Float32BufferAttribute([],3));
        const pickMaterial = new THREE.PointsMaterial({ size: 0.01, visible: false});
        this.pickmesh = new THREE.Points(this.pickgeom, pickMaterial);
    }

    // enable distance picking
    enableDistanceMeasurement() {
        return enablePointDistanceMeasurement(
            () => this.points,
            this.pickmesh,
            this.scene,
            this.camera,
            this.renderer,
            this.pickOriginalIndices
        );
    }

    // set pcd point size
    setPointSize(size) {
        if (this.points && this.points.material) {
            this.points.material.size = size;
            // Forcer le refresh dans certains contextes Three.js :
            this.points.material.needsUpdate = true;
        }
    }

    // Configure l'écoute du worker
    _setupWorker() {
        this.worker.onmessage = e => {
            const { coords, colors, metadata } = e.data;
            console.log(`🔧 Worker terminé: ${coords.length / 3} points traités`);
            this._updateBuffers(coords, colors);
            
            console.log("metadata : ", metadata);

            // Sauvegarder directement avec les données traitées
            if (metadata && metadata.chunkId && metadata.sequenceNumber !== null) {
                console.log("save metadata")
                this.saveChunkOptimized(coords, colors, metadata);
            }
        };
    }

    /**
        * Copie en bloc du worker vers le GPU buffer
        * @param {Float32Array} coords
        * @param {Float32Array} colors
        */
    _updateBuffers(coords, colors, poseMatrix) {
        const count = coords.length / 3;
        const offset = this.writeIndex * 3;

        console.log(`📊 Mise à jour buffer: +${count} points (total: ${this.writeIndex + count})`);

        for (let i = 0; i < count; i++) {
            const idx = this.writeIndex + i;
            this.posArr[idx * 3]     = coords[i * 3];
            this.posArr[idx * 3 + 1] = coords[i * 3 + 1];
            this.posArr[idx * 3 + 2] = coords[i * 3 + 2];
            this.colArr[idx * 3]        = colors[i * 3];
            this.colArr[idx * 3 + 1]    = colors[i * 3 + 1];
            this.colArr[idx * 3 + 2]    = colors[i * 3 + 2];
        }

        // updateRange uniquement sur la zone nouvellement remplie
        this.posAttr = this.geom.attributes.position;
        this.colAttr = this.geom.attributes.color;

        this.posAttr.updateRange.offset = this.writeIndex * 3;
        this.posAttr.updateRange.count = count * 3;
        this.posAttr.needsUpdate = true;

        this.colAttr.updateRange.offset = this.writeIndex * 3;
        this.colAttr.updateRange.count = count * 3;
        this.colAttr.needsUpdate = true;

        // update pick geom
        for (let i = 0; i < count; i++) {
            const globalIdx = this.writeIndex + i;
            // si on dépasse déjà le max, on sort
            if (this.pickOriginalIndices.length >= this.max_pick_points) break;
            // tirage au sort
            if (Math.random() < this.pick_ratio) {
                // on pompe la coord du buffer (coords = Float32Array batch)
                this.pickPositions.push(
                    coords[i*3], coords[i*3+1], coords[i*3+2]
                );
                this.pickOriginalIndices.push(globalIdx);
            }
        }

        // 4.b. Mise à jour du pickGeometry
        this.pickgeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(this.pickPositions, 3)
        );
        this.pickgeom.setDrawRange(0, this.pickPositions.length / 3);
        this.pickgeom.computeBoundingSphere();
        this.pickgeom.attributes.position.needsUpdate = true;

        // avancer l'index et mettre à jour le rendu
        this.writeIndex += count;
        this.displayCount = this.writeIndex;
        this.geom.setDrawRange(0, this.displayCount);
    }

    async processRaw(response) {
        const raw = response.toObject();
        
        // Log du contenu du chunk avant traitement
        let pointCount = 0;
        if (raw.pointcloudlist && raw.pointcloudlist.pointcloudsList) {
            raw.pointcloudlist.pointcloudsList.forEach(pointCloud => {
                if (pointCloud.pointsList) {
                    pointCount += pointCloud.pointsList.length;
                }
            });
        }
        
        console.log(`📥 Chunk en traitement: ${pointCount} points`);
        
        // Extraire les métadonnées du chunk
        const chunkId = response.getChunkId ? response.getChunkId() : null;
        const sequenceNumber = response.getSequenceNumber ? response.getSequenceNumber() : null;
        const sessionId = response.getSessionId ? response.getSessionId() : null;
        const timestamp = response.getTimestamp ? response.getTimestamp() : Date.now();
       
        
        console.log("chunkId : ", chunkId);

        // Passer les métadonnées au worker pour éviter le double traitement
        const metadata = (chunkId && sequenceNumber !== null) ? 
            { chunkId, sequenceNumber, sessionId, timestamp } : null;
        
        
        console.log("metadata : ", metadata)


        this.worker.postMessage({ 
            type: 'processPointCloud', 
            payload: raw,
            metadata: metadata
        });
    }

    // Sauvegarde optimisée avec données déjà traitées par le worker
    async saveChunkOptimized(coords, colors, metadata) {
        try {

            console.log("SaveChunkOptimized")

            // Vérifier si le chunk existe déjà
            const exists = await this.dbManager.chunkExists(metadata.chunkId);
            if (exists) {
                console.log(`⏭️ Chunk déjà en cache: ${metadata.chunkId}`);
                return;
            }

            // Sauvegarder directement les données traitées
            const chunkData = {
                chunkId: metadata.chunkId,
                sequenceNumber: metadata.sequenceNumber,
                sessionId: metadata.sessionId,
                timestamp: metadata.timestamp,
                coords: coords,
                colors: colors
            };
            

            console.log("Chunk save on the database")
            await this.dbManager.saveChunk(chunkData);
            console.log(`💾 Chunk sauvegardé: ${metadata.chunkId} (${coords.length / 3} points)`);
            
        } catch (error) {
            console.error(`❌ Erreur sauvegarde chunk ${metadata.chunkId}:`, error);
        }
    }

    // Charge et affiche des chunks depuis le cache
    async loadChunksFromCache(sessionId) {
        try {
            console.log(`🔄 Chargement chunks depuis cache pour session: ${sessionId}`);

            console.log("getChunksStats");
            const cached_chunks = await this.dbManager.getChunksStats();
            console.log("cached_chunks : ", cached_chunks);

            const chunks = await this.dbManager.getChunksBySessionOrdered(sessionId);
            
            console.log(`📦 ${chunks.length} chunks trouvés en cache`);
            if (chunks.length === 0) {
                console.log('⚠️ Aucun chunk en cache pour cette session');
                return;
            }
            
            
            // Rejouer les chunks dans l'ordre
            for (const chunk of chunks) {
                if (chunk.coords && chunk.colors) {
                    console.log(`🎬 Rejeu chunk: ${chunk.chunkId} (seq: ${chunk.sequenceNumber})`);
                    this._updateBuffers(chunk.coords, chunk.colors);
                    
                    // Petit délai pour l'affichage progressif
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            console.log('✅ Rejeu terminé');
            
        } catch (error) {
            console.error('❌ Erreur chargement cache:', error);
        }
    }

    // Obtient les statistiques d'une session
    async getSessionStats(sessionId) {
        try {
            const chunks = await this.dbManager.getChunksBySession(sessionId);
            const totalPoints = chunks.reduce((sum, chunk) => sum + (chunk.pointCount || 0), 0);
            
            const stats = {
                sessionId,
                totalChunks: chunks.length,
                totalPoints,
                sequenceNumbers: chunks.map(c => c.sequenceNumber).sort((a, b) => a - b)
            };
            
            console.log('📊 Stats session:', stats);
            return stats;
        } catch (error) {
            console.error('❌ Erreur stats session:', error);
            return null;
        }
    }

    // Nettoie les chunks d'une session
    async clearSession(sessionId) {
        try {
            const deletedCount = await this.dbManager.clearChunksBySession(sessionId);
            console.log(`🗑️ Session ${sessionId} nettoyée: ${deletedCount} chunks supprimés`);
        } catch (error) {
            console.error('❌ Erreur nettoyage session:', error);
        }
    }
}
