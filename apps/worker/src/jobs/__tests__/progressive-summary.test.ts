import { describe, expect, it, vi } from "vitest";
import { runProgressiveSummary } from "../progressive-summary";

function mockPool(queryResults: { rows: Record<string, unknown>[] }[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(result);
    }),
  };
}

function mockProvider(responseText = "A concise summary of the article.") {
  return {
    name: "test-provider",
    complete: vi.fn().mockResolvedValue({
      text: responseText,
      provider: "test",
      model: "test-model",
      inputTokens: 50,
      outputTokens: 20,
      durationMs: 100,
    }),
  };
}

describe("runProgressiveSummary", () => {
  it("returns zero counts when feature is disabled", async () => {
    const pool = mockPool([{ rows: [{ data: { progressiveSummarizationEnabled: false } }] }]);
    const provider = mockProvider();

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result).toEqual({ candidates: 0, summarized: 0 });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("returns zero counts when aiMode is off", async () => {
    const pool = mockPool([{ rows: [{ data: { aiMode: "off" } }] }]);
    const provider = mockProvider();

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result).toEqual({ candidates: 0, summarized: 0 });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("returns zero counts when no AI provider is available", async () => {
    const pool = mockPool([{ rows: [{ data: { aiMode: "summaries_digest" } }] }]);

    const result = await runProgressiveSummary(pool as never, "tenant-1", null);

    expect(result).toEqual({ candidates: 0, summarized: 0 });
  });

  it("returns zero counts when AI budget is exceeded", async () => {
    const pool = mockPool([
      // getProgressiveSettings
      { rows: [{ data: { aiMode: "summaries_digest", progressiveSummarizationEnabled: true } }] },
      // isBudgetExceeded
      { rows: [{ total: "999999", total_cost: "100" }] },
      { rows: [{ plan_id: "free" }] },
      { rows: [] },
    ]);
    const provider = mockProvider();

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result).toEqual({ candidates: 0, summarized: 0 });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("returns zero counts when no candidates exist", async () => {
    const pool = mockPool([
      // getProgressiveSettings
      { rows: [{ data: { aiMode: "summaries_digest", progressiveSummarizationEnabled: true } }] },
      // isBudgetExceeded
      { rows: [{ total: "100", total_cost: "0.01" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [] },
      // candidate query: no items
      { rows: [] },
    ]);
    const provider = mockProvider();

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result).toEqual({ candidates: 0, summarized: 0 });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("generates summaries for aging items", async () => {
    const pool = mockPool([
      // getProgressiveSettings
      { rows: [{ data: { aiMode: "summaries_digest", progressiveSummarizationEnabled: true } }] },
      // isBudgetExceeded
      { rows: [{ total: "100", total_cost: "0.01" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [] },
      // candidate query: 2 items
      {
        rows: [
          { id: "item-1", title: "Breaking: New AI model released", summary: null },
          { id: "item-2", title: "Security patch for OpenSSL", summary: null },
        ],
      },
      // UPDATE for item-1
      { rows: [] },
      // UPDATE for item-2
      { rows: [] },
    ]);
    const provider = mockProvider("A concise summary.");

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result.candidates).toBe(2);
    expect(result.summarized).toBe(2);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("skips items where AI returns empty response", async () => {
    const pool = mockPool([
      // getProgressiveSettings
      { rows: [{ data: { aiMode: "summaries_digest", progressiveSummarizationEnabled: true } }] },
      // isBudgetExceeded
      { rows: [{ total: "100", total_cost: "0.01" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [] },
      // candidate query: 1 item
      { rows: [{ id: "item-1", title: "Some article", summary: null }] },
    ]);
    const provider = {
      name: "test-provider",
      complete: vi.fn().mockResolvedValue({
        text: "",
        provider: "test",
        model: "test-model",
        inputTokens: 50,
        outputTokens: 0,
        durationMs: 100,
      }),
    };

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result.candidates).toBe(1);
    expect(result.summarized).toBe(0);
  });

  it("continues processing when individual item fails", async () => {
    const pool = mockPool([
      // getProgressiveSettings
      { rows: [{ data: { aiMode: "summaries_digest", progressiveSummarizationEnabled: true } }] },
      // isBudgetExceeded
      { rows: [{ total: "100", total_cost: "0.01" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [] },
      // candidate query: 2 items
      {
        rows: [
          { id: "item-1", title: "Article 1", summary: null },
          { id: "item-2", title: "Article 2", summary: null },
        ],
      },
      // UPDATE for item-2 (item-1 fails)
      { rows: [] },
    ]);

    let callCount = 0;
    const provider = {
      name: "test-provider",
      complete: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("API timeout"));
        }
        return Promise.resolve({
          text: "Summary for article 2.",
          provider: "test",
          model: "test-model",
          inputTokens: 50,
          outputTokens: 20,
          durationMs: 100,
        });
      }),
    };

    const result = await runProgressiveSummary(pool as never, "tenant-1", provider as never);

    expect(result.candidates).toBe(2);
    expect(result.summarized).toBe(1);
  });
});
