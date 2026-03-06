const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.join(__dirname);

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // Decode URL encoding so [ ] & spaces etc. resolve to actual filenames
  try { urlPath = decodeURIComponent(urlPath); } catch(e) {}

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404); res.end('Not found: ' + urlPath); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = mime[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');

    // Range support for audio seeking
    const range = req.headers.range;
    if (range && (type.startsWith('audio') || type.startsWith('video'))) {
      const total = stats.size;
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1048576, total - 1);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      res.writeHead(206);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stats.size);
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Mario Kart World Radio running at: http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
  const { exec } = require('child_process');
  exec('start http://localhost:' + PORT);
});
