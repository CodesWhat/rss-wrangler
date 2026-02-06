import { listFolders } from "@/lib/api";

export default async function FoldersPage() {
  const folders = await listFolders();

  return (
    <section className="section-card">
      <h1>Auto folders</h1>
      <p className="muted">Site-first assignment with minimal folder concepts.</p>
      <ul className="list">
        {folders.map((folder) => (
          <li key={folder.id}>{folder.name}</li>
        ))}
      </ul>
    </section>
  );
}
