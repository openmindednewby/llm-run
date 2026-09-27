import type { AssetsPathConfig, ChatCompletionChunk } from '@wllama/wllama/esm/index.js';
import type { RuntimeAdapter } from './types';
import { callbackToIterable } from './callbackToIterable';
import { mapWllamaError } from './wllamaErrors';

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.7;

/** Exact wllama version: package.json peer + dev pin and the CDN URL all derive from this. */
export const WLLAMA_VERSION = '3.6.1';

/**
 * wllama's pinned CDN asset (same value as its `WasmFromCDN`). Inlined because the
 * documented `@wllama/wllama/esm/wasm-from-cdn.js` is not shipped in the 3.6.1 tarball
 * (only its .d.ts), and the bare `@wllama/wllama` specifier has no resolvable entry.
 */
export const WLLAMA_CDN_ASSETS: AssetsPathConfig = {
  default: `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/src/wasm/wllama.wasm`,
};

export interface WllamaLoadRequest {
  files: Blob[];
  contextLength: number;
  /** Same shape as wllama's constructor config; defaults to the pinned CDN (ruling #26). */
  assetPaths?: AssetsPathConfig;
}

/** Internal controller that aborts on the caller's signal and on early consumer exit. */
function linkedAbort(signal: AbortSignal | undefined): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort(signal?.reason);
  };
  if (signal?.aborted === true) {
    onAbort();
  }
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: (): void => {
      signal?.removeEventListener('abort', onAbort);
      controller.abort();
    },
  };
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
        const abort = linkedAbort(opts.signal);
        void wllama
          .createChatCompletion({
            messages,
            stream: true,
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
            abortSignal: abort.signal,
            onData: (chunk: ChatCompletionChunk) => {
              const text = deltaText(chunk);
              if (text !== '') {
                push(text);
              }
            },
          })
          .then(end, (e: unknown) => {
            fail(mapWllamaError(e));
          });
        return abort.dispose;
      }),
    unload: (): Promise<void> => wllama.exit(),
  };
}
