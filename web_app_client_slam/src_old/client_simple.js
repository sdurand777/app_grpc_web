
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

// Positionner la caméra
camera.position.z = 5;

// Ajouter les OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);

// Créer un tableau pour stocker les sphères
let spheres = [];

// Fonction pour créer une sphère à partir des coordonnées x, y, z
function createSphere(x, y, z) {
  const geometry = new THREE.SphereGeometry(0.1, 32, 32);  // Rayon de 0.1, segments 32x32
  const material = new THREE.MeshBasicMaterial({ color: 0x00ffff });  // Cyan
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(x, y, z);  // Positionner la sphère au point (x, y, z)
  scene.add(sphere);  // Ajouter la sphère à la scène
  spheres.push(sphere);  // Ajouter à notre tableau de sphères
}


// Créer un tableau pour stocker les points
let pointsGeometry = new THREE.BufferGeometry();
let pointsMaterial = new THREE.PointsMaterial({
  color: 0xff0000,  // Cyan
  size: 0.1,        // Taille des points
  sizeAttenuation: true  // Appliquer une diminution de la taille selon la distance
});


// Créer un tableau pour stocker les positions des points
let positions = [];

// Fonction pour ajouter des points
function addPoints(x, y, z) {
  positions.push(x, y, z);
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (!scene.getObjectByName("points")) {
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    points.name = "points";  // Nommer l'objet pour le retrouver facilement
    scene.add(points);
  }
}

// Fonction d'animation
function animate() {
  requestAnimationFrame(animate);

  // Mettre à jour les contrôles pour permettre l'interaction
  controls.update();

  // Rendre la scène
  renderer.render(scene, camera);
}

// Crée un client gRPC-Web
const client = new SlamServiceClient('http://192.168.51.30:8080', null, null);

// Appelle le serveur pour recevoir le flux de points
const request = new Empty();

const stream = client.getPointCloud(request, {});

// stream.on('data', (response) => {
//   const points = response.getPointsList();
//   points.forEach((point) => {
//     const x = point.getX();
//     const y = point.getY();
//     const z = point.getZ();
//     console.log(`Point reçu: x=${x}, y=${y}, z=${z}`);
//     
//     // Créer une sphère pour chaque point
//     createSphere(x, y, z);
//   });
// });





stream.on('data', (response) => {
  const points = response.getPointsList();
  points.forEach((point) => {
    const x = point.getX();
    const y = point.getY();
    const z = point.getZ();
    //console.log(`Point reçu: x=${x}, y=${y}, z=${z}`);
    
    // Ajouter un point à la scène
    addPoints(x, y, z);
  });
});







stream.on('error', (err) => {
  console.error('Erreur du flux:', err.message);
});

stream.on('end', () => {
  console.log('Flux terminé');
});

// Lancer l'animation
animate();
