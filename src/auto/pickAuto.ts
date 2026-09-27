import type { DeviceProfile, ModelManifest, RunOptions, RunPlan } from '../types';
import type { HubOptions } from '../hub/fetchModelInfo';
import { ErrorCode, LlmRunError } from '../errors';

/** The model id that asks the library to pick the largest ladder entry the device can run. */
export const AUTO = 'auto';

/** Placeholder until the auto ladder lands (BLLM-1 plan-1 Task 17): always reports no fit. */
export function pickAuto(
  _device: DeviceProfile, _hub: HubOptions, _opts: RunOptions,
): Promise<{ manifest: ModelManifest; plan: RunPlan }> {
  return Promise.reject(new LlmRunError(ErrorCode.NoFit, 'auto ladder not built yet'));
}
