import type { Candidate, DeviceProfile, GgufVariant, ModelManifest, RunOptions, RunPlan } from '../types';
import {
  DEFAULT_MEMORY_GIB, GiB, OVERHEAD_FACTOR, QUANT_PREFERENCE, USABLE_MEMORY_SHARE,
  WASM32_MAX_BYTES, WLLAMA_MAX_FILE_BYTES,
} from './constants';
import { LLAMA_CPP_ARCHITECTURES } from './llamaCppArchitectures';

type PlanOptions = Pick<RunOptions, 'maxModelBytes'>;

const gb = (n: number): string => `${(n / GiB).toFixed(1)} GB`;

/** Decides, without downloading weights, which runtime + quant of a model this device can run, and why not when none. */
export function planRun(device: DeviceProfile, m: ModelManifest, opts: PlanOptions): RunPlan {
  const reasons: string[] = [];
  const budget = memoryBudget(device, opts, reasons);
  const candidates: Candidate[] = [];
  planWebllm(device, m, budget, { candidates, reasons });
  const archOk = m.architecture === null || LLAMA_CPP_ARCHITECTURES.has(m.architecture);
  if (archOk) {
    planGguf(device, m, budget, { candidates, reasons });
  } else {
    reasons.push(`architecture "${String(m.architecture)}" is not supported by llama.cpp/wllama yet`);
  }
  if (m.gguf.length === 0 && m.webllm === null) {
    reasons.push(`"${m.sourceId}" has no GGUF or WebLLM build on the Hub`);
  }
  const unsupportedArch = !archOk && candidates.length === 0 ? m.architecture : null;
  return { ok: candidates.length > 0, candidates, reasons, unsupportedArch };
}

type PlanOut = { candidates: Candidate[]; reasons: string[] };

/** Adds the WebLLM candidate when the build exists, a real GPU is present and it fits; a reason when it does not fit. */
function planWebllm(device: DeviceProfile, m: ModelManifest, budget: number, out: PlanOut): void {
  const gpuUsable = device.webgpu !== null && !device.webgpu.isFallbackAdapter;
  if (m.webllm === null || !gpuUsable) {
    return;
  }
  if (m.webllm.vramBytes > budget) {
    out.reasons.push(`WebLLM build needs ${gb(m.webllm.vramBytes)}, budget is ${gb(budget)}`);
    return;
  }
  out.candidates.push({ runtime: 'webllm', quant: 'q4f16_1', bytes: m.webllm.vramBytes, files: [], webllmModelId: m.webllm.modelId });
}

function planGguf(device: DeviceProfile, m: ModelManifest, budget: number, out: PlanOut): void {
  for (const v of orderByPreference(m.gguf)) {
    const why = rejectGguf(v, device, budget);
    if (why === null) {
      out.candidates.push({ runtime: 'wllama', quant: v.quant, bytes: v.totalBytes, files: v.files, webllmModelId: null });
    } else {
      out.reasons.push(`${v.quant}: ${why}`);
    }
  }
}

function memoryBudget(device: DeviceProfile, opts: PlanOptions, reasons: string[]): number {
  if (opts.maxModelBytes !== undefined) {
    return opts.maxModelBytes;
  }
  if (device.memoryGiB === null) {
    reasons.push(`device memory unknown in this browser; assumed ${DEFAULT_MEMORY_GIB} GB (set maxModelBytes to override)`);
  }
  return (device.memoryGiB ?? DEFAULT_MEMORY_GIB) * GiB * USABLE_MEMORY_SHARE;
}

function rejectGguf(v: GgufVariant, device: DeviceProfile, budget: number): string | null {
  const needed = v.totalBytes * OVERHEAD_FACTOR;
  const oversizeFile = v.files.some((f) => f.size > WLLAMA_MAX_FILE_BYTES);
  const wasmCapped = device.webgpu === null && !device.memory64 && needed > WASM32_MAX_BYTES;
  const noStorage = device.storageFreeBytes !== null && v.totalBytes > device.storageFreeBytes;
  if (oversizeFile) {
    return 'needs a split GGUF (a file is over 2 GB, the wllama per-file limit)';
  }
  if (needed > budget) {
    return `needs ${gb(needed)}, memory budget is ${gb(budget)}`;
  }
  if (wasmCapped) {
    return `needs ${gb(needed)}, CPU mode in this browser is capped at 4 GB (no wasm Memory64)`;
  }
  if (noStorage) {
    return `needs ${gb(v.totalBytes)} of storage, ${gb(device.storageFreeBytes ?? 0)} free`;
  }
  return null;
}

function orderByPreference(variants: GgufVariant[]): GgufVariant[] {
  const order: readonly string[] = QUANT_PREFERENCE;
  const rank = (q: string): number => {
    const i = order.indexOf(q);
    return i === -1 ? order.length : i;
  };
  return variants.filter((v) => rank(v.quant) < order.length).sort((a, b) => rank(a.quant) - rank(b.quant));
}
