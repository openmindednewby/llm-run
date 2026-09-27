import { ErrorCode, LlmRunError } from '../errors';

export const DEFAULT_HUB_URL = 'https://huggingface.co';
const HTTP_NOT_FOUND = 404;

export interface HubSibling {
  rfilename: string;
  size?: number;
  lfs?: { sha256: string; size: number };
}

export interface HubModelInfo {
  id: string;
  sha: string;
  gated: false | 'auto' | 'manual';
  cardData?: { license?: string };
  gguf?: { architecture?: string; context_length?: number };
  siblings: HubSibling[];
}

export interface HubOptions {
  hubUrl: string;
  hfToken?: string;
  fetchFn: typeof fetch;
}

export const hubHeaders = (hfToken?: string): HeadersInit =>
  hfToken !== undefined && hfToken !== '' ? { authorization: `Bearer ${hfToken}` } : {};

/** Reads a model's metadata (with blob sizes) from the Hub; a 404 is E_MODEL_NOT_FOUND, anything else failing is E_NETWORK. */
export async function fetchModelInfo(id: string, opts: HubOptions): Promise<HubModelInfo> {
  let res: Response;
  try {
    res = await opts.fetchFn(`${opts.hubUrl}/api/models/${id}?blobs=true`, { headers: hubHeaders(opts.hfToken) });
  } catch (e) {
    throw new LlmRunError(ErrorCode.Network, `cannot reach ${opts.hubUrl}: ${String(e)}`);
  }
  if (res.status === HTTP_NOT_FOUND) {
    throw new LlmRunError(ErrorCode.ModelNotFound, `no model "${id}" on ${opts.hubUrl}`);
  }
  if (!res.ok) {
    throw new LlmRunError(ErrorCode.Network, `${opts.hubUrl} answered ${res.status} for "${id}"`);
  }
  return (await res.json()) as HubModelInfo;
}
