"use client";

import type { Feed, FeedTopic } from "@rss-wrangler/contracts";
import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  approveAllFeedTopics,
  getFeedTopics,
  getPendingClassifications,
  resolveFeedTopic,
} from "@/lib/api";

interface PendingFeed {
  feed: Feed;
  topics: FeedTopic[];
}

function PendingContent() {
  const [pendingFeeds, setPendingFeeds] = useState<PendingFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFeed, setBusyFeed] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadPending = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  async function handleResolve(feedId: string, topicId: string, action: "approve" | "reject") {
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
          .filter((pf) => pf.topics.length > 0),
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
    <>
      <div className="page-header">
        <div className="row">
          <a href="/topics" className="button button-small">
            Back to topics
          </a>
          <h1 className="page-title">Pending Topic Approvals</h1>
        </div>
      </div>

      <section className="section-card">
        {message && <p className="banner">{message}</p>}

        {loading ? (
          <p className="muted">Loading pending classifications...</p>
        ) : pendingFeeds.length === 0 ? (
          <div className="section-card">
            <p className="muted">All feeds are categorized.</p>
            <a href="/topics" className="button button-secondary">
              Back to topics
            </a>
          </div>
        ) : (
          <div className="settings-layout">
            {pendingFeeds.map((pf) => (
              <div key={pf.feed.id} className="section-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="page-title">{pf.feed.title || pf.feed.url}</h2>
                  <button
                    type="button"
                    className="button button-small button-primary"
                    onClick={() => handleApproveAll(pf.feed.id)}
                    disabled={busyFeed === pf.feed.id}
                  >
                    Approve All
                  </button>
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {pf.topics.map((topic) => (
                    <div key={topic.topicId} className="badge">
                      <span>{topic.topicName}</span>
                      <span className="muted"> ({Math.round(topic.confidence * 100)}%)</span>
                      <button
                        type="button"
                        title="Approve"
                        className="action-btn"
                        onClick={() => handleResolve(pf.feed.id, topic.topicId, "approve")}
                        disabled={busyFeed === pf.feed.id}
                      >
                        &#x2713;
                      </button>
                      <button
                        type="button"
                        title="Reject"
                        className="action-btn"
                        onClick={() => handleResolve(pf.feed.id, topic.topicId, "reject")}
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
    </>
  );
}

export default function PendingPage() {
  return (
    <ProtectedRoute>
      <PendingContent />
    </ProtectedRoute>
  );
}
