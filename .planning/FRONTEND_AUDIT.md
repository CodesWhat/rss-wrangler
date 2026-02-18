# RSS Wrangler Frontend Audit

**Date:** 2026-02-16
**Auditor:** frontend-auditor agent

---

## 1. UI Libraries Installed

| Package | Version | Notes |
|---------|---------|-------|
| next | ^16.1.6 | App Router, React 19 |
| react / react-dom | ^19.2.4 | Latest React |

**No component libraries.** No shadcn/ui, Radix, Headless UI, Tailwind CSS, CSS Modules, or CSS-in-JS. The entire design system is a single `globals.css` file (~4200 lines) with plain CSS custom properties. All components use plain JSX with `className` strings and a `cn()` utility (likely clsx/classnames).

---

## 2. Design System (CSS Custom Properties)

### 2.1 Color Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| `--bg` / `--bg-base` | #F4F5F8 | Page background |
| `--surface` / `--bg-surface` | #FFFFFF | Card/panel surfaces |
| `--surface-alt` / `--bg-sidebar` / `--bg-elevated` | #ECEFF4 | Sidebar, elevated surfaces |
| `--bg-hover` | #E6EAF2 | Hover states |
| `--bg-active` | #DDE3EE | Active/pressed states |
| `--bg-invert` | #0A0A0A | Inverted backgrounds (selected buttons, banners) |
| `--border` / `--border-default` | #D0D0D0 | Standard borders |
| `--border-hairline` | #E0E0E0 | Subtle dividers |
| `--border-strong` | #AAAAAA | Emphasized borders |
| `--border-black` | #0A0A0A | Thick structural borders (sidebar, topbar) |
| `--text` / `--text-primary` | #0A0A0A | Primary text |
| `--text-secondary` | #555555 | Secondary text |
| `--muted` / `--text-tertiary` | #888888 | Muted labels |
| `--text-muted` | #AAAAAA | Very muted text |
| `--text-invert` | #FAFAFA | White text on dark bg |
| `--accent` | #0066FF | Primary accent (electric blue) |
| `--accent-hover` | #0052CC | Accent hover |
| `--accent-dim` | rgba(0,102,255,0.08) | Accent tint for backgrounds |

### 2.2 Topic Colors

| Token | Value | Topic |
|-------|-------|-------|
| `--topic-tech` | #0066FF | Technology |
| `--topic-gaming` | #9333EA | Gaming (purple) |
| `--topic-culture` | #F59E0B | Culture (amber) |
| `--topic-science` | #10B981 | Science (green) |
| `--topic-biz` | #EF4444 | Business (red) |
| `--topic-security` | #EC4899 | Security (pink) |

### 2.3 Semantic Colors

| Token | Value |
|-------|-------|
| `--success` | #16A34A |
| `--warning` | #D97706 |
| `--danger` | #DC2626 |

### 2.4 Typography

- **Mono font:** `--font-mono` = JetBrains Mono (loaded via `next/font/google`, weights 400/600/700)
- **Sans font:** `--font-sans` = Space Grotesk (loaded via `next/font/google`, weights 400/600/700)
- `color-scheme: light` only -- **no dark mode**
- All UI chrome (nav, labels, badges, buttons) uses mono font in uppercase
- Headlines/body use sans font
- Base font size: 16px

### 2.5 Spacing

4px grid: `--sp-1` (4px) through `--sp-10` (40px).

### 2.6 Radius

Sharp/brutalist: `--radius-none` (0px), `--radius-sm` (2px). No rounded corners beyond 2px.

### 2.7 Transitions

- `--transition-fast`: 100ms ease
- `--transition-base`: 150ms ease

### 2.8 Layout Tokens

- `--sidebar-width`: 260px
- `--topbar-height`: 48px
- `--bottombar-height`: 60px

---

## 3. App Shell Layout Structure

### 3.1 Root Layout (`layout.tsx`)

```
<html>
  <body>
    <AuthProvider>
      <div class="app-shell">
        <a class="skip-to-main">Skip to main content</a>
        <AppNav />            <!-- sidebar + topbar + bottom-bar -->
        <main class="main">
          {children}
        </main>
        <PrivacyConsentManager />  (conditional)
      </div>
    </AuthProvider>
  </body>
</html>
```

