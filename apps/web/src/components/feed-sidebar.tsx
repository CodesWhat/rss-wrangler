"use client";

import type { Feed, Folder } from "@rss-wrangler/contracts";
import Link from "next/link";
import { useCallback, useState } from "react";

export interface SidebarFilter {
  type: "smart" | "folder" | "feed";
  state?: "all" | "unread" | "saved";
  folderId?: string;
  feedId?: string;
  label: string;
}

interface FeedSidebarProps {
  feeds: Feed[];
  folders: Folder[];
  activeFilter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  unreadCount: number;
  savedCount: number;
  totalCount: number;
}

export function FeedSidebar({
  feeds,
  folders,
  activeFilter,
  onFilterChange,
  collapsed,
  onToggleCollapse: _onToggleCollapse,
  unreadCount,
  savedCount,
  totalCount,
}: FeedSidebarProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  // Group feeds by folderId
  const feedsByFolder = new Map<string, Feed[]>();
  for (const feed of feeds) {
    const list = feedsByFolder.get(feed.folderId) ?? [];
    list.push(feed);
    feedsByFolder.set(feed.folderId, list);
  }

  if (collapsed) return null;

  const isSmartActive = (state: string) =>
    activeFilter.type === "smart" && activeFilter.state === state;
  const isFolderActive = (folderId: string) =>
    activeFilter.type === "folder" && activeFilter.folderId === folderId;
  const isFeedActive = (feedId: string) =>
    activeFilter.type === "feed" && activeFilter.feedId === feedId;

  return (
    <aside className="feed-sidebar" aria-label="Feed navigation">
      <nav className="fs-nav">
        <div className="fs-smart-feeds">
          <div className="fs-section-title">{"// feeds"}</div>
          <button
            type="button"
            className={`fs-nav-item ${isSmartActive("all") ? "active" : ""}`}
            onClick={() => onFilterChange({ type: "smart", state: "all", label: "All Items" })}
          >
            <span>All Items</span>
            <span className="fs-badge">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`fs-nav-item ${isSmartActive("unread") ? "active" : ""}`}
            onClick={() => onFilterChange({ type: "smart", state: "unread", label: "Unread" })}
          >
            <span>Unread</span>
            <span className="fs-badge">{unreadCount}</span>
          </button>
          <button
            type="button"
            className={`fs-nav-item ${isSmartActive("saved") ? "active" : ""}`}
            onClick={() => onFilterChange({ type: "smart", state: "saved", label: "Starred" })}
          >
            <span>Starred</span>
            <span className="fs-badge starred">{savedCount}</span>
          </button>
        </div>

        <div className="fs-section-title">{"// folders"}</div>
        {folders
          .filter((folder) => (feedsByFolder.get(folder.id) ?? []).length > 0)
          .map((folder) => {
          const folderFeeds = feedsByFolder.get(folder.id) ?? [];
          const isCollapsed = collapsedFolders.has(folder.id);
          const feedCount = folderFeeds.length;

          return (
            <div key={folder.id}>
              <button
                type="button"
                className={`fs-folder-header ${isFolderActive(folder.id) ? "active" : ""}`}
                onClick={() =>
                  onFilterChange({
                    type: "folder",
                    folderId: folder.id,
                    label: folder.name,
                  })
                }
              >
                <span
                  className="fs-folder-chevron"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(folder.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      toggleFolder(folder.id);
                    }
                  }}
                  style={{
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                >
                  v
                </span>
                <span style={{ flex: 1 }}>{folder.name}</span>
                {feedCount > 0 && <span className="fs-badge">{feedCount}</span>}
              </button>
              {!isCollapsed &&
                folderFeeds.map((feed) => (
                  <button
                    key={feed.id}
                    type="button"
                    className={`fs-feed-item ${isFeedActive(feed.id) ? "active" : ""}`}
                    onClick={() =>
                      onFilterChange({
                        type: "feed",
                        feedId: feed.id,
                        label: feed.title,
                      })
                    }
                  >
                    <span className="fs-feed-icon">{feed.title.charAt(0).toUpperCase()}</span>
                    <span className="fs-feed-name">{feed.title}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </nav>

      <div className="fs-footer">
        <Link href="/settings" className="fs-footer-link">
          Settings
        </Link>
        <Link href="/sources" className="fs-footer-link">
          Sources
        </Link>
        <Link href="/discover" className="fs-footer-link">
          Discover
        </Link>
        <Link href="/digest" className="fs-footer-link">
          Digest
        </Link>
      </div>
    </aside>
  );
}
