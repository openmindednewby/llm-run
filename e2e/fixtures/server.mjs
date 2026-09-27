// Fixture Hub for the browser ACs. Node built-ins only.
//   GET  /api/models/<id>?blobs=true      -> e2e/fixtures/models/<id>/info.json
//   GET  /<id>/resolve/<rev>/<file>        -> the file, Accept-Ranges, 206 for `Range: bytes=N-[M]`
//   GET  /wllama/<file>                    -> @wllama/wllama's wasm (no CDN, ruling #26)
//   GET  /__stats                          -> { [path]: { requests, bytesSent } }
//   POST /__cut?path=<suffix>&bytes=<n>    -> the next matching download is cut after n bytes (once)
//   POST /__reset                          -> clears stats and armed cuts (ruling #16)
//   anything else                          -> static from e2e/dist (COOP/COEP on every response)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 4173);
const ROOT = resolve('e2e/dist');
const MODELS = resolve('e2e/fixtures/models');
const WLLAMA = resolve('node_modules/@wllama/wllama/esm/wasm');
const RESOLVE_RE = /^\/(.+)\/resolve\/([^/]+)\/(.+)$/;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm',
};

let stats = {};
let cuts = [];

function isolate(res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

/** Resolves `rel` under `base`, or null when it escapes it or is not a file. */
function safeFile(base, rel) {
  const p = normalize(join(base, rel));
  if (!p.startsWith(base) || !existsSync(p) || !statSync(p).isFile()) return null;
  return p;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendFile(req, res, file, track) {
  const size = statSync(file).size;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (m && start >= size) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  const headers = {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
  };
  if (m) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(m ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const cutIdx = track ? cuts.findIndex((c) => track.path.endsWith(c.path)) : -1;
  const cut = cutIdx >= 0 ? cuts.splice(cutIdx, 1)[0].bytes : Infinity;
  const limit = Math.min(end, start + cut - 1);
  const stream = createReadStream(file, { start, end: limit });
  if (track) stream.on('data', (chunk) => { track.entry.bytesSent += chunk.length; });
  // A cut sends fewer bytes than Content-Length promised, then drops the socket.
  stream.on('end', () => (limit < end ? res.destroy() : res.end()));
  stream.on('error', () => res.destroy());
  stream.pipe(res, { end: false });
  return undefined;
}

createServer((req, res) => {
  isolate(res);
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  if (req.method === 'POST' && path === '/__reset') {
    stats = {};
    cuts = [];
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/__cut') {
    cuts.push({ path: url.searchParams.get('path') ?? '', bytes: Number(url.searchParams.get('bytes')) });
    return sendJson(res, 200, { ok: true });
  }
  if (path === '/__stats') return sendJson(res, 200, stats);
  if (path.startsWith('/api/models/')) {
    const info = safeFile(MODELS, join(path.slice('/api/models/'.length), 'info.json'));
    return info ? sendFile(req, res, info, null) : sendJson(res, 404, { error: 'Repository not found' });
  }
  const hit = RESOLVE_RE.exec(path);
  if (hit) {
    const file = safeFile(MODELS, join(hit[1], hit[3]));
    if (!file) return sendJson(res, 404, { error: 'Entry not found' });
    const entry = (stats[path] ??= { requests: 0, bytesSent: 0 });
    entry.requests += 1;
    return sendFile(req, res, file, { path, entry });
  }
  if (path.startsWith('/wllama/')) {
    const file = safeFile(WLLAMA, path.slice('/wllama/'.length));
    return file ? sendFile(req, res, file, null) : sendJson(res, 404, { error: 'not found' });
  }
  const file = safeFile(ROOT, path === '/' ? 'index.html' : path.slice(1));
  return file ? sendFile(req, res, file, null) : sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`llm-run fixture hub on http://localhost:${PORT}`));
