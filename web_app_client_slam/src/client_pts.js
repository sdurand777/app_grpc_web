
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');

// Import de Three.js
import * as THREE from 'three';

// Importation de OrbitControls
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Vérifiez la présence de l'objet THREE
console.log(THREE);  // Vous devriez voir l'objet THREE dans la console

// Création de la scène, de la caméra et du rendu
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

// Créer un tableau pour stocker les positions des points
let pointsGeometry = new THREE.BufferGeometry();
let pointsMaterial = new THREE.PointsMaterial({
  color: 0xff0000,  // Rouge
  size: 0.1,        // Taille des points
  sizeAttenuation: true  // Appliquer une diminution de la taille selon la distance
});

let positions = [];  // Tableau global pour stocker les positions des points

// Fonction pour ajouter des points en une seule fois
function addAllPoints(pointsList) {
  // Vider les positions existantes pour mettre à jour avec les nouvelles
  //positions = [];

  // Remplir le tableau de positions avec les coordonnées de tous les points
  pointsList.forEach((point) => {
    const x = point.getX();
    const y = point.getY();
    const z = point.getZ();
    positions.push(x, y, z);
  });

  // Mettre à jour la géométrie en une seule fois avec toutes les positions
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  // Si les points n'ont pas encore été ajoutés à la scène, les ajouter
  if (!scene.getObjectByName("points")) {
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    points.name = "points";  // Nommer l'objet pour le retrouver facilement
    scene.add(points);
  }
}

// Fonction d'animation
function animate() {
  requestAnimationFrame(animate);
  controls.update();  // Mettre à jour les contrôles
  renderer.render(scene, camera);  // Rendre la scène
}

// Crée un client gRPC-Web
const client = new SlamServiceClient('http://192.168.51.30:8080', null, null);

// Appelle le serveur pour recevoir le flux de points
const request = new Empty();

const stream = client.getPointCloud(request, {});

stream.on('data', (response) => {
  const points = response.getPointsList();
  addAllPoints(points);  // Ajouter tous les points en une seule fois
});

stream.on('error', (err) => {
  console.error('Erreur du flux:', err.message);
});

stream.on('end', () => {
  console.log('Flux terminé');
});

// Lancer l'animation
animate();
