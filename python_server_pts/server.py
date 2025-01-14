
import grpc
from concurrent import futures
import time
import pointcloud_pb2
import pointcloud_pb2_grpc
import slam_service_pb2
import slam_service_pb2_grpc


import numpy as np


# sizes des listes pour chaque packages de data
LISTE_SIZES = [20000,5000,7000,9000,13000,15000,17000,21000,23000]

class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    def GetPointCloud(self, request, context):
        # Envoi de points de manière continue
        for n, i in enumerate(LISTE_SIZES):  # Par exemple, envoyons 10 points
            #point = pointcloud_pb2.Point(x=i, y=i*2, z=i*3)

            # Générer les points du nuage
            points_array = np.zeros((i, 3))  # 10 points pour l'exemple
            points_array[:, 0] = n
            points_array[:, 1] = np.arange(0, i)

            points = [pointcloud_pb2.Point(x=row[0], y=row[1], z=row[2]) for row in points_array]
            point_cloud = pointcloud_pb2.PointCloud(points=points)

        # for i in range(10):
        #     point = pointcloud_pb2.Point(x=i, y=i, z=i)
        #     point_cloud = pointcloud_pb2.PointCloud(points=[point])
            yield point_cloud  # Envoi d'un PointCloud à chaque itération

            time.sleep(1)

    def ConnectPointCloud(self, request_iterator, context):
        # Traitement de la réception des points (si nécessaire)
        for point_cloud in request_iterator:
            print(f"Reçu {len(point_cloud.points)} points")
        return pointcloud_pb2.Empty()

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(SlamServiceServicer(), server)
    server.add_insecure_port('[::]:9090')
    print("Serveur en écoute sur le port 9090")
    server.start()
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()
