export class PageProtector {
    constructor(options = {}) {
        this.isLeavingPage = false;
        this.isEnabled = false;
        this.userHasInteracted = false;
        
        // Configuration par défaut
        this.config = {
            refreshMessage: options.refreshMessage || 
                '⚠️ ATTENTION ⚠️\n\n' +
                'Vous allez rafraîchir la page.\n' +
                'Le streaming GRPC sera interrompu et les données non sauvegardées seront perdues.\n\n' +
                'Voulez-vous vraiment continuer ?',
            
            leaveMessage: options.leaveMessage ||
                '⚠️ ATTENTION ⚠️\n\n' +
                'Vous allez fermer cette page.\n' +
                'Le streaming GRPC sera interrompu.\n\n' +
                'Voulez-vous vraiment continuer ?',
            
            beforeUnloadMessage: options.beforeUnloadMessage ||
                'Le streaming GRPC sera interrompu. Continuer ?'
        };
        
        // Callbacks
        this.onBeforeLeave = options.onBeforeLeave || null;
        this.onLeave = options.onLeave || null;
        
        // Handlers stockés pour pouvoir les supprimer
        this.keydownHandler = null;
        this.beforeUnloadHandler = null;
        this.pageHideHandler = null;
        this.unloadHandler = null;
        this.visibilityHandler = null;
        this.interactionHandler = null;
        
        // Auto-initialisation si demandée
        if (options.autoEnable !== false) {
            this.enable();
        }
    }

    // Activer la protection
    enable() {
        if (this.isEnabled) return;
        
        this.isEnabled = true;
        this.setupUserInteractionDetection();
        this.setupKeyboardInterception();
        this.setupBeforeUnload();
        this.setupPageHide();
        
        console.log('Page protection enabled');
    }

    // Désactiver la protection
    disable() {
        if (!this.isEnabled) return;
        
        this.isEnabled = false;
        this.removeEventListeners();
        
        console.log('Page protection disabled');
    }

