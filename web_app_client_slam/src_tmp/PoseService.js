
import { SlamServiceClient } from './slam_service_grpc_web_pb.js';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb.js';

export class PoseService {
    constructor(url = 'http://localhost:8080') {
        this.client = new SlamServiceClient(url, null, null);
    }

    onPoses(callback) {
        const stream = this.client.getPoses(new Empty(), {});
        stream.on('data', res => {
            // res est un PoseList
            callback(null, res);
        });
        stream.on('error', err => callback(err));
    }
}
