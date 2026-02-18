import { describe, expect, it, vi } from "vitest";
import type { ItemForFilter } from "../filter.js";
import { postClusterFilter, preFilterSoftGate } from "../filter.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ACCOUNT_ID = "account-1";

function makePool(queryResults: Record<string, { rows: unknown[] }> = {}) {
  const defaultRules = { rows: [] };
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      // Match based on table name in the query
      if (sql.includes("filter_rule")) return queryResults.filter_rule ?? defaultRules;
      if (sql.includes("cluster")) return queryResults.cluster ?? { rows: [] };
      if (sql.includes("filter_event")) return { rows: [] };
      return { rows: [] };
    }),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface FilterRuleRow {
  id: string;
  pattern: string;
  target?: string;
  type: "phrase" | "regex";
  mode: "mute" | "block" | "keep";
  breakout_enabled: boolean;
  feed_id?: string | null;
  folder_id?: string | null;
}

function makeRules(rules: FilterRuleRow[]) {
  return { filter_rule: { rows: rules } };
}

/** Helper to build a full ItemForFilter with sensible defaults. */
function makeItem(
  overrides: Partial<ItemForFilter> & { itemId: string; title: string },
): ItemForFilter {
  return {
    summary: null,
    author: null,
    url: null,
    feedId: null,
    folderId: null,
    ...overrides,
  };
}

// ─── preFilterSoftGate ──────────────────────────────────────────────────────

describe("preFilterSoftGate", () => {
  it("returns pass for items when no rules exist", async () => {
    const pool = makePool();
    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Hello world" }),
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
        {
          id: "r1",
          pattern: "crypto scam",
          type: "phrase",
          mode: "block",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Another crypto scam exposed" }),
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
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Latest politics update" }),
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
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Security update for linux" }),
    ]);

    expect(results.get("1")!.action).toBe("pass");
  });

  it("matches regex rules", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "\\bcrypto\\w*",
          type: "regex",
          mode: "block",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Cryptocurrency market crash" }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("matches against title + summary combined", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "scam", type: "phrase", mode: "block", breakout_enabled: false },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({
        itemId: "1",
        title: "Investment opportunity",
        summary: "This is actually a scam",
      }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("phrase match is case-insensitive", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "CRYPTO", type: "phrase", mode: "block", breakout_enabled: false },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "crypto news today" }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
  });

  it("processes multiple items independently", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "spam", type: "phrase", mode: "block", breakout_enabled: false },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Spam alert" }),
      makeItem({ itemId: "2", title: "Legitimate news" }),
      makeItem({ itemId: "3", title: "More spam content" }),
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
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "This is spam" }),
    ]);

    // Should skip invalid regex and still match phrase rule
    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("1")!.ruleId).toBe("r2");
  });
});

// ─── New filter targets ─────────────────────────────────────────────────────

describe("preFilterSoftGate - new targets", () => {
  it("matches author target", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "John Doe",
          target: "author",
          type: "phrase",
          mode: "block",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Some article", author: "John Doe" }),
      makeItem({ itemId: "2", title: "Other article", author: "Jane Smith" }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("2")!.action).toBe("pass");
  });

  it("matches domain target", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "example.com",
          target: "domain",
          type: "phrase",
          mode: "mute",
          breakout_enabled: true,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Some article", url: "https://example.com/post/1" }),
      makeItem({ itemId: "2", title: "Other article", url: "https://other.org/post/1" }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("2")!.action).toBe("pass");
  });

  it("matches url_pattern target with phrase", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "/sponsored/",
          target: "url_pattern",
          type: "phrase",
          mode: "block",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Sponsored Post", url: "https://example.com/sponsored/deal" }),
      makeItem({ itemId: "2", title: "Real article", url: "https://example.com/news/headline" }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("2")!.action).toBe("pass");
  });
});

// ─── Keep/allow mode ────────────────────────────────────────────────────────

