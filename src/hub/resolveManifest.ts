import type { ModelManifest } from '../types';
import { buildManifest } from './buildManifest';
import { fetchModelInfo, hubHeaders, trimTrailingSlashes, type HubOptions } from './fetchModelInfo';

const TRUSTED_QUANTIZERS = ['ggml-org', 'bartowski', 'unsloth', 'lmstudio-community'];
const SEARCH_LIMIT = 20;
const RANK_SAME_AUTHOR = 0;
const RANK_TRUSTED = 1;
const RANK_OTHER = 2;

/** Resolves any Hub id to a manifest; a base model with no GGUF files resolves to its GGUF derivative. */
export async function resolveManifest(id: string, opts: HubOptions): Promise<ModelManifest> {
  const manifest = buildManifest(await fetchModelInfo(id, opts), id);
  if (manifest.gguf.length > 0 || manifest.webllm) {
    return manifest;
  }
  const derivative = await findGgufDerivative(id, opts);
  return derivative !== null ? { ...buildManifest(await fetchModelInfo(derivative, opts), id), sourceId: id } : manifest;
}

const rankAuthor = (candidate: string, owner: string): number => {
  const author = candidate.split('/')[0] ?? '';
  if (author === owner) {
    return RANK_SAME_AUTHOR;
  }
  return TRUSTED_QUANTIZERS.includes(author) ? RANK_TRUSTED : RANK_OTHER;
};

/** Searches the Hub for `<author>/<name>-GGUF` or `<author>/<owner>_<name>-GGUF`, preferring the same author, then trusted quantizers; null if none or search fails. */
async function findGgufDerivative(id: string, opts: HubOptions): Promise<string | null> {
  const [owner = '', name = ''] = id.split('/');
  const url = `${trimTrailingSlashes(opts.hubUrl)}/api/models?search=${encodeURIComponent(name)}&filter=gguf&sort=downloads&direction=-1&limit=${SEARCH_LIMIT}`;
  const res = await opts.fetchFn(url, { headers: hubHeaders(opts.hfToken) }).catch(() => null);
  if (!res?.ok) {
    return null;
  }
  const found = (await res.json().catch(() => [])) as unknown;
  if (!Array.isArray(found)) {
    return null;
  }
  // Same-name re-uploads (`<author>/<name>-GGUF`) and owner-prefixed ones (bartowski: `<author>/<owner>_<name>-GGUF`).
  const suffixes = [`/${name}-gguf`, `/${owner}_${name}-gguf`].map((s) => s.toLowerCase());
  const ids = (found as { id?: unknown }[])
    .map((m) => m.id)
    .filter((m): m is string => typeof m === 'string' && suffixes.some((s) => m.toLowerCase().endsWith(s)));
  ids.sort((a, b) => rankAuthor(a, owner) - rankAuthor(b, owner));
  return ids[0] ?? null;
}
