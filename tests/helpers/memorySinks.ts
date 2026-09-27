// In-memory SinkFactory for download tests. MemSink/MemSinks mirror src ByteSink/SinkFactory
// locally so this helper type-checks before src/store/download.ts exists; the compiler checks
// the match where a test passes memorySinks() as EnsureFileRequest.sinks.
type Chunk = Uint8Array<ArrayBuffer>;

export interface MemSink {
  size(): Promise<number>; append(c: Uint8Array): Promise<void>; close(): Promise<void>;
  read(): AsyncIterable<Uint8Array>; truncate(): Promise<void>; commit(): Promise<Blob>;
}
export interface MemSinks {
  bytes: Map<string, Chunk[]>;
  open(key: string): Promise<MemSink>;
  getCommitted(key: string): Promise<Blob | null>;
}

async function* replay(chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const c of chunks) {
    yield await Promise.resolve(c);
  }
}

export function memorySinks(): MemSinks {
  const bytes = new Map<string, Chunk[]>();
  const done = new Set<string>();
  const chunksOf = (key: string): Chunk[] => bytes.get(key) ?? [];
  const sink = (key: string): MemSink => ({
    size: (): Promise<number> => Promise.resolve(chunksOf(key).reduce((n, c) => n + c.length, 0)),
    append: (c: Uint8Array): Promise<void> => {
      bytes.set(key, [...chunksOf(key), new Uint8Array(c)]);
      return Promise.resolve();
    },
    close: (): Promise<void> => Promise.resolve(),
    read: (): AsyncIterable<Uint8Array> => replay(chunksOf(key)),
    truncate: (): Promise<void> => {
      bytes.set(key, []);
      return Promise.resolve();
    },
    commit: (): Promise<Blob> => {
      done.add(key);
      return Promise.resolve(new Blob(chunksOf(key)));
    },
  });
  return {
    bytes,
    open: (k: string): Promise<MemSink> => Promise.resolve(sink(k)),
    getCommitted: (k: string): Promise<Blob | null> => Promise.resolve(done.has(k) ? new Blob(chunksOf(k)) : null),
  };
}
