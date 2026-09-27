import { ensureFile } from '../../src/store/download';
import { memorySinks } from '../helpers/memorySinks';

const file = { path: 'm.gguf', size: 3, sha256: 'b'.repeat(64) }; // never matches the bytes below

describe('AC-7 a corrupted shard is re-fetched once; a second mismatch throws E_INTEGRITY', () => {
  it('AC-7 fetches twice, then throws E_INTEGRITY', async () => {
    const fetchFn = jest.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    await expect(ensureFile({ file, url: 'https://x/m.gguf', sinks: memorySinks(), fetchFn }))
      .rejects.toMatchObject({ code: 'E_INTEGRITY' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
