import { planRun } from '../../../src/plan/planRun';
import { gpuLaptop, noGpu } from '../../helpers/devices';
const GiB = 1024 ** 3;
const manifest = (files: number[], arch = 'llama') => ({ id: 'o/m', sourceId: 'o/m', revision: 'r', license: 'mit', gated: false,
  architecture: arch, contextLength: 4096, webllm: null,
  gguf: [{ quant: 'Q4_K_M', files: files.map((size, i) => ({ path: `f${i}`, size, sha256: null })), totalBytes: files.reduce((a, b) => a + b, 0) }] });
it('rejects a single file over 2 GB with the split-GGUF reason (Review Focus 2)', () => {
  const p = planRun(gpuLaptop, manifest([3 * GiB]), {});
  expect(p.ok).toBe(false);
  expect(p.reasons.join(' ')).toMatch(/split GGUF/);
});
it('accepts the same size split into 2 files', () => {
  expect(planRun(gpuLaptop, manifest([1.5 * GiB, 1.5 * GiB]), {}).ok).toBe(true);
});
it('no deviceMemory → assumed 4 GB budget, said in the reason; maxModelBytes overrides (Review Focus 3)', () => {
  const firefox = { ...gpuLaptop, memoryGiB: null };
  const p = planRun(firefox, manifest([1.9 * GiB, 1.9 * GiB]), {});
  expect(p.ok).toBe(false);
  expect(p.reasons.join(' ')).toMatch(/assumed/);
  expect(planRun(firefox, manifest([1.9 * GiB, 1.9 * GiB]), { maxModelBytes: 16 * GiB }).ok).toBe(true);
});
it('no WebGPU → still plans wllama on CPU (AC-10 logic)', () => {
  expect(planRun(noGpu, manifest([1 * GiB]), {}).candidates[0]?.runtime).toBe('wllama');
});
it('no Memory64 on CPU → 4 GB wasm cap', () => {
  const safariCpu = { ...noGpu, memory64: false, memoryGiB: 16 };
  expect(planRun(safariCpu, manifest([1.9 * GiB, 1.9 * GiB, 1.9 * GiB]), {}).reasons.join(' ')).toMatch(/4 GB/);
});
it('storage too small → reason names GB needed vs free', () => {
  const full = { ...gpuLaptop, storageFreeBytes: 0.5 * GiB };
  expect(planRun(full, manifest([1 * GiB]), {}).reasons.join(' ')).toMatch(/storage/);
});
it('names every quant outside the preference list as a reason (no silent refusal)', () => {
  const m = { ...manifest([1 * GiB]), gguf: ['Q3_K_M', 'F16'].map((quant) => ({ quant, files: [{ path: `${quant}.gguf`, size: GiB, sha256: null }], totalBytes: GiB })) };
  const p = planRun(gpuLaptop, m, {});
  expect(p.ok).toBe(false);
  expect(p.reasons.join(' ')).toMatch(/Q3_K_M/);
  expect(p.reasons.join(' ')).toMatch(/F16/);
});
