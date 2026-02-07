"use client";

import { memo, useMemo, useState, useEffect, useRef, useCallback, forwardRef } from "react";
import type { ClusterCard } from "@rss-wrangler/contracts";
import { markClusterRead, saveCluster, clusterFeedback, recordDwell } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ViewLayout } from "@/components/layout-toggle";
import { ShareMenu } from "@/components/share-menu";
import { AnnotationToolbar } from "@/components/annotation-toolbar";
import { BookmarkIcon, CheckIcon, XIcon } from "@/components/icons";

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

function isSafeUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const TOPIC_SLUG_MAP: Record<string, string> = {
  technology: "tech",
  tech: "tech",
  gaming: "gaming",
  games: "gaming",
  culture: "culture",
  entertainment: "culture",
  science: "science",
  business: "biz",
  biz: "biz",
  finance: "biz",
  security: "security",
  cybersecurity: "security",
};

function topicSlug(name: string | null): string | undefined {
  if (!name) return undefined;
  return TOPIC_SLUG_MAP[name.toLowerCase()];
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
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

export const StoryCard = memo(
  forwardRef<HTMLElement, StoryCardProps>(
  function StoryCard({ cluster, layout = "card", selected, wallabagUrl, onRemove, onToggleRead, onToggleSave }, ref) {
    const [saved, setSaved] = useState(cluster.isSaved);
    const [read, setRead] = useState(cluster.isRead);
    const [busy, setBusy] = useState(false);

    const parsed = useMemo(() => parseSummary(cluster.summary), [cluster.summary]);

    // Dwell time tracking: measure how long the card is visible in viewport
    const cardBodyRef = useRef<HTMLDivElement>(null);
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
      try {
        const ok = await saveCluster(cluster.id);
        if (ok) setSaved(true);
        onToggleSave?.(cluster.id);
      } catch (err) {
        console.error("handleSave failed", err);
      } finally {
        setBusy(false);
      }
    }

    async function handleMarkRead() {
      if (busy) return;
      setBusy(true);
      try {
        const ok = await markClusterRead(cluster.id);
        if (ok) {
          setRead(true);
          onRemove?.(cluster.id);
        }
        onToggleRead?.(cluster.id);
      } catch (err) {
        console.error("handleMarkRead failed", err);
      } finally {
        setBusy(false);
      }
    }

    async function handleNotInterested() {
      if (busy) return;
      setBusy(true);
      try {
        const ok = await clusterFeedback(cluster.id, { type: "not_interested" });
        if (ok) onRemove?.(cluster.id);
      } catch (err) {
        console.error("handleNotInterested failed", err);
      } finally {
        setBusy(false);
      }
    }

    const headlineUrl = parsed.articleUrl;
    const slug = topicSlug(cluster.topicName);
    const timeAgo = relativeTime(cluster.primarySourcePublishedAt);
    const topicDisplay = (cluster.topicName ?? "UNCATEGORIZED").toUpperCase();

    // ---------- List layout: single line ----------
    if (layout === "list") {
      const listClasses = cn("story-card", read && "is-read", selected && "card-selected");
      return (
        <article
          className={listClasses}
          ref={ref}
          data-cluster-id={cluster.id}
          data-article-url={headlineUrl ?? ""}
          data-topic={slug}
        >
          <div className="story-source">
            {!read && <span className="unread-marker" />}
            <span className="source-name">{cluster.primarySource.toUpperCase().replace(/ /g, "_")}</span>
            <span className="source-sep">/</span>
            <span className="story-time">{timeAgo}</span>
          </div>
          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a href={headlineUrl!} target="_blank" rel="noopener noreferrer">
                {cluster.headline}
              </a>
            ) : (
              cluster.headline
            )}
          </h2>
        </article>
      );
    }

    // ---------- Compact layout: two lines ----------
    if (layout === "compact") {
      const compactClasses = cn("story-card", read && "is-read", selected && "card-selected");
      return (
        <article
          className={compactClasses}
          ref={ref}
          data-cluster-id={cluster.id}
          data-article-url={headlineUrl ?? ""}
          data-topic={slug}
        >
          <div className="story-source">
            {!read && <span className="unread-marker" />}
            <span className="source-name">{cluster.primarySource.toUpperCase().replace(/ /g, "_")}</span>
            <span className="source-sep">/</span>
            <span className="story-time">{timeAgo}</span>
          </div>
          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a href={headlineUrl!} target="_blank" rel="noopener noreferrer">
                {cluster.headline}
              </a>
            ) : (
              cluster.headline
            )}
          </h2>
          {parsed.cleanText && <p className="story-summary">{parsed.cleanText}</p>}
        </article>
      );
    }

    // ---------- Card layout: default ----------
    const cardClasses = cn("story-card", read && "is-read", selected && "card-selected");

    return (
      <article
        className={cardClasses}
        ref={ref}
        data-cluster-id={cluster.id}
        data-article-url={headlineUrl ?? ""}
        data-topic={slug}
      >
        <div className="story-source">
          {!read && <span className="unread-marker" />}
          <span className="source-name">{cluster.primarySource.toUpperCase().replace(/ /g, "_")}</span>
          <span className="source-sep">/</span>
          <span className="story-time">{timeAgo}</span>
        </div>

        <div ref={cardBodyRef} className="story-card-body">
          <AnnotationToolbar clusterId={cluster.id} containerRef={cardBodyRef} />

          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a href={headlineUrl!} target="_blank" rel="noopener noreferrer">
                {cluster.headline}
              </a>
            ) : (
              cluster.headline
            )}
          </h2>

          {parsed.cleanText && <p className="story-summary">{parsed.cleanText}</p>}
        </div>

        <div className="story-footer">
          <span className={cn("story-tag", slug && `tag-${slug}`)}>{topicDisplay}</span>
          {cluster.mutedBreakoutReason && (
            <span className="story-tag tag-trending">TRENDING</span>
          )}

          <div className="story-actions">
            <button
              type="button"
              className={cn("action-btn", saved && "saved")}
              onClick={handleSave}
              disabled={busy}
              aria-label={saved ? "Saved" : "Save"}
              title={saved ? "Saved" : "Save"}
            >
              <BookmarkIcon />
            </button>
            {!read && (
              <button
                type="button"
                className="action-btn"
                onClick={handleMarkRead}
                disabled={busy}
                aria-label="Mark read"
                title="Mark read"
              >
                <CheckIcon />
              </button>
            )}
            <button
              type="button"
              className="action-btn"
              onClick={handleNotInterested}
              disabled={busy}
              aria-label="Not interested"
              title="Not interested"
            >
              <XIcon />
            </button>
            {isSafeUrl(headlineUrl) && (
              <ShareMenu articleUrl={headlineUrl!} wallabagUrl={wallabagUrl} />
            )}
          </div>
        </div>
      </article>
    );
  }
));
