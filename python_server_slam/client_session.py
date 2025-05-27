#!/usr/bin/env python3
"""
Script simple pour tester l'envoi d'un SessionInfo
"""

import os
import sys
import grpc
from datetime import datetime

# Ajouter le chemin vers les fichiers proto générés
current_dir = os.path.dirname(os.path.abspath(__file__))
gen_python_path = os.path.join(current_dir, '..', 'proto_files_slam')
sys.path.append(gen_python_path)

import pointcloud_pb2
import slam_service_pb2_grpc
from google.protobuf.empty_pb2 import Empty

def main():
    # Connexion au serveur
    channel = grpc.insecure_channel('localhost:50051')
    stub = slam_service_pb2_grpc.SlamServiceStub(channel)
    
    # Créer un SessionInfo
    session_info = pointcloud_pb2.SessionInfo()
    session_info.session_id = "test-session-123"
    session_info.start_time = datetime.now().isoformat()
    session_info.is_active = True
    session_info.clients_connected = 1
    
    try:
        # Envoyer le SessionInfo
        print(f"Envoi SessionInfo: {session_info.session_id}")
        response = stub.SetSessionInfo(session_info)
        print("✅ SessionInfo envoyé avec succès!")
        
        # Récupérer les infos du serveur
        print("Récupération des infos du serveur...")
        server_info = stub.GetSessionInfo(Empty())
        print(f"Serveur SessionInfo: {server_info.session_id}")
        
    except grpc.RpcError as e:
        print(f"❌ Erreur: {e}")
    finally:
        channel.close()

if __name__ == "__main__":
    main()
