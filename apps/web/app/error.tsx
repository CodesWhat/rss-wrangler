"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RSS Wrangler] Unhandled error:", error);
  }, [error]);

  return (
    <div style={{ padding: "var(--sp-8) var(--sp-4)" }}>
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          background: "var(--bg-surface)",
          border: "2px solid var(--border-black)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--sp-8)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            color: "var(--danger)",
            marginBottom: "var(--sp-2)",
          }}
        >
          ERROR
        </p>
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "1.25rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: "var(--sp-3)",
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: "var(--sp-4)",
          }}
        >
          An unexpected error occurred while loading this page.
          {error.digest && (
            <span
              style={{
                display: "block",
                marginTop: "var(--sp-2)",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
              }}
            >
              Ref: {error.digest}
            </span>
          )}
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
