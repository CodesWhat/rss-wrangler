import { StoryCard } from "@/components/story-card";
import { listClusters } from "@/lib/api";

export default async function SavedPage() {
  const { data } = await listClusters({ state: "saved", sort: "latest", limit: 50 });

  return (
    <section className="cards">
      <h1>Saved</h1>
      {data.length === 0 ? <p className="muted">No saved stories yet.</p> : null}
      {data.map((cluster) => (
        <StoryCard key={cluster.id} cluster={cluster} />
      ))}
    </section>
  );
}
