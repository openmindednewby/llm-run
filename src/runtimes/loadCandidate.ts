import { Runtime, type Candidate, type ModelManifest, type RunOptions, type SinkFactory } from '../types';
import { ensureFile } from '../store/download';
import { hubHeaders, trimTrailingSlashes, type HubOptions } from '../hub/fetchModelInfo';
import { DEFAULT_CONTEXT_LENGTH } from '../plan/constants';
import type { RuntimeAdapter } from './types';

export interface LoadRequest {
  candidate: Candidate;
  manifest: ModelManifest;
  hub: HubOptions;
  opts: RunOptions;
  sinks: SinkFactory | null;
}

/**
 * Downloads (or reads from cache) a candidate's files and loads them into its runtime.
 * The runtime module is a dynamic import, so its engine is fetched only when a model loads.
 * Shards download in parallel; switch to one at a time if the browser run shows memory pressure.
 */
export async function loadCandidate(req: LoadRequest): Promise<RuntimeAdapter> {
  const { candidate: c, manifest: m, hub, opts } = req;
  if (c.runtime === Runtime.WebLlm) {
    // Plain Error, not LlmRunError: run() moves on to the next candidate (wllama).
    throw new Error('the WebLLM runtime is not built yet (BLLM-1 plan-1 Task 16)');
  }
  const base = trimTrailingSlashes(hub.hubUrl);
  const files = await Promise.all(c.files.map((file) => ensureFile({
    file,
    sinks: req.sinks,
    fetchFn: hub.fetchFn,
    url: `${base}/${m.id}/resolve/${m.revision}/${file.path}`,
    headers: hubHeaders(hub.hfToken),
    onProgress: opts.onProgress,
  })));
  const contextLength = Math.min(opts.contextLength ?? DEFAULT_CONTEXT_LENGTH, m.contextLength ?? DEFAULT_CONTEXT_LENGTH);
  const { loadWllama } = await import('./wllamaAdapter');
  return loadWllama({ files, contextLength, assetPaths: opts.wllamaAssetPaths });
}
