#!/usr/bin/env node
/* Server statico minimo per lo sviluppo locale: node tools/serve.mjs [porta] */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* La porta si può passare come argomento o come variabile d'ambiente:
   serve quando 8123 è già occupata da un'altra sessione. */
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8123;

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(ROOT, normalize(rel === '/' ? '/index.html' : rel));

  // Nessuna fuga dalla cartella del progetto.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('403'); return; }

  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TIPI[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }).end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — non trovato');
  }
}).listen(PORT, () => console.log(`Cineteca su http://localhost:${PORT}`));
