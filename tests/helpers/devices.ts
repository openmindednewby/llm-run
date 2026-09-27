// DeviceProfile fixtures, typed against src/types so a shape drift fails to compile here.
import type { DeviceProfile, GpuProfile } from '../../src/types';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const laptopGpu: GpuProfile = {
  vendor: 'nvidia', architecture: 'ada', isFallbackAdapter: false,
  maxBufferSize: 4 * GiB, maxStorageBufferBindingSize: 2 * GiB, shaderF16: true,
};

export const gpuLaptop: DeviceProfile = {
  webgpu: laptopGpu,
  memoryGiB: 8, storageFreeBytes: 200 * GiB, crossOriginIsolated: true, memory64: true, userAgent: 'test',
};
export const phone: DeviceProfile = { ...gpuLaptop, memoryGiB: 2, storageFreeBytes: 8 * GiB };
export const noGpu: DeviceProfile = { ...gpuLaptop, webgpu: null };
// Every browser-class ladder entry fits: 64 GiB RAM, 2 TiB storage, 16 GiB GPU buffers.
export const workstation: DeviceProfile = {
  ...gpuLaptop,
  webgpu: { ...laptopGpu, maxBufferSize: 16 * GiB, maxStorageBufferBindingSize: 16 * GiB },
  memoryGiB: 64, storageFreeBytes: 2048 * GiB,
};
// Nothing in any ladder fits: no GPU, a quarter GiB of RAM, 64 MiB of storage.
export const tinyDevice: DeviceProfile = { ...gpuLaptop, webgpu: null, memoryGiB: 0.25, storageFreeBytes: 64 * MiB };