    // Détecter l'interaction utilisateur (requis pour beforeunload dans Chrome)
    setupUserInteractionDetection() {
        const markInteraction = () => {
            if (!this.userHasInteracted) {
                this.userHasInteracted = true;
                console.log('User interaction detected - beforeunload protection activated');
            }
        };

        this.interactionHandler = markInteraction;
        
        // Écouter plusieurs types d'interactions
        ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
            document.addEventListener(event, this.interactionHandler, { once: true, passive: true });
        });
    }

    // Configuration des raccourcis clavier
    setupKeyboardInterception() {
        this.keydownHandler = (event) => {
            if (!this.isEnabled) return;
            
            // F5 ou Ctrl+R ou Cmd+R (rafraîchissement)
            if (event.key === 'F5' || 
                (event.ctrlKey && event.key === 'r') || 
                (event.metaKey && event.key === 'r')) {
                
                event.preventDefault();
                event.stopPropagation();
                this.handleRefresh();
                return false;
            }
            
            // Ctrl+W ou Cmd+W (fermer onglet)
            if ((event.ctrlKey && event.key === 'w') || 
                (event.metaKey && event.key === 'w')) {
                
                event.preventDefault();
                event.stopPropagation();
                this.handleClose();
                return false;
            }
        };
        
        document.addEventListener('keydown', this.keydownHandler, true);
    }

    // Configuration de beforeunload (améliorée pour Chrome)
    setupBeforeUnload() {
        this.beforeUnloadHandler = (event) => {
            if (!this.isEnabled || this.isLeavingPage) return;
            
            // Toujours exécuter le cleanup
            if (this.onBeforeLeave) {
                this.onBeforeLeave();
            }
            
            // Pour Chrome : besoin d'interaction utilisateur
            if (!this.userHasInteracted) {
                console.warn('Chrome: No user interaction detected, beforeunload may not work');
                return;
            }
            
            // Méthode la plus compatible pour Chrome
            event.preventDefault();
            event.stopImmediatePropagation();
            
            // Chrome moderne : il faut retourner une string
            const message = 'Des changements non sauvegardés seront perdus.';
            event.returnValue = message;
            return message;
        };
        
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        
        // Ajouter unload comme backup
        this.unloadHandler = () => {
            if (this.onBeforeLeave && !this.isLeavingPage) {
                this.onBeforeLeave();
            }
        };
        window.addEventListener('unload', this.unloadHandler);
        
        // Ajouter visibilitychange pour détecter les changements d'onglet
        this.visibilityHandler = () => {
            if (document.visibilityState === 'hidden' && this.isEnabled && !this.isLeavingPage) {
                // Page devient cachée (changement d'onglet, minimisation, etc.)
                if (this.onBeforeLeave) {
                    this.onBeforeLeave();
                }
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
        
        // Forcer l'activation de beforeunload au premier clic
        const forceActivation = () => {
            if (!this.userHasInteracted) {
                this.userHasInteracted = true;
                // Re-setup beforeunload maintenant que l'utilisateur a interagi
                window.removeEventListener('beforeunload', this.beforeUnloadHandler);
                window.addEventListener('beforeunload', this.beforeUnloadHandler);
                console.log('BeforeUnload protection fully activated after user interaction');
            }
        };
        
        document.addEventListener('click', forceActivation, { once: true });
    }

    // Configuration de pagehide (backup)
    setupPageHide() {
        this.pageHideHandler = () => {
            if (this.onBeforeLeave) {
                this.onBeforeLeave();
            }
        };
        
        window.addEventListener('pagehide', this.pageHideHandler);
    }

    // Gestion du rafraîchissement
    handleRefresh() {
        const confirmed = confirm(this.config.refreshMessage);
        
        if (confirmed) {
            this.isLeavingPage = true;
            
            if (this.onLeave) {
                this.onLeave('refresh');
            }
            
            // Désactiver temporairement la protection pour permettre le rafraîchissement
            this.disable();
            window.location.reload();
        }
    }

    // Gestion de la fermeture
    handleClose() {
        const confirmed = confirm(this.config.leaveMessage);
        
        if (confirmed) {
            this.isLeavingPage = true;
            
            if (this.onLeave) {
                this.onLeave('close');
            }
            
            // Tenter de fermer la fenêtre/onglet
            this.disable();
            window.close();
        }
    }

    // Permettre une sortie propre (sans alerte)
    allowExit() {
        this.isLeavingPage = true;
        this.disable();
    }

    // Forcer le rafraîchissement sans alerte
    forceRefresh() {
        this.allowExit();
        window.location.reload();
    }

    // Supprimer tous les event listeners
    removeEventListeners() {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
        if (this.unloadHandler) {
            window.removeEventListener('unload', this.unloadHandler);
            this.unloadHandler = null;
        }
        if (this.pageHideHandler) {
            window.removeEventListener('pagehide', this.pageHideHandler);
            this.pageHideHandler = null;
        }
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
        if (this.interactionHandler) {
            ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
                document.removeEventListener(event, this.interactionHandler);
            });
            this.interactionHandler = null;
        }
    }

    // Mettre à jour les messages
    updateMessages({ refreshMessage, leaveMessage, beforeUnloadMessage }) {
        if (refreshMessage) this.config.refreshMessage = refreshMessage;
        if (leaveMessage) this.config.leaveMessage = leaveMessage;
        if (beforeUnloadMessage) this.config.beforeUnloadMessage = beforeUnloadMessage;
    }

    // Getters
    get enabled() {
        return this.isEnabled;
    }

    get leaving() {
        return this.isLeavingPage;
    }

    get hasUserInteracted() {
        return this.userHasInteracted;
    }
}

// Export d'une instance globale optionnelle
export function createPageProtector(options) {
    return new PageProtector(options);
}

/* 
 * Note importante pour Chrome/navigateurs modernes :
 * 
 * 1. beforeunload ne fonctionne que si l'utilisateur a interagi avec la page
 * 2. Le message personnalisé peut être ignoré (Chrome affiche son propre message)
 * 3. L'icône de rafraîchissement peut parfois bypass les protections
 * 4. F5/Ctrl+R sont plus fiables car interceptés directement
 * 
 * Cette classe fait de son mieux pour couvrir tous les cas, mais les limitations
 * des navigateurs modernes rendent impossible une protection 100% fiable.
 */
