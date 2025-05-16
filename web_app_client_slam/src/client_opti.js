
// ==== IMPORTS ET INITIALISATION ====
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==== THREE.JS SCÈNE, CAMÉRA, RENDERER ====
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(new THREE.Color("lightblue"));
document.body.appendChild(renderer.domElement);

// ==== STATS ====
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

camera.position.z = 5;
const controls = new OrbitControls(camera, renderer.domElement);

// ==== BUFFER PRÉ-ALLOUÉ POUR LE POINT CLOUD ====
const MAX_POINTS = 20000000;
const positions = new Float32Array(MAX_POINTS * 3);
const colors = new Float32Array(MAX_POINTS * 3);

// Initialisation explicite des BufferAttributes avec updateRange
const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
const colorAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
positionAttr.updateRange = { offset: 0, count: 0 };   // << ADAPTATION updateRange
colorAttr.updateRange = { offset: 0, count: 0 };      // << ADAPTATION updateRange

const pointsGeometry = new THREE.BufferGeometry();
pointsGeometry.setAttribute('position', positionAttr);
pointsGeometry.setAttribute('color', colorAttr);

const pointsMaterial = new THREE.PointsMaterial({ size: 0.01, vertexColors: true });
const pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
scene.add(pointsMesh);

let pointCount = 0;

// ==== WORKER INLINE AVEC BLOB ====
const workerScript = `
self.onmessage = function (event) {
    const { type, payload } = event.data;
    if (type === 'grpc_points') {
        // Ici, on suppose que payload est déjà "toObject" côté main thread
        const obj = payload;
        const coordsList = [];
        const colorsList = [];
        if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
            obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
                if (pointCloud.pointsList) {
                    pointCloud.pointsList.forEach((point) => {
                        coordsList.push(point.x, point.y, point.z);
                        colorsList.push(point.r, point.g, point.b);
                    });
                }
            });
        }
        // On transfère les buffers au main thread (très rapide)
        const coordsArray = new Float32Array(coordsList);
        const colorsArray = new Float32Array(colorsList);
        self.postMessage(
            {
                coords: coordsArray,
                colors: colorsArray
            },
            [coordsArray.buffer, colorsArray.buffer]
        );
    }
};
`;

// Création du worker à partir d'un blob
const workerBlob = new Blob([workerScript], { type: "application/javascript" });
const worker = new Worker(URL.createObjectURL(workerBlob));

// // ==== RECEPTION DES DONNÉES DU WORKER ====
// worker.onmessage = function (event) {
//     const { coords, colors: batchColors} = event.data;
//     const newPoints = coords.length / 3;
//     if (pointCount + newPoints > MAX_POINTS) {
//         console.warn('Nombre de points max atteint, on n\'affiche plus');
//         return;
//     }
//     // Copie dans les buffers WebGL pré-alloués
//     positions.set(coords, pointCount * 3);
//     colors.set(batchColors, pointCount * 3);
//
//     // Mise à jour partielle du buffer avec updateRange << ADAPTATION updateRange
//     pointsGeometry.attributes.position.updateRange.offset = pointCount * 3;
//     pointsGeometry.attributes.position.updateRange.count = coords.length;
//     pointsGeometry.attributes.position.needsUpdate = true;
//
//     pointsGeometry.attributes.color.updateRange.offset = pointCount * 3;
//     pointsGeometry.attributes.color.updateRange.count = batchColors.length;
//     pointsGeometry.attributes.color.needsUpdate = true;
//
//     pointCount += newPoints;
//     pointsGeometry.setDrawRange(0, pointCount);
//
//     // Optionnel : log si besoin
//     // if (pointCount % 500000 < newPoints) console.log(\`pointCount: \${pointCount} / \${MAX_POINTS}\`);
// };

// Choisis ton nombre max de points à afficher
const MAX_DISPLAY_POINTS = 2000000;
let writeIndex = 0;
let displayCount = 0;

worker.onmessage = function (event) {
    const { coords, colors: batchColors} = event.data;
    const newPoints = coords.length / 3;
    for (let i = 0; i < newPoints; i++) {
        const idx = (writeIndex + i) % MAX_DISPLAY_POINTS;
        positions[idx * 3]     = coords[i * 3];
        positions[idx * 3 + 1] = coords[i * 3 + 1];
        positions[idx * 3 + 2] = coords[i * 3 + 2];
        colors[idx * 3]        = batchColors[i * 3];
        colors[idx * 3 + 1]    = batchColors[i * 3 + 1];
        colors[idx * 3 + 2]    = batchColors[i * 3 + 2];
    }
    writeIndex = (writeIndex + newPoints) % MAX_DISPLAY_POINTS;
    displayCount = Math.min(displayCount + newPoints, MAX_DISPLAY_POINTS);

    pointsGeometry.setDrawRange(0, displayCount);

    // Ici, updateRange ne sert à rien, car tu tournes en boucle sur tout le buffer
    pointsGeometry.attributes.position.needsUpdate = true;
    pointsGeometry.attributes.color.needsUpdate = true;
};

// ==== GRPC-WEB - RÉCEPTION DES POINTS ====
const client = new SlamServiceClient('http://192.168.51.30:8080', null, null);
const request = new Empty();
const stream = client.getSlamData(request, {});

stream.on('data', (response) => {
    // On sérialise le message gRPC en JS pur pour le worker
    worker.postMessage({ type: 'grpc_points', payload: response.toObject() });
});

stream.on('error', (err) => {
    console.error('Erreur du flux:', err.message);
});
stream.on('end', () => {
    console.log('Flux terminé');
});

// ==== BOUCLE DE RENDU (~30 FPS) ====
let lastRenderTime = 0;
function animate(time) {
    stats.begin();
    requestAnimationFrame(animate);
    if (time - lastRenderTime < 1000 / 60) {
        stats.end();
        return;
    }
    lastRenderTime = time;

    controls.update();
    renderer.render(scene, camera);
    stats.end();
}
animate();

// ==== RESIZE EVENT ====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

