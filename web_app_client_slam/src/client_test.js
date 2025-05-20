
// ==== IMPORTS ET INITIALISATION ====
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


// JS : export du nuage de points et de la trajectoire
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';



// Création et style du bouton d'export
const saveBtn = document.createElement('button');
saveBtn.textContent = 'Exporter nuage + trajectoire (.glb)';
Object.assign(saveBtn.style, {
position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none',
borderRadius: '4px', cursor: 'pointer', zIndex: '1000'
});
document.body.appendChild(saveBtn);

saveBtn.addEventListener('click', () => {
const exporter = new GLTFExporter();
exporter.parse(
  [ pointsMesh, trajectoryLine ],
  // onCompleted -> result est ArrayBuffer (binaire .glb)
  (result) => {
    if (result instanceof ArrayBuffer) {
      saveArrayBuffer(result, 'scene.glb');
    } else {
      console.error('GLTFExporter a renvoyé un JSON inattendu en mode binaire');
    }
  },
  // onError
  (error) => {
    console.error('Erreur pendant l\'export GLB:', error);
  },
  // options : binaire GLB (avec .glb)
  {
    binary: true,
    onlyVisible: false,
    truncateDrawRange: false
  }
);
});

// Fonctions utilitaires de téléchargement
function saveArrayBuffer(buffer, filename) {
const blob = new Blob([buffer], { type: 'application/octet-stream' });
const link = document.createElement('a');
link.style.display = 'none';
document.body.appendChild(link);
link.href = URL.createObjectURL(blob);
link.download = filename;
link.click();
setTimeout(() => {
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
}, 100);
}

// // --- Bouton d'export ---
// const saveBtn = document.createElement('button');
// saveBtn.textContent = 'Enregistrer nuage + trajectoire';
// Object.assign(saveBtn.style, {
// position: 'absolute',
// top: '10px',
// left: '50%',
// transform: 'translateX(-50%)',
// padding: '8px 16px',
// backgroundColor: '#007bff',
// color: '#fff',
// border: 'none',
// borderRadius: '4px',
// cursor: 'pointer',
// zIndex: '1000'
// });
// document.body.appendChild(saveBtn);
//
// saveBtn.addEventListener('click', () => {
// const exporter = new GLTFExporter();
// exporter.parse(
//   // Exporte spécifiquement vos variables
//   [ pointsMesh, trajectoryLine ],
//   (result) => {
//     if (result instanceof ArrayBuffer) {
//       saveArrayBuffer(result, 'scene.glb');
//     } else {
//       saveString(JSON.stringify(result, null, 2), 'scene.gltf');
//     }
//   },
//   { binary: true, onlyVisible: false, truncateDrawRange: false }
// );
// });
//
// // Fonctions utilitaires
// function saveString(text, filename) {
// save(new Blob([text], { type: 'text/plain' }), filename);
// }
//
// function saveArrayBuffer(buffer, filename) {
// save(new Blob([buffer], { type: 'application/octet-stream' }), filename);
// }
//
// function save(blob, filename) {
// const link = document.createElement('a');
// link.style.display = 'none';
// document.body.appendChild(link);
// link.href = URL.createObjectURL(blob);
// link.download = filename;
// link.click();
// setTimeout(() => {
//   URL.revokeObjectURL(link.href);
//   document.body.removeChild(link);
// }, 100);
// }



// ==== THREE.JS SCÈNE, CAMÉRA, RENDERER ====
const scene = new THREE.Scene();

// 1. Renderer avec profondeur logarithmique
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true    // → beaucoup plus de précision sur de grands rapports near/far
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. Caméra “ultra-précise”
const fov    = 50;                     // angle de vue confortable
const aspect = window.innerWidth / window.innerHeight;
const near  = 0.0001;                  // 0.1 mm
const far   = 1000;                    // 1 km
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

// repere de la camera
const cameraOrientationHelper = new THREE.AxesHelper(0.7); // adapte la taille si besoin
cameraOrientationHelper.position.set(0, 0, 0); // centre
scene.add(cameraOrientationHelper);

// (Optionnel) jouer sur le zoom de la caméra pour un contrôle plus fin
camera.zoom = 1;                       
camera.updateProjectionMatrix();

