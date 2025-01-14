import os
import sys
import grpc
from concurrent import futures
from google.protobuf.empty_pb2 import Empty

current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_exp')
sys.path.append(gen_python_path)

import slam_service_pb2
import slam_service_pb2_grpc
import pointcloud_pb2
import time


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


    # RPC GetSlamData pour envoyer les data pcds poses et indices 
    def GetSlamData(self, request, context):
        print("Envoi des slam data au client ...")
        try:
            while True:  # Boucle infinie pour envoyer les points et les poses en continu
                # Envoyer les points et poses déjà reçus
                if self.slam_data:
                    for pointcloudlist, poselist, indexlist in self.slam_data:
                        print(f"Envoi liste pcds avec {len(pointcloudlist.pointclouds)} pointclouds.")
                        print(f"Envoi liste poses avec matrice : {len(poselist.poses)}")
                        
                        # Créez l'objet PointCloudWithPose à envoyer
                        yield pointcloud_pb2.SlamData(pointcloudlist=pointcloudlist, poselist=poselist, indexlist=indexlist)

                    print("Nettoyage des données déjà envoyées...")
                    # Supprimer les données envoyées
                    self.slam_data = []

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
    server.add_insecure_port('[::]:9090')  # Port pour le proxy
    server.add_insecure_port('[::]:50051')  # Port pour le client
    print("Le serveur est en cours d'exécution sur le port 9090 et 50051...")
    # lance le serveur
    server.start()
    # attend une commande pour stopper le serveur
    server.wait_for_termination()

# lancement app
if __name__ == '__main__':
    serve()
