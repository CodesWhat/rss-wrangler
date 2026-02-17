"use client";

import { useEffect } from "react";

export default function TopicsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RSS Wrangler] Topics error:", error);
  }, [error]);

  return (
    <div style={{ padding: "var(--sp-4)" }}>
      <div className="section-card" style={{ maxWidth: 480 }}>
        <p
          className="mono"
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--danger)",
            marginBottom: "var(--sp-2)",
          }}
        >
          TOPICS ERROR
        </p>
        <p className="page-title" style={{ marginBottom: "var(--sp-3)" }}>
          Failed to load topics
        </p>
        <p className="muted" style={{ marginBottom: "var(--sp-4)" }}>
          Could not load your topic classifications. Please try again.
        </p>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button type="button" onClick={reset} className="button button-primary">
            Try again
          </button>
          <a href="/" className="button button-secondary">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
