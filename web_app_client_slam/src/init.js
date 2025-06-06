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

export function setBackgroundLogo(renderer, logoPath = './IVM.jpg', opacity = 0.3, sizePercent = 0.8, theme = 'default') {
    // Définir les couleurs selon le thème
    const themeColors = {
        darker: {
            whitePixels: [50, 50, 50],
            blackPixels: [0, 0, 0],
            backgroundColor: [50/255, 50/255, 50/255] // Même couleur que les pixels blancs
        },
        default: {
            whitePixels: [100, 100, 100],
            blackPixels: [50, 50, 50],
            backgroundColor: [100/255, 100/255, 100/255] // Même couleur que les pixels blancs
        },
        brighter: {
            whitePixels: [150, 150, 150],
            blackPixels: [100, 100, 100],
            backgroundColor: [150/255, 150/255, 150/255] // Même couleur que les pixels blancs
        }
    };
    
    const currentTheme = themeColors[theme] || themeColors.default;
    
    // Appliquer la couleur de fond du renderer pour avoir un fond uniforme
    const [bgR, bgG, bgB] = currentTheme.backgroundColor;
    renderer.setClearColor(new THREE.Color(bgR, bgG, bgB), 0.0);
    
    // NOUVEAU : Appliquer la même couleur au background de la page HTML
    const [r, g, b] = currentTheme.whitePixels;
    document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    
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
    
    // NOUVEAU : Appliquer la couleur de fond au canvas du logo aussi
    logoCanvas.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    
    // Ajouter le canvas au DOM - utiliser document.body si parentElement n'existe pas
    const parent = renderer.domElement.parentElement || document.body;
    parent.appendChild(logoCanvas);
    
    // Redimensionner le canvas
    function resizeLogoCanvas() {
        logoCanvas.width = window.innerWidth;
        logoCanvas.height = window.innerHeight;
        drawLogo();
    }
    
    // Fonction pour traiter l'image selon le thème (comme dans Open3D)
    function processImageData(imageData, theme) {
        const data = imageData.data;
        const threshold = 128;
        const colors = themeColors[theme] || themeColors.default;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Appliquer le seuillage binaire
            const gray = (r + g + b) / 3;
            let newR, newG, newB;
            
            if (gray > threshold) {
                // Pixels blancs - utiliser les couleurs du thème
                [newR, newG, newB] = colors.whitePixels;
            } else {
                // Pixels noirs - utiliser les couleurs du thème
                [newR, newG, newB] = colors.blackPixels;
            }
            
            data[i] = newR;     // R
            data[i + 1] = newG; // G
            data[i + 2] = newB; // B
            // data[i + 3] reste inchangé (alpha)
        }
        
        return imageData;
    }
    
    // Fonction pour dessiner le logo
    function drawLogo() {
        const ctx = logoCanvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // Appliquer la couleur de fond au canvas
            const [r, g, b] = currentTheme.whitePixels;
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(0, 0, logoCanvas.width, logoCanvas.height);
            
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
            
            // Dessiner l'image originale dans un canvas temporaire pour la traiter
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = drawWidth;
            tempCanvas.height = drawHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Dessiner l'image redimensionnée
            tempCtx.drawImage(img, 0, 0, drawWidth, drawHeight);
            
            // Récupérer les données de pixels
            const imageData = tempCtx.getImageData(0, 0, drawWidth, drawHeight);
            
            // Traiter l'image selon le thème
            const processedImageData = processImageData(imageData, theme);
            
            // Remettre les données traitées
            tempCtx.putImageData(processedImageData, 0, 0);
            
            // Dessiner l'image traitée sur le canvas principal
            ctx.drawImage(tempCanvas, x, y);
            
            console.log(`✅ Logo d'arrière-plan chargé avec succès (${sizePercent * 100}% centré, thème: ${theme})`);
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
