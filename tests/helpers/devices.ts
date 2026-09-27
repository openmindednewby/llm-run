// DeviceProfile fixtures (shape of src/types DeviceProfile). Left structurally typed, not
// imported, so helpers type-check before src/types.ts exists; the compiler checks the shape
// where a test passes one as RunOptions.device.
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

export const gpuLaptop = {
  webgpu: {
    vendor: 'nvidia', architecture: 'ada', isFallbackAdapter: false,
    maxBufferSize: 4 * GiB, maxStorageBufferBindingSize: 2 * GiB, shaderF16: true,
  },
  memoryGiB: 8, storageFreeBytes: 200 * GiB, crossOriginIsolated: true, memory64: true, userAgent: 'test',
};
export const phone = { ...gpuLaptop, memoryGiB: 2, storageFreeBytes: 8 * GiB };
export const noGpu = { ...gpuLaptop, webgpu: null };
// Every browser-class ladder entry fits: 64 GiB RAM, 2 TiB storage, 16 GiB GPU buffers.
export const workstation = {
  ...gpuLaptop,
  webgpu: { ...gpuLaptop.webgpu, maxBufferSize: 16 * GiB, maxStorageBufferBindingSize: 16 * GiB },
  memoryGiB: 64, storageFreeBytes: 2048 * GiB,
};
// Nothing in any ladder fits: no GPU, a quarter GiB of RAM, 64 MiB of storage.
export const tinyDevice = { ...gpuLaptop, webgpu: null, memoryGiB: 0.25, storageFreeBytes: 64 * MiB };
