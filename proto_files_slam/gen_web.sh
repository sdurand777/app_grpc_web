
# ATTENTION IL FAUT INSTALLER LE BINAIRE protoc-gen-grpc-web avec la commande
# npm install google-protobuf grpc-web --save-dev
# il doit etre dans node_modules dans home normalement ~/node_modules/.bin/

# protoc -I=. pointcloud.proto slam_service.proto \
#   --js_out=import_style=commonjs:. \
#   --grpc-web_out=import_style=commonjs,mode=grpcwebtext:.

protoc \
  --plugin=protoc-gen-js=$HOME/node_modules/.bin/protoc-gen-js \
  --plugin=protoc-gen-grpc-web=$HOME/node_modules/.bin/protoc-gen-grpc-web \
  --js_out=import_style=commonjs,binary:. \
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:. \
  -I. \
  pointcloud.proto slam_service.proto
