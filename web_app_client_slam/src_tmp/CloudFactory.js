// src/CloudFactory.js
import * as THREE from 'three';
import { DynamicDrawUsage } from 'three';

export class CloudFactory {
  static createCubePointCloud({ nbPoints = 5000, size = 3 }) {
    const positions = new Float32Array(nbPoints * 3);
    for (let i = 0; i < nbPoints; i++) {
      positions[3*i]     = (Math.random() - 0.5) * size;
      positions[3*i + 1] = (Math.random() - 0.5) * size;
      positions[3*i + 2] = (Math.random() - 0.5) * size;
    }
    const geom = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    attr.setUsage(DynamicDrawUsage);
    geom.setAttribute('position', attr);
    return geom;
  }
}
