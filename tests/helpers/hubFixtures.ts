// A Hugging Face /api/models/<id> response for a single-file GGUF repo.
const MiB = 1024 ** 2;

export const ggufRepo = (id: string, arch: string, fileMiB: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, sha: 'rev1', gated: false, cardData: { license: 'apache-2.0' }, gguf: { architecture: arch, context_length: 4096 },
  siblings: [{
    rfilename: `${id.split('/')[1] ?? id}-Q4_K_M.gguf`, size: fileMiB * MiB,
    lfs: { sha256: 'a'.repeat(64), size: fileMiB * MiB },
  }],
  ...extra,
});
