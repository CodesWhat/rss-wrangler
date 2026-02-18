"use client";

import type { ClusterDetail } from "@rss-wrangler/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { XIcon } from "@/components/icons";
import { getClusterDetail } from "@/lib/api";
import { cn } from "@/lib/cn";

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

interface ReaderPanelProps {
  clusterId: string;
  onClose: () => void;
}

export function ReaderPanel({ clusterId, onClose }: ReaderPanelProps) {
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [readerMode, setReaderMode] = useState<ReaderMode>("feed");
  const [frameLoadFailed, setFrameLoadFailed] = useState(false);

  const handleSetReaderMode = useCallback((mode: ReaderMode) => {
    setReaderMode(mode);
    setStoredReaderMode(mode);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReaderMode("feed");
    setFrameLoadFailed(false);

    getClusterDetail(clusterId).then((result) => {
      if (cancelled) return;
      setDetail(result);
      if (result) {
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
  }, [clusterId]);

  const primaryMember = useMemo(() => {
    if (!detail) return null;
    return detail.members.find((member) => isSafeUrl(member.url)) ?? null;
  }, [detail]);

  if (loading) {
    return (
      <div className="reader-panel-content">
        <div className="reader-panel-toolbar">
          <span className="muted">Loading...</span>
          <button
            type="button"
            className="action-btn reader-panel-close"
            onClick={onClose}
            aria-label="Close reader"
            title="Close"
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="reader-panel-content">
        <div className="reader-panel-toolbar">
          <span className="muted">Story not found</span>
          <button
            type="button"
            className="action-btn reader-panel-close"
            onClick={onClose}
            aria-label="Close reader"
            title="Close"
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const storyLabel = (detail.cluster.topicName ?? detail.cluster.folderName).toUpperCase();
  const storyStateLabel = storyTextStateLabel(detail);
  const heroImage =
    detail.cluster.heroImageUrl && isSafeUrl(detail.cluster.heroImageUrl)
      ? detail.cluster.heroImageUrl
      : null;

  return (
    <div className="reader-panel-content">
      <div className="reader-panel-toolbar">
        <div className="cluster-reader-mode-toggle" role="tablist" aria-label="Reader mode">
          <button
            type="button"
            role="tab"
            aria-selected={readerMode === "feed"}
            className={cn("button button-small", readerMode === "feed" && "button-active")}
            onClick={() => handleSetReaderMode("feed")}
          >
            Feed
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={readerMode === "original"}
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
            aria-selected={readerMode === "text"}
            className={cn("button button-small", readerMode === "text" && "button-active")}
            onClick={() => handleSetReaderMode("text")}
          >
            Text
          </button>
        </div>
        <div className="reader-panel-toolbar-actions">
          <Link
            href={`/clusters/${clusterId}`}
            className="button button-small button-muted"
            title="Open full page"
          >
            Expand
          </Link>
          <button
            type="button"
            className="action-btn reader-panel-close"
            onClick={onClose}
            aria-label="Close reader"
            title="Close"
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="reader-panel-body">
        <div className="reader-panel-meta">
          <span className="badge">{storyLabel}</span>
          <span className="muted">{detail.cluster.primarySource}</span>
          <span className="muted">{relativeTime(detail.cluster.primarySourcePublishedAt)}</span>
        </div>

        <h2 className="reader-panel-headline">{detail.cluster.headline}</h2>

        <div className="reader-panel-byline">
          <span className="reader-panel-byline-source">{detail.cluster.primarySource}</span>
          <span className="reader-panel-byline-sep">/</span>
          <time dateTime={detail.cluster.primarySourcePublishedAt}>
            {formatDate(detail.cluster.primarySourcePublishedAt)}
          </time>
          {primaryMember && (
            <>
              <span className="reader-panel-byline-sep">/</span>
              <a
                href={primaryMember.url}
                target="_blank"
                rel="noopener noreferrer"
                className="reader-panel-byline-link"
              >
                View original &rarr;
              </a>
            </>
          )}
        </div>

        {heroImage && (
          <img
            className="reader-panel-hero"
            src={heroImage}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
          />
        )}

        {readerMode === "feed" && (
          <div className="reader-panel-tab-content">
            <p className="cluster-story-text">
              {detail.cluster.summary ??
                detail.storySoFar ??
                "No feed preview is available for this story."}
            </p>
          </div>
        )}

        {readerMode === "original" && (
          <div className="reader-panel-tab-content">
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
              <p className="muted">No original article URL is available.</p>
            )}
          </div>
        )}

        {readerMode === "text" && (
          <div className="reader-panel-tab-content">
            <p className="muted cluster-story-state">{storyStateLabel}</p>
            <p className="cluster-story-text">
              {detail.storySoFar ?? "No extracted text is available yet."}
            </p>
          </div>
        )}

        {detail.members.length > 1 && (
          <details className="reader-panel-outlets">
            <summary className="reader-panel-outlets-summary">
              {detail.members.length} outlets
            </summary>
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
                      <span className="source-name">
                        {member.sourceName.toUpperCase().replace(/ /g, "_")}
                      </span>
                      <span className="source-sep">/</span>
                      <time dateTime={member.publishedAt}>{relativeTime(member.publishedAt)}</time>
                    </p>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
