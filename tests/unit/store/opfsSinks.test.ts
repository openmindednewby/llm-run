import { createOpfsSinks } from '../../../src/store/opfsSinks';

// Minimal OPFS double: writes land in a swap copy that replaces the file on close() (as in browsers),
// and a write that overlaps another write on the same file fails the test.
class FakeFile {
  data = new Uint8Array(0);
  busy = false;
}
class FakeHandle {
  constructor(private readonly f: FakeFile, private readonly writable: boolean) {}
  getFile(): Promise<Blob> {
    return Promise.resolve(new Blob([this.f.data.slice()]));
  }
  get createWritable(): ((o: { keepExistingData: boolean }) => Promise<unknown>) | undefined {
    return this.writable ? (o): Promise<unknown> => Promise.resolve(this.open(o.keepExistingData)) : undefined;
  }
  private open(keep: boolean): unknown {
    const f = this.f;
    let swap = keep ? f.data.slice() : new Uint8Array(0);
    let at = 0;
    return {
      seek: (n: number): Promise<void> => { at = n; return Promise.resolve(); },
      write: async (c: Uint8Array): Promise<void> => {
        if (f.busy) { throw new Error('overlapping write'); }
        f.busy = true;
        await new Promise((r) => setTimeout(r, 1));
        const next = new Uint8Array(Math.max(swap.length, at + c.length));
        next.set(swap);
        next.set(c, at);
        swap = next;
        at += c.length;
        f.busy = false;
      },
      close: (): Promise<void> => { f.data = swap; return Promise.resolve(); },
    };
  }
}
class FakeDir {
  files = new Map<string, FakeFile>();
  constructor(private readonly writable = true) {}
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FakeHandle> {
    let f = this.files.get(name);
    if (!f && !o?.create) { return Promise.reject(new DOMException('missing', 'NotFoundError')); }
    if (!f) { f = new FakeFile(); this.files.set(name, f); }
    return Promise.resolve(new FakeHandle(f, this.writable));
  }
  getDirectoryHandle(): Promise<FakeDir> {
    return Promise.resolve(this);
  }
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const withOpfs = (dir: FakeDir): void => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { storage: { getDirectory: (): Promise<FakeDir> => Promise.resolve(dir) } },
  });
};
afterEach(() => {
  if (original) { Object.defineProperty(globalThis, 'navigator', original); }
});

const text = async (b: Blob): Promise<string> => new TextDecoder().decode(await b.arrayBuffer());
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('createOpfsSinks', () => {
  it('no OPFS or no createWritable → null plus a "cache unavailable" warning', async () => {
    const onWarning = jest.fn();
    await expect(createOpfsSinks(onWarning)).resolves.toBeNull(); // node has no navigator.storage.getDirectory
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('cache unavailable'));
  });

  it('OPFS without createWritable (Safari) → null plus the warning', async () => {
    withOpfs(new FakeDir(false));
    const onWarning = jest.fn();
    await expect(createOpfsSinks(onWarning)).resolves.toBeNull();
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('cache unavailable'));
  });

  it('append after close reopens and continues at the end (download retry path)', async () => {
    withOpfs(new FakeDir());
    const sinks = await createOpfsSinks();
    const sink = await sinks?.open('k');
    await sink?.append(enc('ab'));
    await sink?.close();
    await sink?.append(enc('cd'));
    await sink?.close();
    expect(await sink?.size()).toBe(4);
    await expect(sinks?.getCommitted('k')).resolves.toBeNull();
    const blob = await sink?.commit();
    expect(blob && (await text(blob))).toBe('abcd');
    const cached = await sinks?.getCommitted('k');
    expect(cached && (await text(cached))).toBe('abcd');
  });

  it('serializes operations on one key: concurrent appends never overlap and none are lost', async () => {
    withOpfs(new FakeDir());
    const sinks = await createOpfsSinks();
    const a = await sinks?.open('k');
    const b = await sinks?.open('k');
    await Promise.all([a?.append(enc('1')), b?.append(enc('2')), a?.append(enc('3'))]);
    await Promise.all([a?.close(), b?.close()]);
    expect(await a?.size()).toBe(3);
  });

  it('truncate empties the file and drops an open writer', async () => {
    withOpfs(new FakeDir());
    const sinks = await createOpfsSinks();
    const sink = await sinks?.open('k');
    await sink?.append(enc('xyz'));
    await sink?.truncate();
    await sink?.append(enc('q'));
    await sink?.close();
    expect(await sink?.size()).toBe(1);
  });
});
