// index.js - Version mise à jour pour la version simplifiée
import { createScene, createCamera, createRenderer, createControls, createStats } from './init.js';
import { PointCloudController } from './PointCloudController.js';
import { PoseController } from './PoseController.js';
import { ResetButton } from './ResetButton.js';
import { TrajectoryToggleButton } from './TrajectoryToggleButton.js';
import { setupResize } from './ResizeHandler.js';
import { animate } from './AnimationLoop.js';
import { UIOverlay } from './UIOverlay.js';
import { SceneManager } from './SceneManager.js';
import { createPointSizeSlider } from './PointSizeSlider.js';
import { EnhancedStreamManager } from './EnhancedStreamManager.js';
import { DatabaseManager } from './DatabaseManager.js';
import { PageProtector } from './PageProtector.js';

// ========== Packet Metrics ==========
let receivedPackets = 0;
let packetsPerSecond = 0;
let pointsReceived = 0;
let posesReceived = 0;

const packetTimer = setInterval(() => {
  packetsPerSecond = receivedPackets;
  receivedPackets = 0;
}, 1000);

// ========== Scene Setup ==========
const scene = createScene();
const camera = createCamera();
const renderer = createRenderer();
const controls = createControls(camera, renderer.domElement);
const stats = createStats();

// ========== Database ==========
const db = new DatabaseManager();

// ========== Workers & Controllers ==========
const worker = new Worker(new URL('./PointCloudWorker.js', import.meta.url));
const poseworker = new Worker(new URL('./PoseWorker.js', import.meta.url));
const pcController = new PointCloudController(scene, camera, renderer, worker);
const poseController = new PoseController(scene, camera, renderer, poseworker);

// ========== UI ==========
const uiOverlay = new UIOverlay(renderer);
const sceneManager = new SceneManager(scene);
const resetButton = new ResetButton(sceneManager, camera, controls);
const trajectoryToggleBtn = new TrajectoryToggleButton(poseController);

// ========== Session UI Element ==========
function createSessionUI() {
    const sessionInfo = document.createElement('div');
    sessionInfo.id = 'session-info';
    sessionInfo.style.cssText = `
        position: absolute;
        top: 10px;
        right: 200px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 5px;
        width: 250px;
        display: none;
    `;
    document.body.appendChild(sessionInfo);
    return sessionInfo;
}

const sessionInfoElement = createSessionUI();

async function updateSessionUI(sessionStatus) {
    if (sessionStatus) {
        sessionInfoElement.innerHTML = `
            <div>Session ID: ${sessionStatus.sessionId.substring(0, 20)}...</div>
            <div>Status: ${sessionStatus.isNewSession ? 'New Session' : 'Resuming Session'}</div>
            <div>Local: ${sessionStatus.isLocal ? 'Yes' : 'No'}</div>
            <div id="storage-info"></div>
        `;
        sessionInfoElement.style.display = 'block';
        
        // Mettre à jour les infos de stockage
        updateStorageInfo();
    }
}

async function updateStorageInfo() {
    const storageInfo = await db.getStorageInfo();
    const storageElement = document.getElementById('storage-info');
    if (storageInfo && storageElement) {
        const usage = storageInfo.storage?.usageInMB || 0;
        storageElement.innerHTML = `Storage: ${usage} MB`;
    }
}

// ========== Stream Manager ==========
const streamManager = new EnhancedStreamManager('http://192.168.51.30:8080');

// Configuration des callbacks du stream
streamManager.setCallbacks({
    onPointCloudData: (data, sessionId) => {
        if (data) {
            const pointCount = countPointsInData(data);
            pointsReceived += pointCount;
            console.log(`Points received: ${pointCount}, Total: ${pointsReceived}, Session: ${sessionId}`);
        }
        pcController.processRaw(data, sessionId);
    },
    
    onPoseData: (data, sessionId) => {
        if (data) {
            const poseCount = countPosesInData(data);
            posesReceived += poseCount;
            console.log(`Poses received: ${poseCount}, Total: ${posesReceived}, Session: ${sessionId}`);
        }
        poseController.processRaw(data, sessionId);
    },
    
    onPacketReceived: () => receivedPackets++,
    
    onError: (streamType, error) => console.error(`Stream ${streamType} error:`, error),
    
    onStatusChange: (status, error) => {
        console.log(`Stream status: ${status}`);
        if (error) console.error('Stream error:', error);
    },
    
    onSessionUpdate: async (sessionStatus) => {
        console.log('Session update:', sessionStatus);
        updateSessionUI(sessionStatus);
        
        // Mettre à jour les controllers avec le nouveau sessionId
        pcController.setSessionId(sessionStatus.sessionId);
        poseController.setSessionId(sessionStatus.sessionId);
        
        // Sauvegarder la session dans la DB
        await db.saveSession(sessionStatus);
        await db.setCurrentSessionId(sessionStatus.sessionId);
        
        // Si c'est une nouvelle session, nettoyer la scène
        if (sessionStatus.isNewSession) {
            sceneManager.clearScene();
            pcController.clearScene();
            poseController.clearTrajectory();
            console.log('Scene cleared for new session');
        } else {
            // Charger les données existantes pour cette session
            console.log('Loading existing session data...');
            await pcController.loadFromSession(sessionStatus.sessionId);
            await poseController.loadFromSession(sessionStatus.sessionId);
        }
    }
});

