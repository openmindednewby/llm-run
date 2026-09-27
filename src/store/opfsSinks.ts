import type { ByteSink, SinkFactory } from '../types';

const DIR = 'llm-run';
const PROBE = '.probe';
const DONE_SUFFIX = '.ok';
const PART_DIGITS = 4;
/** Bytes per part file. A part is closed (made durable) when full, so a tab close loses at most one part. */
export const PART_BYTES = 64 * 1024 ** 2;
const READ_CHUNK = 8 * 1024 ** 2;
const UNAVAILABLE =
  '[llm-run] cache unavailable in this browser: the model will be downloaded on every visit';

/** A file handle whose createWritable may be missing (Safari exposes OPFS without it on the main thread). */
interface WritableHandle {
  getFile(): Promise<Blob>;
  createWritable?: (o: { keepExistingData: boolean }) => Promise<FileSystemWritableFileStream>;
}

/** The open part: its writer and how many bytes it holds including unflushed writes. */
interface OpenPart {
  writer: FileSystemWritableFileStream;
  length: number;
}

/** Per-key state shared by every sink opened on that key: one part count, one writer, one queue. */
interface KeyState {
  dir: FileSystemDirectoryHandle;
  key: string;
  parts: number;
  open: OpenPart | null;
  tail: Promise<unknown>;
}

const partName = (key: string, i: number): string => `${key}.part${String(i).padStart(PART_DIGITS, '0')}`;

/**
 * OPFS-backed SinkFactory, or null (plus a "cache unavailable" warning) when this browser has no
 * OPFS or no createWritable — the caller then downloads into memory on every visit.
 * Each key is stored as part files `<key>.partNNNN` of PART_BYTES plus a `<key>.ok` commit marker.
 */
export async function createOpfsSinks(onWarning?: (m: string) => void): Promise<SinkFactory | null> {
  const root = await openRoot();
  if (!root || !(await canWrite(root))) {
    onWarning?.(UNAVAILABLE);
    return null;
  }
  const dir = await root.getDirectoryHandle(DIR, { create: true });
  const keys = new Map<string, Promise<KeyState>>();
  const stateOf = (key: string): Promise<KeyState> => {
    let s = keys.get(key);
    if (!s) {
      s = newState(dir, key);
      keys.set(key, s);
    }
    return s;
  };
  return {
    open: async (key: string): Promise<ByteSink> => opfsSink(await stateOf(key)),
    getCommitted: (key: string): Promise<Blob | null> => committed(dir, key),
  };
}

async function openRoot(): Promise<FileSystemDirectoryHandle | undefined> {
  const storage = (globalThis as { navigator?: { storage?: Partial<StorageManager> } }).navigator?.storage;
  if (typeof storage?.getDirectory !== 'function') {
    return undefined;
  }
  return storage.getDirectory().catch(() => undefined);
}

/** True when a file handle in root exposes createWritable; the probe file is removed afterwards. */
async function canWrite(root: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const probe = (await root.getFileHandle(PROBE, { create: true })) as WritableHandle;
    await root.removeEntry(PROBE).catch(() => undefined);
    return typeof probe.createWritable === 'function';
  } catch {
    return false;
  }
}

async function tryHandle(dir: FileSystemDirectoryHandle, name: string): Promise<WritableHandle | null> {
  try {
    return (await dir.getFileHandle(name)) as WritableHandle;
  } catch {
    return null;
  }
}

/** Part handles in order; parts are contiguous from 0, so the first missing name ends the list. */
async function partHandles(dir: FileSystemDirectoryHandle, key: string): Promise<WritableHandle[]> {
  const out: WritableHandle[] = [];
  for (let h = await tryHandle(dir, partName(key, 0)); h; h = await tryHandle(dir, partName(key, out.length))) {
    out.push(h);
  }
  return out;
}

async function partFiles(dir: FileSystemDirectoryHandle, key: string): Promise<Blob[]> {
  return Promise.all((await partHandles(dir, key)).map((h) => h.getFile()));
}

async function newState(dir: FileSystemDirectoryHandle, key: string): Promise<KeyState> {
  const parts = (await partHandles(dir, key)).length;
  return { dir, key, parts, open: null, tail: Promise.resolve() };
}

