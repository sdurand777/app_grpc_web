
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


// Juste après : const renderer = new THREE.WebGLRenderer();
(function checkGPU() {
    try {
        const gl = renderer.getContext();
        // Essaye d'activer l'extension pour obtenir le nom du GPU réel
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
            const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
            const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
            console.log(
                `%c[Three.js GPU Check]%c Vendor: %c${vendor}%c | Renderer: %c${gpu}`,
                'color: #1abc9c; font-weight: bold;',
                '',
                'color: #3498db; font-weight: bold;',
                '',
                'color: #e67e22; font-weight: bold;'
            );
            if (
                /software|swiftshader|basic render/i.test(gpu) ||
                /software|swiftshader|basic render/i.test(vendor)
            ) {
                console.warn("[Three.js GPU Check] ⚠️ Attention : vous êtes en mode RENDU LOGICIEL (pas d'accélération GPU)");
            } else {
                console.log("[Three.js GPU Check] ✅ Accélération GPU détectée");
            }
        } else {
            // Fallback : extension non disponible
            const fallback = gl.getParameter(gl.RENDERER);
            console.log(
                "[Three.js GPU Check] Extension WEBGL_debug_renderer_info non disponible, renderer =",
                fallback
            );
        }
    } catch (e) {
        console.error("[Three.js GPU Check] Impossible de détecter le GPU :", e);
    }
})();



// ==== STATS ====
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// Ajout du compteur HTML (idéalement tout en haut de ton script principal)
const pointCountDiv = document.createElement('div');
pointCountDiv.style.position = 'absolute';
pointCountDiv.style.top = '10px';
pointCountDiv.style.right = '10px';
pointCountDiv.style.background = 'rgba(0,0,0,0.5)';
pointCountDiv.style.color = 'white';
pointCountDiv.style.padding = '5px 10px';
pointCountDiv.style.borderRadius = '5px';
pointCountDiv.style.fontFamily = 'monospace';
pointCountDiv.style.zIndex = 1001;
document.body.appendChild(pointCountDiv);


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

// // ==== WORKER INLINE AVEC BLOB ====
// const workerScript = `
// self.onmessage = function (event) {
//     const { type, payload } = event.data;
//     if (type === 'grpc_points') {
//         // Ici, on suppose que payload est déjà "toObject" côté main thread
//         const obj = payload;
//         const coordsList = [];
//         const colorsList = [];
//         if (obj.pointcloudlist && obj.pointcloudlist.pointcloudsList) {
//             obj.pointcloudlist.pointcloudsList.forEach((pointCloud) => {
//                 if (pointCloud.pointsList) {
//                     pointCloud.pointsList.forEach((point) => {
//                         coordsList.push(point.x, point.y, point.z);
//                         colorsList.push(point.r, point.g, point.b);
//                     });
//                 }
//             });
//         }
//         // On transfère les buffers au main thread (très rapide)
//         const coordsArray = new Float32Array(coordsList);
//         const colorsArray = new Float32Array(colorsList);
//         self.postMessage(
//             {
//                 coords: coordsArray,
//                 colors: colorsArray
//             },
//             [coordsArray.buffer, colorsArray.buffer]
//         );
//     }
// };
// `;


const workerScript = `
self.onmessage = function (event) {
    const { type, payload } = event.data;
    if (type === 'grpc_points') {
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

        // === PREPARE LA POSE À ENVOYER ===
        let lastPoseMatrix = null;
        if (obj.poselist && obj.poselist.posesList && obj.poselist.posesList.length > 0) {
            const lastPose = obj.poselist.posesList[obj.poselist.posesList.length - 1];
            if (lastPose.matrix && lastPose.matrix.length === 16) {
                lastPoseMatrix = lastPose.matrix;
            }
        }

        // Envoie aussi la matrice de la pose au main thread
        const coordsArray = new Float32Array(coordsList);
        const colorsArray = new Float32Array(colorsList);
        self.postMessage(
            {
                coords: coordsArray,
                colors: colorsArray,
                poseMatrix: lastPoseMatrix, // <-- ajout ici
            },
            [coordsArray.buffer, colorsArray.buffer]
        );
    }
};
`;


// Création du worker à partir d'un blob
const workerBlob = new Blob([workerScript], { type: "application/javascript" });
const worker = new Worker(URL.createObjectURL(workerBlob));

