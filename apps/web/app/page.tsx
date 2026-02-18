"use client";

import type {
  AiMode,
  ClusterCard,
  Feed,
  Folder,
  ListClustersQuery,
  StorySort,
} from "@rss-wrangler/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClusterListRow } from "@/components/cluster-list-row";
import { FeedSidebar, type SidebarFilter } from "@/components/feed-sidebar";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { ProtectedRoute } from "@/components/protected-route";
import { ReaderPanel } from "@/components/reader-panel";
import {
  getSettings,
  listClusters,
  listFeeds,
  listFolders,
  markAllRead,
  markClusterRead,
  markClusterUnread,
  saveCluster,
  updateSettings,
} from "@/lib/api";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Display settings persistence
// ---------------------------------------------------------------------------

interface DisplaySettings {
  density: "compact" | "default" | "comfortable";
  readerSize: "S" | "M" | "L";
  fontSize: "sm" | "md" | "lg";
}

const DISPLAY_SETTINGS_KEY = "h3-display-settings";

function loadDisplaySettings(): DisplaySettings {
  if (typeof window === "undefined") {
    return { density: "default", readerSize: "M", fontSize: "md" };
  }
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
      return {
        density: parsed.density ?? "default",
        readerSize: parsed.readerSize ?? "M",
        fontSize: parsed.fontSize ?? "md",
      };
    }
  } catch {
    // ignore corrupt data
  }
  return { density: "default", readerSize: "M", fontSize: "md" };
}

function saveDisplaySettings(settings: DisplaySettings): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
  }
}

// ---------------------------------------------------------------------------
// HomeFeed component
// ---------------------------------------------------------------------------

