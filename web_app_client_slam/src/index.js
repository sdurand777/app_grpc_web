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

// NOUVEAU : Import de l'exporteur PLY
import { PLYExporter } from './export/PLYExporter.js';

// UI
// clear button
import { DatabaseClearButton } from './ui/DatabaseClearButton.js';
import { TrajectoryToggleButton } from './ui/TrajectoryToggleButton.js';
import { Stats } from './ui/Stats.js';
import { createPointSizeSlider } from './ui/PointSizeSlider.js';

// create three js scene
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';
// Ajoutez cette import en haut de votre index.js
import { setBackgroundLogo, updateBackgroundLogoSize, removeBackgroundLogo } from './init.js';

// Ajoutez cette import en haut de votre index.js avec les autres imports
import { BackgroundController } from './ui/BackgroundController.js';

// 1. AJOUTER cette import en haut de votre index.js avec les autres imports :
import { ViewResetButton } from './ui/ViewResetButton.js';

// NOUVEAU : Import du menu principal
import { MainMenu } from './ui/MainMenu.js';

const SERVER_URL = 'http://0.0.0.0:8080';

// database to store in cache
const dbManager = new DataBaseManager();

// NOUVEAU : Créer l'exporteur PLY
const plyExporter = new PLYExporter();

// MODIFICATION LÉGÈRE : Variable pour stocker le sessionId courant
let currentSessionId = null;

console.log('🎉 Initialisation de la scène 3D...');
const scene = createScene();
const camera = createCamera();
const renderer = createRenderer();
const controls = createControls(camera, renderer.domElement);
const stats = createStats();

// // Ajouter le logo d'arrière-plan APRÈS que le renderer soit ajouté au DOM
// // Petite attente pour s'assurer que le DOM est mis à jour
setTimeout(() => {
    setBackgroundLogo(renderer, './IVM.jpg', 1.0, 1.0);
}, 100);

// Gérer le redimensionnement de la fenêtre pour ajuster le logo
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateBackgroundLogoSize(); // Plus besoin de passer la scene
});

// overlay with stats for GPU and other information
const overlay = new Stats(renderer); // <-- CORRECT !

// worker pour le pcd
let worker = new Worker(new URL('./pointcloud/PointCloudWorker.js', import.meta.url));

// controller pour le pcd
let pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);

// worker pour les poses
let poseWorker = new Worker(new URL('./pose/PoseWorker.js', import.meta.url));

// controller pour les poses
let poseController = new PoseController(scene, camera, renderer, poseWorker);

// ===== CRÉATION DES CONTRÔLEURS UI =====
// Créer tous les contrôleurs comme avant mais sans les ajouter au DOM directement
const dbClearButton = new DatabaseClearButton(dbManager);
const backgroundController = new BackgroundController(renderer, './IVM.jpg', 1.0);
const viewResetButton = new ViewResetButton(scene, camera, controls, { top: '20px', left: '500px' });

// Masquer les anciens éléments UI (ils seront gérés par le menu)
if (dbClearButton.container) dbClearButton.container.style.display = 'none';
if (backgroundController.container) backgroundController.container.style.display = 'none';
if (viewResetButton.button) viewResetButton.button.style.display = 'none';

// Créer le menu principal
const mainMenu = new MainMenu({
    position: { top: '20px', right: '20px' },
    collapsed: false
});

// Connecter tous les contrôleurs au menu
mainMenu.connectControllers({
    database: dbClearButton,
    background: backgroundController,
    viewReset: viewResetButton,
    pointCloud: pcController,
    stats: overlay
});

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

// MODIFICATION LÉGÈRE : Fonction pour générer un nom de fichier basé sur sessionId
function generatePLYFilename() {
    if (!currentSessionId) {
        // Fallback si pas de sessionId disponible
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `pointcloud_${timestamp}`;
    }
    
    // Nettoyer le sessionId pour en faire un nom de fichier valide
    const cleanSessionId = currentSessionId
        .replace(/[^a-zA-Z0-9\-_]/g, '_')  // Remplacer les caractères spéciaux par _
        .replace(/_{2,}/g, '_');           // Remplacer les _ multiples par un seul
    
    return cleanSessionId;
}

