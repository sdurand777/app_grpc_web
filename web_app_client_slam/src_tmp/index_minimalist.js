// index.js - Version de test pour déboguer
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
import { StreamManager } from './StreamManager.js'; // Version originale
import { PageProtector } from './PageProtector.js';
import PointCloudWorker from './PointCloudWorker.js';
import PoseWorker from './PoseWorker.js';

// ========== Packet Metrics ==========
let receivedPackets = 0;
let packetsPerSecond = 0;

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

// ========== Debug Panel ==========
function createDebugPanel() {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 5px;
        min-width: 200px;
    `;
    document.body.appendChild(panel);
    
    setInterval(() => {
        panel.innerHTML = `
            <div>Stream: ${streamManager.status}</div>
            <div>Packets/s: ${packetsPerSecond}</div>
            <div>Points: ${pcController.getTotalPoints ? pcController.getTotalPoints() : 0}</div>
            <div>FPS: ${Math.round(1000 / (stats.domElement.innerText.match(/(\d+) fps/)?.[1] || 60))}</div>
        `;
    }, 500);
}

// ========== Stream Manager ==========
const streamManager = new StreamManager('http://192.168.51.30:8080');

let pointsReceived = 0;
let posesReceived = 0;

// Configuration des callbacks du stream avec debug
streamManager.setCallbacks({
    onPointCloudData: (data) => {
        if (data && data.pointcloudlist && data.pointcloudlist.pointclouds) {
            const totalPoints = data.pointcloudlist.pointclouds.reduce(
                (sum, pc) => sum + (pc.points?.length || 0), 0
            );
            pointsReceived += totalPoints;
            console.log(`Points received: ${totalPoints}, Total: ${pointsReceived}`);
        }
        pcController.processRaw(data);
    },
    onPoseData: (data) => {
        if (data && data.poses) {
            posesReceived += data.poses.length;
            console.log(`Poses received: ${data.poses.length}, Total: ${posesReceived}`);
        }
        poseController.processRaw(data);
    },
    onPacketReceived: () => receivedPackets++,
    onError: (streamType, error) => console.error(`Stream ${streamType} error:`, error),
    onStatusChange: (status, error) => {
        console.log(`Stream status: ${status}`);
        if (error) console.error('Stream error:', error);
    }
});

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

// ========== Test Controls ==========
function addTestControls() {
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
    
    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Restart Stream';
    restartBtn.style.cssText = `
        padding: 5px 10px;
        margin: 5px;
        cursor: pointer;
    `;
    restartBtn.onclick = async () => {
        console.log('Restarting stream...');
        await streamManager.restart();
    };
    
    const clearSceneBtn = document.createElement('button');
    clearSceneBtn.textContent = 'Clear Scene';
    clearSceneBtn.style.cssText = `
        padding: 5px 10px;
        margin: 5px;
        cursor: pointer;
    `;
    clearSceneBtn.onclick = () => {
        console.log('Clearing scene...');
        sceneManager.clearScene();
        pointsReceived = 0;
        posesReceived = 0;
    };
    
    controlPanel.appendChild(restartBtn);
    controlPanel.appendChild(clearSceneBtn);
    document.body.appendChild(controlPanel);
}

// ========== Initialization ==========
function initializeApp() {
    console.log('Initializing application (test version)...');
    
    // Setup UI
    createPointSizeSlider(pcController, { initial: 0.01 });
    setupResize(camera, renderer);
    createDebugPanel();
    addTestControls();
    
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
}

// ========== Application Start ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========== Debug Interface ==========
window.debugApp = {
    pcController,
    poseController,
    streamManager,
    pageProtector,
    getPacketRate: () => packetsPerSecond,
    getReceivedPackets: () => receivedPackets,
    getPointsReceived: () => pointsReceived,
    getPosesReceived: () => posesReceived
};
