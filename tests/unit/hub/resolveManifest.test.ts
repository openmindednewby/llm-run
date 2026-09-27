import { resolveManifest } from '../../../src/hub/resolveManifest';
import { fakeFetch, json } from '../../helpers/fakeFetch';
import { ggufRepo } from '../../helpers/hubFixtures';
it('base model without GGUF → finds the GGUF derivative, preferring the same author', async () => {
  const fetchFn = fakeFetch(
    (u) => (u.includes('/api/models/Org/Base-7B?') ? json({ id: 'Org/Base-7B', sha: 'r', gated: false, siblings: [{ rfilename: 'model.safetensors' }] }) : undefined),
    (u) => (u.includes('/api/models?') ? json([{ id: 'someone/Base-7B-GGUF' }, { id: 'Org/Base-7B-GGUF' }]) : undefined),
    (u) => (u.includes('/api/models/Org/Base-7B-GGUF?') ? json(ggufRepo('Org/Base-7B-GGUF', 'qwen3', 4000)) : undefined));
  const m = await resolveManifest('Org/Base-7B', { hubUrl: 'https://hub', fetchFn });
  expect([m.id, m.sourceId, m.gguf.length]).toEqual(['Org/Base-7B-GGUF', 'Org/Base-7B', 1]);
});
const base = (u: string): Response | undefined =>
  (u.includes('/api/models/Org/Base-7B?') ? json({ id: 'Org/Base-7B', sha: 'r', gated: false, siblings: [{ rfilename: 'model.safetensors' }] }) : undefined);
it('search failure → the base manifest (no GGUF), not an error', async () => {
  const m = await resolveManifest('Org/Base-7B', { hubUrl: 'https://hub', fetchFn: fakeFetch(base) });
  expect([m.id, m.gguf.length]).toEqual(['Org/Base-7B', 0]);
});
it('trusted quantizer outranks an unknown author; unrelated names are ignored', async () => {
  const fetchFn = fakeFetch(base,
    (u) => (u.includes('/api/models?') ? json([{ id: 'someone/Base-7B-GGUF' }, { id: 'unsloth/Base-7B-Instruct-GGUF' }, { id: 'bartowski/Base-7B-GGUF' }]) : undefined),
    (u) => (u.includes('/api/models/bartowski/Base-7B-GGUF?') ? json(ggufRepo('bartowski/Base-7B-GGUF', 'qwen3', 4000)) : undefined));
  const m = await resolveManifest('Org/Base-7B', { hubUrl: 'https://hub', fetchFn });
  expect([m.id, m.sourceId]).toEqual(['bartowski/Base-7B-GGUF', 'Org/Base-7B']);
});
const qwenBase = (u: string): Response | undefined =>
  (u.includes('/api/models/Qwen/Qwen3-0.6B?') ? json({ id: 'Qwen/Qwen3-0.6B', sha: 'r', gated: false, siblings: [{ rfilename: 'model.safetensors' }] }) : undefined);
it('accepts the owner-prefixed <owner>_<name>-GGUF naming (bartowski live shape)', async () => {
  const fetchFn = fakeFetch(qwenBase,
    (u) => (u.includes('/api/models?') ? json([{ id: 'someone/Qwen3-0.6B-GGUF' }, { id: 'bartowski/Qwen_Qwen3-0.6B-GGUF' }]) : undefined),
    (u) => (u.includes('/api/models/bartowski/Qwen_Qwen3-0.6B-GGUF?') ? json(ggufRepo('bartowski/Qwen_Qwen3-0.6B-GGUF', 'qwen3', 400)) : undefined));
  const m = await resolveManifest('Qwen/Qwen3-0.6B', { hubUrl: 'https://hub', fetchFn });
  expect([m.id, m.sourceId]).toEqual(['bartowski/Qwen_Qwen3-0.6B-GGUF', 'Qwen/Qwen3-0.6B']);
});
it('sends hfToken on the search request', async () => {
  const fetchFn = fakeFetch(base);
  await resolveManifest('Org/Base-7B', { hubUrl: 'https://hub', hfToken: 'hf_x', fetchFn });
  const search = fetchFn.mock.calls.find((c) => c[0].includes('/api/models?'));
  expect(search?.[1]?.headers).toEqual({ authorization: 'Bearer hf_x' });
});
