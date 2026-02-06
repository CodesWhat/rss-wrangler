"use client";

import { useEffect, useState, useCallback } from "react";
import type { Annotation } from "@rss-wrangler/contracts";
import { listAnnotations, deleteAnnotation } from "@/lib/api";

const COLOR_MAP: Record<string, string> = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
};

interface AnnotationsPanelProps {
  clusterId: string;
  refreshKey?: number;
}

export function AnnotationsPanel({ clusterId, refreshKey }: AnnotationsPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listAnnotations(clusterId);
    setAnnotations(data);
    setLoading(false);
  }, [clusterId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleDelete(id: string) {
    const ok = await deleteAnnotation(id);
    if (ok) {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    }
  }

  if (loading) {
    return <p className="muted" style={{ fontSize: "0.85rem" }}>Loading annotations...</p>;
  }

  if (annotations.length === 0) {
    return (
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        No annotations yet. Select text to highlight.
      </p>
    );
  }

  return (
    <div className="annotations-list">
      {annotations.map((a) => (
        <div
          key={a.id}
          className="annotation-item"
          style={{ borderLeft: `3px solid ${COLOR_MAP[a.color] ?? COLOR_MAP.yellow}` }}
        >
          <blockquote
            className="annotation-quote"
            style={{ background: COLOR_MAP[a.color] ?? COLOR_MAP.yellow }}
          >
            {a.highlightedText}
          </blockquote>
          {a.note && <p className="annotation-note">{a.note}</p>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {new Date(a.createdAt).toLocaleString()}
            </span>
            <button
              type="button"
              className="button button-small button-muted"
              onClick={() => handleDelete(a.id)}
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem" }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
