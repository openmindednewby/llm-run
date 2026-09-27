import { test, expect } from '@playwright/test';

const MODEL = process.env.FIXTURE_MODEL ?? 'bartowski/SmolLM2-135M-Instruct-GGUF';

test.use({ launchOptions: { args: ['--disable-webgpu'] } });

test('AC-10 no WebGPU → CPU replies and a warning fires', async ({ page }, info) => {
  test.skip(info.project.name === 'firefox', 'flag is Chromium-only; Firefox on Linux CI has no WebGPU anyway');
  await page.goto('/');
  const out = await page.evaluate(async (m) => {
    const ai = await (window as any).llmRun.run(m);
    return { reply: await ai.chat('Hi'), warnings: (window as any).lastWarnings };
  }, MODEL);
  expect(out.reply.length).toBeGreaterThan(0);
  expect(out.warnings.join(' ')).toContain('no WebGPU');
});
