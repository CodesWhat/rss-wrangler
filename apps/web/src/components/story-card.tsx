"use client";

import { useState } from "react";
import type { ClusterCard } from "@rss-wrangler/contracts";
import { markClusterRead, saveCluster, clusterFeedback } from "@/lib/api";

interface StoryCardProps {
  cluster: ClusterCard;
  onRemove?: (id: string) => void;
}

export function StoryCard({ cluster, onRemove }: StoryCardProps) {
  const [saved, setSaved] = useState(cluster.isSaved);
  const [read, setRead] = useState(cluster.isRead);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    const ok = await saveCluster(cluster.id);
    if (ok) setSaved(true);
    setBusy(false);
  }

  async function handleMarkRead() {
    if (busy) return;
    setBusy(true);
    const ok = await markClusterRead(cluster.id);
    if (ok) {
      setRead(true);
      onRemove?.(cluster.id);
    }
    setBusy(false);
  }

  async function handleNotInterested() {
    if (busy) return;
    setBusy(true);
    const ok = await clusterFeedback(cluster.id, { type: "not_interested" });
    if (ok) onRemove?.(cluster.id);
    setBusy(false);
  }

  return (
    <article className="card">
      {cluster.heroImageUrl ? (
        <img
          className="card-media"
          src={cluster.heroImageUrl}
          alt={cluster.headline}
          loading="lazy"
        />
      ) : (
        <div className="card-media" aria-hidden="true" />
      )}
      <div className="card-body">
        <h2>{cluster.headline}</h2>
        <p className="muted">
          {cluster.primarySource} &middot;{" "}
          {new Date(cluster.primarySourcePublishedAt).toLocaleString()} &middot; +
          {cluster.outletCount - 1} outlets
        </p>
        {cluster.summary ? <p>{cluster.summary}</p> : null}
        <div className="row">
          <span className="badge">{cluster.folderName}</span>
          {cluster.mutedBreakoutReason ? (
            <span className="badge badge-breakout">
              Muted topic breakout: {cluster.mutedBreakoutReason}
            </span>
          ) : null}
          {saved ? <span className="badge">Saved</span> : null}
          {read ? <span className="badge">Read</span> : <span className="badge">Unread</span>}
        </div>
        <div className="card-actions">
          {!saved && (
            <button
              type="button"
              className="button button-small"
              onClick={handleSave}
              disabled={busy}
            >
              Save
            </button>
          )}
          {!read && (
            <button
              type="button"
              className="button button-small"
              onClick={handleMarkRead}
              disabled={busy}
            >
              Mark read
            </button>
          )}
          <button
            type="button"
            className="button button-small button-muted"
            onClick={handleNotInterested}
            disabled={busy}
          >
            Not interested
          </button>
        </div>
      </div>
    </article>
  );
}
