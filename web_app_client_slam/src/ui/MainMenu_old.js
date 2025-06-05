// File: src/ui/MainMenu.js
export class MainMenu {
    constructor(config) {
        this.config = {
            position: { top: '20px', right: '20px' },
            collapsed: false,
            ...config
        };
        
        // Références aux contrôleurs
        this.controllers = {};
        this.buttons = {};
        this.sliders = {};
        
        this.createMenu();
        this.setupEventListeners();
    }
    
    createMenu() {
        // Conteneur principal
        this.container = document.createElement('div');
        this.container.id = 'main-menu';
        this.container.style.cssText = `
            position: fixed;
            top: ${this.config.position.top};
            right: ${this.config.position.right};
            background: rgba(30, 30, 30, 0.95);
            border: 2px solid #194F8C;
            border-radius: 12px;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            z-index: 2000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            min-width: 280px;
            max-width: 320px;
            transition: all 0.3s ease;
        `;
        
        // En-tête avec titre et bouton collapse
        this.createHeader();
        
        // Conteneur du contenu
        this.contentContainer = document.createElement('div');
        this.contentContainer.id = 'menu-content';
        this.contentContainer.style.cssText = `
            padding: 15px;
            transition: all 0.3s ease;
            overflow: hidden;
        `;
        
        // Sections du menu
        this.createViewSection();
        this.createBackgroundSection();
        this.createPointCloudSection();
        this.createTrajectorySection();
        this.createDatabaseSection();
        this.createStatsSection();
        
        this.container.appendChild(this.contentContainer);
        document.body.appendChild(this.container);
        
        console.log('✅ Menu principal créé');
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #194F8C, #2a5ba0);
            padding: 12px 15px;
            border-radius: 10px 10px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            user-select: none;
        `;
        
        const title = document.createElement('h3');
        title.textContent = '⚙️ Menu Principal';
        title.style.cssText = `
            color: white;
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        `;
        
        this.collapseButton = document.createElement('button');
        this.collapseButton.innerHTML = '▼';
        this.collapseButton.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 14px;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
        `;
        
        this.collapseButton.addEventListener('mouseenter', () => {
            this.collapseButton.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        this.collapseButton.addEventListener('mouseleave', () => {
            this.collapseButton.style.background = 'none';
        });
        
        header.appendChild(title);
        header.appendChild(this.collapseButton);
        
        header.addEventListener('click', () => this.toggleCollapse());
        
        this.container.appendChild(header);
    }
    
    createSection(title, icon = '') {
        const section = document.createElement('div');
        section.style.cssText = `
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        const sectionTitle = document.createElement('h4');
        sectionTitle.textContent = `${icon} ${title}`;
        sectionTitle.style.cssText = `
            color: #ff6600;
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
        `;
        
        section.appendChild(sectionTitle);
        this.contentContainer.appendChild(section);
        
        return section;
    }
    
    createButton(text, onClick, style = {}) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            background: #194F8C;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            margin: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 80px;
            ${Object.entries(style).map(([key, value]) => `${key}: ${value}`).join('; ')}
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.background = '#ff6600';
            button.style.transform = 'translateY(-1px)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#194F8C';
            button.style.transform = 'translateY(0)';
        });
        
        button.addEventListener('click', onClick);
        
        return button;
    }
    
    createViewSection() {
        const section = this.createSection('Vue & Navigation', '🎯');
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        // Bouton Reset Vue
        this.buttons.resetView = this.createButton('Reset Vue', () => {
            if (this.controllers.viewReset) {
                this.controllers.viewReset.resetView();
            }
        });
        
        // Bouton Toggle Menu
        this.buttons.toggleMenu = this.createButton('Masquer Menu', () => {
            this.toggleVisibility();
        });
        
        buttonContainer.appendChild(this.buttons.resetView);
        buttonContainer.appendChild(this.buttons.toggleMenu);
        section.appendChild(buttonContainer);
    }
    
    createBackgroundSection() {
        const section = this.createSection('Arrière-plan', '🎨');
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        // Boutons de thème
        const themes = ['Default', 'Darker', 'Brighter'];
        themes.forEach(theme => {
            this.buttons[`theme${theme}`] = this.createButton(theme, () => {
                if (this.controllers.background) {
                    this.controllers.background.setTheme(theme.toLowerCase());
                }
                this.updateThemeButtons(theme.toLowerCase());
            });
            buttonContainer.appendChild(this.buttons[`theme${theme}`]);
        });
        
        section.appendChild(buttonContainer);
        
        // Slider de taille du logo
        const sizeContainer = document.createElement('div');
        sizeContainer.style.cssText = `
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const sizeLabel = document.createElement('label');
        sizeLabel.textContent = 'Taille logo:';
        sizeLabel.style.cssText = `
            color: white;
            font-size: 12px;
            min-width: 80px;
        `;
        
        this.sliders.logoSize = document.createElement('input');
        this.sliders.logoSize.type = 'range';
        this.sliders.logoSize.min = '0.3';
        this.sliders.logoSize.max = '1.5';
        this.sliders.logoSize.step = '0.1';
        this.sliders.logoSize.value = '1.0';
        this.sliders.logoSize.style.cssText = `
            flex: 1;
            height: 4px;
            background: #194F8C;
            border-radius: 2px;
        `;
        
        const sizeValue = document.createElement('span');
        sizeValue.textContent = '1.0';
        sizeValue.style.cssText = `
            color: white;
            font-size: 12px;
            min-width: 30px;
        `;
        
        this.sliders.logoSize.addEventListener('input', () => {
            const value = parseFloat(this.sliders.logoSize.value);
            sizeValue.textContent = value.toFixed(1);
            if (this.controllers.background) {
                this.controllers.background.setSize(value);
            }
        });
        
        sizeContainer.appendChild(sizeLabel);
        sizeContainer.appendChild(this.sliders.logoSize);
        sizeContainer.appendChild(sizeValue);
        section.appendChild(sizeContainer);
    }
    
    createPointCloudSection() {
        const section = this.createSection('Nuage de Points', '🔵');
        
        // Slider de taille des points
        const sizeContainer = document.createElement('div');
        sizeContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        `;
        
        const sizeLabel = document.createElement('label');
        sizeLabel.textContent = 'Taille points:';
        sizeLabel.style.cssText = `
            color: white;
            font-size: 12px;
            min-width: 80px;
        `;
        
        this.sliders.pointSize = document.createElement('input');
        this.sliders.pointSize.type = 'range';
        this.sliders.pointSize.min = '0.001';
        this.sliders.pointSize.max = '0.1';
        this.sliders.pointSize.step = '0.001';
        this.sliders.pointSize.value = '0.01';
        this.sliders.pointSize.style.cssText = `
            flex: 1;
            height: 4px;
            background: #194F8C;
            border-radius: 2px;
        `;
        
        const sizeValue = document.createElement('span');
        sizeValue.textContent = '0.010';
        sizeValue.style.cssText = `
            color: white;
            font-size: 12px;
            min-width: 40px;
        `;
        
        this.sliders.pointSize.addEventListener('input', () => {
            const value = parseFloat(this.sliders.pointSize.value);
            sizeValue.textContent = value.toFixed(3);
            if (this.controllers.pointCloud) {
                this.controllers.pointCloud.setPointSize(value);
            }
        });
        
        sizeContainer.appendChild(sizeLabel);
        sizeContainer.appendChild(this.sliders.pointSize);
        sizeContainer.appendChild(sizeValue);
        section.appendChild(sizeContainer);
    }
    
    createTrajectorySection() {
        const section = this.createSection('Trajectoire', '📍');
        
        this.buttons.toggleTrajectory = this.createButton('Masquer Trajectoire', () => {
            if (this.controllers.trajectory) {
                this.controllers.trajectory.toggle();
                // Mise à jour du texte du bouton
                const visible = this.controllers.trajectory.controller.trajectoryVisible;
                this.buttons.toggleTrajectory.textContent = visible ? 'Masquer Trajectoire' : 'Afficher Trajectoire';
            }
        });
        
        section.appendChild(this.buttons.toggleTrajectory);
    }
    
    createDatabaseSection() {
        const section = this.createSection('Base de Données', '🗄️');
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        this.buttons.clearDatabase = this.createButton('Vider Cache', () => {
            if (this.controllers.database) {
                this.controllers.database.clearDatabase();
            }
        }, { background: '#ff4444' });
        
        this.buttons.refreshStats = this.createButton('Actualiser Stats', () => {
            if (this.controllers.database) {
                this.controllers.database.showStats();
            }
        });
        
        buttonContainer.appendChild(this.buttons.clearDatabase);
        buttonContainer.appendChild(this.buttons.refreshStats);
        section.appendChild(buttonContainer);
        
        // Zone d'affichage des stats
        this.statsDisplay = document.createElement('div');
        this.statsDisplay.style.cssText = `
            background: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
            padding: 8px;
            margin-top: 8px;
            font-family: monospace;
            font-size: 10px;
            color: #00ff00;
            max-height: 100px;
            overflow-y: auto;
        `;
        section.appendChild(this.statsDisplay);
    }
    
    createStatsSection() {
        const section = this.createSection('Statistiques', '📊');
        
        this.buttons.toggleStats = this.createButton('Masquer Stats', () => {
            if (this.controllers.stats) {
                const statsDiv = document.querySelector('div[style*="position: absolute"][style*="top: 10px"][style*="left: 100px"]');
                if (statsDiv) {
                    const isVisible = statsDiv.style.display !== 'none';
                    statsDiv.style.display = isVisible ? 'none' : 'block';
                    this.buttons.toggleStats.textContent = isVisible ? 'Afficher Stats' : 'Masquer Stats';
                }
            }
        });
        
        section.appendChild(this.buttons.toggleStats);
    }
    
    // Méthodes pour connecter les contrôleurs
    connectControllers(controllers) {
        this.controllers = { ...this.controllers, ...controllers };
        console.log('🔗 Contrôleurs connectés au menu:', Object.keys(this.controllers));
    }
    
    connectController(name, controller) {
        this.controllers[name] = controller;
        console.log(`🔗 Contrôleur ${name} connecté au menu`);
    }
    
    // Méthodes utilitaires
    toggleCollapse() {
        this.config.collapsed = !this.config.collapsed;
        
        if (this.config.collapsed) {
            this.contentContainer.style.height = '0';
            this.contentContainer.style.padding = '0 15px';
            this.collapseButton.innerHTML = '▶';
            this.container.style.minWidth = '200px';
        } else {
            this.contentContainer.style.height = 'auto';
            this.contentContainer.style.padding = '15px';
            this.collapseButton.innerHTML = '▼';
            this.container.style.minWidth = '280px';
        }
    }
    
    toggleVisibility() {
        const isVisible = this.container.style.display !== 'none';
        this.container.style.display = isVisible ? 'none' : 'block';
        
        // Mettre à jour le texte du bouton si le menu est visible
        if (!isVisible && this.buttons.toggleMenu) {
            this.buttons.toggleMenu.textContent = 'Masquer Menu';
        }
    }
    
    updateThemeButtons(activeTheme) {
        const themes = ['default', 'darker', 'brighter'];
        themes.forEach(theme => {
            const button = this.buttons[`theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`];
            if (button) {
                if (theme === activeTheme) {
                    button.style.background = '#ff6600';
                } else {
                    button.style.background = '#194F8C';
                }
            }
        });
    }
    
    updateStats(stats) {
        if (this.statsDisplay) {
            this.statsDisplay.textContent = JSON.stringify(stats, null, 2);
        }
    }
    
    // Méthodes pour l'API globale
    setPosition(top, right) {
        this.container.style.top = top;
        this.container.style.right = right;
    }
    
    setTheme(theme) {
        // Mise à jour du style général du menu selon le thème
        const themes = {
            darker: { bg: 'rgba(20, 20, 20, 0.95)', border: '#333' },
            default: { bg: 'rgba(30, 30, 30, 0.95)', border: '#194F8C' },
            brighter: { bg: 'rgba(50, 50, 50, 0.95)', border: '#2a5ba0' }
        };
        
        if (themes[theme]) {
            this.container.style.background = themes[theme].bg;
            this.container.style.borderColor = themes[theme].border;
        }
    }
    
    dispose() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
    
    setupEventListeners() {
        // Fermer le menu avec Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.style.display !== 'none') {
                this.toggleVisibility();
            }
        });
        
        // Rendre le menu déplaçable
        this.makeMenuDraggable();
    }
    
    makeMenuDraggable() {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        const header = this.container.querySelector('div');
        
        header.addEventListener('mousedown', (e) => {
            if (e.target === this.collapseButton) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = this.container.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            header.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            this.container.style.left = (initialX + deltaX) + 'px';
            this.container.style.top = (initialY + deltaY) + 'px';
            this.container.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'pointer';
            }
        });
    }
}
