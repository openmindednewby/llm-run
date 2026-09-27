import { createSHA256 } from 'hash-wasm';
import { ErrorCode, LlmRunError } from '../errors';
import type { ByteSink, ModelFile, ProgressEvent, SinkFactory } from '../types';

export type { ByteSink, SinkFactory } from '../types';

const MAX_NETWORK_ATTEMPTS = 3;
const MAX_INTEGRITY_ATTEMPTS = 2;
const HTTP_PARTIAL = 206;

const nameOf = (e: unknown): unknown => (typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined);

export interface EnsureFileRequest {
  file: ModelFile;
  url: string;
  sinks: SinkFactory | null;
  fetchFn: typeof fetch;
  headers?: HeadersInit;
  onProgress?: (e: ProgressEvent) => void;
}

/** Cache key for a file: its SHA-256 when the Hub gave one, else the encoded URL. */
export const fileKey = (f: ModelFile, url: string): string => f.sha256 ?? encodeURIComponent(url);

/** Last queued ensureFile per cache key, per SinkFactory: one download per key at a time. */
const inFlight = new WeakMap<SinkFactory, Map<string, Promise<unknown>>>();

/**
 * Returns the file as a Blob: from the cache when committed, else downloaded with Range resume
 * (3 network attempts) and SHA-256 verified (one re-fetch on mismatch, then E_INTEGRITY).
 * Concurrent calls for the same key on the same sinks run one after another, so their appends
 * never interleave; the later call then finds the file committed and downloads nothing.
 */
export function ensureFile(req: EnsureFileRequest): Promise<Blob> {
  const key = fileKey(req.file, req.url);
  if (!req.sinks) {
    return download(req, key);
  }
  let queue = inFlight.get(req.sinks);
  if (!queue) {
    queue = new Map();
    inFlight.set(req.sinks, queue);
  }
  const keyQueue = queue;
  const run = (keyQueue.get(key) ?? Promise.resolve()).then(
    () => download(req, key),
    () => download(req, key),
  );
  const settled = run.catch(() => undefined);
  keyQueue.set(key, settled);
  void settled.then(() => {
    if (keyQueue.get(key) === settled) {
      keyQueue.delete(key);
    }
  });
  return run;
}

async function download(req: EnsureFileRequest, key: string): Promise<Blob> {
  const cached = req.sinks ? await req.sinks.getCommitted(key) : null;
  if (cached) {
    return cached;
  }
  const sink = req.sinks ? await req.sinks.open(key) : memorySink();
  for (let attempt = 1; attempt <= MAX_INTEGRITY_ATTEMPTS; attempt += 1) {
    await fill(sink, req);
    if (req.file.sha256 === null || (await sha256Of(sink)) === req.file.sha256) {
      return sink.commit();
    }
    await sink.truncate();
  }
  throw new LlmRunError(ErrorCode.Integrity, `${req.file.path} failed its SHA-256 check twice`);
}

async function fill(sink: ByteSink, req: EnsureFileRequest): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
    try {
      if (await pull(sink, req)) {
        return;
      }
    } catch (e) {
      if (e instanceof LlmRunError) {
        throw e;
      }
      if (nameOf(e) === 'QuotaExceededError') {
        throw new LlmRunError(ErrorCode.Storage, `not enough browser storage to cache ${req.file.path}: ${String(e)}`);
      }
      lastError = e;
    }
  }
  throw new LlmRunError(
    ErrorCode.Network,
    `download of ${req.file.path} failed ${MAX_NETWORK_ATTEMPTS} times: ${String(lastError)}`,
  );
}

/** Returns true when the sink holds the whole file. Size 0 = unknown to the Hub: complete when the body ends. */
async function pull(sink: ByteSink, req: EnsureFileRequest): Promise<boolean> {
  const sizeKnown = req.file.size > 0;
  let have = await sink.size();
  if (sizeKnown && have === req.file.size) {
    return true;
  }
  if (sizeKnown && have > req.file.size) {
    // stale or overshooting partial: a Range past the end would 416 forever on a persistent sink
    await sink.truncate();
    have = 0;
  }
  const headers = new Headers(req.headers);
  if (have > 0) {
    headers.set('range', `bytes=${have}-`);
  }
  const res = await req.fetchFn(req.url, { headers });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (have > 0 && res.status !== HTTP_PARTIAL) {
    await sink.truncate();
  }
  await stream(res.body, sink, req);
  return !sizeKnown || (await sink.size()) === req.file.size;
}

async function stream(body: ReadableStream<Uint8Array>, sink: ByteSink, req: EnsureFileRequest): Promise<void> {
  let loaded = await sink.size();
  const reader = body.getReader();
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      await sink.append(r.value);
      loaded += r.value.length;
      req.onProgress?.({ file: req.file.path, loadedBytes: loaded, totalBytes: req.file.size });
    }
  } finally {
    await sink.close();
  }
}

async function sha256Of(sink: ByteSink): Promise<string> {
  const h = await createSHA256();
  h.init();
  for await (const chunk of sink.read()) {
    h.update(chunk);
  }
  return h.digest('hex');
}

async function* replay(parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) {
    yield await Promise.resolve(p);
  }
}

/** Uncached download target (sinks: null): holds the bytes in memory only. */
function memorySink(): ByteSink {
  let parts: Uint8Array<ArrayBuffer>[] = [];
  return {
    size: (): Promise<number> => Promise.resolve(parts.reduce((n, p) => n + p.length, 0)),
    append: (c: Uint8Array): Promise<void> => {
      parts.push(new Uint8Array(c));
      return Promise.resolve();
    },
    close: (): Promise<void> => Promise.resolve(),
    read: (): AsyncIterable<Uint8Array> => replay(parts),
    truncate: (): Promise<void> => {
      parts = [];
      return Promise.resolve();
    },
    commit: (): Promise<Blob> => Promise.resolve(new Blob(parts)),
  };
}