// NOUVEAU : Fonction d'export PLY à la fin du stream
async function exportPointCloudOnStreamEnd() {
    try {
        console.log('🚀 Export PLY automatique en fin de stream...');
        
        // MODIFICATION : Utiliser le générateur de nom de fichier
        const filename = generatePLYFilename();
        console.log(`📁 Nom de fichier PLY: ${filename}.ply`);
        
        // Export du point cloud actuellement affiché
        const success = await plyExporter.exportFromController(
            pcController, 
            filename
        );
        
        if (success) {
            console.log('✅ Export PLY automatique réussi');
        } else {
            console.warn('⚠️ Export PLY automatique échoué');
        }
        
        return success;
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'export PLY automatique:', error);
        return false;
    }
}

// ===== API GLOBALE SIMPLIFIÉE =====
// API globale pour contrôler le menu
window.mainMenu = {
    toggle: () => mainMenu.toggleVisibility(),
    collapse: () => mainMenu.toggleCollapse(),
    setPosition: (top, right) => mainMenu.setPosition(top, right),
    setTheme: (theme) => mainMenu.setTheme(theme),
    show: () => mainMenu.container.style.display = 'block',
    hide: () => mainMenu.container.style.display = 'none'
};

// MODIFICATION LÉGÈRE : API globale pour l'export PLY manuel
window.plyExport = {
    exportNow: () => {
        const filename = generatePLYFilename();
        console.log(`📁 Export PLY manuel: ${filename}.ply`);
        return plyExporter.exportFromController(pcController, filename);
    }
};

// Garder cette méthode importante
window.stopSessionMonitoring = () => {
    monitor.stop();
};

// Ajouter un raccourci clavier pour ouvrir/fermer le menu
document.addEventListener('keydown', (e) => {
    if (e.key === 'M' && e.ctrlKey) {
        e.preventDefault();
        mainMenu.toggleVisibility();
    }
    
    // MODIFICATION LÉGÈRE : Raccourci pour export PLY manuel (Ctrl + E)
    if (e.key === 'E' && e.ctrlKey) {
        e.preventDefault();
        console.log('🎯 Export PLY manuel déclenché');
        const filename = generatePLYFilename();
        console.log(`📁 Export PLY manuel: ${filename}.ply`);
        plyExporter.exportFromController(pcController, filename);
    }
});

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

            // MODIFICATION LÉGÈRE : Stocker seulement le sessionId
            currentSessionId = sessionInfo.sessionId;
            console.log("📋 SessionId stocké:", currentSessionId);

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
                
                // Terminer les anciens workers
                if (worker) worker.terminate();
                if (poseWorker) poseWorker.terminate();
                
                // Recréer tout
                worker = new Worker(new URL('./pointcloud/PointCloudWorker.js', import.meta.url));
                pcController = new PointCloudController(scene, camera, renderer, worker, dbManager);
                
                poseWorker = new Worker(new URL('./pose/PoseWorker.js', import.meta.url));
                poseController = new PoseController(scene, camera, renderer, poseWorker);
                
                // Recréer et connecter le bouton trajectoire au menu
                const trajectoryToggleBtn = new TrajectoryToggleButton(poseController);
                if (trajectoryToggleBtn.button) trajectoryToggleBtn.button.style.display = 'none';
                mainMenu.connectController('trajectory', trajectoryToggleBtn);
                
                // Reconnecter le nouveau pcController au menu
                mainMenu.connectController('pointCloud', pcController);
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

            console.warn("🔁 Fin du flux détectée. Export PLY et redémarrage du monitoring...");
            
            // NOUVEAU : Export automatique à la fin du stream
            await exportPointCloudOnStreamEnd();

        } catch (error) {
            console.error("Erreur détectée:", error);
            
            // NOUVEAU : Export PLY aussi en cas d'erreur (fin de stream détectée par erreur)
            console.log("🚨 Erreur détectée - Export PLY avant redémarrage...");
            await exportPointCloudOnStreamEnd();
            
            console.log("Nouvelle tentative dans 5 secondes...");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

console.log('✅ Menu principal initialisé avec tous les contrôleurs');
mainLoop();
