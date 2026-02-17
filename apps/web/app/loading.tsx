export default function Loading() {
  return (
    <div style={{ padding: "var(--sp-8) var(--sp-4)" }}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column" as const,
          gap: "var(--sp-4)",
        }}
      >
        {/* Page header skeleton */}
        <div>
          <div
            style={{
              width: 180,
              height: 24,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-hairline)",
              marginBottom: "var(--sp-2)",
            }}
          />
          <div
            style={{
              width: 120,
              height: 14,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-hairline)",
            }}
          />
        </div>

        {/* Story card skeletons */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--sp-4)",
              display: "flex",
              flexDirection: "column" as const,
              gap: "var(--sp-2)",
            }}
          >
            <div
              style={{
                width: 100,
                height: 12,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-hairline)",
              }}
            />
            <div
              style={{
                width: "85%",
                height: 16,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-hairline)",
              }}
            />
            <div
              style={{
                width: "60%",
                height: 14,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-hairline)",
              }}
            />
          </div>
        ))}

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            textAlign: "center" as const,
          }}
        >
          Loading...
        </p>
      </div>
    </div>
  );
}
