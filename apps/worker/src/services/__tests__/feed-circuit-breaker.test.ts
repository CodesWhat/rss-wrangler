import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { FeedService, getCircuitCooldownHours } from "../feed-service.js";

function createPoolWithQuery(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

// ─── getCircuitCooldownHours ─────────────────────────────────────────────────

describe("getCircuitCooldownHours", () => {
  it("returns 0 for 1 failure (no circuit break)", () => {
    expect(getCircuitCooldownHours(1)).toBe(0);
  });

  it("returns 0 for 2 failures (no circuit break)", () => {
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

  it("returns 24 hours (cap) for 6 failures", () => {
    expect(getCircuitCooldownHours(6)).toBe(24);
  });

  it("returns 24 hours (cap) for 10 failures", () => {
    expect(getCircuitCooldownHours(10)).toBe(24);
  });

  it("returns 0 for 0 failures", () => {
    expect(getCircuitCooldownHours(0)).toBe(0);
  });
});

// ─── fetchDueFeeds excludes open circuits ────────────────────────────────────

describe("fetchDueFeeds", () => {
  it("query includes circuit_open_until filter", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.fetchDueFeeds("account-1", 10);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("circuit_open_until IS NULL OR circuit_open_until <= NOW()");
  });
});

// ─── recordFeedSuccess ───────────────────────────────────────────────────────

describe("recordFeedSuccess", () => {
  it("resets consecutive_failures and circuit_open_until", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedSuccess("account-1", "feed-1");

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("consecutive_failures = 0");
    expect(sql).toContain("circuit_open_until = NULL");
    expect(sql).toContain("last_failure_reason = NULL");
    expect(query.mock.calls[0]![1]).toEqual(["feed-1", "account-1"]);
  });
});

// ─── recordFeedFailure ───────────────────────────────────────────────────────

describe("recordFeedFailure", () => {
  it("increments failures and does not open circuit for first 2 failures", async () => {
    const query = vi
      .fn()
      // First call: UPDATE ... RETURNING consecutive_failures
      .mockResolvedValueOnce({ rows: [{ consecutive_failures: 1 }] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "HTTP 500");

    // Only one query (increment), no circuit open query since cooldown is 0
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("consecutive_failures + 1");
    expect(sql).toContain("last_failure_reason");
  });

  it("opens circuit with 1 hour cooldown at 3 failures", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ consecutive_failures: 3 }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "HTTP 404");

    expect(query).toHaveBeenCalledTimes(2);
    const circuitSql = query.mock.calls[1]![0] as string;
    expect(circuitSql).toContain("circuit_open_until");
    expect(circuitSql).toContain("make_interval");
    // The hours parameter should be 1
    expect(query.mock.calls[1]![1]).toEqual(["feed-1", "account-1", 1]);
  });

  it("opens circuit with 4 hour cooldown at 4 failures", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ consecutive_failures: 4 }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "timeout");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![1]).toEqual(["feed-1", "account-1", 4]);
  });

  it("opens circuit with 12 hour cooldown at 5 failures", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ consecutive_failures: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "parse error");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![1]).toEqual(["feed-1", "account-1", 12]);
  });

  it("caps circuit at 24 hours for 6+ failures", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ consecutive_failures: 8 }] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "DNS failure");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]![1]).toEqual(["feed-1", "account-1", 24]);
  });

  it("stores the failure reason", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ consecutive_failures: 1 }] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.recordFeedFailure("account-1", "feed-1", "HTTP 503 Service Unavailable");

    expect(query.mock.calls[0]![1]).toEqual([
      "feed-1",
      "account-1",
      "HTTP 503 Service Unavailable",
    ]);
  });
});

// ─── resetCircuitBreaker ─────────────────────────────────────────────────────

describe("resetCircuitBreaker", () => {
  it("resets all circuit breaker state", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);
    const service = new FeedService(pool);

    await service.resetCircuitBreaker("account-1", "feed-1");

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("consecutive_failures = 0");
    expect(sql).toContain("circuit_open_until = NULL");
    expect(sql).toContain("last_failure_reason = NULL");
    expect(query.mock.calls[0]![1]).toEqual(["feed-1", "account-1"]);
  });
});
