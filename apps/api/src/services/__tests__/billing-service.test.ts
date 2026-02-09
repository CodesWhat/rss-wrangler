import { createHmac } from "node:crypto";
import type { ApiEnv } from "../../config/env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBillingService } from "../billing-service";

function buildEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    NODE_ENV: "test",
    API_PORT: 4000,
    API_HOST: "0.0.0.0",
    API_CORS_ORIGIN: "*",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rss_wrangler",
    AUTH_JWT_SECRET: "a".repeat(48),
    AUTH_USERNAME: "admin",
    AUTH_PASSWORD: "password123",
    APP_BASE_URL: "http://localhost:3000",
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL: "30d",
    PASSWORD_RESET_TOKEN_TTL: "1h",
    EMAIL_VERIFICATION_TOKEN_TTL: "24h",
    REQUIRE_EMAIL_VERIFICATION: false,
    RESEND_API_KEY: undefined,
    EMAIL_FROM: undefined,
    VAPID_PUBLIC_KEY: undefined,
    VAPID_PRIVATE_KEY: undefined,
    LEMON_SQUEEZY_API_BASE_URL: "https://api.lemonsqueezy.com/v1",
    LEMON_SQUEEZY_API_KEY: undefined,
    LEMON_SQUEEZY_STORE_ID: undefined,
    LEMON_SQUEEZY_WEBHOOK_SECRET: undefined,
    LEMON_SQUEEZY_VARIANT_PRO: undefined,
    LEMON_SQUEEZY_VARIANT_PRO_AI: undefined,
    LEMON_SQUEEZY_VARIANT_PRO_ANNUAL: undefined,
    LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL: undefined,
    BILLING_ALERT_WEBHOOK_URL: undefined,
    ...overrides
  };
}

