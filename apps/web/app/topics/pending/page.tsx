"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  approveAllFeedTopics,
  getFeedTopics,
  getPendingClassifications,
  resolveFeedTopic,
} from "@/lib/api";
import type { Feed, FeedTopic } from "@rss-wrangler/contracts";

interface PendingFeed {
  feed: Feed;
  topics: FeedTopic[];
}

function PendingContent() {
  const [pendingFeeds, setPendingFeeds] = useState<PendingFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFeed, setBusyFeed] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    setLoading(true);
    const feeds = await getPendingClassifications();
    const results: PendingFeed[] = [];
    for (const feed of feeds) {
      const topics = await getFeedTopics(feed.id);
      const pending = topics.filter((t) => t.status === "pending");
      if (pending.length > 0) {
        results.push({ feed, topics: pending });
      }
    }
    setPendingFeeds(results);
    setLoading(false);
  }

  async function handleResolve(
    feedId: string,
    topicId: string,
    action: "approve" | "reject"
  ) {
    setBusyFeed(feedId);
    const ok = await resolveFeedTopic(feedId, topicId, action);
    if (ok) {
      setPendingFeeds((prev) =>
        prev
          .map((pf) => {
            if (pf.feed.id !== feedId) return pf;
            const remaining = pf.topics.filter((t) => t.topicId !== topicId);
            return { ...pf, topics: remaining };
          })
          .filter((pf) => pf.topics.length > 0)
      );
      setMessage(`Topic ${action === "approve" ? "approved" : "rejected"}.`);
      setTimeout(() => setMessage(""), 3000);
    }
    setBusyFeed(null);
  }

  async function handleApproveAll(feedId: string) {
    setBusyFeed(feedId);
    const ok = await approveAllFeedTopics(feedId);
    if (ok) {
      setPendingFeeds((prev) => prev.filter((pf) => pf.feed.id !== feedId));
      setMessage("All topics approved for this feed.");
      setTimeout(() => setMessage(""), 3000);
    }
    setBusyFeed(null);
  }

  return (
    <section className="section-card">
      <div className="row" style={{ marginBottom: "1rem" }}>
        <a href="/topics" className="button button-small">
          Back to topics
        </a>
        <h1 style={{ margin: 0 }}>Pending Topic Approvals</h1>
      </div>

      {message && (
        <p
          className="banner"
          style={{ marginBottom: "1rem", padding: "0.5rem 1rem" }}
        >
          {message}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading pending classifications...</p>
      ) : pendingFeeds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p className="muted">All feeds are categorized.</p>
          <a href="/topics" className="button button-secondary">
            Back to topics
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {pendingFeeds.map((pf) => (
            <div key={pf.feed.id} className="section-card">
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <h2 style={{ margin: 0 }}>
                  {pf.feed.title || pf.feed.url}
                </h2>
                <button
                  type="button"
                  className="button button-small button-primary"
                  onClick={() => handleApproveAll(pf.feed.id)}
                  disabled={busyFeed === pf.feed.id}
                >
                  Approve All
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {pf.topics.map((topic) => (
                  <div
                    key={topic.topicId}
                    className="badge"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>{topic.topicName}</span>
                    <span className="muted" style={{ fontSize: "0.8em" }}>
                      ({Math.round(topic.confidence * 100)}%)
                    </span>
                    <button
                      type="button"
                      title="Approve"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-success, #22c55e)",
                        fontWeight: 700,
                        fontSize: "1.1em",
                        padding: "0 0.2rem",
                      }}
                      onClick={() =>
                        handleResolve(pf.feed.id, topic.topicId, "approve")
                      }
                      disabled={busyFeed === pf.feed.id}
                    >
                      &#x2713;
                    </button>
                    <button
                      type="button"
                      title="Reject"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-danger, #ef4444)",
                        fontWeight: 700,
                        fontSize: "1.1em",
                        padding: "0 0.2rem",
                      }}
                      onClick={() =>
                        handleResolve(pf.feed.id, topic.topicId, "reject")
                      }
                      disabled={busyFeed === pf.feed.id}
                    >
                      &#x2717;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PendingPage() {
  return (
    <ProtectedRoute>
      <PendingContent />
    </ProtectedRoute>
  );
}
