import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';

export class SceneManager {
    constructor(scene) {
        this.scene = scene;
        this.meshes = [];
        this.pointClouds = [];
        // Buffers pour le nuage de points
        this.pointCloud = null;
        this.writeIndex = 0;
        this.MAX_POINTS = 20000000; // ajuster selon besoin
    }

    // ajout générique de n'importe quel Object3D
    addObject(object3D) {
        this.scene.add(object3D);
    }

    // ou version dédiée aux nuages de points
    addPointCloud(points) {
        this.scene.add(points);
        this.pointClouds.push(points);
    }

    // Nettoyer complètement la scène
    clearScene() {
        console.log('Clearing scene...');
        
        // Parcourir tous les objets de la scène
        const objectsToRemove = [];
        
        this.scene.traverse((object) => {
            // Ne pas supprimer les lumières et helpers essentiels
            if (object !== this.scene && 
                !(object instanceof THREE.Light) && 
                !(object instanceof THREE.GridHelper) &&
                !(object instanceof THREE.AxesHelper)) {
                objectsToRemove.push(object);
            }
        });
        
        // Supprimer les objets et libérer la mémoire
        objectsToRemove.forEach(object => {
            // Nettoyer la géométrie
            if (object.geometry) {
                object.geometry.dispose();
            }
            
            // Nettoyer les matériaux
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
            
            // Retirer de la scène
            this.scene.remove(object);
        });
        
        // Réinitialiser les tableaux de référence
        this.meshes = [];
        this.pointClouds = [];
        this.pointCloud = null;
        this.writeIndex = 0;
        
        console.log(`Scene cleared: removed ${objectsToRemove.length} objects`);
    }

    // Alternative : nettoyer seulement les nuages de points
    clearPointClouds() {
        console.log('Clearing point clouds...');
        
        // Supprimer tous les nuages de points
        this.pointClouds.forEach(pointCloud => {
            if (pointCloud.geometry) {
                pointCloud.geometry.dispose();
            }
            if (pointCloud.material) {
                pointCloud.material.dispose();
            }
            this.scene.remove(pointCloud);
        });
        
        this.pointClouds = [];
        this.pointCloud = null;
        this.writeIndex = 0;
        
        // Aussi parcourir la scène pour trouver d'autres Points
        const pointsToRemove = [];
        this.scene.traverse((object) => {
            if (object.isPoints) {
                pointsToRemove.push(object);
            }
        });
        
        pointsToRemove.forEach(points => {
            if (points.geometry) points.geometry.dispose();
            if (points.material) points.material.dispose();
            this.scene.remove(points);
        });
        
        console.log(`Cleared ${pointsToRemove.length} point clouds`);
    }

    // Nettoyer les trajectoires (lignes)
    clearTrajectories() {
        console.log('Clearing trajectories...');
        
        const linesToRemove = [];
        this.scene.traverse((object) => {
            if (object.isLine) {
                linesToRemove.push(object);
            }
        });
        
        linesToRemove.forEach(line => {
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
            this.scene.remove(line);
        });
        
        console.log(`Cleared ${linesToRemove.length} trajectories`);
    }

    resetView(camera, controls) {
        this.scene.traverse(obj => {
          if (obj.isPoints) {
            // drawRange.count = nombre de points effectivement affichés
            const drawRangeCount = obj.geometry.drawRange.count;
            console.log('Nombre de points affichés:', drawRangeCount);

            // Optionnel : log de la taille totale possible
            const attr = obj.geometry.getAttribute('position');
            if (attr) {
              console.log('Nombre de points max dans le buffer:', attr.count);
            }
          }
        });

        // 1. Bounding box de toute la scène (ou change 'scene' par un objet spécifique)
        const box = new THREE.Box3().setFromObject(this.scene);
        // const boxHelper = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(5,5,5)), 0xff0000);
        // this.scene.add(boxHelper);
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            console.log('Bounding box:', new THREE.Box3().setFromObject(this.scene));
            console.log("Bounding box:", box.min, box.max, box.getSize(new THREE.Vector3()));
            console.log("maxDim:", maxDim);
            console.log("center:", center);

            // 2. Recentre le controls.target
            controls.target.copy(center);

            // 3. Place la caméra à distance pour tout voir
            const fov = camera.fov * (Math.PI / 180);
            const distance = maxDim / (2 * Math.tan(fov / 2));
            // Direction depuis le centre vers la caméra actuelle (garde l'angle de vue utilisateur)
            const direction = camera.position.clone().sub(controls.target).normalize();
            camera.position.copy(center.clone().add(direction.multiplyScalar(distance * 1.2)));

            // 4. Ajuste near/far pour la scène
            camera.near = Math.max(0.1, distance * 0.1);
            camera.far  = distance * 10;
            camera.updateProjectionMatrix();

            // 5. Regarde le centre (sécurité)
            camera.lookAt(center);

            // 6. Synchronise OrbitControls
            controls.update();
        }
    }

    // Obtenir des statistiques sur la scène
    getSceneStats() {
        let pointCount = 0;
        let meshCount = 0;
        let lineCount = 0;
        
        this.scene.traverse((object) => {
            if (object.isPoints) {
                const attr = object.geometry.getAttribute('position');
                if (attr) {
                    pointCount += object.geometry.drawRange.count || attr.count;
                }
            } else if (object.isMesh) {
                meshCount++;
            } else if (object.isLine) {
                lineCount++;
            }
        });
        
        return {
            totalPoints: pointCount,
            meshes: meshCount,
            lines: lineCount,
            totalObjects: this.scene.children.length
        };
    }
}
