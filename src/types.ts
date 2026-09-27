/** Inference engines a model can be served by. */
export const Runtime = { Wllama: 'wllama', WebLlm: 'webllm', Fallback: 'fallback' } as const;
export type Runtime = (typeof Runtime)[keyof typeof Runtime];

export interface GpuProfile {
  vendor: string;
  architecture: string;
  isFallbackAdapter: boolean;
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  shaderF16: boolean;
}

export interface DeviceProfile {
  webgpu: GpuProfile | null;
  memoryGiB: number | null;
  storageFreeBytes: number | null;
  crossOriginIsolated: boolean;
  memory64: boolean;
  userAgent: string;
}

export interface ModelFile {
  path: string;
  size: number;
  sha256: string | null;
}

export interface GgufVariant {
  quant: string;
  files: ModelFile[];
  totalBytes: number;
}

export interface ModelManifest {
  id: string;
  sourceId: string;
  revision: string;
  license: string | null;
  gated: boolean;
  architecture: string | null;
  contextLength: number | null;
  gguf: GgufVariant[];
  webllm: { modelId: string; vramBytes: number } | null;
}

export interface Candidate {
  runtime: Runtime;
  quant: string | null;
  bytes: number;
  files: ModelFile[];
  webllmModelId: string | null;
}

export interface RunPlan {
  ok: boolean;
  candidates: Candidate[];
  reasons: string[];
  unsupportedArch: string | null;
}

export type CanRunResult =
  | { ok: true; runtime: Runtime; quant: string | null; bytes: number }
  | { ok: false; reasons: string[] };

export interface ProgressEvent {
  file: string;
  loadedBytes: number;
  totalBytes: number;
}

/** Resumable byte store for one downloaded file (OPFS in the browser, memory in tests). */
export interface ByteSink {
  size(): Promise<number>;
  append(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  read(): AsyncIterable<Uint8Array>;
  truncate(): Promise<void>;
  commit(): Promise<Blob>;
}

/** Opens a ByteSink per file key and returns files already committed. */
export interface SinkFactory {
  open(key: string): Promise<ByteSink>;
  getCommitted(key: string): Promise<Blob | null>;
}

/** wllama wasm locations; structurally identical to wllama's AssetsPathConfig. */
export interface WllamaAssetPaths {
  default: string;
  'single-thread/wllama.wasm'?: string;
  'multi-thread/wllama.wasm'?: string;
}

export interface RunOptions {
  hfToken?: string;
  hubUrl?: string;
  fallback?: string;
  contextLength?: number;
  maxModelBytes?: number;
  powerPreference?: 'low-power' | 'high-performance';
  onProgress?: (e: ProgressEvent) => void;
  onWarning?: (message: string) => void;
  /**
   * Where wllama loads its wasm from (same shape as wllama's own config). Default: the pinned
   * jsDelivr copy. Self-host it for a strict CSP, COEP without CORP from a CDN, or offline use.
   */
  wllamaAssetPaths?: WllamaAssetPaths;
  /** test + advanced seams */
  fetchFn?: typeof fetch;
  device?: DeviceProfile;
  sinks?: SinkFactory | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}
