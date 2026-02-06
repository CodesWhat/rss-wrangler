"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
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
  FilterType,
  FilterMode,
} from "@rss-wrangler/contracts";

function SettingsContent() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // New filter form
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<FilterType>("phrase");
  const [newMode, setNewMode] = useState<FilterMode>("mute");
  const [newBreakout, setNewBreakout] = useState(true);
  const [filterBusy, setFilterBusy] = useState(false);

  useEffect(() => {
    Promise.all([getSettings(), listFilters()]).then(([s, f]) => {
      setSettings(s);
      setFilters(f);
      setLoading(false);
    });
  }, []);

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveMsg("");
    const result = await updateSettings(settings);
    if (result) {
      setSettings(result);
      setSaveMsg("Settings saved.");
    } else {
      setSaveMsg("Failed to save settings.");
    }
    setSaving(false);
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

  if (loading || !settings) {
    return <p className="muted">Loading settings...</p>;
  }

  return (
    <div className="settings-layout">
      <section className="section-card">
        <h1>Settings</h1>
        <form onSubmit={handleSaveSettings} className="settings-form">
          <label>
            AI mode
            <select
              value={settings.aiMode}
              onChange={(e) => setSettings({ ...settings, aiMode: e.target.value as AiMode })}
            >
              <option value="off">Off</option>
              <option value="summaries_digest">Summaries + Digest</option>
              <option value="full">Full</option>
            </select>
          </label>

          <label>
            AI provider
            <select
              value={settings.aiProvider}
              onChange={(e) =>
                setSettings({ ...settings, aiProvider: e.target.value as AiProvider })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="local">Local</option>
            </select>
          </label>

          <label>
            Monthly AI cap ($)
            <input
              type="number"
              min={0}
              step={1}
              value={settings.monthlyAiCapUsd}
              onChange={(e) =>
                setSettings({ ...settings, monthlyAiCapUsd: Number(e.target.value) })
              }
              className="input"
            />
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.aiFallbackToLocal}
              onChange={(e) =>
                setSettings({ ...settings, aiFallbackToLocal: e.target.checked })
              }
            />
            Fallback to local on cap hit
          </label>

          <label>
            Digest away trigger (hours)
            <input
              type="number"
              min={1}
              value={settings.digestAwayHours}
              onChange={(e) =>
                setSettings({ ...settings, digestAwayHours: Number(e.target.value) })
              }
              className="input"
            />
          </label>

          <label>
            Digest backlog threshold
            <input
              type="number"
              min={1}
              value={settings.digestBacklogThreshold}
              onChange={(e) =>
                setSettings({ ...settings, digestBacklogThreshold: Number(e.target.value) })
              }
              className="input"
            />
          </label>

          <label>
            Feed poll interval (minutes)
            <input
              type="number"
              min={5}
              value={settings.feedPollMinutes}
              onChange={(e) =>
                setSettings({ ...settings, feedPollMinutes: Number(e.target.value) })
              }
              className="input"
            />
          </label>

          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </button>
          {saveMsg ? <p className="muted">{saveMsg}</p> : null}
        </form>
      </section>

      <section className="section-card">
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
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
