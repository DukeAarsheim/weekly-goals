import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = normalize(path === '/' ? '/index.html' : path);
    if (rel.includes('..')) { res.writeHead(403).end(); return; }
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    if (err instanceof URIError) res.writeHead(400).end('Bad request');
    else res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving on http://localhost:${port}`));
