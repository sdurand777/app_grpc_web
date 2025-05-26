
import * as THREE from 'three';

const CAM_POINTS = [
    [ 0,   0,   0],
    [-1,  -1, 1.5],
    [ 1,  -1, 1.5],
    [ 1,   1, 1.5],
    [-1,   1, 1.5],
    [-0.5, 1, 1.5],
    [ 0.5, 1, 1.5],
    [ 0, 1.2, 1.5]
];

const CAM_LINES = [
    [1,2], [2,3], [3,4], [4,1], [1,0], [0,2], [3,0], [0,4], [5,7], [7,6]
];

export class CameraMesh {
    /**
     * @param {number} scale
     * @param {THREE.Color | number | string} color
     */
    constructor(scale = 1, color = 0x00ff00) {
        this.scale = scale;
        this.color = color;
        this.mesh = this._createMesh();
    }

    _createMesh() {
        // Création des points
        const points = CAM_POINTS.map(
            p => new THREE.Vector3(p[0] * this.scale, p[1] * this.scale, p[2] * this.scale)
        );
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Ajout des lignes
        const indices = [];
        CAM_LINES.forEach(line => {
            indices.push(line[0], line[1]);
        });
        geometry.setIndex(indices);

        // Matériau ligne
        const material = new THREE.LineBasicMaterial({ color: this.color });

        // Mesh final
        return new THREE.LineSegments(geometry, material);
    }

    /**
     * Remet à l'échelle le mesh (optionnel)
     * @param {number} scale
     */
    setScale(scale) {
        this.scale = scale;
        // Retire l'ancien mesh du parent si besoin
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        // Recrée le mesh
        this.mesh = this._createMesh();
    }
}
