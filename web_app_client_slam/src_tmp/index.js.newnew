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
import { StreamManager } from './StreamManager.js';
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

// ========== Stream Manager ==========
const streamManager = new StreamManager('http://192.168.51.30:8080');

// Configuration des callbacks du stream
streamManager.setCallbacks({
    onPointCloudData: (data) => pcController.processRaw(data),
    onPoseData: (data) => poseController.processRaw(data),
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

// ========== Initialization ==========
function initializeApp() {
    console.log('Initializing application...');
    
    // Setup UI
    createPointSizeSlider(pcController, { initial: 0.01 });
    setupResize(camera, renderer);
    
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
    getReceivedPackets: () => receivedPackets
};
