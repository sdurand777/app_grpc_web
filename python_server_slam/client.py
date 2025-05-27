import grpc
from google.protobuf.empty_pb2 import Empty
import pointcloud_pb2  # Pour SessionInfo
import slam_service_pb2_grpc  # Pour le stub

channel = grpc.insecure_channel('localhost:50051')
stub = slam_service_pb2_grpc.SlamServiceStub(channel)

try:
    session_info = stub.GetSessionInfo(Empty())
    print(f"Session ID: {session_info.session_id}")
    print(f"Session active: {session_info.is_active}")
    print(f"Heure de début: {session_info.start_time}")
    print(f"Clients connectés: {session_info.clients_connected}")

except grpc.RpcError as e:
    print(f"Erreur: {e}")

