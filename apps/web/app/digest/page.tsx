"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { listDigests } from "@/lib/api";
import type { Digest, DigestEntry } from "@rss-wrangler/contracts";

function DigestContent() {
  const [digests, setDigests] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listDigests().then((d) => {
      setDigests(d);
      setLoading(false);
    });
  }, []);

  function renderSection(label: string, entries: DigestEntry[]) {
    if (entries.length === 0) return null;
    return (
      <div className="digest-section">
        <h3>{label}</h3>
        <ul className="list">
          {entries.map((entry) => (
            <li key={entry.clusterId}>
              <strong>{entry.headline}</strong>
              {entry.oneLiner ? <span className="muted"> - {entry.oneLiner}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="section-card">
      <h1>Digest</h1>
      <p className="muted">Top picks, big stories, and quick scan.</p>
      {loading ? (
        <p className="muted">Loading digests...</p>
      ) : digests.length === 0 ? (
        <p>No digests yet. Worker will generate when triggers are met.</p>
      ) : (
        <div className="digest-list">
          {digests.map((digest) => (
            <div key={digest.id} className="digest-item">
              <button
                type="button"
                className="digest-header"
                onClick={() => setExpanded(expanded === digest.id ? null : digest.id)}
              >
                <strong>{digest.title}</strong>
                <span className="muted">{new Date(digest.createdAt).toLocaleString()}</span>
              </button>
              {expanded === digest.id && (
                <div className="digest-body">
                  <p>{digest.body}</p>
                  {renderSection(
                    "Top picks for you",
                    digest.entries.filter((e) => e.section === "top_picks")
                  )}
                  {renderSection(
                    "Big stories",
                    digest.entries.filter((e) => e.section === "big_stories")
                  )}
                  {renderSection(
                    "Quick scan",
                    digest.entries.filter((e) => e.section === "quick_scan")
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function DigestPage() {
  return (
    <ProtectedRoute>
      <DigestContent />
    </ProtectedRoute>
  );
}
