
import { SlamServiceClient } from './slam_service_grpc_web_pb.js';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb.js';

export class SlamService {
    constructor(url = 'http://localhost:8080') {
        this.client = new SlamServiceClient(url, null, null);
        this.receivedPacked = 0;

    }

    onData(callback) {
        const stream = this.client.getSlamData(new Empty(), {});
        stream.on('data', res => callback(null, res));
        stream.on('error', err => callback(err));
    }
}

