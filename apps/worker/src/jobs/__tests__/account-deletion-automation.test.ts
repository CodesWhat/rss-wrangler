import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { processDueAccountDeletions } from "../account-deletion-automation";

describe("processDueAccountDeletions", () => {
  it("processes due requests and purges an empty tenant", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { request_id: "req-1", user_id: "user-1", user_deleted: true },
          { request_id: "req-2", user_id: "user-2", user_deleted: false }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "tenant-1" }] }) // DELETE tenant
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const client = { query } as unknown as PoolClient;

    const result = await processDueAccountDeletions(client, {
      tenantId: "tenant-1",
      batchSize: 2,
      graceWindowDays: 7
    });

    expect(result).toEqual({
      processed: 2,
      deletedUsers: 1,
      tenantPurged: true,
      requestIds: ["req-1", "req-2"]
    });

    expect(query).toHaveBeenCalledTimes(4);
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(4, "COMMIT");

    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("WITH due AS");
    expect(params).toEqual(["tenant-1", 2, "7 days", 7]);
  });

  it("rolls back when processing fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("db exploded"))
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const client = { query } as unknown as PoolClient;

    await expect(
      processDueAccountDeletions(client, {
        tenantId: "tenant-1"
      })
    ).rejects.toThrow("db exploded");

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");
  });
});
