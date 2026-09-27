// Shared by canRun, run and pickAuto (kept separate to avoid an import cycle).
import type { DeviceProfile, ModelManifest, RunOptions, RunPlan } from './types';
import { probeDevice } from './device/probeDevice';
import { DEFAULT_HUB_URL, type HubOptions } from './hub/fetchModelInfo';
import { resolveManifest } from './hub/resolveManifest';
import { planRun } from './plan/planRun';

/** The device to plan for (injected or probed) and the Hub client options, from the caller's RunOptions. */
export async function resolveContext(opts: RunOptions): Promise<{ device: DeviceProfile; hub: HubOptions }> {
  const device = opts.device ?? (await probeDevice(opts));
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  return { device, hub: { hubUrl: opts.hubUrl ?? DEFAULT_HUB_URL, hfToken: opts.hfToken, fetchFn } };
}

/** Resolves a model id to its manifest (Hub API only, no weights) and plans it for the device. */
export async function planFor(
  model: string, device: DeviceProfile, hub: HubOptions, opts: RunOptions,
): Promise<{ manifest: ModelManifest; plan: RunPlan }> {
  const manifest = await resolveManifest(model, hub);
  return { manifest, plan: planRun(device, manifest, opts) };
}
