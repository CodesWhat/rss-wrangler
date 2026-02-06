"use client";

import { useMemo, useState, useEffect, useRef, useCallback, forwardRef } from "react";
import type { ClusterCard } from "@rss-wrangler/contracts";
import { markClusterRead, saveCluster, clusterFeedback, recordDwell } from "@/lib/api";
import type { ViewLayout } from "@/components/layout-toggle";
import { ShareMenu } from "@/components/share-menu";

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
  layout?: ViewLayout;
  selected?: boolean;
  wallabagUrl?: string;
  onRemove?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onToggleSave?: (id: string) => void;
}

export const StoryCard = forwardRef<HTMLElement, StoryCardProps>(
  function StoryCard({ cluster, layout = "card", selected, wallabagUrl, onRemove, onToggleRead, onToggleSave }, ref) {
    const [saved, setSaved] = useState(cluster.isSaved);
    const [read, setRead] = useState(cluster.isRead);
    const [busy, setBusy] = useState(false);

    const parsed = useMemo(() => parseSummary(cluster.summary), [cluster.summary]);

    // Dwell time tracking: measure how long the card is visible in viewport
    const dwellStart = useRef<number | null>(null);
    const dwellSent = useRef(false);

    const flushDwell = useCallback(() => {
      if (dwellSent.current || !dwellStart.current) return;
      const seconds = Math.round((Date.now() - dwellStart.current) / 1000);
      if (seconds >= 2) {
        dwellSent.current = true;
        recordDwell(cluster.id, seconds);
      }
    }, [cluster.id]);

    useEffect(() => {
      const el = typeof ref === "function" ? null : ref?.current;
      if (!el) {
        // No ref, start tracking immediately
        dwellStart.current = Date.now();
        return () => { flushDwell(); };
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            if (!dwellStart.current) dwellStart.current = Date.now();
          } else if (dwellStart.current) {
            flushDwell();
          }
        },
        { threshold: 0.5 }
      );
      observer.observe(el);

      return () => {
        observer.disconnect();
        flushDwell();
      };
    }, [ref, flushDwell]);

    async function handleSave() {
      if (busy) return;
      setBusy(true);
      const ok = await saveCluster(cluster.id);
      if (ok) setSaved(true);
      setBusy(false);
      onToggleSave?.(cluster.id);
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
      onToggleRead?.(cluster.id);
    }

    async function handleNotInterested() {
      if (busy) return;
      setBusy(true);
      const ok = await clusterFeedback(cluster.id, { type: "not_interested" });
      if (ok) onRemove?.(cluster.id);
      setBusy(false);
    }

    const headlineUrl = parsed.articleUrl;
    const className = `card layout-${layout}${selected ? " card-selected" : ""}`;

    const timeStr = new Date(cluster.primarySourcePublishedAt).toLocaleString();

    // ---------- List layout: single line ----------
    if (layout === "list") {
      return (
        <article className={className} ref={ref} data-cluster-id={cluster.id} data-article-url={headlineUrl ?? ""}>
          <div className="card-body card-body-list">
            <h2 className="list-headline">
              {headlineUrl ? (
                <a href={headlineUrl} target="_blank" rel="noopener noreferrer">
                  {cluster.headline}
                </a>
              ) : (
                cluster.headline
              )}
            </h2>
            <span className="muted list-meta">
              {cluster.primarySource} &middot; {timeStr}
            </span>
            <span className="badge">{cluster.folderName}</span>
          </div>
        </article>
      );
    }

    // ---------- Compact layout: two lines ----------
    if (layout === "compact") {
      return (
        <article className={className} ref={ref} data-cluster-id={cluster.id} data-article-url={headlineUrl ?? ""}>
          <div className="card-body card-body-compact">
            {cluster.heroImageUrl && (
              <img
                className="compact-thumb"
                src={cluster.heroImageUrl}
                alt={cluster.headline}
                loading="lazy"
              />
            )}
            <div className="compact-text">
              <h2 className="compact-headline">
                {headlineUrl ? (
                  <a href={headlineUrl} target="_blank" rel="noopener noreferrer">
                    {cluster.headline}
                  </a>
                ) : (
                  cluster.headline
                )}
              </h2>
              <p className="muted compact-meta">
                {parsed.cleanText
                  ? parsed.cleanText.length > 120
                    ? parsed.cleanText.slice(0, 120) + "..."
                    : parsed.cleanText
                  : ""}
                {parsed.cleanText ? " \u00b7 " : ""}
                {cluster.primarySource} &middot; {timeStr}
                <span className="badge compact-badge">{cluster.folderName}</span>
              </p>
            </div>
          </div>
        </article>
      );
    }

    // ---------- Card layout: default ----------
    return (
      <article className={className} ref={ref} data-cluster-id={cluster.id} data-article-url={headlineUrl ?? ""}>
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
            {timeStr}
            {cluster.outletCount > 1 ? ` \u00b7 +${cluster.outletCount - 1} outlets` : ""}
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
            {headlineUrl && (
              <ShareMenu articleUrl={headlineUrl} wallabagUrl={wallabagUrl} />
            )}
          </div>
        </div>
      </article>
    );
  }
);
