import { loadWllamaRuntime, type WllamaOverrides } from '../../../src/intent';

describe('WllamaOverrides.importModule', () => {
  it('with the README bundled recipe, typechecks against the real @wllama/wllama module without a cast', () => {
    const overrides: WllamaOverrides = { importModule: () => import('@wllama/wllama/esm/index.js') };

    const load = (): ReturnType<typeof loadWllamaRuntime> => loadWllamaRuntime({ model: 'm', onProgress: () => undefined }, overrides);

    expect(typeof load).toBe('function');
  });
});
