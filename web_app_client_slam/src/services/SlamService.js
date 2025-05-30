import { SlamServiceClient } from './slam_service_grpc_web_pb.js';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb.js';

export class SlamService {
    constructor(url = 'http://localhost:8080', dbManager) {
        this.client = new SlamServiceClient(url, null, null);
        this.receivedPacked = 0;
        this.dbManager = dbManager;
    }


    // methode pour recuperer les infos sur les chunks stockees
    async getCacheInfo() {
        // Récupérer les infos du cache local
        if (!this.dbManager) {
            return {
                lastSequenceNumber: -1,
                sessionId: '',
                chunkCount: 0
            };
        }

        try {
            const sessionInfo = await this.dbManager.getSessionInfo();
            const stats = await this.dbManager.getChunksStats();
            
            // Récupérer le dernier numéro de séquence
            let lastSequenceNumber = -1;
            if (stats && stats.totalChunks > 0) {
                const chunks = await this.dbManager.getAllChunksOrdered();
                if (chunks.length > 0) {
                    lastSequenceNumber = Math.max(...chunks.map(c => c.sequenceNumber || -1));
                }
            }

            return {
                lastSequenceNumber,
                sessionId: sessionInfo?.sessionId || '',
                chunkCount: stats?.totalChunks || 0
            };
        } catch (error) {
            console.error('Erreur récupération info cache:', error);
            return {
                lastSequenceNumber: -1,
                sessionId: '',
                chunkCount: 0
            };
        }
    }


    async onData(callback) {

        // 1. Récupérer les infos du cache
        const cacheInfo = await this.getCacheInfo();
        
        console.log('📊 Info cache client:', {
            lastSequence: cacheInfo.lastSequenceNumber,
            sessionId: cacheInfo.sessionId,
            chunks: cacheInfo.chunkCount
        });

        // 2. Encoder les infos dans custom-header-1 (déjà autorisé par Envoy)
        const metadata = {
            'custom-header-1': JSON.stringify({
                lastSequence: cacheInfo.lastSequenceNumber,
                sessionId: cacheInfo.sessionId,
                chunkCount: cacheInfo.chunkCount,
                timestamp: Date.now()
            })
        };


        console.log('📤 Envoi metadata au serveur:', metadata['custom-header-1']);

        //const stream = this.client.getSlamData(new Empty(), {});
        const stream = this.client.getSlamData(new Empty(), metadata);
        
        stream.on('data', res => {
            // Log des infos du chunk
            const chunkId = res.getChunkId ? res.getChunkId() : 'N/A';
            const sequenceNumber = res.getSequenceNumber ? res.getSequenceNumber() : 'N/A';
            const sessionId = res.getSessionId ? res.getSessionId() : 'N/A';
            const timestamp = res.getTimestamp ? res.getTimestamp() : 'N/A';
            
            console.log('📦 Chunk reçu:', {
                chunkId,
                sequenceNumber, 
                sessionId,
                timestamp,
                receivedAt: new Date().toISOString()
            });
            
            callback(null, res);
        });
        
        stream.on('error', err => callback(err));
    }
}
