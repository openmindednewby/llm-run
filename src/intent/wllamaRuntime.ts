import type { EmbeddingRuntime, RuntimeRequest } from './types';

const WLLAMA_VERSION = '3.6.1';
const WLLAMA_CDN = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}`;
const CONTEXT_TOKENS = 512;
const MAX_THREADS = 4;

export const WLLAMA_MODULE_URL = `${WLLAMA_CDN}/esm/index.js`;
export const WLLAMA_WASM_URL = `${WLLAMA_CDN}/src/wasm/wllama.wasm`;
export const DEFAULT_EMBEDDING_MODEL_URL = 'https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf';

interface EmbeddingResponse {
  data: { embedding: number[] | string }[];
}

interface WllamaLike {
  loadModelFromUrl(url: string, options: Record<string, unknown>): Promise<void>;
  createEmbedding(params: { input: string }): Promise<EmbeddingResponse>;
  exit(): Promise<void>;
}

export interface WllamaModule {
  Wllama: new (config: { default: string }) => WllamaLike;
}

export interface WllamaOverrides {
  importModule?: (url: string) => Promise<WllamaModule>;
  moduleUrl?: string;
  wasmUrl?: string;
}

const importFromUrl = (url: string): Promise<WllamaModule> => import(url) as Promise<WllamaModule>;

const threadCount = (): number => (typeof navigator === 'undefined' ? MAX_THREADS : Math.min(MAX_THREADS, navigator.hardwareConcurrency || MAX_THREADS));

const firstEmbedding = (response: EmbeddingResponse): number[] => {
  const embedding = response.data[0]?.embedding;
  if (embedding === undefined || typeof embedding === 'string') {
    throw new Error('the runtime returned no embedding');
  }
  return embedding;
};

/** Load an embedding GGUF into wllama, imported from jsDelivr by URL. A bundled app passes `importModule` to use its own copy. */
export async function loadWllamaRuntime(request: RuntimeRequest, overrides: WllamaOverrides = {}): Promise<EmbeddingRuntime> {
  const { Wllama } = await (overrides.importModule ?? importFromUrl)(overrides.moduleUrl ?? WLLAMA_MODULE_URL);
  const wllama = new Wllama({ default: overrides.wasmUrl ?? WLLAMA_WASM_URL });
  await wllama.loadModelFromUrl(request.model, {
    embeddings: true,
    pooling_type: 'LLAMA_POOLING_TYPE_MEAN',
    n_ctx: CONTEXT_TOKENS,
    n_gpu_layers: 0,
    n_threads: threadCount(),
    progressCallback: (progress: { loaded: number; total: number }) => request.onProgress({ loaded: progress.loaded, total: progress.total }),
  });
  return {
    embed: async (text) => firstEmbedding(await wllama.createEmbedding({ input: text })),
    dispose: () => wllama.exit(),
  };
}
