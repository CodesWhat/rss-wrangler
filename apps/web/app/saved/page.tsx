"use client";

import { useEffect, useState } from "react";
import { StoryCard } from "@/components/story-card";
import { ProtectedRoute } from "@/components/protected-route";
import { listClusters } from "@/lib/api";
import type { ClusterCard } from "@rss-wrangler/contracts";

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
    <section className="cards">
      <h1>Saved</h1>
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
  );
}

export default function SavedPage() {
  return (
    <ProtectedRoute>
      <SavedFeed />
    </ProtectedRoute>
  );
}
