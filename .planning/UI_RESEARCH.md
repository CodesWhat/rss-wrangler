# RSS Reader UI/UX Pattern Research

> Research date: 2026-02-16
> Apps surveyed: Feedly, Reeder (Classic + New), Inoreader, NetNewsWire, Miniflux, Readwise Reader

---

## 1. Layout Modes (View Switching)

### Industry Standard View Modes

Every major RSS reader offers multiple layout modes. The table below maps what each app provides:

| View Mode | Feedly | Inoreader | Reeder Classic | NetNewsWire | Miniflux | Readwise Reader |
|-----------|--------|-----------|----------------|-------------|----------|-----------------|
| Title-only / Compact list | Yes | Yes (List) | -- | -- | Yes (default) | -- |
| Magazine (title + excerpt + thumb) | Yes (default) | Yes | -- | -- | -- | -- |
| Card grid (multi-column cards) | Yes | Yes | -- | -- | -- | Yes (mobile Feed) |
| Expanded / Full articles | Yes | Yes (Expanded) | -- | -- | -- | -- |
| Column (Tweetdeck-style) | -- | Yes | -- | -- | -- | -- |
| Timeline (scroll-position-based) | -- | -- | Yes (new Reeder) | -- | -- | -- |

**Key patterns:**
- **Title-only**: Rows of title + source + date. No images. Max scan speed. Looks like an email inbox.
- **Magazine**: Hero cards for top 2-3 items, then list with small thumbnails on the right (Feedly) or left. Good balance of scan speed and visual appeal.
- **Card grid**: 2-3 column grid of equal-sized cards with large thumbnails. Best for visual/photography feeds.
- **Expanded**: Full article content inline, blog-style scrolling. No click needed.
- **Column**: Multiple feeds side-by-side in vertical columns (Tweetdeck-style).

**Best practice**: Feedly remembers which layout mode each folder/feed uses separately. Users configure visual-heavy feeds (design, photography) as Cards and news feeds as Title-only.

### Density Settings

Feedly offers two density levels applicable across all view modes:
- **Compact**: Tighter line height, smaller thumbnails, more items visible per screen
- **Comfortable**: More whitespace, larger thumbnails, easier reading

**Recommendation for RSS Wrangler**: Support at minimum 3 view modes (List, Magazine, Cards) plus a density toggle (Compact/Comfortable). Per-feed/folder view persistence is a power-user differentiator.

---

## 2. Article Card Anatomy

### Common Card Elements

Across all readers, article cards contain these elements (ordered by frequency):

1. **Title** (always present, bold, 1-2 lines)
2. **Source/feed name** (usually with favicon)
3. **Published date/time** (relative: "2h ago" or absolute)
4. **Excerpt/snippet** (1-3 lines of body text, optional in compact modes)
5. **Thumbnail image** (optional, position varies by layout)
6. **Unread indicator** (dot, bold weight, or color)
7. **Star/bookmark icon** (save for later)
8. **Read time estimate** (Inoreader, Readwise Reader)
9. **Topic/tag labels** (Inoreader, Feedly via AI)
10. **AI summary badge** (Feedly AI, Inoreader Intelligence)

### Thumbnail Positioning Patterns

| Position | Used By | Best For |
|----------|---------|----------|
| Right-aligned, small (40-60px) | Feedly Magazine | News/text-heavy feeds |
| Left-aligned, medium (80-120px) | Inoreader List | Balanced visual/text |
| Top, full-width | Feedly Cards, Inoreader Cards | Photography, visual feeds |
| None (text only) | Feedly Title-only, Miniflux | Maximum scan speed |

### Card Variants by View Mode

**List/Title-only card:**
```
[Unread dot] Title text (bold if unread)              [2h ago]
             Source Name via favicon
```

**Magazine card:**
```
[Unread dot] Title text (bold if unread)           [Thumbnail]
             Source Name  |  2h ago                [  60x60  ]
             First line of excerpt text...
```

**Grid/Card view card:**
```
+----------------------------------+
|        [Full-width image]        |
|         (16:9 or 4:3)           |
+----------------------------------+
| Title text (2 lines max)         |
| Source Name  |  2h ago           |
| Excerpt text (2 lines max)...   |
+----------------------------------+
```

**Recommendation for RSS Wrangler**: Support configurable thumbnail position (none / small-right / large-top) tied to the view mode. Magazine = small-right. Cards = large-top. List = none.

---

## 3. Reading Pane Behavior

### Reading Pane Patterns Across Apps

