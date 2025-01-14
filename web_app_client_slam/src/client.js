
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');

// Import de Three.js
import * as THREE from 'three';

// Importation de OrbitControls
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Création de la scène, de la caméra et du rendu
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new THREE.Color("lightblue"));
document.body.appendChild(renderer.domElement);

// Positionner la caméra
camera.position.z = 5;

// Ajouter les OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);

// Matériau et géométrie pour les points
let pointsGeometry = new THREE.BufferGeometry();
let pointsMaterial = new THREE.PointsMaterial({
  size: 0.01,        // Taille des points
  vertexColors: true,  // Activer les couleurs par sommet
});

let positions = [];  // Tableau pour stocker les positions des points
let colors = [];     // Tableau pour stocker les couleurs des points

// Fonction pour ajouter des points avec des couleurs
function addPointsWithColors(coordsList, colorsList) {
  coordsList.forEach((point, index) => {
    const [x, y, z] = point;  // Coordonnées du point
    const [r, g, b] = colorsList[index];  // Couleurs (0-255)

    positions.push(x, y, z);  // Ajouter les positions au tableau
    //colors.push(r / 255, g / 255, b / 255);  // Normaliser les couleurs et ajouter au tableau
    colors.push(r, g, b);  // Normaliser les couleurs et ajouter au tableau
  });

  // Mettre à jour la géométrie des points
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Ajouter les points à la scène s'ils n'existent pas encore
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

// Appelle le serveur pour recevoir le flux de données
const request = new Empty();

const stream = client.getSlamData(request, {});

stream.on('data', (response) => {
  // Récupérer les listes de données
  const pointCloudList = response.getPointcloudlist().getPointcloudsList();
  const indexList = response.getIndexlist().getIndexList();
  const poseList = response.getPoselist().getPosesList();

  let coordsList = [];
  let colorsList = [];

  console.log(`Reçu ${pointCloudList.length} pointclouds, ${poseList.length} poses, et ${indexList.length} indices.`);

  // Traiter chaque point cloud
  pointCloudList.forEach((pointCloud) => {
    pointCloud.getPointsList().forEach((point) => {
      coordsList.push([point.getX(), point.getY(), point.getZ()]);
      colorsList.push([point.getR(), point.getG(), point.getB()]);
    });
  });

  // Ajouter les points avec les couleurs à la scène
  addPointsWithColors(coordsList, colorsList);
});

stream.on('error', (err) => {
  console.error('Erreur du flux:', err.message);
});

stream.on('end', () => {
  console.log('Flux terminé');
});

// Lancer l'animation
animate();
