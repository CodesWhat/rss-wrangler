"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, type SVGProps, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  BarChartIcon,
  BookmarkIcon,
  FileTextIcon,
  HomeIcon,
  RssIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon,
  TagIcon,
} from "@/components/icons";
import { SearchBar } from "@/components/search-bar";
import { getCurrentUserId, listAccountMembers } from "@/lib/api";
import { cn } from "@/lib/cn";

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
  { href: "/account/invites", sidebarLabel: "invites", icon: FileTextIcon },
  { href: "/account/data-export", sidebarLabel: "export", icon: FileTextIcon },
  { href: "/settings", sidebarLabel: "settings", bottomLabel: "CONFIG", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const { authenticated, logoutUser } = useAuth();
  const pathname = usePathname();
  const [isOwner, setIsOwner] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setIsOwner(false);
      setUsername(null);
      return;
    }
    let cancelled = false;
    async function loadRole() {
      const members = await listAccountMembers();
      const currentUserId = getCurrentUserId();
      const currentMember = members.find((member) => member.id === currentUserId);
      if (!cancelled) {
        setIsOwner(currentMember?.role === "owner");
        setUsername(currentMember?.username ?? null);
      }
    }
    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.href !== "/account/invites" || isOwner),
    [isOwner],
  );
  const bottomBarItems = useMemo(() => navItems.filter((item) => item.bottomLabel), [navItems]);

  if (!authenticated) return null;

  return (
    <>
      {/* ============ TOPBAR (Mobile/Tablet, hidden at >= 1024px via CSS) ============ */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark" aria-hidden="true" />
          <span className="brand-name">RSS_WRANGLER</span>
        </div>
        <div className="topbar-spacer" />
        <SearchBar />
        <div className="topbar-actions">
          <Link href="/discover" className="topbar-btn" aria-label="Discover feeds">
            <SearchIcon aria-hidden="true" />
          </Link>
          <Link href="/settings" className="topbar-btn" aria-label="Settings">
            <SlidersIcon aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* ============ SIDEBAR (Desktop, hidden below 1024px via CSS) ============ */}
      <aside className="sidebar" aria-label="Sidebar">
        <Link href="/" className="sidebar-brand" aria-label="RSS Wrangler home">
          <div className="brand-mark" aria-hidden="true" />
          <span className="brand-name">RSS_WRANGLER</span>
        </Link>

        <nav className="sidebar-section" aria-label="Main navigation">
          <div className="sidebar-section-title" aria-hidden="true">
            {"// navigation"}
          </div>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("sidebar-nav-item", isActive(pathname, item.href) && "active")}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <item.icon aria-hidden="true" />
              {item.sidebarLabel}
            </Link>
          ))}
        </nav>

        <hr className="sidebar-divider" />

        <div className="sidebar-user" role="region" aria-label="User account">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {(username ?? "U").charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{username ?? "user"}</div>
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
      <nav className="bottom-bar" aria-label="Tab navigation">
        {bottomBarItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("tab-btn", isActive(pathname, item.href) && "active")}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            <item.icon aria-hidden="true" />
            <span className="tab-label">{item.bottomLabel}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
