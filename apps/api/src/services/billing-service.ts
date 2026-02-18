import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingInterval,
  BillingSubscriptionAction,
  HostedPlanId,
  PlanId,
  PlanSubscriptionStatus,
} from "@rss-wrangler/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ApiEnv } from "../config/env";

const BILLING_PROVIDER = "lemon_squeezy";

const lemonWebhookSchema = z
  .object({
    meta: z
      .object({
        event_name: z.string().min(1),
        custom_data: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).transform((value) => String(value)),
        attributes: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

const lemonCheckoutResponseSchema = z.object({
  data: z.object({
    attributes: z.object({
      url: z.string().url(),
    }),
  }),
});

const lemonSubscriptionResponseSchema = z.object({
  data: z.object({
    attributes: z.object({
      urls: z
        .object({
          customer_portal: z.string().url().nullable().optional(),
          update_payment_method: z.string().url().nullable().optional(),
        })
        .optional(),
    }),
  }),
});

const lemonSubscriptionMutationResponseSchema = z.object({
  data: z.object({
    attributes: z.record(z.string(), z.unknown()),
  }),
});

interface BillingOverview {
  planId: PlanId;
  subscriptionStatus: PlanSubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  billingInterval: BillingInterval | null;
  cancelAtPeriodEnd: boolean;
  customerPortalUrl: string | null;
  checkoutEnabled: boolean;
  checkoutAvailability: Record<HostedPlanId, Record<BillingInterval, boolean>>;
}

type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: "not_configured" | "provider_error"; message: string };

type PortalResult =
  | { ok: true; url: string }
  | { ok: false; error: "not_found" | "not_configured" | "provider_error"; message: string };

type SubscriptionActionResult =
  | {
      ok: true;
      subscriptionStatus: PlanSubscriptionStatus;
      cancelAtPeriodEnd: boolean;
      currentPeriodEndsAt: string | null;
      customerPortalUrl: string | null;
    }
  | { ok: false; error: "not_found" | "not_configured" | "provider_error"; message: string };

type WebhookResult =
  | { ok: true; duplicate: boolean; status: "processed" | "ignored"; eventName: string }
  | {
      ok: false;
      error: "not_configured" | "invalid_signature" | "invalid_payload";
      message: string;
    };

interface AccountSubscriptionRow {
  plan_id: string;
  status: string;
  trial_ends_at: Date | null;
  current_period_ends_at: Date | null;
  cancel_at_period_end: boolean;
  customer_portal_url: string | null;
  lemon_subscription_id: string | null;
  lemon_variant_id: string | null;
}

interface LemonUpsertPayload {
  planId: PlanId;
  subscriptionStatus: PlanSubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  lemonSubscriptionId: string;
  lemonCustomerId: string | null;
  lemonOrderId: string | null;
  lemonVariantId: string | null;
  customerPortalUrl: string | null;
  updatePaymentMethodUrl: string | null;
}

interface BillingService {
  getOverview: (accountId: string) => Promise<BillingOverview>;
  createCheckout: (input: {
    accountId: string;
    /** @deprecated Use accountId instead */
    tenantId?: string;
    userId: string;
    planId: HostedPlanId;
    interval: BillingInterval;
  }) => Promise<CheckoutResult>;
  getPortal: (accountId: string) => Promise<PortalResult>;
  updateSubscription: (
    accountId: string,
    action: BillingSubscriptionAction,
  ) => Promise<SubscriptionActionResult>;
  processWebhook: (rawBody: string, signatureHeader: string | undefined) => Promise<WebhookResult>;
}

function normalizePlanId(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "pro_ai") {
    return raw;
  }
  return "free";
}

function normalizePlanStatus(raw: string | null | undefined): PlanSubscriptionStatus {
  if (raw === "trialing" || raw === "past_due" || raw === "canceled") {
    return raw;
  }
  return "active";
}

function normalizeLemonStatus(raw: string | null | undefined): PlanSubscriptionStatus {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return "active";
  }
  if (value === "on_trial" || value === "trialing" || value === "trial") {
    return "trialing";
  }
  if (value === "past_due" || value === "unpaid" || value === "paused") {
    return "past_due";
  }
  if (value === "cancelled" || value === "canceled" || value === "expired") {
    return "canceled";
  }
  return "active";
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function hashPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

function normalizeSignature(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("sha256=")) {
    return trimmed.slice("sha256=".length);
  }
  return trimmed;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function parsePortalUrls(urlsValue: unknown): {
  customerPortalUrl: string | null;
  updatePaymentMethodUrl: string | null;
} {
  if (!urlsValue || typeof urlsValue !== "object") {
    return { customerPortalUrl: null, updatePaymentMethodUrl: null };
  }

  const candidate = urlsValue as Record<string, unknown>;
  return {
    customerPortalUrl:
      typeof candidate.customer_portal === "string" ? candidate.customer_portal : null,
    updatePaymentMethodUrl:
      typeof candidate.update_payment_method === "string" ? candidate.update_payment_method : null,
  };
}

function deriveAccountId(customData: Record<string, unknown> | undefined): string | null {
  if (!customData) {
    return null;
  }

  // Support both account_id/accountId and legacy tenant_id/tenantId keys
  const direct =
    asString(customData.account_id) ??
    asString(customData.accountId) ??
    asString(customData.tenant_id) ??
    asString(customData.tenantId);
  if (direct) {
    return direct;
  }

  const nested = customData.custom;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    return (
      asString(nestedRecord.account_id) ??
      asString(nestedRecord.accountId) ??
      asString(nestedRecord.tenant_id) ??
      asString(nestedRecord.tenantId)
    );
  }

  return null;
}