### 3.2 Responsive Layout Tiers

| Breakpoint | Shell | Nav | Notes |
|------------|-------|-----|-------|
| < 768px (mobile) | Flex column | Sticky topbar (48px) + fixed bottom tab bar (60px) | Reader panel hidden entirely |
| 768px-1023px (tablet) | Flex column | Sticky topbar, no bottom bar | Reader = fixed slide-in drawer (80vw, max 560px) from right |
| >= 1024px (desktop) | CSS Grid: `sidebar(260px) | main(1fr)` | Sidebar visible, topbar hidden | Reader = inline split or focus mode |
| >= 1280px (wide) | Same grid, minor spacing increases | Same | Wider card padding, larger font |

### 3.3 Home Page Shell (`page.tsx`)

The home page wraps content in a `.home-shell` container that transforms based on reader state:

- **No reader open:** `.home-shell` = flex column, max-width 1280px centered
- **Split reader:** `.home-shell[data-reader="split"]` = grid with `minmax(320px, 420px) 1fr`, full viewport height
- **Focus reader:** `.home-shell[data-reader="focus"]` = grid with `0fr 1fr`, story list hidden

Inside:
```
.home-shell
  .story-list-column
    .page-header     (title, count)
    .feed-controls   (sort buttons, layout toggle, mark-all-read, refresh)
    .cards           (story feed, infinite scroll)
  .reader-backdrop   (tablet overlay)
  .reader-column     (ReaderPanel component)
```

---

## 4. Navigation Structure

### 4.1 Sidebar (Desktop >= 1024px)

- Brand mark + name at top
- Section divider: `// navigation`
- Nav items (icon + lowercase mono label, 3px left border indicator):
  - feed (/)
  - topics (/topics)
  - discover (/discover)
  - saved (/saved)
  - digest (/digest)
  - sources (/sources)
  - stats (/stats)
  - invites (/account/invites) -- owner only
  - export (/account/data-export)
  - settings (/settings)
- Divider
- User section at bottom: avatar circle + username + logout button

### 4.2 Topbar (Mobile/Tablet < 1024px)

- Brand mark + name
- Spacer (flex: 1)
- SearchBar component
- Discover icon link + Settings icon link

### 4.3 Bottom Tab Bar (Mobile < 768px)

Subset of 5 tabs: FEED, DISCOVER, SAVED, DIGEST, CONFIG

---

## 5. Story Card Anatomy

### 5.1 Display Modes

The StoryCard component supports 4 layout variants, set per-page:

| Layout | Description |
|--------|-------------|
| `card` (default) | Full card with source line, hero image, headline, summary, footer with tags + action buttons |
| `list` | Single line: source/time/badges/headline, kebab menu inline |
| `compact` | Two lines: source row + headline + optional hero + summary |
| `headline` | Headline-only mode for old/aged content (progressive summarization) |

### 5.2 Card Layout Fields (full card view)

```
<article class="story-card" data-topic="tech" data-cluster-id="..." data-article-url="...">
  .story-source
    .unread-marker          (6px blue square)
    .source-name            (uppercase mono, e.g. "ARS_TECHNICA")
    .source-sep             ("/")
    .story-time             ("2h ago")
    .story-outlet-badge     ("+2 outlets" if merged)
    .story-source-tag       (topic label, e.g. "TECH")
    .story-ai-summary-badge ("AI summary" if progressive mode)
    .story-cluster-link     ("Story" link to /clusters/:id)
    .card-actions-menu-wrap (kebab "..." menu)

  img.story-hero            (1200x630 cover, lazy loaded)

  .story-card-body
    AnnotationToolbar       (text selection highlight tool)
    h2.story-headline       (linked to article URL, 2-line clamp)
    p.story-summary         (2-line clamp)

  .story-footer
    .story-tag              (topic color chip)
    .story-tag.tag-trending ("TRENDING" if breakout)
    details.story-why-details (ranking explainability popover)
    .story-actions
      bookmark button       (BookmarkIcon, toggles fill)
      mark-read button      (CheckIcon, removes card)
      not-interested button (XIcon, removes card)
      ShareMenu             (copy link, wallabag, etc.)
```

### 5.3 Card Styling Details

