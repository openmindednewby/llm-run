import { canRun, run } from '../../src';
import { fakeFetch, json, sse } from '../helpers/fakeFetch';
import { gpuLaptop, phone } from '../helpers/devices';
import { ggufRepo } from '../helpers/hubFixtures';

describe('AC-8 gated model without hfToken → E_GATED; with a valid token it loads', () => {
  const repo = ggufRepo('org/gated-GGUF', 'llama', 100, { gated: 'manual' });

  it('AC-8 without a token → E_GATED', async () => {
    await expect(run('org/gated-GGUF', { fetchFn: fakeFetch(() => json(repo)), device: gpuLaptop }))
      .rejects.toMatchObject({ code: 'E_GATED' });
  });

  it('AC-8 with a token → the token is sent to the Hub as a Bearer header', async () => {
    const fetchFn = fakeFetch(() => json(repo));
    await canRun('org/gated-GGUF', { fetchFn, device: gpuLaptop, hfToken: 'hf_x' });
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer hf_x');
  });

  it('AC-8 with a token, run() does not throw E_GATED (fallback path, so no runtime is needed in node)', async () => {
    const big = ggufRepo('org/gated-GGUF', 'llama', 40_000, { gated: 'manual' });
    const fetchFn = fakeFetch(
      (u) => (u.includes('/api/models/') ? json(big) : undefined),
      (u) => (u === 'https://my.site/llm/chat/completions' ? sse('ok') : undefined),
    );
    const ai = await run('org/gated-GGUF', { fetchFn, device: phone, hfToken: 'hf_x', fallback: 'https://my.site/llm' });
    await expect(ai.chat('hi')).resolves.toBe('ok');
  });
});
