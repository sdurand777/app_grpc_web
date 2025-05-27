// File: src/PoseController.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';
import { CameraMesh } from './CameraMesh.js';
import { transpose16, applyPoseToMesh } from './utils.js';
import { DatabaseManager } from './DatabaseManager.js';

export class PoseController {
    constructor(scene, camera, renderer, worker) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.worker = worker;

        this.db = null;
        this.sessionId = null;
        this.trajectoryIndex = 0;
        this.SAVE_INTERVAL = 10; // Sauvegarder toutes les 10 poses
        this.unsavedPoses = [];

        this.poseIndex = 0;
        this.trajectoryVisible = true;
        
        // Ajouter un seuil de distance pour éviter les doublons
        this.minDistanceThreshold = 0.001; // 1mm

        this._initGeometry();
        this._setupWorker();
    }

    // Initialiser la base de données
    async initDatabase(db) {
        this.db = db;
    }


    // Définir la session
    setSessionId(sessionId) {
        this.sessionId = sessionId;
        console.log('PoseController: Session ID set to', sessionId);
        
        // Réinitialiser les compteurs pour une nouvelle session
        this.trajectoryIndex = 0;
        this.unsavedPoses = [];
    }


    _initGeometry() {
        this.camVis = new CameraMesh(0.2);
        this.scene.add(this.camVis.mesh); 

        this.cameraTrajectory = [];
        this.trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x000080 });
        this.trajectoryGeometry = new THREE.BufferGeometry();
        this.trajectoryLine = new THREE.Line(this.trajectoryGeometry, this.trajectoryMaterial);
        this.trajectoryLine.frustumCulled = false;
        this.scene.add(this.trajectoryLine);

        this.sphereMarkers = [];
        this.sphereGeometry = new THREE.SphereGeometry(0.01, 16, 16);
        this.sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff8000 });
    }

    async initDatabase(db) {
        this.db = db;
        const metadata = await db.getMetadata('poseState');
        if (metadata) {
            this.poseIndex = metadata.poseIndex || 0;
        }
    }

    // Méthode pour vérifier si une position existe déjà
    _positionExists(newPosition) {
        return this.cameraTrajectory.some(existingPos => 
            existingPos.distanceTo(newPosition) < this.minDistanceThreshold
        );
    }

    // Méthode pour nettoyer la trajectoire avant rechargement
    _clearTrajectory() {
        // Supprimer les sphères existantes
        this.sphereMarkers.forEach(sphere => {
            this.scene.remove(sphere);
        });
        this.sphereMarkers = [];
        
        // Vider le tableau de trajectoire
        this.cameraTrajectory = [];
        
        // Réinitialiser la géométrie de ligne
        this.trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.trajectoryGeometry.setDrawRange(0, 0);
    }


    // Vider la trajectoire
    clearTrajectory() {
        // Vider les arrays de trajectoire
        if (this.cameraTrajectory) {
            this.cameraTrajectory = [];
        }
        
        // Supprimer les marqueurs de sphère
        if (this.sphereMarkers) {
            this.sphereMarkers.forEach(sphere => {
                this.scene.remove(sphere);
            });
            this.sphereMarkers = [];
        }
        
        // Réinitialiser la ligne de trajectoire
        if (this.trajectoryLine && this.trajectoryGeometry) {
            this.trajectoryGeometry.setFromPoints([]);
            this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
        }
        
        this.trajectoryIndex = 0;
        console.log('Pose trajectory cleared');
    }

    // Charger depuis une session
    async loadFromSession(sessionId) {
        if (!this.db || !sessionId) return;
        
        console.log(`Loading pose data for session: ${sessionId}`);
        
        try {
            const poses = await this.db.getPosesBySession(sessionId);
            console.log(`Found ${poses.length} poses to load`);
            
            // Réinitialiser la trajectoire
            this.clearTrajectory();
            
            for (const poseData of poses) {
                if (poseData.matrix) {
                    // Recréer la pose depuis la matrice sauvegardée
                    this._addPoseToTrajectory(poseData.matrix, poseData.position);
                }
            }
            
            console.log(`Loaded ${poses.length} poses from session ${sessionId}`);
        } catch (error) {
            console.error('Error loading poses from session:', error);
        }
    }


    async loadFromDatabase() {
        if (!this.db) return;
        
        // Nettoyer la trajectoire existante avant de charger
        this._clearTrajectory();
        
        const poses = await this.db.getAllPoses();
        poses.sort((a, b) => a.trajectoryIndex - b.trajectoryIndex);
        
        for (const pose of poses) {
            const position = new THREE.Vector3().fromArray(pose.position);
            
            // Ajouter sans vérification de doublon car on a nettoyé avant
            this.cameraTrajectory.push(position);
            
            // Créer la sphère
            const sphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
            sphere.frustumCulled = false;
            sphere.position.copy(position);
            sphere.visible = this.trajectoryVisible;
            this.scene.add(sphere);
            this.sphereMarkers.push(sphere);
        }
        
        // Mettre à jour la ligne de trajectoire
        this._updateTrajectoryLine();
        
        // Appliquer la dernière pose à la caméra
        if (poses.length > 0) {
            const lastPose = poses[poses.length - 1];
            applyPoseToMesh(this.camVis.mesh, lastPose.matrix);
        }
    }

    // Méthode séparée pour mettre à jour la ligne de trajectoire
    _updateTrajectoryLine() {
        if (this.cameraTrajectory.length > 0) {
            const positionsArray = [];
            this.cameraTrajectory.forEach(v => positionsArray.push(v.x, v.y, v.z));
            this.trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsArray, 3));
            this.trajectoryGeometry.setDrawRange(0, this.cameraTrajectory.length);
        }
    }

    setTrajectoryVisible(visible) {
        this.trajectoryVisible = visible;
        if (this.trajectoryLine) this.trajectoryLine.visible = visible;
        if (this.sphereMarkers && this.sphereMarkers.length) {
            this.sphereMarkers.forEach(s => s.visible = visible);
        }
    }

    _setupWorker() {
        this.worker.onmessage = e => {
            const { poseMatrix } = e.data;
            this._updateBuffers(poseMatrix);
        };
    }

    async _updateBuffers(poseMatrix) {
        if (poseMatrix && poseMatrix.length === 16) {
            applyPoseToMesh(this.camVis.mesh, poseMatrix);

            const poseMatrixColMajor = transpose16(poseMatrix);
            const poseMat = new THREE.Matrix4().fromArray(poseMatrixColMajor);
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(poseMat);

            // Vérification améliorée pour éviter les doublons
            if (!this._positionExists(position)) {
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

                // Mettre à jour la ligne
                this._updateTrajectoryLine();

                // Ajouter la sphère
                const sphere = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
                sphere.frustumCulled = false;
                sphere.position.copy(position);
                sphere.visible = this.trajectoryVisible;
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
