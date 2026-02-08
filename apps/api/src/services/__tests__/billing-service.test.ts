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
      cancelAtPeriodEnd: false,
      customerPortalUrl: null,
      checkoutEnabled: false
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
        LEMON_SQUEEZY_VARIANT_PRO_AI: "222"
      }),
      pool as never,
      { error: vi.fn(), warn: vi.fn() } as never
    );

    const result = await service.createCheckout({
      tenantId: "tenant-1",
      userId: "user-1",
      planId: "pro"
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
      plan_id: "pro"
    });
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
});
