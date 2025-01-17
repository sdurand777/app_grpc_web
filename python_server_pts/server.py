
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

CURRENT_INDEX = 0  # Suivre l'indice actuel
#LISTE_SIZES = [1,1,1,1,1,1,1,1,1]

import threading

# Cache global pour stocker les points
point_cache = []
cache_lock = threading.Lock()  # Verrou pour protéger les accès concurrents au cache



class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    def GetPointCloud(self, request, context):
        global point_cache, cache_lock, LISTE_SIZES, CURRENT_INDEX
        
        print("Initial LISTE_SIZES:", LISTE_SIZES)
        
        # Étape 1 : Envoyer les points déjà dans le cache
        with cache_lock:
            print("Loading cache...")
            for cached_points in point_cache:
                yield pointcloud_pb2.PointCloud(points=cached_points)  # Envoi des points du cache
            print("Cache loaded.")

        # Étape 2 : Générer et envoyer de nouveaux points en continu
        while True:
            with cache_lock:
                if CURRENT_INDEX >= len(LISTE_SIZES):
                    print("LISTE_SIZES is empty or exhausted. No more points to generate.")
                    break  # Arrêter la génération si tous les indices ont été parcourus
                current_size = LISTE_SIZES[CURRENT_INDEX]  # Taille courante
                LISTE_SIZES[CURRENT_INDEX] = 0
                print(f"Processing size: {current_size}, Index: {CURRENT_INDEX}")

            # Générer les points pour l'indice actuel
            #points_array = np.random.uniform(0.2 * current_index, 0.2 * (current_index + 1), (current_size, 3))
            points_array = np.zeros((current_size, 3))
            points_array[:, 0] = CURRENT_INDEX
            points_array[:, 2] = np.arange(0, current_size)

            points = [pointcloud_pb2.Point(x=row[0], y=row[1], z=row[2]) for row in points_array]

            with cache_lock:
                point_cache.append(points)  # Ajouter les nouveaux points au cache
                # # Limiter la taille du cache si nécessaire
                # if len(point_cache) > 10:
                #     point_cache.pop(0)  # Supprimer les points les plus anciens

            # Envoyer les nouveaux points au client
            yield pointcloud_pb2.PointCloud(points=points)
            
            # Passer à l'indice suivant
            time.sleep(10)  # Simuler un flux continu
            CURRENT_INDEX += 1


# class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
#     def GetPointCloud(self, request, context):
#         global point_cache, cache_lock, LISTE_SIZES
#         
#         print(LISTE_SIZES)
#         
#         # Étape 1 : Envoyer les points déjà dans le cache
#         with cache_lock:
#             print("Load cache ...")
#             print("len(point_cache) : ", len(point_cache))
#             for cached_points in point_cache:
#                 yield pointcloud_pb2.PointCloud(points=cached_points)  # Envoi des points du cache
#             print("Cache loaded ...")
#         
#         # Étape 2 : Générer et envoyer de nouveaux points en continu
#         for n, i in enumerate(LISTE_SIZES):
#             print("n, i : ", n, " ", i)
#             points_array = np.random.uniform(5*n, 5, (i, 3))
#             points = [pointcloud_pb2.Point(x=row[0], y=row[1], z=row[2]) for row in points_array]
#
#             with cache_lock:
#                 point_cache.append(points)  # Ajouter au cache
#             #     if len(point_cache) > 10:  # Limiter la taille du cache (optionnel)
#             #         point_cache.pop(0)
#
#             yield pointcloud_pb2.PointCloud(points=points)  # Envoi des nouveaux points
#             time.sleep(10)  # Simuler un flux continu


# class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
#     def GetPointCloud(self, request, context):
#         global LISTE_SIZES
#         # Envoi de points de manière continue
#         for n, i in enumerate(LISTE_SIZES):  # Par exemple, envoyons 10 points
#             #point = pointcloud_pb2.Point(x=i, y=i*2, z=i*3)
#             #LISTE_SIZES.pop(0)
#
#             # Générer les points du nuage
#             points_array = np.random.uniform(0, 5, (i, 3))
#
#             #points_array = np.zeros((i, 3))  # 10 points pour l'exemple
#             # points_array[:, 0] = n
#             # points_array[:, 1] = np.arange(0, i)
#
#             points = [pointcloud_pb2.Point(x=row[0], y=row[1], z=row[2]) for row in points_array]
#             point_cloud = pointcloud_pb2.PointCloud(points=points)
#
#         # for i in range(10):
#         #     point = pointcloud_pb2.Point(x=i, y=i, z=i)
#         #     point_cloud = pointcloud_pb2.PointCloud(points=[point])
#             yield point_cloud  # Envoi d'un PointCloud à chaque itération
#
#             time.sleep(10)

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
