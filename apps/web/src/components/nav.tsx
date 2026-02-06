"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { SearchBar } from "@/components/search-bar";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/topics", label: "Topics" },
  { href: "/digest", label: "Digest" },
  { href: "/saved", label: "Saved" },
  { href: "/discover", label: "Discover" },
  { href: "/sources", label: "Sources" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const { authenticated, logoutUser } = useAuth();
  const pathname = usePathname();

  if (!authenticated) return null;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">RSS Wrangler</div>
        <SearchBar />
        <nav className="nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${pathname === item.href ? " nav-link-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="nav-link"
            onClick={() => logoutUser()}
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
