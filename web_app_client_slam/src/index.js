
// index.js
// monitor session status at the beginning to connect to grpc serveur and get session infos
import { SessionMonitor } from './SessionMonitor.js';
import { DataBaseManager } from './DataBaseManager.js';

// pout gerer les pcds
import { SlamService } from './SlamService.js';
import { PointCloudController } from './PointCloudController.js';
import PointCloudWorker from './PointCloudWorker.js';

import { animate } from './AnimationLoop.js';



// create three js scene
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';

const SERVER_URL = 'http://localhost:8080';

// database to store in cache
const dbManager = new DataBaseManager();



console.log("Load Cache Info");

console.log("getChunksStats");
const cached_chunks = await dbManager.getChunksStats();

console.log("getSessionInfo");
const cached_session = await dbManager.getSessionInfo();
console.log("cached_sessioninfo : ", cached_session);


// // delete all chunks
// console.log("clear all chunks");
// await dbManager.clearAllChunks();
//
// console.log("getChunksStats");
// await dbManager.getChunksStats();

// session monitor
const monitor = new SessionMonitor(SERVER_URL, dbManager);

// methode pour pouvoir arreter le monitoring de la connexion et de la session au besoin
window.stopSessionMonitoring = () => {
    monitor.stop();
};

// Fonction principale
async function main() {
    const sessionInfo = await monitor.start();
    
    if (sessionInfo) {

        // check cache sessioninfo and update
        const sessionflag = await monitor.CheckAndUpdateCache();

        console.log("Sessionflag : ", sessionflag)
        if (sessionflag)
        {
            console.log("Session Identique");
        }
        else{
            console.log("Nouvelle Session")
        }


        console.log('🎉 Initialisation de la scène 3D...');
        const scene = createScene();
        const camera = createCamera();
        const renderer = createRenderer();
        const controls = createControls(camera, renderer.domElement);
        const stats = createStats();


        // worker pour le pcd
        const worker = new Worker(new URL('./PointCloudWorker.js', import.meta.url));

        // controller pour le pcd
        const pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);


        console.log("Sessionflag : ", sessionflag)
        if (sessionflag)
        {
            console.log("Session Identique on load from Cache");
            pcController.loadChunksFromCache(sessionInfo.sessionId);
        }
        else{
            console.log("Nouvelle Session")
        }



        // service grpc pour les pcds
        const slam = new SlamService('http://192.168.51.30:8080');


        // stream on pcds
        slam.onData((err, res) => {
          if (err) console.error(err);
          else pcController.processRaw(res);
          // Incrémentation du compteur de paquets reçus
          //receivedPackets++;

        });


        animate({ renderer, scene, camera, controls, stats, pcController});
        // ... Tu peux ensuite ajouter la boucle d'animation ici si nécessaire
    } else {
        console.error('❌ La session n\'a pas pu être initialisée.');
    }
}

main();
