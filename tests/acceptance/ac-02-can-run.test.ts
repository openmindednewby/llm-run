import { canRun } from '../../src';
import { fakeFetch, json } from '../helpers/fakeFetch';
import { gpuLaptop } from '../helpers/devices';
import { ggufRepo } from '../helpers/hubFixtures';

describe('AC-2 canRun(id) returns { ok, runtime, quant, bytes } or { ok:false, reasons[] } without downloading weights', () => {
  it('AC-2 returns ok with runtime, quant and bytes for a model that fits, touching only the Hub API', async () => {
    const fetchFn = fakeFetch((u) => (u.includes('/api/models/org/tiny-GGUF') ? json(ggufRepo('org/tiny-GGUF', 'llama', 100)) : undefined));
    const r = await canRun('org/tiny-GGUF', { fetchFn, device: gpuLaptop });
    expect(r).toEqual({ ok: true, runtime: 'wllama', quant: 'Q4_K_M', bytes: 100 * 1024 ** 2 });
    expect(fetchFn).toHaveBeenCalled();
    expect(fetchFn.mock.calls.every(([u]) => u.includes('/api/'))).toBe(true);
    expect(fetchFn.mock.calls.some(([u]) => u.includes('/resolve/'))).toBe(false); // no /resolve/ = no weights
  });

  it('AC-2 returns ok:false with reasons for a model that does not fit', async () => {
    const fetchFn = fakeFetch(() => json(ggufRepo('org/huge-GGUF', 'llama', 40_000)));
    const r = await canRun('org/huge-GGUF', { fetchFn, device: gpuLaptop });
    expect(r).toMatchObject({ ok: false, reasons: expect.arrayContaining([expect.any(String)]) });
    expect(fetchFn.mock.calls.some(([u]) => u.includes('/resolve/'))).toBe(false);
  });
});
