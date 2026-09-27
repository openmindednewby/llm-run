import type { RunOptions, SinkFactory } from './types';
import { ErrorCode, LlmRunError } from './errors';
import { createClient, type LlmClient } from './client/createClient';
import { withReload } from './client/withReload';
import { detectExtension } from './extension/detectExtension';
import { warnIfNotIsolated } from './env/warnIfNotIsolated';
import { createOpfsSinks } from './store/opfsSinks';
import { loadCandidate } from './runtimes/loadCandidate';
import { planFor, resolveContext } from './planning';
import { pickAuto, AUTO } from './auto/pickAuto';
import { fallbackClient } from './runtimes/fallbackAdapter';

/**
 * ONE OPFS sink factory per page, shared by every run() call: the per-key download queue and the
 * per-key part state live on the factory, so a second factory would race the first (carry T13).
 * Its "cache unavailable" warning reaches the first caller's onWarning only.
 */
let pageSinks: Promise<SinkFactory | null> | undefined;
function sharedSinks(onWarning: RunOptions['onWarning']): Promise<SinkFactory | null> {
  pageSinks ??= createOpfsSinks(onWarning).catch((e: unknown) => {
    pageSinks = undefined;
    throw e;
  });
  return pageSinks;
}

/**
 * Routes a failed candidate load per the spec error table: E_STORAGE → fallback when set (returns
 * true), else thrown; E_GPU_LOST or a non-library error → try the next candidate (returns false);
 * every other LlmRunError is thrown.
 */
function goesToFallback(e: unknown, hasFallback: boolean): boolean {
  if (!(e instanceof LlmRunError) || e.code === ErrorCode.GpuLost) {
    return false;
  }
  if (e.code === ErrorCode.Storage && hasFallback) {
    return true;
  }
  throw e;
}

/**
 * Loads a Hugging Face model (or 'auto') into the best runtime this device can run and returns an
 * OpenAI-shaped client. An installed extension provider serves the call instead when present.
 */
export async function run(model: string, opts: RunOptions = {}): Promise<LlmClient> {
  const provider = detectExtension();
  if (provider) {
    return provider.run(model, opts);
  }
  warnIfNotIsolated();
  const { device, hub } = await resolveContext(opts);
  const { manifest, plan } = model === AUTO ? await pickAuto(device, hub, opts) : await planFor(model, device, hub, opts);
  if (manifest.gated && !opts.hfToken) {
    throw new LlmRunError(ErrorCode.Gated, `"${manifest.id}" is gated: accept its licence on Hugging Face and pass hfToken`);
  }
  if (plan.unsupportedArch) {
    throw new LlmRunError(ErrorCode.UnsupportedArch, `architecture "${plan.unsupportedArch}" has no browser runtime yet`, plan.reasons);
  }
  if (!device.webgpu) {
    opts.onWarning?.('[llm-run] no WebGPU: running on the CPU (slower)');
  }
  const sinks = opts.sinks !== undefined ? opts.sinks : await sharedSinks(opts.onWarning);
  const errors: string[] = [...plan.reasons];
  for (const candidate of plan.candidates) {
    const load = (): ReturnType<typeof loadCandidate> => loadCandidate({ candidate, manifest, hub, opts, sinks });
    try {
      return createClient(withReload(load, await load()), manifest.id);
    } catch (e) {
      if (goesToFallback(e, Boolean(opts.fallback))) {
        break;
      }
      errors.push(`${candidate.runtime}/${String(candidate.quant)}: ${String(e)}`);
    }
  }
  if (opts.fallback) {
    return fallbackClient(opts.fallback, manifest.id, hub.fetchFn);
  }
  throw new LlmRunError(ErrorCode.NoFit, `"${model}" cannot run on this device`, errors);
}
