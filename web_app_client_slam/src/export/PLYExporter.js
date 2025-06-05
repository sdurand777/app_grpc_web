// PLYExporter.js - Export uniquement avec Three.js
import { PLYExporter as ThreePLYExporter } from 'three/addons/exporters/PLYExporter.js';
import * as THREE from 'three';

export class PLYExporter {
    constructor() {
        this.exporter = new ThreePLYExporter();
        this.isExporting = false;
    }

    /**
     * Exporte le point cloud depuis le PointCloudController
     * @param {PointCloudController} pcController
     * @param {string} filename
     * @param {boolean} binary - Export en binaire (plus rapide) ou ASCII
     */
    async exportFromController(pcController, filename = 'pointcloud', binary = false) {
        if (this.isExporting) {
            console.warn('🚫 Export déjà en cours...');
            return false;
        }

        try {
            this.isExporting = true;
            console.log('📤 Début export PLY...');

            if (!pcController || !pcController.points || pcController.displayCount === 0) {
                console.warn('⚠️ Aucun point à exporter');
                return false;
            }

            // Créer un objet Points avec seulement les points valides
            const validPointsObject = this._createValidPointsObject(pcController);
            
            // Utiliser l'exporteur Three.js
            const result = this.exporter.parse(validPointsObject, { binary });
            
            // Générer nom de fichier avec timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const finalFilename = `${filename}_${timestamp}`;
            
            // Télécharger le fichier
            await this._downloadFile(result, `${finalFilename}.ply`, binary);
            
            console.log(`✅ Export PLY terminé: ${finalFilename}.ply (${pcController.displayCount} points)`);
            return true;

        } catch (error) {
            console.error('❌ Erreur lors de l\'export PLY:', error);
            return false;
        } finally {
            this.isExporting = false;
        }
    }

    /**
     * Crée un objet Points avec seulement les points valides du controller
     * @private
     */
    _createValidPointsObject(pcController) {
        const geometry = new THREE.BufferGeometry();
        
        // Créer des tableaux de la bonne taille (seulement les points affichés)
        const pointCount = pcController.displayCount;
        const positions = new Float32Array(pointCount * 3);
        const colors = new Float32Array(pointCount * 3);

        // Copier seulement les données valides
        for (let i = 0; i < pointCount * 3; i++) {
            positions[i] = pcController.posArr[i];
            colors[i] = pcController.colArr[i];
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({ 
            vertexColors: true, 
            size: pcController.points.material.size 
        });
        
        return new THREE.Points(geometry, material);
    }

    /**
     * Télécharge le fichier PLY
     * @private
     */
    async _downloadFile(content, filename, binary = false) {
        const blob = binary 
            ? new Blob([content], { type: 'application/octet-stream' })
            : new Blob([content], { type: 'text/plain' });
            
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Nettoyer l'URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
