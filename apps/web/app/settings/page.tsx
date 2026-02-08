"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { NotificationToggle } from "@/components/notification-toggle";
import {
  cancelAccountDeletion,
  changePassword,
  getAccountDeletionStatus,
  requestAccountDeletion,
  getSettings,
  updateSettings,
  listFilters,
  createFilter,
  deleteFilter,
} from "@/lib/api";
import type {
  Settings,
  FilterRule,
  AiMode,
  AiProvider,
  AccountDeletionStatus,
  FilterType,
  FilterMode,
} from "@rss-wrangler/contracts";

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