async function committed(dir: FileSystemDirectoryHandle, key: string): Promise<Blob | null> {
  if (!(await tryHandle(dir, key + DONE_SUFFIX))) {
    return null;
  }
  try {
    return new Blob(await partFiles(dir, key));
  } catch {
    return null;
  }
}

/** Runs op after every earlier op on the same key has settled; a failed op does not block the next. */
function serial<T>(s: KeyState, op: () => Promise<T>): Promise<T> {
  const run = s.tail.then(op, op);
  s.tail = run.catch(() => undefined);
  return run;
}

async function writable(handle: WritableHandle, keepExistingData: boolean): Promise<FileSystemWritableFileStream> {
  if (typeof handle.createWritable !== 'function') {
    throw new Error('createWritable unavailable');
  }
  return handle.createWritable({ keepExistingData });
}

async function closePart(s: KeyState): Promise<void> {
  const p = s.open;
  s.open = null;
  if (p) {
    await p.writer.close();
  }
}

/** Opens the last part when it has room (never a full one), else creates the next part. */
async function openPart(s: KeyState): Promise<OpenPart> {
  const last = s.parts > 0 ? await tryHandle(s.dir, partName(s.key, s.parts - 1)) : null;
  const lastSize = last ? (await last.getFile()).size : PART_BYTES;
  if (last && lastSize < PART_BYTES) {
    const writer = await writable(last, true);
    await writer.seek(lastSize);
    return { writer, length: lastSize };
  }
  const handle = (await s.dir.getFileHandle(partName(s.key, s.parts), { create: true })) as WritableHandle;
  s.parts += 1;
  return { writer: await writable(handle, false), length: 0 };
}

async function appendChunk(s: KeyState, chunk: Uint8Array): Promise<void> {
  for (let at = 0; at < chunk.length; ) {
    const part = s.open ?? (await openPart(s));
    s.open = part;
    const n = Math.min(PART_BYTES - part.length, chunk.length - at);
    await part.writer.write(chunk.subarray(at, at + n) as Uint8Array<ArrayBuffer>);
    part.length += n;
    at += n;
    if (part.length >= PART_BYTES) {
      await closePart(s);
    }
  }
}

/** Removes the commit marker first (a crash mid-truncate must not leave a "committed" partial), then the parts. */
async function removeAll(s: KeyState): Promise<void> {
  await s.dir.removeEntry(s.key + DONE_SUFFIX).catch(() => undefined);
  await closePart(s);
  for (let i = s.parts - 1; i >= 0; i -= 1) {
    await s.dir.removeEntry(partName(s.key, i)).catch(() => undefined);
  }
  s.parts = 0;
}

/** Reads the parts as they stand once every queued write before this call has settled. */
async function* readSnapshot(s: KeyState): AsyncGenerator<Uint8Array> {
  const files = await serial(s, () => partFiles(s.dir, s.key));
  for (const file of files) {
    for (let at = 0; at < file.size; at += READ_CHUNK) {
      yield new Uint8Array(await file.slice(at, at + READ_CHUNK).arrayBuffer());
    }
  }
}

/**
 * While a part is open, its getFile().size excludes unflushed bytes: download.ts calls size()
 * only before the first append and after close(). Append after close reopens the last part if it has room.
 */
function opfsSink(s: KeyState): ByteSink {
  const totalSize = async (): Promise<number> =>
    (await partFiles(s.dir, s.key)).reduce((n, f) => n + f.size, 0);
  return {
    size: (): Promise<number> => serial(s, totalSize),
    append: (chunk: Uint8Array): Promise<void> => serial(s, () => appendChunk(s, chunk)),
    close: (): Promise<void> => serial(s, () => closePart(s)),
    read: (): AsyncIterable<Uint8Array> => readSnapshot(s),
    truncate: (): Promise<void> => serial(s, () => removeAll(s)),
    commit: (): Promise<Blob> =>
      serial(s, async () => {
        await closePart(s);
        await s.dir.getFileHandle(s.key + DONE_SUFFIX, { create: true });
        return new Blob(await partFiles(s.dir, s.key));
      }),
  };
}
