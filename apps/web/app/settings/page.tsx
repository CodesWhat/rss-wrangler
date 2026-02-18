"use client";

import type {
  AccountDeletionStatus,
  AccountEntitlements,
  AiMode,
  AiProvider,
  AiUsageSummary,
  BillingInterval,
  BillingOverview,
  Feed,
  FilterMode,
  FilterRule,
  FilterTarget,
  FilterType,
  Folder,
  HostedPlanId,
  Member,
  Settings,
} from "@rss-wrangler/contracts";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { NotificationToggle } from "@/components/notification-toggle";
import { ProtectedRoute } from "@/components/protected-route";
import {
  cancelAccountDeletion,
  changePassword,
  createBillingCheckout,
  createFilter,
  deleteFilter,
  getAccountDeletionStatus,
  getAccountEntitlements,
  getAiUsage,
  getBillingOverview,
  getBillingPortalUrl,
  getCurrentUserId,
  getSettings,
  listAccountMembers,
  listFeeds,
  listFilters,
  listFolders,
  removeMember,
  requestAccountDeletion,
  updateBillingSubscription,
  updateSettings,
} from "@/lib/api";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function MembersSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const memberList = await listAccountMembers();
        setMembers(memberList);
        setCurrentUserId(getCurrentUserId());
      } catch {
        setError("Failed to load members.");
      }
      setLoading(false);
    }
    load();
  }, []);

  const currentMember = members.find((m) => m.id === currentUserId);
  const isOwner = currentMember?.role === "owner";
  function markBusy(id: string) {
    setActionBusy((prev) => new Set(prev).add(id));
  }

  function clearBusy(id: string) {
    setActionBusy((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleRemove(id: string) {
    setConfirmRemove(null);
    markBusy(id);
    const original = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    const result = await removeMember(id);
    if (!result.ok) {
      if (original) {
        setMembers((prev) => [...prev, original]);
      }
      setError(result.error);
    }
    clearBusy(id);
  }

  if (loading) {
    return (
      <section className="section-card" id="members">
        <h2>Members</h2>
        <p className="muted">Loading members...</p>
      </section>
    );
  }

  if (!isOwner) {
    return (
      <section className="section-card" id="members">
        <h2>Members</h2>
        <p className="muted">Only the account owner can manage members.</p>
      </section>
    );
  }

  return (
    <section className="section-card" id="members">
      <h2>Members</h2>
      <p className="muted">This build supports a single owner account plus invited members.</p>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {members.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--sp-3)" }}>
          No members yet.
        </p>
      ) : (
        <table className="feed-table members-table">
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              <th scope="col">Last Active</th>
              {isOwner && (
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.id === currentUserId;
              return (
                <tr key={m.id}>
                  <td>
                    <span className="members-username">{m.username}</span>
                    {isSelf && <span className="badge badge-ml-sm">You</span>}
                  </td>
                  <td>{m.email ?? "\u2014"}</td>
                  <td>
                    <span className={`badge ${m.role === "owner" ? "badge-approved" : ""}`}>
                      {m.role === "owner" ? "Owner" : "Member"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        m.status === "active" ? "badge-approved" : "badge-rejected"
                      }`}
                    >
                      {m.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="muted">{relativeTime(m.joinedAt)}</td>
                  <td className="muted">{relativeTime(m.lastLoginAt)}</td>
                  {isOwner && (
                    <td>
                      {!isSelf &&
                        (confirmRemove === m.id ? (
                          <div className="members-confirm-remove">
                            <span className="muted">Remove {m.username}?</span>
                            <button
                              type="button"
                              className="button button-small button-danger"
                              disabled={actionBusy.has(m.id)}
                              onClick={() => handleRemove(m.id)}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="button button-small"
                              onClick={() => setConfirmRemove(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button button-small button-danger"
                            disabled={actionBusy.has(m.id)}
                            onClick={() => setConfirmRemove(m.id)}
                          >
                            Remove
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function budgetBarColor(percent: number | null): string {
  if (percent === null) return "var(--text-muted)";
  if (percent >= 90) return "var(--danger)";
  if (percent >= 70) return "var(--warning)";
  return "var(--success)";
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function AiUsageSection() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getAiUsage();
        setUsage(data);
      } catch {
        setError("Failed to load AI usage.");
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <section className="section-card" id="ai-usage">
        <h2>AI Usage</h2>
        <p className="muted">Loading AI usage...</p>
      </section>
    );
  }

  if (error || !usage) {
    return (
      <section className="section-card" id="ai-usage">
        <h2>AI Usage</h2>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {!error && <p className="muted">AI usage data unavailable.</p>}
      </section>
    );
  }

  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;
  const barColor = budgetBarColor(usage.budgetUsedPercent);
  const barWidth = usage.budgetUsedPercent !== null ? Math.min(usage.budgetUsedPercent, 100) : 0;
  const costBarColor = budgetBarColor(usage.budgetCostPercent ?? null);
  const costBarWidth =
    usage.budgetCostPercent !== null ? Math.min(usage.budgetCostPercent, 100) : 0;
  const providerEntries = Object.entries(usage.byProvider);
  const featureEntries = Object.entries(usage.byFeature);

  return (
    <section className="section-card" id="ai-usage">
      <h2>AI Usage</h2>
      <p className="muted">Token usage and estimated cost for {usage.month}.</p>

      <div className="billing-usage-grid">
        <article className="billing-usage-card">
          <h3>Input Tokens</h3>
          <p className="billing-usage-value">{formatTokenCount(usage.totalInputTokens)}</p>
        </article>
        <article className="billing-usage-card">
          <h3>Output Tokens</h3>
          <p className="billing-usage-value">{formatTokenCount(usage.totalOutputTokens)}</p>
        </article>
        <article className="billing-usage-card">
          <h3>Total Tokens</h3>
          <p className="billing-usage-value">{formatTokenCount(totalTokens)}</p>
        </article>
        <article className="billing-usage-card">
          <h3>Est. Cost</h3>
          <p className="billing-usage-value">${usage.totalCostUsd.toFixed(2)}</p>
        </article>
        <article className="billing-usage-card">
          <h3>API Calls</h3>
          <p className="billing-usage-value">{usage.totalCalls.toLocaleString()}</p>
        </article>
      </div>

      {usage.budgetTokens !== null && (
        <div className="ai-budget-section">
          <div className="ai-budget-label">
            <span>
              Token budget: {formatTokenCount(totalTokens)} / {formatTokenCount(usage.budgetTokens)}
            </span>
            <span style={{ color: barColor }}>
              {usage.budgetUsedPercent !== null ? `${usage.budgetUsedPercent.toFixed(1)}%` : "N/A"}
            </span>
          </div>
          <div className="ai-budget-bar-track">
            <div
              className="ai-budget-bar-fill"
              style={{ width: `${barWidth}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      )}

      {usage.budgetCapUsd !== null && (
        <div className="ai-budget-section">
          <div className="ai-budget-label">
            <span>
              Cost budget: ${usage.totalCostUsd.toFixed(2)} / ${usage.budgetCapUsd.toFixed(2)}
            </span>
            <span style={{ color: costBarColor }}>
              {usage.budgetCostPercent !== null ? `${usage.budgetCostPercent.toFixed(1)}%` : "N/A"}
            </span>
          </div>
          <div className="ai-budget-bar-track">
            <div
              className="ai-budget-bar-fill"
              style={{ width: `${costBarWidth}%`, backgroundColor: costBarColor }}
            />
          </div>
        </div>
      )}

      {providerEntries.length > 0 && (
        <div className="ai-breakdown">
          <h3>By Provider</h3>
          <table className="feed-table" aria-label="AI usage by provider">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Input</th>
                <th scope="col">Output</th>
                <th scope="col">Cost</th>
                <th scope="col">Calls</th>
              </tr>
            </thead>
            <tbody>
              {providerEntries.map(([provider, data]) => (
                <tr key={provider}>
                  <td>{provider}</td>
                  <td>{formatTokenCount(data.inputTokens)}</td>
                  <td>{formatTokenCount(data.outputTokens)}</td>
                  <td>${data.costUsd.toFixed(4)}</td>
                  <td>{data.calls.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {featureEntries.length > 0 && (
        <div className="ai-breakdown">
          <h3>By Feature</h3>
          <table className="feed-table" aria-label="AI usage by feature">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Input</th>
                <th scope="col">Output</th>
                <th scope="col">Cost</th>
                <th scope="col">Calls</th>
              </tr>
            </thead>
            <tbody>
              {featureEntries.map(([feature, data]) => (
                <tr key={feature}>
                  <td>{feature}</td>
                  <td>{formatTokenCount(data.inputTokens)}</td>
                  <td>{formatTokenCount(data.outputTokens)}</td>
                  <td>${data.costUsd.toFixed(4)}</td>
                  <td>{data.calls.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {usage.totalCalls === 0 && (
        <p className="muted" style={{ marginTop: "var(--sp-3)" }}>
          No AI usage recorded this month.
        </p>
      )}
    </section>
  );
}

function formatPlanLabel(planId: BillingOverview["planId"]): string {
  if (planId === "pro_ai") return "Pro + AI";
  if (planId === "pro") return "Pro";
  return "Free";
}

function formatBillingStatus(status: BillingOverview["subscriptionStatus"]): string {
  if (status === "trialing") return "Trialing";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  return "Active";
}

function formatLimit(value: number | null): string {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function formatSearchMode(mode: AccountEntitlements["searchMode"]): string {
  return mode === "full_text" ? "Full text" : "Title + source";
}

function formatIntervalLabel(interval: BillingInterval): string {
  return interval === "annual" ? "annual" : "monthly";
}

function BillingSection() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyPlan, setBusyPlan] = useState<HostedPlanId | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [subscriptionActionBusy, setSubscriptionActionBusy] = useState<"cancel" | "resume" | null>(
    null,
  );
  const [showSuccess, setShowSuccess] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setShowSuccess(params.get("billing") === "success");
  }, []);

  useEffect(() => {
    async function load() {
      const [billingData, entitlementsData] = await Promise.all([
        getBillingOverview(),
        getAccountEntitlements(),
      ]);
      if (!billingData) {
        setError("Failed to load billing details.");
      } else {
        setOverview(billingData);
        if (billingData.billingInterval) {
          setBillingInterval(billingData.billingInterval);
        }
      }
      setEntitlements(entitlementsData);
      setLoading(false);
    }

    load();
  }, []);

  async function handleUpgrade(planId: HostedPlanId) {
    setError("");
    setActionNotice("");
    setBusyPlan(planId);
    const result = await createBillingCheckout(planId, billingInterval);
    if (!result.ok) {
      setError(result.error);
      setBusyPlan(null);
      return;
    }
    window.location.assign(result.url);
  }

  async function handlePortal() {
    setError("");
    setActionNotice("");
    setPortalBusy(true);
    const result = await getBillingPortalUrl();
    if (!result.ok) {
      setError(result.error);
      setPortalBusy(false);
      return;
    }
    window.location.assign(result.url);
  }

  async function handleSubscriptionAction(action: "cancel" | "resume") {
    setError("");
    setActionNotice("");
    setSubscriptionActionBusy(action);
    const result = await updateBillingSubscription(action);
    if (!result.ok) {
      setError(result.error);
      setSubscriptionActionBusy(null);
      return;
    }

    setOverview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subscriptionStatus: result.subscriptionStatus,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEndsAt: result.currentPeriodEndsAt,
        customerPortalUrl: result.customerPortalUrl,
      };
    });
    setActionNotice(
      action === "cancel"
        ? "Subscription will cancel at period end."
        : "Auto-renew has been resumed.",
    );
    setSubscriptionActionBusy(null);
  }

  if (loading) {
    return (
      <section className="section-card" id="billing">
        <h2>Billing</h2>
        <p className="muted">Loading billing details...</p>
      </section>
    );
  }

  return (
    <section className="section-card" id="billing">
      <h2>Billing</h2>
      <p className="muted">Manage your hosted plan and billing portal access.</p>

      {showSuccess && (
        <p
          className="key-status key-status-active"
          role="status"
          aria-live="polite"
          style={{ display: "inline-flex", marginTop: "var(--sp-2)" }}
        >
          Checkout completed. Refreshing plan status may take a few seconds.
        </p>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {actionNotice && (
        <p
          className="key-status key-status-active"
          role="status"
          aria-live="polite"
          style={{ display: "inline-flex", marginTop: "var(--sp-2)" }}
        >
          {actionNotice}
        </p>
      )}

      {overview ? (
        <div className="billing-overview">
          <div className="billing-current-plan">
            <span className="badge badge-approved">
              Current plan: {formatPlanLabel(overview.planId)}
            </span>
            <span className="badge">{formatBillingStatus(overview.subscriptionStatus)}</span>
            {overview.billingInterval && (
              <span className="badge">Billed {overview.billingInterval}</span>
            )}
            {overview.cancelAtPeriodEnd && (
              <span className="badge badge-pending">Cancels at period end</span>
            )}
          </div>

          {entitlements && (
            <div className="billing-usage-grid">
              <article className="billing-usage-card">
                <h3>Feeds</h3>
                <p className="billing-usage-value">
                  {entitlements.usage.feeds.toLocaleString()} /{" "}
                  {formatLimit(entitlements.feedLimit)}
                </p>
              </article>
              <article className="billing-usage-card">
                <h3>Items Today</h3>
                <p className="billing-usage-value">
                  {entitlements.usage.itemsIngested.toLocaleString()} /{" "}
                  {formatLimit(entitlements.itemsPerDayLimit)}
                </p>
              </article>
              <article className="billing-usage-card">
                <h3>Search</h3>
                <p className="billing-usage-value">{formatSearchMode(entitlements.searchMode)}</p>
              </article>
              <article className="billing-usage-card">
                <h3>Min Poll</h3>
                <p className="billing-usage-value">{entitlements.minPollMinutes} min</p>
              </article>
            </div>
          )}

          {overview.currentPeriodEndsAt && (
            <p className="muted">
              Current period ends {new Date(overview.currentPeriodEndsAt).toLocaleDateString()}.
            </p>
          )}

          <div className="billing-actions">
            <button
              type="button"
              className="button button-small"
              disabled={portalBusy}
              onClick={handlePortal}
            >
              {portalBusy ? "Opening..." : "Open billing portal"}
            </button>
            {overview.planId !== "free" &&
              (overview.cancelAtPeriodEnd || overview.subscriptionStatus !== "canceled") && (
                <button
                  type="button"
                  className={`button button-small ${overview.cancelAtPeriodEnd ? "" : "button-danger"}`}
                  disabled={subscriptionActionBusy !== null}
                  onClick={() =>
                    handleSubscriptionAction(overview.cancelAtPeriodEnd ? "resume" : "cancel")
                  }
                >
                  {subscriptionActionBusy === "cancel"
                    ? "Cancelling..."
                    : subscriptionActionBusy === "resume"
                      ? "Resuming..."
                      : overview.cancelAtPeriodEnd
                        ? "Resume auto-renew"
                        : "Cancel at period end"}
                </button>
              )}
          </div>

          <div
            className="layout-toggle billing-interval-toggle"
            role="tablist"
            aria-label="Billing interval"
          >
            <button
              type="button"
              className={`layout-toggle-btn button-small ${billingInterval === "monthly" ? "button-active" : ""}`}
              onClick={() => setBillingInterval("monthly")}
              role="tab"
              aria-selected={billingInterval === "monthly"}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`layout-toggle-btn button-small ${billingInterval === "annual" ? "button-active" : ""}`}
              onClick={() => setBillingInterval("annual")}
              role="tab"
              aria-selected={billingInterval === "annual"}
            >
              Annual (2 mo free)
            </button>
          </div>
          <div className="billing-plans">
            <div className="billing-plan-card">
              <div className="billing-plan-title">Pro</div>
              <div className="billing-plan-price">
                {billingInterval === "annual" ? "$70 / year" : "$7 / month"}
              </div>
              <p className="muted">Unlimited feeds, faster polling, full-text search.</p>
              <button
                type="button"
                className="button button-primary button-small"
                disabled={
                  !overview.checkoutEnabled ||
                  busyPlan !== null ||
                  !overview.checkoutAvailability.pro[billingInterval] ||
                  (overview.planId === "pro" && overview.billingInterval === billingInterval)
                }
                onClick={() => handleUpgrade("pro")}
              >
                {busyPlan === "pro"
                  ? "Redirecting..."
                  : !overview.checkoutAvailability.pro[billingInterval]
                    ? "Unavailable"
                    : overview.planId === "pro" && overview.billingInterval === billingInterval
                      ? "Current plan"
                      : `Switch to Pro (${formatIntervalLabel(billingInterval)})`}
              </button>
            </div>

            <div className="billing-plan-card">
              <div className="billing-plan-title">Pro + AI</div>
              <div className="billing-plan-price">
                {billingInterval === "annual" ? "$140 / year" : "$14 / month"}
              </div>
              <p className="muted">
                Everything in Pro plus summaries, digests, and AI ranking features.
              </p>
              <button
                type="button"
                className="button button-primary button-small"
                disabled={
                  !overview.checkoutEnabled ||
                  busyPlan !== null ||
                  !overview.checkoutAvailability.pro_ai[billingInterval] ||
                  (overview.planId === "pro_ai" && overview.billingInterval === billingInterval)
                }
                onClick={() => handleUpgrade("pro_ai")}
              >
                {busyPlan === "pro_ai"
                  ? "Redirecting..."
                  : !overview.checkoutAvailability.pro_ai[billingInterval]
                    ? "Unavailable"
                    : overview.planId === "pro_ai" && overview.billingInterval === billingInterval
                      ? "Current plan"
                      : `Switch to Pro + AI (${formatIntervalLabel(billingInterval)})`}
              </button>
            </div>
          </div>

          {!overview.checkoutEnabled && (
            <p className="muted">Checkout is not configured for this deployment yet.</p>
          )}
          {overview.checkoutEnabled &&
            !overview.checkoutAvailability.pro[billingInterval] &&
            !overview.checkoutAvailability.pro_ai[billingInterval] && (
              <p className="muted">
                {billingInterval === "annual"
                  ? "Annual variants are not configured for this deployment yet."
                  : "Monthly variants are not configured for this deployment yet."}
              </p>
            )}
        </div>
      ) : (
        <p className="muted">Billing details unavailable.</p>
      )}
    </section>
  );
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "\u2022".repeat(key.length);
  return key.slice(0, 3) + "\u2022".repeat(Math.min(key.length - 7, 20)) + key.slice(-4);
}

function SettingsContent() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());

  // API key editing state
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  // Feeds and folders for scope selector
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  // New filter form
  const [newPattern, setNewPattern] = useState("");
  const [newTarget, setNewTarget] = useState<FilterTarget>("keyword");
  const [newType, setNewType] = useState<FilterType>("phrase");
  const [newMode, setNewMode] = useState<FilterMode>("mute");
  const [newBreakout, setNewBreakout] = useState(true);
  const [newScopeType, setNewScopeType] = useState<"global" | "feed" | "folder">("global");
  const [newScopeFeedId, setNewScopeFeedId] = useState<string>("");
  const [newScopeFolderId, setNewScopeFolderId] = useState<string>("");
  const [filterBusy, setFilterBusy] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<AccountDeletionStatus | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [deletionSaved, setDeletionSaved] = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      getSettings(),
      listFilters(),
      getAccountDeletionStatus(),
      listFeeds(),
      listFolders(),
    ]).then(([s, f, d, fe, fo]) => {
      setSettings(s);
      setSavedSettings(s);
      setFilters(f);
      setDeletionStatus(d);
      setFeeds(fe);
      setFolders(fo);
      setLoading(false);
    });
  }, []);

  const isDirty =
    settings && savedSettings ? JSON.stringify(settings) !== JSON.stringify(savedSettings) : false;

  const doSave = useCallback(async (toSave: Settings, changedField?: string) => {
    setSaving(true);
    const result = await updateSettings(toSave);
    if (result) {
      setSettings(result);
      setSavedSettings(result);
      if (changedField) {
        setSavingFields((prev) => {
          const next = new Set(prev);
          next.delete(changedField);
          return next;
        });
        setSavedFields((prev) => new Set(prev).add(changedField));
        setTimeout(() => {
          setSavedFields((prev) => {
            const next = new Set(prev);
            next.delete(changedField);
            return next;
          });
        }, 2000);
      }
    } else if (changedField) {
      setSavingFields((prev) => {
        const next = new Set(prev);
        next.delete(changedField);
        return next;
      });
    }
    setSaving(false);
  }, []);

  function updateField<K extends keyof Settings>(field: K, value: Settings[K]) {
    if (!settings) return;
    const next = { ...settings, [field]: value };
    setSettings(next);

    setSavingFields((prev) => new Set(prev).add(field));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave(next, field);
    }, 800);
  }

  function fieldLabel(field: string, label: string) {
    return (
      <>
        {label}
        {savingFields.has(field) && (
          <span className="key-status saved-indicator" style={{ color: "var(--text-muted)" }}>
            SAVING...
          </span>
        )}
        {savedFields.has(field) && (
          <span className="key-status key-status-active saved-indicator">SAVED</span>
        )}
      </>
    );
  }

  async function handleSaveApiKey() {
    if (!settings || !keyDraft.trim()) return;
    const next = { ...settings, openaiApiKey: keyDraft.trim() };
    setSettings(next);
    setEditingKey(false);
    await doSave(next, "openaiApiKey");
    setKeyDraft("");
  }

  async function handleClearApiKey() {
    if (!settings) return;
    const next = { ...settings, openaiApiKey: "" };
    setSettings(next);
    setEditingKey(false);
    setKeyDraft("");
    await doSave(next, "openaiApiKey");
  }

  async function handleManualSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    await doSave(settings);
  }

  async function handleAddFilter(e: FormEvent) {
    e.preventDefault();
    setFilterError("");

    // Client-side regex validation
    if (newType === "regex") {
      try {
        new RegExp(newPattern);
      } catch (err) {
        setFilterError(`Invalid regex: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    setFilterBusy(true);

    const feedId = newScopeType === "feed" && newScopeFeedId ? newScopeFeedId : null;
    const folderId = newScopeType === "folder" && newScopeFolderId ? newScopeFolderId : null;

    const rule = await createFilter({
      pattern: newPattern,
      target: newTarget,
      type: newType,
      mode: newMode,
      breakoutEnabled: newBreakout,
      feedId,
      folderId,
    });
    if (rule) {
      setFilters((prev) => [...prev, rule]);
      setNewPattern("");
      setNewTarget("keyword");
      setNewType("phrase");
      setNewMode("mute");
      setNewBreakout(true);
      setNewScopeType("global");
      setNewScopeFeedId("");
      setNewScopeFolderId("");
    }
    setFilterBusy(false);
  }

  async function handleDeleteFilter(id: string) {
    const ok = await deleteFilter(id);
    if (ok) {
      setFilters((prev) => prev.filter((f) => f.id !== id));
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordBusy(true);
    const result = await changePassword({
      currentPassword,
      newPassword,
    });
    setPasswordBusy(false);

    if (!result.ok) {
      setPasswordError(result.error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 3000);
  }

  async function handleRequestDeletion(e: FormEvent) {
    e.preventDefault();
    setDeletionError("");
    setDeletionSaved(false);

    if (deleteConfirmText !== "DELETE") {
      setDeletionError("Type DELETE exactly to confirm.");
      return;
    }

    setDeletionBusy(true);
    const result = await requestAccountDeletion({
      password: deletePassword,
      confirmText: "DELETE",
    });
    setDeletionBusy(false);

    if (!result.ok) {
      setDeletionError(result.error);
      return;
    }

    setDeletionStatus(result.status);
    setDeletePassword("");
    setDeleteConfirmText("");
    setDeletionSaved(true);
    setTimeout(() => setDeletionSaved(false), 3000);
  }

  async function handleCancelDeletion() {
    setDeletionError("");
    setDeletionSaved(false);
    setDeletionBusy(true);
    const result = await cancelAccountDeletion();
    setDeletionBusy(false);
    if (!result.ok) {
      setDeletionError(result.error);
      return;
    }
    setDeletionStatus(result.status);
    setDeletionSaved(true);
    setTimeout(() => setDeletionSaved(false), 3000);
  }

  if (loading || !settings) {
    return <p className="muted">Loading settings...</p>;
  }

  const hasKey = !!(settings.openaiApiKey && settings.openaiApiKey.length > 0);

  const sections = [
    { id: "ai-provider", label: "AI Provider" },
    { id: "general", label: "General" },
    { id: "billing", label: "Billing" },
    { id: "ai-usage", label: "AI Usage" },
    { id: "members", label: "Members" },
    { id: "account", label: "Account" },
    { id: "account-deletion", label: "Danger Zone" },
    { id: "notifications", label: "Notifications" },
    { id: "filters", label: "Filters" },
  ];

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="settings-nav-btn"
              onClick={() => scrollToSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-layout">
        {/* AI Provider section */}
        <section className="section-card" id="ai-provider">
          <h2>
            AI Provider
            {savedFields.has("openaiApiKey") && (
              <span className="key-status key-status-active saved-indicator-lg">SAVED</span>
            )}
          </h2>
          <p className="muted">Configure the AI backend for summaries and digests.</p>

          <div className="settings-form">
            <label>
              {fieldLabel("aiMode", "AI mode")}
              <select
                value={settings.aiMode}
                onChange={(e) => updateField("aiMode", e.target.value as AiMode)}
              >
                <option value="off">Off</option>
                <option value="summaries_digest">Summaries + Digest</option>
                <option value="full">Full</option>
              </select>
            </label>

            <label>
              {fieldLabel("aiProvider", "Provider")}
              <select
                value={settings.aiProvider}
                onChange={(e) => updateField("aiProvider", e.target.value as AiProvider)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="local">Local</option>
              </select>
            </label>

            <div className="key-section">
              <span className="key-label">API key</span>
              {editingKey ? (
                <div className="key-edit-row">
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    className="input"
                    autoComplete="off"
                    aria-label="API key"
                  />
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={handleSaveApiKey}
                    disabled={!keyDraft.trim()}
                  >
                    Save key
                  </button>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => {
                      setEditingKey(false);
                      setKeyDraft("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="key-display-row">
                  {hasKey ? (
                    <>
                      <code className="key-masked">{maskKey(settings.openaiApiKey!)}</code>
                      <span className="key-status key-status-active">Active</span>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => setEditingKey(true)}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="button button-small button-danger"
                        onClick={handleClearApiKey}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="muted">No key set</span>
                      <button
                        type="button"
                        className="button button-small button-primary"
                        onClick={() => setEditingKey(true)}
                      >
                        Add key
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <label>
              {fieldLabel("monthlyAiCapUsd", "Monthly AI cap ($)")}
              <input
                type="number"
                min={0}
                step={1}
                value={settings.monthlyAiCapUsd}
                onChange={(e) => updateField("monthlyAiCapUsd", Number(e.target.value))}
                className="input"
              />
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.aiFallbackToLocal}
                onChange={(e) => updateField("aiFallbackToLocal", e.target.checked)}
              />
              {fieldLabel("aiFallbackToLocal", "Fallback to local on cap hit")}
            </label>
          </div>
        </section>

        {/* General settings */}
        <section className="section-card" id="general">
          <h2>General</h2>
          <form onSubmit={handleManualSave} className="settings-form">
            <label>
              {fieldLabel("digestAwayHours", "Digest away trigger (hours)")}
              <input
                type="number"
                min={1}
                value={settings.digestAwayHours}
                onChange={(e) => updateField("digestAwayHours", Number(e.target.value))}
                className="input"
              />
            </label>

            <label>
              {fieldLabel("digestBacklogThreshold", "Digest backlog threshold")}
              <input
                type="number"
                min={1}
                value={settings.digestBacklogThreshold}
                onChange={(e) => updateField("digestBacklogThreshold", Number(e.target.value))}
                className="input"
              />
            </label>

            <label>
              {fieldLabel("feedPollMinutes", "Feed poll interval (minutes)")}
              <input
                type="number"
                min={5}
                value={settings.feedPollMinutes}
                onChange={(e) => updateField("feedPollMinutes", Number(e.target.value))}
                className="input"
              />
            </label>

            <label>
              {fieldLabel("unreadMaxAgeDays", "Unread max-age (days)")}
              <input
                type="number"
                min={1}
                max={3650}
                placeholder="Disabled"
                value={settings.unreadMaxAgeDays ?? ""}
                onChange={(e) => {
                  updateField(
                    "unreadMaxAgeDays",
                    e.target.value === "" ? null : Number(e.target.value),
                  );
                }}
                className="input"
              />
            </label>

            <label>
              {fieldLabel("readPurgeDays", "Read purge (days)")}
              <input
                type="number"
                min={1}
                max={3650}
                placeholder="Disabled"
                value={settings.readPurgeDays ?? ""}
                onChange={(e) => {
                  updateField(
                    "readPurgeDays",
                    e.target.value === "" ? null : Number(e.target.value),
                  );
                }}
                className="input"
              />
            </label>

            <p className="muted">
              Retention cleanup runs in the worker. Leave blank to disable either policy.
            </p>

            <div className="settings-separator" />

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.progressiveSummarizationEnabled}
                onChange={(e) => updateField("progressiveSummarizationEnabled", e.target.checked)}
              />
              {fieldLabel("progressiveSummarizationEnabled", "Progressive summarization")}
            </label>

            <p className="muted">
              Stories age gracefully: fresh items show full content, aging items get AI summaries,
              old items collapse to headlines.
            </p>

            {settings.progressiveSummarizationEnabled && (
              <div className="settings-grid">
                <label>
                  {fieldLabel("progressiveFreshHours", "Fresh threshold (hours)")}
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={1}
                    value={settings.progressiveFreshHours}
                    onChange={(e) => updateField("progressiveFreshHours", Number(e.target.value))}
                    className="input-range"
                  />
                  <span className="muted">
                    {settings.progressiveFreshHours}h -- items younger than this show full content
                  </span>
                </label>

                <label>
                  {fieldLabel("progressiveAgingDays", "Aging threshold (days)")}
                  <input
                    type="range"
                    min={1}
                    max={14}
                    step={1}
                    value={settings.progressiveAgingDays}
                    onChange={(e) => updateField("progressiveAgingDays", Number(e.target.value))}
                    className="input-range"
                  />
                  <span className="muted">
                    {settings.progressiveAgingDays}d -- items older than this collapse to headlines
                  </span>
                </label>
              </div>
            )}

            <div className="settings-separator" />

            <label>
              {fieldLabel("markReadOnScroll", "Mark as read")}
              <select
                value={settings.markReadOnScroll}
                onChange={(e) =>
                  updateField("markReadOnScroll", e.target.value as Settings["markReadOnScroll"])
                }
              >
                <option value="off">Off</option>
                <option value="on_scroll">On scroll</option>
                <option value="on_open">On open</option>
              </select>
            </label>

            {settings.markReadOnScroll === "on_scroll" ? (
              <div className="settings-grid">
                <label>
                  {fieldLabel("markReadOnScrollListDelayMs", "List view delay (ms)")}
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={settings.markReadOnScrollListDelayMs}
                    onChange={(e) =>
                      updateField("markReadOnScrollListDelayMs", Number(e.target.value))
                    }
                    className="input"
                  />
                </label>

                <label>
                  {fieldLabel("markReadOnScrollListThreshold", "List view threshold (%)")}
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round((settings.markReadOnScrollListThreshold ?? 0.6) * 100)}
                    onChange={(e) =>
                      updateField("markReadOnScrollListThreshold", Number(e.target.value) / 100)
                    }
                    className="input"
                  />
                </label>

                <label>
                  {fieldLabel("markReadOnScrollCompactDelayMs", "Compact view delay (ms)")}
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={settings.markReadOnScrollCompactDelayMs}
                    onChange={(e) =>
                      updateField("markReadOnScrollCompactDelayMs", Number(e.target.value))
                    }
                    className="input"
                  />
                </label>

                <label>
                  {fieldLabel("markReadOnScrollCompactThreshold", "Compact view threshold (%)")}
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round((settings.markReadOnScrollCompactThreshold ?? 0.6) * 100)}
                    onChange={(e) =>
                      updateField("markReadOnScrollCompactThreshold", Number(e.target.value) / 100)
                    }
                    className="input"
                  />
                </label>

                <label>
                  {fieldLabel("markReadOnScrollCardDelayMs", "Card view delay (ms)")}
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={settings.markReadOnScrollCardDelayMs}
                    onChange={(e) =>
                      updateField("markReadOnScrollCardDelayMs", Number(e.target.value))
                    }
                    className="input"
                  />
                </label>

                <label>
                  {fieldLabel("markReadOnScrollCardThreshold", "Card view threshold (%)")}
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round((settings.markReadOnScrollCardThreshold ?? 0.6) * 100)}
                    onChange={(e) =>
                      updateField("markReadOnScrollCardThreshold", Number(e.target.value) / 100)
                    }
                    className="input"
                  />
                </label>
              </div>
            ) : null}

            <label>
              {fieldLabel("wallabagUrl", "Wallabag server URL (optional)")}
              <input
                type="url"
                placeholder="https://your-wallabag-server.com"
                value={settings.wallabagUrl ?? ""}
                onChange={(e) => updateField("wallabagUrl", e.target.value)}
                className="input"
              />
            </label>

            <button type="submit" className="button button-primary" disabled={saving || !isDirty}>
              {saving ? "Saving..." : isDirty ? "Save settings" : "Settings saved"}
            </button>
          </form>
        </section>

        <BillingSection />

        <AiUsageSection />

        {/* Members */}
        <MembersSection />

        {/* Account */}
        <section className="section-card" id="account">
          <h2>
            Account
            {passwordSaved ? (
              <span className="key-status key-status-active saved-indicator-lg">UPDATED</span>
            ) : null}
          </h2>
          <p className="muted">Change your account password.</p>
          <form onSubmit={handleChangePassword} className="settings-form">
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                required
              />
            </label>

            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                required
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                required
              />
            </label>

            {passwordError ? (
              <p className="error-text" role="alert">
                {passwordError}
              </p>
            ) : null}

            <button type="submit" className="button button-primary" disabled={passwordBusy}>
              {passwordBusy ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>

        <section className="section-card" id="account-deletion">
          <h2>
            Danger Zone
            {deletionSaved ? (
              <span className="key-status key-status-active saved-indicator-lg">UPDATED</span>
            ) : null}
          </h2>
          <p className="muted">
            Request account deletion. This is a request-only workflow for now and does not purge
            data immediately.
          </p>

          {deletionStatus?.status === "pending" ? (
            <div className="settings-form">
              <p className="muted">
                Deletion requested on {new Date(deletionStatus.requestedAt).toLocaleString()}.
              </p>
              <button
                type="button"
                className="button button-danger"
                disabled={deletionBusy}
                onClick={handleCancelDeletion}
              >
                {deletionBusy ? "Cancelling..." : "Cancel deletion request"}
              </button>
              {deletionError ? (
                <p className="error-text" role="alert">
                  {deletionError}
                </p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={handleRequestDeletion} className="settings-form">
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="input"
                  required
                />
              </label>
              <label>
                Type DELETE to confirm
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="input"
                  required
                />
              </label>
              {deletionError ? (
                <p className="error-text" role="alert">
                  {deletionError}
                </p>
              ) : null}
              <button type="submit" className="button button-danger" disabled={deletionBusy}>
                {deletionBusy ? "Submitting..." : "Request account deletion"}
              </button>
            </form>
          )}
        </section>

        {/* Notifications */}
        <section className="section-card" id="notifications">
          <h2>Notifications</h2>
          <p className="muted">Receive push notifications when new stories arrive.</p>
          <div className="settings-form">
            <NotificationToggle />
          </div>
        </section>

        {/* Filter rules */}
        <section className="section-card" id="filters">
          <h2>Filter rules</h2>
          <p className="muted">
            Mute, block, or keep/allow content matching patterns. Use keep mode to whitelist -- only
            matching items pass through.
          </p>

          <form onSubmit={handleAddFilter} className="filter-form">
            <input
              type="text"
              placeholder="Pattern (e.g. roblox)"
              required
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              className="input"
              aria-label="Filter pattern"
            />
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value as FilterTarget)}
              aria-label="Filter target"
            >
              <option value="keyword">Keyword</option>
              <option value="author">Author</option>
              <option value="domain">Domain</option>
              <option value="url_pattern">URL pattern</option>
            </select>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as FilterType)}
              aria-label="Filter type"
            >
              <option value="phrase">Phrase</option>
              <option value="regex">Regex</option>
            </select>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as FilterMode)}
              aria-label="Filter mode"
            >
              <option value="mute">Mute</option>
              <option value="block">Block</option>
              <option value="keep">Keep/Allow</option>
            </select>
            <select
              value={newScopeType}
              onChange={(e) => {
                setNewScopeType(e.target.value as "global" | "feed" | "folder");
                setNewScopeFeedId("");
                setNewScopeFolderId("");
              }}
              aria-label="Filter scope"
            >
              <option value="global">Global</option>
              <option value="feed">Specific feed</option>
              <option value="folder">Specific folder</option>
            </select>
            {newScopeType === "feed" && (
              <select
                value={newScopeFeedId}
                onChange={(e) => setNewScopeFeedId(e.target.value)}
                aria-label="Scope feed"
              >
                <option value="">-- Select feed --</option>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title || f.url}
                  </option>
                ))}
              </select>
            )}
            {newScopeType === "folder" && (
              <select
                value={newScopeFolderId}
                onChange={(e) => setNewScopeFolderId(e.target.value)}
                aria-label="Scope folder"
              >
                <option value="">-- Select folder --</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newBreakout}
                onChange={(e) => setNewBreakout(e.target.checked)}
              />
              Breakout
            </label>
            <button type="submit" className="button button-primary" disabled={filterBusy}>
              Add rule
            </button>
          </form>

          {filterError ? (
            <p className="error-text" role="alert">
              {filterError}
            </p>
          ) : null}

          {filters.length === 0 ? (
            <p className="muted">No filter rules yet.</p>
          ) : (
            <table className="feed-table" aria-label="Filter rules">
              <thead>
                <tr>
                  <th scope="col">Pattern</th>
                  <th scope="col">Target</th>
                  <th scope="col">Type</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Breakout</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filters.map((rule) => {
                  let scopeLabel = "Global";
                  if (rule.feedId) {
                    const feed = feeds.find((f) => f.id === rule.feedId);
                    scopeLabel = feed
                      ? `Feed: ${feed.title}`
                      : `Feed: ${rule.feedId.slice(0, 8)}...`;
                  } else if (rule.folderId) {
                    const folder = folders.find((f) => f.id === rule.folderId);
                    scopeLabel = folder
                      ? `Folder: ${folder.name}`
                      : `Folder: ${rule.folderId.slice(0, 8)}...`;
                  }
                  return (
                    <tr key={rule.id}>
                      <td>
                        <code>{rule.pattern}</code>
                      </td>
                      <td>{rule.target}</td>
                      <td>{rule.type}</td>
                      <td>{rule.mode}</td>
                      <td>{scopeLabel}</td>
                      <td>{rule.breakoutEnabled ? "Yes" : "No"}</td>
                      <td>
                        <button
                          type="button"
                          className="button button-small button-danger"
                          onClick={() => handleDeleteFilter(rule.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
