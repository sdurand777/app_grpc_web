
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';
import { SlamService } from './SlamService.js';
import { PointCloudController } from './PointCloudController.js';
import { ResetButton } from './ResetButton.js';
import { setupResize } from './ResizeHandler.js';
import { animate } from './AnimationLoop.js';
// Worker blob import
import PointCloudWorker from './PointCloudWorker.js';
import { UIOverlay } from './UIOverlay.js';
import { SceneManager } from './SceneManager.js';
import { CloudFactory } from './CloudFactory.js';
import * as THREE from 'three';


// ========== Packet Counting Metrics ==========
// Déclaration des compteurs
let receivedPackets = 0;
let packetsPerSecond = 0;

// Timer pour calculer les paquets par seconde
setInterval(() => {
  packetsPerSecond = receivedPackets;
  // Réinitialise pour la prochaine période
  receivedPackets = 0;
}, 1000);


const scene = createScene();
const camera = createCamera();
const renderer = createRenderer();
const controls = createControls(camera, renderer.domElement);
const stats = createStats();

const worker = new Worker(new URL('./PointCloudWorker.js', import.meta.url));

const pcController = new PointCloudController(scene, worker);

const uiOverlay = new UIOverlay(renderer); // <-- CORRECT !

const sceneManager = new SceneManager(scene);

const resetButton = new ResetButton(sceneManager, camera, controls);


// Add cube
// const geometry = CloudFactory.createCubePointCloud({ nbPoints: 5000, size: 5 });
// const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 });
// const points = new THREE.Points(geometry, material);
// scene.add(points);


const slam = new SlamService('http://192.168.51.30:8080');

slam.onData((err, res) => {
  if (err) console.error(err);
  else pcController.processRaw(res);
  // Incrémentation du compteur de paquets reçus
  receivedPackets++;

});

//new ResetButton(camera, controls);
setupResize(camera, renderer);
//animate({ renderer, scene, camera, controls, stats });

animate({ renderer, scene, camera, controls, stats, uiOverlay, pcController, getPacketRate: () => packetsPerSecond });

