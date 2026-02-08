"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { SearchBar } from "@/components/search-bar";
import { cn } from "@/lib/cn";
import {
  HomeIcon,
  TagIcon,
  SearchIcon,
  BookmarkIcon,
  FileTextIcon,
  RssIcon,
  BarChartIcon,
  SettingsIcon,
  SlidersIcon,
} from "@/components/icons";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  href: string;
  sidebarLabel: string;
  bottomLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", sidebarLabel: "feed", bottomLabel: "FEED", icon: HomeIcon },
  { href: "/topics", sidebarLabel: "topics", icon: TagIcon },
  { href: "/discover", sidebarLabel: "discover", bottomLabel: "DISCOVER", icon: SearchIcon },
  { href: "/saved", sidebarLabel: "saved", bottomLabel: "SAVED", icon: BookmarkIcon },
  { href: "/digest", sidebarLabel: "digest", bottomLabel: "DIGEST", icon: FileTextIcon },
  { href: "/sources", sidebarLabel: "sources", icon: RssIcon },
  { href: "/stats", sidebarLabel: "stats", icon: BarChartIcon },
  { href: "/account/data-export", sidebarLabel: "export", icon: FileTextIcon },
  { href: "/settings", sidebarLabel: "settings", bottomLabel: "CONFIG", icon: SettingsIcon },
];

const BOTTOM_BAR_ITEMS = NAV_ITEMS.filter((i) => i.bottomLabel);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav() {
  const { authenticated, logoutUser } = useAuth();
  const pathname = usePathname();

  if (!authenticated) return null;

  return (
    <>
      {/* ============ TOPBAR (Mobile/Tablet, hidden at >= 1024px via CSS) ============ */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark" />
          <span className="brand-name">RSS_WRANGLER</span>
        </div>
        <div className="topbar-spacer" />
        <SearchBar />
        <div className="topbar-actions">
          <Link href="/discover" className="topbar-btn" aria-label="Search">
            <SearchIcon />
          </Link>
          <Link href="/settings" className="topbar-btn" aria-label="Settings">
            <SlidersIcon />
          </Link>
        </div>
      </header>

      {/* ============ SIDEBAR (Desktop, hidden below 1024px via CSS) ============ */}
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand">
          <div className="brand-mark" />
          <span className="brand-name">RSS_WRANGLER</span>
        </Link>

        <nav className="sidebar-section" aria-label="Primary">
          <div className="sidebar-section-title">{"// navigation"}</div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("sidebar-nav-item", isActive(pathname, item.href) && "active")}
            >
              <item.icon />
              {item.sidebarLabel}
            </Link>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">U</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">user</div>
          </div>
          <button
            type="button"
            className="button-small sidebar-logout"
            onClick={() => logoutUser()}
          >
            logout
          </button>
        </div>
      </aside>

      {/* ============ BOTTOM BAR (Mobile, hidden at >= 768px via CSS) ============ */}
      <nav className="bottom-bar" aria-label="Mobile navigation">
        {BOTTOM_BAR_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("tab-btn", isActive(pathname, item.href) && "active")}
          >
            <item.icon />
            <span className="tab-label">{item.bottomLabel}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