// ========== BOUTON RESET VIEW (ajouté dynamiquement) ==========
const resetBtn = document.createElement('button');
resetBtn.id = 'resetViewBtn';
resetBtn.textContent = 'Reset View';
resetBtn.style.position = 'absolute';
resetBtn.style.top = '10px';
resetBtn.style.right = '10px';
resetBtn.style.zIndex = '20';
resetBtn.style.fontSize = '1.1em';
resetBtn.style.background = '#222';
resetBtn.style.color = '#fff';
resetBtn.style.borderRadius = '6px';
resetBtn.style.padding = '6px 16px';
resetBtn.style.border = 'none';
resetBtn.style.cursor = 'pointer';
document.body.appendChild(resetBtn);

// ========== LOGIQUE DU RESET ==========
resetBtn.onclick = function resetView() {
  // 1. Bounding box de toute la scène (ou change 'scene' par un objet spécifique)
  const box = new THREE.Box3().setFromObject(scene);

  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // 2. Recentre le controls.target
    controls.target.copy(center);

    // 3. Place la caméra à distance pour tout voir
    const fov = camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2));
    // Direction depuis le centre vers la caméra actuelle (garde l'angle de vue utilisateur)
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center.clone().add(direction.multiplyScalar(distance * 1.2)));

    // 4. Ajuste near/far pour la scène
    camera.near = Math.max(0.1, distance * 0.1);
    camera.far  = distance * 10;
    camera.updateProjectionMatrix();

    // 5. Regarde le centre (sécurité)
    camera.lookAt(center);

    // 6. Synchronise OrbitControls
    controls.update();
  }
};
// ===============================================================







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


camera.position.z = 10;
camera.lookAt(0, 0, 0);

// setInterval(() => {
//     const d = camera.position.distanceTo(controls.target);
//     console.log('Camera → Target distance:', d.toFixed(4));
// }, 500);


// // show the new orientation
// const axesHelper = new THREE.AxesHelper(0.7); // ou la taille que tu veux
// axesHelper.position.set(3, 3, 3);
// axesHelper.quaternion.copy(camera.quaternion); // pour matcher l’orientation de la caméra
// scene.add(axesHelper);

//const controls = new OrbitControls(camera, renderer.domElement);
// 3. Contrôles avec distances mini/maxi adaptées
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.1;
controls.enablePan       = true;
controls.enableZoom      = true;
controls.zoomSpeed       = 3;         // accélère le “dolly in/out”
controls.minDistance     = 0.01;      // 1 cm
controls.maxDistance     = 100;       // 100 m



// 4. Recalcul dynamique de near/far sur chaque interaction
const buffer      = 1.2;
const minNear     = 0.0001; // même 0.1 mm si besoin

function updateNearFar() {
  const box    = new THREE.Box3().setFromObject(scene);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const d      = camera.position.distanceTo(sphere.center);

  camera.near = Math.max(minNear, d - sphere.radius * buffer);
  camera.far  =        d + sphere.radius * buffer;
  camera.updateProjectionMatrix();
}

controls.addEventListener('change', updateNearFar);



// controls.target.set(0, 0, -5);
// controls.update();

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


function computeCenter(positions, count) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count; i++) {
        cx += positions[i*3];
        cy += positions[i*3+1];
        cz += positions[i*3+2];
    }
    if (count > 0) {
        cx /= count;
        cy /= count;
        cz /= count;
    }
    return new THREE.Vector3(cx, cy, cz);
}


// setInterval(() => {
//     const center = computeCenter(positions, displayCount);
//     controls.target.copy(center);
//     controls.update();
// }, 500);


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
            // Compatibilité protobufjs/proto
            if (lastPose.matrixList && lastPose.matrixList.length === 16) {
                lastPoseMatrix = lastPose.matrixList;
            } else if (lastPose.matrix && lastPose.matrix.length === 16) {
                lastPoseMatrix = lastPose.matrix;
            } else {
                // Log structure brute pour debug
                console.log("Pose brute (structure inattendue):", lastPose);
            }
        }

        // juste avant self.postMessage
        console.log("Envoi du worker, lastPoseMatrix:", lastPoseMatrix);

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



const cameraTrajectory = [];
//const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff }); // cyan
const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x000080 }); // bleu marine
const trajectoryGeometry = new THREE.BufferGeometry();
let trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
scene.add(trajectoryLine);

const sphereMarkers = [];
const sphereGeometry = new THREE.SphereGeometry(0.01, 16, 16);
//const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // rouge
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff8000 }); // orange

