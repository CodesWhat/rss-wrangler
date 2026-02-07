"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { addFeed, exportOpml, getFeedTopics, importOpml, listFeeds, listFolders, updateFeed } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Feed, FeedTopic, Folder, FeedWeight } from "@rss-wrangler/contracts";

function SourcesContent() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedUrl, setFeedUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [feedTopics, setFeedTopics] = useState<Record<string, FeedTopic[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listFeeds(), listFolders()]).then(([f, fo]) => {
      setFeeds(f);
      setFolders(fo);
      setLoading(false);
      // Load topic proposals for feeds with non-approved classification status
      f.forEach((feed) => {
        if (feed.classificationStatus !== "approved") {
          getFeedTopics(feed.id).then((topics) => {
            setFeedTopics((prev) => ({ ...prev, [feed.id]: topics }));
          });
        }
      });
    });
  }, []);

  function folderName(id: string): string {
    return folders.find((f) => f.id === id)?.name ?? "Unknown";
  }

  async function handleAddFeed(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddBusy(true);
    const feed = await addFeed(feedUrl);
    if (feed) {
      setFeeds((prev) => [...prev, feed]);
      setFeedUrl("");
    } else {
      setAddError("Failed to add feed. Check URL and try again.");
    }
    setAddBusy(false);
  }

  async function handleOpmlImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setImportMsg("Importing...");
    const result = await importOpml(file);
    if (result) {
      setImportMsg(`Imported ${result.imported} feeds.`);
      const refreshed = await listFeeds();
      setFeeds(refreshed);
    } else {
      setImportMsg("Import failed.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleWeightChange(feed: Feed, weight: FeedWeight) {
    const updated = await updateFeed(feed.id, { weight });
    if (updated) {
      setFeeds((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  async function handleToggleMute(feed: Feed) {
    const updated = await updateFeed(feed.id, { muted: !feed.muted });
    if (updated) {
      setFeeds((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  function badgeClass(status: string): string {
    if (status === "approved") return "badge badge-approved";
    if (status === "pending") return "badge badge-pending";
    if (status === "rejected") return "badge badge-rejected";
    return "badge";
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Sources</h1>
        <p className="page-meta">Manage feed assignment, weights, and trial sources.</p>
      </div>

      <section className="section-card">
        <div className="source-actions">
          <form onSubmit={handleAddFeed} className="add-feed-form">
            <input
              type="url"
              placeholder="https://example.com/feed.xml"
              required
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              className="input"
            />
            <button type="submit" className="button button-primary" disabled={addBusy}>
              {addBusy ? "Adding..." : "Add feed"}
            </button>
          </form>
          {addError ? <p className="error-text">{addError}</p> : null}

          <div className="opml-import">
            <label className="muted">OPML import:</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleOpmlImport}
            />
            {importMsg ? <p className="muted">{importMsg}</p> : null}
          </div>

          <div className="opml-export">
            <button
              type="button"
              className="button"
              onClick={() => exportOpml()}
            >
              Export OPML
            </button>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading feeds...</p>
        ) : feeds.length === 0 ? (
          <p>No feeds added yet. Add a URL or import OPML above.</p>
        ) : (
          <table className="feed-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Topics</th>
                <th>Weight</th>
                <th>Muted</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.id}>
                  <td>
                    <strong>{feed.title || feed.url}</strong>
                    {feed.trial && <span className="badge badge-ml">Trial</span>}
                  </td>
                  <td>
                    {feedTopics[feed.id]?.map((ft) => (
                      <span
                        key={ft.topicId}
                        className={cn(badgeClass(ft.status), "badge-mr")}
                      >
                        {ft.topicName}
                      </span>
                    )) ?? null}
                    {feed.classificationStatus !== "approved" && (
                      <a href="/topics/pending" className="badge badge-ml-sm">
                        Pending
                      </a>
                    )}
                    {(!feedTopics[feed.id] || (feedTopics[feed.id]?.length ?? 0) === 0) && feed.classificationStatus === "approved" && (
                      <span className="muted">{folderName(feed.folderId)}</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={feed.weight}
                      onChange={(e) => handleWeightChange(feed, e.target.value as FeedWeight)}
                    >
                      <option value="prefer">Prefer</option>
                      <option value="neutral">Neutral</option>
                      <option value="deprioritize">Deprioritize</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={cn("button button-small", feed.muted && "button-active")}
                      onClick={() => handleToggleMute(feed)}
                    >
                      {feed.muted ? "Muted" : "Active"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function SourcesPage() {
  return (
    <ProtectedRoute>
      <SourcesContent />
    </ProtectedRoute>
  );
}
