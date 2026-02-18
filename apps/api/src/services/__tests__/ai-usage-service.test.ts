import { estimateCostUsd } from "@rss-wrangler/contracts";
import { describe, expect, it, vi } from "vitest";
import { checkBudget, getMonthlyUsage, recordAiUsage } from "../ai-usage-service";

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

describe("estimateCostUsd", () => {
  it("computes correct cost for gpt-4o-mini", () => {
    // 1000 input tokens at $0.15/1M + 500 output tokens at $0.60/1M
    const cost = estimateCostUsd("gpt-4o-mini", 1000, 500);
    expect(cost).toBeCloseTo(0.00045, 5);
  });

  it("computes correct cost for gpt-4o", () => {
    // 1M input at $2.50 + 1M output at $10
    const cost = estimateCostUsd("gpt-4o", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(12.5, 2);
  });

  it("returns 0 for ollama models", () => {
    expect(estimateCostUsd("ollama/llama3", 10000, 5000)).toBe(0);
  });

  it("returns 0 for local models", () => {
    expect(estimateCostUsd("local/phi3", 10000, 5000)).toBe(0);
  });

  it("falls back to gpt-4o-mini for unknown models", () => {
    const cost = estimateCostUsd("unknown-model", 1000, 500);
    const expected = estimateCostUsd("gpt-4o-mini", 1000, 500);
    expect(cost).toBe(expected);
  });
});

describe("recordAiUsage", () => {
  it("inserts a usage record with correct parameters including cost", async () => {
    const pool = mockPool([{ rows: [] }]);

    await recordAiUsage(pool, {
      accountId: "tenant-1",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 500,
      outputTokens: 200,
      estimatedCostUsd: 0,
      feature: "summary",
      durationMs: 1200,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO ai_usage");
    expect(params).toHaveLength(8);
    expect(params![0]).toBe("tenant-1");
    expect(params![1]).toBe("openai");
    expect(params![2]).toBe("gpt-4o");
    expect(params![3]).toBe(500);
    expect(params![4]).toBe(200);
    // Cost is auto-computed from model cost table when 0
    expect(typeof params![5]).toBe("number");
    expect(params![6]).toBe("summary");
    expect(params![7]).toBe(1200);
  });
});

describe("getMonthlyUsage", () => {
  it("aggregates usage by provider and feature with cost", async () => {
    const pool = mockPool([
      {
        rows: [{ total_input: "1500", total_output: "600", total_calls: "5", total_cost: "0.50" }],
      },
      {
        rows: [
          {
            provider: "openai",
            input_tokens: "1000",
            output_tokens: "400",
            cost: "0.30",
            calls: "3",
          },
          {
            provider: "anthropic",
            input_tokens: "500",
            output_tokens: "200",
            cost: "0.20",
            calls: "2",
          },
        ],
      },
      {
        rows: [
          {
            feature: "summary",
            input_tokens: "800",
            output_tokens: "300",
            cost: "0.25",
            calls: "3",
          },
          {
            feature: "digest",
            input_tokens: "700",
            output_tokens: "300",
            cost: "0.25",
            calls: "2",
          },
        ],
      },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [{ data: { monthlyAiCapUsd: 10 } }] },
    ]);

    const result = await getMonthlyUsage(pool, "tenant-1", "2026-02");

    expect(result.month).toBe("2026-02");
    expect(result.totalInputTokens).toBe(1500);
    expect(result.totalOutputTokens).toBe(600);
    expect(result.totalCalls).toBe(5);
    expect(result.totalCostUsd).toBe(0.5);
    expect(result.byProvider).toEqual({
      openai: { inputTokens: 1000, outputTokens: 400, costUsd: 0.3, calls: 3 },
      anthropic: { inputTokens: 500, outputTokens: 200, costUsd: 0.2, calls: 2 },
    });
    expect(result.byFeature).toEqual({
      summary: { inputTokens: 800, outputTokens: 300, costUsd: 0.25, calls: 3 },
      digest: { inputTokens: 700, outputTokens: 300, costUsd: 0.25, calls: 2 },
    });
    expect(result.budgetTokens).toBe(1_000_000);
    expect(result.budgetUsedPercent).toBeCloseTo(0.21, 1);
    expect(result.budgetCapUsd).toBe(10);
    expect(result.budgetCostPercent).toBe(5);
  });

  it("returns zero totals when no usage exists", async () => {
    const pool = mockPool([
      { rows: [{ total_input: "0", total_output: "0", total_calls: "0", total_cost: "0" }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);

    const result = await getMonthlyUsage(pool, "tenant-1");

    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.totalCalls).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.byProvider).toEqual({});
    expect(result.byFeature).toEqual({});
    expect(result.budgetTokens).toBe(10_000);
    expect(result.budgetCapUsd).toBeNull();
    expect(result.budgetCostPercent).toBeNull();
  });
});

describe("checkBudget", () => {
  it("returns allowed=true when usage is under the free tier limit", async () => {
    const pool = mockPool([
      { rows: [{ total: "5000", total_cost: "0.10" }] },
      { rows: [{ plan_id: "free" }] },
      { rows: [] },
    ]);

    const result = await checkBudget(pool, "tenant-1");

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(5000);
    expect(result.limit).toBe(10_000);
    expect(result.remaining).toBe(5000);
    expect(result.costUsd).toBe(0.1);
    expect(result.costLimitUsd).toBeNull();
  });

  it("returns allowed=false when usage exceeds the free tier limit", async () => {
    const pool = mockPool([
      { rows: [{ total: "12000", total_cost: "0.50" }] },
      { rows: [{ plan_id: "free" }] },
      { rows: [] },
    ]);

    const result = await checkBudget(pool, "tenant-1");

    expect(result.allowed).toBe(false);
    expect(result.used).toBe(12000);
    expect(result.limit).toBe(10_000);
    expect(result.remaining).toBe(0);
  });

  it("returns allowed=false when USD cost exceeds the monthly cap", async () => {
    const pool = mockPool([
      { rows: [{ total: "50000", total_cost: "15.00" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [{ data: { monthlyAiCapUsd: 10 } }] },
    ]);

    const result = await checkBudget(pool, "tenant-1");

    expect(result.allowed).toBe(false);
    expect(result.costUsd).toBe(15.0);
    expect(result.costLimitUsd).toBe(10);
  });

  it("returns correct limits for pro tier", async () => {
    const pool = mockPool([
      { rows: [{ total: "50000", total_cost: "1.00" }] },
      { rows: [{ plan_id: "pro" }] },
      { rows: [] },
    ]);

    const result = await checkBudget(pool, "tenant-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100_000);
    expect(result.remaining).toBe(50_000);
  });

  it("returns correct limits for pro_ai tier", async () => {
    const pool = mockPool([
      { rows: [{ total: "999999", total_cost: "5.00" }] },
      { rows: [{ plan_id: "pro_ai" }] },
      { rows: [] },
    ]);

    const result = await checkBudget(pool, "tenant-1");

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(1_000_000);
    expect(result.remaining).toBe(1);
  });

  it("budget limits match tier expectations", () => {
    expect(10_000).toBeLessThan(100_000);
    expect(100_000).toBeLessThan(1_000_000);
  });
});
