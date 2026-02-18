"use client";

import { useEffect, useRef, useState } from "react";

interface ShareMenuProps {
  articleUrl: string;
  wallabagUrl?: string;
}

export function ShareMenu({ articleUrl, wallabagUrl }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const encodedUrl = encodeURIComponent(articleUrl);

  const services = [
    {
      name: "Pocket",
      url: `https://getpocket.com/save?url=${encodedUrl}`,
    },
    {
      name: "Instapaper",
      url: `https://www.instapaper.com/hello2?url=${encodedUrl}`,
    },
  ];

  if (wallabagUrl) {
    services.push({
      name: "Wallabag",
      url: `${wallabagUrl.replace(/\/+$/, "")}/bookmarklet?url=${encodedUrl}`,
    });
  }

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="button button-small"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Send to read-later service"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
      >
        Send to...
      </button>
      {open && (
        <div
          className="share-menu-dropdown"
          role="menu"
          aria-label="Send to services"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          {services.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="share-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
