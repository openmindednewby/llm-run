import { ErrorCode, LlmRunError } from '../errors';

export const DEFAULT_HUB_URL = 'https://huggingface.co';
const HTTP_NOT_FOUND = 404;
/** The Hub answers 401 (not 404) for a misspelled id when no token is sent: it cannot tell a typo from a private repo. */
const HTTP_UNAUTHORIZED = 401;

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

const trimTrailingSlashes = (url: string): string => {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end -= 1;
  }
  return url.slice(0, end);
};

/** Reads a model's metadata (with blob sizes) from the Hub; 404/401 are E_MODEL_NOT_FOUND, anything else failing is E_NETWORK. */
export async function fetchModelInfo(id: string, opts: HubOptions): Promise<HubModelInfo> {
  const hubUrl = trimTrailingSlashes(opts.hubUrl);
  let res: Response;
  try {
    res = await opts.fetchFn(`${hubUrl}/api/models/${id}?blobs=true`, { headers: hubHeaders(opts.hfToken) });
  } catch (e) {
    throw new LlmRunError(ErrorCode.Network, `cannot reach ${hubUrl}: ${String(e)}`);
  }
  if (res.status === HTTP_NOT_FOUND) {
    throw new LlmRunError(ErrorCode.ModelNotFound, `no model "${id}" on ${hubUrl}`);
  }
  if (res.status === HTTP_UNAUTHORIZED) {
    throw new LlmRunError(ErrorCode.ModelNotFound, `no model "${id}" on ${hubUrl}, or private — pass hfToken`);
  }
  if (!res.ok) {
    throw new LlmRunError(ErrorCode.Network, `${hubUrl} answered ${res.status} for "${id}"`);
  }
  try {
    return (await res.json()) as HubModelInfo;
  } catch (e) {
    throw new LlmRunError(ErrorCode.Network, `${hubUrl} answered non-JSON for "${id}": ${String(e)}`);
  }
}
