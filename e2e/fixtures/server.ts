// Fixture Hub for the browser ACs. Node built-ins only; run by Node's built-in type stripping.
//   GET  /api/models/<id>?blobs=true      -> e2e/fixtures/models/<id>/info.json
//   GET  /<id>/resolve/<rev>/<file>        -> the file, Accept-Ranges, 206 for `Range: bytes=N-[M]`
//   GET  /wllama/<file>                    -> @wllama/wllama's wasm (no CDN, ruling #26)
//   GET  /__stats                          -> { [path]: { requests, bytesSent } }
//   POST /__cut?path=<suffix>&bytes=<n>    -> the next matching download is cut after n bytes (once)
//   POST /__reset                          -> clears stats and armed cuts (ruling #16)
//   anything else                          -> static from e2e/dist (COOP/COEP on every response)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

interface Entry { requests: number; bytesSent: number }
interface Cut { path: string; bytes: number }
interface Track { path: string; entry: Entry }
type Res = ServerResponse;

const DEFAULT_PORT = 4173;
const HTTP_OK = 200;
const HTTP_PARTIAL = 206;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_RANGE_NOT_SATISFIABLE = 416;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const ROOT = resolve('e2e/dist');
const MODELS = resolve('e2e/fixtures/models');
const WLLAMA = resolve('node_modules/@wllama/wllama/esm/wasm');
const RESOLVE_RE = /^\/(.+)\/resolve\/([^/]+)\/(.+)$/;
const RANGE_RE = /^bytes=(\d+)-(\d*)$/;
const TYPES: Record<string, string | undefined> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm',
};

let stats: Record<string, Entry | undefined> = {};
let cuts: Cut[] = [];

function isolate(res: Res): void {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

/** Resolves `rel` under `base`, or null when it escapes it or is not a file. */
function safeFile(base: string, rel: string): string | null {
  const p = normalize(join(base, rel));
  const inside = p === base || p.startsWith(base + sep);
  if (!inside || !existsSync(p) || !statSync(p).isFile()) {
    return null;
  }
  return p;
}

function sendJson(res: Res, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Takes the armed cut for `track` (once), or Infinity when none is armed. */
function takeCut(track: Track | null): number {
  const i = track ? cuts.findIndex((c) => track.path.endsWith(c.path)) : -1;
  if (i < 0) {
    return Infinity;
  }
  const [cut] = cuts.splice(i, 1);
  return cut?.bytes ?? Infinity;
}

function sendFile(req: IncomingMessage, res: Res, file: string, track: Track | null): void {
  const size = statSync(file).size;
  const m = RANGE_RE.exec(req.headers.range ?? '');
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (m && start >= size) {
    res.writeHead(HTTP_RANGE_NOT_SATISFIABLE, { 'Content-Range': `bytes */${size}` });
    res.end();
    return;
  }
  const headers: Record<string, string | number> = {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
  };
  if (m) {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(m ? HTTP_PARTIAL : HTTP_OK, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const limit = Math.min(end, start + takeCut(track) - 1);
  const stream = createReadStream(file, { start, end: limit });
  stream.on('data', (chunk) => {
    if (track) {
      track.entry.bytesSent += chunk.length;
    }
  });
  // A cut sends fewer bytes than Content-Length promised, then drops the socket.
  stream.on('end', () => (limit < end ? res.destroy() : res.end()));
  stream.on('error', () => res.destroy());
  stream.pipe(res, { end: false });
}

function armCut(url: URL, res: Res): void {
  const path = url.searchParams.get('path');
  const bytes = Number(url.searchParams.get('bytes'));
  if (path === null || path === '' || !url.searchParams.has('bytes') || !Number.isInteger(bytes) || bytes < 1) {
    sendJson(res, HTTP_BAD_REQUEST, { error: '/__cut needs path and a positive integer bytes' });
    return;
  }
  cuts.push({ path, bytes });
  sendJson(res, HTTP_OK, { ok: true });
}

function serveResolve(req: IncomingMessage, res: Res, path: string, hit: RegExpExecArray): void {
  const file = safeFile(MODELS, join(hit[1] ?? '', hit[3] ?? ''));
  if (!file) {
    sendJson(res, HTTP_NOT_FOUND, { error: 'Entry not found' });
    return;
  }
  const entry = (stats[path] ??= { requests: 0, bytesSent: 0 });
  entry.requests += 1;
  sendFile(req, res, file, { path, entry });
}

function serveUnder(req: IncomingMessage, res: Res, base: string, rel: string): void {
  const file = safeFile(base, rel);
  if (file) {
    sendFile(req, res, file, null);
    return;
  }
  sendJson(res, HTTP_NOT_FOUND, { error: 'not found' });
}

function decodePath(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function handle(req: IncomingMessage, res: Res): void {
  isolate(res);
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = decodePath(url);
  if (path === null) {
    sendJson(res, HTTP_BAD_REQUEST, { error: 'malformed path' });
    return;
  }
  const hit = RESOLVE_RE.exec(path);
  if (req.method === 'POST' && path === '/__reset') {
    stats = {};
    cuts = [];
    sendJson(res, HTTP_OK, { ok: true });
  } else if (req.method === 'POST' && path === '/__cut') {
    armCut(url, res);
  } else if (path === '/__stats') {
    sendJson(res, HTTP_OK, stats);
  } else if (path.startsWith('/api/models/')) {
    serveUnder(req, res, MODELS, join(path.slice('/api/models/'.length), 'info.json'));
  } else if (hit) {
    serveResolve(req, res, path, hit);
  } else if (path.startsWith('/wllama/')) {
    serveUnder(req, res, WLLAMA, path.slice('/wllama/'.length));
  } else {
    serveUnder(req, res, ROOT, path === '/' ? 'index.html' : path.slice(1));
  }
}

createServer(handle).listen(PORT, () => {
  process.stdout.write(`llm-run fixture hub on http://localhost:${PORT}\n`);
});