- Left border: 3px colored by topic (tech=blue, gaming=purple, etc.)
- Bottom border only (no card shadow, no rounded corners)
- Hover: background changes to `--bg-elevated`
- Selected (keyboard): 2px blue outline
- Reader-selected: `.story-card-reader-selected` class (no extra styling found in CSS)
- Read state: headline + source text fade to tertiary/muted colors
- Cards are stacked vertically with `gap: 0` (border-bottom separated)

### 5.4 Kebab Menu Actions

Dropdown from MoreHorizontal icon:
- Prefer [source] (star icon)
- Mute [source] (volume-x icon, danger style)
- Reset [source]
- Separator
- Mute keyword (submenu with auto-extracted candidates + custom input)

### 5.5 Sponsored Cards

Mixed into feed based on `position` field. Separate `SponsoredCard` component.

---

## 6. Reader Panel

### 6.1 Structure

```
.reader-panel-content
  .reader-panel-toolbar
    .cluster-reader-mode-toggle (Feed / Original / Text tabs)
    .reader-panel-toolbar-actions
      "Expand" link to /clusters/:id
      Close button (XIcon)

  .reader-panel-body
    .reader-panel-meta    (badge, source name, time)
    h2.reader-panel-headline
    img.reader-panel-hero (optional)

    [Feed mode]  p.cluster-story-text (summary/storySoFar)
    [Original]   iframe.cluster-reader-frame + "Open in new tab" link
    [Text mode]  p.cluster-story-state + p.cluster-story-text (extracted fulltext)

    details.reader-panel-outlets (expandable list of merged outlet members)
```

### 6.2 Reader Modes

- **Feed:** Summary text from cluster
- **Original:** Embedded iframe of article URL (with error fallback)
- **Text:** Extracted full-text content
- Per-feed default reader mode supported (`primaryFeedDefaultReaderMode`)
- User global default stored in localStorage

### 6.3 Reader Layout Modes

- **Split:** Story list (320-420px) + reader side by side (desktop only)
- **Focus:** Story list hidden, reader takes full width (desktop only)
- Layout preference persisted in localStorage

---

## 7. Search System

### 7.1 SearchBar Component

- Text input with search icon, debounced 300ms
- Dropdown showing StoryCard results (max 10)
- Scope filters: folder dropdown + feed/source dropdown
- Saved searches: select dropdown + save/delete buttons
- Positioned in topbar on mobile, sidebar-adjacent on desktop
- Max width: 320px

### 7.2 Keyboard Shortcuts

Full keyboard navigation via `useKeyboardShortcuts` hook:
- j/k: navigate cards
- o: open selected article
- m: mark read
- s: save/bookmark
- .: open kebab menu
- +: prefer source
- -: mute source
- r: refresh
- /: focus search
- ?: toggle help

---

## 8. Settings Page Layout

Vertical stack of `section-card` blocks:
- AI Provider (mode, provider, API key, budget cap, fallback toggle)
- General (digest timing, poll interval, retention, progressive summarization, mark-read behavior, wallabag)
- Billing (plan overview, usage cards, upgrade/downgrade, portal)
- AI Usage (token counts, cost, budget bars, by-provider/feature tables)
- Members (table with role, status, actions)
- Account (password change form)
- Danger Zone (account deletion)
- Notifications (push toggle)
- Filters (CRUD table for mute/block/keep rules)

Settings use auto-save on field change (800ms debounce) with inline "SAVING..." / "SAVED" indicators.

---

## 9. What Exists (Strengths)

1. **Strong design language:** Consistent brutalist/mono aesthetic throughout
2. **3 view layouts:** Card, list, compact -- all implemented
3. **Reader panel:** Split + focus modes with Feed/Original/Text tabs
4. **Keyboard navigation:** Full vim-style shortcuts with help dialog
5. **Progressive display:** headline-only / summary / full modes based on age
6. **Ranking explainability:** "Why" popover showing score breakdown
7. **Mark-read system:** On-scroll, on-open, manual, bulk (with undo toast)
8. **Topic coloring:** 6 topic colors with left-border indicators
9. **Responsive:** 4-tier breakpoint system (mobile/tablet/desktop/wide)
10. **Accessibility:** Skip links, ARIA roles, keyboard menus, aria-expanded
11. **Inline tuning:** Prefer/mute source, mute keyword from card actions
12. **Infinite scroll:** IntersectionObserver-based with manual "Load more" fallback
13. **Search:** Debounced with folder/feed scoping and saved searches

