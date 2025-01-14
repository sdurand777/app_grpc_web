import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty

import slam_service_pb2
import slam_service_pb2_grpc
import pointcloud_pb2
import time

import numpy as np


NUM_POINTS = 10000
INDICE = 0

INDICE_LIST = 0

# sizes des listes pour chaque packages de data
LISTE_SIZES = [2,5,7,9,13,15,17,21,23]



# slam service rpc implementation des services RPC
class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    # constructor
    def __init__(self):
        self.point_clouds = []  # Stocker les points reçus
        self.point_clouds_with_poses = []
        self.slam_data = []


    # RPC ConnectPointCloud service pour recevoir le pcd du client 1
    def ConnectPointCloud(self, request_iterator, context):
        print("Réception des points du client 1...")
        for point_cloud in request_iterator:
            print(f"Reçu un PointCloud avec {len(point_cloud.points)} points.")
            self.point_clouds.append(point_cloud)  # Ajouter les points reçus
            #print("point_clouds stored : ", self.point_clouds)
        print("--------- fin de reception --------")
        return Empty()  # Réponse vide pour confirmer

    # RPC GetPointCloud pour envoyer le pcd au client 2
    def GetPointCloud(self, request, context):
        print("Envoi des points au client 2...")
        try:
            while True:  # Boucle infinie pour envoyer les points en continu
                # Envoyer les points déjà reçus
                if self.point_clouds:
                    for point_cloud in self.point_clouds:
                        print(f"Envoie un PointCloud avec {len(point_cloud.points)} points.")
                        yield point_cloud  # Envoi des points stockés

                    print("clean pointcloud deja envoye")
                    # on supprime
                    self.point_clouds = []
                    # Vous pouvez aussi ajouter un petit délai entre les envois pour éviter de trop solliciter le réseau
                    time.sleep(0.1)  # Un délai de 1 seconde avant de renvoyer les points
                else:
                    # Attendre un peu avant de vérifier s'il y a de nouveaux points si aucun n'est encore reçu
                    print("wait for new points")
                    time.sleep(0.1)
        except grpc.RpcError as e:
            print(f"Erreur RPC : {e.code()}, message : {e.details()}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Erreur lors de l'envoi des points.")

    # RPC ConnectPointCloudWithPose service pour recevoir le PCD et la pose du client
    def ConnectPointCloudWithPose(self, request_iterator, context):
        print("Réception des points et poses du client...")
        for data in request_iterator:
            point_cloud = data.pointCloud
            pose = data.pose

            print(f"Reçu un PointCloud avec {len(point_cloud.points)} points.")
            print(f"Reçu une Pose avec matrice : {pose.matrix}")

            # Stocker le nuage de points et la pose
            self.point_clouds_with_poses.append((point_cloud, pose))

        print("--------- fin de réception --------")
        return Empty()  # Réponse vide pour confirmer

    # RPC GetPointCloudWithPose pour envoyer les PCD et poses au client
    def GetPointCloudWithPose(self, request, context):
        print("Envoi des points et poses au client...")
        try:
            while True:  # Boucle infinie pour envoyer les points et les poses en continu
                # Envoyer les points et poses déjà reçus
                if self.point_clouds_with_poses:
                    for point_cloud, pose in self.point_clouds_with_poses:
                        print(f"Envoi d'un PointCloud avec {len(point_cloud.points)} points.")
                        print(f"Envoi d'une Pose avec matrice : {pose.matrix}")
                        
                        # Créez l'objet PointCloudWithPose à envoyer
                        yield pointcloud_pb2.PointCloudWithPose(pointCloud=point_cloud, pose=pose)

                    print("Nettoyage des données déjà envoyées...")
                    # Supprimer les données envoyées
                    self.point_clouds_with_poses = []

                    # Vous pouvez aussi ajouter un petit délai entre les envois pour éviter de trop solliciter le réseau
                    time.sleep(0.1)
                else:
                    # Attendre un peu avant de vérifier s'il y a de nouveaux points et poses
                    print("En attente de nouveaux points et poses...")
                    time.sleep(0.1)
        except grpc.RpcError as e:
            print(f"Erreur RPC : {e.code()}, message : {e.details()}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Erreur lors de l'envoi des points et poses.")





    # RPC ConnectPointCloudWithPose service pour recevoir le PCD et la pose du client
    def ConnectSlamData(self, request_iterator, context):
        print("Réception des slam data du client...")


        for data in request_iterator:

            total_points = 0  # Variable pour compter les points globaux

            pointcloudlist = data.pointcloudlist
            poselist = data.poselist
            indexlist = data.indexlist

            #print(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds et {len(pointcloudlist.pointclouds.points)} points.")
            print(f"Reçu une liste de pcds avec {len(pointcloudlist.pointclouds)} pointclouds")
            print(f"Reçu une liste de poses avec : {len(poselist.poses)} poses")
            print(f"Reçu une liste de kfs avec : {len(indexlist.index)} indices")
            # Afficher la liste d'indices
            print(f"Liste des indices : {list(indexlist.index)}")

            # Calculer le nombre global de points
            for pointcloud in pointcloudlist.pointclouds:
                total_points += len(pointcloud.points)  # Ajouter le nombre de points dans chaque PointCloud
            print(f"Nombre total de points dans ces pointclouds : {total_points}")

            # Stocker le nuage de points et la pose
            self.slam_data.append((pointcloudlist, poselist, indexlist))

        print("--------- fin de réception --------")
        return Empty()  # Réponse vide pour confirmer


    def GetSlamData(self, request, context):

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







# definition du serveur
def serve():
    # creation instance grpc serveur pool de 10 threads avec chaque thread qui peut gerer une requete RPC distincte
    #server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),  # 50 Mo
            ('grpc.max_send_message_length', 50 * 1024 * 1024),     # 50 Mo
        ]
    )

    # ajoute implementation SlamService au serveur definie ci dessus
    slam_service_pb2_grpc.add_SlamServiceServicer_to_server(SlamServiceServicer(), server)
    # ajoute port de connexion au serveur
    server.add_insecure_port('[::]:9090')
    print("Le serveur est en cours d'exécution sur le port 9090...")
    # lance le serveur
    server.start()
    # attend une commande pour stopper le serveur
    server.wait_for_termination()

# lancement app
if __name__ == '__main__':
    serve()
