import Link from "next/link";

export default function NotFound() {
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
          textAlign: "center" as const,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "3rem",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "var(--text-primary)",
            lineHeight: 1,
            marginBottom: "var(--sp-2)",
          }}
        >
          404
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            marginBottom: "var(--sp-4)",
          }}
        >
          Page not found
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: "var(--sp-6)",
          }}
        >
          The page you requested does not exist or has been moved.
        </p>
        <Link href="/" className="button button-primary">
          Back to feed
        </Link>
      </div>
    </div>
  );
}