// Choisis ton nombre max de points à afficher
const MAX_DISPLAY_POINTS = 20000000;
let writeIndex = 0;
let displayCount = 0;

worker.onmessage = function (event) {
    const { coords, colors: batchColors, poseMatrix} = event.data;
    const newPoints = coords.length / 3;

    // On part du principe que writeIndex est l'index du prochain point libre,
    // et qu'on ne revient jamais en arrière (pas de wrap).
    for (let i = 0; i < newPoints; i++) {
        const idx = writeIndex + i;
        positions[idx * 3]     = coords[i * 3];
        positions[idx * 3 + 1] = coords[i * 3 + 1];
        positions[idx * 3 + 2] = coords[i * 3 + 2];
        colors[idx * 3]        = batchColors[i * 3];
        colors[idx * 3 + 1]    = batchColors[i * 3 + 1];
        colors[idx * 3 + 2]    = batchColors[i * 3 + 2];
    }

    // updateRange uniquement sur la zone nouvellement remplie
    const positionAttr = pointsGeometry.attributes.position;
    const colorAttr = pointsGeometry.attributes.color;

    positionAttr.updateRange.offset = writeIndex * 3;
    positionAttr.updateRange.count = newPoints * 3;
    positionAttr.needsUpdate = true;

    colorAttr.updateRange.offset = writeIndex * 3;
    colorAttr.updateRange.count = newPoints * 3;
    colorAttr.needsUpdate = true;

    writeIndex += newPoints;
    displayCount = writeIndex;
    pointsGeometry.setDrawRange(0, displayCount);

    // === LOG DE LA MATRICE DE LA DERNIÈRE POSE ===
    if (poseMatrix && poseMatrix.length === 16) {
        console.log(
            "Dernière pose reçue du worker (matrice 4x4):\n" +
            poseMatrix.slice(0, 4).map(v => v.toFixed(3)).join(' ') + '\n' +
            poseMatrix.slice(4, 8).map(v => v.toFixed(3)).join(' ') + '\n' +
            poseMatrix.slice(8, 12).map(v => v.toFixed(3)).join(' ') + '\n' +
            poseMatrix.slice(12, 16).map(v => v.toFixed(3)).join(' ')
        );
    }

};



// ==== GRPC-WEB - RÉCEPTION DES POINTS ====
const client = new SlamServiceClient('http://192.168.51.30:8080', null, null);
const request = new Empty();
const stream = client.getSlamData(request, {});


// Déclaration de la variable de comptage
let receivedPackets = 0;
let packetsPerSecond = 0;

// Timer pour remettre à zéro chaque seconde (MET LE ICI, UNE SEULE FOIS)
setInterval(() => {
    packetsPerSecond = receivedPackets;
    receivedPackets = 0;
    // Pas besoin d'ajouter du texte ici (car ça concatène à l'infini)
    // On affichera toutes les infos dans la boucle de rendu
}, 1000);


stream.on('data', (response) => {
    // On sérialise le message gRPC en JS pur pour le worker
    worker.postMessage({ type: 'grpc_points', payload: response.toObject() });
    // count grpc messages
    receivedPackets++;
});

stream.on('error', (err) => {
    console.error('Erreur du flux:', err.message);
});
stream.on('end', () => {
    console.log('Flux terminé');
});

// ==== BOUCLE DE RENDU (~30 FPS) ====
let lastRenderTime = 0;

let lastGPUCheck = 0;
let lastGPUName = "";
let currentGPUInfo = "GPU: inconnu";

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


    // ---- GPU CHECK À CHAQUE FRAME ----
    try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
            const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
            const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
            currentGPUInfo = `GPU: ${vendor} | ${gpu}`;
        } else {
            currentGPUInfo = `GPU: ${gl.getParameter(gl.RENDERER)}`;
        }
    } catch (e) {
        currentGPUInfo = "GPU: erreur de détection";
    }
    // ---- FIN GPU CHECK ----

    pointCountDiv.textContent =
        `Points affichés : ${pointsGeometry.drawRange.count}\n` +
        `Fréquence stream : ${packetsPerSecond} paquets/s\n` +
        `${currentGPUInfo}`;

    stats.end();
}
animate();

// ==== RESIZE EVENT ====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

