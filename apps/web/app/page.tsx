import { StoryCard } from "@/components/story-card";
import { listClusters } from "@/lib/api";

export default async function HomePage() {
  const { data } = await listClusters({ limit: 20, state: "unread", sort: "personal" });

  return (
    <>
      <section className="banner">
        <div>
          <strong>Digest available when away or backlog is high.</strong>
          <p>Default triggers: away 24h or unread backlog 50 clusters.</p>
        </div>
        <a href="/digest" className="button button-secondary">
          Open digest
        </a>
      </section>

      <section className="cards" aria-label="Story cards">
        {data.map((cluster) => (
          <StoryCard key={cluster.id} cluster={cluster} />
        ))}
      </section>
    </>
  );
}
