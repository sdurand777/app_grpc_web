// File: src/ui/ViewResetButton.js
import * as THREE from 'three';

export class ViewResetButton {
    constructor(scene, camera, controls, position = { top: '20px', left: '20px' }) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        
        this.createButton(position);
    }
    
    createButton(position) {
        // Créer le bouton
        this.button = document.createElement('button');
        this.button.innerHTML = '🎯'; // Icône de cible
        this.button.title = 'Reset View'; // Tooltip
        this.button.id = 'view-reset-button';
        
        // Style du bouton
        this.button.style.cssText = `
            position: absolute;
            top: ${position.top};
            left: ${position.left};
            width: 50px;
            height: 50px;
            background: rgba(40, 40, 40, 0.9);
            color: white;
            border: 2px solid #194F8C;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            z-index: 1000;
            user-select: none;
        `;
        
        // Effets hover et active
        this.button.addEventListener('mouseenter', () => {
            this.button.style.background = 'rgba(60, 60, 60, 0.95)';
            this.button.style.borderColor = '#ff6600';
            this.button.style.transform = 'scale(1.05)';
        });
        
        this.button.addEventListener('mouseleave', () => {
            this.button.style.background = 'rgba(40, 40, 40, 0.9)';
            this.button.style.borderColor = '#194F8C';
            this.button.style.transform = 'scale(1)';
        });
        
        this.button.addEventListener('mousedown', () => {
            this.button.style.transform = 'scale(0.95)';
            this.button.style.background = 'rgba(80, 80, 80, 0.95)';
        });
        
        this.button.addEventListener('mouseup', () => {
            this.button.style.transform = 'scale(1.05)';
        });
        
        // Événement click
        this.button.addEventListener('click', () => {
            this.resetView();
        });
        
        // Ajouter au DOM
        document.body.appendChild(this.button);
        
        console.log('✅ Bouton Reset View créé');
    }
    
    resetView() {
        console.log('🎯 Reset de la vue...');
        
        // 1. Log des points affichés (comme dans votre code)
        this.scene.traverse(obj => {
            if (obj.isPoints) {
                // drawRange.count = nombre de points effectivement affichés
                const drawRangeCount = obj.geometry.drawRange.count;
                console.log('Nombre de points affichés:', drawRangeCount);
                // Optionnel : log de la taille totale possible
                const attr = obj.geometry.getAttribute('position');
                if (attr) {
                    console.log('Nombre de points max dans le buffer:', attr.count);
                }
            }
        });
        
        // 2. Calculer la bounding box de toute la scène
        const box = new THREE.Box3().setFromObject(this.scene);
        
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            console.log('Bounding box:', box);
            console.log("Bounding box:", box.min, box.max, size);
            console.log("maxDim:", maxDim);
            console.log("center:", center);
            
            // 3. Recentrer le controls.target
            this.controls.target.copy(center);
            
            // 4. Placer la caméra à distance pour tout voir
            const fov = this.camera.fov * (Math.PI / 180);
            const distance = maxDim / (2 * Math.tan(fov / 2));
            
            // Direction depuis le centre vers la caméra actuelle (garde l'angle de vue utilisateur)
            const direction = this.camera.position.clone().sub(this.controls.target).normalize();
            this.camera.position.copy(center.clone().add(direction.multiplyScalar(distance * 1.2)));
            
            // 5. Ajuster near/far pour la scène
            this.camera.near = Math.max(0.1, distance * 0.1);
            this.camera.far = distance * 10;
            this.camera.updateProjectionMatrix();
            
            // 6. Regarder le centre (sécurité)
            this.camera.lookAt(center);
            
            // 7. Synchroniser OrbitControls
            this.controls.update();
            
            // Feedback visuel sur le bouton
            this.showFeedback();
            
            console.log('✅ Vue réinitialisée avec succès');
        } else {
            console.warn('⚠️ Aucun objet trouvé dans la scène pour calculer la vue');
            this.showErrorFeedback();
        }
    }
    
    // Feedback visuel de succès
    showFeedback() {
        const originalBorder = this.button.style.borderColor;
        const originalBackground = this.button.style.background;
        
        // Animation de succès (vert)
        this.button.style.borderColor = '#00ff00';
        this.button.style.background = 'rgba(0, 255, 0, 0.2)';
        
        setTimeout(() => {
            this.button.style.borderColor = originalBorder;
            this.button.style.background = originalBackground;
        }, 300);
    }
    
    // Feedback visuel d'erreur
    showErrorFeedback() {
        const originalBorder = this.button.style.borderColor;
        const originalBackground = this.button.style.background;
        
        // Animation d'erreur (rouge)
        this.button.style.borderColor = '#ff0000';
        this.button.style.background = 'rgba(255, 0, 0, 0.2)';
        
        setTimeout(() => {
            this.button.style.borderColor = originalBorder;
            this.button.style.background = originalBackground;
        }, 500);
    }
    
    // Méthode pour changer la position du bouton
    setPosition(top, left) {
        this.button.style.top = top;
        this.button.style.left = left;
    }
    
    // Méthode pour masquer/afficher le bouton
    toggle() {
        const isVisible = this.button.style.display !== 'none';
        this.button.style.display = isVisible ? 'none' : 'flex';
    }
    
    // Méthode pour changer l'icône
    setIcon(icon) {
        this.button.innerHTML = icon;
    }
    
    // Méthode pour changer le style
    setStyle(styleObject) {
        Object.assign(this.button.style, styleObject);
    }
    
    // Méthode pour supprimer le bouton
    dispose() {
        if (this.button && this.button.parentNode) {
            this.button.parentNode.removeChild(this.button);
        }
    }
}
