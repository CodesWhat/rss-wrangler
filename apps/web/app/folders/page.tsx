"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { StoryCard } from "@/components/story-card";
import { listClusters, listFolders } from "@/lib/api";
import type { ClusterCard, Folder } from "@rss-wrangler/contracts";

function FoldersContent() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);

  useEffect(() => {
    listFolders().then((f) => {
      setFolders(f);
      setLoading(false);
    });
  }, []);

  async function openFolder(folder: Folder) {
    setSelectedFolder(folder);
    setLoadingClusters(true);
    const result = await listClusters({
      folder_id: folder.id,
      state: "unread",
      sort: "latest",
      limit: 50,
    });
    setClusters(result.data);
    setLoadingClusters(false);
  }

  function handleRemove(id: string) {
    setClusters((prev) => prev.filter((c) => c.id !== id));
  }

  if (selectedFolder) {
    return (
      <section className="section-card">
        <div className="row" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setSelectedFolder(null);
              setClusters([]);
            }}
          >
            Back to folders
          </button>
          <h1 style={{ margin: 0 }}>{selectedFolder.name}</h1>
        </div>
        {loadingClusters ? (
          <p className="muted">Loading stories...</p>
        ) : clusters.length === 0 ? (
          <p className="muted">No unread stories in this folder.</p>
        ) : (
          <div className="cards">
            {clusters.map((cluster) => (
              <StoryCard key={cluster.id} cluster={cluster} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="section-card">
      <h1>Auto folders</h1>
      <p className="muted">Site-first assignment with minimal folder concepts.</p>
      {loading ? (
        <p className="muted">Loading folders...</p>
      ) : (
        <div className="folder-grid">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="folder-card"
              onClick={() => openFolder(folder)}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function FoldersPage() {
  return (
    <ProtectedRoute>
      <FoldersContent />
    </ProtectedRoute>
  );
}
