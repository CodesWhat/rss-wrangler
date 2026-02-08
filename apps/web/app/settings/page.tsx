"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { NotificationToggle } from "@/components/notification-toggle";
import {
  getAccountEntitlements,
  createBillingCheckout,
  cancelAccountDeletion,
  changePassword,
  getBillingOverview,
  getBillingPortalUrl,
  getAccountDeletionStatus,
  requestAccountDeletion,
  getSettings,
  updateSettings,
  listFilters,
  createFilter,
  deleteFilter,
  listMembers,
  approveMember,
  rejectMember,
  removeMember,
  updateMemberRole,
  getWorkspacePolicy,
  updateWorkspacePolicy,
  getCurrentUserId,
} from "@/lib/api";
import type {
  Settings,
  FilterRule,
  AiMode,
  AiProvider,
  AccountDeletionStatus,
  AccountEntitlements,
  FilterType,
  FilterMode,
  BillingOverview,
  HostedPlanId,
  WorkspaceMember,
  MembershipPolicy,
  UserRole,
} from "@rss-wrangler/contracts";

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
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [policy, setPolicy] = useState<MembershipPolicy>("invite_only");
  const [policyDraft, setPolicyDraft] = useState<MembershipPolicy>("invite_only");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [actionBusy, setActionBusy] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [memberList, workspacePolicy] = await Promise.all([
          listMembers(),
          getWorkspacePolicy(),
        ]);
        setMembers(memberList);
        setPolicy(workspacePolicy);
        setPolicyDraft(workspacePolicy);
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
  const pendingMembers = members.filter((m) => m.status === "pending_approval");
  const activeMembers = members.filter((m) => m.status !== "pending_approval");

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

  async function handleApprove(id: string) {
    markBusy(id);
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "active" as const } : m))
    );
    const result = await approveMember(id);
    if (!result.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "pending_approval" as const } : m
        )
      );
      setError(result.error);
    }
    clearBusy(id);
  }

  async function handleReject(id: string) {
    markBusy(id);
    const original = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    const result = await rejectMember(id);
    if (!result.ok) {
      if (original) {
        setMembers((prev) => [...prev, original]);
      }
      setError(result.error);
    }
    clearBusy(id);
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

  async function handleRoleChange(id: string, newRole: UserRole) {
    markBusy(id);
    const oldRole = members.find((m) => m.id === id)?.role;
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role: newRole } : m))
    );
    const result = await updateMemberRole(id, { role: newRole });
    if (!result.ok) {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, role: oldRole ?? "member" } : m))
      );
      setError(result.error);
    }
    clearBusy(id);
  }

  async function handleSavePolicy(e: FormEvent) {
    e.preventDefault();
    setPolicySaving(true);
    setPolicySaved(false);
    const result = await updateWorkspacePolicy(policyDraft);
    if (result.ok) {
      setPolicy(policyDraft);
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2000);
    } else {
      setError(result.error);
      setPolicyDraft(policy);
    }
    setPolicySaving(false);
  }

  if (loading) {
    return (
      <section className="section-card" id="members">
        <h2>Members</h2>
        <p className="muted">Loading members...</p>
      </section>
    );
  }

  return (
    <section className="section-card" id="members">
      <h2>
        Members
        {policySaved && (
          <span className="key-status key-status-active saved-indicator-lg">SAVED</span>
        )}
      </h2>
      <p className="muted">Manage workspace members, roles, and membership policy.</p>

      {error && <p className="error-text">{error}</p>}

      {/* Membership Policy (owner only) */}
      {isOwner && (
        <form onSubmit={handleSavePolicy} className="settings-form">
          <label>
            Membership Policy
            <select
              value={policyDraft}
              onChange={(e) => setPolicyDraft(e.target.value as MembershipPolicy)}
            >
              <option value="invite_only">Invite Only — Users need an invite code to join</option>
              <option value="open">Open — Anyone can join this workspace</option>
              <option value="approval_required">Approval Required — New members need owner approval after joining</option>
            </select>
          </label>
          <button
            type="submit"
            className="button button-primary"
            disabled={policySaving || policyDraft === policy}
          >
            {policySaving ? "Saving..." : policyDraft === policy ? "Policy saved" : "Save policy"}
          </button>
        </form>
      )}

      {/* Pending Approvals */}
      {pendingMembers.length > 0 && isOwner && (
        <div className="members-pending-banner">
          <strong>{pendingMembers.length} member{pendingMembers.length !== 1 ? "s" : ""} awaiting approval</strong>
          <div className="members-pending-list">
            {pendingMembers.map((m) => (
              <div key={m.id} className="members-pending-item">
                <div className="members-pending-info">
                  <span className="members-username">{m.username}</span>
                  <span className="muted">{m.email ?? ""}</span>
                  <span className="muted">{relativeTime(m.joinedAt)}</span>
                </div>
                <div className="members-pending-actions">
                  <button
                    type="button"
                    className="button button-small members-btn-approve"
                    disabled={actionBusy.has(m.id)}
                    onClick={() => handleApprove(m.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="button button-small button-danger"
                    disabled={actionBusy.has(m.id)}
                    onClick={() => handleReject(m.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Members Table */}
      {activeMembers.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--sp-3)" }}>No members yet.</p>
      ) : (
        <table className="feed-table members-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last Active</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => {
              const isSelf = m.id === currentUserId;
              const isMemberOwner = m.role === "owner";
              return (
                <tr key={m.id}>
                  <td>
                    <span className="members-username">{m.username}</span>
                    {isSelf && <span className="badge badge-ml-sm">You</span>}
                  </td>
                  <td>{m.email ?? "\u2014"}</td>
                  <td>
                    {isOwner && !isSelf && !isMemberOwner ? (
                      <select
                        className="members-role-select"
                        value={m.role}
                        disabled={actionBusy.has(m.id)}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as UserRole)}
                      >
                        <option value="member">Member</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span className={`badge ${m.role === "owner" ? "badge-approved" : ""}`}>
                        {m.role === "owner" ? "Owner" : "Member"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        m.status === "active"
                          ? "badge-approved"
                          : m.status === "pending_approval"
                            ? "badge-pending"
                            : "badge-rejected"
                      }`}
                    >
                      {m.status === "active"
                        ? "Active"
                        : m.status === "pending_approval"
                          ? "Pending"
                          : "Suspended"}
                    </span>
                  </td>
                  <td className="muted">{relativeTime(m.joinedAt)}</td>
                  <td className="muted">{relativeTime(m.lastLoginAt)}</td>
                  {isOwner && (
                    <td>
                      {!isSelf && !isMemberOwner && (
                        <>
                          {confirmRemove === m.id ? (
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
                          )}
                        </>
                      )}
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

function BillingSection() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyPlan, setBusyPlan] = useState<HostedPlanId | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setShowSuccess(params.get("billing") === "success");
  }, []);

  useEffect(() => {
    async function load() {
      const [billingData, entitlementsData] = await Promise.all([
        getBillingOverview(),
        getAccountEntitlements()
      ]);
      if (!billingData) {
        setError("Failed to load billing details.");
      } else {
        setOverview(billingData);
      }
      setEntitlements(entitlementsData);
      setLoading(false);
    }

    load();
  }, []);

  async function handleUpgrade(planId: HostedPlanId) {
    setError("");
    setBusyPlan(planId);
    const result = await createBillingCheckout(planId);
    if (!result.ok) {
      setError(result.error);
      setBusyPlan(null);
      return;
    }
    window.location.assign(result.url);
  }

  async function handlePortal() {
    setError("");
    setPortalBusy(true);
    const result = await getBillingPortalUrl();
    if (!result.ok) {
      setError(result.error);
      setPortalBusy(false);
      return;
    }
    window.location.assign(result.url);
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
        <p className="key-status key-status-active" style={{ display: "inline-flex", marginTop: "var(--sp-2)" }}>
          Checkout completed. Refreshing plan status may take a few seconds.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}

      {overview ? (
        <div className="billing-overview">
          <div className="billing-current-plan">
            <span className="badge badge-approved">Current plan: {formatPlanLabel(overview.planId)}</span>
            <span className="badge">{formatBillingStatus(overview.subscriptionStatus)}</span>
            {overview.cancelAtPeriodEnd && <span className="badge badge-pending">Cancels at period end</span>}
          </div>

          {entitlements && (
            <div className="billing-usage-grid">
              <article className="billing-usage-card">
                <h3>Feeds</h3>
                <p className="billing-usage-value">
                  {entitlements.usage.feeds.toLocaleString()} / {formatLimit(entitlements.feedLimit)}
                </p>
              </article>
              <article className="billing-usage-card">
                <h3>Items Today</h3>
                <p className="billing-usage-value">
                  {entitlements.usage.itemsIngested.toLocaleString()} / {formatLimit(entitlements.itemsPerDayLimit)}
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
          </div>

          <div className="billing-plans">
            <div className="billing-plan-card">
              <div className="billing-plan-title">Pro</div>
              <div className="billing-plan-price">$7 / month</div>
              <p className="muted">Unlimited feeds, faster polling, full-text search.</p>
              <button
                type="button"
                className="button button-primary button-small"
                disabled={!overview.checkoutEnabled || busyPlan !== null || overview.planId === "pro"}
                onClick={() => handleUpgrade("pro")}
              >
                {busyPlan === "pro" ? "Redirecting..." : overview.planId === "pro" ? "Current plan" : "Upgrade to Pro"}
              </button>
            </div>

            <div className="billing-plan-card">
              <div className="billing-plan-title">Pro + AI</div>
              <div className="billing-plan-price">$14 / month</div>
              <p className="muted">Everything in Pro plus summaries, digests, and AI ranking features.</p>
              <button
                type="button"
                className="button button-primary button-small"
                disabled={!overview.checkoutEnabled || busyPlan !== null || overview.planId === "pro_ai"}
                onClick={() => handleUpgrade("pro_ai")}
              >
                {busyPlan === "pro_ai" ? "Redirecting..." : overview.planId === "pro_ai" ? "Current plan" : "Upgrade to Pro + AI"}
              </button>
            </div>
          </div>

          {!overview.checkoutEnabled && (
            <p className="muted">Checkout is not configured for this deployment yet.</p>
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
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());

  // API key editing state
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

  // New filter form
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<FilterType>("phrase");
  const [newMode, setNewMode] = useState<FilterMode>("mute");
  const [newBreakout, setNewBreakout] = useState(true);
  const [filterBusy, setFilterBusy] = useState(false);
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
    Promise.all([getSettings(), listFilters(), getAccountDeletionStatus()]).then(([s, f, d]) => {
      setSettings(s);
      setSavedSettings(s);
      setFilters(f);
      setDeletionStatus(d);
      setLoading(false);
    });
  }, []);

  const isDirty = settings && savedSettings
    ? JSON.stringify(settings) !== JSON.stringify(savedSettings)
    : false;

  const doSave = useCallback(async (toSave: Settings, changedField?: string) => {
    setSaving(true);
    const result = await updateSettings(toSave);
    if (result) {
      setSettings(result);
      setSavedSettings(result);
      if (changedField) {
        setSavedFields((prev) => new Set(prev).add(changedField));
        setTimeout(() => {
          setSavedFields((prev) => {
            const next = new Set(prev);
            next.delete(changedField);
            return next;
          });
        }, 2000);
      }
    }
    setSaving(false);
  }, []);

  function updateField<K extends keyof Settings>(field: K, value: Settings[K]) {
    if (!settings) return;
    const next = { ...settings, [field]: value };
    setSettings(next);

    // Auto-save with debounce
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave(next, field);
    }, 800);
  }

  function fieldLabel(field: string, label: string) {
    return (
      <>
        {label}
        {savedFields.has(field) && (
          <span className="key-status key-status-active saved-indicator">
            SAVED
          </span>
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
    setFilterBusy(true);
    const rule = await createFilter({
      pattern: newPattern,
      type: newType,
      mode: newMode,
      breakoutEnabled: newBreakout,
    });
    if (rule) {
      setFilters((prev) => [...prev, rule]);
      setNewPattern("");
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
        <div className="settings-nav">
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
        </div>
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
                  autoFocus
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
                  onClick={() => { setEditingKey(false); setKeyDraft(""); }}
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
            {fieldLabel("wallabagUrl", "Wallabag server URL (optional)")}
            <input
              type="url"
              placeholder="https://your-wallabag-server.com"
              value={settings.wallabagUrl ?? ""}
              onChange={(e) => updateField("wallabagUrl", e.target.value)}
              className="input"
            />
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={saving || !isDirty}
          >
            {saving ? "Saving..." : isDirty ? "Save settings" : "Settings saved"}
          </button>
        </form>
      </section>

      <BillingSection />

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

          {passwordError ? <p className="error-text">{passwordError}</p> : null}

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
          Request account deletion. This is a request-only workflow for now and does not purge data immediately.
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
            {deletionError ? <p className="error-text">{deletionError}</p> : null}
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
            {deletionError ? <p className="error-text">{deletionError}</p> : null}
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
        <p className="muted">Mute or block content matching patterns.</p>

        <form onSubmit={handleAddFilter} className="filter-form">
          <input
            type="text"
            placeholder="Pattern (e.g. roblox)"
            required
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="input"
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value as FilterType)}>
            <option value="phrase">Phrase</option>
            <option value="regex">Regex</option>
          </select>
          <select value={newMode} onChange={(e) => setNewMode(e.target.value as FilterMode)}>
            <option value="mute">Mute</option>
            <option value="block">Block</option>
          </select>
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

        {filters.length === 0 ? (
          <p className="muted">No filter rules yet.</p>
        ) : (
          <table className="feed-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Breakout</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filters.map((rule) => (
                <tr key={rule.id}>
                  <td><code>{rule.pattern}</code></td>
                  <td>{rule.type}</td>
                  <td>{rule.mode}</td>
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
              ))}
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
