
import os
import sys
import grpc
import time
from concurrent import futures
from google.protobuf.empty_pb2 import Empty

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import grpc
import pointcloud_pb2
import slam_service_pb2_grpc

import numpy as np

NUM_POINTS = 10
INDICE = 0

INDICE_LIST = 0

# sizes des listes pour chaque packages de data
LISTE_SIZES = [2,5,7,9,13,15,17,21,23]

def generate_slam_data():
    global INDICE, LISTE_SIZES, INDICE_LIST

    # loop sur le nombre de packages de data
    for i in range(len(LISTE_SIZES)):
        # loop sur la taille de la liste
        # donnees pour le SLAM
        slam_data = pointcloud_pb2.SlamData()

        for j in range(LISTE_SIZES[i]):
            # Générer les points du nuage
            points_array = np.zeros((NUM_POINTS, 3))  # 10 points pour l'exemple
            points_array[:, 0] = INDICE
            points_array[:, 1] = np.arange(0, NUM_POINTS)
            # Générer une matrice de pose 4x4
            pose_matrix = np.eye(4)  # Matrice identité pour l'exemple
            pose_matrix[:3, 3] = [INDICE, 0, 0]  # Déplacer la caméra selon X
            # generer la couleur
            colors = np.random.rand(3) * np.ones_like(points_array)

            points_array_colors = np.hstack((points_array, colors))

            # Construire le message `Pose`
            pose = pointcloud_pb2.Pose(matrix=pose_matrix.flatten().tolist())

            # Construire le message `PointCloud`
            points = [pointcloud_pb2.Point(x=row[0], y=row[1], z=row[2], r=row[3], g=row[4], b=row[5]) for row in points_array_colors]
            point_cloud = pointcloud_pb2.PointCloud(points=points)

            # ajout des donnes
            slam_data.pointcloudlist.pointclouds.append(point_cloud)

            slam_data.poselist.poses.append(pose)

            slam_data.indexlist.index.extend([j+INDICE_LIST])

            INDICE += 1

        #INDICE_LIST += 10
        print("Envoie slam data")
        yield slam_data

        # Attente pour simuler une génération de données
        print("Waiting ...")
        time.sleep(2)


def run_client():
    # Connexion au serveur
    channel = grpc.insecure_channel('localhost:50051')
    stub = slam_service_pb2_grpc.SlamServiceStub(channel)

    # Stream des nuages de points et poses au serveur
    try:
        response = stub.ConnectSlamData(generate_slam_data())
        print("Réponse du serveur : ", response)
    except grpc.RpcError as e:
        print(f"Erreur RPC : {e.code()}, message : {e.details()}")


if __name__ == '__main__':
    run_client()
