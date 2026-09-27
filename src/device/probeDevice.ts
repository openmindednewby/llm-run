import { memory64 } from 'wasm-feature-detect';
import type { DeviceProfile, GpuProfile, RunOptions } from '../types';

type Nav = Navigator & { gpu?: GPU; deviceMemory?: number };

/** Browser-only capability probe: WebGPU adapter, memory, storage quota, isolation, memory64. */
export async function probeDevice(opts: Pick<RunOptions, 'powerPreference'> = {}): Promise<DeviceProfile> {
  const nav = globalThis.navigator as Nav | undefined;
  const [webgpu, storageFreeBytes, hasMemory64] = await Promise.all([
    probeGpu(nav, opts.powerPreference),
    probeStorage(nav),
    memory64().catch(() => false),
  ]);
  return {
    webgpu,
    memoryGiB: nav?.deviceMemory ?? null,
    storageFreeBytes,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    memory64: hasMemory64,
    userAgent: nav?.userAgent ?? '',
  };
}

async function probeGpu(nav: Nav | undefined, powerPreference?: GPUPowerPreference): Promise<GpuProfile | null> {
  const adapter = await nav?.gpu?.requestAdapter({ powerPreference }).catch(() => null);
  if (!adapter) {
    return null;
  }
  const info = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    isFallbackAdapter: info.isFallbackAdapter ?? false,
    maxBufferSize: adapter.limits.maxBufferSize,
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    shaderF16: adapter.features.has('shader-f16'),
  };
}

async function probeStorage(nav: Nav | undefined): Promise<number | null> {
  const est = await nav?.storage?.estimate?.().catch(() => undefined);
  return est?.quota === undefined ? null : est.quota - (est.usage ?? 0);
}
