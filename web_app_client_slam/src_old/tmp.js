
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
//const { Empty } = require('./pointcloud_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');

// Import de Three.js
import * as THREE from 'three';

// Importation de OrbitControls
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Vérifiez la présence de l'objet THREE
console.log(THREE);  // Vous devriez voir l'objet THREE dans la console

// Test de création d'une scène
const scene = new THREE.Scene();
console.log(scene);  // Vous devriez voir une instance de THREE.Scene dans la console

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new THREE.Color("lightblue"));
document.body.appendChild(renderer.domElement);

// Ajouter un cube à la scène
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Positionner la caméra
camera.position.z = 5;

// Ajouter les OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);

// Fonction d'animation
function animate() {
  requestAnimationFrame(animate);

  // Faire tourner le cube
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}


animate();



// Crée un client gRPC-Web
//const client = new SlamServiceClient('http://localhost:8080', null, null);
const client = new SlamServiceClient('http://192.168.51.30:8080', null, null);

// Appelle le serveur pour recevoir le flux de points
const request = new Empty();

const stream = client.getPointCloud(request, {});

stream.on('data', (response) => {
    const points = response.getPointsList();
    points.forEach((point) => {
        console.log(`Point reçu: x=${point.getX()}, y=${point.getY()}, z=${point.getZ()}`);
    });
});

stream.on('error', (err) => {
    console.error('Erreur du flux:', err.message);
});

stream.on('end', () => {
    console.log('Flux terminé');
});
