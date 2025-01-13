
const { SlamServiceClient } = require('./slam_service_grpc_web_pb.js');
//const { Empty } = require('./pointcloud_pb.js');
const { Empty } = require('google-protobuf/google/protobuf/empty_pb.js');

// Crée un client gRPC-Web
const client = new SlamServiceClient('http://localhost:8080', null, null);

// Appelle le serveur pour recevoir le flux de points
const request = new Empty();

const stream = client.getPointCloud(request, {});

stream.on('data', (response) => {
    const points = response.getPointsList();
    points.forEach((point) => {
        console.log(`Point reçu: x=${point.getX()}, y=${point.getY()}, z=${point.getZ()}`);
    });
});

stream.on('error', (err) => {
    console.error('Erreur du flux:', err.message);
});

stream.on('end', () => {
    console.log('Flux terminé');
});