describe("preFilterSoftGate - keep mode", () => {
  it("hides items not matching any keep rule", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "security",
          target: "keyword",
          type: "phrase",
          mode: "keep",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Security update released" }),
      makeItem({ itemId: "2", title: "Sports news" }),
    ]);

    expect(results.get("1")!.action).toBe("pass");
    expect(results.get("2")!.action).toBe("hidden");
  });

  it("multiple keep rules OR together (match any = shown)", async () => {
    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "security",
          target: "keyword",
          type: "phrase",
          mode: "keep",
          breakout_enabled: false,
        },
        {
          id: "r2",
          pattern: "linux",
          target: "keyword",
          type: "phrase",
          mode: "keep",
          breakout_enabled: false,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Security update" }),
      makeItem({ itemId: "2", title: "Linux kernel release" }),
      makeItem({ itemId: "3", title: "Sports news" }),
    ]);

    expect(results.get("1")!.action).toBe("pass");
    expect(results.get("2")!.action).toBe("pass");
    expect(results.get("3")!.action).toBe("hidden");
  });

  it("keep rules scoped to a feed only affect that feed", async () => {
    const FEED_A = "feed-aaa";
    const FEED_B = "feed-bbb";

    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "security",
          target: "keyword",
          type: "phrase",
          mode: "keep",
          breakout_enabled: false,
          feed_id: FEED_A,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Security update", feedId: FEED_A }),
      makeItem({ itemId: "2", title: "Sports news", feedId: FEED_A }),
      makeItem({ itemId: "3", title: "Sports news", feedId: FEED_B }),
    ]);

    expect(results.get("1")!.action).toBe("pass");
    expect(results.get("2")!.action).toBe("hidden");
    expect(results.get("3")!.action).toBe("pass");
  });
});

// ─── Per-feed/folder scope ──────────────────────────────────────────────────

describe("preFilterSoftGate - scoped rules", () => {
  it("scoped mute rule only affects matching feed", async () => {
    const FEED_A = "feed-aaa";
    const FEED_B = "feed-bbb";

    const pool = makePool(
      makeRules([
        {
          id: "r1",
          pattern: "spam",
          target: "keyword",
          type: "phrase",
          mode: "mute",
          breakout_enabled: false,
          feed_id: FEED_A,
        },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Spam content", feedId: FEED_A }),
      makeItem({ itemId: "2", title: "Spam content", feedId: FEED_B }),
    ]);

    expect(results.get("1")!.action).toBe("hidden");
    expect(results.get("2")!.action).toBe("pass");
  });
});

// ─── postClusterFilter / checkBreakout ──────────────────────────────────────

describe("postClusterFilter", () => {
  it("does nothing when no cluster ids provided", async () => {
    const pool = makePool();
    await postClusterFilter(pool, ACCOUNT_ID, []);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("does nothing when no filter rules exist", async () => {
    const pool = makePool();
    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

// ─── checkBreakout (tested through postClusterFilter integration) ──────────

describe("breakout logic via postClusterFilter", () => {
  function makeClusterPool(
    rules: FilterRuleRow[],
    clusterInfo: {
      rep_title: string;
      rep_summary: string | null;
      rep_author?: string | null;
      rep_url?: string | null;
      rep_feed_id?: string | null;
      rep_folder_id?: string | null;
      rep_feed_weight: string;
      size: number;
    },
  ) {
    const fullClusterInfo = {
      rep_author: null,
      rep_url: null,
      rep_feed_id: null,
      rep_folder_id: null,
      ...clusterInfo,
    };
    return {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("filter_rule")) return { rows: rules };
        if (sql.includes("FROM cluster")) return { rows: [fullClusterInfo] };
        if (sql.includes("filter_event")) return { rows: [] };
        return { rows: [] };
      }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  it("triggers breakout on severity keyword in title", async () => {
    const pool = makeClusterPool(
      [
        {
          id: "r1",
          pattern: "security news",
          type: "phrase",
          mode: "mute",
          breakout_enabled: true,
        },
      ],
      {
        rep_title: "security news: critical vulnerability found",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 1,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "breakout_shown"]);
  });

  it("triggers breakout on high reputation source", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "topic discussed", rep_summary: null, rep_feed_weight: "prefer", size: 1 },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "breakout_shown"]);
  });

  it("triggers breakout on large cluster size (>= 4)", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "topic discussed", rep_summary: null, rep_feed_weight: "normal", size: 5 },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "breakout_shown"]);
  });

  it("does not trigger breakout when cluster size < 4 and no severity/reputation", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "topic discussed casually",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 2,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "hidden"]);
  });

  it("hides content when breakout is disabled even with severity keyword", async () => {
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "security", type: "phrase", mode: "mute", breakout_enabled: false }],
      {
        rep_title: "security breach critical",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 1,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "hidden"]);
  });

  it("records hidden event for block mode (no breakout possible)", async () => {
    const pool = makeClusterPool(
      [
        {
          id: "r1",
          pattern: "blocked topic",
          type: "phrase",
          mode: "block",
          breakout_enabled: true,
        },
      ],
      {
        rep_title: "blocked topic: critical breach",
        rep_summary: null,
        rep_feed_weight: "prefer",
        size: 10,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "hidden"]);
  });
});

