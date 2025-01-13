
# client web pour communiquer avec le server 
# client simple avec webpack lancer via un server python simple

python3 -m http.server 3000

# copier les fichiers protoc generes dans ce dossier voir le fichier client.js

# installer app
npm init -y
npm install

# compiler avec webpack 
npx webpack ./client.js
