import { ensureFile } from '../../../src/store/download';
import { memorySinks } from '../../helpers/memorySinks';

const bytes = new Uint8Array([104, 105]); // "hi"
const SHA_HI = '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4';
const file = { path: 'm.gguf', size: 2, sha256: SHA_HI };

describe('ensureFile', () => {
  it('resumes with a Range header after a cut connection', async () => {
    let call = 0;
    const fetchFn = jest.fn(async (_u: string, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        // error() in start() would discard the queued chunk (Streams spec); cut on the second pull instead
        let pulls = 0;
        return new Response(new ReadableStream<Uint8Array>({
          pull(c): void {
            pulls += 1;
            if (pulls === 1) { c.enqueue(bytes.slice(0, 1)); } else { c.error(new TypeError('cut')); }
          },
        }));
      }
      expect(new Headers(init?.headers).get('range')).toBe('bytes=1-');
      return new Response(bytes.slice(1), { status: 206 });
    });
    const blob = await ensureFile({ file, url: 'u', sinks: memorySinks(), fetchFn: fetchFn as unknown as typeof fetch });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('second call downloads nothing (AC-5 logic)', async () => {
    const sinks = memorySinks();
    const fetchFn = jest.fn(async () => new Response(bytes));
    await ensureFile({ file, url: 'u', sinks, fetchFn });
    await ensureFile({ file, url: 'u', sinks, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls for one key share a single download (no interleaved appends)', async () => {
    const sinks = memorySinks();
    const fetchFn = jest.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull: async (c): Promise<void> => {
        await new Promise((r) => setTimeout(r, 1));
        c.enqueue(bytes.slice(0, 1));
        c.enqueue(bytes.slice(1));
        c.close();
      },
    })));
    const [a, b] = await Promise.all([
      ensureFile({ file, url: 'u', sinks, fetchFn }),
      ensureFile({ file, url: 'u', sinks, fetchFn }),
    ]);
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(bytes);
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(bytes);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('server ignores Range (200) → restarts from zero', async () => {
    const sinks = memorySinks();
    const s = await sinks.open(file.sha256);
    await s.append(new Uint8Array([9]));
    const fetchFn = jest.fn(async (_u: string, _init?: RequestInit) => new Response(bytes, { status: 200 }));
    const blob = await ensureFile({ file, url: 'u', sinks, fetchFn: fetchFn as unknown as typeof fetch });
    expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get('range')).toBe('bytes=1-');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('a sink holding more bytes than the known size is emptied, then refetched from zero', async () => {
    const sinks = memorySinks();
    const s = await sinks.open(file.sha256);
    await s.append(new Uint8Array(file.size + 10));
    const fetchFn = jest.fn(async (_u: string, init?: RequestInit) =>
      new Headers(init?.headers).has('range') ? new Response(null, { status: 416 }) : new Response(bytes));
    const blob = await ensureFile({ file, url: 'u', sinks, fetchFn: fetchFn as unknown as typeof fetch });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up with E_NETWORK after 3 failed attempts', async () => {
    const fetchFn = jest.fn(async () => { throw new TypeError('offline'); });
    await expect(ensureFile({ file, url: 'u', sinks: memorySinks(), fetchFn })).rejects.toMatchObject({ code: 'E_NETWORK' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('sinks null (no cache) → returns bytes in memory', async () => {
    const blob = await ensureFile({ file, url: 'u', sinks: null, fetchFn: jest.fn(async () => new Response(bytes)) });
    expect(blob.size).toBe(2);
  });

  it('unknown size (0) completes after one full body', async () => {
    const fetchFn = jest.fn(async () => new Response(bytes));
    const blob = await ensureFile({ file: { ...file, size: 0, sha256: null }, url: 'u', sinks: memorySinks(), fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(blob.size).toBe(2);
  });

  it('an LlmRunError from pull is rethrown at once, not retried into E_NETWORK', async () => {
    const { LlmRunError, ErrorCode } = await import('../../../src/errors');
    const fetchFn = jest.fn(async () => { throw new LlmRunError(ErrorCode.Storage, 'quota'); });
    await expect(ensureFile({ file, url: 'u', sinks: memorySinks(), fetchFn })).rejects.toMatchObject({ code: 'E_STORAGE' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
