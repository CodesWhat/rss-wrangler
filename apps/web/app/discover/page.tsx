"use client";

import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { addFeed, listFeeds, getFeedSuggestions } from "@/lib/api";
import type { Feed } from "@rss-wrangler/contracts";
import feedDirectory from "@/data/feed-directory.json";

interface DirectoryEntry {
  name: string;
  url: string;
  description: string;
  category: string;
  popularity: number;
}

const ALL_FEEDS: DirectoryEntry[] = feedDirectory as DirectoryEntry[];
const CATEGORIES = Array.from(new Set(ALL_FEEDS.map((f) => f.category))).sort();

function DiscoverContent() {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [subscribedUrls, setSubscribedUrls] = useState<Set<string>>(new Set());
  const [busyUrls, setBusyUrls] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listFeeds(), getFeedSuggestions()]).then(([feeds, sug]) => {
      const urls = new Set(feeds.map((f: Feed) => f.url));
      setSubscribedUrls(urls);
      setSuggestions(sug);
      setLoading(false);
    });
  }, []);

  const filteredFeeds = useMemo(() => {
    let result = ALL_FEEDS;
    if (activeCategory !== "All") {
      result = result.filter((f) => f.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeCategory, search]);

  const recommendedFeeds = useMemo(() => {
    if (suggestions.length === 0) return [];
    return ALL_FEEDS.filter(
      (f) =>
        suggestions.includes(f.category) && !subscribedUrls.has(f.url)
    )
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 8);
  }, [suggestions, subscribedUrls]);

  async function handleSubscribe(entry: DirectoryEntry) {
    setBusyUrls((prev) => new Set(prev).add(entry.url));
    const feed = await addFeed(entry.url);
    if (feed) {
      setSubscribedUrls((prev) => new Set(prev).add(entry.url));
    }
    setBusyUrls((prev) => {
      const next = new Set(prev);
      next.delete(entry.url);
      return next;
    });
  }

  function renderFeedCard(entry: DirectoryEntry) {
    const isSubscribed = subscribedUrls.has(entry.url);
    const isBusy = busyUrls.has(entry.url);

    return (
      <div key={entry.url} className="discover-card">
        <div className="discover-card-body">
          <h3 className="discover-card-title">{entry.name}</h3>
          <p className="discover-card-desc">{entry.description}</p>
          <div className="row">
            <span className="badge">{entry.category}</span>
            {Array.from({ length: entry.popularity }, (_, i) => (
              <span key={i} className="popularity-star">*</span>
            ))}
          </div>
        </div>
        <div className="discover-card-action">
          {isSubscribed ? (
            <button type="button" className="button button-small button-active" disabled>
              Subscribed
            </button>
          ) : (
            <button
              type="button"
              className="button button-small button-primary"
              disabled={isBusy}
              onClick={() => handleSubscribe(entry)}
            >
              {isBusy ? "Adding..." : "Subscribe"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="section-card">
      <h1>Discover Feeds</h1>
      <p className="muted">
        Browse popular RSS feeds and subscribe with one click.
      </p>

      <div className="discover-search">
        <input
          type="text"
          className="input"
          placeholder="Search feeds by name, topic, or keyword..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          {recommendedFeeds.length > 0 && activeCategory === "All" && !search.trim() && (
            <div className="discover-section">
              <h2>Recommended for You</h2>
              <p className="muted">
                Based on your current feed subscriptions, you might enjoy these.
              </p>
              <div className="discover-grid">
                {recommendedFeeds.map(renderFeedCard)}
              </div>
            </div>
          )}

          <div className="discover-tabs">
            <button
              type="button"
              className={`button button-small${activeCategory === "All" ? " button-active" : ""}`}
              onClick={() => setActiveCategory("All")}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`button button-small${activeCategory === cat ? " button-active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="discover-grid">
            {filteredFeeds.length === 0 ? (
              <p className="muted">No feeds match your search.</p>
            ) : (
              filteredFeeds.map(renderFeedCard)
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function DiscoverPage() {
  return (
    <ProtectedRoute>
      <DiscoverContent />
    </ProtectedRoute>
  );
}
