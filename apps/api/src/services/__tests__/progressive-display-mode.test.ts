import { describe, expect, it } from "vitest";
import { computeDisplayMode } from "../postgres-store";

describe("computeDisplayMode", () => {
  const freshHours = 6;
  const agingDays = 3;

  it("returns 'full' when feature is disabled regardless of age", () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeDisplayMode(oldDate, freshHours, agingDays, false)).toBe("full");
  });

  it("returns 'full' for items younger than freshHours", () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    expect(computeDisplayMode(recent, freshHours, agingDays, true)).toBe("full");
  });

  it("returns 'full' for items published just now", () => {
    const now = new Date().toISOString();
    expect(computeDisplayMode(now, freshHours, agingDays, true)).toBe("full");
  });

  it("returns 'summary' for items between freshHours and agingDays", () => {
    const aging = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    expect(computeDisplayMode(aging, freshHours, agingDays, true)).toBe("summary");
  });

  it("returns 'summary' for items just past freshHours boundary", () => {
    const justPast = new Date(Date.now() - (freshHours * 60 * 60 * 1000 + 1000)).toISOString();
    expect(computeDisplayMode(justPast, freshHours, agingDays, true)).toBe("summary");
  });

  it("returns 'headline' for items older than agingDays", () => {
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    expect(computeDisplayMode(old, freshHours, agingDays, true)).toBe("headline");
  });

  it("returns 'headline' for items just past agingDays boundary", () => {
    const justPast = new Date(Date.now() - (agingDays * 24 * 60 * 60 * 1000 + 1000)).toISOString();
    expect(computeDisplayMode(justPast, freshHours, agingDays, true)).toBe("headline");
  });

  it("respects custom freshHours thresholds", () => {
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    // With 12-hour fresh window, 9 hours ago is still fresh
    expect(computeDisplayMode(nineHoursAgo, 12, agingDays, true)).toBe("full");
    // With 6-hour fresh window, 9 hours ago is aging
    expect(computeDisplayMode(nineHoursAgo, 6, agingDays, true)).toBe("summary");
  });

  it("respects custom agingDays thresholds", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    // With 1-day aging, 2 days is headline
    expect(computeDisplayMode(twoDaysAgo, freshHours, 1, true)).toBe("headline");
    // With 3-day aging, 2 days is still summary
    expect(computeDisplayMode(twoDaysAgo, freshHours, 3, true)).toBe("summary");
  });

  it("handles edge case: freshHours = agingDays boundary", () => {
    // When freshHours=24 and agingDays=1, both equal 24h
    // An item at exactly 24h should be "summary" (ageMs < agingMs is false at boundary)
    const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(computeDisplayMode(exactly24h, 24, 1, true)).toBe("headline");
  });
});
