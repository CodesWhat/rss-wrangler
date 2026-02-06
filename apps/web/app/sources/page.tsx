import { listFeeds } from "@/lib/api";

export default async function SourcesPage() {
  const feeds = await listFeeds();

  return (
    <section className="section-card">
      <h1>Sources</h1>
      <p className="muted">Manage feed assignment, weights, and trial sources.</p>
      {feeds.length === 0 ? (
        <p>No feeds added yet.</p>
      ) : (
        <ul className="list">
          {feeds.map((feed) => (
            <li key={feed.id}>
              <strong>{feed.title}</strong> · {feed.weight} · muted: {feed.muted ? "yes" : "no"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
