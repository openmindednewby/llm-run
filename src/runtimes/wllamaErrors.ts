import { ErrorCode, LlmRunError } from '../errors';

/**
 * wllama 3.6.1 `WllamaError.type` values that reject ONE request and leave the model loaded
 * ('inference_error' = "Model failed to start inference", e.g. a prompt over n_ctx;
 * 'kv_cache_full' is declared in its types). Anything else (WllamaRuntimeError = wasm OOM /
 * stack overflow, 'model_not_loaded' after a crash) is left as-is so withReload reloads.
 */
const REQUEST_ERROR_TYPES: ReadonlySet<string> = new Set(['inference_error', 'kv_cache_full']);

/** Maps a wllama request error to LlmRunError(E_INFERENCE); returns any other error unchanged. */
export function mapWllamaError(e: unknown): unknown {
  const type = typeof e === 'object' && e !== null ? (e as { type?: unknown }).type : undefined;
  if (typeof type === 'string' && REQUEST_ERROR_TYPES.has(type)) {
    return new LlmRunError(ErrorCode.Inference, `the runtime rejected this request (${type}); the model is still loaded: ${String(e)}`);
  }
  return e;
}