---

## 10. What Is Missing or Weak

### 10.1 Critical Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| **No dark mode** | High | Only `color-scheme: light`. No dark theme toggle or `prefers-color-scheme` media query |
| **No favicon/feed counts in sidebar** | Medium | Sidebar shows plain text labels only -- no unread counts, no feed favicon/icons |
| **No folder tree in sidebar** | Medium | All feeds are flat nav items -- no collapsible folder hierarchy |
| **No feed list in sidebar** | Medium | Sidebar only shows page routes, not the user's subscribed feeds |
| **No thumbnail in list/compact views** | Low | Compact shows hero image but list view shows none -- common in RSS readers |
| **No article content preview on hover** | Low | No tooltip/popover showing a snippet before clicking |

### 10.2 Design System Gaps

| Gap | Notes |
|-----|-------|
| **No CSS-in-JS or Tailwind** | 4200-line globals.css is hard to maintain |
| **No component library** | Every button, input, dropdown is hand-rolled CSS |
| **No animation/motion system** | Only basic transitions; no page transitions, no skeleton loaders for main feed |
| **No z-index scale** | z-indexes are ad-hoc (10, 15, 20, 24, 100, 200, 201) |
| **No responsive grid for cards** | Cards are single-column only; no multi-column masonry/grid at wide viewports |
| **No density toggle** | Layout toggle exists (card/list/compact) but no text-size/density slider |

### 10.3 Reader Experience Gaps

| Gap | Notes |
|-----|-------|
| **Reader hidden on mobile** | `.reader-column { display: none }` at < 768px -- no reading experience on phones |
| **No reading progress indicator** | No scroll progress bar in reader panel |
| **No text customization** | No font-size, line-height, or width controls for reader mode |
| **No "mark as read on close"** | Closing reader doesn't auto-mark-read |
| **No swipe gestures** | No touch swipe to mark read or navigate between articles |

### 10.4 Feed Management Gaps

| Gap | Notes |
|-----|-------|
| **No drag-and-drop reorder** | Feeds/folders cannot be reordered |
| **No bulk feed operations** | No multi-select for feeds |
| **No feed health indicators in sidebar** | Error state only shown in sources table |
| **No "smart feeds"** | No auto-generated feeds (unread, starred, trending) in sidebar |

---

## 11. Component Inventory

| Component | File | Purpose |
|-----------|------|---------|
| `AppNav` | `src/components/nav.tsx` | Sidebar + topbar + bottom bar |
| `StoryCard` | `src/components/story-card.tsx` | Feed item (card/list/compact/headline modes) |
| `ReaderPanel` | `src/components/reader-panel.tsx` | Split/focus article reader |
| `SearchBar` | `src/components/search-bar.tsx` | Global search with scoping |
| `LayoutToggle` | `src/components/layout-toggle.tsx` | Card/list/compact switch |
| `OnboardingWizard` | `src/components/onboarding-wizard.tsx` | First-run setup flow |
| `ShortcutsHelp` | `src/components/shortcuts-help.tsx` | Keyboard shortcuts dialog |
| `SponsoredCard` | `src/components/sponsored-card.tsx` | Promoted content card |
| `ShareMenu` | `src/components/share-menu.tsx` | Share/export menu |
| `AnnotationToolbar` | `src/components/annotation-toolbar.tsx` | Text highlight tool |
| `ProtectedRoute` | `src/components/protected-route.tsx` | Auth gate wrapper |
| `AuthProvider` | `src/components/auth-provider.tsx` | Auth context |
| `PrivacyConsentManager` | `src/components/privacy-consent-manager.tsx` | Cookie/privacy consent |
| `NotificationToggle` | (in settings) | Push notification toggle |

---

## 12. Summary

The frontend has a strong brutalist design identity and substantial feature depth (keyboard shortcuts, progressive display, ranking explainability, inline tuning). However, it is built entirely with plain CSS in a single globals file with no component library, no dark mode, and missing core RSS reader UX patterns (sidebar feed tree, unread counts, mobile reader, reading customization). The architecture is ripe for a UI refresh that preserves the design language while adding the structural improvements needed for a polished RSS reader experience.
