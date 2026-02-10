"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { cn } from "@/lib/cn";
import { getClusterDetail, getClusterAiSummary } from "@/lib/api";
import type { ClusterAiSummaryResponse, ClusterDetail } from "@rss-wrangler/contracts";

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

type ReaderMode = "feed" | "original" | "text";

const READER_MODE_STORAGE_KEY = "reader-mode-default";
const VALID_READER_MODES: ReadonlySet<string> = new Set(["feed", "original", "text"]);

function getStoredReaderMode(): ReaderMode | null {
  try {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(READER_MODE_STORAGE_KEY);
    if (stored && VALID_READER_MODES.has(stored)) {
      return stored as ReaderMode;
    }
  } catch {
    // SSR or storage unavailable
  }
  return null;
}

function setStoredReaderMode(mode: ReaderMode): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(READER_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable
  }
}

function storyTextStateLabel(detail: ClusterDetail): string {
  if (detail.storyTextSource === "extracted_full_text") {
    if (detail.storyExtractedAt) {
      return `Using extracted full text (${new Date(detail.storyExtractedAt).toLocaleString()}).`;
    }
    return "Using extracted full text.";
  }
  if (detail.storyTextSource === "summary_fallback") {
    return "Using feed summary fallback while full-text extraction catches up.";
  }
  return "No extracted text is available yet.";
}