| Pattern | Apps | Description |
|---------|------|-------------|
| Three-column split | Reeder Classic, NetNewsWire, Inoreader | Sidebar + list + article side-by-side. Article loads in right pane on click. |
| Two-column split | Readwise Reader (web) | List on left, article on right. Collapsible panels with `[` and `]`. |
| Overlay / slide-over | Feedly, Reeder (new), Readwise (mobile) | Article opens as a modal or slides in over the list. |
| Full-page takeover | Miniflux, most mobile views | Article replaces the list entirely. Back button to return. |
| Inline expansion | Feedly (Expanded view), Inoreader (Expanded) | Article content expands in-place within the list. No separate pane. |

### Reading Pane Features

**Split-pane (3-column) details (NetNewsWire, Reeder Classic):**
- Left column: Feed/folder tree (collapsible, ~200-250px)
- Middle column: Article list for selected feed (~300-350px)
- Right column: Article content (fills remaining space)
- Column dividers are draggable (Reeder)
- On smaller screens, columns collapse: iPad shows 2 columns, iPhone shows 1

**Readwise Reader split-pane:**
- Left panel: Sidebar with filtered views (collapsible with `[`)
- Right panel: Document list or reading pane (collapsible with `]`)
- Keyboard shortcut `\` toggles the split mode
- Side panels remember collapsed state across sessions

**Reader mode (article reformatting):**
- Reeder (new): "Reader View" button strips page formatting, shows clean text
- Readwise Reader: Full typography customization (font face, size 14-80px, line spacing, line width)
- Inoreader: Estimated reading time shown in article view
- NetNewsWire: Built-in reader view with clean formatting

**Recommendation for RSS Wrangler**: Default to 3-column on desktop (>1200px), 2-column on tablet (768-1200px), stacked on mobile (<768px). Offer a reader mode toggle that strips to clean typography. Make panels collapsible with keyboard shortcuts.

---

## 4. Sidebar / Navigation Structure

### Sidebar Patterns

**Feedly sidebar:**
- Today (smart feed — aggregated unread)
- Read Later / Saved
- Folders (user-created groupings of feeds)
  - Individual feeds within folders (with favicon + unread count)
- Boards (curated topic collections)
- Explore / Discover
- Settings link at bottom
- Theme picker at bottom

**Reeder Classic sidebar:**
- Sections grouped by sync service (iCloud, Feedbin, etc.)
- Within each: All Items, Archive, Folders, Individual feeds
- "Saved" section: Links, Later, Bookmarks, Favorites, Custom tags
- Every section collapsible
- Favicons beside feed names

**Inoreader sidebar:**
- Dashboard
- All Articles
- Starred
- Tags (user-defined)
- Feeds (tree with folders)
- Automations (rules)
- Search
- Resizable sidebar width

**NetNewsWire sidebar:**
- Smart Feeds: Today, All Unread, Starred
- On My Mac / iCloud folders
- Individual feeds (with favicons and unread counts)
- Simple, flat hierarchy

**Miniflux sidebar:**
- Categories (flat list, user-defined)
- Unread, Starred, History
- No tree nesting beyond categories

**Readwise Reader sidebar:**
- Home (configurable dashboard)
- Library: Inbox, Later, Archive
- Feed: Unseen, Seen
- Filtered Views (custom query-based, user-created)
- Tags
- Manage Feeds

### Common Sidebar Elements

1. **Smart/virtual feeds**: "All Unread", "Today", "Starred" (present in every app)
2. **Folder/category tree**: Hierarchical grouping of feeds
3. **Unread count badges**: Number beside each feed/folder
4. **Favicons**: Visual identification of feeds
5. **Collapsibility**: Sections and the entire sidebar can collapse
6. **Search**: Quick-access search in sidebar or top bar

**Recommendation for RSS Wrangler**: Sidebar should include: smart feeds (All/Unread/Today/Starred), folder tree with favicons and unread counts, saved/bookmarks section, and collapsible design. Keep it flat-ish (max 2 levels: folder > feed).

---

## 5. Responsive Design

### Breakpoint Patterns

| Breakpoint | Layout | Apps |
|------------|--------|------|
| Desktop (>1200px) | 3-column: sidebar + list + article | NetNewsWire, Reeder Classic, Inoreader |
| Tablet (768-1200px) | 2-column: list + article (sidebar hidden or overlay) | All apps on iPad |
| Mobile (<768px) | Single column: stacked navigation | All apps on phone |

### Responsive Behavior Details

**Desktop (3-column):**
- All panels visible simultaneously
- Column widths adjustable by dragging dividers (Reeder, Inoreader)
- Sidebar typically 200-280px, list 300-400px, article fills rest

**Tablet (2-column):**
- Sidebar becomes a slide-out overlay or hamburger menu
- List and article shown side-by-side
- Reeder on iPad: three-column layout available but sidebar collapsible
- Readwise Reader: horizontal pagination (2-column reading) in landscape

**Mobile (single column):**
- Stack: Feed list > tap > Article (full screen)
- Swipe gestures: left/right to mark read, star, save (Reeder, Readwise)
- Pull to refresh
- Readwise Reader mobile: special card-based Feed UI with swipe-to-mark-seen
- Bottom tab bar for primary navigation (common iOS pattern)

**Recommendation for RSS Wrangler**: Three breakpoints (mobile/tablet/desktop). Desktop = 3-column with draggable dividers. Tablet = 2-column with collapsible sidebar. Mobile = stacked with swipe gestures and bottom tab bar.

---

## 6. User Configurability

### What Users Can Customize (by app)

| Setting | Feedly | Inoreader | Reeder | NetNewsWire | Miniflux | Readwise |
|---------|--------|-----------|--------|-------------|----------|----------|
| View mode per feed/folder | Yes | Yes | -- | -- | -- | Yes (filtered views) |
| Density (compact/comfortable) | Yes | -- | -- | -- | -- | -- |
| Font family | Yes | -- | Yes | -- | -- | Yes (serif/sans/dyslexic) |
| Font size | Yes | -- | Yes | -- | -- | Yes (14-80px) |
| Line spacing | -- | -- | Yes | -- | -- | Yes |
| Content width / line width | -- | -- | Yes (max width) | -- | -- | Yes |
| Theme (light/dark/auto) | Yes | Yes (3 themes) | Yes | Yes | Yes (auto) | Yes (light/dark/auto) |
| Custom CSS | -- | Yes | -- | -- | Yes | -- |
| Image display (on/off/size) | -- | -- | -- | -- | -- | -- |
| Mark-as-read behavior | Yes | Yes | Scroll-based | -- | Yes | Scroll-based (Feed) |
| Swipe actions | -- | -- | Yes | -- | -- | Yes |
| Sidebar order/visibility | -- | Yes (resizable) | Yes (collapsible) | -- | -- | Yes (configurable Home) |
| Keyboard shortcuts | Yes | Yes | Yes | Yes | Yes | Yes (extensive) |

### Most Valued Customization Options (industry consensus)

1. **Theme (light/dark/system)**: Table stakes. Every app supports this.
2. **View mode switching**: Users want different views for different content types.
3. **Font size**: Accessibility requirement. Range of at least 14-24px.
4. **Keyboard shortcuts**: Power users expect full keyboard navigation.
5. **Mark-as-read behavior**: On scroll vs on click vs manual — highly personal.
6. **Swipe gestures (mobile)**: Configurable left/right swipe actions.

**Recommendation for RSS Wrangler**: Prioritize theme (light/dark/system), view mode per feed, font size, density toggle, and keyboard shortcuts. These cover 90% of user expectations. Custom CSS is a power-user escape hatch worth considering later.

---

## 7. Theming

### Theme Approaches

| App | Themes | Custom Colors | Custom CSS | System Auto |
|-----|--------|---------------|------------|-------------|
| Feedly | Light + 8 accent colors | Yes (accent) | No | Yes |
| Inoreader | 3 built-in themes | No | Yes (paid) | Yes |
| Reeder | Light / Dark | No | No | Yes |
| NetNewsWire | Light / Dark | No | No | Yes (macOS) |
| Miniflux | Light / Dark / System Auto | No | Yes | Yes |
| Readwise Reader | Light / Dark / Auto | No | No | Yes |

### Theme Implementation Patterns

**Minimum viable theming:**
- Light mode (white/light gray backgrounds, dark text)
- Dark mode (dark gray/near-black backgrounds, light text)
- System auto-detect (`prefers-color-scheme`)
- Single accent/brand color for interactive elements

**Enhanced theming (Feedly model):**
- Multiple accent colors to choose from (green, blue, purple, red, etc.)
- Accent color applied to: active states, unread indicators, selected items, buttons

**Power-user theming (Inoreader/Miniflux):**
- Custom CSS injection for complete visual control
- Useful for accessibility needs or brand alignment

**Recommendation for RSS Wrangler**: Ship with light/dark/system-auto and one configurable accent color. This covers the vast majority of users. Custom CSS can come later as a Pro feature.

---

## 8. Cross-Cutting Patterns & Insights

### What the Best Readers Get Right

1. **Content is king**: Maximum screen real estate for articles. Chrome/UI should shrink out of the way. Miniflux's philosophy: "The content is the most important thing. Everything else is just noise."

2. **Progressive disclosure**: Simple defaults with depth available. NetNewsWire is simple with few settings, Feedly hides advanced features behind menus.

3. **Keyboard-first (desktop)**: Readwise Reader's keyboard-based reading experience (navigate with arrows, highlight with H, tag with T) sets the gold standard. Every major reader supports j/k or arrow navigation.

4. **Triage workflow**: Readwise Reader's Inbox > Later > Archive flow, combined with Feed's Unseen > Seen, provides the most sophisticated triage model. Feedly and Inoreader use simpler Unread > Read.

5. **Scroll-position tracking**: New Reeder eliminates read/unread entirely in favor of remembering scroll position per feed — feels like social media, reduces "inbox anxiety."

6. **Per-feed customization**: Feedly's ability to remember layout mode per folder is highly valued. Visual feeds get Cards, news gets Title-only.

7. **Reader mode**: Stripping external page formatting for clean in-app reading is increasingly standard. Readwise Reader's typography controls (font, size, spacing, width) are the most comprehensive.

### What to Avoid

1. **Overwhelming settings**: NetNewsWire succeeds by being opinionated with few knobs. Don't ship 50 settings on day one.
2. **Unread count anxiety**: New Reeder removes unread counts entirely. Consider making them optional or using gentler "new items" indicators.
3. **Rigid layouts**: Not offering view mode switching is a gap. Users have different content types with different ideal presentations.
4. **Desktop-only keyboard shortcuts**: Readwise Reader and Reeder show that mobile gesture customization (swipe actions) is the equivalent of keyboard shortcuts on touch.

---

## 9. Recommended Feature Priority for RSS Wrangler

### Phase 1 (Must Have)
- 3 view modes: List, Magazine, Cards
- 3-column responsive layout (sidebar / list / article)
- Light/dark/system theme
- Keyboard navigation (j/k, arrows, enter, escape)
- Sidebar with: smart feeds, folder tree, favicons, unread badges
- Collapsible sidebar and panels
- Reader mode with clean typography

### Phase 2 (Should Have)
- Density toggle (compact / comfortable)
- Per-feed view mode persistence
- Font size control (min 14px to 24px)
- Configurable swipe gestures (mobile)
- Accent color picker
- Read time estimate on articles

### Phase 3 (Nice to Have)
- Column view (Tweetdeck-style multi-feed)
- Custom CSS (Pro feature)
- Scroll-position-based read tracking
- Horizontal pagination for tablet landscape
- AI-generated topic labels on cards
- Custom filtered views (Readwise-style query-based)

---

## Sources

- [Feedly Documentation — Changing Views](https://docs.feedly.com/article/276-how-do-i-change-the-views-of-my-feeds-and-source)
- [Feedly Blog — Compact Magazine View](https://blog.feedly.com/experiment-08-new-compact-magazine-view-option/)
- [MacStories — Reeder 5 Review](https://www.macstories.net/reviews/reeder-5-review-read-later-tagging-icloud-sync-and-design-refinements/)
- [MacStories — Reeder: A New Approach](https://www.macstories.net/reviews/reeder-a-new-approach-to-following-feeds/)
- [Spectre Collie — I Was Wrong About the New Reeder](https://spectrecollie.com/2025/03/07/i-was-wrong-about-the-new-reeder/)
- [Inoreader Blog — New Experience 2024](https://www.inoreader.com/blog/2024/10/the-new-inoreader-experience-is-here.html)
- [NetNewsWire Official Site](https://netnewswire.com/)
- [Miniflux — Minimalist Feed Reader](https://miniflux.app/)
- [Noted.lol — Miniflux Review](https://noted.lol/miniflux/)
- [Readwise Reader Docs — Appearance](https://docs.readwise.io/reader/docs/faqs/appearance)
- [Readwise Reader Docs — Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views)
- [The Sweet Setup — Readwise Reader Review](https://thesweetsetup.com/readwise-reader-a-very-good-modern-rss-app/)
- [FeedViewer — RSS Reader UI Design Principles](https://www.feedviewer.app/answers/rss-reader-user-interface-design-principles)
- [Material Design 3 — Canonical Feed Layout](https://m3.material.io/foundations/layout/canonical-layouts/feed)
