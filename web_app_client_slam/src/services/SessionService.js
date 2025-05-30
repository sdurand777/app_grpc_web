// SessionService.js - Version mise à jour
import { Empty } from 'google-protobuf/google/protobuf/empty_pb.js';
import { SessionInfo } from './pointcloud_pb.js';
import { SlamServiceClient } from './slam_service_grpc_web_pb.js';

export class SessionService {
    constructor(serverUrl) {
        this.client = new SlamServiceClient(serverUrl);
    }

    // async getSessionInfo() {
    //
    //     console.log("getSessionInfo in sessionservice")
    //     return new Promise((resolve, reject) => {
    //         const request = new Empty();
    //         
    //         this.client.getSessionInfo(request, {}, (err, response) => {
    //             if (err) {
    //                 console.error('Error getting session info:', err);
    //                 reject(err);
    //             } else {
    //                 resolve({
    //                     sessionId: response.getSessionId(),
    //                     startTime: response.getStartTime(),
    //                     isActive: response.getIsActive(),
    //                     clientsConnected: response.getClientsConnected(),
    //                     totalChunks: response.getTotalChunks() // Nouveau champ
    //                 });
    //             }
    //         });
    //     });
    // }


    async getSessionInfo() {
        console.log("getSessionInfo in sessionservice")
        
        // AJOUT DU TEST METADATA
        console.log("🧪 Test envoi metadata...");
        
        return new Promise((resolve, reject) => {
            const request = new Empty();
            
            // Utiliser des headers déjà autorisés par Envoy
            const testMetadata = {
                'custom-header-1': JSON.stringify({
                    lastSequence: 123,
                    cacheSize: 554,
                    timestamp: Date.now()
                }),
                'x-grpc-web': '1', // Déjà autorisé
                'grpc-timeout': '3600S' // Déjà autorisé
            };
            
            console.log("📤 Envoi metadata de test:", testMetadata);
            
            // Envoyer la requête AVEC les metadata
            this.client.getSessionInfo(request, testMetadata, (err, response) => {
                if (err) {
                    console.error('Error getting session info:', err);
                    reject(err);
                } else {
                    console.log("✅ Réponse reçue (vérifier logs serveur pour metadata)");
                    resolve({
                        sessionId: response.getSessionId(),
                        startTime: response.getStartTime(),
                        isActive: response.getIsActive(),
                        clientsConnected: response.getClientsConnected(),
                        totalChunks: response.getTotalChunks()
                    });
                }
            });
        });
    }


    async setSessionInfo(sessionInfo) {
        return new Promise((resolve, reject) => {
            const request = new SessionInfo();
            request.setSessionId(sessionInfo.sessionId);
            request.setStartTime(sessionInfo.startTime);
            request.setIsActive(sessionInfo.isActive);
            request.setClientsConnected(sessionInfo.clientsConnected || 0);
            request.setTotalChunks(sessionInfo.totalChunks || 0); // Nouveau champ
            
            this.client.setSessionInfo(request, {}, (err, response) => {
                if (err) {
                    console.error('Error setting session info:', err);
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }
}
