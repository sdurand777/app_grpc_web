
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';

// pout gerer les pcds
import { SlamService } from './SlamService.js';
import { PointCloudController } from './PointCloudController.js';
import PointCloudWorker from './PointCloudWorker.js';

// pout gerer les pcds
import { PoseService } from './PoseService.js';
import { PoseController } from './PoseController.js';
import PoseWorker from './PoseWorker.js';




import { ResetButton } from './ResetButton.js';
import { TrajectoryToggleButton } from './TrajectoryToggleButton.js';

import { setupResize } from './ResizeHandler.js';
import { animate } from './AnimationLoop.js';
// Worker blob import
import { UIOverlay } from './UIOverlay.js';
import { SceneManager } from './SceneManager.js';
import { CloudFactory } from './CloudFactory.js';

import { createPointSizeSlider } from './PointSizeSlider.js';

import * as THREE from 'three';

// Ajouter l'import
//import { DatabaseManager } from './DatabaseManager.js';

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


// worker pour le pcd
const worker = new Worker(new URL('./PointCloudWorker.js', import.meta.url));
// worker pour la pose
const poseworker = new Worker(new URL('./PoseWorker.js', import.meta.url));


// controller pour le pcd
const pcController = new PointCloudController(scene, camera, renderer, worker);
const poseController = new PoseController(scene, camera, renderer, poseworker);

// Après la création des controllers, ajouter :
//const db = new DatabaseManager();


// Création du bouton toggle, relié au controller
const trajectoryToggleBtn = new TrajectoryToggleButton(poseController);

const uiOverlay = new UIOverlay(renderer); // <-- CORRECT !

const sceneManager = new SceneManager(scene);

const resetButton = new ResetButton(sceneManager, camera, controls);

// Ajoute le slider (optionnel: tu peux placer dans une div spécifique)
createPointSizeSlider(pcController, { initial: 0.01 });


// Add cube
// const geometry = CloudFactory.createCubePointCloud({ nbPoints: 5000, size: 5 });
// const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 });
// const points = new THREE.Points(geometry, material);
// scene.add(points);


// service grpc pour les pcds
const slam = new SlamService('http://192.168.51.30:8080');
// service grpc pour les poses
const pose = new PoseService('http://192.168.51.30:8080');


// // Fonction d'initialisation asynchrone
// async function initializeApp() {
//     try {
//         // Initialiser la base de données
//         await db.init();
//         console.log('Database initialized');
//         
//         await db.clearAll();
//         console.log('Database cleared');
//         // Initialiser les controllers avec la DB
//         await pcController.initDatabase(db);
//         await poseController.initDatabase(db);
//         
//         // Vérifier s'il y a des données sauvegardées
//         const hasData = await db.getMetadata('hasData');
//         
//         if (hasData) {
//             console.log('Loading saved data...');
//             // Afficher un indicateur de chargement
//             //uiOverlay.showMessage('Chargement des données sauvegardées...');
//             
//             // Charger les données
//             await pcController.loadFromDatabase();
//             await poseController.loadFromDatabase();
//             
//             //uiOverlay.showMessage('Données chargées!');
//             //setTimeout(() => uiOverlay.hideMessage(), 2000);
//         }
//         
//         // Marquer qu'on a des données
//         await db.saveMetadata('hasData', true);
//         
//         // Démarrer les streams GRPC
//         startStreaming();
//         
//     } catch (error) {
//         console.error('Error initializing:', error);
//     }
// }

// // Encapsuler le code de streaming dans une fonction
// function startStreaming() {
//     // stream on pcds
//     slam.onData((err, res) => {
//         if (err) console.error(err);
//         else pcController.processRaw(res);
//         receivedPackets++;
//     });
//
//     // stream on poses
//     pose.onPoses((err, res) => {
//         if (err) console.error(err);
//         else poseController.processRaw(res);
//     });
// }



// stream on pcds
slam.onData((err, res) => {
  if (err) console.error(err);
  else pcController.processRaw(res);
  // Incrémentation du compteur de paquets reçus
  receivedPackets++;

});


// stream on poses
pose.onPoses((err, res) => {
  if (err) console.error(err);
  else poseController.processRaw(res);

});


// Remplacer les appels directs aux streams par :
//initializeApp();

//new ResetButton(camera, controls);
setupResize(camera, renderer);
//animate({ renderer, scene, camera, controls, stats });

animate({ renderer, scene, camera, controls, stats, uiOverlay, pcController, getPacketRate: () => packetsPerSecond });

