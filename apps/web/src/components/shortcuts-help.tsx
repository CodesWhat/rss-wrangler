"use client";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: "j", description: "Next story" },
  { key: "k", description: "Previous story" },
  { key: "o / Enter", description: "Open article in new tab" },
  { key: "m", description: "Toggle mark read" },
  { key: "s", description: "Toggle save/bookmark" },
  { key: "r", description: "Refresh feed" },
  { key: "?", description: "Show/hide this help" },
  { key: "/", description: "Focus search bar" },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  if (!open) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button type="button" className="button button-small" onClick={onClose}>
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
