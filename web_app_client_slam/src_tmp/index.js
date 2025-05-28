
import { SessionService } from './SessionService.js';

const SERVER_URL = 'http://localhost:8080';
const POLLING_INTERVAL = 1000;
let shouldStop = false;

window.stopSessionMonitoring = () => {
    shouldStop = true;
    console.log('Arrêt de la surveillance...');
};

async function connectUntilSessionValid(sessionService) {
    console.log('🔄 Tentative de connexion et recherche d\'un sessionId valide...');
    
    while (!shouldStop) {
        try {
            console.log('🔌 Test de connexion au serveur...');
            const sessionInfo = await sessionService.getSessionInfo();

            if (sessionInfo.sessionId && sessionInfo.sessionId.trim() !== '') {
                console.log('✅ Connexion établie avec sessionId:', sessionInfo.sessionId);
                console.log('📋 Session info:', sessionInfo);
                return sessionInfo;
            } else {
                console.warn('⚠️ Connexion OK mais sessionId vide. Nouvelle tentative...');
            }

        } catch (error) {
            console.error('❌ Erreur de connexion ou récupération de sessionInfo:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    throw new Error('🔴 Surveillance arrêtée ou interrompue');
}

async function main() {
    const sessionService = new SessionService(SERVER_URL);

    try {
        const sessionInfo = await connectUntilSessionValid(sessionService);
        console.log('🎉 Connexion et sessionId valides:', sessionInfo);
    } catch (error) {
        console.error('💥 Erreur:', error.message);
    }
}

main();
