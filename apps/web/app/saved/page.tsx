"use client";

import type { ClusterCard } from "@rss-wrangler/contracts";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { StoryCard } from "@/components/story-card";
import { listClusters } from "@/lib/api";

function SavedFeed() {
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listClusters({ state: "saved", sort: "latest", limit: 50 }).then((result) => {
      setClusters(result.data);
      setLoading(false);
    });
  }, []);

  function handleRemove(id: string) {
    setClusters((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Saved</h1>
        <p className="page-meta">
          <span className="count">{clusters.length} stories</span>
        </p>
      </div>
      <section className="cards">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : clusters.length === 0 ? (
          <p className="muted">No saved stories yet.</p>
        ) : (
          clusters.map((cluster) => (
            <StoryCard key={cluster.id} cluster={cluster} onRemove={handleRemove} />
          ))
        )}
      </section>
    </>
  );
}

export default function SavedPage() {
  return (
    <ProtectedRoute>
      <SavedFeed />
    </ProtectedRoute>
  );
}
