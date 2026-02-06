"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationColor } from "@rss-wrangler/contracts";
import { createAnnotation } from "@/lib/api";

const COLORS: { value: AnnotationColor; label: string; css: string }[] = [
  { value: "yellow", label: "Yellow", css: "#fef08a" },
  { value: "green", label: "Green", css: "#bbf7d0" },
  { value: "blue", label: "Blue", css: "#bfdbfe" },
  { value: "pink", label: "Pink", css: "#fbcfe8" },
];

interface AnnotationToolbarProps {
  clusterId: string;
  containerRef: React.RefObject<HTMLElement | null>;
  onAnnotationCreated?: () => void;
}

export function AnnotationToolbar({
  clusterId,
  containerRef,
  onAnnotationCreated,
}: AnnotationToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const [pendingColor, setPendingColor] = useState<AnnotationColor>("yellow");
  const [busy, setBusy] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      // Don't hide if note input is showing
      if (!showNoteInput) {
        setPosition(null);
        setSelectedText("");
      }
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      if (!showNoteInput) {
        setPosition(null);
        setSelectedText("");
      }
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      if (!showNoteInput) {
        setPosition(null);
        setSelectedText("");
      }
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setSelectedText(text);
    setPosition({
      top: rect.top - containerRect.top - 44,
      left: rect.left - containerRect.left + rect.width / 2,
    });
  }, [containerRef, showNoteInput]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  async function handleHighlight(color: AnnotationColor) {
    if (busy || !selectedText) return;
    setBusy(true);
    const result = await createAnnotation(clusterId, {
      highlightedText: selectedText,
      color,
    });
    if (result) {
      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
      onAnnotationCreated?.();
    }
    setBusy(false);
  }

  async function handleSaveWithNote() {
    if (busy || !selectedText) return;
    setBusy(true);
    const result = await createAnnotation(clusterId, {
      highlightedText: selectedText,
      note: note || undefined,
      color: pendingColor,
    });
    if (result) {
      window.getSelection()?.removeAllRanges();
      setPosition(null);
      setSelectedText("");
      setShowNoteInput(false);
      setNote("");
      onAnnotationCreated?.();
    }
    setBusy(false);
  }

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      className="annotation-toolbar"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        zIndex: 50,
      }}
    >
      <div className="annotation-toolbar-inner">
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className="annotation-color-btn"
            style={{ background: c.css }}
            title={`Highlight ${c.label}`}
            disabled={busy}
            onClick={() => handleHighlight(c.value)}
          />
        ))}
        <button
          type="button"
          className="button button-small"
          disabled={busy}
          onClick={() => {
            setShowNoteInput(!showNoteInput);
            setPendingColor("yellow");
          }}
          style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
        >
          + Note
        </button>
      </div>
      {showNoteInput && (
        <div className="annotation-note-form">
          <input
            type="text"
            className="input"
            placeholder="Add a note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveWithNote();
            }}
            autoFocus
            style={{ fontSize: "0.82rem" }}
          />
          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="annotation-color-btn"
                style={{
                  background: c.css,
                  outline: pendingColor === c.value ? "2px solid var(--accent)" : "none",
                  outlineOffset: "1px",
                }}
                onClick={() => setPendingColor(c.value)}
              />
            ))}
            <button
              type="button"
              className="button button-small button-primary"
              disabled={busy}
              onClick={handleSaveWithNote}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
