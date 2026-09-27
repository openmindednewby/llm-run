import { test, expect } from '@playwright/test';

const MODEL = process.env.FIXTURE_MODEL ?? 'bartowski/SmolLM2-135M-Instruct-GGUF';

test('AC-6 a cut download resumes without re-fetching stored bytes', async ({ page, request }) => {
  // Stats are global to the fixture server; earlier tests downloaded the same file (ruling #16).
  await request.post('/__reset');
  const info = await (await request.get(`/api/models/${MODEL}?blobs=true`)).json();
  const file = info.siblings[0];
  const cutAt = Math.floor(file.size / 2);
  await request.post(`/__cut?path=${encodeURIComponent(file.rfilename)}&bytes=${cutAt}`);
  await page.goto('/');
  await page.evaluate(async (m) => { await (await (window as any).llmRun.run(m)).unload(); }, MODEL);
  const stats = await (await request.get('/__stats')).json();
  const sent = Object.entries(stats).find(([p]) => p.endsWith(file.rfilename))?.[1] as { requests: number; bytesSent: number };
  expect(sent.requests).toBeGreaterThan(1); // the cut happened and a second request resumed it
  expect(sent.bytesSent).toBeLessThan(file.size * 1.05); // ≈ one full file, not 1.5 files
});
