"use client";

import type {
  ClusterCard,
  Feed,
  MarkReadOnScroll,
  MarkReadOnScrollOverride,
} from "@rss-wrangler/contracts";
import Link from "next/link";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotationToolbar } from "@/components/annotation-toolbar";
import {
  BookmarkIcon,
  CheckIcon,
  ChevronRightIcon,
  FilterIcon,
  InfoIcon,
  MoreHorizontalIcon,
  StarIcon,
  VolumeXIcon,
  XIcon,
} from "@/components/icons";
import type { ViewLayout } from "@/components/layout-toggle";
import { ShareMenu } from "@/components/share-menu";
import {
  clusterFeedback,
  createFilter,
  listFilters,
  markClusterRead,
  recordAutoReadEvent,
  recordDwell,
  saveCluster,
  updateFeed,
} from "@/lib/api";
import { cn } from "@/lib/cn";

interface ParsedSummary {
  articleUrl: string | null;
  commentsUrl: string | null;
  points: string | null;
  commentCount: string | null;
  cleanText: string | null;
}

function parseSummary(summary: string | null): ParsedSummary {
  if (!summary)
    return {
      articleUrl: null,
      commentsUrl: null,
      points: null,
      commentCount: null,
      cleanText: null,
    };

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
    cleanText =
      summary
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

function outletBadgeLabel(outletCount: number): string | null {
  if (outletCount <= 1) return null;
  const additional = outletCount - 1;
  return additional === 1 ? "+1 outlet" : `+${additional} outlets`;
}

function normalizeFilterPattern(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function keywordSeedFromHeadline(headline: string): string {
  const cleaned = normalizeFilterPattern(headline.replace(/[^a-z0-9\s'-]/gi, " "));
  if (cleaned.length === 0) return "";
  const words = cleaned.split(" ");
  return words.slice(0, Math.min(words.length, 4)).join(" ");
}

/** Common stop words to filter out when extracting keyword candidates. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "my",
  "no",
  "nor",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "own",
  "s",
  "so",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "too",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "t",
  "re",
  "ve",
  "d",
  "ll",
  "m",
  "new",
  "says",
  "report",
  "may",
  "could",
  "now",
  "after",
  "about",
  "more",
  "over",
  "all",
  "can",
  "been",
  "said",
  "get",
  "gets",
]);

/**
 * Extract keyword candidates from a headline for the mute-keyword picker.
 * Returns 2-word phrases and significant single words, deduplicated,
 * limited to a reasonable count for the dropdown.
 */
function extractKeywordCandidates(headline: string): string[] {
  const cleaned = headline
    .replace(/[^a-z0-9\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return [];

  const words = cleaned.split(" ").filter((w) => w.length > 1);
  const candidates: string[] = [];
  const seen = new Set<string>();

  // First pass: 2-word phrases (bigrams) excluding stopword-only pairs
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i]!;
    const w2 = words[i + 1]!;
    // Skip if both are stop words
    if (STOP_WORDS.has(w1.toLowerCase()) && STOP_WORDS.has(w2.toLowerCase())) continue;
    const phrase = `${w1} ${w2}`;
    const key = phrase.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(phrase);
    }
  }

  // Second pass: significant single words (non-stopwords, 3+ chars)
  for (const word of words) {
    if (word.length < 3) continue;
    if (STOP_WORDS.has(word.toLowerCase())) continue;
    const key = word.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(word);
    }
  }

  // Limit to 8 candidates for the dropdown
  return candidates.slice(0, 8);
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

function formatSignedScore(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return `+${rounded.toFixed(2)}`;
  return rounded.toFixed(2);
}

function rankingRows(cluster: ClusterCard): { label: string; value: number }[] {
  const info = cluster.rankingExplainability;
  if (!info) return [];
  return [
    { label: "Recency", value: info.recency },
    { label: "Saved", value: info.saved },
    { label: "Cluster size", value: info.clusterSize },
    { label: "Source weight", value: info.sourceWeight },
    { label: "Engagement", value: info.engagement },
    { label: "Topic affinity", value: info.topicAffinity },
    { label: "Folder affinity", value: info.folderAffinity },
    { label: "Diversity", value: info.diversityPenalty },
    { label: "Exploration", value: info.explorationBoost },
  ];
}

function mergedSummary(cluster: ClusterCard): string | null {
  if (cluster.dedupeReason) return cluster.dedupeReason;
  if (cluster.outletCount > 1) return `${cluster.outletCount} articles merged`;
  return null;
}

function hasExplainability(cluster: ClusterCard): boolean {
  return !!(
    cluster.rankingExplainability ||
    cluster.dedupeReason ||
    cluster.outletCount > 1 ||
    (cluster.hiddenSignals && cluster.hiddenSignals.length > 0)
  );
}

interface StoryCardProps {
  cluster: ClusterCard;
  layout?: ViewLayout;
  selected?: boolean;
  readerSelected?: boolean;
  markReadOnScroll?: MarkReadOnScroll;
  markReadOnScrollDelayMs?: number;
  markReadOnScrollThreshold?: number;
  markReadOnScrollOverride?: MarkReadOnScrollOverride;
  wallabagUrl?: string;
  onRemove?: (id: string) => void;
  onToggleRead?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  onSelect?: (clusterId: string) => void;
}

export const StoryCard = memo(
  forwardRef<HTMLElement, StoryCardProps>(function StoryCard(
    {
      cluster,
      layout = "card",
      selected,
      readerSelected,
      markReadOnScroll = "off",
      markReadOnScrollDelayMs = 1500,
      markReadOnScrollThreshold = 0.6,
      markReadOnScrollOverride,
      wallabagUrl,
      onRemove,
      onToggleRead,
      onToggleSave,
      onSelect,
    },
    ref,
  ) {
    const [saved, setSaved] = useState(cluster.isSaved);
    const [read, setRead] = useState(cluster.isRead);
    const [busy, setBusy] = useState(false);
    const [tuningBusy, setTuningBusy] = useState(false);
    const [keywordPattern, setKeywordPattern] = useState(() =>
      keywordSeedFromHeadline(cluster.headline),
    );
    const [tuningMessage, setTuningMessage] = useState<string | null>(null);
    const [tuningError, setTuningError] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [keywordSubmenuOpen, setKeywordSubmenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuTriggerRef = useRef<HTMLButtonElement>(null);
    const menuItemsRef = useRef<(HTMLButtonElement | HTMLInputElement | null)[]>([]);
    const localRef = useRef<HTMLElement | null>(null);
    const keywordCandidates = useMemo(
      () => extractKeywordCandidates(cluster.headline),
      [cluster.headline],
    );

    const parsed = useMemo(() => parseSummary(cluster.summary), [cluster.summary]);
    const setRefs = useCallback(
      (node: HTMLElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    // Dwell time tracking: measure how long the card is visible in viewport
    const cardBodyRef = useRef<HTMLDivElement>(null);
    const dwellStart = useRef<number | null>(null);
    const dwellSent = useRef(false);
    const autoReadTimer = useRef<number | null>(null);
    const autoReadVisible = useRef(false);
    const autoReadSent = useRef(false);
    const openReadSent = useRef(false);

    const flushDwell = useCallback(() => {
      if (dwellSent.current || !dwellStart.current) return;
      const seconds = Math.round((Date.now() - dwellStart.current) / 1000);
      if (seconds >= 2) {
        dwellSent.current = true;
        recordDwell(cluster.id, seconds);
      }
    }, [cluster.id]);

    const emitAutoReadEvent = useCallback(
      (type: "auto_read_on_scroll" | "auto_read_on_open") => {
        void recordAutoReadEvent(type, {
          clusterId: cluster.id,
          feedId: cluster.primaryFeedId,
          layout,
        });
      },
      [cluster.id, cluster.primaryFeedId, layout],
    );

    const scheduleAutoRead = useCallback(() => {
      const mode = markReadOnScrollOverride?.mode ?? markReadOnScroll;
      if (mode !== "on_scroll") return;
      if (read || autoReadSent.current || busy) return;
      if (autoReadTimer.current) return;
      const delayMs = markReadOnScrollOverride?.delayMs ?? markReadOnScrollDelayMs;
      autoReadTimer.current = window.setTimeout(async () => {
        autoReadTimer.current = null;
        if (!autoReadVisible.current || read || autoReadSent.current || busy) return;
        autoReadSent.current = true;
        try {
          const ok = await markClusterRead(cluster.id);
          if (ok) {
            setRead(true);
            onRemove?.(cluster.id);
            emitAutoReadEvent("auto_read_on_scroll");
          }
          onToggleRead?.(cluster.id);
        } catch (err) {
          console.error("auto mark read failed", err);
        }
      }, delayMs);
    }, [
      busy,
      cluster.id,
      emitAutoReadEvent,
      markReadOnScroll,
      markReadOnScrollDelayMs,
      markReadOnScrollOverride,
      onRemove,
      onToggleRead,
      read,
    ]);

    const clearAutoReadTimer = useCallback(() => {
      if (autoReadTimer.current) {
        window.clearTimeout(autoReadTimer.current);
        autoReadTimer.current = null;
      }
    }, []);

    const markReadFromOpen = useCallback(() => {
      const mode = markReadOnScrollOverride?.mode ?? markReadOnScroll;
      if (mode !== "on_open") return;
      if (read || openReadSent.current) return;
      openReadSent.current = true;
      void (async () => {
        try {
          const ok = await markClusterRead(cluster.id);
          if (ok) {
            setRead(true);
            onRemove?.(cluster.id);
            emitAutoReadEvent("auto_read_on_open");
          }
          onToggleRead?.(cluster.id);
        } catch (err) {
          console.error("open mark read failed", err);
        }
      })();
    }, [
      cluster.id,
      emitAutoReadEvent,
      markReadOnScroll,
      markReadOnScrollOverride,
      onRemove,
      onToggleRead,
      read,
    ]);

    // Close menu on click outside
    useEffect(() => {
      if (!menuOpen) return;
      function handleClickOutside(e: MouseEvent) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setMenuOpen(false);
          setKeywordSubmenuOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    // Focus first menu item when menu opens
    useEffect(() => {
      if (menuOpen) {
        // Small delay so the menu renders before focusing
        requestAnimationFrame(() => {
          menuItemsRef.current[0]?.focus();
        });
      }
    }, [menuOpen]);

    const closeMenu = useCallback(() => {
      setMenuOpen(false);
      setKeywordSubmenuOpen(false);
      menuTriggerRef.current?.focus();
    }, []);

    const handleMenuKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeMenu();
          return;
        }

        const items = menuItemsRef.current.filter(Boolean) as HTMLElement[];
        const currentIndex = items.indexOf(e.target as HTMLElement);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[next]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prev]?.focus();
        } else if (e.key === "Tab") {
          closeMenu();
        }
      },
      [closeMenu],
    );

    useEffect(() => {
      const el = localRef.current;
      if (!el) {
        // No ref, start tracking immediately for dwell only.
        dwellStart.current = Date.now();
        return () => {
          flushDwell();
        };
      }

      const threshold = Math.min(
        Math.max(markReadOnScrollOverride?.threshold ?? markReadOnScrollThreshold, 0),
        1,
      );
      const observer = new IntersectionObserver(
        ([entry]) => {
          const isVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= threshold);
          autoReadVisible.current = isVisible;
          if (isVisible) {
            if (!dwellStart.current) dwellStart.current = Date.now();
            scheduleAutoRead();
          } else {
            clearAutoReadTimer();
            if (dwellStart.current) flushDwell();
          }
        },
        { threshold: [0.1, 0.3, 0.5, threshold] },
      );
      observer.observe(el);

      return () => {
        observer.disconnect();
        clearAutoReadTimer();
        flushDwell();
      };
    }, [
      clearAutoReadTimer,
      flushDwell,
      markReadOnScrollOverride?.threshold,
      markReadOnScrollThreshold,
      scheduleAutoRead,
    ]);

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

    const hasPrimaryFeed = cluster.primaryFeedId !== "00000000-0000-0000-0000-000000000000";

    function setInlineStatus(message: string, isError = false) {
      setTuningMessage(message);
      setTuningError(isError);
    }

    async function hideCurrentCluster() {
      try {
        const ok = await clusterFeedback(cluster.id, { type: "not_interested" });
        if (ok) {
          onRemove?.(cluster.id);
        }
      } catch (error) {
        console.error("hideCurrentCluster failed", error);
      }
    }

    async function handleSourcePreference(mode: "prefer" | "neutral" | "mute") {
      if (!hasPrimaryFeed || tuningBusy) return;
      setTuningBusy(true);
      setTuningMessage(null);
      setTuningError(false);
      try {
        let updated: Feed | null = null;
        if (mode === "prefer") {
          updated = await updateFeed(cluster.primaryFeedId, { muted: false, weight: "prefer" });
          if (!updated) throw new Error("failed to prefer source");
          setInlineStatus(`Prioritizing ${cluster.primarySource}.`);
          return;
        }

        if (mode === "neutral") {
          updated = await updateFeed(cluster.primaryFeedId, { muted: false, weight: "neutral" });
          if (!updated) throw new Error("failed to reset source");
          setInlineStatus(`Reset ${cluster.primarySource} to neutral.`);
          return;
        }

        updated = await updateFeed(cluster.primaryFeedId, { muted: true });
        if (!updated) throw new Error("failed to mute source");
        setInlineStatus(`Muted ${cluster.primarySource}.`);
        await hideCurrentCluster();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setInlineStatus(`Source update failed: ${message}`, true);
      } finally {
        setTuningBusy(false);
      }
    }

    async function handleMuteKeyword() {
      if (tuningBusy) return;
      const pattern = normalizeFilterPattern(keywordPattern);
      if (pattern.length < 2) {
        setInlineStatus("Enter a longer keyword or phrase.", true);
        return;
      }

      setTuningBusy(true);
      setTuningMessage(null);
      try {
        const existing = await listFilters();
        const existingMuteRule = existing.find(
          (rule) =>
            rule.mode === "mute" &&
            rule.type === "phrase" &&
            normalizeFilterPattern(rule.pattern).toLowerCase() === pattern.toLowerCase(),
        );

        if (!existingMuteRule) {
          const created = await createFilter({
            pattern,
            target: "keyword",
            type: "phrase",
            mode: "mute",
            breakoutEnabled: true,
            feedId: null,
            folderId: null,
          });
          if (!created) {
            throw new Error("rule creation returned empty response");
          }
          setInlineStatus(`Keyword '${pattern}' muted.`);
        } else {
          setInlineStatus(`"${pattern}" is already muted.`);
        }

        await hideCurrentCluster();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setInlineStatus(`Keyword mute failed: ${message}`, true);
      } finally {
        setTuningBusy(false);
      }
    }

    const handleCardClick = useCallback(
      (e: React.MouseEvent) => {
        if (!onSelect) return;
        // Only intercept clicks on the card body area (not on links, buttons, or interactive elements)
        const target = e.target as HTMLElement;
        if (target.closest("a, button, details, input, .card-actions-menu-wrap, .share-menu"))
          return;
        // Only on desktop (>= 1024px)
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
          e.preventDefault();
          onSelect(cluster.id);
        }
      },
      [onSelect, cluster.id],
    );

    const sourceName = cluster.primarySource;

    function handleMuteKeywordCandidate(keyword: string) {
      setKeywordPattern(keyword);
      void (async () => {
        if (tuningBusy) return;
        const pattern = normalizeFilterPattern(keyword);
        if (pattern.length < 2) {
          setInlineStatus("Keyword too short.", true);
          return;
        }
        setTuningBusy(true);
        setTuningMessage(null);
        try {
          const existing = await listFilters();
          const existingMuteRule = existing.find(
            (rule) =>
              rule.mode === "mute" &&
              rule.type === "phrase" &&
              normalizeFilterPattern(rule.pattern).toLowerCase() === pattern.toLowerCase(),
          );
          if (!existingMuteRule) {
            const created = await createFilter({
              pattern,
              target: "keyword",
              type: "phrase",
              mode: "mute",
              breakoutEnabled: true,
              feedId: null,
              folderId: null,
            });
            if (!created) throw new Error("rule creation returned empty response");
            setInlineStatus(`Keyword '${pattern}' muted.`);
          } else {
            setInlineStatus(`"${pattern}" is already muted.`);
          }
          await hideCurrentCluster();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setInlineStatus(`Keyword mute failed: ${message}`, true);
        } finally {
          setTuningBusy(false);
          closeMenu();
        }
      })();
    }

    // Reset focusable items on each render so refs stay in sync
    menuItemsRef.current = [];
    let menuItemIndex = 0;

    const cardActionsMenu = (
      <div className="card-actions-menu-wrap" ref={menuRef}>
        <button
          ref={menuTriggerRef}
          type="button"
          className="action-btn card-actions-trigger"
          onClick={() => {
            setMenuOpen((prev) => !prev);
            setKeywordSubmenuOpen(false);
            setTuningMessage(null);
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More actions"
          title="More actions"
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            className="card-actions-dropdown"
            role="menu"
            aria-label="Card actions"
            onKeyDown={handleMenuKeyDown}
          >
            {hasPrimaryFeed && (
              <button
                ref={(el) => {
                  menuItemsRef.current[menuItemIndex++] = el;
                }}
                type="button"
                role="menuitem"
                className="card-actions-item"
                disabled={tuningBusy}
                onClick={() => {
                  void handleSourcePreference("prefer");
                  closeMenu();
                }}
              >
                <StarIcon className="card-actions-item-icon" />
                <span>Prefer {sourceName}</span>
              </button>
            )}

            {hasPrimaryFeed && (
              <button
                ref={(el) => {
                  menuItemsRef.current[menuItemIndex++] = el;
                }}
                type="button"
                role="menuitem"
                className="card-actions-item card-actions-item-danger"
                disabled={tuningBusy}
                onClick={() => {
                  void handleSourcePreference("mute");
                  closeMenu();
                }}
              >
                <VolumeXIcon className="card-actions-item-icon" />
                <span>Mute {sourceName}</span>
              </button>
            )}

            {hasPrimaryFeed && (
              <button
                ref={(el) => {
                  menuItemsRef.current[menuItemIndex++] = el;
                }}
                type="button"
                role="menuitem"
                className="card-actions-item"
                disabled={tuningBusy}
                onClick={() => {
                  void handleSourcePreference("neutral");
                  closeMenu();
                }}
              >
                <span className="card-actions-item-icon-placeholder" />
                <span>Reset {sourceName}</span>
              </button>
            )}

            <hr className="card-actions-separator" />

            {keywordCandidates.length > 0 ? (
              <>
                <button
                  ref={(el) => {
                    menuItemsRef.current[menuItemIndex++] = el;
                  }}
                  type="button"
                  role="menuitem"
                  className="card-actions-item"
                  aria-haspopup="true"
                  aria-expanded={keywordSubmenuOpen}
                  disabled={tuningBusy}
                  onClick={() => setKeywordSubmenuOpen((prev) => !prev)}
                >
                  <FilterIcon className="card-actions-item-icon" />
                  <span>Mute keyword</span>
                  <ChevronRightIcon className="card-actions-item-chevron" />
                </button>

                {keywordSubmenuOpen && (
                  <div
                    className="card-actions-submenu"
                    role="menu"
                    aria-label="Keyword suggestions"
                  >
                    {keywordCandidates.map((kw) => (
                      <button
                        key={kw}
                        ref={(el) => {
                          menuItemsRef.current[menuItemIndex++] = el;
                        }}
                        type="button"
                        role="menuitem"
                        className="card-actions-item card-actions-subitem"
                        disabled={tuningBusy}
                        onClick={() => handleMuteKeywordCandidate(kw)}
                      >
                        {kw}
                      </button>
                    ))}
                    <hr className="card-actions-separator" />
                    <div className="card-actions-custom-keyword">
                      <input
                        ref={(el) => {
                          menuItemsRef.current[menuItemIndex++] = el;
                        }}
                        className="input card-actions-keyword-input"
                        value={keywordPattern}
                        onChange={(event) => setKeywordPattern(event.target.value)}
                        placeholder="Custom keyword..."
                        aria-label="Custom mute keyword"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleMuteKeyword();
                            closeMenu();
                          }
                        }}
                      />
                      <button
                        ref={(el) => {
                          menuItemsRef.current[menuItemIndex++] = el;
                        }}
                        type="button"
                        role="menuitem"
                        className="card-actions-keyword-btn"
                        disabled={tuningBusy}
                        onClick={() => {
                          void handleMuteKeyword();
                          closeMenu();
                        }}
                      >
                        {tuningBusy ? "..." : "Mute"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card-actions-custom-keyword-standalone">
                <FilterIcon className="card-actions-item-icon" />
                <input
                  ref={(el) => {
                    menuItemsRef.current[menuItemIndex++] = el;
                  }}
                  className="input card-actions-keyword-input"
                  value={keywordPattern}
                  onChange={(event) => setKeywordPattern(event.target.value)}
                  placeholder="Mute keyword..."
                  aria-label="Mute keyword"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleMuteKeyword();
                      closeMenu();
                    }
                  }}
                />
                <button
                  ref={(el) => {
                    menuItemsRef.current[menuItemIndex++] = el;
                  }}
                  type="button"
                  role="menuitem"
                  className="card-actions-keyword-btn"
                  disabled={tuningBusy}
                  onClick={() => {
                    void handleMuteKeyword();
                    closeMenu();
                  }}
                >
                  {tuningBusy ? "..." : "Mute"}
                </button>
              </div>
            )}

            {tuningMessage && (
              <p className={cn("card-actions-status", tuningError ? "error-text" : "muted")}>
                {tuningMessage}
              </p>
            )}
          </div>
        )}
      </div>
    );

    const headlineUrl = parsed.articleUrl;
    const slug = topicSlug(cluster.topicName);
    const timeAgo = relativeTime(cluster.primarySourcePublishedAt);
    const rawTopicLc = (cluster.topicName ?? "").trim().toLowerCase();
    const isPlaceholderTopic =
      !rawTopicLc || rawTopicLc === "other" || rawTopicLc === "uncategorized" || rawTopicLc === "general";
    const cardLabel = (
      isPlaceholderTopic ? cluster.folderName : cluster.topicName!
    ).toUpperCase();
    const cardLabelClass = slug ? `tag-${slug}` : "tag-folder";
    const heroImageUrl = isSafeUrl(cluster.heroImageUrl) ? cluster.heroImageUrl : null;
    const outletsLabel = outletBadgeLabel(cluster.outletCount);
    const clusterHref = `/clusters/${cluster.id}`;
    const rankingInfo = cluster.rankingExplainability;
    const whyRows = rankingRows(cluster);
    const merged = mergedSummary(cluster);
    const hiddenSignals = cluster.hiddenSignals ?? [];
    const showWhy = hasExplainability(cluster);
    const displayMode = cluster.displayMode ?? "full";

    // ---------- Headline-only mode (progressive: old items) ----------
    if (displayMode === "headline") {
      const headlineClasses = cn(
        "story-card",
        "story-card-headline-only",
        read && "is-read",
        selected && "card-selected",
        readerSelected && "story-card-reader-selected",
      );
      return (
        <article
          className={headlineClasses}
          ref={setRefs}
          data-cluster-id={cluster.id}
          data-article-url={headlineUrl ?? ""}
          data-topic={slug}
          aria-label={`${read ? "Read: " : ""}${cluster.headline}`}
          onClick={handleCardClick}
        >
          <div className="story-source">
            {!read && <span className="unread-marker" aria-hidden="true" />}
            <span className="source-name">
              {cluster.primarySource.toUpperCase().replace(/ /g, "_")}
            </span>
            <span className="source-sep">/</span>
            <span className="story-time">{timeAgo}</span>
            <span className={cn("story-source-tag", cardLabelClass)}>{cardLabel}</span>
          </div>
          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a
                href={headlineUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={markReadFromOpen}
              >
                {cluster.headline}
              </a>
            ) : (
              cluster.headline
            )}
          </h2>
        </article>
      );
    }

    // ---------- List layout: single line ----------
    if (layout === "list") {
      const listClasses = cn(
        "story-card",
        read && "is-read",
        selected && "card-selected",
        readerSelected && "story-card-reader-selected",
      );
      return (
        <article
          className={listClasses}
          ref={setRefs}
          data-cluster-id={cluster.id}
          data-article-url={headlineUrl ?? ""}
          data-topic={slug}
          aria-label={`${read ? "Read: " : ""}${cluster.headline}`}
          onClick={handleCardClick}
        >
          <div className="story-source">
            {!read && <span className="unread-marker" aria-hidden="true" />}
            <span className="source-name">
              {cluster.primarySource.toUpperCase().replace(/ /g, "_")}
            </span>
            <span className="source-sep">/</span>
            <span className="story-time">{timeAgo}</span>
            {outletsLabel && <span className="story-outlet-badge">{outletsLabel}</span>}
            <span className={cn("story-source-tag", cardLabelClass)}>{cardLabel}</span>
            <Link className="story-cluster-link" href={clusterHref} onClick={markReadFromOpen}>
              Story
            </Link>
            {cardActionsMenu}
          </div>
          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a
                href={headlineUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={markReadFromOpen}
              >
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
      const compactClasses = cn(
        "story-card",
        displayMode === "summary" && "story-card-summary-mode",
        read && "is-read",
        selected && "card-selected",
        readerSelected && "story-card-reader-selected",
      );
      return (
        <article
          className={compactClasses}
          ref={setRefs}
          data-cluster-id={cluster.id}
          data-article-url={headlineUrl ?? ""}
          data-topic={slug}
          aria-label={`${read ? "Read: " : ""}${cluster.headline}`}
          onClick={handleCardClick}
        >
          <div className="story-source">
            {!read && <span className="unread-marker" aria-hidden="true" />}
            <span className="source-name">
              {cluster.primarySource.toUpperCase().replace(/ /g, "_")}
            </span>
            <span className="source-sep">/</span>
            <span className="story-time">{timeAgo}</span>
            {outletsLabel && <span className="story-outlet-badge">{outletsLabel}</span>}
            <span className={cn("story-source-tag", cardLabelClass)}>{cardLabel}</span>
            {displayMode === "summary" && (
              <span className="story-ai-summary-badge">AI summary</span>
            )}
            <Link className="story-cluster-link" href={clusterHref} onClick={markReadFromOpen}>
              Story
            </Link>
            {cardActionsMenu}
          </div>
          {displayMode !== "summary" && heroImageUrl && (
            <img
              className="story-hero story-hero-compact"
              src={heroImageUrl}
              alt=""
              width={1200}
              height={630}
              loading="lazy"
            />
          )}
          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a
                href={headlineUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={markReadFromOpen}
              >
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
    const isSummaryMode = displayMode === "summary";
    const cardClasses = cn(
      "story-card",
      isSummaryMode && "story-card-summary-mode",
      read && "is-read",
      selected && "card-selected",
      readerSelected && "story-card-reader-selected",
    );

    return (
      <article
        className={cardClasses}
        ref={setRefs}
        data-cluster-id={cluster.id}
        data-article-url={headlineUrl ?? ""}
        data-topic={slug}
        aria-label={`${read ? "Read: " : ""}${cluster.headline}`}
        onClick={handleCardClick}
      >
        <div className="story-source">
          {!read && <span className="unread-marker" aria-hidden="true" />}
          <span className="source-name">
            {cluster.primarySource.toUpperCase().replace(/ /g, "_")}
          </span>
          <span className="source-sep">/</span>
          <span className="story-time">{timeAgo}</span>
          {outletsLabel && <span className="story-outlet-badge">{outletsLabel}</span>}
          <span className={cn("story-source-tag", cardLabelClass)}>{cardLabel}</span>
          {isSummaryMode && <span className="story-ai-summary-badge">AI summary</span>}
          <Link className="story-cluster-link" href={clusterHref} onClick={markReadFromOpen}>
            Story
          </Link>
          {cardActionsMenu}
        </div>

        {!isSummaryMode && heroImageUrl && (
          <img
            className="story-hero"
            src={heroImageUrl}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
          />
        )}

        <div ref={cardBodyRef} className="story-card-body">
          <AnnotationToolbar clusterId={cluster.id} containerRef={cardBodyRef} />

          <h2 className="story-headline">
            {isSafeUrl(headlineUrl) ? (
              <a
                href={headlineUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={markReadFromOpen}
              >
                {cluster.headline}
              </a>
            ) : (
              cluster.headline
            )}
          </h2>

          {parsed.cleanText && <p className="story-summary">{parsed.cleanText}</p>}
        </div>

        <div className="story-footer">
          <span className={cn("story-tag", cardLabelClass)}>{cardLabel}</span>
          {cluster.mutedBreakoutReason && <span className="story-tag tag-trending">TRENDING</span>}
          {showWhy && (
            <details className="story-why-details">
              <summary className="story-tag tag-explain" aria-label="Why shown">
                <InfoIcon aria-hidden="true" />
                Why
              </summary>
              <div className="story-why-popover">
                {rankingInfo && (
                  <>
                    <p className="story-why-section-label">Ranking</p>
                    <p className="story-why-title">
                      Score {formatSignedScore(rankingInfo.finalScore)}
                    </p>
                    <ul className="story-why-list">
                      {whyRows.map((row) => (
                        <li key={row.label} className="story-why-item">
                          <span>{row.label}</span>
                          <code>{formatSignedScore(row.value)}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {merged && (
                  <>
                    <p className="story-why-section-label">Merged</p>
                    <p className="story-why-merged">{merged}</p>
                  </>
                )}
                {hiddenSignals.length > 0 && (
                  <>
                    <p className="story-why-section-label">Filtered</p>
                    <ul className="story-why-list">
                      {hiddenSignals.map((sig) => (
                        <li key={sig.label} className="story-why-item">
                          <span>{sig.label}</span>
                          <span className="story-why-reason">{sig.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </details>
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
              <BookmarkIcon aria-hidden="true" />
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
                <CheckIcon aria-hidden="true" />
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
              <XIcon aria-hidden="true" />
            </button>
            {isSafeUrl(headlineUrl) && (
              <ShareMenu articleUrl={headlineUrl!} wallabagUrl={wallabagUrl} />
            )}
          </div>
        </div>
      </article>
    );
  }),
);
