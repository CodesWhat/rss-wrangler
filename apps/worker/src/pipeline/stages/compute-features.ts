/**
 * Simhash implementation for near-duplicate detection.
 *
 * Produces a 64-bit fingerprint from text using token hashing.
 * Two texts are near-duplicates if their simhash Hamming distance
 * is below a threshold (typically <= 3 for 64-bit hashes).
 */

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "not",
  "no",
  "so",
  "if",
  "as",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * FNV-1a 32-bit hash for a string token.
 * We use two different seeds to build a 64-bit hash from two 32-bit halves.
 */
function fnv1a32(str: string, seed: number = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Compute a 64-bit simhash as a BigInt.
 * We split it into two 32-bit halves using different FNV seeds.
 */
export function simhash(text: string): bigint {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0n;

  // 64-bit vector: store as array of weights per bit position
  const v = new Float64Array(64);

  for (const token of tokens) {
    const lo = fnv1a32(token, 0x811c9dc5);
    const hi = fnv1a32(token, 0x01000193);
    const hash64 = (BigInt(hi) << 32n) | BigInt(lo);

    for (let i = 0; i < 64; i++) {
      if ((hash64 >> BigInt(i)) & 1n) {
        v[i]! += 1;
      } else {
        v[i]! -= 1;
      }
    }
  }

  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i]! > 0) {
      fingerprint |= 1n << BigInt(i);
    }
  }

  return fingerprint;
}

/**
 * Hamming distance between two 64-bit simhashes.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * Jaccard similarity between two token sets.
 */
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
