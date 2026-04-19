const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3100;
const router = require('./server/router');
const gemini = require('./server/ai/gemini');

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Healthcheck (Railway pings this)
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', gemini: gemini.keyConfigured() }));
    return;
  }

  // API routes
  if (req.url.startsWith('/api/')) {
    const handled = await router.handle(req, res);
    if (handled === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, filePath);
  // Guard against path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Fall through to index.html for SPA hash routes
      fs.readFile(path.join(__dirname, 'index.html'), (e, c) => {
        if (e) { res.writeHead(500); res.end('Server error'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(c);
      });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Revenue Intelligence Platform running on http://localhost:${PORT}`);
  console.log(`Gemini API key: ${gemini.keyConfigured() ? 'configured' : 'NOT configured (demo mode only)'}`);
  console.log(`SFDC adapter: ${process.env.RI_SFDC_IMPL || 'mock'}`);
});
