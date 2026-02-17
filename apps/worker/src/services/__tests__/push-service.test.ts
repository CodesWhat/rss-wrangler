import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushConfig } from "../push-service.js";
import { sendNewStoriesNotification } from "../push-service.js";

// ---- Mock web-push ----------------------------------------------------------

const mockSetVapidDetails = vi.fn();
const mockSendNotification = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

// ---- Helpers ----------------------------------------------------------------

const TENANT_ID = "tenant-1";

function makePool(subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }> = []) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT")) {
        return { rows: subscriptions };
      }
      if (sql.includes("DELETE")) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as any;
}

const defaultConfig: PushConfig = {
  vapidPublicKey: "pub-key",
  vapidPrivateKey: "priv-key",
  vapidContact: "mailto:admin@localhost",
};

// ---- sendNewStoriesNotification ---------------------------------------------

describe("sendNewStoriesNotification", () => {
  beforeEach(() => {
    mockSetVapidDetails.mockClear();
    mockSendNotification.mockClear();
  });

  it("returns {sent: 0, failed: 0} when vapid keys are empty", async () => {
    const pool = makePool();
    const result = await sendNewStoriesNotification(
      pool,
      TENANT_ID,
      { vapidPublicKey: "", vapidPrivateKey: "", vapidContact: "" },
      5,
      "Test headline",
    );
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns {sent: 0, failed: 0} when no subscriptions exist", async () => {
    const pool = makePool([]);
    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 5, "Test headline");
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("sends notifications to all subscriptions", async () => {
    const subs = [
      { endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" },
      { endpoint: "https://push.example.com/sub2", p256dh: "key2", auth: "auth2" },
    ];
    const pool = makePool(subs);
    mockSendNotification.mockResolvedValue({});

    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 3, "Breaking news");

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:admin@localhost",
      "pub-key",
      "priv-key",
    );
  });

  it("uses correct singular/plural in notification title", async () => {
    const subs = [{ endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" }];
    const pool = makePool(subs);
    mockSendNotification.mockResolvedValue({});

    await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 1, "Single story");

    const payload = JSON.parse(mockSendNotification.mock.calls[0]![1] as string);
    expect(payload.title).toBe("1 new story");
    expect(payload.body).toBe("Top: Single story");
  });

  it("uses plural for multiple stories", async () => {
    const subs = [{ endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" }];
    const pool = makePool(subs);
    mockSendNotification.mockResolvedValue({});

    await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 5, "Top headline");

    const payload = JSON.parse(mockSendNotification.mock.calls[0]![1] as string);
    expect(payload.title).toBe("5 new stories");
  });

  it("removes expired subscriptions (410)", async () => {
    const subs = [{ endpoint: "https://push.example.com/expired", p256dh: "key1", auth: "auth1" }];
    const pool = makePool(subs);
    mockSendNotification.mockRejectedValue({ statusCode: 410 });

    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 2, "Test");

    expect(result).toEqual({ sent: 0, failed: 1 });

    const deleteCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("DELETE"),
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it("removes not-found subscriptions (404)", async () => {
    const subs = [{ endpoint: "https://push.example.com/gone", p256dh: "key1", auth: "auth1" }];
    const pool = makePool(subs);
    mockSendNotification.mockRejectedValue({ statusCode: 404 });

    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 2, "Test");

    expect(result).toEqual({ sent: 0, failed: 1 });

    const deleteCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("DELETE"),
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it("does not remove subscriptions for other errors", async () => {
    const subs = [{ endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" }];
    const pool = makePool(subs);
    mockSendNotification.mockRejectedValue({ statusCode: 500 });

    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 2, "Test");

    expect(result).toEqual({ sent: 0, failed: 1 });

    const deleteCalls = pool.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("DELETE"),
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it("handles mixed success and failure", async () => {
    const subs = [
      { endpoint: "https://push.example.com/ok", p256dh: "key1", auth: "auth1" },
      { endpoint: "https://push.example.com/fail", p256dh: "key2", auth: "auth2" },
    ];
    const pool = makePool(subs);
    mockSendNotification.mockResolvedValueOnce({}).mockRejectedValueOnce({ statusCode: 500 });

    const result = await sendNewStoriesNotification(pool, TENANT_ID, defaultConfig, 3, "Test");

    expect(result).toEqual({ sent: 1, failed: 1 });
  });
});
