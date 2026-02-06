import type { ClusterCard } from "@rss-wrangler/contracts";

interface StoryCardProps {
  cluster: ClusterCard;
}

export function StoryCard({ cluster }: StoryCardProps) {
  return (
    <article className="card">
      {cluster.heroImageUrl ? (
        <img className="card-media" src={cluster.heroImageUrl} alt={cluster.headline} loading="lazy" />
      ) : (
        <div className="card-media" aria-hidden="true" />
      )}
      <div className="card-body">
        <h2>{cluster.headline}</h2>
        <p className="muted">
          {cluster.primarySource} · {new Date(cluster.primarySourcePublishedAt).toLocaleString()} · +
          {cluster.outletCount - 1} outlets
        </p>
        {cluster.summary ? <p>{cluster.summary}</p> : null}
        <div className="row">
          <span className="badge">{cluster.folderName}</span>
          {cluster.mutedBreakoutReason ? (
            <span className="badge badge-breakout">Muted topic breakout: {cluster.mutedBreakoutReason}</span>
          ) : null}
          {cluster.isSaved ? <span className="badge">Saved</span> : null}
          {cluster.isRead ? <span className="badge">Read</span> : <span className="badge">Unread</span>}
        </div>
      </div>
    </article>
  );
}