function shouldDowngradeToFree(
  eventName: string,
  status: PlanSubscriptionStatus,
  currentPeriodEndsAt: Date | null,
): boolean {
  const normalizedEvent = eventName.trim().toLowerCase();
  if (normalizedEvent === "subscription_expired") {
    return true;
  }

  if (status !== "canceled") {
    return false;
  }

  if (!currentPeriodEndsAt) {
    return true;
  }

  return currentPeriodEndsAt.getTime() <= Date.now();
}

export function createBillingService(
  env: ApiEnv,
  pool: Pool,
  logger: FastifyBaseLogger,
): BillingService {
  const lemonApiBase = env.LEMON_SQUEEZY_API_BASE_URL;

  const variantByPlanAndInterval: Record<
    HostedPlanId,
    Record<BillingInterval, string | undefined>
  > = {
    pro: {
      monthly: env.LEMON_SQUEEZY_VARIANT_PRO,
      annual: env.LEMON_SQUEEZY_VARIANT_PRO_ANNUAL,
    },
    pro_ai: {
      monthly: env.LEMON_SQUEEZY_VARIANT_PRO_AI,
      annual: env.LEMON_SQUEEZY_VARIANT_PRO_AI_ANNUAL,
    },
  };

  function variantMetadata(
    variantId: string | null,
  ): { planId: HostedPlanId; interval: BillingInterval } | null {
    if (!variantId) {
      return null;
    }

    for (const planId of Object.keys(variantByPlanAndInterval) as HostedPlanId[]) {
      for (const interval of Object.keys(variantByPlanAndInterval[planId]) as BillingInterval[]) {
        if (variantByPlanAndInterval[planId][interval] === variantId) {
          return { planId, interval };
        }
      }
    }

    return null;
  }

  function planForVariant(variantId: string | null): PlanId | null {
    return variantMetadata(variantId)?.planId ?? null;
  }

  function intervalForVariant(variantId: string | null): BillingInterval | null {
    return variantMetadata(variantId)?.interval ?? null;
  }

  function checkoutAvailability(): Record<HostedPlanId, Record<BillingInterval, boolean>> {
    const providerReady = Boolean(env.LEMON_SQUEEZY_API_KEY && env.LEMON_SQUEEZY_STORE_ID);
    return {
      pro: {
        monthly: providerReady && Boolean(variantByPlanAndInterval.pro.monthly),
        annual: providerReady && Boolean(variantByPlanAndInterval.pro.annual),
      },
      pro_ai: {
        monthly: providerReady && Boolean(variantByPlanAndInterval.pro_ai.monthly),
        annual: providerReady && Boolean(variantByPlanAndInterval.pro_ai.annual),
      },
    };
  }

  function checkoutConfigured(): boolean {
    return Boolean(env.LEMON_SQUEEZY_API_KEY && env.LEMON_SQUEEZY_STORE_ID);
  }

  function webhookConfigured(): boolean {
    return Boolean(env.LEMON_SQUEEZY_WEBHOOK_SECRET);
  }

  async function lemonRequest(path: string, init: RequestInit): Promise<Response> {
    const apiKey = env.LEMON_SQUEEZY_API_KEY;
    if (!apiKey) {
      throw new Error("LEMON_SQUEEZY_API_KEY is not configured");
    }

    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("Accept", "application/vnd.api+json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/vnd.api+json");
    }

    return fetch(`${lemonApiBase}${path}`, {
      ...init,
      headers,
    });
  }

  async function getOverview(accountId: string): Promise<BillingOverview> {
    const result = await pool.query<AccountSubscriptionRow>(
      `SELECT plan_id,
              status,
              trial_ends_at,
              current_period_ends_at,
              cancel_at_period_end,
              customer_portal_url,
              lemon_subscription_id,
              lemon_variant_id
       FROM tenant_plan_subscription
       WHERE tenant_id = $1
       LIMIT 1`,
      [accountId],
    );

    const row = result.rows[0];
    const planId = normalizePlanId(row?.plan_id);
    const subscriptionStatus = normalizePlanStatus(row?.status);
    const availability = checkoutAvailability();
    const checkoutEnabled = Object.values(availability).some(
      (planAvailability) => planAvailability.monthly || planAvailability.annual,
    );

    return {
      planId,
      subscriptionStatus,
      trialEndsAt: toIsoOrNull(row?.trial_ends_at ?? null),
      currentPeriodEndsAt: toIsoOrNull(row?.current_period_ends_at ?? null),
      billingInterval: intervalForVariant(row?.lemon_variant_id ?? null),
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      customerPortalUrl: row?.customer_portal_url ?? null,
      checkoutEnabled,
      checkoutAvailability: availability,
    };
  }

  async function createCheckout(input: {
    accountId: string;
    /** @deprecated Use accountId instead */
    tenantId?: string;
    userId: string;
    planId: HostedPlanId;
    interval: BillingInterval;
  }): Promise<CheckoutResult> {
    if (!checkoutConfigured()) {
      return {
        ok: false,
        error: "not_configured",
        message: "Billing is not configured yet.",
      };
    }

    const variantId = variantByPlanAndInterval[input.planId][input.interval];
    if (!variantId || !env.LEMON_SQUEEZY_STORE_ID) {
      return {
        ok: false,
        error: "not_configured",
        message: `Requested plan (${input.planId}, ${input.interval}) is not configured in billing settings.`,
      };
    }

    const userResult = await pool.query<{ email: string | null }>(
      `SELECT email
       FROM user_account
       WHERE id = $1
         AND tenant_id = $2
       LIMIT 1`,
      [input.userId, input.accountId],
    );

    const email = userResult.rows[0]?.email ?? undefined;

    const redirectUrl = new URL("/settings?billing=success", env.APP_BASE_URL).toString();

    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            ...(email ? { email } : {}),
            custom: {
              tenant_id: input.accountId,
              user_id: input.userId,
              plan_id: input.planId,
              billing_interval: input.interval,
            },
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
          },
          product_options: {
            redirect_url: redirectUrl,
          },
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: env.LEMON_SQUEEZY_STORE_ID,
            },
          },
          variant: {
            data: {
              type: "variants",
              id: variantId,
            },
          },
        },
      },
    };

    const response = await lemonRequest("/checkouts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      logger.error(
        { status: response.status, body: message },
        "failed to create Lemon Squeezy checkout",
      );
      return {
        ok: false,
        error: "provider_error",
        message: "Unable to create checkout session.",
      };
    }

    const parsed = lemonCheckoutResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, "invalid checkout response from Lemon Squeezy");
      return {
        ok: false,
        error: "provider_error",
        message: "Billing provider returned an invalid checkout response.",
      };
    }

    return { ok: true, url: parsed.data.data.attributes.url };
  }

  async function getPortal(accountId: string): Promise<PortalResult> {
    const result = await pool.query<{
      lemon_subscription_id: string | null;
      customer_portal_url: string | null;
      update_payment_method_url: string | null;
    }>(
      `SELECT lemon_subscription_id, customer_portal_url, update_payment_method_url
       FROM tenant_plan_subscription
       WHERE tenant_id = $1
       LIMIT 1`,
      [accountId],
    );

    const row = result.rows[0];
    if (!row?.lemon_subscription_id) {
      return {
        ok: false,
        error: "not_found",
        message: "No active hosted subscription found for this account.",
      };
    }

    if (row.customer_portal_url) {
      return { ok: true, url: row.customer_portal_url };
    }

    if (!env.LEMON_SQUEEZY_API_KEY) {
      return {
        ok: false,
        error: "not_configured",
        message: "Billing portal is unavailable because provider credentials are not configured.",
      };
    }

    const response = await lemonRequest(
      `/subscriptions/${encodeURIComponent(row.lemon_subscription_id)}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        "failed to fetch Lemon subscription for portal link",
      );
      return {
        ok: false,
        error: "provider_error",
        message: "Unable to load customer portal URL from billing provider.",
      };
    }

    const parsed = lemonSubscriptionResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error({ issues: parsed.error.issues }, "invalid Lemon subscription response");
      return {
        ok: false,
        error: "provider_error",
        message: "Billing provider returned invalid subscription metadata.",
      };
    }

    const customerPortalUrl = parsed.data.data.attributes.urls?.customer_portal ?? null;
    const updatePaymentMethodUrl = parsed.data.data.attributes.urls?.update_payment_method ?? null;

    if (!customerPortalUrl) {
      return {
        ok: false,
        error: "not_found",
        message: "Customer portal URL is not available for this subscription.",
      };
    }

    await pool.query(
      `UPDATE tenant_plan_subscription
       SET customer_portal_url = $2,
           update_payment_method_url = $3,
           updated_at = NOW()
       WHERE tenant_id = $1`,
      [accountId, customerPortalUrl, updatePaymentMethodUrl],
    );

    return { ok: true, url: customerPortalUrl };
  }

  async function updateSubscription(
    accountId: string,
    action: BillingSubscriptionAction,
  ): Promise<SubscriptionActionResult> {
    const result = await pool.query<{
      plan_id: string;
      status: string;
      lemon_subscription_id: string | null;
      customer_portal_url: string | null;
      update_payment_method_url: string | null;
      cancel_at_period_end: boolean;
      current_period_ends_at: Date | null;
    }>(
      `SELECT plan_id,
              status,
              lemon_subscription_id,
              customer_portal_url,
              update_payment_method_url,
              cancel_at_period_end,
              current_period_ends_at
       FROM tenant_plan_subscription
       WHERE tenant_id = $1
       LIMIT 1`,
      [accountId],
    );

    const row = result.rows[0];
    if (!row?.lemon_subscription_id || normalizePlanId(row.plan_id) === "free") {
      return {
        ok: false,
        error: "not_found",
        message: "No hosted subscription is available for this account.",
      };
    }

    if (!env.LEMON_SQUEEZY_API_KEY) {
      return {
        ok: false,
        error: "not_configured",
        message: "Billing provider credentials are not configured.",
      };
    }

    const cancelAtPeriodEnd = action === "cancel";
    if (row.cancel_at_period_end === cancelAtPeriodEnd) {
      return {
        ok: true,
        subscriptionStatus: normalizePlanStatus(row.status),
        cancelAtPeriodEnd,
        currentPeriodEndsAt: toIsoOrNull(row.current_period_ends_at),
        customerPortalUrl: row.customer_portal_url,
      };
    }

    const response = await lemonRequest(
      `/subscriptions/${encodeURIComponent(row.lemon_subscription_id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "subscriptions",
            id: row.lemon_subscription_id,
            attributes: {
              cancelled: cancelAtPeriodEnd,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        {
          accountId,
          action,
          subscriptionId: row.lemon_subscription_id,
          status: response.status,
          body,
        },
        "failed to update Lemon subscription cancellation state",
      );
      return {
        ok: false,
        error: "provider_error",
        message: "Unable to update subscription state in billing provider.",
      };
    }

    const parsed = lemonSubscriptionMutationResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error(
        { issues: parsed.error.issues, accountId, action },
        "invalid Lemon subscription mutation response",
      );
      return {
        ok: false,
        error: "provider_error",
        message: "Billing provider returned invalid subscription metadata.",
      };
    }

    const attributes = parsed.data.data.attributes;
    const status = normalizeLemonStatus(asString(attributes.status) ?? row.status);
    const renewsAt = parseDate(attributes.renews_at);
    const endsAt = parseDate(attributes.ends_at);
    const currentPeriodEndsAt = renewsAt ?? endsAt ?? row.current_period_ends_at;
    const providerCancelled = asBoolean(attributes.cancelled);
    const resolvedCancelAtPeriodEnd =
      attributes.cancelled === undefined ? cancelAtPeriodEnd : providerCancelled;
    const urls = parsePortalUrls(attributes.urls);
    const customerPortalUrl = urls.customerPortalUrl ?? row.customer_portal_url;
    const updatePaymentMethodUrl = urls.updatePaymentMethodUrl ?? row.update_payment_method_url;

    await pool.query(
      `UPDATE tenant_plan_subscription
       SET status = $2,
           cancel_at_period_end = $3,
           current_period_ends_at = $4,
           customer_portal_url = $5,
           update_payment_method_url = $6,
           updated_at = NOW()
       WHERE tenant_id = $1`,
      [
        accountId,
        status,
        resolvedCancelAtPeriodEnd,
        currentPeriodEndsAt,
        customerPortalUrl,
        updatePaymentMethodUrl,
      ],
    );

    return {
      ok: true,
      subscriptionStatus: status,
      cancelAtPeriodEnd: resolvedCancelAtPeriodEnd,
      currentPeriodEndsAt: toIsoOrNull(currentPeriodEndsAt),
      customerPortalUrl,
    };
  }

  async function findAccountIdForWebhook(
    customAccountId: string | null,
    lemonSubscriptionId: string,
    lemonCustomerId: string | null,
  ): Promise<string | null> {
    if (customAccountId) {
      return customAccountId;
    }

    const bySubscription = await pool.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM tenant_plan_subscription
       WHERE lemon_subscription_id = $1
       LIMIT 1`,
      [lemonSubscriptionId],
    );
    if (bySubscription.rows[0]?.tenant_id) {
      return bySubscription.rows[0].tenant_id;
    }

    if (!lemonCustomerId) {
      return null;
    }

    const byCustomer = await pool.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM tenant_plan_subscription
       WHERE lemon_customer_id = $1
       LIMIT 1`,
      [lemonCustomerId],
    );

    return byCustomer.rows[0]?.tenant_id ?? null;
  }

  async function upsertSubscriptionFromWebhook(
    accountId: string,
    payload: LemonUpsertPayload,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO tenant_plan_subscription (
         tenant_id,
         plan_id,
         status,
         trial_ends_at,
         current_period_ends_at,
         billing_provider,
         lemon_subscription_id,
         lemon_customer_id,
         lemon_order_id,
         lemon_variant_id,
         customer_portal_url,
         update_payment_method_url,
         cancel_at_period_end,
         last_webhook_event_at,
         updated_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13,
         NOW(),
         NOW()
       )
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         trial_ends_at = EXCLUDED.trial_ends_at,
         current_period_ends_at = EXCLUDED.current_period_ends_at,
         billing_provider = EXCLUDED.billing_provider,
         lemon_subscription_id = COALESCE(EXCLUDED.lemon_subscription_id, tenant_plan_subscription.lemon_subscription_id),
         lemon_customer_id = COALESCE(EXCLUDED.lemon_customer_id, tenant_plan_subscription.lemon_customer_id),
         lemon_order_id = COALESCE(EXCLUDED.lemon_order_id, tenant_plan_subscription.lemon_order_id),
         lemon_variant_id = COALESCE(EXCLUDED.lemon_variant_id, tenant_plan_subscription.lemon_variant_id),
         customer_portal_url = COALESCE(EXCLUDED.customer_portal_url, tenant_plan_subscription.customer_portal_url),
         update_payment_method_url = COALESCE(EXCLUDED.update_payment_method_url, tenant_plan_subscription.update_payment_method_url),
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         last_webhook_event_at = NOW(),
         updated_at = NOW()`,
      [
        accountId,
        payload.planId,
        payload.subscriptionStatus,
        payload.trialEndsAt,
        payload.currentPeriodEndsAt,
        BILLING_PROVIDER,
        payload.lemonSubscriptionId,
        payload.lemonCustomerId,
        payload.lemonOrderId,
        payload.lemonVariantId,
        payload.customerPortalUrl,
        payload.updatePaymentMethodUrl,
        payload.cancelAtPeriodEnd,
      ],
    );
  }

  async function recordWebhookEvent(input: {
    payloadHash: string;
    eventName: string;
    payload: unknown;
    status: "processed" | "ignored" | "failed";
    accountId: string | null;
  }): Promise<boolean> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO billing_webhook_event (
         provider,
         payload_hash,
         event_name,
         tenant_id,
         status,
         payload,
         processed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (provider, payload_hash) DO NOTHING
       RETURNING id`,
      [
        BILLING_PROVIDER,
        input.payloadHash,
        input.eventName,
        input.accountId,
        input.status,
        JSON.stringify(input.payload),
      ],
    );

    return result.rows.length > 0;
  }

  async function sendBillingAlert(input: {
    code: string;
    message: string;
    severity: "warning" | "error";
    details?: Record<string, unknown>;
  }): Promise<void> {
    if (!env.BILLING_ALERT_WEBHOOK_URL) {
      return;
    }

    try {
      const response = await fetch(env.BILLING_ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service: "rss-wrangler-api",
          subsystem: "billing-webhook",
          code: input.code,
          severity: input.severity,
          message: input.message,
          details: input.details ?? {},
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(
          { code: input.code, status: response.status, body },
          "failed to deliver billing alert webhook",
        );
      }
    } catch (error) {
      logger.error({ code: input.code, error }, "failed to send billing alert webhook");
    }
  }

  async function processWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<WebhookResult> {
    const payloadHash = hashPayload(rawBody);

    async function recordFailureEvent(
      eventName: string,
      message: string,
      details: Record<string, unknown>,
    ): Promise<void> {
      try {
        await recordWebhookEvent({
          payloadHash,
          eventName,
          payload: {
            message,
            details,
          },
          status: "failed",
          accountId: null,
        });
      } catch (error) {
        logger.error({ error, eventName }, "failed to persist billing webhook failure event");
      }
    }

    async function failWebhook(
      errorCode: "not_configured" | "invalid_signature" | "invalid_payload",
      eventName: string,
      message: string,
      details: Record<string, unknown>,
    ): Promise<WebhookResult> {
      await recordFailureEvent(eventName, message, details);
      await sendBillingAlert({
        code: `billing_webhook_${errorCode}`,
        severity: "error",
        message,
        details: {
          eventName,
          payloadHash,
          ...details,
        },
      });
      return {
        ok: false,
        error: errorCode,
        message,
      };
    }

    if (!webhookConfigured()) {
      return failWebhook(
        "not_configured",
        "webhook_not_configured",
        "Webhook secret is not configured.",
        { payloadBytes: rawBody.length },
      );
    }

    if (!signatureHeader) {
      return failWebhook(
        "invalid_signature",
        "signature_missing",
        "Missing webhook signature header.",
        { payloadBytes: rawBody.length },
      );
    }

    const normalizedSignature = normalizeSignature(signatureHeader);
    const expected = createHmac("sha256", env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? "")
      .update(rawBody, "utf8")
      .digest("hex");

    if (!timingSafeHexEqual(normalizedSignature, expected)) {
      return failWebhook(
        "invalid_signature",
        "signature_invalid",
        "Webhook signature verification failed.",
        { payloadBytes: rawBody.length },
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody) as unknown;
    } catch {
      return failWebhook(
        "invalid_payload",
        "payload_invalid_json",
        "Webhook body is not valid JSON.",
        { payloadBytes: rawBody.length },
      );
    }

    const parsedPayload = lemonWebhookSchema.safeParse(parsedJson);
    if (!parsedPayload.success) {
      return failWebhook(
        "invalid_payload",
        "payload_schema_invalid",
        "Webhook payload does not match expected subscription schema.",
        { issues: parsedPayload.error.issues.map((issue) => issue.message) },
      );
    }

    const eventName = parsedPayload.data.meta.event_name;

    const alreadyRecorded = await pool.query(
      `SELECT 1
       FROM billing_webhook_event
       WHERE provider = $1
         AND payload_hash = $2
       LIMIT 1`,
      [BILLING_PROVIDER, payloadHash],
    );

    if (alreadyRecorded.rows.length > 0) {
      return { ok: true, duplicate: true, status: "ignored", eventName };
    }

    if (!eventName.startsWith("subscription_")) {
      await recordWebhookEvent({
        payloadHash,
        eventName,
        payload: parsedJson,
        status: "ignored",
        accountId: null,
      });
      return { ok: true, duplicate: false, status: "ignored", eventName };
    }

    const attributes = parsedPayload.data.data.attributes;
    const lemonSubscriptionId = parsedPayload.data.data.id;
    const lemonCustomerId = asString(attributes.customer_id);
    const lemonVariantId = asString(attributes.variant_id);
    const lemonOrderId = asString(attributes.order_id);
    const subscriptionStatus = normalizeLemonStatus(asString(attributes.status));
    const trialEndsAt = parseDate(attributes.trial_ends_at);
    const renewsAt = parseDate(attributes.renews_at);
    const endsAt = parseDate(attributes.ends_at);
    const currentPeriodEndsAt = renewsAt ?? endsAt;
    const urls = parsePortalUrls(attributes.urls);

    const customData = parsedPayload.data.meta.custom_data;
    const accountIdFromCustom = customData
      ? deriveAccountId(customData as Record<string, unknown>)
      : null;

    const accountId = await findAccountIdForWebhook(
      accountIdFromCustom,
      lemonSubscriptionId,
      lemonCustomerId,
    );
    if (!accountId) {
      await recordWebhookEvent({
        payloadHash,
        eventName,
        payload: parsedJson,
        status: "ignored",
        accountId: null,
      });

      logger.warn(
        { eventName, lemonSubscriptionId },
        "billing webhook ignored because account could not be resolved",
      );
      await sendBillingAlert({
        code: "billing_webhook_account_unresolved",
        severity: "warning",
        message: "Billing webhook ignored because account could not be resolved.",
        details: {
          eventName,
          lemonSubscriptionId,
          lemonCustomerId,
          payloadHash,
        },
      });
      return { ok: true, duplicate: false, status: "ignored", eventName };
    }

    const shouldDowngrade = shouldDowngradeToFree(
      eventName,
      subscriptionStatus,
      currentPeriodEndsAt,
    );
    const variantPlan = planForVariant(lemonVariantId);
    if (!shouldDowngrade && !variantPlan) {
      await recordFailureEvent(eventName, "Webhook referenced unknown Lemon variant ID.", {
        lemonVariantId,
        accountId,
        lemonSubscriptionId,
      });
      await sendBillingAlert({
        code: "billing_webhook_unknown_variant",
        severity: "error",
        message: "Billing webhook ignored because variant ID is not mapped to a hosted plan.",
        details: {
          eventName,
          accountId,
          lemonVariantId,
          lemonSubscriptionId,
          payloadHash,
        },
      });
      return { ok: true, duplicate: false, status: "ignored", eventName };
    }

    const planId: PlanId = shouldDowngrade ? "free" : (variantPlan ?? "free");

    try {
      await upsertSubscriptionFromWebhook(accountId, {
        planId,
        subscriptionStatus,
        trialEndsAt,
        currentPeriodEndsAt,
        cancelAtPeriodEnd: asBoolean(attributes.cancelled),
        lemonSubscriptionId,
        lemonCustomerId,
        lemonOrderId,
        lemonVariantId,
        customerPortalUrl: urls.customerPortalUrl,
        updatePaymentMethodUrl: urls.updatePaymentMethodUrl,
      });

      await recordWebhookEvent({
        payloadHash,
        eventName,
        payload: parsedJson,
        status: "processed",
        accountId,
      });
    } catch (error) {
      await recordFailureEvent(
        eventName,
        "Webhook processing failed while persisting billing state.",
        { accountId, lemonSubscriptionId, lemonVariantId },
      );
      await sendBillingAlert({
        code: "billing_webhook_processing_failed",
        severity: "error",
        message: "Billing webhook processing failed while persisting billing state.",
        details: {
          eventName,
          accountId,
          lemonSubscriptionId,
          lemonVariantId,
          payloadHash,
        },
      });
      throw error;
    }

    return { ok: true, duplicate: false, status: "processed", eventName };
  }

  return {
    getOverview,
    createCheckout,
    getPortal,
    updateSubscription,
    processWebhook,
  };
}