function HomeFeed() {
  // --- Sidebar ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({
    type: "smart",
    state: "unread",
    label: "Unread",
  });

  // --- Feeds / folders for sidebar ---
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  // --- Cluster list ---
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<StorySort>("personal");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // --- Reader ---
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // --- Display settings ---
  const [density, setDensity] = useState<"compact" | "default" | "comfortable">("default");
  const [readerSize, setReaderSize] = useState<"S" | "M" | "L">("M");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [showSettings, setShowSettings] = useState(false);

  // --- Onboarding ---
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [setupLoading, setSetupLoading] = useState(true);
  const [feedsCount, setFeedsCount] = useState(0);
  const [initialAiMode, setInitialAiMode] = useState<AiMode>("off");
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);

  // --- Mark all read ---
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [confirmingMarkAllRead, setConfirmingMarkAllRead] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Keyboard navigation ---
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // --- Undo toast ---
  const [undoToast, setUndoToast] = useState<{
    message: string;
    clusterIds: string[];
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Refs ---
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // body dataset: hide layout chrome when home page is active
  // -------------------------------------------------------------------------
  useEffect(() => {
    document.body.dataset.homeActive = "true";
    return () => {
      delete document.body.dataset.homeActive;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Load display settings from localStorage on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const ds = loadDisplaySettings();
    setDensity(ds.density);
    setReaderSize(ds.readerSize);
    setFontSize(ds.fontSize);
  }, []);

  // -------------------------------------------------------------------------
  // Initial data fetch: feeds, folders, settings in parallel
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([listFeeds(), listFolders(), getSettings()]).then(
      ([feedsResult, foldersResult, settings]) => {
        if (cancelled) return;
        setFeeds(feedsResult);
        setFolders(foldersResult);
        setFeedsCount(feedsResult.length);
        setInitialAiMode(settings.aiMode);
        setOnboardingCompletedAt(settings.onboardingCompletedAt ?? null);
        setSetupLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Build cluster query from current sidebar filter + sort
  // -------------------------------------------------------------------------
  const buildQuery = useCallback(
    (extraCursor?: string): Partial<ListClustersQuery> => {
      const query: Partial<ListClustersQuery> = { limit: 20, sort };
      if (sidebarFilter.type === "smart") {
        query.state = (sidebarFilter.state as "all" | "unread" | "saved") ?? "unread";
      } else if (sidebarFilter.type === "folder") {
        query.state = "unread";
        query.folder_id = sidebarFilter.folderId;
      } else if (sidebarFilter.type === "feed") {
        query.state = "unread";
        query.feed_id = sidebarFilter.feedId;
      }
      if (extraCursor) query.cursor = extraCursor;
      return query;
    },
    [sidebarFilter, sort],
  );

  // -------------------------------------------------------------------------
  // Fetch clusters on filter / sort change
  // -------------------------------------------------------------------------
  useEffect(() => {
    setClusters([]);
    setCursor(null);
    setLoading(true);
    setSelectedIndex(-1);
    const query = buildQuery();
    listClusters(query).then((result) => {
      setClusters(result.data);
      setCursor(result.nextCursor);
      setLoading(false);
    });
  }, [buildQuery]);

  // -------------------------------------------------------------------------
  // Infinite scroll: load more when sentinel is visible
  // -------------------------------------------------------------------------
  const fetchMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const query = buildQuery(cursor);
    const result = await listClusters(query);
    setClusters((prev) => [...prev, ...result.data]);
    setCursor(result.nextCursor);
    setLoadingMore(false);
  }, [cursor, loadingMore, buildQuery]);

  useEffect(() => {
    if (!cursor) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, fetchMore]);

  // -------------------------------------------------------------------------
  // Auto-refresh every 2 minutes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const query = buildQuery();
      listClusters(query).then((result) => {
        setClusters(result.data);
        setCursor(result.nextCursor);
      });
    }, 120_000);
    return () => clearInterval(interval);
  }, [buildQuery]);

  // -------------------------------------------------------------------------
  // Refresh handler
  // -------------------------------------------------------------------------
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const query = buildQuery();
    const result = await listClusters(query);
    setClusters(result.data);
    setCursor(result.nextCursor);
    setSelectedIndex(-1);
    setRefreshing(false);
  }, [buildQuery]);

  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------
  const shouldShowOnboarding =
    !setupLoading && feedsCount === 0 && showOnboarding && !onboardingCompletedAt;

  async function dismissOnboarding() {
    setShowOnboarding(false);
    const completedAt = new Date().toISOString();
    setOnboardingCompletedAt(completedAt);
    const updated = await updateSettings({ onboardingCompletedAt: completedAt });
    if (updated) {
      setOnboardingCompletedAt(updated.onboardingCompletedAt ?? completedAt);
    }
  }

  // -------------------------------------------------------------------------
  // Sidebar filter change -- re-fetch clusters
  // -------------------------------------------------------------------------
  function handleFilterChange(filter: SidebarFilter) {
    setSidebarFilter(filter);
    setMobileSidebarOpen(false);
    setSelectedClusterId(null);
    setClusters([]);
    setCursor(null);
    setLoading(true);

    const query: Partial<ListClustersQuery> = { limit: 20, sort };
    if (filter.type === "smart") {
      query.state = (filter.state as "all" | "unread" | "saved") ?? "unread";
    } else if (filter.type === "folder") {
      query.state = "unread";
      query.folder_id = filter.folderId;
    } else if (filter.type === "feed") {
      query.state = "unread";
      query.feed_id = filter.feedId;
    }

    listClusters(query).then((result) => {
      setClusters(result.data);
      setCursor(result.nextCursor);
      setLoading(false);
    });
  }

  // -------------------------------------------------------------------------
  // Cluster selection / reader open + close
  // -------------------------------------------------------------------------
  const handleSelectCluster = useCallback(
    (clusterId: string) => {
      setSelectedClusterId(clusterId);
      history.pushState({ clusterId }, "", `/clusters/${clusterId}`);

      // Mark as read if not already read
      const cluster = clusters.find((c) => c.id === clusterId);
      if (cluster && !cluster.isRead) {
        setClusters((prev) => prev.map((c) => (c.id === clusterId ? { ...c, isRead: true } : c)));
        void markClusterRead(clusterId);
      }
    },
    [clusters],
  );

  const handleCloseReader = useCallback(() => {
    setSelectedClusterId(null);
    history.pushState(null, "", "/");
  }, []);

  // popstate handler for browser back/forward
  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      const state = e.state as { clusterId?: string } | null;
      if (state?.clusterId) {
        setSelectedClusterId(state.clusterId);
      } else {
        setSelectedClusterId(null);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // -------------------------------------------------------------------------
  // Toggle star
  // -------------------------------------------------------------------------
  const handleToggleStar = useCallback(async (id: string) => {
    await saveCluster(id);
    setClusters((prev) => prev.map((c) => (c.id === id ? { ...c, isSaved: !c.isSaved } : c)));
  }, []);

  // -------------------------------------------------------------------------
  // Mark all read with undo support
  // -------------------------------------------------------------------------
  const dismissUndoToast = useCallback(() => {
    setUndoToast(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoToast) return;
    const ids = undoToast.clusterIds;
    dismissUndoToast();
    await Promise.all(ids.map((id) => markClusterUnread(id)));
    await handleRefresh();
  }, [undoToast, dismissUndoToast, handleRefresh]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    try {
      const result = await markAllRead({});
      if (result.ok) {
        dismissUndoToast();
        setUndoToast({
          message: `Marked ${result.marked} ${result.marked === 1 ? "story" : "stories"} as read`,
          clusterIds: result.clusterIds,
        });
        undoTimerRef.current = setTimeout(() => {
          setUndoToast(null);
          undoTimerRef.current = null;
        }, 8000);
        await handleRefresh();
      }
    } finally {
      setMarkingAllRead(false);
      setConfirmingMarkAllRead(false);
    }
  }, [dismissUndoToast, handleRefresh, markingAllRead]);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Display settings handlers -- persist to localStorage
  // -------------------------------------------------------------------------
  function handleDensityChange(d: "compact" | "default" | "comfortable") {
    setDensity(d);
    saveDisplaySettings({ density: d, readerSize, fontSize });
  }

  function handleReaderSizeChange(s: "S" | "M" | "L") {
    setReaderSize(s);
    saveDisplaySettings({ density, readerSize: s, fontSize });
  }

  function handleFontSizeChange(f: "sm" | "md" | "lg") {
    setFontSize(f);
    saveDisplaySettings({ density, readerSize, fontSize: f });
  }

  // Click outside to close settings popover
  useEffect(() => {
    if (!showSettings) return;
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Do not intercept when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, clusters.length - 1);
            const cluster = clusters[next];
            if (cluster) {
              const row = listRef.current?.querySelector(`[data-cluster-id="${cluster.id}"]`);
              if (row)
                (row as HTMLElement).scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
            }
            return next;
          });
          break;
        }
        case "k": {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            const cluster = clusters[next];
            if (cluster) {
              const row = listRef.current?.querySelector(`[data-cluster-id="${cluster.id}"]`);
              if (row)
                (row as HTMLElement).scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
            }
            return next;
          });
          break;
        }
        case "s": {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < clusters.length) {
            const c = clusters[selectedIndex];
            if (c) handleToggleStar(c.id);
          }
          break;
        }
        case "Enter":
        case "o": {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < clusters.length) {
            const c = clusters[selectedIndex];
            if (c) handleSelectCluster(c.id);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (mobileSidebarOpen) {
            setMobileSidebarOpen(false);
          } else if (showSettings) {
            setShowSettings(false);
          } else if (selectedClusterId) {
            handleCloseReader();
          }
          break;
        }
        case "r": {
          e.preventDefault();
          handleRefresh();
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clusters,
    selectedIndex,
    selectedClusterId,
    showSettings,
    mobileSidebarOpen,
    handleSelectCluster,
    handleCloseReader,
    handleRefresh,
    handleToggleStar,
  ]);

  // Keep selectedIndex in bounds when clusters change
  useEffect(() => {
    if (selectedIndex >= clusters.length) {
      setSelectedIndex(Math.max(0, clusters.length - 1));
    }
  }, [clusters.length, selectedIndex]);

  // -------------------------------------------------------------------------
  // Grid column computation
  // -------------------------------------------------------------------------
  const sidebarW = sidebarCollapsed ? 0 : 240;
  const readerFraction = selectedClusterId
    ? readerSize === "S"
      ? 0.35
      : readerSize === "M"
        ? 0.5
        : 0.65
    : 0;
  const listFr = selectedClusterId
    ? `minmax(280px, ${((1 - readerFraction) * 100).toFixed(0)}fr)`
    : "1fr";
  const readerFr = selectedClusterId ? `${(readerFraction * 100).toFixed(0)}fr` : "0px";
  const gridCols = `${sidebarW}px ${listFr} ${readerFr}`;

  const fontSizePx = fontSize === "sm" ? "15px" : fontSize === "md" ? "17px" : "20px";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className="h3-shell"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gridTemplateColumns: gridCols,
      }}
    >
      {/* ================================================================ */}
      {/* HEADER ROW -- spans all columns                                  */}
      {/* ================================================================ */}
      <div className="h3-header" style={{ gridColumn: "1 / -1", display: "flex" }}>
        {/* Sidebar header cell */}
        <div
          className="h3-hdr-sidebar"
          style={{
            width: sidebarCollapsed ? 0 : 200,
            overflow: "hidden",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {!sidebarCollapsed && (
            <>
              <span className="h3-brand">RSS_WRANGLER</span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="h3-collapse-btn"
                title="Collapse sidebar"
              >
                &laquo;
              </button>
            </>
          )}
        </div>

        {/* List header cell */}
        <div
          className="h3-hdr-list"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="h3-hamburger"
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            &#9776;
          </button>
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="h3-expand-btn"
              title="Show sidebar"
            >
              &raquo;
            </button>
          )}
          <span className="h3-hdr-label">{sidebarFilter.label}</span>
          <span className="h3-hdr-count">{clusters.length}</span>
          <div style={{ flex: 1 }} />

          {/* Sort buttons */}
          <button
            type="button"
            className={cn("h3-sort-btn", sort === "personal" && "active")}
            onClick={() => setSort("personal")}
          >
            For You
          </button>
          <button
            type="button"
            className={cn("h3-sort-btn", sort === "latest" && "active")}
            onClick={() => setSort("latest")}
          >
            Latest
          </button>

          {/* Mark all read */}
          {confirmingMarkAllRead ? (
            <>
              <button
                type="button"
                className="h3-btn"
                onClick={() => {
                  void handleMarkAllRead();
                }}
                disabled={markingAllRead}
              >
                {markingAllRead ? "Marking..." : "Confirm"}
              </button>
              <button
                type="button"
                className="h3-btn muted"
                onClick={() => setConfirmingMarkAllRead(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="h3-btn"
              onClick={() => setConfirmingMarkAllRead(true)}
              disabled={clusters.length === 0}
            >
              Mark all read
            </button>
          )}

          <button
            type="button"
            className="h3-btn"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={refreshing}
          >
            {refreshing ? "..." : "Refresh"}
          </button>

          {/* Display settings gear */}
          <div className="h3-gear-wrap" ref={settingsRef}>
            <button
              type="button"
              className="h3-gear-btn"
              onClick={() => setShowSettings((v) => !v)}
              title="Display settings"
            >
              &#9881;
            </button>
            {showSettings && (
              <div className="h3-settings-popover">
                <div className="h3-settings-group">
                  <span className="h3-settings-label">Density</span>
                  <div className="h3-settings-btns">
                    {(["compact", "default", "comfortable"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={cn("h3-btn", density === d && "active")}
                        onClick={() => handleDensityChange(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h3-settings-group">
                  <span className="h3-settings-label">Reader Size</span>
                  <div className="h3-settings-btns">
                    {(["S", "M", "L"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={cn("h3-btn", readerSize === s && "active")}
                        onClick={() => handleReaderSizeChange(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h3-settings-group">
                  <span className="h3-settings-label">Font Size</span>
                  <div className="h3-settings-btns">
                    {(["sm", "md", "lg"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={cn("h3-btn", fontSize === f && "active")}
                        onClick={() => handleFontSizeChange(f)}
                      >
                        {f === "sm" ? "A-" : f === "md" ? "A" : "A+"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reader header cell */}
        {selectedClusterId && (
          <div
            className="h3-hdr-reader"
            style={{
              display: "flex",
              alignItems: "center",
              paddingRight: 8,
            }}
          >
            <button
              type="button"
              className="h3-btn"
              onClick={handleCloseReader}
              title="Close reader"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SIDEBAR                                                          */}
      {/* ================================================================ */}
      <div
        className="h3-sidebar"
        style={{
          width: sidebarCollapsed ? 0 : 200,
          overflow: sidebarCollapsed ? "hidden" : undefined,
          flexShrink: 0,
        }}
      >
        <FeedSidebar
          feeds={feeds}
          folders={folders}
          activeFilter={sidebarFilter}
          onFilterChange={handleFilterChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          unreadCount={clusters.length}
          savedCount={0}
          totalCount={clusters.length}
        />
      </div>

      {/* ================================================================ */}
      {/* ARTICLE LIST                                                     */}
      {/* ================================================================ */}
      <div className="h3-list" ref={listRef} style={{ overflowY: "auto" }}>
        {loading || setupLoading ? (
          <div className="h3-loading">Loading...</div>
        ) : shouldShowOnboarding ? (
          <OnboardingWizard
            feedsCount={feedsCount}
            initialAiMode={initialAiMode}
            onFeedsCountChange={setFeedsCount}
            onDismiss={() => {
              void dismissOnboarding();
            }}
          />
        ) : clusters.length === 0 ? (
          <div className="h3-empty">No stories. Add feeds in Sources.</div>
        ) : (
          <>
            {clusters.map((cluster, idx) => (
              <ClusterListRow
                key={cluster.id}
                cluster={cluster}
                isActive={cluster.id === selectedClusterId || idx === selectedIndex}
                onSelect={handleSelectCluster}
                onToggleStar={handleToggleStar}
                density={density}
              />
            ))}
            {cursor && <div ref={sentinelRef} className="h3-sentinel" />}
            {loadingMore && <div className="h3-loading-more">Loading more...</div>}
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* READER                                                           */}
      {/* ================================================================ */}
      {selectedClusterId && (
        <div className="h3-reader" style={{ fontSize: fontSizePx, overflowY: "auto" }}>
          <ReaderPanel clusterId={selectedClusterId} onClose={handleCloseReader} />
        </div>
      )}

      {/* ================================================================ */}
      {/* KEYBOARD HINTS                                                   */}
      {/* ================================================================ */}
      <div className="h3-kbar" style={{ gridColumn: "1 / -1" }}>
        <span>
          <kbd>j</kbd>/<kbd>k</kbd> navigate
        </span>
        <span>
          <kbd>s</kbd> star
        </span>
        <span>
          <kbd>o</kbd> open
        </span>
        <span>
          <kbd>esc</kbd> close
        </span>
      </div>

      {/* ================================================================ */}
      {/* UNDO TOAST                                                       */}
      {/* ================================================================ */}
      {undoToast && (
        <div
          className="undo-toast"
          role="status"
          aria-live="polite"
          style={{ gridColumn: "1 / -1" }}
        >
          <span>{undoToast.message}</span>
          <button
            type="button"
            onClick={() => {
              void handleUndo();
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="undo-toast-dismiss"
            onClick={dismissUndoToast}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* MOBILE SIDEBAR OVERLAY                                           */}
      {/* ================================================================ */}
      {mobileSidebarOpen && (
        <div className="h3-sidebar-overlay">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
          <div className="h3-sidebar-overlay-bg" onClick={() => setMobileSidebarOpen(false)} />
          <div className="h3-sidebar-overlay-panel">
            <div className="h3-sidebar-overlay-header">
              <span className="h3-mobile-brand">RSS_WRANGLER</span>
              <button
                type="button"
                className="h3-btn"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                &times;
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <FeedSidebar
                feeds={feeds}
                folders={folders}
                activeFilter={sidebarFilter}
                onFilterChange={handleFilterChange}
                collapsed={false}
                onToggleCollapse={() => setMobileSidebarOpen(false)}
                unreadCount={clusters.length}
                savedCount={0}
                totalCount={clusters.length}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page default export
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeFeed />
    </ProtectedRoute>
  );
}