describe("breakout reason population", () => {
  function makeClusterPool(
    rules: FilterRuleRow[],
    clusterInfo: {
      rep_title: string;
      rep_summary: string | null;
      rep_author?: string | null;
      rep_url?: string | null;
      rep_feed_id?: string | null;
      rep_folder_id?: string | null;
      rep_feed_weight: string;
      size: number;
    },
  ) {
    const fullClusterInfo = {
      rep_author: null,
      rep_url: null,
      rep_feed_id: null,
      rep_folder_id: null,
      ...clusterInfo,
    };
    return {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("filter_rule")) return { rows: rules };
        if (sql.includes("FROM cluster")) return { rows: [fullClusterInfo] };
        if (sql.includes("filter_event")) return { rows: [] };
        return { rows: [] };
      }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  it("logs severity_keyword reason with matched keyword", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "infosec", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "infosec: ransomware hits hospital",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 1,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect(breakoutLog![1]).toMatchObject({ reason: "severity_keyword:ransomware" });
    spy.mockRestore();
  });

  it("logs high_reputation_source reason for prefer-weight feed", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "crypto", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "crypto update from trusted source",
        rep_summary: null,
        rep_feed_weight: "prefer",
        size: 1,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect(breakoutLog![1]).toMatchObject({ reason: "high_reputation_source" });
    spy.mockRestore();
  });

  it("logs cluster_size reason with actual size", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "muted topic", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "muted topic goes viral",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 7,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect(breakoutLog![1]).toMatchObject({ reason: "cluster_size:7" });
    spy.mockRestore();
  });

  it("non-breakout hidden events have no breakout log", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "boring", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "boring local news update",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 1,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeUndefined();

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "hidden"]);
    spy.mockRestore();
  });

  it("preFilterSoftGate always returns null breakoutReason", async () => {
    const pool = makePool(
      makeRules([
        { id: "r1", pattern: "breach", type: "phrase", mode: "mute", breakout_enabled: true },
      ]),
    );

    const results = await preFilterSoftGate(pool, ACCOUNT_ID, [
      makeItem({ itemId: "1", title: "Major breach reported" }),
      makeItem({ itemId: "2", title: "Normal news article" }),
    ]);

    expect(results.get("1")!.breakoutReason).toBeNull();
    expect(results.get("2")!.breakoutReason).toBeNull();
  });

  it("severity keyword takes priority over cluster size when both match", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "muted", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "muted: critical exploit discovered",
        rep_summary: null,
        rep_feed_weight: "normal",
        size: 10,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect((breakoutLog![1] as { reason: string }).reason).toMatch(/^severity_keyword:/);
    spy.mockRestore();
  });

  it("severity keyword takes priority over high reputation source when both match", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "muted", type: "phrase", mode: "mute", breakout_enabled: true }],
      { rep_title: "muted: zero-day found", rep_summary: null, rep_feed_weight: "prefer", size: 1 },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect((breakoutLog![1] as { reason: string }).reason).toBe("severity_keyword:zero-day");
    spy.mockRestore();
  });

  it("high reputation takes priority over cluster size when no severity keyword", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pool = makeClusterPool(
      [{ id: "r1", pattern: "muted", type: "phrase", mode: "mute", breakout_enabled: true }],
      {
        rep_title: "muted topic trending everywhere",
        rep_summary: null,
        rep_feed_weight: "prefer",
        size: 8,
      },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const breakoutLog = spy.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("[filter] breakout triggered"),
    );
    expect(breakoutLog).toBeDefined();
    expect((breakoutLog![1] as { reason: string }).reason).toBe("high_reputation_source");
    spy.mockRestore();
  });

  it("first matching mute rule wins when multiple rules match", async () => {
    const pool = makeClusterPool(
      [
        { id: "r1", pattern: "news", type: "phrase", mode: "mute", breakout_enabled: false },
        { id: "r2", pattern: "news", type: "phrase", mode: "mute", breakout_enabled: true },
      ],
      { rep_title: "news: critical breach", rep_summary: null, rep_feed_weight: "normal", size: 1 },
    );

    await postClusterFilter(pool, ACCOUNT_ID, ["c1"]);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("filter_event"), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([ACCOUNT_ID, "r1", "c1", "hidden"]);
  });
});
