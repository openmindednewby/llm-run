import { run } from '../../src';
import { fakeFetch, json, sse } from '../helpers/fakeFetch';
import { phone, tinyDevice } from '../helpers/devices';
import { ggufRepo } from '../helpers/hubFixtures';

const FALLBACK = 'https://my.site/llm';
const fallbackRoute = (u: string): Response | undefined => (u === `${FALLBACK}/chat/completions` ? sse('from ', 'server') : undefined);

describe('AC-4 nothing fits + fallback set → replies come from the fallback URL; no fallback → E_NO_FIT with reasons', () => {
  const hub = (u: string): Response | undefined => (u.includes('/api/models/') ? json(ggufRepo('org/huge-GGUF', 'llama', 40_000)) : undefined);

  it('AC-4 with fallback → replies come from the fallback URL', async () => {
    const fetchFn = fakeFetch(hub, fallbackRoute);
    const ai = await run('org/huge-GGUF', { fetchFn, device: phone, fallback: FALLBACK });
    await expect(ai.chat('hi')).resolves.toBe('from server');
    expect(fetchFn.mock.calls.some(([u]) => u === `${FALLBACK}/chat/completions`)).toBe(true);
  });

  it('AC-4 without fallback → E_NO_FIT with reasons', async () => {
    await expect(run('org/huge-GGUF', { fetchFn: fakeFetch(hub), device: phone }))
      .rejects.toMatchObject({ code: 'E_NO_FIT', reasons: expect.arrayContaining([expect.any(String)]) });
  });

  it('AC-4 run("auto") with nothing in the ladder fitting + fallback → replies come from the fallback URL', async () => {
    const ai = await run('auto', { fetchFn: fakeFetch(fallbackRoute), device: tinyDevice, fallback: FALLBACK });
    await expect(ai.chat('hi')).resolves.toBe('from server');
  });
});
