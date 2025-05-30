
// utils.js
import * as THREE from 'three';

/**
 * Transpose une matrice 4x4 (16 floats) row-major (Python, numpy)
 * en column-major (Three.js, WebGL).
 * @param {number[]} m - Tableau de 16 nombres
 * @returns {number[]} - Tableau transposé
 */
export function transpose16(m) {
    return [
        m[0], m[4], m[8],  m[12],
        m[1], m[5], m[9],  m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15],
    ];
}

/**
 * Applique une pose 4x4 à un mesh Three.js
 * @param {THREE.Object3D} mesh
 * @param {number[]} poseMatrix - Tableau de 16 floats (row-major)
 */
export function applyPoseToMesh(mesh, poseMatrix) {
    if (!poseMatrix || poseMatrix.length !== 16) return;

    // Transpose Python row-major to column-major for Three.js
    const poseMatrixColMajor = transpose16(poseMatrix);

    // Crée une matrice Three.js pour la pose reçue
    const poseMat = new THREE.Matrix4().fromArray(poseMatrixColMajor);

    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(poseMat);
}
