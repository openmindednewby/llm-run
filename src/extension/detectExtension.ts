import type { RunOptions } from '../types';
import type { LlmClient } from '../client/createClient';

/** What a browser extension installs at `globalThis.__LLM_RUN_PROVIDER__` to serve run() itself. */
export interface LlmRunProvider {
  run(model: string, opts: RunOptions): Promise<LlmClient>;
}

/** The installed extension provider, or null when none is present (or the global is not one). */
export function detectExtension(): LlmRunProvider | null {
  const p = (globalThis as { __LLM_RUN_PROVIDER__?: Partial<LlmRunProvider> }).__LLM_RUN_PROVIDER__;
  return p && typeof p.run === 'function' ? (p as LlmRunProvider) : null;
}
