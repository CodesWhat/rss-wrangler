import { describe, expect, it, vi } from "vitest";
import { FeedService, getCircuitCooldownHours } from "../feed-service.js";

// ---- Helpers ----------------------------------------------------------------

const ACCOUNT_ID = "tenant-1";

function makePool() {
  return {
    query: vi.fn(),
  } as any;
}

// ---- FeedService ------------------------------------------------------------

describe("FeedService", () => {
  describe("fetchDueFeeds", () => {
    it("returns mapped feed objects with tenant awareness", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({
        rows: [
          {
            id: "f1",
            tenant_id: ACCOUNT_ID,
            url: "https://example.com/feed.xml",
            title: "Test Feed",
            site_url: "https://example.com",
            folder_id: "folder-1",
            weight: "neutral",
            etag: '"abc"',
            last_modified: "Mon, 01 Jan 2024 00:00:00 GMT",
            last_polled_at: new Date("2024-01-01"),
            classification_status: "classified",
          },
        ],
      });

      const service = new FeedService(pool);
      const feeds = await service.fetchDueFeeds(ACCOUNT_ID, 10);

      expect(feeds).toHaveLength(1);
      expect(feeds[0]).toEqual({
        id: "f1",
        accountId: ACCOUNT_ID,
        url: "https://example.com/feed.xml",
        title: "Test Feed",
        siteUrl: "https://example.com",
        folderId: "folder-1",
        weight: "neutral",
        etag: '"abc"',
        lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
        lastPolledAt: new Date("2024-01-01"),
        backfillSince: null,
        classificationStatus: "classified",
      });
    });

    it("passes accountId and limit to query", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.fetchDueFeeds(ACCOUNT_ID, 5);

      expect(pool.query).toHaveBeenCalledTimes(1);
      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[1]).toEqual([ACCOUNT_ID, 5]);
    });

    it("queries only non-muted feeds ordered by last_polled_at", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.fetchDueFeeds(ACCOUNT_ID, 10);

      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain("muted = FALSE");
      expect(sql).toContain("ORDER BY last_polled_at ASC NULLS FIRST");
    });

    it("excludes feeds with active circuit breaker", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.fetchDueFeeds(ACCOUNT_ID, 10);

      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain("circuit_open_until");
    });

    it("returns empty array when no feeds are due", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      const feeds = await service.fetchDueFeeds(ACCOUNT_ID, 10);

      expect(feeds).toEqual([]);
    });

    it("handles null site_url", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({
        rows: [
          {
            id: "f1",
            tenant_id: ACCOUNT_ID,
            url: "https://example.com/feed.xml",
            title: "Test",
            site_url: null,
            folder_id: "folder-1",
            weight: "prefer",
            etag: null,
            last_modified: null,
            last_polled_at: null,
            classification_status: "pending_classification",
          },
        ],
      });

      const service = new FeedService(pool);
      const feeds = await service.fetchDueFeeds(ACCOUNT_ID, 10);

      expect(feeds[0]!.siteUrl).toBeNull();
      expect(feeds[0]!.etag).toBeNull();
      expect(feeds[0]!.lastModified).toBeNull();
      expect(feeds[0]!.lastPolledAt).toBeNull();
    });
  });

  describe("updateLastPolled", () => {
    it("updates feed with etag and lastModified for specific account", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.updateLastPolled(ACCOUNT_ID, "f1", '"new-etag"', "Mon, 01 Jan 2024 00:00:00 GMT");

      expect(pool.query).toHaveBeenCalledTimes(1);
      const callArgs = pool.query.mock.calls[0];
      expect(callArgs[0]).toContain("UPDATE feed");
      expect(callArgs[0]).toContain("last_polled_at = NOW()");
      expect(callArgs[0]).toContain("tenant_id");
      expect(callArgs[1]).toEqual(["f1", '"new-etag"', "Mon, 01 Jan 2024 00:00:00 GMT", ACCOUNT_ID]);
    });

    it("handles null etag and lastModified", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.updateLastPolled(ACCOUNT_ID, "f1", null, null);

      expect(pool.query.mock.calls[0][1]).toEqual(["f1", null, null, ACCOUNT_ID]);
    });
  });

  describe("recordFeedSuccess", () => {
    it("resets circuit breaker state", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({ rows: [] });

      const service = new FeedService(pool);
      await service.recordFeedSuccess(ACCOUNT_ID, "f1");

      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain("consecutive_failures = 0");
      expect(sql).toContain("circuit_open_until = NULL");
    });
  });

  describe("listAccountIds", () => {
    it("returns all account IDs", async () => {
      const pool = makePool();
      pool.query.mockResolvedValue({
        rows: [{ id: "t1" }, { id: "t2" }],
      });

      const service = new FeedService(pool);
      const ids = await service.listAccountIds();

      expect(ids).toEqual(["t1", "t2"]);
    });
  });
});

// ---- getCircuitCooldownHours ------------------------------------------------

describe("getCircuitCooldownHours", () => {
  it("returns 0 for fewer than 3 failures", () => {
    expect(getCircuitCooldownHours(0)).toBe(0);
    expect(getCircuitCooldownHours(1)).toBe(0);
    expect(getCircuitCooldownHours(2)).toBe(0);
  });

  it("returns 1 hour for 3 failures", () => {
    expect(getCircuitCooldownHours(3)).toBe(1);
  });

  it("returns 4 hours for 4 failures", () => {
    expect(getCircuitCooldownHours(4)).toBe(4);
  });

  it("returns 12 hours for 5 failures", () => {
    expect(getCircuitCooldownHours(5)).toBe(12);
  });

  it("caps at 24 hours for 6+ failures", () => {
    expect(getCircuitCooldownHours(6)).toBe(24);
    expect(getCircuitCooldownHours(10)).toBe(24);
    expect(getCircuitCooldownHours(100)).toBe(24);
  });
});
