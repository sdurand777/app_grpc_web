
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader }  from 'three/examples/jsm/loaders/GLTFLoader.js';


// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// CAMERA
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    10,
    100
);
camera.position.set(0, 0, 5);

// repere de la camera
const cameraOrientationHelper = new THREE.AxesHelper(3.0); // adapte la taille si besoin
cameraOrientationHelper.position.set(0, 0, 0); // centre
scene.add(cameraOrientationHelper);

// // 3. Chargement du fichier GLTF
// const loader = new GLTFLoader();
// loader.load(
//     'scene.gltf',
//     (gltf) => {
//         scene.add(gltf.scene);
//         // Ajuster la cible si nécessaire
//         controls.target.copy(gltf.scene.position);
//         controls.update();
//     },
//     undefined,
//     (error) => { console.error('Erreur de chargement :', error); }
// );


// 3. Chargement du fichier GLTF
// Chemin relatif depuis la racine du serveur. Si vous avez placé le fichier dans 'public/models', utilisez '/models/scene.gltf'
const gltfPath = 'scene.gltf';

// const loader = new GLTFLoader();
// loader.load(
//     gltfPath,
//     (gltf) => {
//         scene.add(gltf.scene);
//         // Optionnel : centrer la vue
//         const box = new THREE.Box3().setFromObject(gltf.scene);
//         const center = box.getCenter(new THREE.Vector3());
//         controls.target.copy(center);
//         controls.update();
//     },
//     (xhr) => {
//         console.log(`Chargement GLTF: ${ (xhr.loaded / xhr.total * 100).toFixed(1) }%`);
//     },
//     (error) => {
//         console.error('Erreur de chargement de scene.gltf :', error);
//     }
// );



// Chargement du .glb
const loader = new GLTFLoader();
loader.load(
    'scene.glb',                // chemin vers votre fichier
    gltf => {
        scene.add(gltf.scene);
        // centre automatique
        const box = new THREE.Box3().setFromObject(gltf.scene);
        controls.target.copy(box.getCenter(new THREE.Vector3()));
        controls.update();
    },
    xhr => {
        if (xhr.total) console.log(`chargé : ${(xhr.loaded/xhr.total*100).toFixed(1)}%`);
    },
    err => console.error('Erreur de chargement:', err)
);


// ... (ton code d'initialisation Three.js ici) ...

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
    camera.near = Math.max(0.1, distance * 0.01);
    camera.far  = distance * 10;
    camera.updateProjectionMatrix();

    // 5. Regarde le centre (sécurité)
    camera.lookAt(center);

    // 6. Synchronise OrbitControls
    controls.update();
  }
};
// ===============================================================



// ======= NUAGES DE POINTS EN FORME DE CUBE =======
const nbPoints = 5000;         // Nombre de points dans le nuage
const sizeCube = 3;            // Taille du cube (bord à bord)
const positions = new Float32Array(nbPoints * 3);

for (let i = 0; i < nbPoints; i++) {
  positions[3 * i]     = (Math.random() - 0.5) * sizeCube; // x
  positions[3 * i + 1] = (Math.random() - 0.5) * sizeCube; // y
  positions[3 * i + 2] = (Math.random() - 0.5) * sizeCube; // z
}

const pointsGeometry = new THREE.BufferGeometry();
pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const pointsMaterial = new THREE.PointsMaterial({
  color: 0x44c8f5,
  size: 0.05,
});

const points = new THREE.Points(pointsGeometry, pointsMaterial);
//scene.add(points);


// ======= PLAN DE POINTS VERTS SUR UNE FACE DU CUBE =======
const nbPlanPoints = 10000;
const arete1 = 10;
const arete2 = 50;
const n = Math.floor(Math.sqrt(nbPlanPoints)); // nombre de points par ligne/colonne (100 si nbPlanPoints=10000)
const planPositions = new Float32Array(n * n * 3);

let k = 0;
for (let ix = 0; ix < n; ix++) {
  for (let iy = 0; iy < n; iy++) {
    // Repartit les points de -5 à +5 sur x et y
    const x = -arete1/2 + (ix / (n-1)) * arete1;
    
    //const y = -arete2/2 + (iy / (n-1)) * arete2;
    //const z = arete/2; // Face avant z = +5
    //const z = 1.5; // Face avant z = +5

    const y = 1.5
    const z = (iy / (n-1)) * arete2;
    planPositions[3 * k]     = x;
    planPositions[3 * k + 1] = y;
    planPositions[3 * k + 2] = z;
    k++;
  }
}

const planGeometry = new THREE.BufferGeometry();
planGeometry.setAttribute('position', new THREE.BufferAttribute(planPositions, 3));

const planMaterial = new THREE.PointsMaterial({
  color: 0x00ff00,
  size: 0.07,
});

const planPoints = new THREE.Points(planGeometry, planMaterial);
//scene.add(planPoints);
// ===========================================


// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// CUBE AU CENTRE
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
//scene.add(cube);

// CONTROLS
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

controls.enablePan = true; // le désactive

// LUMIÈRE (optionnel)
const light = new THREE.DirectionalLight(0xffffff, 0.5);
light.position.set(5, 5, 5);
scene.add(light);

// STATS (FPS)
const stats = new Stats();
stats.showPanel(0); // 0 = FPS
document.body.appendChild(stats.dom);

// AFFICHAGE INFOS CAMERA
const info = document.createElement('div');
info.style.position = 'absolute';
info.style.top = '10px';
info.style.left = '10px';
info.style.background = 'rgba(0,0,0,0.7)';
info.style.color = '#fff';
info.style.fontFamily = 'monospace';
info.style.padding = '10px';
info.style.borderRadius = '10px';
info.style.zIndex = 10;
document.body.appendChild(info);

function updateInfo() {
  info.innerHTML =
    `Camera position:<br>  x: ${camera.position.x.toFixed(2)}<br>  y: ${camera.position.y.toFixed(2)}<br>  z: ${camera.position.z.toFixed(2)}<br><br>` +
    `Camera rotation:<br>  x: ${camera.rotation.x.toFixed(2)}<br>  y: ${camera.rotation.y.toFixed(2)}<br>  z: ${camera.rotation.z.toFixed(2)}<br><br>` +
    `Controls target:<br>  x: ${controls.target.x.toFixed(2)}<br>  y: ${controls.target.y.toFixed(2)}<br>  z: ${controls.target.z.toFixed(2)}`;
}


function updateNearFar() {
  const dist = camera.position.distanceTo(controls.target);
  camera.near = Math.max(0.1, dist * 0.001);      // exemple : near = 0.1% de la distance
  camera.far  = dist * 10;                        // far = 10x la distance
  camera.updateProjectionMatrix();
}


// ANIMATION
function animate() {
    stats.begin();

    updateInfo();
    renderer.render(scene, camera);

    stats.end();

    // Appelle cette fonction à chaque changement de caméra ou dans ta boucle d’animation :
    updateNearFar();

    requestAnimationFrame(animate);
}
animate();

// RESIZE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
