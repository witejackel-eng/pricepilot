const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/home/z/my-project/pricepilot/.next';
const PORT = 3001;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.rsc': 'text/x-component',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  
  // Security headers (basic)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }
  
  let filePath;
  if (urlPath.startsWith('/_next/static/')) {
    filePath = path.join(ROOT, urlPath.replace('/_next/', ''));
  } else if (urlPath.startsWith('/_next/data/')) {
    // RSC data routes - serve from server/app
    filePath = path.join(ROOT, 'server', 'app', urlPath.replace('/_next/data/', ''));
  } else if (urlPath === '/index.html') {
    filePath = path.join(ROOT, 'server', 'app', 'index.html');
  } else if (urlPath.endsWith('.rsc')) {
    filePath = path.join(ROOT, 'server', 'app', urlPath);
  } else {
    // Try to serve from public, then fall back to index.html for SPA-like routes
    const publicPath = path.join('/home/z/my-project/pricepilot/public', urlPath);
    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
      filePath = publicPath;
    } else {
      filePath = path.join(ROOT, 'server', 'app', 'index.html');
    }
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`PricePilot static server on http://localhost:${PORT}`);
});
