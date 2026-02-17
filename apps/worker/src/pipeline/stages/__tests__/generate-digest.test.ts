import { describe, expect, it, vi } from "vitest";
import { generateDigest, maybeGenerateDigest } from "../generate-digest.js";

// ---- Helpers ----------------------------------------------------------------

const ACCOUNT_ID = "tenant-1";

function makePool(overrides: Record<string, { rows: unknown[] }> = {}) {
  const defaults: Record<string, { rows: unknown[] }> = {
    digest_exists: { rows: [] },
    clusters: {
      rows: [
        {
          cluster_id: "c1",
          title: "Top Story",
          summary: "A summary of the top story",
          hero_image_url: null,
          size: 5,
          feed_weight: "prefer",
          folder_name: "Tech",
          feed_title: "Tech News",
          published_at: new Date(),
        },
        {
          cluster_id: "c2",
          title: "Second Story",
          summary: null,
          hero_image_url: null,
          size: 3,
          feed_weight: "neutral",
          folder_name: "Security",
          feed_title: "Security Weekly",
          published_at: new Date(),
        },
      ],
    },
    insert_digest: { rows: [] },
    backlog: { rows: [{ cnt: "0" }] },
    recent_digest: { rows: [{ id: "d1" }] },
    away: { rows: [{ last_active_at: new Date() }] },
  };

  const merged = { ...defaults, ...overrides };

  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM digest") && sql.includes("start_ts")) return merged.digest_exists;
      if (sql.includes("FROM cluster c") || sql.includes("FROM cluster c\n")) {
        if (sql.includes("COUNT")) return merged.backlog;
        return merged.clusters;
      }
      if (sql.includes("INSERT INTO digest")) return merged.insert_digest;
      if (sql.includes("FROM digest") && sql.includes("created_at")) return merged.recent_digest;
      if (sql.includes("last_active_at")) return merged.away;
      return { rows: [] };
    }),
  } as any;
}

// ---- generateDigest ---------------------------------------------------------

describe("generateDigest", () => {
  it("skips if a digest already exists for the window", async () => {
    const pool = makePool({ digest_exists: { rows: [{ id: "existing" }] } });
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("skips if no unread clusters exist in window", async () => {
    const pool = makePool({ clusters: { rows: [] } });
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("creates a digest when clusters are available", async () => {
    const pool = makePool();
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(1);

    // Check the inserted values include tenant_id
    const insertParams = insertCalls[0][1] as unknown[];
    expect(insertParams[0]).toBe(ACCOUNT_ID); // tenant_id
    expect(typeof insertParams[1]).toBe("string"); // start_ts
    expect(typeof insertParams[2]).toBe("string"); // end_ts
    expect(insertParams[3]).toContain("Digest for"); // title
    expect(typeof insertParams[4]).toBe("string"); // body
    expect(typeof insertParams[5]).toBe("string"); // entries_json
  });

  it("partitions clusters into sections (top_picks first)", async () => {
    // Create 12 clusters to fill all sections
    const rows = Array.from({ length: 12 }, (_, i) => ({
      cluster_id: `c${i}`,
      title: `Story ${i}`,
      summary: i % 2 === 0 ? `Summary for story ${i}` : null,
      hero_image_url: null,
      size: 12 - i,
      feed_weight: "neutral",
      folder_name: "Tech",
      feed_title: `Source ${i}`,
      published_at: new Date(),
    }));

    const pool = makePool({ clusters: { rows } });
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );

    const entriesJson = JSON.parse(insertCalls[0][1][5] as string);
    const topPicks = entriesJson.filter((e: any) => e.section === "top_picks");
    const bigStories = entriesJson.filter((e: any) => e.section === "big_stories");
    const quickScan = entriesJson.filter((e: any) => e.section === "quick_scan");

    expect(topPicks).toHaveLength(5);
    expect(bigStories).toHaveLength(5);
    expect(quickScan).toHaveLength(2);
  });

  it("includes summary one-liners truncated to 120 chars", async () => {
    const longSummary = "A".repeat(200);
    const pool = makePool({
      clusters: {
        rows: [
          {
            cluster_id: "c1",
            title: "Story",
            summary: longSummary,
            hero_image_url: null,
            size: 1,
            feed_weight: "neutral",
            folder_name: "Tech",
            feed_title: "Tech News",
            published_at: new Date(),
          },
        ],
      },
    });

    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    const entriesJson = JSON.parse(insertCalls[0][1][5] as string);
    expect(entriesJson[0].oneLiner.length).toBeLessThanOrEqual(120);
    expect(entriesJson[0].oneLiner).toMatch(/\.\.\.$/);
  });

  it("builds markdown body with section headers", async () => {
    const pool = makePool();
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    const body = insertCalls[0][1][4] as string;
    expect(body).toContain("## Top Picks");
  });

  it("builds body with only top_picks when fewer than 6 clusters", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      cluster_id: `c${i}`,
      title: `Story ${i}`,
      summary: `Summary for story ${i}`,
      hero_image_url: null,
      size: 3 - i,
      feed_weight: "neutral",
      folder_name: "Tech",
      feed_title: `Source ${i}`,
      published_at: new Date(),
    }));

    const pool = makePool({ clusters: { rows } });
    await generateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    const body = insertCalls[0][1][4] as string;
    expect(body).toContain("## Top Picks");
    expect(body).not.toContain("## Big Stories");
    expect(body).not.toContain("## Quick Scan");
  });
});

// ---- maybeGenerateDigest ----------------------------------------------------

describe("maybeGenerateDigest", () => {
  it("does not generate when backlog is low and recent digest exists", async () => {
    const pool = makePool({
      backlog: { rows: [{ cnt: "5" }] },
      recent_digest: { rows: [{ id: "d1" }] },
    });

    await maybeGenerateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("generates when backlog reaches threshold (>= 50)", async () => {
    const pool = makePool({
      backlog: { rows: [{ cnt: "55" }] },
    });

    await maybeGenerateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("generates when no recent digest and backlog > 0", async () => {
    const pool = makePool({
      backlog: { rows: [{ cnt: "10" }] },
      recent_digest: { rows: [] },
    });

    await maybeGenerateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(1);
  });

  it("does not generate when no recent digest but backlog is 0", async () => {
    const pool = makePool({
      backlog: { rows: [{ cnt: "0" }] },
      recent_digest: { rows: [] },
    });

    await maybeGenerateDigest(pool, ACCOUNT_ID);

    const insertCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("INSERT INTO digest"),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
