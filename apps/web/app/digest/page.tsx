import { listDigests } from "@/lib/api";

export default async function DigestPage() {
  const digests = await listDigests();

  return (
    <section className="section-card">
      <h1>Digest</h1>
      <p className="muted">Top picks, big stories, and quick scan.</p>
      {digests.length === 0 ? (
        <p>No digests yet. Worker will generate when triggers are met.</p>
      ) : (
        <ul className="list">
          {digests.map((digest) => (
            <li key={digest.id}>
              <strong>{digest.title}</strong> · {new Date(digest.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
