// index.js
// monitor session status at the beginning to connect to grpc serveur and get session infos
import { SessionMonitor } from './monitor/SessionMonitor.js';
import { DataBaseManager } from './core/DataBaseManager.js';

// pour gerer les pcds
import { SlamService } from './services/SlamService.js';
import { PointCloudController } from './pointcloud/PointCloudController.js';
import { PointCloudWorker } from './pointcloud/PointCloudWorker.js';

// pour gerer les poses
import { PoseService } from './services/PoseService.js';
import { PoseController } from './pose/PoseController.js';
import { PoseWorker } from './pose/PoseWorker.js';

import { animate } from './core/AnimationLoop.js';

// session service 
import { SessionService } from './services/SessionService.js';

// UI
import { DatabaseClearButton } from './ui/DatabaseClearButton.js';
import { TrajectoryToggleButton } from './ui/TrajectoryToggleButton.js';
import { Stats } from './ui/Stats.js';
import { createPointSizeSlider } from './ui/PointSizeSlider.js';

// create three js scene
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';

const SERVER_URL = 'http://192.168.51.179:8080';

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
const overlay = new Stats(renderer);

// worker pour le pcd
const worker = new Worker(new URL('./pointcloud/PointCloudWorker.js', import.meta.url));

// controller pour le pcd
const pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);
createPointSizeSlider(pcController, { initial: 0.01 });

// worker pour les poses
const poseWorker = new Worker(new URL('./pose/PoseWorker.js', import.meta.url));

// controller pour les poses
const poseController = new PoseController(scene, camera, renderer, poseWorker);
const trajectoryToggleBtn = new TrajectoryToggleButton(poseController);

// Variables globales pour gérer l'état
let currentSession = null;
let currentStreamState = {
    isStreaming: false,
    lastChunkTime: Date.now(),
    chunkTimeout: 5000, // 5 secondes sans chunk = fin du stream
    checkInterval: null,
    streamServices: null
};

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

console.log("getChunksStats");
await dbManager.getChunksStats();

// session monitor
const monitor = new SessionMonitor(SERVER_URL, dbManager);

// methode pour pouvoir arreter le monitoring de la connexion et de la session au besoin
window.stopSessionMonitoring = () => {
    monitor.stop();
};

// Fonction pour nettoyer la scène
function clearScene() {
    console.log("🧹 Nettoyage de la scène...");
    
    // Réinitialiser les buffers du controller
    pcController.writeIndex = 0;
    pcController.displayCount = 0;
    pcController.pickPositions = [];
    pcController.pickOriginalIndices = [];
    
    // Réinitialiser la géométrie
    pcController.geom.setDrawRange(0, 0);
    pcController.posAttr.needsUpdate = true;
    pcController.colAttr.needsUpdate = true;
    
    // Réinitialiser le poseController si nécessaire
    if (poseController.clearTrajectory) {
        poseController.clearTrajectory();
    }
    
    console.log("✅ Scène nettoyée");
}

// Fonction pour arrêter les services de streaming
function stopStreamingServices() {
    if (currentStreamState.streamServices) {
        const { slam, pose } = currentStreamState.streamServices;
        
        // Arrêter les listeners
        if (slam && slam.stopStreaming) {
            slam.stopStreaming();
        }
        if (pose && pose.stopStreaming) {
            pose.stopStreaming();
        }
        
        currentStreamState.streamServices = null;
    }
    
    // Arrêter le check interval
    if (currentStreamState.checkInterval) {
        clearInterval(currentStreamState.checkInterval);
        currentStreamState.checkInterval = null;
    }
    
    currentStreamState.isStreaming = false;
}

// Fonction pour vérifier si le stream est terminé
function checkStreamTimeout() {
    const now = Date.now();
    const timeSinceLastChunk = now - currentStreamState.lastChunkTime;
    
    if (timeSinceLastChunk > currentStreamState.chunkTimeout) {
        console.log(`⏰ Timeout détecté: ${timeSinceLastChunk}ms sans nouveau chunk`);
        handleStreamEnd();
    }
}

// Fonction pour gérer la fin du stream
async function handleStreamEnd() {
    console.log("🏁 Fin du stream détectée");
    
    // Arrêter les services
    stopStreamingServices();
    
    // Sauvegarder les statistiques finales
    if (currentSession) {
        const stats = await pcController.getSessionStats(currentSession.sessionId);
        console.log("📊 Statistiques finales de la session:", stats);
        
        // Optionnel: sauvegarder des métadonnées supplémentaires
        await dbManager.saveSessionInfo({
            ...currentSession,
            endTime: Date.now(),
            stats: stats
        });
    }
    
    console.log("💾 Session sauvegardée, en attente de la prochaine session...");
    
    // Attendre un peu avant de redémarrer le monitoring
    setTimeout(() => {
        startSessionMonitoring();
    }, 2000);
}

// Fonction pour démarrer le monitoring de session
async function startSessionMonitoring() {
    console.log("🔄 Démarrage du monitoring de session...");
    
    // Nettoyer la scène pour la nouvelle session
    clearScene();
    
    // Démarrer le monitoring
    const sessionInfo = await monitor.start();
    
    if (sessionInfo) {
        currentSession = sessionInfo;
        await startNewSession(sessionInfo);
    } else {
        console.log("⏳ Aucune session active, nouvelle tentative dans 5 secondes...");
        setTimeout(startSessionMonitoring, 5000);
    }
}

// Fonction pour démarrer une nouvelle session
async function startNewSession(sessionInfo) {
    console.log("🚀 Démarrage d'une nouvelle session:", sessionInfo.sessionId);
    
    // Vérifier le cache
    const sessionflag = await monitor.CheckAndUpdateCache();
    
    console.log("Sessionflag : ", sessionflag);
    if (sessionflag) {
        console.log("Session Identique - Chargement depuis le cache");
        await pcController.loadChunksFromCache(sessionInfo.sessionId);
    } else {
        console.log("Nouvelle Session - Démarrage du streaming");
        
        // Initialiser les services de streaming
        const slam = new SlamService(SERVER_URL, dbManager);
        const pose = new PoseService(SERVER_URL);
        
        currentStreamState.streamServices = { slam, pose };
        currentStreamState.isStreaming = true;
        currentStreamState.lastChunkTime = Date.now();
        
        // Stream sur les pcds
        slam.onData((err, res) => {
            if (err) {
                console.error("Erreur SLAM:", err);
                return;
            }
            
            // Mettre à jour le timestamp du dernier chunk
            currentStreamState.lastChunkTime = Date.now();
            
            // Traiter les données
            pcController.processRaw(res);
        });
        
        // Stream sur les poses
        pose.onPoses((err, res) => {
            if (err) {
                console.error("Erreur Pose:", err);
                return;
            }
            
            poseController.processRaw(res);
        });
        
        // Démarrer la vérification périodique du timeout
        currentStreamState.checkInterval = setInterval(checkStreamTimeout, 1000);
    }
    
    // L'animation continue toujours
    if (!window.animationRunning) {
        window.animationRunning = true;
        animate({ renderer, scene, camera, controls, stats, pcController, overlay });
    }
}

// Fonction principale
async function main() {
    try {
        // Initialiser la base de données
        await dbManager.open();
        
        // Démarrer le monitoring de session
        await startSessionMonitoring();
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    }
}

// Gérer la fermeture de la page
window.addEventListener('beforeunload', () => {
    stopStreamingServices();
    if (worker) worker.terminate();
    if (poseWorker) poseWorker.terminate();
});

// Démarrer l'application
main();
