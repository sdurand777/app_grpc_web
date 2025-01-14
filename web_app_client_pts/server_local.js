
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public/dist')));

// Route to serve the index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '.', 'index.html'));
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log("C'est le bon serveur ...........");

});
