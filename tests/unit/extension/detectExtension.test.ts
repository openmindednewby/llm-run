import { detectExtension } from '../../../src/extension/detectExtension';
it('returns null with no provider, the provider when one is installed', () => {
  expect(detectExtension()).toBeNull();
  const provider = { run: jest.fn() };
  (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__ = provider;
  expect(detectExtension()).toBe(provider);
  delete (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__;
});
it('ignores a global that has no run() function', () => {
  (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__ = { run: 'nope' };
  expect(detectExtension()).toBeNull();
  delete (globalThis as Record<string, unknown>).__LLM_RUN_PROVIDER__;
});
