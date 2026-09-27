import { ErrorCode, LlmRunError } from '../errors';
import type { LlmClient } from '../client/createClient';

/** Placeholder until the server fallback lands (BLLM-1 plan-1 Task 17). */
export function fallbackClient(_url: string, _model: string, _fetchFn: typeof fetch): Promise<LlmClient> {
  return Promise.reject(new LlmRunError(ErrorCode.NoFit, 'fallback not built yet'));
}
