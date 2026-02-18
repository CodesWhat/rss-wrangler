"use client";

import type {
  Feed,
  FeedRecommendation,
  FeedTopic,
  FeedWeight,
  Folder,
  MarkReadOnScroll,
  MarkReadOnScrollOverride,
  ReaderMode,
  Settings,
  Topic,
} from "@rss-wrangler/contracts";
import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  addFeed,
  dismissRecommendation,
  exportOpml,
  getFeedTopics,
  getRecommendations,
  getSettings,
  importOpml,
  listFeeds,
  listFolders,
  listTopics,
  pollFeedNow,
  updateFeed,
  updateSettings,
} from "@/lib/api";
import { cn } from "@/lib/cn";

const FEED_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function SourcesContent() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedUrl, setFeedUrl] = useState("");
  const [initialImportWindow, setInitialImportWindow] = useState<"24h" | "7d" | "30d" | "all">(
    "7d",
  );
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [feedTopics, setFeedTopics] = useState<Record<string, FeedTopic[]>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingAutoRead, setSavingAutoRead] = useState<string | null>(null);
  const [bulkFolderId, setBulkFolderId] = useState<string>("all");
  const [bulkTopicId, setBulkTopicId] = useState<string>("all");
  const [bulkWeight, setBulkWeight] = useState<FeedWeight | "all">("all");
  const [bulkMuted, setBulkMuted] = useState<"all" | "muted" | "active">("all");
  const [bulkTrial, setBulkTrial] = useState<"all" | "trial" | "non_trial">("all");
  const [bulkClassification, setBulkClassification] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [bulkMode, setBulkMode] = useState<MarkReadOnScroll | "default">("default");
  const [bulkDelayMs, setBulkDelayMs] = useState(1500);
  const [bulkThresholdPct, setBulkThresholdPct] = useState(60);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pollingFeedIds, setPollingFeedIds] = useState<Set<string>>(new Set());
  const [pollStatusByFeedId, setPollStatusByFeedId] = useState<Record<string, string>>({});
  const [recommendations, setRecommendations] = useState<FeedRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [subscribingRecIds, setSubscribingRecIds] = useState<Set<string>>(new Set());
  const [dismissingRecIds, setDismissingRecIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listFeeds(), listFolders(), getSettings(), listTopics()]).then(([f, fo, s, t]) => {
      setFeeds(f);
      setFolders(fo);
      setSettings(s);
      setTopics(t);
      setLoading(false);
      // Load topic proposals for feeds with non-approved classification status
      f.forEach((feed) => {
        if (feed.classificationStatus !== "approved") {
          getFeedTopics(feed.id).then((topics) => {
            setFeedTopics((prev) => ({ ...prev, [feed.id]: topics }));
          });
        }
      });
      // Load recommendations if user has enough feeds
      if (f.length >= 3) {
        getRecommendations()
          .then((recs) => {
            setRecommendations(recs);
            setRecsLoading(false);
          })
          .catch(() => setRecsLoading(false));
      } else {
        setRecsLoading(false);
      }
    });
  }, []);

  function folderName(id: string): string {
    return folders.find((f) => f.id === id)?.name ?? "Unknown";
  }

  async function handleAddFeed(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddBusy(true);
    const feed = await addFeed(feedUrl);
    if (feed) {
      setFeeds((prev) => [...prev, feed]);
      setFeedUrl("");
      const lookbackDays =
        initialImportWindow === "24h"
          ? 1
          : initialImportWindow === "7d"
            ? 7
            : initialImportWindow === "30d"
              ? 30
              : undefined;
      const importLabel =
        initialImportWindow === "24h"
          ? "last 24h"
          : initialImportWindow === "7d"
            ? "last 7d"
            : initialImportWindow === "30d"
              ? "last 30d"
              : "all available history";

      setPollingFeedIds((prev) => {
        const next = new Set(prev);
        next.add(feed.id);
        return next;
      });

      const queued = await pollFeedNow(feed.id, lookbackDays ? { lookbackDays } : {});
      setPollStatusByFeedId((prev) => ({
        ...prev,
        [feed.id]: queued
          ? `Initial import queued (${importLabel}).`
          : "Feed added, but initial import failed to queue.",
      }));

      setPollingFeedIds((prev) => {
        const next = new Set(prev);
        next.delete(feed.id);
        return next;
      });

      if (!queued) {
        setAddError(
          "Feed added, but initial import failed to queue. Use Refresh now from the feed row.",
        );
      }
    } else {
      setAddError("Failed to add feed. Check URL and try again.");
    }
    setAddBusy(false);
  }

  async function handleOpmlImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setImportMsg("Importing...");
    const result = await importOpml(file);
    if (result) {
      setImportMsg(`Imported ${result.imported} feeds.`);
      const refreshed = await listFeeds();
      setFeeds(refreshed);
    } else {
      setImportMsg("Import failed.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleWeightChange(feed: Feed, weight: FeedWeight) {
    const updated = await updateFeed(feed.id, { weight });
    if (updated) {
      setFeeds((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  async function handleToggleMute(feed: Feed) {
    const updated = await updateFeed(feed.id, { muted: !feed.muted });
    if (updated) {
      setFeeds((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  async function handleReaderModeChange(feed: Feed, mode: ReaderMode | "default") {
    const defaultReaderMode: ReaderMode | null = mode === "default" ? null : mode;
    const updated = await updateFeed(feed.id, { defaultReaderMode });
    if (updated) {
      setFeeds((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  async function handlePollNow(feedId: string) {
    if (pollingFeedIds.has(feedId)) return;

    setPollingFeedIds((prev) => {
      const next = new Set(prev);
      next.add(feedId);
      return next;
    });
    setPollStatusByFeedId((prev) => ({ ...prev, [feedId]: "" }));

    const queued = await pollFeedNow(feedId);
    setPollStatusByFeedId((prev) => ({
      ...prev,
      [feedId]: queued ? "Queued." : "Failed to queue poll.",
    }));

    setPollingFeedIds((prev) => {
      const next = new Set(prev);
      next.delete(feedId);
      return next;
    });
  }

  function closeFeedActionMenu(event: MouseEvent<HTMLElement>) {
    const details = event.currentTarget.closest("details");
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  }

  function badgeClass(status: string): string {
    if (status === "approved") return "badge badge-approved";
    if (status === "pending") return "badge badge-pending";
    if (status === "rejected") return "badge badge-rejected";
    return "badge";
  }

  function getAutoReadOverride(feedId: string): MarkReadOnScrollOverride | undefined {
    return settings?.markReadOnScrollFeedOverrides?.[feedId];
  }

  function getAutoReadMode(feedId: string): MarkReadOnScroll | "default" {
    return getAutoReadOverride(feedId)?.mode ?? "default";
  }

  function toTimestamp(value: string | null): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function formatLocalDateTime(value: string | null): string {
    if (!value) return "never";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "unknown";
    return parsed.toLocaleString();
  }

  function formatFailureStage(stage: Feed["lastParseFailureStage"]): string {
    if (!stage) return "Unknown failure";
    if (stage === "url_validation") return "URL validation";
    if (stage === "network_or_unknown") return "Network";
    if (stage === "parse") return "Parse";
    return "HTTP";
  }

  function summarizeFeedHealth(feed: Feed): {
    label: string;
    badgeClass: string;
    detail: string;
    error: string | null;
  } {
    const now = Date.now();
    const lastPolledTs = toTimestamp(feed.lastPolledAt);
    const lastSuccessTs = toTimestamp(feed.lastParseSuccessAt);
    const lastFailureTs = toTimestamp(feed.lastParseFailureAt);
    const latestWasFailure =
      lastFailureTs !== null && (lastSuccessTs === null || lastFailureTs >= lastSuccessTs);

    if (latestWasFailure) {
      const error = feed.lastParseFailureError
        ? feed.lastParseFailureError.trim().slice(0, 140)
        : null;
      return {
        label: "Failing",
        badgeClass: "badge badge-rejected",
        detail: `${formatFailureStage(feed.lastParseFailureStage)} • ${formatLocalDateTime(feed.lastParseFailureAt)}`,
        error,
      };
    }

    if (lastSuccessTs !== null) {
      const staleBySuccess = now - lastSuccessTs > FEED_STALE_THRESHOLD_MS;
      const staleByPoll = lastPolledTs !== null && now - lastPolledTs > FEED_STALE_THRESHOLD_MS;
      if (staleBySuccess || staleByPoll) {
        return {
          label: "Stale",
          badgeClass: "badge badge-pending",
          detail: `Last success ${formatLocalDateTime(feed.lastParseSuccessAt)}`,
          error: null,
        };
      }
      return {
        label: "Healthy",
        badgeClass: "badge badge-approved",
        detail: `Last success ${formatLocalDateTime(feed.lastParseSuccessAt)}`,
        error: null,
      };
    }

    if (lastPolledTs !== null) {
      return {
        label: "Pending",
        badgeClass: "badge",
        detail: `Last poll ${formatLocalDateTime(feed.lastPolledAt)}`,
        error: null,
      };
    }

    return {
      label: "Never polled",
      badgeClass: "badge",
      detail: "No poll recorded yet",
      error: null,
    };
  }

  async function updateAutoReadOverride(feedId: string, patch: MarkReadOnScrollOverride | null) {
    if (!settings) return;
    setSavingAutoRead(feedId);
    const current = settings.markReadOnScrollFeedOverrides ?? {};
    const next: Record<string, MarkReadOnScrollOverride> = { ...current };
    if (patch === null) {
      delete next[feedId];
    } else {
      next[feedId] = { ...next[feedId], ...patch };
    }
    const updated = await updateSettings({ markReadOnScrollFeedOverrides: next });
    if (updated) {
      setSettings(updated);
    } else {
      setSettings({ ...settings, markReadOnScrollFeedOverrides: next });
    }
    setSavingAutoRead(null);
  }

  async function applyBulkAutoRead() {
    if (!settings || bulkBusy) return;
    setBulkBusy(true);
    const current = settings.markReadOnScrollFeedOverrides ?? {};
    const next: Record<string, MarkReadOnScrollOverride> = { ...current };
    const targetFeeds = feeds.filter((feed) => {
      const folderMatch = bulkFolderId === "all" || feed.folderId === bulkFolderId;
      if (!folderMatch) return false;
      if (bulkWeight !== "all" && feed.weight !== bulkWeight) return false;
      if (bulkMuted === "muted" && !feed.muted) return false;
      if (bulkMuted === "active" && feed.muted) return false;
      if (bulkTrial === "trial" && !feed.trial) return false;
      if (bulkTrial === "non_trial" && feed.trial) return false;
      if (bulkClassification !== "all" && feed.classificationStatus !== bulkClassification)
        return false;
      if (bulkTopicId === "all") return true;
      const topicList = feedTopics[feed.id] ?? [];
      return topicList.some((topic) => topic.topicId === bulkTopicId);
    });
    for (const feed of targetFeeds) {
      if (bulkMode === "default") {
        delete next[feed.id];
        continue;
      }
      const override: MarkReadOnScrollOverride = { mode: bulkMode };
      if (bulkMode === "on_scroll") {
        override.delayMs = bulkDelayMs;
        override.threshold = Math.min(Math.max(bulkThresholdPct / 100, 0), 1);
      }
      next[feed.id] = { ...next[feed.id], ...override };
    }
    const updated = await updateSettings({ markReadOnScrollFeedOverrides: next });
    if (updated) {
      setSettings(updated);
    } else {
      setSettings({ ...settings, markReadOnScrollFeedOverrides: next });
    }
    setBulkBusy(false);
  }

  async function handleSubscribeRecommendation(rec: FeedRecommendation) {
    if (subscribingRecIds.has(rec.id)) return;
    setSubscribingRecIds((prev) => {
      const next = new Set(prev);
      next.add(rec.id);
      return next;
    });
    const feed = await addFeed(rec.feedUrl);
    if (feed) {
      setFeeds((prev) => [...prev, feed]);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    }
    setSubscribingRecIds((prev) => {
      const next = new Set(prev);
      next.delete(rec.id);
      return next;
    });
  }

  async function handleDismissRecommendation(rec: FeedRecommendation) {
    if (dismissingRecIds.has(rec.id)) return;
    setDismissingRecIds((prev) => {
      const next = new Set(prev);
      next.add(rec.id);
      return next;
    });
    const ok = await dismissRecommendation(rec.id);
    if (ok) {
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    }
    setDismissingRecIds((prev) => {
      const next = new Set(prev);
      next.delete(rec.id);
      return next;
    });
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Sources</h1>
        <p className="page-meta">Manage feed assignment, weights, and trial sources.</p>
      </div>

      {feeds.length >= 3 && (
        <section className="section-card">
          <div className="row">
            <h2>Recommended for you</h2>
          </div>
          {recsLoading ? (
            <div className="recommendation-skeleton">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          ) : recommendations.length === 0 ? (
            <p className="muted">
              {feeds.length < 3
                ? "Subscribe to more feeds to get recommendations"
                : "No new recommendations right now. Check back later!"}
            </p>
          ) : (
            <div className="recommendation-grid">
              {recommendations.map((rec) => (
                <div key={rec.id} className="recommendation-card">
                  <div className="recommendation-card-header">
                    <strong>{rec.title}</strong>
                    <span className="badge">{rec.category}</span>
                  </div>
                  {rec.description ? (
                    <p className="recommendation-card-desc">{rec.description}</p>
                  ) : null}
                  {rec.reason ? (
                    <p className="recommendation-card-reason muted">{rec.reason}</p>
                  ) : null}
                  <div className="recommendation-card-actions">
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => void handleSubscribeRecommendation(rec)}
                      disabled={subscribingRecIds.has(rec.id)}
                    >
                      {subscribingRecIds.has(rec.id) ? "Subscribing..." : "Subscribe"}
                    </button>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => void handleDismissRecommendation(rec)}
                      disabled={dismissingRecIds.has(rec.id)}
                    >
                      {dismissingRecIds.has(rec.id) ? "Dismissing..." : "Dismiss"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="section-card">
        <div className="row">
          <h2>Bulk auto-read overrides</h2>
        </div>
        <div className="row">
          <label className="stack">
            <span className="muted">Folder</span>
            <select value={bulkFolderId} onChange={(e) => setBulkFolderId(e.target.value)}>
              <option value="all">All folders</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span className="muted">Topic</span>
            <select value={bulkTopicId} onChange={(e) => setBulkTopicId(e.target.value)}>
              <option value="all">All topics</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span className="muted">Weight</span>
            <select
              value={bulkWeight}
              onChange={(e) => setBulkWeight(e.target.value as FeedWeight | "all")}
            >
              <option value="all">All weights</option>
              <option value="prefer">Prefer</option>
              <option value="neutral">Neutral</option>
              <option value="deprioritize">Deprioritize</option>
            </select>
          </label>
          <label className="stack">
            <span className="muted">Muted</span>
            <select
              value={bulkMuted}
              onChange={(e) => setBulkMuted(e.target.value as typeof bulkMuted)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="muted">Muted</option>
            </select>
          </label>
          <label className="stack">
            <span className="muted">Trial</span>
            <select
              value={bulkTrial}
              onChange={(e) => setBulkTrial(e.target.value as typeof bulkTrial)}
            >
              <option value="all">All</option>
              <option value="trial">Trial</option>
              <option value="non_trial">Non-trial</option>
            </select>
          </label>
          <label className="stack">
            <span className="muted">Classification</span>
            <select
              value={bulkClassification}
              onChange={(e) => setBulkClassification(e.target.value as typeof bulkClassification)}
            >
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="stack">
            <span className="muted">Mode</span>
            <select
              value={bulkMode}
              onChange={(e) => setBulkMode(e.target.value as MarkReadOnScroll | "default")}
            >
              <option value="default">Default</option>
              <option value="off">Off</option>
              <option value="on_scroll">On scroll</option>
              <option value="on_open">On open</option>
            </select>
          </label>
          {bulkMode === "on_scroll" ? (
            <>
              <label className="stack">
                <span className="muted">Delay (ms)</span>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={bulkDelayMs}
                  onChange={(e) => setBulkDelayMs(Number(e.target.value))}
                  className="input input-compact"
                />
              </label>
              <label className="stack">
                <span className="muted">Threshold (%)</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  step={5}
                  value={bulkThresholdPct}
                  onChange={(e) => setBulkThresholdPct(Number(e.target.value))}
                  className="input input-compact"
                />
              </label>
            </>
          ) : null}
          <button
            type="button"
            className="button button-primary"
            onClick={applyBulkAutoRead}
            disabled={bulkBusy || feeds.length === 0}
          >
            {bulkBusy ? "Applying..." : "Apply"}
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="source-actions">
          <form onSubmit={handleAddFeed} className="add-feed-form">
            <input
              type="url"
              placeholder="https://example.com/feed.xml"
              required
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              className="input"
              aria-label="Feed URL"
            />
            <select
              value={initialImportWindow}
              onChange={(e) =>
                setInitialImportWindow(e.target.value as "24h" | "7d" | "30d" | "all")
              }
              aria-label="Initial import window"
            >
              <option value="24h">Initial import: Last 24h</option>
              <option value="7d">Initial import: Last 7d</option>
              <option value="30d">Initial import: Last 30d</option>
              <option value="all">Initial import: All available</option>
            </select>
            <button type="submit" className="button button-primary" disabled={addBusy}>
              {addBusy ? "Adding..." : "Add & import"}
            </button>
          </form>
          {addError ? (
            <p className="error-text" role="alert">
              {addError}
            </p>
          ) : null}

          <div className="opml-import">
            <label className="muted">OPML import:</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              aria-label="OPML file to import"
              onChange={handleOpmlImport}
            />
            {importMsg ? <p className="muted">{importMsg}</p> : null}
          </div>

          <div className="opml-export">
            <button type="button" className="button" onClick={() => exportOpml()}>
              Export OPML
            </button>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading feeds...</p>
        ) : feeds.length === 0 ? (
          <p>No feeds added yet. Add a URL or import OPML above.</p>
        ) : (
          <table className="feed-table" aria-label="Feed sources">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Topics</th>
                <th scope="col">Weight</th>
                <th scope="col">Muted</th>
                <th scope="col">Reader</th>
                <th scope="col">Health</th>
                <th scope="col">Auto-read</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => {
                const health = summarizeFeedHealth(feed);
                return (
                  <tr key={feed.id}>
                    <td className="feed-title-cell">
                      <div className="feed-title-row">
                        <div>
                          <strong>{feed.title || feed.url}</strong>
                          {feed.trial && <span className="badge badge-ml">Trial</span>}
                        </div>
                        <details className="feed-row-actions">
                          <summary
                            className="button button-small"
                            aria-label={`Actions for ${feed.title || feed.url}`}
                          >
                            Actions
                          </summary>
                          <div className="feed-row-actions-popover">
                            <button
                              type="button"
                              className="feed-row-action-item"
                              onClick={(event) => {
                                closeFeedActionMenu(event);
                                void handlePollNow(feed.id);
                              }}
                              disabled={pollingFeedIds.has(feed.id)}
                            >
                              {pollingFeedIds.has(feed.id) ? "Queueing refresh..." : "Refresh now"}
                            </button>
                            <a
                              href={feed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="feed-row-action-item"
                              onClick={(event) => closeFeedActionMenu(event)}
                            >
                              Open feed URL
                            </a>
                          </div>
                        </details>
                      </div>
                      {pollStatusByFeedId[feed.id] ? (
                        <p
                          className={
                            pollStatusByFeedId[feed.id]?.toLowerCase().includes("failed")
                              ? "error-text"
                              : "muted"
                          }
                        >
                          {pollStatusByFeedId[feed.id]}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {feedTopics[feed.id]?.map((ft) => (
                        <span key={ft.topicId} className={cn(badgeClass(ft.status), "badge-mr")}>
                          {ft.topicName}
                        </span>
                      )) ?? null}
                      {feed.classificationStatus !== "approved" && (
                        <a href="/topics/pending" className="badge badge-ml-sm">
                          Pending
                        </a>
                      )}
                      {(!feedTopics[feed.id] || (feedTopics[feed.id]?.length ?? 0) === 0) &&
                        feed.classificationStatus === "approved" && (
                          <span className="muted">{folderName(feed.folderId)}</span>
                        )}
                    </td>
                    <td>
                      <select
                        value={feed.weight}
                        onChange={(e) => handleWeightChange(feed, e.target.value as FeedWeight)}
                        aria-label={`Weight for ${feed.title || feed.url}`}
                      >
                        <option value="prefer">Prefer</option>
                        <option value="neutral">Neutral</option>
                        <option value="deprioritize">Deprioritize</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={cn("button button-small", feed.muted && "button-active")}
                        onClick={() => handleToggleMute(feed)}
                        aria-pressed={feed.muted}
                        aria-label={`${feed.muted ? "Unmute" : "Mute"} ${feed.title || feed.url}`}
                      >
                        {feed.muted ? "Muted" : "Active"}
                      </button>
                    </td>
                    <td>
                      <select
                        value={feed.defaultReaderMode ?? "default"}
                        onChange={(e) =>
                          handleReaderModeChange(feed, e.target.value as ReaderMode | "default")
                        }
                        aria-label="Default reader mode"
                      >
                        <option value="default">Default</option>
                        <option value="feed">Feed</option>
                        <option value="original">Original</option>
                        <option value="text">Text</option>
                      </select>
                    </td>
                    <td className="feed-health-cell">
                      <div className="stack">
                        <span className={health.badgeClass}>{health.label}</span>
                        <span className="feed-health-meta">{health.detail}</span>
                        {health.error ? (
                          <span className="feed-health-error">{health.error}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="stack">
                        <select
                          value={getAutoReadMode(feed.id)}
                          onChange={(e) => {
                            const value = e.target.value as MarkReadOnScroll | "default";
                            if (value === "default") {
                              void updateAutoReadOverride(feed.id, null);
                            } else {
                              void updateAutoReadOverride(feed.id, { mode: value });
                            }
                          }}
                          aria-label={`Auto-read mode for ${feed.title || feed.url}`}
                        >
                          <option value="default">Default</option>
                          <option value="off">Off</option>
                          <option value="on_scroll">On scroll</option>
                          <option value="on_open">On open</option>
                        </select>
                        {getAutoReadMode(feed.id) === "on_scroll" ? (
                          <div className="row">
                            <input
                              type="number"
                              min={0}
                              max={5000}
                              step={100}
                              value={
                                getAutoReadOverride(feed.id)?.delayMs ??
                                settings?.markReadOnScrollCardDelayMs ??
                                1500
                              }
                              onChange={(e) =>
                                void updateAutoReadOverride(feed.id, {
                                  delayMs: Number(e.target.value),
                                })
                              }
                              className="input input-compact"
                              aria-label="Auto-read delay (ms)"
                            />
                            <input
                              type="number"
                              min={10}
                              max={100}
                              step={5}
                              value={Math.round(
                                (getAutoReadOverride(feed.id)?.threshold ??
                                  settings?.markReadOnScrollCardThreshold ??
                                  0.6) * 100,
                              )}
                              onChange={(e) =>
                                void updateAutoReadOverride(feed.id, {
                                  threshold: Number(e.target.value) / 100,
                                })
                              }
                              className="input input-compact"
                              aria-label="Auto-read threshold (%)"
                            />
                          </div>
                        ) : null}
                        {savingAutoRead === feed.id ? (
                          <span className="muted">Saving...</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function SourcesPage() {
  return (
    <ProtectedRoute>
      <SourcesContent />
    </ProtectedRoute>
  );
}