function ClusterDetailView() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [readerMode, setReaderMode] = useState<ReaderMode>("feed");
  const [frameLoadFailed, setFrameLoadFailed] = useState(false);
  const [aiSummary, setAiSummary] = useState<ClusterAiSummaryResponse | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const handleSetReaderMode = useCallback((mode: ReaderMode) => {
    setReaderMode(mode);
    setStoredReaderMode(mode);
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setReaderMode("feed");
    setFrameLoadFailed(false);

    getClusterDetail(id).then((result) => {
      if (cancelled) return;
      setDetail(result);
      if (result) {
        // Priority: per-feed default > localStorage last-used > fallback
        const perFeedDefault = result.primaryFeedDefaultReaderMode;
        const storedDefault = getStoredReaderMode();
        const fallback = result.storyTextSource === "unavailable" ? "feed" : "text";

        const resolved = perFeedDefault ?? storedDefault ?? fallback;
        setReaderMode(resolved);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !detail || detail.members.length < 2) return;

    let cancelled = false;
    setAiSummaryLoading(true);

    getClusterAiSummary(id).then((result) => {
      if (cancelled) return;
      setAiSummary(result);
      setAiSummaryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, detail]);

  const primaryMember = useMemo(() => {
    if (!detail) return null;
    return detail.members.find((member) => isSafeUrl(member.url)) ?? null;
  }, [detail]);

  if (loading) {
    return <p className="muted">Loading story detail...</p>;
  }

  if (!detail) {
    return (
      <section className="cluster-detail-shell">
        <div className="section-card">
          <h1 className="page-title">Story not found</h1>
          <p className="muted">This cluster may have been removed or is no longer available.</p>
          <Link href="/" className="button button-muted">
            Back to feed
          </Link>
        </div>
      </section>
    );
  }

  const storyLabel = (detail.cluster.topicName ?? detail.cluster.folderName).toUpperCase();
  const storyText = detail.storySoFar ?? "No story summary is available yet.";
  const storyStateLabel = storyTextStateLabel(detail);
  const heroImage = detail.cluster.heroImageUrl && isSafeUrl(detail.cluster.heroImageUrl)
    ? detail.cluster.heroImageUrl
    : null;

  return (
    <section className="cluster-detail-shell">
      <div className="page-header cluster-detail-header">
        <div>
          <h1 className="page-title">Story Detail</h1>
          <p className="page-meta">
            <span className="count">{detail.members.length} outlets</span>
          </p>
        </div>
        <Link href="/" className="button button-muted">
          Back to feed
        </Link>
      </div>

      <article className="section-card cluster-detail-overview">
        <div className="cluster-detail-meta">
          <span className="badge">{storyLabel}</span>
          <span className="muted">{detail.cluster.primarySource}</span>
          <span className="muted">{relativeTime(detail.cluster.primarySourcePublishedAt)}</span>
          <span className="muted">{new Date(detail.cluster.primarySourcePublishedAt).toLocaleString()}</span>
        </div>

        <h2 className="cluster-detail-headline">{detail.cluster.headline}</h2>

        {heroImage && (
          <img
            className="cluster-detail-hero"
            src={heroImage}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
          />
        )}

        {detail.cluster.summary && <p className="cluster-detail-summary">{detail.cluster.summary}</p>}

        {primaryMember && (
          <div className="cluster-detail-actions-row">
            <a
              href={primaryMember.url}
              target="_blank"
              rel="noopener noreferrer"
              className="button"
            >
              Open primary source
            </a>
          </div>
        )}
      </article>

      {(aiSummaryLoading || aiSummary?.summary) && (
        <article className="section-card cluster-ai-summary-section">
          <h2 className="cluster-section-title">AI Summary</h2>
          {aiSummaryLoading ? (
            <div className="cluster-ai-summary-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line skeleton-line-short" />
            </div>
          ) : (
            <p className="cluster-story-text">{aiSummary?.summary}</p>
          )}
        </article>
      )}

      <article className="section-card cluster-story-section">
        <h2 className="cluster-section-title">Story so far</h2>
        <p className="muted cluster-story-state">{storyStateLabel}</p>
        <p className="cluster-story-text">{storyText}</p>
      </article>

      <article className="section-card cluster-reader-section">
        <div className="cluster-reader-header">
          <h2 className="cluster-section-title">Reader</h2>
          <div className="cluster-reader-mode-toggle" role="tablist" aria-label="Reader mode">
            <button
              type="button"
              role="tab"
              id="reader-tab-feed"
              aria-selected={readerMode === "feed"}
              aria-controls="reader-panel-feed"
              className={cn("button button-small", readerMode === "feed" && "button-active")}
              onClick={() => handleSetReaderMode("feed")}
            >
              Feed
            </button>
            <button
              type="button"
              role="tab"
              id="reader-tab-original"
              aria-selected={readerMode === "original"}
              aria-controls="reader-panel-original"
              className={cn("button button-small", readerMode === "original" && "button-active")}
              onClick={() => {
                setFrameLoadFailed(false);
                handleSetReaderMode("original");
              }}
              disabled={!primaryMember}
            >
              Original
            </button>
            <button
              type="button"
              role="tab"
              id="reader-tab-text"
              aria-selected={readerMode === "text"}
              aria-controls="reader-panel-text"
              className={cn("button button-small", readerMode === "text" && "button-active")}
              onClick={() => handleSetReaderMode("text")}
            >
              Text
            </button>
          </div>
        </div>

        {readerMode === "feed" && (
          <div id="reader-panel-feed" className="cluster-reader-panel" role="tabpanel" aria-labelledby="reader-tab-feed">
            <p className="cluster-story-text">
              {detail.cluster.summary ?? detail.storySoFar ?? "No feed preview is available for this story."}
            </p>
          </div>
        )}

        {readerMode === "original" && (
          <div id="reader-panel-original" className="cluster-reader-panel" role="tabpanel" aria-labelledby="reader-tab-original">
            {primaryMember ? (
              <>
                <div className="cluster-reader-frame-wrap">
                  <iframe
                    title={`Original article: ${primaryMember.title}`}
                    src={primaryMember.url}
                    className="cluster-reader-frame"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFrameLoadFailed(true)}
                  />
                </div>
                <div className="cluster-reader-actions">
                  <a
                    href={primaryMember.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button-small"
                  >
                    Open in new tab
                  </a>
                  {frameLoadFailed && (
                    <span className="muted">Embedded view was blocked; use open in new tab.</span>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">No original article URL is available for this cluster.</p>
            )}
          </div>
        )}

        {readerMode === "text" && (
          <div id="reader-panel-text" className="cluster-reader-panel" role="tabpanel" aria-labelledby="reader-tab-text">
            <p className="muted cluster-story-state">{storyStateLabel}</p>
            <p className="cluster-story-text">
              {detail.storySoFar ?? "No extracted text is available yet."}
            </p>
          </div>
        )}
      </article>

      <article className="section-card cluster-members-section">
        <h2 className="cluster-section-title">Outlets</h2>
        <ul className="cluster-members-list">
          {detail.members.map((member) => {
            const memberUrl = isSafeUrl(member.url) ? member.url : null;

            return (
              <li key={member.itemId} className="cluster-member-row">
                {memberUrl ? (
                  <a
                    href={memberUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cluster-member-title"
                  >
                    {member.title}
                  </a>
                ) : (
                  <span className="cluster-member-title">{member.title}</span>
                )}
                <p className="cluster-member-meta">
                  <span className="source-name">{member.sourceName.toUpperCase().replace(/ /g, "_")}</span>
                  <span className="source-sep">/</span>
                  <time dateTime={member.publishedAt}>{relativeTime(member.publishedAt)}</time>
                </p>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}

export default function ClusterDetailPage() {
  return (
    <ProtectedRoute>
      <ClusterDetailView />
    </ProtectedRoute>
  );
}
