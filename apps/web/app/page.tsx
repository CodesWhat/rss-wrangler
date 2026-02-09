"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryCard } from "@/components/story-card";
import { ProtectedRoute } from "@/components/protected-route";
import { getSettings, listClusters, listFeeds, updateSettings } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ShortcutsHelp, ShortcutsButton } from "@/components/shortcuts-help";
import { LayoutToggle, getStoredLayout, storeLayout } from "@/components/layout-toggle";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import type { ViewLayout } from "@/components/layout-toggle";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { AiMode, ClusterCard, StorySort } from "@rss-wrangler/contracts";

function HomeFeed() {
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<StorySort>("personal");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [layout, setLayout] = useState<ViewLayout>("card");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const [showEmptyBanner, setShowEmptyBanner] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [setupLoading, setSetupLoading] = useState(true);
  const [feedsCount, setFeedsCount] = useState(0);
  const [initialAiMode, setInitialAiMode] = useState<AiMode>("off");
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Load layout preference from localStorage on mount
  useEffect(() => {
    setLayout(getStoredLayout());
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFeeds(), getSettings()]).then(([feeds, settings]) => {
      if (cancelled) return;
      setFeedsCount(feeds.length);
      setInitialAiMode(settings.aiMode);
      setOnboardingCompletedAt(settings.onboardingCompletedAt ?? null);
      setSetupLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLayoutChange(newLayout: ViewLayout) {
    setLayout(newLayout);
    storeLayout(newLayout);
  }

  const fetchClusters = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const result = await listClusters({
        limit: 20,
        state: "unread",
        sort,
        cursor: reset ? undefined : (cursor ?? undefined),
      });

      if (reset) {
        setClusters(result.data);
      } else {
        setClusters((prev) => [...prev, ...result.data]);
      }
      setCursor(result.nextCursor);
      setLoading(false);
      setLoadingMore(false);
    },
    [sort, cursor]
  );

  // Initial load and re-fetch when sort changes
  useEffect(() => {
    setClusters([]);
    setCursor(null);
    setLoading(true);
    setSelectedIndex(-1);
    listClusters({ limit: 20, state: "unread", sort }).then((result) => {
      setClusters(result.data);
      setCursor(result.nextCursor);
      setLoading(false);
    });
  }, [sort]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      listClusters({ limit: 20, state: "unread", sort }).then((result) => {
        setClusters(result.data);
        setCursor(result.nextCursor);
      });
    }, 120_000);
    return () => clearInterval(interval);
  }, [sort]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!cursor) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          fetchClusters(false);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadingMore, fetchClusters]);

  function handleRemove(id: string) {
    setClusters((prev) => prev.filter((c) => c.id !== id));
  }

  async function dismissOnboarding() {
    setShowOnboarding(false);
    const completedAt = new Date().toISOString();
    setOnboardingCompletedAt(completedAt);
    const updated = await updateSettings({ onboardingCompletedAt: completedAt });
    if (updated) {
      setOnboardingCompletedAt(updated.onboardingCompletedAt ?? completedAt);
    }
  }

  async function reopenOnboarding() {
    setShowOnboarding(true);
    setOnboardingCompletedAt(null);
    await updateSettings({ onboardingCompletedAt: null });
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await listClusters({ limit: 20, state: "unread", sort });
    setClusters(result.data);
    setCursor(result.nextCursor);
    setSelectedIndex(-1);
    setRefreshing(false);
  }, [sort]);

  const scrollToCard = useCallback((index: number) => {
    const el = cardRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  // Keyboard shortcut actions
  const shortcutActions = useMemo(
    () => ({
      onNextCard: () => {
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, clusters.length - 1);
          setTimeout(() => scrollToCard(next), 0);
          return next;
        });
      },
      onPrevCard: () => {
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          setTimeout(() => scrollToCard(next), 0);
          return next;
        });
      },
      onOpenSelected: () => {
        if (selectedIndex < 0 || selectedIndex >= clusters.length) return;
        const el = cardRefs.current.get(selectedIndex);
        const url = el?.dataset.articleUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
      onToggleRead: () => {
        if (selectedIndex < 0 || selectedIndex >= clusters.length) return;
        const el = cardRefs.current.get(selectedIndex);
        if (el) {
          const buttons = el.querySelectorAll<HTMLButtonElement>("button");
          for (const b of buttons) {
            if (b.textContent?.trim() === "Mark read") {
              b.click();
              break;
            }
          }
        }
      },
      onToggleSave: () => {
        if (selectedIndex < 0 || selectedIndex >= clusters.length) return;
        const el = cardRefs.current.get(selectedIndex);
        if (el) {
          const buttons = el.querySelectorAll<HTMLButtonElement>("button");
          for (const b of buttons) {
            if (b.textContent?.trim() === "Save") {
              b.click();
              break;
            }
          }
        }
      },
      onRefresh: () => {
        handleRefresh();
      },
      onToggleHelp: () => {
        setShowHelp((prev) => !prev);
      },
      onFocusSearch: () => {
        const searchInput = document.querySelector<HTMLInputElement>("input[type='search'], input[placeholder*='search' i]");
        if (searchInput) searchInput.focus();
      },
    }),
    [clusters.length, selectedIndex, handleRefresh, scrollToCard]
  );

  useKeyboardShortcuts(shortcutActions);

  const shouldShowOnboarding = !setupLoading
    && feedsCount === 0
    && showOnboarding
    && !onboardingCompletedAt;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Your Feed</h1>
        <p className="page-meta">
          <span className="count">{clusters.length} stories</span>
        </p>
      </div>

      <div className="feed-controls">
        <div className="feed-sort">
          <button
            type="button"
            className={cn("sort-btn", sort === "personal" && "active")}
            onClick={() => setSort("personal")}
          >
            For You
          </button>
          <button
            type="button"
            className={cn("sort-btn", sort === "latest" && "active")}
            onClick={() => setSort("latest")}
          >
            Latest
          </button>
        </div>
        <div className="row">
          <LayoutToggle layout={layout} onChange={handleLayoutChange} />
          <button
            type="button"
            className="button button-small"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading stories...</p>
      ) : shouldShowOnboarding ? (
        <OnboardingWizard
          feedsCount={feedsCount}
          initialAiMode={initialAiMode}
          onFeedsCountChange={setFeedsCount}
          onDismiss={() => {
            void dismissOnboarding();
          }}
        />
      ) : clusters.length === 0 && feedsCount === 0 && showEmptyBanner ? (
        <section className="banner">
          <div>
            <strong>No sources configured yet.</strong>
            <p>Run guided setup, or add feeds manually in Sources.</p>
          </div>
          <div className="row">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                void reopenOnboarding();
              }}
            >
              Start setup
            </button>
            <a href="/sources" className="button button-secondary">
              Sources
            </a>
            <button
              type="button"
              className="banner-dismiss"
              onClick={() => setShowEmptyBanner(false)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </section>
      ) : clusters.length === 0 && showEmptyBanner ? (
        <section className="banner">
          <div>
            <strong>No unread stories.</strong>
            <p>Add some feeds in Sources to get started.</p>
          </div>
          <div className="row">
            <a href="/sources" className="button button-secondary">
              Sources
            </a>
            <button
              type="button"
              className="banner-dismiss"
              onClick={() => setShowEmptyBanner(false)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </section>
      ) : (
        <section className="cards" aria-label="Story cards">
          {clusters.map((cluster, i) => (
            <StoryCard
              key={cluster.id}
              cluster={cluster}
              layout={layout}
              selected={i === selectedIndex}
              onRemove={handleRemove}
              ref={(el) => {
                if (el) cardRefs.current.set(i, el);
                else cardRefs.current.delete(i);
              }}
            />
          ))}
          {cursor && <div ref={sentinelRef} className="scroll-sentinel" />}
          {loadingMore && <p className="muted">Loading more...</p>}
          {cursor && !loadingMore && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => fetchClusters(false)}
            >
              Load more
            </button>
          )}
        </section>
      )}

      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
      <ShortcutsButton onClick={() => setShowHelp((prev) => !prev)} />
    </>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeFeed />
    </ProtectedRoute>
  );
}
