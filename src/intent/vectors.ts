const INT8_MAX = 127;
const BYTE_MASK = 255;

/** Cosine similarity; 0 when the lengths differ or a vector is all zeros, so a table from another model never matches. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** Pack a vector as base64 of signed bytes scaled to its largest component. */
export function encodeVector(vector: ArrayLike<number>): string {
  const values = Array.from(vector);
  const top = values.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  const scale = top === 0 ? 1 : top;
  return btoa(values.map((value) => String.fromCharCode(Math.round((value / scale) * INT8_MAX) & BYTE_MASK)).join(''));
}

/** Unpack `encodeVector` output; null when the text is empty or not base64. */
export function decodeVector(packed: string): Int8Array | null {
  try {
    const bytes = atob(packed);
    return bytes.length === 0 ? null : Int8Array.from(bytes, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
