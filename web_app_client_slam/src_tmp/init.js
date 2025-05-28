// File: src/init.js
import * as THREE from 'three';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene() {
    const scene = new THREE.Scene();
    return scene;
}

export function createCamera() {
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 0, 5);
    return camera;
}

export function createRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color("lightblue"));
    document.body.appendChild(renderer.domElement);
    return renderer;
}

export function createControls(camera, domElement) {
    const controls = new OrbitControls(camera, domElement);
    //controls.enableDamping = true;
    return controls;
}

export function createStats() {
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    return stats;
}
