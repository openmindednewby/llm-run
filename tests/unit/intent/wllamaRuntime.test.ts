import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWllamaRuntime, WLLAMA_MODULE_URL, WLLAMA_WASM_URL } from '../../../src/intent/wllamaRuntime';

const fakeModule = (embedding: number[] | string) => {
  const instances: { config: unknown; url?: string; options?: Record<string, unknown>; exited: boolean }[] = [];
  class Wllama {
    private readonly record: (typeof instances)[number];
    constructor(config: unknown) {
      this.record = { config, exited: false };
      instances.push(this.record);
    }
    loadModelFromUrl(url: string, options: Record<string, unknown>): Promise<void> {
      this.record.url = url;
      this.record.options = options;
      (options.progressCallback as (p: { loaded: number; total: number }) => void)({ loaded: 1, total: 2 });
      return Promise.resolve();
    }
    createEmbedding(): Promise<{ data: { embedding: number[] | string }[] }> {
      return Promise.resolve({ data: [{ embedding }] });
    }
    exit(): Promise<void> {
      this.record.exited = true;
      return Promise.resolve();
    }
  }
  return { module: { Wllama }, instances };
};

describe('loadWllamaRuntime', () => {
  it('with defaults, imports the pinned module url and loads the model for embeddings', async () => {
    const { module, instances } = fakeModule([1]);
    const importModule = jest.fn((_url: string) => Promise.resolve(module));

    await loadWllamaRuntime({ model: 'https://x/m.gguf', onProgress: () => undefined }, { importModule });

    expect(importModule).toHaveBeenCalledWith(WLLAMA_MODULE_URL);
    expect(instances[0].config).toEqual({ default: WLLAMA_WASM_URL });
    expect([instances[0].url, instances[0].options?.embeddings]).toEqual(['https://x/m.gguf', true]);
  });

  it('with a download running, forwards its progress', async () => {
    const { module } = fakeModule([1]);
    const seen: unknown[] = [];

    await loadWllamaRuntime({ model: 'm', onProgress: (p) => seen.push(p) }, { importModule: () => Promise.resolve(module) });

    expect(seen).toEqual([{ loaded: 1, total: 2 }]);
  });

  it('with a loaded model, embed returns the vector and dispose exits', async () => {
    const { module, instances } = fakeModule([0.1, 0.2]);
    const rt = await loadWllamaRuntime({ model: 'm', onProgress: () => undefined }, { importModule: () => Promise.resolve(module) });

    const vector = await rt.embed('hello');
    await rt.dispose?.();

    expect([vector, instances[0].exited]).toEqual([[0.1, 0.2], true]);
  });

  it('with the url pin, stays equal to the peer dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { peerDependencies: Record<string, string> };

    const pinned = pkg.peerDependencies['@wllama/wllama'];

    expect(WLLAMA_MODULE_URL).toContain(`@wllama/wllama@${pinned}/`);
  });

  it('with a base64 string embedding, rejects instead of returning a string as a vector', async () => {
    const { module } = fakeModule('AAAA');
    const runtime = await loadWllamaRuntime({ model: 'm', onProgress: () => undefined }, { importModule: () => Promise.resolve(module) });

    const embedding = runtime.embed('q');

    await expect(embedding).rejects.toThrow('no embedding');
  });
});
