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
    }

    resetView(camera, controls) {


        this.scene.traverse(obj => {
          if (obj.isPoints) {
            // drawRange.count = nombre de points effectivement affichés
            const drawRangeCount = obj.geometry.drawRange.count;
            console.log('Nombre de points affichés:', drawRangeCount);

            // Optionnel : log de la taille totale possible
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


}
