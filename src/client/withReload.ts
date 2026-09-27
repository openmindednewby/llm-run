import { ErrorCode, LlmRunError } from '../errors';
import type { RuntimeAdapter } from '../runtimes/types';
import type { ChatMessage, GenerateOptions } from '../types';

const nameOf = (e: unknown): unknown => (typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined);

/**
 * True when a failed generation means the runtime itself died (GPU device lost, wasm crash).
 * An abort (caller's signal or an AbortError) and a library error are the request's own outcome,
 * never a reason to reload (carry #19).
 */
function isRuntimeLoss(e: unknown, signal: AbortSignal | undefined): boolean {
  const aborted = signal?.aborted === true || nameOf(e) === 'AbortError';
  return !aborted && !(e instanceof LlmRunError);
}

/**
 * Wraps a loaded runtime so a lost GPU/runtime is reloaded once. A request that fails before its
 * first token is retried on the reloaded runtime transparently; one that already emitted tokens
 * fails with E_GPU_LOST (a retry would repeat text). Concurrent failures share a single reload.
 */
export function withReload(load: () => Promise<RuntimeAdapter>, first: RuntimeAdapter): RuntimeAdapter {
  let current = first;
  let reloading: Promise<void> | null = null;
  const reload = (failed: RuntimeAdapter): Promise<void> => {
    if (current !== failed) {
      return reloading ?? Promise.resolve();
    }
    reloading ??= (async (): Promise<void> => {
      await failed.unload().catch(() => undefined);
      current = await load();
    })().finally(() => {
      reloading = null;
    });
    return reloading;
  };
  async function* chatStream(messages: ChatMessage[], opts?: GenerateOptions): AsyncGenerator<string, void, undefined> {
    const runtime = current;
    let emitted = false;
    try {
      for await (const piece of runtime.chatStream(messages, opts)) {
        emitted = true;
        yield piece;
      }
      return;
    } catch (e) {
      if (!isRuntimeLoss(e, opts?.signal)) {
        throw e;
      }
      await reload(runtime);
      if (emitted) {
        throw new LlmRunError(ErrorCode.GpuLost, `the GPU failed mid-reply and the model was reloaded: ${String(e)}`);
      }
    }
    yield* current.chatStream(messages, opts);
  }
  return { chatStream, unload: (): Promise<void> => current.unload() };
}
