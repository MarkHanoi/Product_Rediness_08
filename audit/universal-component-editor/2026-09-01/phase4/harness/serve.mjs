// TEMPORARY static server for the lane-4E harness bundle (deleted at end of lane).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 5211);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.map':'application/json' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = normalize(join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname));
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('nf');
  }
}).listen(PORT, '127.0.0.1', () => console.log('serving', ROOT, 'on', PORT));
