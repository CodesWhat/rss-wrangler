"use client";

import type { Feed } from "@rss-wrangler/contracts";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import feedDirectory from "@/data/feed-directory.json" with { type: "json" };
import { addFeed, listFeeds } from "@/lib/api";

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
  const [loading, setLoading] = useState(true);
  const [showRecoBanner, setShowRecoBanner] = useState(true);

  useEffect(() => {
    listFeeds().then((feeds) => {
      const urls = new Set(feeds.map((f: Feed) => f.url));
      setSubscribedUrls(urls);
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
          f.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [activeCategory, search]);

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
            <span
              className="popularity-star"
              role="img"
              aria-label={`Popularity ${entry.popularity}`}
            >
              {"*".repeat(entry.popularity)}
            </span>
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
    <>
      <div className="page-header">
        <h1 className="page-title">Discover Feeds</h1>
        <p className="page-meta">Browse popular RSS feeds and subscribe with one click.</p>
      </div>

      <section className="section-card">
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
            {/* TODO: replace banner with real recos when recommendation engine is wired up */}
            {showRecoBanner && activeCategory === "All" && !search.trim() && (
              <section className="banner">
                <div>
                  <strong>Personalized recommendations are coming.</strong>
                  <p>
                    Subscribe to feeds and read articles — we&apos;ll learn your interests and
                    suggest new sources.
                  </p>
                </div>
                <button
                  type="button"
                  className="banner-dismiss"
                  onClick={() => setShowRecoBanner(false)}
                  aria-label="Dismiss"
                >
                  &times;
                </button>
              </section>
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
    </>
  );
}

export default function DiscoverPage() {
  return (
    <ProtectedRoute>
      <DiscoverContent />
    </ProtectedRoute>
  );
}
