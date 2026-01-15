import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Setup __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = join(__dirname, 'dist');

// Debug logs for deployment
console.log('Starting server...');
console.log(`Serving files from: ${DIST_DIR}`);

// Serve static files from the dist directory
app.use(express.static(DIST_DIR));

// For any other request, send the index.html file (SPA routing)
app.get('*', (req, res) => {
  console.log(`Received request for: ${req.path}`);
  res.sendFile(join(DIST_DIR, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Frontend server running on port ${PORT}`);
  console.log(`📁 Serving files from ${DIST_DIR}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
});
