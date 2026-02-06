"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { listDigests } from "@/lib/api";
import type { Digest, DigestEntry } from "@rss-wrangler/contracts";

function simpleMarkdownToHtml(md: string): string {
  // Pre-process: merge continuation lines into their parent list items.
  // A continuation line follows a "- " item and doesn't start with "- ", "* ", "## ", or blank.
  const lines = md.split("\n");
  const merged: string[] = [];
  for (const line of lines) {
    if (
      merged.length > 0 &&
      /^[-*] /.test(merged[merged.length - 1]!) &&
      line.length > 0 &&
      !/^[-*] /.test(line) &&
      !/^#{2,4} /.test(line)
    ) {
      merged[merged.length - 1] += " " + line;
    } else {
      merged.push(line);
    }
  }

  let html = merged.join("\n")
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings (## and ###)
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered list items (- item or * item)
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Paragraphs: replace double newlines with paragraph breaks
  html = html.replace(/\n{2,}/g, "</p><p>");

  // Single newlines to <br> (but not inside tags)
  html = html.replace(/\n/g, "<br>");

  // Wrap in paragraph
  html = "<p>" + html + "</p>";

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h[34]>)/g, "$1");
  html = html.replace(/(<\/h[34]>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");

  return html;
}

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
                  <div
                    className="digest-markdown"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(digest.body) }}
                  />
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
