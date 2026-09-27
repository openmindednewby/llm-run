import { canRun, run } from '../../src';
import { LADDER } from '../../src/auto/ladder';
import { fakeFetch, json } from '../helpers/fakeFetch';
import { gpuLaptop, phone, tinyDevice } from '../helpers/devices';

// Node cannot load a runtime, so "picks the largest that fits" is asserted through canRun('auto')
// (same planner); run('auto') loading a model in a real browser is covered by the Task 14 harness.
const MiB = 1024 ** 2;
const hub = fakeFetch((u) => {
  const entry = LADDER.find((e) => u.includes(`/api/models/${e.id}`));
  return entry ? json({ id: entry.id, sha: 'r', gated: false, cardData: { license: entry.license },
    gguf: { architecture: 'qwen3' }, siblings: [{ rfilename: 'm-Q4_K_M.gguf', size: entry.approxMiB * MiB,
      lfs: { sha256: 'c'.repeat(64), size: entry.approxMiB * MiB } }] }) : undefined;
});

const bytesOf = (r: Awaited<ReturnType<typeof canRun>>): number => {
  if (!r.ok) {
    throw new Error(`expected ok, got reasons: ${r.reasons.join('; ')}`);
  }
  return r.bytes;
};

describe('AC-3 run("auto") picks the largest permissive ladder model that fits the device; only permissive licences (D15)', () => {
  it('AC-3 every ladder entry is Apache-2.0 or MIT and not gated', () => {
    expect(LADDER.length).toBeGreaterThan(0);
    for (const e of LADDER) {
      expect(['apache-2.0', 'mit']).toContain(e.license);
      expect(e.gated).toBe(false);
    }
  });

  it('AC-3 canRun("auto") picks a bigger ladder model for a GPU laptop than for a phone', async () => {
    const big = bytesOf(await canRun('auto', { fetchFn: hub, device: gpuLaptop }));
    const small = bytesOf(await canRun('auto', { fetchFn: hub, device: phone }));
    expect(big).toBeGreaterThan(small);
  });

  it('AC-3 canRun("auto") answers with a model from the ladder', async () => {
    const bytes = bytesOf(await canRun('auto', { fetchFn: hub, device: phone }));
    expect(LADDER.map((e) => e.approxMiB * MiB)).toContain(bytes);
  });

  it('AC-3 run("auto") with no ladder model fitting and no fallback throws E_NO_FIT with reasons', async () => {
    await expect(run('auto', { fetchFn: hub, device: tinyDevice }))
      .rejects.toMatchObject({ code: 'E_NO_FIT', reasons: expect.arrayContaining([expect.any(String)]) });
  });
});
