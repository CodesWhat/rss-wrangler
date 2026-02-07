"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { StoryCard } from "@/components/story-card";
import { listClusters, listTopics, getPendingClassifications } from "@/lib/api";
import type { ClusterCard, Topic } from "@rss-wrangler/contracts";

function TopicsContent() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showUncategorized, setShowUncategorized] = useState(false);

  useEffect(() => {
    Promise.all([listTopics(), getPendingClassifications()]).then(
      ([t, pending]) => {
        setTopics(t);
        setPendingCount(pending.length);
        setLoading(false);
      }
    );
  }, []);

  async function openTopic(topic: Topic) {
    setSelectedTopic(topic);
    setShowUncategorized(false);
    setLoadingClusters(true);
    const result = await listClusters({
      topic_id: topic.id,
      state: "unread",
      sort: "latest",
      limit: 50,
    });
    setClusters(result.data);
    setLoadingClusters(false);
  }

  async function openUncategorized() {
    setSelectedTopic(null);
    setShowUncategorized(true);
    setLoadingClusters(true);
    // Fetch clusters with no topic (uncategorized)
    const result = await listClusters({
      state: "unread",
      sort: "latest",
      limit: 50,
    });
    // Filter client-side for uncategorized
    setClusters(result.data.filter((c) => !c.topicId));
    setLoadingClusters(false);
  }

  function handleRemove(id: string) {
    setClusters((prev) => prev.filter((c) => c.id !== id));
  }

  if (selectedTopic || showUncategorized) {
    const title = selectedTopic ? selectedTopic.name : "Uncategorized";
    return (
      <>
        <div className="page-header">
          <div className="row">
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                setSelectedTopic(null);
                setShowUncategorized(false);
                setClusters([]);
              }}
            >
              Back to topics
            </button>
            <h1 className="page-title">{title}</h1>
          </div>
        </div>
        <section className="section-card">
          {loadingClusters ? (
            <p className="muted">Loading stories...</p>
          ) : clusters.length === 0 ? (
            <p className="muted">No unread stories in this topic.</p>
          ) : (
            <div className="cards">
              {clusters.map((cluster) => (
                <StoryCard
                  key={cluster.id}
                  cluster={cluster}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Topics</h1>
        <p className="page-meta">
          Browse stories organized by AI-classified topics.
        </p>
      </div>

      <section className="section-card">
        {pendingCount > 0 && (
          <a
            href="/topics/pending"
            className="banner"
          >
            <span>
              <strong>
                {pendingCount} feed{pendingCount !== 1 ? "s" : ""} need
                {pendingCount === 1 ? "s" : ""} topic approval
              </strong>
            </span>
            <span className="button button-secondary button-small">
              Review now
            </span>
          </a>
        )}

        {loading ? (
          <p className="muted">Loading topics...</p>
        ) : (
          <div className="folder-grid">
            <button
              type="button"
              className="folder-card"
              onClick={openUncategorized}
              style={{ borderStyle: "dashed" }}
            >
              Uncategorized
            </button>
            {topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                className="folder-card"
                onClick={() => openTopic(topic)}
              >
                {topic.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function TopicsPage() {
  return (
    <ProtectedRoute>
      <TopicsContent />
    </ProtectedRoute>
  );
}
