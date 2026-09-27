export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;
/** Quant preference: smallest that keeps quality ≥ 4-bit first (spec Section 2 step 4). */
export const QUANT_PREFERENCE = ['Q4_K_M', 'Q4_K_S', 'IQ4_XS', 'Q4_0', 'Q5_K_M', 'Q5_K_S', 'Q6_K', 'Q8_0'] as const;
export const DEFAULT_MEMORY_GIB = 4; // no navigator.deviceMemory (Firefox, Safari): assume a 4 GB-class device
export const USABLE_MEMORY_SHARE = 0.6; // estimate: leave 40% for OS, browser and page
export const OVERHEAD_FACTOR = 1.2; // estimate: KV cache at 4k context + scratch buffers
export const WLLAMA_MAX_FILE_BYTES = 2 * GiB; // wllama per-file cap (research 2026-09-27)
export const WASM32_MAX_BYTES = 4 * GiB; // no Memory64 (Safari): wasm heap cap
export const DEFAULT_CONTEXT_LENGTH = 4096;
