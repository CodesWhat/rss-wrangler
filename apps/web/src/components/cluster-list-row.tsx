"use client";

import type { ClusterCard } from "@rss-wrangler/contracts";

const TOPIC_COLORS: Record<string, string> = {
  tech: "#0066FF",
  gaming: "#9333EA",
  culture: "#F59E0B",
  science: "#10B981",
  biz: "#EF4444",
  security: "#EC4899",
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

interface ClusterListRowProps {
  cluster: ClusterCard;
  isActive: boolean;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  density: "compact" | "default" | "comfortable";
}

export function ClusterListRow({
  cluster,
  isActive,
  onSelect,
  onToggleStar,
  density,
}: ClusterListRowProps) {
  const topicKey = (cluster.topicName ?? "").toLowerCase().replace(/\s+/g, "");
  const topicColor = TOPIC_COLORS[topicKey] ?? "#888";
  const topicLabel = cluster.topicName
    ? cluster.topicName.length > 6
      ? cluster.topicName.slice(0, 6).toUpperCase()
      : cluster.topicName.toUpperCase()
    : null;

  const rowPadding =
    density === "compact" ? "6px 12px" : density === "default" ? "10px 12px" : "14px 12px";

  return (
    <div
      className={`clr-row ${isActive ? "selected" : ""} ${cluster.isRead ? "read" : ""}`}
      style={{ padding: rowPadding }}
      onClick={() => onSelect(cluster.id)}
      role="button"
      tabIndex={0}
      data-cluster-id={cluster.id}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(cluster.id);
        }
      }}
    >
      <div className="clr-indicators">
        {!cluster.isRead ? (
          <span className="clr-unread-dot" />
        ) : (
          <span style={{ width: 6, height: 6 }} />
        )}
        <button
          type="button"
          className={`clr-star ${cluster.isSaved ? "" : "empty"}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(cluster.id);
          }}
          aria-label={cluster.isSaved ? "Unstar" : "Star"}
        >
          {cluster.isSaved ? "\u2605" : "\u2606"}
        </button>
      </div>
      <div className="clr-content">
        <div className="clr-meta">
          {topicLabel && (
            <span className="clr-topic" style={{ background: topicColor }}>
              {topicLabel}
            </span>
          )}
          <span className="clr-source">{cluster.primarySource}</span>
          <span className="clr-time">{relativeTime(cluster.primarySourcePublishedAt)}</span>
        </div>
        <div className="clr-title">{cluster.headline}</div>
        {density !== "compact" && cluster.summary && (
          <div className="clr-excerpt">{cluster.summary}</div>
        )}
      </div>
    </div>
  );
}
