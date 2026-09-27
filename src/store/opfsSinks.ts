import type { ByteSink, SinkFactory } from '../types';

const DIR = 'llm-run';
const PROBE = '.probe';
const DONE_SUFFIX = '.ok';
const READ_CHUNK = 8 * 1024 ** 2;
const UNAVAILABLE =
  '[llm-run] cache unavailable in this browser: the model will be downloaded on every visit';

/** A file handle whose createWritable may be missing (Safari exposes OPFS without it on the main thread). */
interface WritableHandle {
  getFile(): Promise<Blob>;
  createWritable?: (o: { keepExistingData: boolean }) => Promise<FileSystemWritableFileStream>;
}

/** Per-key state shared by every sink opened on that key, so two opens use one writer and one queue. */
interface KeyState {
  handle: WritableHandle;
  writer: FileSystemWritableFileStream | null;
  tail: Promise<unknown>;
}

/**
 * OPFS-backed SinkFactory, or null (plus a "cache unavailable" warning) when this browser has no
 * OPFS or no createWritable — the caller then downloads into memory on every visit.
 */
export async function createOpfsSinks(onWarning?: (m: string) => void): Promise<SinkFactory | null> {
  const root = await openRoot();
  const probe = root ? await probeHandle(root) : undefined;
  if (!root || typeof probe?.createWritable !== 'function') {
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
    open: async (key: string): Promise<ByteSink> => opfsSink(dir, key, await stateOf(key)),
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

async function probeHandle(root: FileSystemDirectoryHandle): Promise<WritableHandle | undefined> {
  try {
    return (await root.getFileHandle(PROBE, { create: true })) as WritableHandle;
  } catch {
    return undefined;
  }
}

async function newState(dir: FileSystemDirectoryHandle, key: string): Promise<KeyState> {
  const handle = (await dir.getFileHandle(key, { create: true })) as WritableHandle;
  return { handle, writer: null, tail: Promise.resolve() };
}

async function committed(dir: FileSystemDirectoryHandle, key: string): Promise<Blob | null> {
  try {
    await dir.getFileHandle(key + DONE_SUFFIX);
    return await (await dir.getFileHandle(key)).getFile();
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

async function writable(s: KeyState, keepExistingData: boolean): Promise<FileSystemWritableFileStream> {
  if (typeof s.handle.createWritable !== 'function') {
    throw new Error('createWritable unavailable');
  }
  return s.handle.createWritable({ keepExistingData });
}

async function closeWriter(s: KeyState): Promise<void> {
  const w = s.writer;
  s.writer = null;
  if (w) {
    await w.close();
  }
}

/** Reads the file as it stands once every queued write before this call has settled. */
async function* readSnapshot(s: KeyState): AsyncGenerator<Uint8Array> {
  const file = await serial(s, () => s.handle.getFile());
  for (let at = 0; at < file.size; at += READ_CHUNK) {
    yield new Uint8Array(await file.slice(at, at + READ_CHUNK).arrayBuffer());
  }
}

/**
 * While a writer is open, getFile().size excludes its unflushed bytes: download.ts calls size()
 * only before the first append and after close(). Append after close reopens and seeks to the end.
 */
function opfsSink(dir: FileSystemDirectoryHandle, key: string, s: KeyState): ByteSink {
  const fileSize = async (): Promise<number> => (await s.handle.getFile()).size;
  return {
    size: (): Promise<number> => serial(s, fileSize),
    append: (chunk: Uint8Array): Promise<void> =>
      serial(s, async () => {
        if (!s.writer) {
          const size = await fileSize();
          const w = await writable(s, true);
          await w.seek(size);
          s.writer = w;
        }
        await s.writer.write(chunk as Uint8Array<ArrayBuffer>);
      }),
    close: (): Promise<void> => serial(s, () => closeWriter(s)),
    read: (): AsyncIterable<Uint8Array> => readSnapshot(s),
    truncate: (): Promise<void> =>
      serial(s, async () => {
        await closeWriter(s);
        await (await writable(s, false)).close();
      }),
    commit: (): Promise<Blob> =>
      serial(s, async () => {
        await closeWriter(s);
        await dir.getFileHandle(key + DONE_SUFFIX, { create: true });
        return s.handle.getFile();
      }),
  };
}
