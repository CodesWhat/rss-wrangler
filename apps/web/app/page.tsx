"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryCard } from "@/components/story-card";
import { ProtectedRoute } from "@/components/protected-route";
import { listClusters } from "@/lib/api";
import { ShortcutsHelp, ShortcutsButton } from "@/components/shortcuts-help";
import { LayoutToggle, getStoredLayout, storeLayout } from "@/components/layout-toggle";
import type { ViewLayout } from "@/components/layout-toggle";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { ClusterCard, StorySort } from "@rss-wrangler/contracts";

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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Load layout preference from localStorage on mount
  useEffect(() => {
    setLayout(getStoredLayout());
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

  async function handleRefresh() {
    setRefreshing(true);
    const result = await listClusters({ limit: 20, state: "unread", sort });
    setClusters(result.data);
    setCursor(result.nextCursor);
    setSelectedIndex(-1);
    setRefreshing(false);
  }

  function scrollToCard(index: number) {
    const el = cardRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

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
    [clusters.length, selectedIndex]
  );

  useKeyboardShortcuts(shortcutActions);

  return (
    <>
      <div className="feed-controls">
        <div className="sort-toggle">
          <button
            type="button"
            className={`button button-small${sort === "personal" ? " button-active" : ""}`}
            onClick={() => setSort("personal")}
          >
            For You
          </button>
          <button
            type="button"
            className={`button button-small${sort === "latest" ? " button-active" : ""}`}
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

      <section className="banner">
        <div>
          <strong>Digest available when away or backlog is high.</strong>
          <p>Default triggers: away 24h or unread backlog 50 clusters.</p>
        </div>
        <a href="/digest" className="button button-secondary">
          Open digest
        </a>
      </section>

      {loading ? (
        <p className="muted">Loading stories...</p>
      ) : clusters.length === 0 ? (
        <p className="muted">No unread stories. Add some feeds in Sources.</p>
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
          {cursor && <div ref={sentinelRef} style={{ height: 1 }} />}
          {loadingMore && <p className="muted">Loading more...</p>}
          {cursor && !loadingMore && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => fetchClusters(false)}
              style={{ justifySelf: "center", marginTop: "0.5rem" }}
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
