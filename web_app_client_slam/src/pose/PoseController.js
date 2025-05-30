
// File: src/PointCloudController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';
import { CameraMesh } from './CameraMesh.js'; // selon ton chemin
import { transpose16, applyPoseToMesh } from '../core/utils.js';

export class PoseController {
    /**
        * @param {THREE.Scene} scene
        * @param {Worker} worker
        */
        constructor(scene, camera, renderer, worker) {
            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;
            this.worker = worker;

            // etat du bouton de trajectory
            this.trajectoryVisible = true; // <--- ici

            // init geometry
            this._initGeometry();
            // setup worker
            this._setupWorker();
        }

    // Initialise la géométrie et les buffers
    _initGeometry() {
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


    // set flag to show or not trajectory
    setTrajectoryVisible(visible) {
        this.trajectoryVisible = visible;
        if (this.trajectoryLine) this.trajectoryLine.visible = visible;
        if (this.sphereMarkers && this.sphereMarkers.length) {
            this.sphereMarkers.forEach(s => s.visible = visible);
        }
    }


    // Configure l'écoute du worker
    _setupWorker() {
        this.worker.onmessage = e => {
            const { poseMatrix } = e.data;
            this._updateBuffers(poseMatrix);
            // Optionnel : gérer la poseMatrix ici si besoin
        };
    }

    /**
        * Copie en bloc du worker vers le GPU buffer
        * @param {Float32Array} coords
        * @param {Float32Array} colors
        */
        async _updateBuffers(poseMatrix) {
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

                        // Sauvegarder la pose
                        if (this.db) {
                            await this.db.savePose(
                                poseMatrix,
                                position.toArray(),
                                this.poseIndex++
                            );
                            await this.db.saveMetadata('poseState', {
                                poseIndex: this.poseIndex
                            });
                        }

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
            this.worker.postMessage({ type: 'processPoseList', payload: raw });
        }
}
