// DatabaseClearButton.js
export class DatabaseClearButton {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.init();
    }

    init() {
        this.createUI();
        this.showStats();
    }

    createUI() {
        // Créer le conteneur principal
        const container = document.createElement('div');
        container.id = 'db-clear-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            min-width: 250px;
        `;

        // Titre
        const title = document.createElement('div');
        title.textContent = 'Database Stats';
        title.style.cssText = `
            color: #00ff00;
            font-weight: bold;
            margin-bottom: 10px;
        `;

        // Zone d'affichage des stats
        this.statsDisplay = document.createElement('pre');
        this.statsDisplay.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 10px;
            white-space: pre-wrap;
            font-size: 11px;
        `;

        // Bouton Clear
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Database';
        clearButton.style.cssText = `
            background: #ff4444;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 5px;
        `;

        // Bouton Refresh
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh Stats';
        refreshButton.style.cssText = `
            background: #4444ff;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        `;

        // Events
        clearButton.addEventListener('click', () => this.clearDatabase());
        refreshButton.addEventListener('click', () => this.showStats());

        // Assembler
        container.appendChild(title);
        container.appendChild(this.statsDisplay);
        container.appendChild(clearButton);
        container.appendChild(refreshButton);

        document.body.appendChild(container);
    }

    async showStats() {
        try {
            const stats = await this.dbManager.getChunksStats();
            this.statsDisplay.textContent = JSON.stringify(stats, null, 2);
            console.log('getChunksStats:', stats);
        } catch (error) {
            this.statsDisplay.textContent = `Error: ${error.message}`;
            console.error('Error getting stats:', error);
        }
    }

    async clearDatabase() {
        try {
            console.log('=== AVANT CLEAR ===');
            await this.showStats();
            
            await this.dbManager.clearAllChunks();
            console.log('Database cleared');
            
            console.log('=== APRÈS CLEAR ===');
            await this.showStats();
            
        } catch (error) {
            console.error('Error clearing database:', error);
        }
    }
}
