// File: src/ui/BackgroundController.js
import { removeBackgroundLogo, setBackgroundLogo } from '../init.js';

export class BackgroundController {
    constructor(renderer, logoPath = './IVM.jpg', sizePercent = 0.8) {
        this.renderer = renderer;
        this.logoPath = logoPath;
        this.sizePercent = sizePercent; // Ajouter le paramètre de taille
        this.currentTheme = 'default';
        
        // Thèmes disponibles
        this.themes = {
            darker: {
                name: 'Darker',
                opacity: 0.8,
                buttonColor: '#ff6600', // Orange actif
                inactiveColor: '#194F8C' // Bleu inactif
            },
            default: {
                name: 'Default', 
                opacity: 0.8,
                buttonColor: '#ff6600',
                inactiveColor: '#194F8C'
            },
            brighter: {
                name: 'Brighter',
                opacity: 0.8,
                buttonColor: '#ff6600',
                inactiveColor: '#194F8C'
            }
        };
        
        this.createUI();
        this.setTheme('default'); // Thème par défaut
    }
    
    createUI() {
        // Conteneur principal
        this.container = document.createElement('div');
        this.container.id = 'background-controller';
        this.container.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(40, 40, 40, 0.9);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            font-family: Arial, sans-serif;
            z-index: 1000;
            min-width: 200px;
        `;
        
        // Label
        const label = document.createElement('div');
        label.textContent = 'Background';
        label.style.cssText = `
            color: white;
            font-size: 14px;
            margin-bottom: 10px;
            font-weight: bold;
        `;
        this.container.appendChild(label);
        
        // Conteneur des boutons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        `;
        
        // Créer les boutons pour chaque thème
        this.buttons = {};
        Object.keys(this.themes).forEach(themeKey => {
            const theme = this.themes[themeKey];
            const button = document.createElement('button');
            button.textContent = theme.name;
            button.style.cssText = `
                background-color: ${theme.inactiveColor};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 12px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                transition: all 0.3s ease;
                flex: 1;
                min-width: 60px;
            `;
            
            // Effet hover
            button.addEventListener('mouseenter', () => {
                if (this.currentTheme !== themeKey) {
                    button.style.backgroundColor = '#2a5ba0';
                }
            });
            
            button.addEventListener('mouseleave', () => {
                if (this.currentTheme !== themeKey) {
                    button.style.backgroundColor = theme.inactiveColor;
                }
            });
            
            // Click handler
            button.addEventListener('click', () => {
                this.setTheme(themeKey);
            });
            
            this.buttons[themeKey] = button;
            buttonsContainer.appendChild(button);
        });
        
        this.container.appendChild(buttonsContainer);
        
        // Ajouter au DOM
        document.body.appendChild(this.container);
    }
    
    setTheme(themeKey) {
        if (!this.themes[themeKey] || this.currentTheme === themeKey) return;
        
        const theme = this.themes[themeKey];
        this.currentTheme = themeKey;
        
        // Supprimer l'ancien logo
        removeBackgroundLogo();
        
        // Ajouter le nouveau logo avec la nouvelle opacité et le thème
        // La couleur de fond est maintenant gérée dans setBackgroundLogo
        setTimeout(() => {
            setBackgroundLogo(this.renderer, this.logoPath, theme.opacity, this.sizePercent, themeKey);
        }, 50);
        
        // Mettre à jour l'apparence des boutons
        Object.keys(this.buttons).forEach(key => {
            const button = this.buttons[key];
            const buttonTheme = this.themes[key];
            
            if (key === themeKey) {
                // Bouton actif
                button.style.backgroundColor = buttonTheme.buttonColor;
            } else {
                // Bouton inactif
                button.style.backgroundColor = buttonTheme.inactiveColor;
            }
        });
        
        console.log(`🎨 Thème changé vers: ${theme.name}`);
    }
    
    // Méthode pour masquer/afficher le contrôleur
    toggle() {
        const isVisible = this.container.style.display !== 'none';
        this.container.style.display = isVisible ? 'none' : 'block';
    }
    
    // Méthode pour changer la position
    setPosition(top, right) {
        this.container.style.top = top;
        this.container.style.right = right;
    }
    
    // Méthode pour changer la taille du logo
    setSize(sizePercent) {
        this.sizePercent = sizePercent;
        // Reappliquer le thème actuel avec la nouvelle taille
        this.setTheme(this.currentTheme);
    }
    
    // Méthode pour supprimer le contrôleur
    dispose() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
    
    // Méthode pour ajouter un thème personnalisé
    addCustomTheme(key, config) {
        this.themes[key] = {
            name: config.name || key,
            opacity: config.opacity || 0.3,
            backgroundColor: config.backgroundColor || [0.39, 0.39, 0.39, 0.8],
            buttonColor: config.buttonColor || '#ff6600',
            inactiveColor: config.inactiveColor || '#194F8C'
        };
        
        // Recréer l'UI si nécessaire
        // (pour une implémentation simple, on pourrait juste ajouter le bouton)
    }
}
