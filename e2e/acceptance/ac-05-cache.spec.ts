import { test, expect } from '@playwright/test';

const MODEL = process.env.FIXTURE_MODEL ?? 'bartowski/SmolLM2-135M-Instruct-GGUF';

test('AC-5 second run() of the same model downloads 0 weight bytes', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(async (m) => { await (await (window as any).llmRun.run(m)).unload(); }, MODEL);
  const before = await (await request.get('/__stats')).json();
  await page.reload();
  await page.evaluate(async (m) => { await (await (window as any).llmRun.run(m)).unload(); }, MODEL);
  const after = await (await request.get('/__stats')).json();
  const weightBytes = (s: Record<string, { bytesSent: number }>) =>
    Object.entries(s).filter(([p]) => p.includes('/resolve/')).reduce((n, [, v]) => n + v.bytesSent, 0);
  expect(weightBytes(after) - weightBytes(before)).toBe(0);
});
