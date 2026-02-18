import { describe, expect, it } from "vitest";
import { parseClassificationResponse } from "../enrich-with-ai.js";

describe("parseClassificationResponse", () => {
  it("parses a valid wrapped response", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: 0, intent: "news", confidence: 0.95 },
        { index: 1, intent: "tutorial", confidence: 0.8 },
      ],
    });
    const result = parseClassificationResponse(raw, 3);
    expect(result.size).toBe(2);
    expect(result.get(0)).toEqual({ intent: "news", confidence: 0.95 });
    expect(result.get(1)).toEqual({ intent: "tutorial", confidence: 0.8 });
  });

  it("parses a raw array response", () => {
    const raw = JSON.stringify([{ index: 0, intent: "opinion", confidence: 0.7 }]);
    const result = parseClassificationResponse(raw, 1);
    expect(result.size).toBe(1);
    expect(result.get(0)).toEqual({ intent: "opinion", confidence: 0.7 });
  });

  it("strips markdown fences (Ollama compatibility)", () => {
    const raw =
      '```json\n{"classifications": [{"index": 0, "intent": "analysis", "confidence": 0.85}]}\n```';
    const result = parseClassificationResponse(raw, 1);
    expect(result.size).toBe(1);
    expect(result.get(0)).toEqual({ intent: "analysis", confidence: 0.85 });
  });

  it("strips fences without json language tag", () => {
    const raw = '```\n[{"index": 0, "intent": "release", "confidence": 0.9}]\n```';
    const result = parseClassificationResponse(raw, 1);
    expect(result.size).toBe(1);
    expect(result.get(0)!.intent).toBe("release");
  });

  it("returns empty map for invalid JSON", () => {
    const result = parseClassificationResponse("not json at all", 3);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty response", () => {
    const result = parseClassificationResponse("", 3);
    expect(result.size).toBe(0);
  });

  it("skips entries with out-of-range index", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: -1, intent: "news", confidence: 0.9 },
        { index: 5, intent: "news", confidence: 0.9 },
        { index: 0, intent: "news", confidence: 0.9 },
      ],
    });
    const result = parseClassificationResponse(raw, 2);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
  });

  it("skips entries with invalid intent", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: 0, intent: "sports", confidence: 0.9 },
        { index: 1, intent: "news", confidence: 0.8 },
      ],
    });
    const result = parseClassificationResponse(raw, 2);
    expect(result.size).toBe(1);
    expect(result.has(1)).toBe(true);
  });

  it("clamps confidence to [0, 1]", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: 0, intent: "news", confidence: 1.5 },
        { index: 1, intent: "opinion", confidence: -0.3 },
      ],
    });
    const result = parseClassificationResponse(raw, 2);
    expect(result.get(0)!.confidence).toBe(1);
    expect(result.get(1)!.confidence).toBe(0);
  });

  it("normalizes intent to lowercase", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: 0, intent: "NEWS", confidence: 0.9 },
        { index: 1, intent: "Tutorial", confidence: 0.8 },
      ],
    });
    const result = parseClassificationResponse(raw, 2);
    expect(result.get(0)!.intent).toBe("news");
    expect(result.get(1)!.intent).toBe("tutorial");
  });

  it("skips entries missing required fields", () => {
    const raw = JSON.stringify({
      classifications: [
        { index: 0, confidence: 0.9 }, // no intent -> skipped
        { index: 1, intent: "news" }, // no confidence -> defaults to 0, still valid
        { intent: "news", confidence: 0.9 }, // no index -> defaults to -1 -> skipped
        null, // not object -> skipped
        42, // not object -> skipped
      ],
    });
    const result = parseClassificationResponse(raw, 3);
    // Only index:1 is valid (intent present, confidence defaults to 0)
    expect(result.size).toBe(1);
    expect(result.get(1)).toEqual({ intent: "news", confidence: 0 });
  });

  it("handles all six valid intents", () => {
    const intents = ["news", "opinion", "tutorial", "announcement", "release", "analysis"] as const;
    const raw = JSON.stringify({
      classifications: intents.map((intent, index) => ({
        index,
        intent,
        confidence: 0.9,
      })),
    });
    const result = parseClassificationResponse(raw, 6);
    expect(result.size).toBe(6);
    for (let i = 0; i < intents.length; i++) {
      expect(result.get(i)!.intent).toBe(intents[i]);
    }
  });

  it("returns empty map when classifications key is missing", () => {
    const raw = JSON.stringify({ something_else: [] });
    const result = parseClassificationResponse(raw, 2);
    expect(result.size).toBe(0);
  });

  it("returns empty map when classifications is not an array", () => {
    const raw = JSON.stringify({ classifications: "not an array" });
    const result = parseClassificationResponse(raw, 2);
    expect(result.size).toBe(0);
  });
});
