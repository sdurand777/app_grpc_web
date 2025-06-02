
// index.js
// monitor session status at the beginning to connect to grpc serveur and get session infos
import { SessionMonitor } from './monitor/SessionMonitor.js';
import { DataBaseManager } from './core/DataBaseManager.js';

// pout gerer les pcds
import { SlamService } from './services/SlamService.js';
import { PointCloudController } from './pointcloud/PointCloudController.js';
import { PointCloudWorker } from './pointcloud/PointCloudWorker.js';

// pout gerer les poses
import { PoseService } from './services/PoseService.js';
import { PoseController } from './pose/PoseController.js';
import { PoseWorker } from './pose/PoseWorker.js';

import { animate } from './core/AnimationLoop.js';

// session service 
import { SessionService } from './services/SessionService.js';


// UI
// clear button
import { DatabaseClearButton } from './ui/DatabaseClearButton.js';
import { TrajectoryToggleButton } from './ui/TrajectoryToggleButton.js';
import { Stats } from './ui/Stats.js';
import { createPointSizeSlider } from './ui/PointSizeSlider.js';

// create three js scene
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';

const SERVER_URL = 'http://192.168.51.179:8080';

// // test metadata
// console.log("test meta data");
// const sessionService = new SessionService(SERVER_URL);
// await sessionService.getSessionInfo();

// database to store in cache
const dbManager = new DataBaseManager();

const dbClearButton = new DatabaseClearButton(dbManager);


console.log('🎉 Initialisation de la scène 3D...');
const scene = createScene();
const camera = createCamera();
const renderer = createRenderer();
const controls = createControls(camera, renderer.domElement);
const stats = createStats();

// overlay with stats for GPU and other information
const overlay = new Stats(renderer); // <-- CORRECT !

// worker pour le pcd
let worker = new Worker(new URL('./pointcloud/PointCloudWorker.js', import.meta.url));

// controller pour le pcd
let pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);
createPointSizeSlider(pcController, { initial: 0.01 });

// worker pour les poses
let poseWorker = new Worker(new URL('./pose/PoseWorker.js', import.meta.url));

// controller pour les poses
let poseController = new PoseController(scene, camera, renderer, poseWorker);
let trajectoryToggleBtn = new TrajectoryToggleButton(poseController);




// Optionnel: ajouter une méthode globale pour masquer/afficher l'interface
window.toggleDBManager = () => {
    dbClearButton.toggle();
};


console.log("Load Cache Info");

console.log("getChunksStats");
const cached_chunks = await dbManager.getChunksStats();

console.log("getSessionInfo");
const cached_session = await dbManager.getSessionInfo();
console.log("cached_sessioninfo : ", cached_session);


// delete all chunks
// console.log("clear all chunks");
// await dbManager.clearAllChunks();

console.log("getChunksStats");
await dbManager.getChunksStats();

// session monitor
const monitor = new SessionMonitor(SERVER_URL, dbManager, pcController, poseController, scene);

// methode pour pouvoir arreter le monitoring de la connexion et de la session au besoin
window.stopSessionMonitoring = () => {
    monitor.stop();
};

// // Fonction principale
// async function main() {
//     const sessionInfo = await monitor.start();
//     
//     if (sessionInfo) {
//
//         // check cache sessioninfo and update
//         const sessionflag = await monitor.CheckAndUpdateCache();
//
//         // console.log("Sessionflag : ", sessionflag)
//         // if (sessionflag)
//         // {
//         //     console.log("Session Identique");
//         //     console.log("Session Identique on load from Cache");
//         //     await pcController.loadChunksFromCache(sessionInfo.sessionId);
//         //
//         // }
//         // else{
//         //     console.log("Nouvelle Session")
//         //     console.log("Clean Cache")
//         // }
//
//         // service grpc pour les pcds
//         const slam = new SlamService(SERVER_URL, dbManager);
//
//         // service pour les poses
//         const pose = new PoseService(SERVER_URL);
//
//
//         // stream on pcds
//         slam.onData((err, res) => {
//           if (err) console.error(err);
//           else pcController.processRaw(res);
//           // Incrémentation du compteur de paquets reçus
//           //receivedPackets++;
//
//         });
//
//         // stream on poses
//         pose.onPoses((err, res) => {
//           if (err) console.error(err);
//           else poseController.processRaw(res);
//
//         });
//
//
//
//         animate({ renderer, scene, camera, controls, stats, pcController, overlay });
//
//     } else {
//         console.error('❌ La session n\'a pas pu être initialisée.');
//     }
// }
//
// main();



