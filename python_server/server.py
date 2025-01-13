
from concurrent import futures
import time
import grpc
import helloworld_pb2
import helloworld_pb2_grpc

# Implémentez le service défini dans helloworld.proto
class GreeterServicer(helloworld_pb2_grpc.GreeterServicer):
    def SayHello(self, request, context):
        # Implémentation de la méthode SayHello
        return helloworld_pb2.HelloReply(message=f"Hello! {request.name}")

    def SayRepeatHello(self, request, context):
        # Implémentation de la méthode SayRepeatHello (streaming)
        for i in range(request.count):
            yield helloworld_pb2.HelloReply(message=f"Hey! {request.name}{i}")
            time.sleep(0.5)  # Ajoute un délai de 500ms pour chaque réponse


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    helloworld_pb2_grpc.add_GreeterServicer_to_server(GreeterServicer(), server)
    server.add_insecure_port('[::]:9090')
    print("gRPC server running on port 9090")
    server.start()
    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        print("Server stopped")


if __name__ == "__main__":
    serve()
