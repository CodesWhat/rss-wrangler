"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoryCard } from "@/components/story-card";
import { ProtectedRoute } from "@/components/protected-route";
import { listClusters } from "@/lib/api";
import type { ClusterCard, StorySort } from "@rss-wrangler/contracts";

function HomeFeed() {
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<StorySort>("personal");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
    setRefreshing(false);
  }

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
        <button
          type="button"
          className="button button-small"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
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
          {clusters.map((cluster) => (
            <StoryCard key={cluster.id} cluster={cluster} onRemove={handleRemove} />
          ))}
          {cursor && <div ref={sentinelRef} style={{ height: 1 }} />}
          {loadingMore && <p className="muted">Loading more...</p>}
        </section>
      )}
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
