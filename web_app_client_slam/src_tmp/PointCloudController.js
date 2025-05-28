// File: src/PointCloudController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';
import { enablePointDistanceMeasurement } from './PointDistanceMeasurement.js';
import { CameraMesh } from './CameraMesh.js'; // selon ton chemin
import { transpose16, applyPoseToMesh } from './utils.js';
import { DatabaseManager } from './DatabaseManager.js';

export class PointCloudController {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {THREE.WebGLRenderer} renderer
     * @param {Worker} worker
     */
    constructor(scene, camera, renderer, worker) {
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

        // Database et sauvegarde
        this.db = null;
        this.sessionId = null;
        this.chunkIndex = 0;
        this.SAVE_INTERVAL = 2000; // Sauvegarde toutes les 5000 points
        this.unsavedPoints = 0;
        this.tempBuffer = { coords: [], colors: [] }; // Buffer temporaire pour la sauvegarde

        // etat du bouton de trajectory
        this.trajectoryVisible = true;

        // init geometry
        this._initGeometry();
        // enable picking
        this.enableDistanceMeasurement();
        // setup worker
        this._setupWorker();
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

    // Initialiser la base de données
    async initDatabase(db) {
        this.db = db;
        // La session sera définie par le StreamManager
        console.log('PointCloudController: Database initialized');
    }

    // Définir la session ID
    setSessionId(sessionId) {
        this.sessionId = sessionId;
        console.log('PointCloudController: Session ID set to', sessionId);
        
        // Réinitialiser les compteurs pour une nouvelle session
        this.chunkIndex = 0;
        this.unsavedPoints = 0;
        this.tempBuffer = { coords: [], colors: [] };
    }

    // Charger les données d'une session
    async loadFromSession(sessionId) {
        if (!this.db || !sessionId) return;
        
        console.log(`Loading point cloud data for session: ${sessionId}`);
        
        try {
            const chunks = await this.db.getPointChunksBySession(sessionId);
            console.log(`Found ${chunks.length} chunks to load`);
            
            // Réinitialiser les buffers
            this.writeIndex = 0;
            this.displayCount = 0;
            
            for (const chunk of chunks) {
                const coords = chunk.coords;
                const colors = chunk.colors;
                const count = coords.length / 3;
                
                // Copier directement dans les buffers
                const offset = this.writeIndex * 3;
                this.posArr.set(coords, offset);
                this.colArr.set(colors, offset);
                
                this.writeIndex += count;
            }
            
            // Mettre à jour l'affichage
            if (this.writeIndex > 0) {
                this.displayCount = this.writeIndex;
                this.geom.setDrawRange(0, this.displayCount);
                this.posAttr.needsUpdate = true;
                this.colAttr.needsUpdate = true;
                
                // Reconstruire le picking geometry
                this._rebuildPickingGeometry();
                
                console.log(`Loaded ${this.displayCount} points from session ${sessionId}`);
            }
        } catch (error) {
            console.error('Error loading from session:', error);
        }
    }

    // Reconstruire la géométrie de picking après chargement
    _rebuildPickingGeometry() {
        this.pickPositions = [];
        this.pickOriginalIndices = [];
        
        // Échantillonner les points chargés pour le picking
        for (let i = 0; i < this.writeIndex && this.pickOriginalIndices.length < this.max_pick_points; i++) {
            if (Math.random() < this.pick_ratio) {
                const idx = i * 3;
                this.pickPositions.push(
                    this.posArr[idx],
                    this.posArr[idx + 1],
                    this.posArr[idx + 2]
                );
                this.pickOriginalIndices.push(i);
            }
        }
        
        this.pickgeom.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(this.pickPositions, 3)
        );
        this.pickgeom.setDrawRange(0, this.pickPositions.length / 3);
        this.pickgeom.computeBoundingSphere();
    }