// ========== Helper Functions ==========
function countPointsInData(data) {
    let count = 0;
    if (data.pointcloudlist?.pointclouds) {
        data.pointcloudlist.pointclouds.forEach(pc => {
            count += pc.points?.length || 0;
        });
    }
    return count;
}

function countPosesInData(data) {
    if (data.poses) return data.poses.length;
    if (data.poselist?.poses) return data.poselist.poses.length;
    return 0;
}

// ========== Cleanup ==========
function cleanup() {
    streamManager.stop();
    clearInterval(packetTimer);
    if (worker) worker.terminate();
    if (poseworker) poseworker.terminate();
    console.log('Application cleanup completed');
}

// ========== Page Protection ==========
const pageProtector = new PageProtector({
    onBeforeLeave: cleanup,
    onLeave: (reason) => console.log(`Leaving page: ${reason}`)
});

// ========== Controls ==========
function addDebugControls() {
    const controlPanel = document.createElement('div');
    controlPanel.style.cssText = `
        position: absolute;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 5px;
    `;
    
    const newSessionBtn = document.createElement('button');
    newSessionBtn.textContent = 'New Session';
    newSessionBtn.style.cssText = `
        padding: 5px 10px;
        margin: 5px;
        cursor: pointer;
    `;
    newSessionBtn.onclick = async () => {
        if (confirm('Start a new session? Current data will be preserved.')) {
            console.log('Starting new session...');
            sceneManager.clearScene();
            pcController.clearScene();
            poseController.clearTrajectory();
            await streamManager.forceNewSession();
        }
    };
    
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.textContent = 'Clear All Data';
    clearCacheBtn.style.cssText = `
        padding: 5px 10px;
        margin: 5px;
        cursor: pointer;
    `;
    clearCacheBtn.onclick = async () => {
        if (confirm('Clear all cached data? This cannot be undone.')) {
            await db.clearAll();
            updateStorageInfo();
            alert('All data cleared');
        }
    };
    
    const loadSessionBtn = document.createElement('button');
    loadSessionBtn.textContent = 'Load Session';
    loadSessionBtn.style.cssText = `
        padding: 5px 10px;
        margin: 5px;
        cursor: pointer;
    `;
    loadSessionBtn.onclick = async () => {
        const sessionId = prompt('Enter session ID to load:');
        if (sessionId) {
            const session = await db.getSession(sessionId);
            if (session) {
                console.log('Loading session:', sessionId);
                pcController.clearScene();
                poseController.clearTrajectory();
                await pcController.loadFromSession(sessionId);
                await poseController.loadFromSession(sessionId);
                alert(`Session ${sessionId} loaded`);
            } else {
                alert('Session not found');
            }
        }
    };
    
    controlPanel.appendChild(newSessionBtn);
    controlPanel.appendChild(loadSessionBtn);
    controlPanel.appendChild(clearCacheBtn);
    document.body.appendChild(controlPanel);
}

// ========== Initialization ==========
async function initializeApp() {
    console.log('Initializing application...');
    
    try {
        // Initialize database
        await db.init();
        console.log('Database initialized');
        
        // Initialize controllers with database
        await pcController.initDatabase(db);
        await poseController.initDatabase(db);
        
        // Setup UI
        createPointSizeSlider(pcController, { initial: 0.01 });
        setupResize(camera, renderer);
        addDebugControls();
        
        // Check for existing session
        const currentSession = await db.getCurrentSession();
        if (currentSession) {
            console.log('Found existing session:', currentSession.sessionId);
            // The session will be validated when streaming starts
        }
        
        // Start streaming
        streamManager.start();
        
        // Start animation loop
        animate({ 
            renderer, 
            scene, 
            camera, 
            controls, 
            stats, 
            uiOverlay, 
            pcController, 
            getPacketRate: () => packetsPerSecond 
        });
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
}

// ========== Application Start ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========== Debug Interface ==========
window.debugApp = {
    db,
    pcController,
    poseController,
    streamManager,
    pageProtector,
    getPacketRate: () => packetsPerSecond,
    getReceivedPackets: () => receivedPackets,
    getSessionInfo: () => streamManager.sessionId,
    forceNewSession: () => streamManager.forceNewSession(),
    clearCache: () => db.clearAll(),
    loadSession: (sessionId) => {
        pcController.loadFromSession(sessionId);
        poseController.loadFromSession(sessionId);
    }
};
