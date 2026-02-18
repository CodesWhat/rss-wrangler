import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  getPipelineEntitlements,
  incrementDailyIngestionUsage,
  isPollAllowed,
  releaseDailyIngestionBudget,
  reserveDailyIngestionBudget,
} from "../entitlements.js";

function createPoolWithQuery(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

describe("isPollAllowed", () => {
  it("allows polling when feed has never been polled", () => {
    expect(isPollAllowed(null, 60, new Date("2026-02-08T12:00:00.000Z"))).toBe(true);
  });

  it("blocks polling before the plan interval has elapsed", () => {
    const now = new Date("2026-02-08T12:00:00.000Z");
    const lastPolledAt = new Date("2026-02-08T11:30:00.000Z");
    expect(isPollAllowed(lastPolledAt, 60, now)).toBe(false);
  });

  it("allows polling once the plan interval is satisfied", () => {
    const now = new Date("2026-02-08T12:00:00.000Z");
    const lastPolledAt = new Date("2026-02-08T10:45:00.000Z");
    expect(isPollAllowed(lastPolledAt, 60, now)).toBe(true);
  });
});

describe("getPipelineEntitlements", () => {
  it("falls back to free defaults when no plan row exists", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);

    const entitlements = await getPipelineEntitlements(pool, "account-1");

    expect(entitlements).toEqual({
      planId: "free",
      itemsPerDayLimit: 500,
      minPollMinutes: 60,
    });
  });

  it("maps pro plan rows to pro defaults", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ plan_id: "pro" }],
    });
    const pool = createPoolWithQuery(query);

    const entitlements = await getPipelineEntitlements(pool, "account-1");

    expect(entitlements).toEqual({
      planId: "pro",
      itemsPerDayLimit: null,
      minPollMinutes: 10,
    });
  });
});

describe("daily usage budget functions", () => {
  it("returns 0 without querying when no reservation is requested", async () => {
    const query = vi.fn();
    const pool = createPoolWithQuery(query);

    await expect(reserveDailyIngestionBudget(pool, "account-1", 500, 0)).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns reserved slot count from SQL allocation", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // seed INSERT
      .mockResolvedValueOnce({ rows: [{ allowed: 37 }] }); // allocation UPDATE
    const pool = createPoolWithQuery(query);

    await expect(reserveDailyIngestionBudget(pool, "account-1", 500, 100)).resolves.toBe(37);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("skips release query for non-positive releases", async () => {
    const query = vi.fn();
    const pool = createPoolWithQuery(query);

    await releaseDailyIngestionBudget(pool, "account-1", 0);
    expect(query).not.toHaveBeenCalled();
  });

  it("executes release query when release budget is positive", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);

    await releaseDailyIngestionBudget(pool, "account-1", 15);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("skips increment query for non-positive increments", async () => {
    const query = vi.fn();
    const pool = createPoolWithQuery(query);

    await incrementDailyIngestionUsage(pool, "account-1", 0);
    expect(query).not.toHaveBeenCalled();
  });

  it("executes increment query for positive increments", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = createPoolWithQuery(query);

    await incrementDailyIngestionUsage(pool, "account-1", 25);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
