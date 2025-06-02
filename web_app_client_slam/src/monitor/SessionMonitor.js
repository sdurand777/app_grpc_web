
// SessionMonitor.js
import { SessionService } from '../services/SessionService.js';
import { DataBaseManager } from '../core/DataBaseManager.js';
import { resetScene } from '../init.js';

export class SessionMonitor {
    constructor(serverUrl, dbManager, pcController, poseController, scene) {
        this.sessionService = new SessionService(serverUrl);
        // 1 seconde
        this.pollingInterval = 1000;
        this.shouldStop = false;
        this.dbManager = dbManager;
        this.pcController = pcController;
        this.poseController = poseController;
        this.scene = scene;

    }

    stop() {
        this.shouldStop = true;
        console.log('🛑 Arrêt de la surveillance...');
    }

    async testGrpcConnection() {

        console.log("testGrpcConnection method");

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection test timeout Server Down')), 1000)
        );
        
        try {

            console.log("getSessionInfo")
            //await this.sessionService.getSessionInfo(); // On utilise getSessionInfo comme proxy pour tester la connexion gRPC
            await Promise.race([
                this.sessionService.getSessionInfo(),
                timeoutPromise
            ]);

            console.log('🔌 Connexion gRPC établie');
            return true;
        } catch (error) {
            console.warn('⚠️ Connexion gRPC échouée:', error.message);
            return false;
        }
    }

    async getSessionInfo() {
        try {
            return await this.sessionService.getSessionInfo();
        } catch (error) {
            console.error('❌ Erreur lors de la récupération de sessionInfo:', error.message);
            return null;
        }
    }

    async start() {
        console.log('🚀 Démarrage de la surveillance de la connexion et du sessionId...');

        let grpcConnected = false;

        console.log("this.shouldStop : ", this.shouldStop);

        while (!this.shouldStop) {
            // Vérifier la connexion gRPC
            const isConnected = await this.testGrpcConnection();
            if (isConnected) {
                if (!grpcConnected) {
                    grpcConnected = true; // État modifié une seule fois
                }
            } else {
                grpcConnected = false;
            }

            // Vérifier le sessionId
            const sessionInfo = await this.getSessionInfo();
            if (sessionInfo) {
                if (sessionInfo.sessionId && sessionInfo.sessionId.trim() !== '') {
                    console.log('✅ SessionId valide détecté:', sessionInfo.sessionId);
                    console.log('📋 Session info:', sessionInfo);
                    return sessionInfo;
                } else {
                    console.warn('⏳ SessionId vide malgré connexion gRPC.');
                }
            } else {
                console.warn('❌ Impossible de récupérer sessionInfo (peut-être pas connecté).');
            }

            await this.delay(this.pollingInterval);
        }

        console.warn('🔴 Surveillance arrêtée');
        return null;
    }

    
    async CheckAndUpdateCache()
    {
        console.log("CheckAndUpdateCache")
        // recuperation du cache
        const cachedSession = await this.dbManager.getSessionInfo();

        console.log("cachedSession : ", cachedSession)

        // recuperation de la session actuelle
        const sessionInfo = await this.sessionService.getSessionInfo();

        if (cachedSession) {
            console.log('📦 Session trouvée en cache:', cachedSession);
            console.log("cachedSession.sessionId : ", cachedSession.sessionId);            
            console.log("sessionInfo.sessionId : ", sessionInfo.sessionId);            

            if (cachedSession.sessionId == sessionInfo.sessionId)
            {
                console.log('✅ Session identique à celle du cache, pas de mise à jour nécessaire.');

                // recuperation du cache existant
                console.log('♻️ La session reste la meme, recuperation cache 3D existant ...');
                await this.pcController.loadChunksFromCache(sessionInfo.sessionId);
                return true;
            }
            else{
                console.log('♻️ La session a changé, mise à jour du cache Session...');
                await this.dbManager.saveSessionInfo(sessionInfo);
                console.log('♻️ La session a changé, vide cache 3D existant ...');
                await this.dbManager.clearAllChunks();
                // // clean scene
                // console.log('♻️ La session a changé, vide la scene ...');
                // console.log('♻️ Reset PointCloudController Buffer ...');
                // this.pcController.resetBuffers();
                // console.log('♻️ Reset PoseController Buffer ...');
                // this.poseController.resetBuffersPose();

            }

        } else {
            console.log('📭 Aucune session en cache, sauvegarde de la nouvelle session...');
            await this.dbManager.saveSessionInfo(sessionInfo);
            return false;
        }
        
    }


    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
