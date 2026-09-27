import { run } from '../../src/run';
import { loadCandidate } from '../../src/runtimes/loadCandidate';
import { createOpfsSinks } from '../../src/store/opfsSinks';
import { fakeFetch, json } from '../helpers/fakeFetch';
import { gpuLaptop } from '../helpers/devices';
import { ggufRepo } from '../helpers/hubFixtures';
import type { SinkFactory } from '../../src/types';

jest.mock('../../src/runtimes/loadCandidate', () => ({ loadCandidate: jest.fn() }));
jest.mock('../../src/store/opfsSinks', () => ({ createOpfsSinks: jest.fn() }));
const load = loadCandidate as jest.MockedFunction<typeof loadCandidate>;
const opfs = createOpfsSinks as jest.MockedFunction<typeof createOpfsSinks>;
const adapter = { async *chatStream() { yield 'hi'; }, unload: async () => undefined };
const sinks: SinkFactory = { open: jest.fn(), getCommitted: jest.fn() };

beforeEach(() => { load.mockReset(); load.mockResolvedValue(adapter); opfs.mockResolvedValue(sinks); });

it('gated base resolved to an ungated GGUF re-upload, no hfToken → E_GATED, nothing loaded', async () => {
  const fetchFn = fakeFetch(
    (u) => (u.includes('/api/models/meta/Llama-1B?') ? json({ id: 'meta/Llama-1B', sha: 'r', gated: 'manual', siblings: [{ rfilename: 'model.safetensors' }] }) : undefined),
    (u) => (u.includes('/api/models?') ? json([{ id: 'bartowski/meta_Llama-1B-GGUF' }]) : undefined),
    (u) => (u.includes('/api/models/bartowski/meta_Llama-1B-GGUF?') ? json(ggufRepo('bartowski/meta_Llama-1B-GGUF', 'llama', 800)) : undefined));
  await expect(run('meta/Llama-1B', { fetchFn, device: gpuLaptop })).rejects.toMatchObject({ code: 'E_GATED' });
  expect(load).not.toHaveBeenCalled();
});

it('one OPFS sink factory per page, reused across run() calls', async () => {
  const fetchFn = fakeFetch(() => json(ggufRepo('org/m-GGUF', 'llama', 100)));
  const a = await run('org/m-GGUF', { fetchFn, device: gpuLaptop });
  await run('org/m-GGUF', { fetchFn, device: gpuLaptop });
  await expect(a.chat('x')).resolves.toBe('hi');
  expect(opfs).toHaveBeenCalledTimes(1);
  expect(load.mock.calls.map((c) => c[0].sinks)).toEqual([sinks, sinks]);
});

it('an installed extension provider takes the call; the Hub is never fetched', async () => {
  const client = { chat: jest.fn() };
  const provider = { run: jest.fn(async () => client) };
  (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__ = provider;
  const fetchFn = fakeFetch();
  try {
    await expect(run('org/m-GGUF', { fetchFn })).resolves.toBe(client);
  } finally {
    delete (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__;
  }
  expect(provider.run).toHaveBeenCalledWith('org/m-GGUF', { fetchFn });
  expect(fetchFn).not.toHaveBeenCalled();
});

it('a non-LlmRunError load failure moves on to the next candidate; all failing → E_NO_FIT with reasons', async () => {
  load.mockRejectedValue(new Error('wasm boom'));
  const fetchFn = fakeFetch(() => json(ggufRepo('org/m-GGUF', 'llama', 100)));
  await expect(run('org/m-GGUF', { fetchFn, device: gpuLaptop })).rejects.toMatchObject(
    { code: 'E_NO_FIT', reasons: expect.arrayContaining([expect.stringContaining('wasm boom')]) });
});