describe("createBillingService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns defaults when tenant subscription row is missing", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    const service = createBillingService(buildEnv(), pool as never, { error: vi.fn(), warn: vi.fn() } as never);
    const result = await service.getOverview("tenant-1");

    expect(result).toEqual({
      planId: "free",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      billingInterval: null,
      cancelAtPeriodEnd: false,
      customerPortalUrl: null,
      checkoutEnabled: false,
      checkoutAvailability: {
        pro: {
          monthly: false,
          annual: false
        },
        pro_ai: {
          monthly: false,
          annual: false
        }
      }
    });
  });

  it("creates a checkout URL when Lemon Squeezy is configured", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ email: "owner@example.com" }] })
    };

    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: {
          attributes: {
            url: "https://checkout.lemonsqueezy.com/buy/example"
          }
        }
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const service = createBillingService(
      buildEnv({
        LEMON_SQUEEZY_API_KEY: "test_key",
        LEMON_SQUEEZY_STORE_ID: "12345",
        LEMON_SQUEEZY_VARIANT_PRO: "111",
        LEMON_SQUEEZY_VARIANT_PRO_AI: "222",
        LEMON_SQUEEZY_VARIANT_PRO_ANNUAL: "333",
        LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL: "444"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.createCheckout({
      tenantId: "tenant-1",
      userId: "user-1",
      planId: "pro",
      interval: "monthly"
    });

    expect(result).toEqual({ ok: true, url: "https://checkout.lemonsqueezy.com/buy/example" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      data: { relationships: { variant: { data: { id: string } } }; attributes: { checkout_data: { custom: { tenant_id: string; user_id: string; plan_id: string } } } };
    };

    expect(requestBody.data.relationships.variant.data.id).toBe("111");
    expect(requestBody.data.attributes.checkout_data.custom).toEqual({
      tenant_id: "tenant-1",
      user_id: "user-1",
      plan_id: "pro",
      billing_interval: "monthly"
    });
  });

  it("creates an annual checkout URL when annual variant is selected", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ email: "owner@example.com" }] })
    };

    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: {
          attributes: {
            url: "https://checkout.lemonsqueezy.com/buy/annual-example"
          }
        }
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const service = createBillingService(
      buildEnv({
        LEMON_SQUEEZY_API_KEY: "test_key",
        LEMON_SQUEEZY_STORE_ID: "12345",
        LEMON_SQUEEZY_VARIANT_PRO: "111",
        LEMON_SQUEEZY_VARIANT_PRO_AI: "222",
        LEMON_SQUEEZY_VARIANT_PRO_ANNUAL: "333",
        LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL: "444"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.createCheckout({
      tenantId: "tenant-1",
      userId: "user-1",
      planId: "pro_ai",
      interval: "annual"
    });

    expect(result).toEqual({ ok: true, url: "https://checkout.lemonsqueezy.com/buy/annual-example" });
    const requestBody = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      data: {
        relationships: { variant: { data: { id: string } } };
        attributes: { checkout_data: { custom: { billing_interval: string } } };
      };
    };

    expect(requestBody.data.relationships.variant.data.id).toBe("444");
    expect(requestBody.data.attributes.checkout_data.custom.billing_interval).toBe("annual");
  });

  it("returns not_found when trying to change subscription without hosted billing row", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    const service = createBillingService(buildEnv({ LEMON_SQUEEZY_API_KEY: "test_key" }), pool as never, {
      error: vi.fn(),
      warn: vi.fn()
    } as never);

    const result = await service.updateSubscription("tenant-1", "cancel");

    expect(result).toEqual({
      ok: false,
      error: "not_found",
      message: "No hosted subscription is available for this account."
    });
  });

  it("updates cancel-at-period-end state via Lemon subscription patch", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            plan_id: "pro",
            status: "active",
            lemon_subscription_id: "sub_123",
            customer_portal_url: null,
            update_payment_method_url: null,
            cancel_at_period_end: false,
            current_period_ends_at: null
          }]
        })
        .mockResolvedValueOnce({ rows: [] })
    };

    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        data: {
          attributes: {
            status: "active",
            cancelled: true,
            ends_at: "2026-03-01T00:00:00.000Z",
            urls: {
              customer_portal: "https://portal.example.com",
              update_payment_method: "https://portal.example.com/payment"
            }
          }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const service = createBillingService(buildEnv({ LEMON_SQUEEZY_API_KEY: "test_key" }), pool as never, {
      error: vi.fn(),
      warn: vi.fn()
    } as never);

    const result = await service.updateSubscription("tenant-1", "cancel");

    expect(result).toEqual({
      ok: true,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEndsAt: "2026-03-01T00:00:00.000Z",
      customerPortalUrl: "https://portal.example.com"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body)) as {
      data: { attributes: { cancelled: boolean } };
    };
    expect(body.data.attributes.cancelled).toBe(true);

    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1] as [string, unknown[]];
    expect(updateCall[0]).toContain("UPDATE tenant_plan_subscription");
    expect(updateCall[1][2]).toBe(true);
  });

  it("returns current state without provider calls when action already applied", async () => {
    const currentPeriodEndsAt = new Date("2026-02-20T12:00:00.000Z");
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          plan_id: "pro",
          status: "active",
          lemon_subscription_id: "sub_123",
          customer_portal_url: "https://portal.example.com",
          update_payment_method_url: "https://portal.example.com/payment",
          cancel_at_period_end: true,
          current_period_ends_at: currentPeriodEndsAt
        }]
      })
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const service = createBillingService(buildEnv({ LEMON_SQUEEZY_API_KEY: "test_key" }), pool as never, {
      error: vi.fn(),
      warn: vi.fn()
    } as never);

    const result = await service.updateSubscription("tenant-1", "cancel");

    expect(result).toEqual({
      ok: true,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEndsAt: currentPeriodEndsAt.toISOString(),
      customerPortalUrl: "https://portal.example.com"
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("rejects webhook payloads with invalid signatures", async () => {
    const pool = {
      query: vi.fn()
    };

    const service = createBillingService(
      buildEnv({ LEMON_SQUEEZY_WEBHOOK_SECRET: "secret" }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.processWebhook("{}", "invalid");

    expect(result).toEqual({
      ok: false,
      error: "invalid_signature",
      message: "Webhook signature verification failed."
    });
  });

  it("sends alert webhook on signature failure when alerting is configured", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }] })
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const service = createBillingService(
      buildEnv({
        LEMON_SQUEEZY_WEBHOOK_SECRET: "secret",
        BILLING_ALERT_WEBHOOK_URL: "https://alerts.example.com/billing"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.processWebhook("{}", "invalid");

    expect(result).toEqual({
      ok: false,
      error: "invalid_signature",
      message: "Webhook signature verification failed."
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://alerts.example.com/billing");
    expect(init.method).toBe("POST");
  });

  it("marks duplicate webhook payloads as ignored", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ exists: 1 }] })
    };

    const payload = JSON.stringify({
      meta: { event_name: "subscription_updated", custom_data: { tenant_id: "tenant-1" } },
      data: { id: "sub_123", attributes: { status: "active" } }
    });
    const signature = createHmac("sha256", "secret").update(payload, "utf8").digest("hex");

    const service = createBillingService(
      buildEnv({ LEMON_SQUEEZY_WEBHOOK_SECRET: "secret" }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.processWebhook(payload, signature);

    expect(result).toEqual({ ok: true, duplicate: true, status: "ignored", eventName: "subscription_updated" });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("downgrades to free on subscription_expired webhook", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
    };

    const payload = JSON.stringify({
      meta: { event_name: "subscription_expired", custom_data: { tenant_id: "tenant-1" } },
      data: {
        id: "sub_123",
        attributes: {
          status: "expired",
          variant_id: "111",
          customer_id: "cust_1",
          order_id: "ord_1",
          cancelled: true,
          ends_at: "2026-02-01T00:00:00.000Z",
          urls: { customer_portal: "https://portal.example.com" }
        }
      }
    });
    const signature = createHmac("sha256", "secret").update(payload, "utf8").digest("hex");

    const service = createBillingService(
      buildEnv({
        LEMON_SQUEEZY_WEBHOOK_SECRET: "secret",
        LEMON_SQUEEZY_VARIANT_PRO: "111",
        LEMON_SQUEEZY_VARIANT_PRO_AI: "222"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.processWebhook(payload, signature);

    expect(result).toEqual({ ok: true, duplicate: false, status: "processed", eventName: "subscription_expired" });

    const upsertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1] as [string, unknown[]];
    expect(upsertCall[0]).toContain("INSERT INTO tenant_plan_subscription");
    expect(upsertCall[1][1]).toBe("free");
    expect(upsertCall[1][2]).toBe("canceled");
  });

  it("ignores webhook events with unknown variant ids and avoids unintended free downgrade", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = JSON.stringify({
      meta: { event_name: "subscription_updated", custom_data: { tenant_id: "tenant-1" } },
      data: {
        id: "sub_123",
        attributes: {
          status: "active",
          variant_id: "999999",
          customer_id: "cust_1",
          order_id: "ord_1",
          cancelled: false
        }
      }
    });
    const signature = createHmac("sha256", "secret").update(payload, "utf8").digest("hex");

    const service = createBillingService(
      buildEnv({
        LEMON_SQUEEZY_WEBHOOK_SECRET: "secret",
        LEMON_SQUEEZY_VARIANT_PRO: "111",
        LEMON_SQUEEZY_VARIANT_PRO_AI: "222",
        BILLING_ALERT_WEBHOOK_URL: "https://alerts.example.com/billing"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.processWebhook(payload, signature);

    expect(result).toEqual({ ok: true, duplicate: false, status: "ignored", eventName: "subscription_updated" });
    expect(pool.query).toHaveBeenCalledTimes(2);
    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[1] as [string, unknown[]];
    expect(insertCall[0]).toContain("INSERT INTO billing_webhook_event");
    expect(insertCall[1][4]).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
