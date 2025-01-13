
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/client.js', // Point d'entrée
  output: {
    filename: 'bundle.js', // Nom du fichier de sortie
    path: path.resolve(__dirname, 'public/dist'), // Dossier de sortie
    publicPath: '/', // Chemin public pour les ressources
  },
  mode: 'development', // Mode développement
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'), // Dossier pour les fichiers statiques
    },
    port: 9000, // Port du serveur
    open: true, // Ouvrir automatiquement le navigateur
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html', // Fichier HTML source
      inject: true, // Injection automatique de `bundle.js`
    }),
  ],
};
