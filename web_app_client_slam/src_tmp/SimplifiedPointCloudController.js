// SimplifiedPointCloudController.js
import * as THREE from 'three';

export class SimplifiedPointCloudController {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        // Configuration
        this.maxPoints = 20000000;
        this.currentPointCount = 0;
        
        // Géométrie
        this.geometry = null;
        this.material = null;
        this.pointCloud = null;
        
        // Map des chunks traités
        this.processedChunks = new Set();
        
        this._initGeometry();
    }

    _initGeometry() {
        // Créer une géométrie dynamique
        this.geometry = new THREE.BufferGeometry();
        
        // Pré-allouer les buffers
        this.positions = new Float32Array(this.maxPoints * 3);
        this.colors = new Float32Array(this.maxPoints * 3);
        
        // Créer les attributs
        const positionAttribute = new THREE.BufferAttribute(this.positions, 3);
        const colorAttribute = new THREE.BufferAttribute(this.colors, 3);
        
        positionAttribute.setUsage(THREE.DynamicDrawUsage);
        colorAttribute.setUsage(THREE.DynamicDrawUsage);
        
        this.geometry.setAttribute('position', positionAttribute);
        this.geometry.setAttribute('color', colorAttribute);
        
        // Définir la plage de rendu initiale
        this.geometry.setDrawRange(0, 0);
        
        // Créer le matériau
        this.material = new THREE.PointsMaterial({
            vertexColors: true,
            size: 0.01,
            sizeAttenuation: true
        });
        
        // Créer le mesh de points
        this.pointCloud = new THREE.Points(this.geometry, this.material);
        this.pointCloud.frustumCulled = false;
        this.scene.add(this.pointCloud);
    }

    processChunk(chunkData, source) {
        // Extraire l'ID du chunk
        const chunkId = chunkData.chunk_id || chunkData.chunkId;
        
        // Vérifier si on a déjà traité ce chunk
        if (this.processedChunks.has(chunkId)) {
            console.log(`Chunk ${chunkId} already processed, skipping`);
            return;
        }
        
        // Extraire les données selon le format
        let pointCloudData = null;
        
        if (chunkData.pointcloudlist) {
            // Format SlamData
            pointCloudData = chunkData.pointcloudlist.pointclouds?.[0];
        } else if (chunkData.pointcloud) {
            // Format DataChunk
            pointCloudData = chunkData.pointcloud;
        } else if (chunkData.data) {
            // Format depuis le cache
            return this.processChunk(chunkData.data, source);
        }
        
        if (!pointCloudData || !pointCloudData.points) {
            console.warn('No point data in chunk:', chunkId);
            return;
        }
        
        const points = pointCloudData.points;
        const numPoints = points.length;
        
        if (this.currentPointCount + numPoints > this.maxPoints) {
            console.warn('Maximum point limit reached');
            return;
        }
        
        // Ajouter les points aux buffers
        const startIdx = this.currentPointCount * 3;
        
        for (let i = 0; i < numPoints; i++) {
            const point = points[i];
            const idx = startIdx + i * 3;
            
            // Position
            this.positions[idx] = point.x || 0;
            this.positions[idx + 1] = point.y || 0;
            this.positions[idx + 2] = point.z || 0;
            
            // Couleur (normalisée)
            this.colors[idx] = (point.r || 255) / 255;
            this.colors[idx + 1] = (point.g || 255) / 255;
            this.colors[idx + 2] = (point.b || 255) / 255;
        }
        
        // Mettre à jour les attributs
        const positionAttribute = this.geometry.attributes.position;
        const colorAttribute = this.geometry.attributes.color;
        
        positionAttribute.updateRange.offset = startIdx;
        positionAttribute.updateRange.count = numPoints * 3;
        positionAttribute.needsUpdate = true;
        
        colorAttribute.updateRange.offset = startIdx;
        colorAttribute.updateRange.count = numPoints * 3;
        colorAttribute.needsUpdate = true;
        
        // Mettre à jour le nombre de points et la plage de rendu
        this.currentPointCount += numPoints;
        this.geometry.setDrawRange(0, this.currentPointCount);
        
        // Marquer le chunk comme traité
        this.processedChunks.add(chunkId);
        
        // Calculer la bounding sphere si nécessaire
        if (this.currentPointCount < 10000 || this.currentPointCount % 10000 === 0) {
            this.geometry.computeBoundingSphere();
        }
        
        console.log(`Processed chunk ${chunkId} from ${source}: ${numPoints} points, total: ${this.currentPointCount}`);
    }

    setPointSize(size) {
        if (this.material) {
            this.material.size = size;
            this.material.needsUpdate = true;
        }
    }

    clear() {
        this.currentPointCount = 0;
        this.processedChunks.clear();
        this.geometry.setDrawRange(0, 0);
        
        // Réinitialiser les buffers
        this.positions.fill(0);
        this.colors.fill(0);
        
        const positionAttribute = this.geometry.attributes.position;
        const colorAttribute = this.geometry.attributes.color;
        
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
        
        console.log('Point cloud cleared');
    }

    getStats() {
        return {
            totalPoints: this.currentPointCount,
            chunksProcessed: this.processedChunks.size,
            memoryUsage: (this.currentPointCount * 6 * 4 / 1024 / 1024).toFixed(2) + ' MB'
        };
    }
}
