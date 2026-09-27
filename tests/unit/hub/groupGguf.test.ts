import { groupGguf } from '../../../src/hub/groupGguf';
const f = (rfilename: string, size = 10) => ({ rfilename, size, lfs: { sha256: 'd'.repeat(64), size } });
it('groups split shards by quant and ignores non-gguf files', () => {
  const v = groupGguf([f('M-Q4_K_M-00001-of-00002.gguf'), f('M-Q4_K_M-00002-of-00002.gguf'), f('M-Q8_0.gguf'), f('README.md')]);
  expect(v.map((x) => [x.quant, x.files.length, x.totalBytes])).toEqual([['Q4_K_M', 2, 20], ['Q8_0', 1, 10]]);
});
it('orders shard files by index', () => {
  const v = groupGguf([f('M-Q4_0-00002-of-00002.gguf'), f('M-Q4_0-00001-of-00002.gguf')]);
  expect(v[0]?.files.map((x) => x.path)).toEqual(['M-Q4_0-00001-of-00002.gguf', 'M-Q4_0-00002-of-00002.gguf']);
});
