
const express = require('express');
const path = require('path');
const cors = require('cors'); // Importer le middleware CORS
const app = express();

// Activer les en-têtes CORS pour toutes les routes
app.use(cors());

// Serve static files from the 'public/dist' directory
app.use(express.static(path.join(__dirname, 'public/dist')));

// Route to serve the index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/dist', 'index.html'));
});

// Start the server
const port = 3000;
const host = '0.0.0.0'; // Listen on all network interfaces
app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
    console.log("Accessible depuis d'autres appareils sur le réseau.");
});
