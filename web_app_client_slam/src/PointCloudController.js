
// File: src/PointCloudController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';
import { enablePointDistanceMeasurement } from './PointDistanceMeasurement.js';
import { CameraMesh } from './CameraMesh.js'; // selon ton chemin
import { transpose16, applyPoseToMesh } from './utils.js';

export class PointCloudController {
    /**
        * @param {THREE.Scene} scene
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

            // etat du bouton de trajectory
            this.trajectoryVisible = true; // <--- ici

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


        // creation de la camera
        this.camVis = new CameraMesh(0.2);  // par exemple à l'échelle 0.2
        this.scene.add(this.camVis.mesh); 

        
        // trajectory geometry
        this.cameraTrajectory = [];
        this.trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x000080 }); // bleu marine
        this.trajectoryGeometry = new THREE.BufferGeometry();
        this.trajectoryLine = new THREE.Line(this.trajectoryGeometry, this.trajectoryMaterial);
        this.trajectoryLine.frustumCulled = false;
        this.scene.add(this.trajectoryLine);

        this.sphereMarkers = [];
        this.sphereGeometry = new THREE.SphereGeometry(0.01, 16, 16);
        this.sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff8000 }); // orange



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


    // set flag to show or not trajectory
    setTrajectoryVisible(visible) {
        this.trajectoryVisible = visible;
        if (this.trajectoryLine) this.trajectoryLine.visible = visible;
        if (this.sphereMarkers && this.sphereMarkers.length) {
            this.sphereMarkers.forEach(s => s.visible = visible);
        }
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
            const { coords, colors, poseMatrix } = e.data;
            this._updateBuffers(coords, colors, poseMatrix);
            // Optionnel : gérer la poseMatrix ici si besoin
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
            // Ajoute cette ligne juste ici :
            //this.geom.computeBoundingBox();
            //console.log(`Rendered points: ${this.writeIndex}`);

            // === LOG DE LA MATRICE DE LA DERNIÈRE POSE ===
            if (poseMatrix && poseMatrix.length === 16) {
                applyPoseToMesh(this.camVis.mesh, poseMatrix);

                // Extraire la position caméra
                const poseMatrixColMajor = transpose16(poseMatrix);

                const poseMat = new THREE.Matrix4().fromArray(poseMatrixColMajor);
                const position = new THREE.Vector3();
                position.setFromMatrixPosition(poseMat);

                // Stocker la position et mettre à jour la trajectoire
                if (this.cameraTrajectory.length === 0 || !this.cameraTrajectory[this.cameraTrajectory.length-1].equals(position)) {
                    this.cameraTrajectory.push(position.clone());

                    // Met à jour la ligne
                    const positionsArray = [];
                    this.cameraTrajectory.forEach(v => positionsArray.push(v.x, v.y, v.z));
                    this.trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsArray, 3));
                    this.trajectoryGeometry.setDrawRange(0, this.cameraTrajectory.length);

                    // Ajoute la sphère rouge
                    const sphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
                    sphere.frustumCulled = false;
                    sphere.position.copy(position);
                    sphere.visible = this.trajectoryVisible;   // <-- respecte l’état du bouton
                    this.scene.add(sphere);
                    this.sphereMarkers.push(sphere);
                }

            }


        }

        processRaw(response) {
            const raw = response.toObject();
            this.worker.postMessage({ type: 'processPointCloud', payload: raw });
        }
}
