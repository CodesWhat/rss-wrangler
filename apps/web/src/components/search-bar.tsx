"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClusterCard } from "@rss-wrangler/contracts";
import { searchClusters } from "@/lib/api";
import { StoryCard } from "@/components/story-card";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClusterCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const res = await searchClusters(q, 10);
    setResults(res.data);
    setOpen(true);
    setLoading(false);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
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
    <div ref={containerRef} className="search-container">
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
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className="input search-input"
          placeholder="Search stories..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {loading && <span className="search-spinner" />}
      </div>
      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((cluster) => (
            <StoryCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      )}
      {open && !loading && query.trim().length > 0 && results.length === 0 && (
        <div className="search-dropdown">
          <p className="muted" style={{ padding: "1rem" }}>No results found.</p>
        </div>
      )}
    </div>
  );
}
