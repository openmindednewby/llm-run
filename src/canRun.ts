import type { CanRunResult, DeviceProfile, RunOptions, RunPlan } from './types';
import type { HubOptions } from './hub/fetchModelInfo';
import { ErrorCode, LlmRunError } from './errors';
import { planFor, resolveContext } from './planning';
import { AUTO, pickAuto } from './auto/pickAuto';

/** Reports whether (and how) a model would run on this device, touching only the Hub API, never the weights. */
export async function canRun(model: string, opts: RunOptions = {}): Promise<CanRunResult> {
  const { device, hub } = await resolveContext(opts);
  const plan = model === AUTO ? await planAuto(device, hub, opts) : (await planFor(model, device, hub, opts)).plan;
  const first = plan.candidates[0];
  return plan.ok && first !== undefined
    ? { ok: true, runtime: first.runtime, quant: first.quant, bytes: first.bytes }
    : { ok: false, reasons: plan.reasons };
}

/** The auto path answers rather than rejects when nothing on the ladder fits: E_NO_FIT becomes its reasons. */
async function planAuto(device: DeviceProfile, hub: HubOptions, opts: RunOptions): Promise<RunPlan> {
  try {
    return (await pickAuto(device, hub, opts)).plan;
  } catch (e) {
    if (e instanceof LlmRunError && e.code === ErrorCode.NoFit) {
      const reasons = e.reasons.length > 0 ? e.reasons : [e.message];
      return { ok: false, candidates: [], reasons, unsupportedArch: null };
    }
    throw e;
  }
}
