
// File: src/PointCloudController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';

export class PointCloudController {
    /**
        * @param {THREE.Scene} scene
        * @param {Worker} worker
        */
        constructor(scene, worker) {
            this.scene = scene;
            this.worker = worker;
            this.maxPoints = 20000000;
            this.writeIndex = 0;
            this.displayCount = 0;

            // picking distance 

            this.pick_ratio = 0.01; // keep 1% of pcd
            this.max_pick_points = 200000; // buffer max for picking
            this.pickPositions = [] // tableau de floats
            this.pickOriginalIndices = [] // index dans le buffer principal


            this._initGeometry();
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

    // Configure l'écoute du worker
    _setupWorker() {
        this.worker.onmessage = e => {
            const { coords, colors, poseMatrix } = e.data;
            this._updateBuffers(coords, colors);
            // Optionnel : gérer la poseMatrix ici si besoin
        };
    }

    /**
        * Copie en bloc du worker vers le GPU buffer
        * @param {Float32Array} coords
        * @param {Float32Array} colors
        */
        _updateBuffers(coords, colors) {
            const count = coords.length / 3;
            const offset = this.writeIndex * 3;

            // // copie en bloc
            // this.posAttr.array.set(coords, offset);
            // this.colAttr.array.set(colors, offset);
            //
                // // mise à jour des plages
            // this.posAttr.updateRange = { offset, count: coords.length };
            // this.colAttr.updateRange = { offset, count: colors.length };
            // this.posAttr.needsUpdate = true;
            // this.colAttr.needsUpdate = true;

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
            pickGeometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(pickPositions, 3)
            );
            pickGeometry.setDrawRange(0, pickPositions.length / 3);
            pickGeometry.computeBoundingSphere();
            pickGeometry.attributes.position.needsUpdate = true;





            // avancer l'index et mettre à jour le rendu
            this.writeIndex += count;
            this.displayCount = this.writeIndex;
            this.geom.setDrawRange(0, this.displayCount);
            // Ajoute cette ligne juste ici :
            //this.geom.computeBoundingBox();
            //console.log(`Rendered points: ${this.writeIndex}`);
        }

    /**
        * Poster la réponse SLAM brute au worker
        * @param {Object} response gRPC-Web response
        */
        processRaw(response) {
            const raw = response.toObject();
            this.worker.postMessage({ type: 'processPointCloud', payload: raw });
        }
}
