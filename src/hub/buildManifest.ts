import type { ModelManifest } from '../types';
import type { HubModelInfo } from './fetchModelInfo';
import { groupGguf } from './groupGguf';
import { findWebllmModel } from '../runtimes/findWebllmModel';

/** Turns Hub metadata into the library's runtime-neutral manifest. */
export function buildManifest(info: HubModelInfo, sourceId: string): ModelManifest {
  return {
    id: info.id,
    sourceId,
    revision: info.sha,
    license: info.cardData?.license ?? null,
    gated: info.gated !== false,
    architecture: info.gguf?.architecture ?? null,
    contextLength: info.gguf?.context_length ?? null,
    gguf: groupGguf(info.siblings),
    webllm: findWebllmModel(sourceId),
  };
}
