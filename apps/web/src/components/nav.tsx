import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/folders", label: "Folders" },
  { href: "/digest", label: "Digest" },
  { href: "/saved", label: "Saved" },
  { href: "/sources", label: "Sources" },
  { href: "/settings", label: "Settings" }
];

export function AppNav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">RSS Wrangler</div>
        <nav className="nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
