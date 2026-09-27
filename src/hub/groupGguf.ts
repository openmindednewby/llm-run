import type { GgufVariant } from '../types';
import type { HubSibling } from './fetchModelInfo';

const QUANT_RE = /[-_.](I?Q\d(?:_[A-Z0-9]+)*|F16|BF16|F32)(?:-\d{5}-of-\d{5})?\.gguf$/i;
const SHARD_RE = /-(\d{5})-of-\d{5}\.gguf$/i;

const shardIndex = (path: string): number => Number(SHARD_RE.exec(path)?.[1] ?? 0);

/** Groups a repo's GGUF files by quantisation; split shards of one quant land in one variant, ordered by index. */
export function groupGguf(siblings: HubSibling[]): GgufVariant[] {
  const byQuant = new Map<string, GgufVariant>();
  for (const s of siblings) {
    const quant = QUANT_RE.exec(s.rfilename)?.[1]?.toUpperCase();
    if (quant === undefined) {
      continue;
    }
    const size = s.lfs?.size ?? s.size ?? 0;
    const v = byQuant.get(quant) ?? { quant, files: [], totalBytes: 0 };
    v.files.push({ path: s.rfilename, size, sha256: s.lfs?.sha256 ?? null });
    v.totalBytes += size;
    byQuant.set(quant, v);
  }
  for (const v of byQuant.values()) {
    v.files.sort((a, b) => shardIndex(a.path) - shardIndex(b.path));
  }
  return [...byQuant.values()];
}
