import type { AssetsPathConfig, ChatCompletionChunk } from '@wllama/wllama/esm/index.js';
import type { RuntimeAdapter } from './types';
import { callbackToIterable } from './callbackToIterable';

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * wllama 3.6.1's pinned CDN asset (same value as its `WasmFromCDN`). Inlined because the
 * documented `@wllama/wllama/esm/wasm-from-cdn.js` is not shipped in the 3.6.1 tarball
 * (only its .d.ts), and the bare `@wllama/wllama` specifier has no resolvable entry.
 */
export const WLLAMA_CDN_ASSETS: AssetsPathConfig = {
  default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/src/wasm/wllama.wasm',
};

export interface WllamaLoadRequest {
  files: Blob[];
  contextLength: number;
  /** Same shape as wllama's constructor config; defaults to the pinned CDN (ruling #26). */
  assetPaths?: AssetsPathConfig;
}

function deltaText(chunk: ChatCompletionChunk): string {
  return chunk.choices[0]?.delta.content ?? '';
}

/** Lazily imports wllama, loads the GGUF blobs and returns a streaming adapter. */
export async function loadWllama(req: WllamaLoadRequest): Promise<RuntimeAdapter> {
  const { Wllama } = await import('@wllama/wllama/esm/index.js');
  const wllama = new Wllama(req.assetPaths ?? WLLAMA_CDN_ASSETS);
  await wllama.loadModel(req.files, { n_ctx: req.contextLength });
  return {
    chatStream: (messages, opts = {}): AsyncIterable<string> =>
      callbackToIterable<string>((push, end, fail) => {
        void wllama
          .createChatCompletion({
            messages,
            stream: true,
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
            abortSignal: opts.signal,
            onData: (chunk: ChatCompletionChunk) => {
              const text = deltaText(chunk);
              if (text !== '') {
                push(text);
              }
            },
          })
          .then(end, fail);
      }),
    unload: (): Promise<void> => wllama.exit(),
  };
}
