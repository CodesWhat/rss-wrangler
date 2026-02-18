"use client";

export type ViewLayout = "card" | "list" | "compact";

const STORAGE_KEY = "rss_view_layout";

export function getStoredLayout(): ViewLayout {
  if (typeof window === "undefined") return "card";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "list" || stored === "compact") return stored;
  return "card";
}

export function storeLayout(layout: ViewLayout): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, layout);
  }
}

interface LayoutToggleProps {
  layout: ViewLayout;
  onChange: (layout: ViewLayout) => void;
}

export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <div className="layout-toggle" role="group" aria-label="View layout">
      <button
        type="button"
        className={`button button-small layout-toggle-btn${layout === "card" ? " button-active" : ""}`}
        onClick={() => onChange("card")}
        title="Card view"
        aria-pressed={layout === "card"}
      >
        {/* Grid icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        type="button"
        className={`button button-small layout-toggle-btn${layout === "list" ? " button-active" : ""}`}
        onClick={() => onChange("list")}
        title="List view"
        aria-pressed={layout === "list"}
      >
        {/* List icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="14" height="2" rx="0.5" fill="currentColor" />
          <rect x="1" y="7" width="14" height="2" rx="0.5" fill="currentColor" />
          <rect x="1" y="12" width="14" height="2" rx="0.5" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={`button button-small layout-toggle-btn${layout === "compact" ? " button-active" : ""}`}
        onClick={() => onChange("compact")}
        title="Compact view"
        aria-pressed={layout === "compact"}
      >
        {/* Compact icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="14"
            height="3"
            rx="0.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect
            x="1"
            y="6.5"
            width="14"
            height="3"
            rx="0.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect
            x="1"
            y="12"
            width="14"
            height="3"
            rx="0.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
    </div>
  );
}
