"use client";

import { useCallback, useEffect, useRef } from "react";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: "j", description: "Next story" },
  { key: "k", description: "Previous story" },
  { key: "o / Enter", description: "Open article in new tab" },
  { key: "m", description: "Open actions menu" },
  { key: "p", description: "Prefer source" },
  { key: "x", description: "Mute source" },
  { key: "s", description: "Toggle save/bookmark" },
  { key: "r", description: "Refresh feed" },
  { key: "?", description: "Show/hide this help" },
  { key: "/", description: "Focus search bar" },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus Close button when dialog opens
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  // Trap focus inside the dialog and handle Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="shortcuts-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onKeyDown={handleKeyDown}
    >
      <div ref={panelRef} className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button-small"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <table className="shortcuts-table">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.key}>
                <td>
                  <kbd className="shortcut-key">{s.key}</kbd>
                </td>
                <td>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="shortcuts-fab"
      onClick={onClick}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
    >
      ?
    </button>
  );
}