// async function mainLoop() {
//     while (true) {
//         try {
//             console.log("🔄 Démarrage d'une nouvelle tentative de connexion...");
//             const sessionInfo = await monitor.start();
//
//             if (!sessionInfo) {
//                 console.error("❌ La session n'a pas pu être initialisée. Nouvelle tentative dans 5 secondes...");
//                 await new Promise(resolve => setTimeout(resolve, 5000));
//                 continue;
//             }
//
//             const sessionflag = await monitor.CheckAndUpdateCache();
//             const slam = new SlamService(SERVER_URL, dbManager);
//             const pose = new PoseService(SERVER_URL);
//
//             // Ecoute du flux
//             await new Promise((resolve, reject) => {
//                 let streamEnded = false;
//
//                 slam.onData((err, res) => {
//                     if (err) {
//                         console.error("Erreur dans le flux slam:", err);
//                         reject(err);
//                     } else if (!res) {
//                         console.warn("Fin du flux slam détectée");
//                         streamEnded = true;
//                         resolve();
//                     } else {
//                         pcController.processRaw(res);
//                     }
//                 });
//
//                 pose.onPoses((err, res) => {
//                     if (err) console.error("Erreur dans le flux pose:", err);
//                     else if (res) poseController.processRaw(res);
//                 });
//
//                 // Animation
//                 animate({ renderer, scene, camera, controls, stats, pcController, overlay });
//
//                 // Détection manuelle d'une fin éventuelle
//                 const checkInterval = setInterval(() => {
//                     if (streamEnded) {
//                         clearInterval(checkInterval);
//                         resolve();
//                     }
//                 }, 1000);
//             });
//
//             console.warn("🔁 Fin du flux détectée. Redémarrage du monitoring...");
//         } catch (error) {
//             console.error("Erreur détectée:", error);
//             console.log("Nouvelle tentative dans 5 secondes...");
//             await new Promise(resolve => setTimeout(resolve, 5000));
//         }
//     }
// }
//
// mainLoop();


async function mainLoop() {
    while (true) {
        try {
            console.log("🔄 Démarrage d'une nouvelle tentative de connexion...");
            const sessionInfo = await monitor.start();

            if (!sessionInfo) {
                console.error("❌ La session n'a pas pu être initialisée. Nouvelle tentative dans 5 secondes...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            const sessionflag = await monitor.CheckAndUpdateCache();
            
            // Si nouvelle session, on refait tout proprement
            if (!sessionflag) {
                console.log("🔨 Nouvelle session - Recréation des controllers");
                
                // Nettoyer proprement l'ancien pcController
                if (pcController) {
                    pcController.dispose(); // Appeler dispose qui va retirer le listener
                }

                // Nettoyer toute la scène
                scene.clear();

                // // Nettoyer l'ancien pcController
                // if (pcController && pcController.points) {
                //     scene.remove(pcController.points);
                //     scene.remove(pcController.pickmesh);
                // }
                // 
                // // Nettoyer l'ancien poseController  
                // if (poseController && poseController.trajectoryLine) {
                //     scene.remove(poseController.trajectoryLine);
                // }
                
                // Terminer les anciens workers
                if (worker) worker.terminate();
                if (poseWorker) poseWorker.terminate();
                
                // Recréer tout
                worker = new Worker(new URL('./pointcloud/PointCloudWorker.js', import.meta.url));
                pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);
                createPointSizeSlider(pcController, { initial: 0.01 });
                
                poseWorker = new Worker(new URL('./pose/PoseWorker.js', import.meta.url));
                poseController = new PoseController(scene, camera, renderer, poseWorker);
                trajectoryToggleBtn = new TrajectoryToggleButton(poseController);
            }
            
            const slam = new SlamService(SERVER_URL, dbManager);
            const pose = new PoseService(SERVER_URL);

            // Ecoute du flux
            await new Promise((resolve, reject) => {
                let streamEnded = false;

                slam.onData((err, res) => {
                    if (err) {
                        console.error("Erreur dans le flux slam:", err);
                        reject(err);
                    } else if (!res) {
                        console.warn("Fin du flux slam détectée");
                        streamEnded = true;
                        resolve();
                    } else {
                        pcController.processRaw(res);
                    }
                });

                pose.onPoses((err, res) => {
                    if (err) console.error("Erreur dans le flux pose:", err);
                    else if (res) poseController.processRaw(res);
                });

                // Animation
                animate({ renderer, scene, camera, controls, stats, pcController, overlay });

                // Détection manuelle d'une fin éventuelle
                const checkInterval = setInterval(() => {
                    if (streamEnded) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 1000);
            });

            console.warn("🔁 Fin du flux détectée. Redémarrage du monitoring...");
        } catch (error) {
            console.error("Erreur détectée:", error);
            console.log("Nouvelle tentative dans 5 secondes...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

mainLoop();

