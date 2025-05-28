// SessionService.js - Version mise à jour
import { Empty } from 'google-protobuf/google/protobuf/empty_pb.js';
import { SessionInfo } from './pointcloud_pb.js';
import { SlamServiceClient } from './slam_service_grpc_web_pb.js';

export class SessionService {
    constructor(serverUrl) {
        this.client = new SlamServiceClient(serverUrl);
    }

    async getSessionInfo() {
        return new Promise((resolve, reject) => {
            const request = new Empty();
            
            this.client.getSessionInfo(request, {}, (err, response) => {
                if (err) {
                    console.error('Error getting session info:', err);
                    reject(err);
                } else {
                    resolve({
                        sessionId: response.getSessionId(),
                        startTime: response.getStartTime(),
                        isActive: response.getIsActive(),
                        clientsConnected: response.getClientsConnected(),
                        totalChunks: response.getTotalChunks() // Nouveau champ
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
