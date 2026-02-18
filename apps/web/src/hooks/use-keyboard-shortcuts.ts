"use client";

import { useCallback, useEffect } from "react";

export interface KeyboardShortcutActions {
  onNextCard: () => void;
  onPrevCard: () => void;
  onOpenSelected: () => void;
  onToggleRead: () => void;
  onToggleSave: () => void;
  onRefresh: () => void;
  onToggleHelp: () => void;
  onFocusSearch: () => void;
  onOpenMenu: () => void;
  onPreferSource: () => void;
  onMuteSource: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in an input/textarea or when modifier keys are held
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          actions.onNextCard();
          break;
        case "k":
          e.preventDefault();
          actions.onPrevCard();
          break;
        case "o":
        case "Enter":
          e.preventDefault();
          actions.onOpenSelected();
          break;
        case "m":
          e.preventDefault();
          actions.onOpenMenu();
          break;
        case "p":
          e.preventDefault();
          actions.onPreferSource();
          break;
        case "x":
          e.preventDefault();
          actions.onMuteSource();
          break;
        case "s":
          e.preventDefault();
          actions.onToggleSave();
          break;
        case "r":
          e.preventDefault();
          actions.onRefresh();
          break;
        case "?":
          e.preventDefault();
          actions.onToggleHelp();
          break;
        case "/":
          e.preventDefault();
          actions.onFocusSearch();
          break;
      }
    },
    [actions],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