    // Vider la scène
    clearScene() {
        this.writeIndex = 0;
        this.displayCount = 0;
        this.pickPositions = [];
        this.pickOriginalIndices = [];
        this.tempBuffer = { coords: [], colors: [] };
        this.unsavedPoints = 0;
        this.chunkIndex = 0;
        
        // Réinitialiser les buffers
        this.posArr.fill(0);
        this.colArr.fill(0);
        
        // Mettre à jour la géométrie
        this.geom.setDrawRange(0, 0);
        this.posAttr.needsUpdate = true;
        this.colAttr.needsUpdate = true;
        
        // Réinitialiser la géométrie de picking
        this.pickgeom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.pickgeom.setDrawRange(0, 0);
        
        console.log('Point cloud scene cleared');
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
            const { coords, colors } = e.data;
            this._updateBuffers(coords, colors);
        };
    }

    /**
     * Copie en bloc du worker vers le GPU buffer avec sauvegarde
     * @param {Float32Array} coords
     * @param {Float32Array} colors
     */
    async _updateBuffers(coords, colors) {
        const count = coords.length / 3;
        const offset = this.writeIndex * 3;

        // Copier dans les buffers GPU
        for (let i = 0; i < count; i++) {
            const idx = this.writeIndex + i;
            this.posArr[idx * 3]     = coords[i * 3];
            this.posArr[idx * 3 + 1] = coords[i * 3 + 1];
            this.posArr[idx * 3 + 2] = coords[i * 3 + 2];
            this.colArr[idx * 3]     = colors[i * 3];
            this.colArr[idx * 3 + 1] = colors[i * 3 + 1];
            this.colArr[idx * 3 + 2] = colors[i * 3 + 2];
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

        // Mise à jour du pickGeometry
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

        // Gestion de la sauvegarde
        this.unsavedPoints += count;
        
        // Ajouter les points au buffer temporaire
        for (let i = 0; i < count; i++) {
            this.tempBuffer.coords.push(
                coords[i * 3], 
                coords[i * 3 + 1], 
                coords[i * 3 + 2]
            );
            this.tempBuffer.colors.push(
                colors[i * 3], 
                colors[i * 3 + 1], 
                colors[i * 3 + 2]
            );
        }
        
        // Sauvegarder par chunks si on a assez de points ET une session valide
        if (this.db && this.sessionId && this.tempBuffer.coords.length >= this.SAVE_INTERVAL * 3) {
            const chunkCoords = new Float32Array(this.tempBuffer.coords);
            const chunkColors = new Uint8Array(this.tempBuffer.colors);
            
            console.log(`💾 Saving chunk ${this.chunkIndex} (${chunkCoords.length / 3} points) for session ${this.sessionId}`);
            
            try {
                await this.db.savePointChunk(chunkCoords, chunkColors, this.chunkIndex++, this.sessionId);
                
                // Vider le buffer temporaire après sauvegarde réussie
                this.tempBuffer = { coords: [], colors: [] };
                this.unsavedPoints = 0;
            } catch (error) {
                console.error('Error saving point chunk:', error);
            }
        }
    }

    // Forcer la sauvegarde des points en attente
    async flush() {
        if (this.db && this.sessionId && this.tempBuffer.coords.length > 0) {
            const chunkCoords = new Float32Array(this.tempBuffer.coords);
            const chunkColors = new Uint8Array(this.tempBuffer.colors);
            
            console.log(`💾 Flushing ${chunkCoords.length / 3} points for session ${this.sessionId}`);
            
            try {
                await this.db.savePointChunk(chunkCoords, chunkColors, this.chunkIndex++, this.sessionId);
                this.tempBuffer = { coords: [], colors: [] };
                this.unsavedPoints = 0;
            } catch (error) {
                console.error('Error flushing point chunk:', error);
            }
        }
    }

    // Traiter les données brutes
    processRaw(response, sessionId) {
        // Mettre à jour le sessionId si fourni
        if (sessionId && sessionId !== this.sessionId) {
            this.setSessionId(sessionId);
        }
        
        const raw = response.toObject ? response.toObject() : response;
        this.worker.postMessage({ type: 'processPointCloud', payload: raw });
    }

    // Obtenir des statistiques
    getStats() {
        return {
            totalPoints: this.displayCount,
            sessionId: this.sessionId,
            chunksStored: this.chunkIndex,
            unsavedPoints: this.unsavedPoints,
            bufferUsage: (this.displayCount / this.maxPoints * 100).toFixed(2) + '%'
        };
    }
}
