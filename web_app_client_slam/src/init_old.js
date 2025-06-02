// File: src/init.js
import * as THREE from 'three';
import Stats from 'stats.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene() {
    const scene = new THREE.Scene();
    return scene;
}

export function createCamera() {
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 0, 5);
    return camera;
}

export function createRenderer() {
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true // Permettre la transparence pour voir le logo en arrière-plan
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color(0.39, 0.39, 0.39), 0.8); // Couleur avec alpha pour transparence partielle
    document.body.appendChild(renderer.domElement);
    return renderer;
}

export function createControls(camera, domElement) {
    const controls = new OrbitControls(camera, domElement);
    //controls.enableDamping = true;
    return controls;
}

export function createStats() {
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    return stats;
}

export function setBackgroundLogo(renderer, logoPath = './IVM.jpg', opacity = 0.3, sizePercent = 0.8) {
    // Créer un élément canvas pour le logo en filigrane
    const logoCanvas = document.createElement('canvas');
    logoCanvas.style.position = 'absolute';
    logoCanvas.style.top = '0';
    logoCanvas.style.left = '0';
    logoCanvas.style.width = '100%';
    logoCanvas.style.height = '100%';
    logoCanvas.style.pointerEvents = 'none'; // Ne pas intercepter les événements de souris
    logoCanvas.style.zIndex = '-1'; // DERRIÈRE le canvas Three.js
    logoCanvas.style.opacity = opacity.toString();
    logoCanvas.id = 'backgroundLogo';
    
    // Ajouter le canvas au DOM - utiliser document.body si parentElement n'existe pas
    const parent = renderer.domElement.parentElement || document.body;
    parent.appendChild(logoCanvas);
    
    // Redimensionner le canvas
    function resizeLogoCanvas() {
        logoCanvas.width = window.innerWidth;
        logoCanvas.height = window.innerHeight;
        drawLogo();
    }
    
    // Fonction pour dessiner le logo
    function drawLogo() {
        const ctx = logoCanvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // Effacer le canvas
            ctx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
            
            // Calculer les dimensions pour le pourcentage spécifié de l'écran
            const maxWidth = logoCanvas.width * sizePercent;
            const maxHeight = logoCanvas.height * sizePercent;
            
            // Calculer les dimensions en gardant le ratio de l'image
            const imageAspect = img.width / img.height;
            let drawWidth, drawHeight;
            
            if (maxWidth / maxHeight > imageAspect) {
                // Limité par la hauteur
                drawHeight = maxHeight;
                drawWidth = maxHeight * imageAspect;
            } else {
                // Limité par la largeur
                drawWidth = maxWidth;
                drawHeight = maxWidth / imageAspect;
            }
            
            // Centrer l'image
            const x = (logoCanvas.width - drawWidth) / 2;
            const y = (logoCanvas.height - drawHeight) / 2;
            
            // Dessiner l'image
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
            
            console.log(`✅ Logo d'arrière-plan chargé avec succès (${sizePercent * 100}% centré)`);
        };
        
        img.onerror = function() {
            console.error('❌ Erreur lors du chargement du logo:', logoPath);
            console.log('Vérifiez que le fichier existe dans le répertoire racine');
        };
        
        img.src = logoPath;
    }
    
    // Redimensionner initialement
    resizeLogoCanvas();
    
    // Écouter les redimensionnements
    window.addEventListener('resize', resizeLogoCanvas);
    
    return logoCanvas;
}

export function updateBackgroundLogoSize() {
    const logoCanvas = document.getElementById('backgroundLogo');
    if (logoCanvas) {
        logoCanvas.width = window.innerWidth;
        logoCanvas.height = window.innerHeight;
        // Le redraw sera géré automatiquement par l'événement resize
    }
}

export function removeBackgroundLogo() {
    const logoCanvas = document.getElementById('backgroundLogo');
    if (logoCanvas) {
        logoCanvas.remove();
        console.log('🗑️ Logo d\'arrière-plan supprimé');
    }
}

export function resetScene(scene) {
    while (scene.children.length > 0) {
        const child = scene.children[0];
        scene.remove(child);

        // Si l'objet a des ressources (géométrie, matériaux, textures), les libérer
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                    if (mat.map) mat.map.dispose();
                    mat.dispose();
                });
            } else {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        }

        // Si l'objet est un groupe ou a des enfants, les nettoyer aussi
        if (child.children && child.children.length > 0) {
            resetScene(child);
        }
    }
}
