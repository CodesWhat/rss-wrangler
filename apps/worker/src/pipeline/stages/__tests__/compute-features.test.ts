import { describe, expect, it } from "vitest";
import { hammingDistance, jaccardSimilarity, simhash, tokenize } from "../compute-features.js";

// ─── tokenize ────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("lowercases all tokens", () => {
    const tokens = tokenize("Hello WORLD");
    expect(tokens.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it("removes stop words", () => {
    const tokens = tokenize("the quick brown fox is a great animal");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("strips punctuation and special characters", () => {
    const tokens = tokenize("hello, world! foo-bar baz_qux");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("foo");
    expect(tokens).toContain("bar");
    expect(tokens).toContain("baz");
    expect(tokens).toContain("qux");
  });

  it("filters out single-character tokens", () => {
    const tokens = tokenize("I a b c hello");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("hello");
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns empty array when all tokens are stop words", () => {
    expect(tokenize("the and or but is")).toEqual([]);
  });

  it("handles Unicode by stripping non-alphanumeric chars", () => {
    const tokens = tokenize("caf\u00e9 na\u00efve r\u00e9sum\u00e9");
    // Unicode accented letters are stripped by the [^a-z0-9\s] regex
    expect(tokens).toContain("caf");
    expect(tokens).toContain("ve");
    expect(tokens).toContain("sum");
  });
});

// ─── simhash ─────────────────────────────────────────────────────────────────

describe("simhash", () => {
  it("returns 0n for empty text", () => {
    expect(simhash("")).toBe(0n);
  });

  it("returns 0n for text with only stop words", () => {
    expect(simhash("the and or")).toBe(0n);
  });

  it("produces the same hash for identical texts", () => {
    const text = "security vulnerability found in critical system";
    expect(simhash(text)).toBe(simhash(text));
  });

  it("produces identical hashes for same text regardless of call order", () => {
    const a = simhash("breaking news: major data breach discovered");
    const b = simhash("breaking news: major data breach discovered");
    expect(a).toBe(b);
  });

  it("produces a BigInt", () => {
    const hash = simhash("hello world test");
    expect(typeof hash).toBe("bigint");
  });

  it("identical texts have hamming distance 0", () => {
    const text = "breaking news about cybersecurity threats in enterprise systems";
    const h1 = simhash(text);
    const h2 = simhash(text);
    expect(hammingDistance(h1, h2)).toBe(0);
  });

  it("near-duplicate texts have low hamming distance", () => {
    const h1 = simhash("critical vulnerability found in apache software");
    const h2 = simhash("critical vulnerability discovered in apache software update");
    const dist = hammingDistance(h1, h2);
    expect(dist).toBeLessThanOrEqual(20);
  });

  it("very different texts have higher hamming distance", () => {
    const h1 = simhash("critical vulnerability found in apache software");
    const h2 = simhash("best chocolate cake recipe simple ingredients baking");
    const dist = hammingDistance(h1, h2);
    expect(dist).toBeGreaterThan(3);
  });
});

// ─── hammingDistance ─────────────────────────────────────────────────────────

describe("hammingDistance", () => {
  it("returns 0 for identical values", () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(123n, 123n)).toBe(0);
  });

  it("returns 1 for single-bit difference", () => {
    expect(hammingDistance(0n, 1n)).toBe(1);
    expect(hammingDistance(0b1000n, 0b0000n)).toBe(1);
  });

  it("returns correct distance for known values", () => {
    // 0b1111 vs 0b0000 => 4 bits different
    expect(hammingDistance(0b1111n, 0b0000n)).toBe(4);
  });

  it("returns 64 for values with all bits different (64-bit)", () => {
    const allOnes = (1n << 64n) - 1n;
    expect(hammingDistance(allOnes, 0n)).toBe(64);
  });

  it("is symmetric", () => {
    const a = 0xdeadbeefn;
    const b = 0xcafebaben;
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });
});

// ─── jaccardSimilarity ──────────────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("returns 1 for two empty arrays", () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it("returns 0 when one array is empty and the other is not", () => {
    expect(jaccardSimilarity([], ["hello"])).toBe(0);
    expect(jaccardSimilarity(["hello"], [])).toBe(0);
  });

  it("returns 1 for identical arrays", () => {
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for completely disjoint arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns correct value for partial overlap", () => {
    // intersection = {a, b}, union = {a, b, c, d} => 2/4 = 0.5
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(0.5);
  });

  it("handles duplicate tokens (set-based)", () => {
    // Sets: {a, b} and {a, b} => 1.0
    expect(jaccardSimilarity(["a", "a", "b"], ["a", "b", "b"])).toBe(1);
  });

  it("is symmetric", () => {
    const a = ["foo", "bar", "baz"];
    const b = ["bar", "baz", "qux"];
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
  });
});
