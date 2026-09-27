import { canRun, run, LlmRunError } from '../../src';
import { fakeFetch, json } from '../helpers/fakeFetch';
import { gpuLaptop } from '../helpers/devices';
import { ggufRepo } from '../helpers/hubFixtures';

describe('AC-9 architecture no runtime supports → E_UNSUPPORTED_ARCH naming the architecture', () => {
  const fetchFn = fakeFetch(() => json(ggufRepo('org/new-GGUF', 'brandnewarch', 100)));

  it('AC-9 run() throws E_UNSUPPORTED_ARCH with the architecture in the message', async () => {
    await expect(run('org/new-GGUF', { fetchFn, device: gpuLaptop })).rejects.toMatchObject(
      { code: 'E_UNSUPPORTED_ARCH', message: expect.stringContaining('brandnewarch') });
  });

  it('AC-9 canRun() reports the architecture as a reason', async () => {
    const r = await canRun('org/new-GGUF', { fetchFn, device: gpuLaptop });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reasons.join(' ')).toContain('brandnewarch');
  });

  it('AC-9 the error is an LlmRunError', async () => {
    await expect(run('org/new-GGUF', { fetchFn, device: gpuLaptop })).rejects.toBeInstanceOf(LlmRunError);
  });
});
