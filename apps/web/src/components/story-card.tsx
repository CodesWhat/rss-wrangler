"use client";

import { useMemo, useState } from "react";
import type { ClusterCard } from "@rss-wrangler/contracts";
import { markClusterRead, saveCluster, clusterFeedback } from "@/lib/api";

interface ParsedSummary {
  articleUrl: string | null;
  commentsUrl: string | null;
  points: string | null;
  commentCount: string | null;
  cleanText: string | null;
}

function parseSummary(summary: string | null): ParsedSummary {
  if (!summary) return { articleUrl: null, commentsUrl: null, points: null, commentCount: null, cleanText: null };

  let articleUrl: string | null = null;
  let commentsUrl: string | null = null;
  let points: string | null = null;
  let commentCount: string | null = null;

  const articleMatch = summary.match(/Article URL:\s*(https?:\/\/\S+)/i);
  if (articleMatch) articleUrl = articleMatch[1] ?? null;

  const commentsMatch = summary.match(/Comments URL:\s*(https?:\/\/\S+)/i);
  if (commentsMatch) commentsUrl = commentsMatch[1] ?? null;

  const pointsMatch = summary.match(/Points:\s*(\d+)/i);
  if (pointsMatch) points = pointsMatch[1] ?? null;

  const commentCountMatch = summary.match(/#\s*Comments:\s*(\d+)/i);
  if (commentCountMatch) commentCount = commentCountMatch[1] ?? null;

  // If we found HN-style metadata, remove it to get clean text
  const hasMetadata = articleMatch || commentsMatch || pointsMatch || commentCountMatch;
  let cleanText: string | null = null;
  if (hasMetadata) {
    cleanText = summary
      .replace(/Article URL:\s*https?:\/\/\S+/gi, "")
      .replace(/Comments URL:\s*https?:\/\/\S+/gi, "")
      .replace(/Points:\s*\d+/gi, "")
      .replace(/#\s*Comments:\s*\d+/gi, "")
      .replace(/\s+/g, " ")
      .trim() || null;
  } else {
    cleanText = summary;
  }

  return { articleUrl, commentsUrl, points, commentCount, cleanText };
}

interface StoryCardProps {
  cluster: ClusterCard;
  onRemove?: (id: string) => void;
}

export function StoryCard({ cluster, onRemove }: StoryCardProps) {
  const [saved, setSaved] = useState(cluster.isSaved);
  const [read, setRead] = useState(cluster.isRead);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseSummary(cluster.summary), [cluster.summary]);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    const ok = await saveCluster(cluster.id);
    if (ok) setSaved(true);
    setBusy(false);
  }

  async function handleMarkRead() {
    if (busy) return;
    setBusy(true);
    const ok = await markClusterRead(cluster.id);
    if (ok) {
      setRead(true);
      onRemove?.(cluster.id);
    }
    setBusy(false);
  }

  async function handleNotInterested() {
    if (busy) return;
    setBusy(true);
    const ok = await clusterFeedback(cluster.id, { type: "not_interested" });
    if (ok) onRemove?.(cluster.id);
    setBusy(false);
  }

  const headlineUrl = parsed.articleUrl;

  return (
    <article className="card">
      {cluster.heroImageUrl && (
        <img
          className="card-media"
          src={cluster.heroImageUrl}
          alt={cluster.headline}
          loading="lazy"
        />
      )}
      <div className="card-body">
        <h2>
          {headlineUrl ? (
            <a href={headlineUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
              {cluster.headline}
            </a>
          ) : (
            cluster.headline
          )}
        </h2>
        <p className="muted">
          {cluster.primarySource} &middot;{" "}
          {new Date(cluster.primarySourcePublishedAt).toLocaleString()}
          {cluster.outletCount > 1 ? ` · +${cluster.outletCount - 1} outlets` : ""}
        </p>
        {parsed.cleanText ? <p>{parsed.cleanText}</p> : null}
        <div className="row">
          <span className="badge">{cluster.folderName}</span>
          {parsed.points && <span className="badge">{parsed.points} pts</span>}
          {parsed.commentCount && (
            <span className="badge">
              {parsed.commentsUrl ? (
                <a href={parsed.commentsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                  {parsed.commentCount} comments
                </a>
              ) : (
                <>{parsed.commentCount} comments</>
              )}
            </span>
          )}
          {cluster.mutedBreakoutReason ? (
            <span className="badge badge-breakout">
              Muted topic breakout: {cluster.mutedBreakoutReason}
            </span>
          ) : null}
          {saved ? <span className="badge">Saved</span> : null}
          {read ? <span className="badge">Read</span> : <span className="badge">Unread</span>}
        </div>
        <div className="card-actions">
          {headlineUrl && (
            <a
              href={headlineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-small button-primary"
              style={{ textDecoration: "none" }}
            >
              Read article
            </a>
          )}
          {!saved && (
            <button
              type="button"
              className="button button-small"
              onClick={handleSave}
              disabled={busy}
            >
              Save
            </button>
          )}
          {!read && (
            <button
              type="button"
              className="button button-small"
              onClick={handleMarkRead}
              disabled={busy}
            >
              Mark read
            </button>
          )}
          <button
            type="button"
            className="button button-small button-muted"
            onClick={handleNotInterested}
            disabled={busy}
          >
            Not interested
          </button>
        </div>
      </div>
    </article>
  );
}
