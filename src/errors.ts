/** Stable, machine-readable failure codes. Every error the library throws carries one. */
export const ErrorCode = {
  NoFit: 'E_NO_FIT',
  Storage: 'E_STORAGE',
  Network: 'E_NETWORK',
  Integrity: 'E_INTEGRITY',
  UnsupportedArch: 'E_UNSUPPORTED_ARCH',
  Gated: 'E_GATED',
  GpuLost: 'E_GPU_LOST',
  ModelNotFound: 'E_MODEL_NOT_FOUND',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error type the library throws: a code, a message prefixed with it, and the reasons behind it. */
export class LlmRunError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly reasons: string[] = [],
  ) {
    super(`${code}: ${message}`);
    this.name = 'LlmRunError';
  }
}