worker.onmessage = function (event) {
    const { coords, colors: batchColors, poseMatrix} = event.data;
    //if (poseMatrix) console.log("poseMatrix:", poseMatrix); // DEBUG

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
        // console.log(
        //     "Dernière pose reçue du worker (matrice 4x4):\n" +
        //     poseMatrix.slice(0, 4).map(v => v.toFixed(3)).join(' ') + '\n' +
        //     poseMatrix.slice(4, 8).map(v => v.toFixed(3)).join(' ') + '\n' +
        //     poseMatrix.slice(8, 12).map(v => v.toFixed(3)).join(' ') + '\n' +
        //     poseMatrix.slice(12, 16).map(v => v.toFixed(3)).join(' ')
        // );
        applyPoseToMesh(cameraMesh, poseMatrix);

        // Extraire la position caméra
        const poseMatrixColMajor = transpose16(poseMatrix);

        const poseMat = new THREE.Matrix4().fromArray(poseMatrixColMajor);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(poseMat);


        // === MISE À JOUR DE LA CAMÉRA THREE.JS AVEC LA POSE ===
        // vision subjective
        // if (camera) {
        //     // 1. Extraire position
        //     const newPos = new THREE.Vector3();
        //     newPos.setFromMatrixPosition(poseMat);
        //
        //     // 2. Extraire orientation (quaternion)
        //     const newQuat = new THREE.Quaternion();
        //     poseMat.decompose(newPos, newQuat, new THREE.Vector3());
        //
        //     // 3. Appliquer position & rotation à la caméra
        //     camera.position.copy(newPos);
        //     camera.quaternion.copy(newQuat);
        //
        //     // 4. (Optionnel) S'assurer que la matrice est bien prise en compte
        //     camera.updateMatrixWorld(true);
        // }


        // Stocker la position et mettre à jour la trajectoire
        if (cameraTrajectory.length === 0 || !cameraTrajectory[cameraTrajectory.length-1].equals(position)) {
            cameraTrajectory.push(position.clone());

            // Met à jour la ligne
            const positionsArray = [];
            cameraTrajectory.forEach(v => positionsArray.push(v.x, v.y, v.z));
            trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsArray, 3));
            trajectoryGeometry.setDrawRange(0, cameraTrajectory.length);

            // Ajoute la sphère rouge
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(position);
            scene.add(sphere);
            sphereMarkers.push(sphere);
        }

    }

};




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


function createCameraMesh(scale=1) {
    // Points -> Vector3 array
    const points = CAM_POINTS.map(p => new THREE.Vector3(p[0] * scale, p[1] * scale, p[2] * scale));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Lines : indices
    const indices = [];
    CAM_LINES.forEach(line => {
        indices.push(line[0], line[1]);
    });
    geometry.setIndex(indices);

    // Material ligne
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    // Créer l'objet LineSegments
    const mesh = new THREE.LineSegments(geometry, material);

    return mesh;
}



// Utilitaire pour transposer row-major → column-major
function transpose16(m) {
    return [
        m[0], m[4], m[8],  m[12],
        m[1], m[5], m[9],  m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15],
    ];
}


function applyPoseToMesh(mesh, poseMatrix) {
    if (!poseMatrix || poseMatrix.length !== 16) return;

    // Transpose Python row-major to column-major for Three.js
    const poseMatrixColMajor = transpose16(poseMatrix);

    // Crée une matrice Three.js pour la pose reçue
    const poseMat = new THREE.Matrix4().fromArray(poseMatrixColMajor);

    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(poseMat);

}


// 1. Création mesh caméra
const cameraMesh = createCameraMesh(0.1);
scene.add(cameraMesh);


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


// setInterval(() => {
//     camera.near = 0.01;
//     camera.far = 10000;
//     camera.updateProjectionMatrix();
//
// }, 500); // toutes les 500ms


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


// function updateNearFar() {
//   const dist = camera.position.distanceTo(controls.target);
//   camera.near = Math.max(0.1, dist * 0.001);      // exemple : near = 0.1% de la distance
//   camera.far  = dist * 10;                        // far = 10x la distance
//   camera.updateProjectionMatrix();
// }


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


    // // Appelle cette fonction à chaque changement de caméra ou dans ta boucle d’animation :
    // updateNearFar();


    stats.end();
}
animate();

// ==== RESIZE EVENT ====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

