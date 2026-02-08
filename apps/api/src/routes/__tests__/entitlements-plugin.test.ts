import { describe, expect, it, vi } from "vitest";
import { getAccountEntitlements } from "../../plugins/entitlements.js";

describe("getAccountEntitlements", () => {
  it("returns free defaults when tenant has no subscription row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "12" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ usage_date: "2026-02-08" }] });

    const result = await getAccountEntitlements({ query }, "tenant-1");

    expect(result).toEqual({
      planId: "free",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      feedLimit: 50,
      itemsPerDayLimit: 500,
      searchMode: "title_source",
      minPollMinutes: 60,
      usage: {
        date: "2026-02-08",
        itemsIngested: 0,
        feeds: 12
      }
    });
  });

  it("maps pro_ai rows and preserves usage values", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{
          plan_id: "pro_ai",
          status: "trialing",
          trial_ends_at: new Date("2026-02-20T00:00:00.000Z"),
          current_period_ends_at: new Date("2026-03-01T00:00:00.000Z")
        }]
      })
      .mockResolvedValueOnce({ rows: [{ count: "85" }] })
      .mockResolvedValueOnce({ rows: [{ usage_date: "2026-02-08", items_ingested_count: 142 }] })
      .mockResolvedValueOnce({ rows: [{ usage_date: "2026-02-08" }] });

    const result = await getAccountEntitlements({ query }, "tenant-1");

    expect(result).toEqual({
      planId: "pro_ai",
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-02-20T00:00:00.000Z",
      currentPeriodEndsAt: "2026-03-01T00:00:00.000Z",
      feedLimit: null,
      itemsPerDayLimit: null,
      searchMode: "full_text",
      minPollMinutes: 10,
      usage: {
        date: "2026-02-08",
        itemsIngested: 142,
        feeds: 85
      }
    });
  });
});
