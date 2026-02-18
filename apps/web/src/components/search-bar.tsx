"use client";

import type { ClusterCard, Feed, Folder, SavedSearch } from "@rss-wrangler/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { StoryCard } from "@/components/story-card";
import { getSettings, listFeeds, listFolders, searchClusters, updateSettings } from "@/lib/api";

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomHex = () =>
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, "0");
  return `${randomHex()}${randomHex()}-${randomHex()}-4${randomHex().slice(1)}-a${randomHex().slice(1)}-${randomHex()}${randomHex()}${randomHex()}`;
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildSavedSearchName(
  query: string,
  folderId: string,
  feedId: string,
  folders: Folder[],
  feeds: Feed[],
): string {
  const trimmedQuery = query.trim();
  if (feedId) {
    const feedLabel = feeds.find((feed) => feed.id === feedId)?.title?.trim() || "Source";
    return shorten(`${feedLabel}: ${trimmedQuery}`, 80);
  }
  if (folderId) {
    const folderLabel = folders.find((folder) => folder.id === folderId)?.name?.trim() || "Folder";
    return shorten(`${folderLabel}: ${trimmedQuery}`, 80);
  }
  return shorten(trimmedQuery, 80);
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClusterCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [activeSavedSearchId, setActiveSavedSearchId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [feedId, setFeedId] = useState("");
  const [scopesLoaded, setScopesLoaded] = useState(false);
  const [savedSearchesLoaded, setSavedSearchesLoaded] = useState(false);
  const [savingSavedSearches, setSavingSavedSearches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeLoadPromiseRef = useRef<Promise<void> | null>(null);
  const savedSearchLoadPromiseRef = useRef<Promise<void> | null>(null);
  const savedSearchesRef = useRef<SavedSearch[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const commitSavedSearches = useCallback((nextSavedSearches: SavedSearch[]) => {
    savedSearchesRef.current = nextSavedSearches;
    setSavedSearches(nextSavedSearches);
  }, []);

  const ensureScopeOptionsLoaded = useCallback(async () => {
    if (scopesLoaded) return;
    if (!scopeLoadPromiseRef.current) {
      scopeLoadPromiseRef.current = (async () => {
        const [loadedFolders, loadedFeeds] = await Promise.all([listFolders(), listFeeds()]);
        setFolders(loadedFolders);
        setFeeds(loadedFeeds);
        setScopesLoaded(true);
      })().finally(() => {
        scopeLoadPromiseRef.current = null;
      });
    }
    await scopeLoadPromiseRef.current;
  }, [scopesLoaded]);

  const ensureSavedSearchesLoaded = useCallback(async () => {
    if (savedSearchesLoaded) return;
    if (!savedSearchLoadPromiseRef.current) {
      savedSearchLoadPromiseRef.current = (async () => {
        const settings = await getSettings();
        const nextSavedSearches = settings.savedSearches ?? [];
        commitSavedSearches(nextSavedSearches);
        setSavedSearchesLoaded(true);
      })().finally(() => {
        savedSearchLoadPromiseRef.current = null;
      });
    }
    await savedSearchLoadPromiseRef.current;
  }, [savedSearchesLoaded, commitSavedSearches]);

  const doSearch = useCallback(
    async (q: string, scope?: { folderId: string; feedId: string }) => {
      if (q.trim().length === 0) {
        setResults([]);
        setOpen(false);
        return;
      }
      const activeFolderId = scope?.folderId ?? folderId;
      const activeFeedId = scope?.feedId ?? feedId;
      setLoading(true);
      const res = await searchClusters(q, 10, {
        folderId: activeFolderId || undefined,
        feedId: activeFeedId || undefined,
      });
      setResults(res.data);
      setOpen(true);
      setLoading(false);
    },
    [feedId, folderId],
  );

  function handleChange(value: string) {
    setQuery(value);
    setActiveSavedSearchId("");
    void ensureScopeOptionsLoaded();
    void ensureSavedSearchesLoaded();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function handleFolderScopeChange(value: string) {
    setFolderId(value);
    setActiveSavedSearchId("");
    if (query.trim().length > 0) {
      void doSearch(query, { folderId: value, feedId });
    }
  }

  function handleFeedScopeChange(value: string) {
    setFeedId(value);
    setActiveSavedSearchId("");
    if (query.trim().length > 0) {
      void doSearch(query, { folderId, feedId: value });
    }
  }

  async function handleSavedSearchSelect(savedSearchId: string) {
    setActiveSavedSearchId(savedSearchId);
    if (!savedSearchId) return;
    const selected = savedSearchesRef.current.find((entry) => entry.id === savedSearchId);
    if (!selected) return;
    setQuery(selected.query);
    setFolderId(selected.folderId ?? "");
    setFeedId(selected.feedId ?? "");
    await ensureScopeOptionsLoaded();
    await doSearch(selected.query, {
      folderId: selected.folderId ?? "",
      feedId: selected.feedId ?? "",
    });
  }

  async function handleSaveCurrentSearch() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    await Promise.all([ensureScopeOptionsLoaded(), ensureSavedSearchesLoaded()]);

    const currentSavedSearches = savedSearchesRef.current;
    const existing = currentSavedSearches.find(
      (entry) =>
        entry.query === trimmedQuery &&
        (entry.folderId ?? "") === folderId &&
        (entry.feedId ?? "") === feedId,
    );
    const nextEntry: SavedSearch = {
      id: existing?.id ?? makeUuid(),
      name: buildSavedSearchName(trimmedQuery, folderId, feedId, folders, feeds),
      query: trimmedQuery,
      folderId: folderId || null,
      feedId: feedId || null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    const withoutExisting = currentSavedSearches.filter((entry) => entry.id !== nextEntry.id);
    const nextSavedSearches = [nextEntry, ...withoutExisting].slice(0, 50);

    setSavingSavedSearches(true);
    const updatedSettings = await updateSettings({ savedSearches: nextSavedSearches });
    if (updatedSettings) {
      commitSavedSearches(updatedSettings.savedSearches ?? nextSavedSearches);
    } else {
      commitSavedSearches(nextSavedSearches);
    }
    setActiveSavedSearchId(nextEntry.id);
    setSavingSavedSearches(false);
  }

  async function handleDeleteSavedSearch() {
    if (!activeSavedSearchId || savingSavedSearches) return;
    await ensureSavedSearchesLoaded();
    const nextSavedSearches = savedSearchesRef.current.filter(
      (entry) => entry.id !== activeSavedSearchId,
    );
    setSavingSavedSearches(true);
    const updatedSettings = await updateSettings({ savedSearches: nextSavedSearches });
    if (updatedSettings) {
      commitSavedSearches(updatedSettings.savedSearches ?? nextSavedSearches);
    } else {
      commitSavedSearches(nextSavedSearches);
    }
    setActiveSavedSearchId("");
    setSavingSavedSearches(false);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="search-container" role="search" aria-label="Search stories">
      <div className="search-input-wrapper">
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          role="combobox"
          className="input search-input"
          placeholder="Search stories..."
          aria-label="Search stories"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results-dropdown"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            void ensureScopeOptionsLoaded();
            void ensureSavedSearchesLoaded();
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              setOpen(false);
            }
          }}
        />
        {loading && <span className="search-spinner" aria-label="Searching" role="status" />}
      </div>
      {query.trim().length > 0 || savedSearches.length > 0 ? (
        <div className="search-saved-row">
          <select
            className="input search-saved-select"
            value={activeSavedSearchId}
            onChange={(e) => {
              void handleSavedSearchSelect(e.target.value);
            }}
            aria-label="Saved searches"
          >
            <option value="">Saved searches</option>
            {savedSearches.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button button-small search-saved-button"
            disabled={savingSavedSearches || query.trim().length === 0}
            onClick={() => {
              void handleSaveCurrentSearch();
            }}
          >
            {savingSavedSearches ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="button button-small search-saved-button"
            disabled={savingSavedSearches || !activeSavedSearchId}
            onClick={() => {
              void handleDeleteSavedSearch();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {query.trim().length > 0 ? (
        <div className="search-scope-row">
          <select
            className="input search-scope-select"
            value={folderId}
            onChange={(e) => handleFolderScopeChange(e.target.value)}
            aria-label="Search folder scope"
          >
            <option value="">All folders</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <select
            className="input search-scope-select"
            value={feedId}
            onChange={(e) => handleFeedScopeChange(e.target.value)}
            aria-label="Search source scope"
          >
            <option value="">All sources</option>
            {feeds.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.title || feed.url}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {open && results.length > 0 && (
        <div
          id="search-results-dropdown"
          className="search-dropdown"
          role="region"
          aria-label={`${results.length} search results`}
        >
          {results.map((cluster) => (
            <StoryCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      )}
      {open && !loading && query.trim().length > 0 && results.length === 0 && (
        <div
          id="search-results-dropdown"
          className="search-dropdown"
          role="region"
          aria-label="Search results"
        >
          <p className="muted" style={{ padding: "1rem" }}>
            No results found.
          </p>
        </div>
      )}
    </div>
  );
}
