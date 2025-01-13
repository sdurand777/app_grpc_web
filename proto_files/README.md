
# installer les repos dont on a besoin
./install_protoc.sh

# generer les fichiers protoc pour la communication
./gen_python.sh
./gen_web.sh

# verifier que les fichiers ont ete generes
