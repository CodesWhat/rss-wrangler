import { describe, it, expect, vi, beforeEach } from "vitest";
import { preFilterSoftGate, postClusterFilter } from "../filter.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePool(queryResults: Record<string, { rows: unknown[] }> = {}) {
  const defaultRules = { rows: [] };
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      // Match based on table name in the query
      if (sql.includes("filter_rule")) return queryResults["filter_rule"] ?? defaultRules;
      if (sql.includes("cluster")) return queryResults["cluster"] ?? { rows: [] };
      if (sql.includes("filter_event")) return { rows: [] };
      return { rows: [] };
    }),
  } as any;
}

interface FilterRule {
  id: string;
  pattern: string;
  type: "phrase" | "regex";
  mode: "mute" | "block";
  breakout_enabled: boolean;
}

function makeRules(rules: FilterRule[]) {
  return { filter_rule: { rows: rules } };
}

// ─── preFilterSoftGate ──────────────────────────────────────────────────────

describe("preFilterSoftGate", () => {
  it("returns pass for items when no rules exist", async () => {
    const pool = makePool();
    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Hello world", summary: null },
    ]);

    expect(results.get("1")).toEqual({
      action: "pass",
      ruleId: null,
      breakoutReason: null,
    });
  });

  it("returns hidden for items matching a block rule (phrase)", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "crypto scam", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Another crypto scam exposed", summary: null },
    ]);

    expect(results.get("1")).toEqual({
      action: "hidden",
      ruleId: "r1",
      breakoutReason: null,
    });
  });

  it("returns hidden for items matching a mute rule", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "politics", type: "phrase", mode: "mute", breakout_enabled: true },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Latest politics update", summary: null },
    ]);

    expect(results.get("1")).toEqual({
      action: "hidden",
      ruleId: "r1",
      breakoutReason: null,
    });
  });

  it("returns pass for items not matching any rule", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "crypto", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Security update for linux", summary: null },
    ]);

    expect(results.get("1")!.action).toBe("pass");
  });

  it("matches regex rules", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "\\bcrypto\\w*", type: "regex", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Cryptocurrency market crash", summary: null },
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("matches against title + summary combined", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "scam", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Investment opportunity", summary: "This is actually a scam" },
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("phrase match is case-insensitive", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "CRYPTO", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "crypto news today", summary: null },
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("processes multiple items independently", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "spam", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "Spam alert", summary: null },
      { itemId: "2", title: "Legitimate news", summary: null },
      { itemId: "3", title: "More spam content", summary: null },
    ]);

    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("2")!.action).toBe("pass");
    expect(results.get("3")!.action).toBe("hidden");
  });

  it("skips invalid regex patterns gracefully", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "[invalid(", type: "regex", mode: "block", breakout_enabled: false },
        { id: "r2", pattern: "spam", type: "phrase", mode: "block", breakout_enabled: false },
      ])
    );

    const results = await preFilterSoftGate(pool, [
      { itemId: "1", title: "This is spam", summary: null },
    ]);

    // Should skip invalid regex and still match phrase rule
    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("1")!.ruleId).toBe("r2");
  });
});

// ─── postClusterFilter / checkBreakout ──────────────────────────────────────

describe("postClusterFilter", () => {
  it("does nothing when no cluster ids provided", async () => {
    const pool = makePool();
    await postClusterFilter(pool, []);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("does nothing when no filter rules exist", async () => {
    const pool = makePool();
    await postClusterFilter(pool, ["c1"]);
    // Only the filter_rule query should be called
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ─── checkBreakout (tested through postClusterFilter integration) ──────────

describe("breakout logic via postClusterFilter", () => {
  function makeClusterPool(
    rules: FilterRule[],
    clusterInfo: {
      rep_title: string;
      rep_summary: string | null;
      rep_feed_weight: string;
      size: number;
    }
  ) {
    return {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("filter_rule")) return { rows: rules };
        if (sql.includes("FROM cluster")) return { rows: [clusterInfo] };
        if (sql.includes("filter_event")) return { rows: [] };
        return { rows: [] };
      }),
    } as any;
  }

  it("triggers breakout on severity keyword in title", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "security news", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "security news: critical vulnerability found", rep_summary: null, rep_feed_weight: "normal", size: 1 }
    );

    await postClusterFilter(pool, ["c1"]);

    // Should insert a filter_event with breakout_shown
    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "breakout_shown"]);
  });

  it("triggers breakout on high reputation source", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "topic discussed", rep_summary: null, rep_feed_weight: "prefer", size: 1 }
    );

    await postClusterFilter(pool, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "breakout_shown"]);
  });

  it("triggers breakout on large cluster size (>= 4)", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "topic discussed", rep_summary: null, rep_feed_weight: "normal", size: 5 }
    );

    await postClusterFilter(pool, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "breakout_shown"]);
  });

  it("does not trigger breakout when cluster size < 4 and no severity/reputation", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "topic discussed casually", rep_summary: null, rep_feed_weight: "normal", size: 2 }
    );

    await postClusterFilter(pool, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "hidden"]);
  });

  it("hides content when breakout is disabled even with severity keyword", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "security", type: "phrase", mode: "mute", breakout_enabled: false }],
      { rep_title: "security breach critical", rep_summary: null, rep_feed_weight: "normal", size: 1 }
    );

    await postClusterFilter(pool, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "hidden"]);
  });

  it("records hidden event for block mode (no breakout possible)", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "blocked topic", type: "phrase", mode: "block", breakout_enabled: true }],
      { rep_title: "blocked topic: critical breach", rep_summary: null, rep_feed_weight: "prefer", size: 10 }
    );

    await postClusterFilter(pool, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event")
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["r1", "c1", "hidden"]);
  });
});
