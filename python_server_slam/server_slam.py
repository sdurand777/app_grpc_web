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

import collections


# def apply_voxel_grid_filter(pointcloud, voxel_size=0.05):
#     """
#     Réduit la densité d'un nuage de points en appliquant un filtre de type grille voxel.
#     :param pointcloud: Objet PointCloud contenant une liste de points avec des attributs x, y, z.
#     :param voxel_size: Taille du voxel en mètres.
#     :return: Nouvel objet PointCloud filtré.
#     """
#     voxel_dict = collections.defaultdict(list)
#
#     # Regrouper les points par voxel
#     for point in pointcloud.points:
#         voxel_idx = (
#             int(point.x / voxel_size),
#             int(point.y / voxel_size),
#             int(point.z / voxel_size)
#         )
#         voxel_dict[voxel_idx].append(point)
#
#     # Calculer le centroïde de chaque voxel
#     filtered_points = []
#     for points in voxel_dict.values():
#         x = sum(p.x for p in points) / len(points)
#         y = sum(p.y for p in points) / len(points)
#         z = sum(p.z for p in points) / len(points)
#         new_point = type(points[0])()  # Crée une nouvelle instance de Point
#         new_point.x = x
#         new_point.y = y
#         new_point.z = z
#         filtered_points.append(new_point)
#
#     # Créer un nouveau PointCloud avec les points filtrés
#     new_pointcloud = type(pointcloud)()
#     new_pointcloud.points.extend(filtered_points)
#     return new_pointcloud


def apply_voxel_grid_filter(pointcloud, voxel_size=0.05):
    """
    Réduit la densité d'un nuage de points en appliquant un filtre de type grille voxel.
    Pour chaque voxel, le point représentatif est positionné au centroïde des points du voxel,
    et sa couleur est celle du point le plus proche du centroïde.
    :param pointcloud: Objet PointCloud contenant une liste de points avec des attributs x, y, z, r, g, b.
    :param voxel_size: Taille du voxel en mètres.
    :return: Nouvel objet PointCloud filtré.
    """
    voxel_dict = collections.defaultdict(list)

    # Regrouper les points par voxel
    for point in pointcloud.points:
        voxel_idx = (
            int(point.x / voxel_size),
            int(point.y / voxel_size),
            int(point.z / voxel_size)
        )
        voxel_dict[voxel_idx].append(point)

    # Calculer le centroïde de chaque voxel et attribuer la couleur du point le plus proche
    filtered_points = []
    for points in voxel_dict.values():
        n = len(points)
        centroid_x = sum(p.x for p in points) / n
        centroid_y = sum(p.y for p in points) / n
        centroid_z = sum(p.z for p in points) / n

        # Trouver le point le plus proche du centroïde
        closest_point = min(
            points,
            key=lambda p: (p.x - centroid_x) ** 2 + (p.y - centroid_y) ** 2 + (p.z - centroid_z) ** 2
        )

        # Créer un nouveau point avec la position du centroïde et la couleur du point le plus proche
        new_point = type(closest_point)()
        new_point.x = centroid_x
        new_point.y = centroid_y
        new_point.z = centroid_z
        if hasattr(closest_point, 'r') and hasattr(closest_point, 'g') and hasattr(closest_point, 'b'):
            new_point.r = closest_point.r
            new_point.g = closest_point.g
            new_point.b = closest_point.b

        filtered_points.append(new_point)

    # Créer un nouveau PointCloud avec les points filtrés
    new_pointcloud = type(pointcloud)()
    new_pointcloud.points.extend(filtered_points)
    return new_pointcloud


# slam service rpc implementation des services RPC
class SlamServiceServicer(slam_service_pb2_grpc.SlamServiceServicer):
    # constructor
    def __init__(self):
        self.point_clouds = []  # Stocker les points reçus
        self.point_clouds_with_poses = []
        self.slam_data = []

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


    # # RPC GetSlamData pour envoyer les data pcds poses et indices 
    # def GetSlamData(self, request, context):
    #     print("Envoi des slam data au client ...")
    #     try:
    #         while True:  # Boucle infinie pour envoyer les points et les poses en continu
    #             # Envoyer les points et poses déjà reçus
    #             if self.slam_data:
    #                 for pointcloudlist, poselist, indexlist in self.slam_data:
    #                     print(f"Envoi liste pcds avec {len(pointcloudlist.pointclouds)} pointclouds.")
    #                     print(f"Envoi liste poses avec matrice : {len(poselist.poses)}")
    #                     
    #                     # Créez l'objet PointCloudWithPose à envoyer
    #                     yield pointcloud_pb2.SlamData(pointcloudlist=pointcloudlist, poselist=poselist, indexlist=indexlist)
    #
    #                 print("Nettoyage des données déjà envoyées...")
    #                 # Supprimer les données envoyées
    #                 self.slam_data = []
    #
    #                 # Vous pouvez aussi ajouter un petit délai entre les envois pour éviter de trop solliciter le réseau
    #                 time.sleep(0.1)
    #             else:
    #                 # Attendre un peu avant de vérifier s'il y a de nouveaux points et poses
    #                 print("En attente de nouveaux points et poses...")
    #                 time.sleep(0.1)
    #     except grpc.RpcError as e:
    #         print(f"Erreur RPC : {e.code()}, message : {e.details()}")
    #         context.set_code(grpc.StatusCode.INTERNAL)
    #         context.set_details("Erreur lors de l'envoi des points et poses.")


    def GetSlamData(self, request, context):
        print("Envoi des slam data au client ...")
        try:
            while True:
                if self.slam_data:
                    for pointcloudlist, poselist, indexlist in self.slam_data:
                        # Appliquer le filtrage spatial à chaque nuage de points
                        filtered_pointclouds = [
                            apply_voxel_grid_filter(pc, voxel_size=0.05) for pc in pointcloudlist.pointclouds
                        ]
                        # Créer un nouvel objet PointCloudList avec les nuages filtrés
                        filtered_pointcloudlist = type(pointcloudlist)()
                        filtered_pointcloudlist.pointclouds.extend(filtered_pointclouds)

                        yield pointcloud_pb2.SlamData(
                            pointcloudlist=filtered_pointcloudlist,
                            poselist=poselist,
                            indexlist=indexlist
                        )
                    self.slam_data = []
                    time.sleep(0.1)
                else:
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
