import models from './webllmModels.json';
import { MiB } from '../plan/constants';

interface Entry {
  model_id: string;
  model: string;
  vram_required_MB?: number;
}

/** Matches "mlc-ai/Qwen3-4B-q4f16_1-MLC" exactly, or a base id "Qwen/Qwen3-4B" to its q4f16_1 build. */
export function findWebllmModel(id: string): { modelId: string; vramBytes: number } | null {
  const name = id.split('/')[1]?.toLowerCase() ?? '';
  const list = models as Entry[];
  const hit =
    list.find((m) => m.model.toLowerCase().endsWith(`/${name}`)) ??
    list.find((m) => m.model_id.toLowerCase() === `${name}-q4f16_1-mlc`);
  return hit ? { modelId: hit.model_id, vramBytes: (hit.vram_required_MB ?? 0) * MiB } : null;
}
