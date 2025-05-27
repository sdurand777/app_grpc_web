// SessionService.js

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
                        clientsConnected: response.getClientsConnected()
                    });
                }
            });
        });
    }
}
