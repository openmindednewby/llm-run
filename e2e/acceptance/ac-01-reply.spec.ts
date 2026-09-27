import { test, expect } from '@playwright/test';

const MODEL = process.env.FIXTURE_MODEL ?? 'bartowski/SmolLM2-135M-Instruct-GGUF';

test('AC-1 run(id) + chat() returns a reply', async ({ page }) => {
  await page.goto('/');
  const reply = await page.evaluate(async (m) => {
    const ai = await (window as any).llmRun.run(m);
    return ai.chat('Say hello.');
  }, MODEL);
  expect(reply.trim().length).toBeGreaterThan(0);
});
