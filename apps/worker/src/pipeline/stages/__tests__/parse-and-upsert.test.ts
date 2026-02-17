import { describe, expect, it, vi } from "vitest";
import { parseAndUpsert } from "../parse-and-upsert.js";
import type { ParsedItem } from "../poll-feed.js";

// ---- Helpers ----------------------------------------------------------------

const TENANT_ID = "tenant-1";

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    guid: "guid-1",
    url: "https://example.com/article",
    title: "Test Article",
    summary: "A test summary",
    publishedAt: new Date("2024-01-01T00:00:00Z"),
    author: "Test Author",
    heroImageUrl: null,
    ...overrides,
  };
}

function makePool(queryMock?: ReturnType<typeof vi.fn>) {
  return {
    query:
      queryMock ??
      vi.fn(async () => ({
        rows: [
          {
            id: "item-1",
            feed_id: "feed-1",
            url: "https://example.com/article",
            canonical_url: "https://example.com/article",
            title: "Test Article",
            summary: "A test summary",
            published_at: new Date("2024-01-01T00:00:00Z"),
            hero_image_url: null,
            is_new: true,
          },
        ],
      })),
  } as any;
}

// ---- parseAndUpsert ---------------------------------------------------------

describe("parseAndUpsert", () => {
  it("returns empty result for empty items array", async () => {
    const pool = makePool();
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", []);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("upserts items with guid using batch guid path", async () => {
    const pool = makePool();
    const items = [makeItem({ guid: "guid-1" })];

    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(1);
    expect(result.succeeded[0]!.id).toBe("item-1");
    expect(result.succeeded[0]!.isNew).toBe(true);

    // Check SQL contains tenant-aware guid conflict clause
    const sql = pool.query.mock.calls[0]![0];
    expect(sql).toContain("ON CONFLICT (tenant_id, feed_id, guid)");
  });

  it("upserts items without guid using canonical url path", async () => {
    const pool = makePool();
    const items = [makeItem({ guid: null })];

    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(1);

    const sql = pool.query.mock.calls[0]![0];
    expect(sql).toContain("ON CONFLICT (tenant_id, feed_id, canonical_url, published_at)");
  });

  it("splits items by dedup strategy (guid vs canonical)", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1",
              feed_id: "feed-1",
              url: "https://example.com/a",
              canonical_url: "https://example.com/a",
              title: "A",
              summary: null,
              published_at: new Date(),
              hero_image_url: null,
              is_new: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-2",
              feed_id: "feed-1",
              url: "https://example.com/b",
              canonical_url: "https://example.com/b",
              title: "B",
              summary: null,
              published_at: new Date(),
              hero_image_url: null,
              is_new: true,
            },
          ],
        }),
    } as any;

    const items = [
      makeItem({ guid: "g1", url: "https://example.com/a", title: "A" }),
      makeItem({ guid: null, url: "https://example.com/b", title: "B" }),
    ];

    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);
    expect(result.succeeded).toHaveLength(2);

    // First call: guid-based
    expect(pool.query.mock.calls[0]![0]).toContain("ON CONFLICT (tenant_id, feed_id, guid)");
    // Second call: canonical-based
    expect(pool.query.mock.calls[1]![0]).toContain(
      "ON CONFLICT (tenant_id, feed_id, canonical_url, published_at)",
    );
  });

  it("falls back to individual inserts when batch guid upsert fails", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1",
              is_new: true,
            },
          ],
        }),
    } as any;

    const items = [makeItem({ guid: "g1" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    // First call was batch (failed), second was individual fallback
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("falls back to individual inserts when batch canonical upsert fails", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockResolvedValueOnce({
          rows: [
            {
              id: "item-1",
              is_new: true,
            },
          ],
        }),
    } as any;

    const items = [makeItem({ guid: null })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it("records individual insert failures in the failed array", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockRejectedValueOnce(new Error("individual also failed")),
    } as any;

    const items = [makeItem({ guid: "g1" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error.message).toBe("individual also failed");
  });

  it("maps returned rows to UpsertedItem shape", async () => {
    const pool = makePool(
      vi.fn().mockResolvedValue({
        rows: [
          {
            id: "item-1",
            feed_id: "feed-1",
            url: "https://example.com/article",
            canonical_url: "https://example.com/article",
            title: "Test Article",
            summary: "A summary",
            published_at: new Date("2024-01-01T00:00:00Z"),
            hero_image_url: "https://example.com/img.jpg",
            is_new: false,
          },
        ],
      }),
    );

    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", [makeItem()]);

    expect(result.succeeded[0]).toEqual({
      id: "item-1",
      feedId: "feed-1",
      url: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      title: "Test Article",
      summary: "A summary",
      publishedAt: new Date("2024-01-01T00:00:00Z"),
      heroImageUrl: "https://example.com/img.jpg",
      isNew: false,
    });
  });

  it("records individual canonical insert failures in the failed array", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch canonical failed"))
        .mockRejectedValueOnce(new Error("individual canonical also failed")),
    } as any;

    const items = [makeItem({ guid: null })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error.message).toBe("individual canonical also failed");
  });

  it("wraps non-Error thrown values in Error for failed items (guid path)", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockRejectedValueOnce("string error"),
    } as any;

    const items = [makeItem({ guid: "g1" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toBeInstanceOf(Error);
    expect(result.failed[0]!.error.message).toBe("string error");
  });

  it("wraps non-Error thrown values in Error for failed items (canonical path)", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch canonical failed"))
        .mockRejectedValueOnce("string error from canonical"),
    } as any;

    const items = [makeItem({ guid: null })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toBeInstanceOf(Error);
    expect(result.failed[0]!.error.message).toBe("string error from canonical");
  });

  it("returns null from individual guid upsert when query returns no rows", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const items = [makeItem({ guid: "g1" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("handles items with empty URL in guid path", async () => {
    const pool = makePool(
      vi.fn().mockResolvedValue({
        rows: [
          {
            id: "item-1",
            feed_id: "feed-1",
            url: "",
            canonical_url: "",
            title: "Empty URL Item",
            summary: null,
            published_at: new Date("2024-01-01T00:00:00Z"),
            hero_image_url: null,
            is_new: true,
          },
        ],
      }),
    );

    const items = [makeItem({ guid: "g1", url: "" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);
    expect(result.succeeded).toHaveLength(1);
  });

  it("logs error when there are failed items", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockRejectedValueOnce(new Error("individual failed")),
    } as any;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const items = [makeItem({ guid: "g1" })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.failed).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("some items failed"),
      expect.any(Object),
    );
    errorSpy.mockRestore();
  });

  it("returns null from individual canonical upsert when query returns no rows", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("batch failed"))
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const items = [makeItem({ guid: null })];
    const result = await parseAndUpsert(pool, TENANT_ID, "feed-1", items);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});
