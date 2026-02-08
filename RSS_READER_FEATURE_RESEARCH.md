# RSS Reader Feature Research

Competitive analysis of five RSS reader applications, organized by feature category.
Features marked with **[UNIQUE]** are distinctive to that app or rarely found in other readers.

---

## 1. Miniflux

**Philosophy:** Minimalist, self-hosted, opinionated, Go-based single binary.

### Feed Support & Parsing
- RSS 1.0/2.0, Atom 0.3/1.0, JSON Feed 1.0/1.1
- OPML import/export (file and URL)
- Multiple attachment types: podcasts, videos, music, images
- **[UNIQUE]** Embedded YouTube video playback (using youtube-nocookie.com for privacy)
- **[UNIQUE]** Invidious alternative player support for YouTube
- **[UNIQUE]** YouTube video duration scraping (via scraping or YouTube API)
- Favicon fetching for feeds

### Content Extraction & Scraping
- Built-in Readability parser (local, no external service)
- **[UNIQUE]** Custom CSS-selector-based scraper rules per feed
- **[UNIQUE]** Custom content rewriting rules (add_dynamic_image, add_image_title, add_youtube_video, nl2br, convert_text_links, remove_tables, remove_clickbait, and more)
- **[UNIQUE]** URL rewrite rules with regex capture groups for fetching alternate article versions
- FeedBurner original link retrieval
- Self-signed certificate support

### Filtering & Rules
- **[UNIQUE]** Regex-based block/keep filtering rules per feed or globally (EntryTitle, EntryURL, EntryContent, EntryAuthor, EntryTag fields)
- **[UNIQUE]** Rule priority ordering (processor stops on first match)
- **[UNIQUE]** Date-based filtering: `future`, `before:`, `after:`, `between:`, `max-age:` duration syntax
- Regex filtering for article inclusion/exclusion

### Privacy & Security
- **[UNIQUE]** Pixel tracker removal from articles
- **[UNIQUE]** Tracking parameter stripping (utm_*, fbclid, etc.)
- **[UNIQUE]** Media proxy to prevent tracking via images/media
- HTTP referrer policy enforcement
- External JavaScript blocking
- Secure external link attributes (rel="noopener noreferrer")
- Content Security Policy enforcement
- **[UNIQUE]** Optional HTTP/2 disabling for fingerprint mitigation
- Custom user agent and cookie support per feed
- Proxy support per feed

### Search
- Full-text search powered by PostgreSQL

### User Interface
- Responsive, minimalist design
- Six themes: Light/Dark x Sans-Serif/Serif, plus System variants
- **[UNIQUE]** Custom CSS and JavaScript injection for full UI customization
- Keyboard shortcuts for all major actions
- Touch gesture navigation on mobile
- PWA: installable to home screen

### Integrations (25+)
- **Services:** Apprise, Betula, Cubox, Discord, Espial, Instapaper, LinkAce, Linkding, LinkTaco, LinkWarden, Matrix, Notion, Ntfy, Nunux Keeper, Pinboard, Pushover, RainDrop, Readeck, Readwise Reader, RssBridge, Shaarli, Shiori, Slack, Telegram, Wallabag
- **[UNIQUE]** Webhook support with HMAC-SHA256 signed payloads (X-Miniflux-Signature)
- Bookmarklet for quick subscription
- Fever API and Google Reader API compatibility
- REST API with official Go and Python client libraries

### Authentication
- Local username/password
- **[UNIQUE]** WebAuthn/passkey support
- Google OAuth2
- Generic OpenID Connect
- Reverse-proxy authentication header

### Deployment
- Single static Go binary
- PostgreSQL required
- Docker support (including ARM)
- Debian/RPM packages
- Automatic HTTPS via Let's Encrypt
- Custom SSL certificate support
- Systemd sd_notify protocol

### Localization
- 20+ languages

---

## 2. Reeder

**Philosophy:** Premium native Apple-platform app. Unified content timeline, not just RSS.

### Content Sources
- RSS/Atom feeds
- **[UNIQUE]** Videos (YouTube, etc.) displayed inline in timeline
- **[UNIQUE]** Podcasts integrated into timeline
- **[UNIQUE]** Social media posts in the same unified timeline
- Link saving via share extension from any app

### Reading Experience
- **[UNIQUE]** Bionic Reading mode (bolds first few letters of each word to guide eye fixation for faster reading)
- **[UNIQUE]** No unread counts by design -- continuous timeline browsing philosophy
- **[UNIQUE]** Timeline position synced across devices (pick up exactly where you left off)
- Deep linking to open content in other apps

### Organization & Filtering
- Custom filters based on keywords, media types, or feed types
- Tag-based organization system (Links, Favorites, Bookmarks, Later)
- **[UNIQUE]** Any tag can be turned into a public JSON feed (auto-updates when you add content)
- Smart views with configurable scope (feeds, folders, searches, tags)

### Gestures & Navigation
- **[UNIQUE]** Configurable swipe gestures (Toggle read, Toggle starred, Add to Instapaper, Share, Action sheet)
- Pull-to-refresh
- Native Apple platform feel with platform-specific interactions
- **[UNIQUE]** Liquid Glass UI option on macOS 26 (with toggle to switch to classic UI)

### Sync & Platform
- **[UNIQUE]** iCloud-only sync (no third-party service dependency) -- near-instant push sync
- iOS 17+ and macOS 14+ support
- No web version

### Reeder Classic (separate app, still maintained)
- Supports third-party sync backends: Feedly, Inoreader, Feedbin, Fever API, Google Reader API
- Built-in read-later service with iCloud sync
- More traditional RSS reader approach

### Privacy
- No data collection beyond Apple's optional analytics
- All data stored in user's iCloud account

---

## 3. Feedbin

**Philosophy:** Clean, paid, hosted RSS reader. Opinionated about chronological order and privacy.

### Content Sources
- RSS/Atom feeds
- **[UNIQUE]** Email newsletters via unique @feedb.in email address per account
- **[UNIQUE]** Custom newsletter email addresses (bring your own domain)
- **[UNIQUE]** Newsletter address management tab for easy subscription while browsing
- YouTube channels and playlists
- **[UNIQUE]** Mastodon feed support
- **[UNIQUE]** Twitter lists and threads with automatic thread unrolling

### Content Extraction
- Full-text extraction for partial-content feeds
- **[UNIQUE]** Updated article diff tracking (shows what changed between original and updated versions)

### Actions & Rules Engine
- **[UNIQUE]** Actions: automatically star, mark as read, or send push notifications based on custom trigger conditions
- Workflow-style rules for incoming article processing
- Keyword-based auto-mark-as-read rules

### Search
- **[UNIQUE]** Expressive search syntax with saved searches (persistent one-click access)

### Reading Experience
- Hand-picked Hoefler & Co. typography
- Light and dark themes
- Fullscreen immersive reading mode
- Strictly chronological order (no algorithmic sorting)

### Podcast Support
- **[UNIQUE]** Built-in podcast listening with playback position memory
- **[UNIQUE]** Companion app "Airshow" for dedicated podcast experience
- Playlists, speed controls, sleep timers, download manager

### Sharing & Integrations
- Configurable sharing to popular services
- Read-it-later service integration (Instapaper, etc.)
- Push notifications across all browsers (standard Push API)
- Cross-platform sync with third-party apps: Reeder, NetNewsWire, Unread, ReadKit
- Full API for developers

### Platform
- Web interface (responsive)
- iOS app
- Works through many third-party native clients
- Paid subscription model ($5/month)

### Privacy
- Private by default
- No tracking, no algorithms

---

## 4. The Old Reader

**Philosophy:** Social RSS reader. Recreates the community experience of Google Reader's social features.

### Social Features
- **[UNIQUE]** Follow friends to see what they are reading
- **[UNIQUE]** "Following" folder displaying friends' shared articles
- **[UNIQUE]** Comment on any post shared by friends
- **[UNIQUE]** "Like" button that places posts in a "Liked" folder
- **[UNIQUE]** "Shared" folder for your own shared posts
- **[UNIQUE]** Find Friends page (discover users via Facebook or Google contacts, or search by name)
- **[UNIQUE]** Per-user feed filtering for shared content (see only what specific friends share)
- **[UNIQUE]** Content discovery through your social network's reading activity

### Feed Management
- Add subscriptions with automatic RSS detection from URLs
- OPML import for migrating from other services
- Drag-and-drop feed and folder reordering
- Folder creation with automatic empty folder cleanup
- Double-click to rename feeds and folders
- Default "Subscriptions" folder

### Reading & Navigation
- Google Reader-inspired clean layout (left sidebar, right content pane)
- List view (collapsed titles for quick scanning)
- Expanded view
- Navigation menu for next/previous post
- Keyboard shortcuts (accessible via `?` or `h`)

### Organization
- Folder-based organization
- Star/favorite articles
- Read/unread tracking

### Browser Integration
- Bookmarklet for subscribing from any page
- RSS feed handler configuration
- Firefox RSS handler integration
- Browser extension notifier (Firefox) for unread count badges and desktop notifications

### API
- Google Reader-compatible API
- Comment/edit endpoints

### Platform
- Web-based only
- Free tier with limits; premium tier available

---

## 5. FreshRSS

**Philosophy:** Self-hosted, extensible, PHP-based. Maximum customization through extensions.

### Feed Support
- RSS and Atom aggregation
- OPML import/export
- **[UNIQUE]** WebSub (PubSubHubbub) support for real-time instant updates from compatible publishers
- Handles 1M+ articles and 50k+ feeds efficiently

### Web Scraping
- **[UNIQUE]** Built-in HTML + XPath scraping engine to generate feeds from websites without RSS
- **[UNIQUE]** JSON document scraping support
- CSS selector-based full-content extraction for truncated feeds
- Can create feeds from any web page using XPath selectors

### Extensions System
- **[UNIQUE]** Full extension framework with 40+ community extensions, including:
  - **AI/LLM:** Feed Digest (OpenAI-compatible article summarization), ArticleSummary, Kagi Summarizer
  - **Content:** YouTube inline video, Invidious video, PeerTube, Comics In Feed, Reddit Image, Explosm
  - **Reading:** Reading Time estimation, LaTeX rendering, Word Highlighter, Clickable Links, Colorful List
  - **Sharing:** Pocket Button, Star To Pocket, Readeck Button, Wallabag Button, Share To Linkwarden, Copy 2 Clipboard
  - **Management:** AutoTTL (auto-adjusts feed refresh interval based on post frequency), Rate Limiter, FilterTitle, Black List, RemoveEmojis, Mark Previous as Read
  - **UI:** Fixed Nav Menu, Mobile Scroll Menu, Touch Control, Keep Folder State, FreshVibes (iGoogle-style dashboard), ThemeModeSynchronizer
  - **Utility:** RSS-Bridge integration, FlareSolverr (Cloudflare bypass), Custom CSS, Custom JS, TranslateTitlesCN, Feed Title Builder, Image Cache
  - **Platform:** Twitch Channel to RSS, YouTube Channel to RSS, SendToMyJD2

### Organization
- Custom tags/labels
- Category/folder organization
- Bookmarks/favorites
- **[UNIQUE]** User queries (saved filtered views)
- **[UNIQUE]** Share selections as HTML, RSS, or OPML formats

### Search & Filtering
- Search with saved query support
- Feed-based filtering

### Statistics
- **[UNIQUE]** Publishing frequency statistics for followed websites
- Usage analytics and reporting dashboard

### API Compatibility
- **[UNIQUE]** Dual API support: Google Reader API (recommended) and Fever API
- Command-Line Interface for automation

### Authentication
- Web form login (username/password)
- **[UNIQUE]** Anonymous reading mode (no login required)
- HTTP Authentication (proxy delegation)
- OpenID Connect

### Multi-User
- **[UNIQUE]** Full multi-user support with independent configurations per user
- Admin and user roles

### Themes & Customization
- Multiple built-in themes (light and dark)
- Custom CSS support
- 20+ language translations
- Responsive/mobile-friendly design
- Keyboard shortcuts

### Deployment
- PHP-based (Apache/Nginx)
- Database support: PostgreSQL, MySQL/MariaDB, SQLite
- Docker support
- AGPL-3.0 open source license

---

## Cross-App Feature Comparison Matrix

| Feature | Miniflux | Reeder | Feedbin | The Old Reader | FreshRSS |
|---|---|---|---|---|---|
| Self-hosted | Yes | No | No* | No | Yes |
| OPML import/export | Yes | No | Yes | Import only export via workaround | Yes |
| Full-text extraction | Yes | No | Yes | No | Yes (XPath) |
| Keyboard shortcuts | Yes | N/A (native) | Yes | Yes | Yes |
| Mobile app | PWA | Native iOS | iOS + 3rd-party | No | Via API clients |
| API | REST + Fever + GReader | None (iCloud) | REST | GReader-compatible | GReader + Fever |
| Podcast support | Attachments | Timeline | Built-in player | No | Via extensions |
| Newsletter (email) | No | No | Yes | No | No |
| Social/following | No | Public tag feeds | No | Yes (core feature) | No |
| Rules/actions | Regex block/keep | Keyword filters | Star/read/notify | No | Via extensions |
| Web scraping | CSS selector | No | No | No | XPath + JSON |
| Extensions/plugins | No (webhooks) | No | No | No | Yes (40+) |
| Multi-user | No | No | N/A (hosted) | N/A (hosted) | Yes |
| Article diff tracking | No | No | Yes | No | No |
| Bionic reading | No | Yes | No | No | No |
| Privacy hardening | Extensive | Apple-level | Standard | Standard | Standard |
| Themes | 6 + custom CSS | System/Liquid Glass | Light/Dark | Standard | Multiple + custom |
| Price | Free (self-host) | Free (Apple only) | $5/month | Free/Premium | Free (self-host) |

*Feedbin is open source and can technically be self-hosted, but is primarily offered as a paid hosted service.

---

## Standout Differentiators Summary

### Miniflux
Best-in-class **privacy hardening** (tracker removal, param stripping, media proxy, HTTP/2 toggle). Most powerful **per-feed content manipulation** (rewrite rules, URL rewrite with regex, CSS scraper rules). Uniquely supports **WebAuthn/passkeys**. Lightest deployment footprint (single Go binary).

### Reeder
Only app with **Bionic Reading**. Unique **unified content timeline** mixing RSS, video, podcasts, and social posts. The **"no unread count" philosophy** is a deliberate design differentiator. **Public tag feeds** turn personal curation into publishable JSON feeds. iCloud-native sync with near-instant position syncing.

### Feedbin
Only reader with **email-to-RSS newsletter support** including custom domains. Unique **article diff tracking** shows exactly what publishers changed. Most polished **actions/rules engine** with push notification triggers. **Mastodon feed** and **Twitter thread unrolling** support. Companion **Airshow podcast app**.

### The Old Reader
Only reader built around **social reading** as a core concept. Unique **friend following, sharing, and commenting** system. Content discovery through your network's reading activity. Closest spiritual successor to Google Reader's social features.

### FreshRSS
Most **extensible** reader with 40+ community extensions including AI summarization. Most powerful **web scraping** (XPath + JSON, not just CSS selectors). **WebSub** for real-time push updates. Only reader with true **multi-user** support. **AutoTTL** extension intelligently adjusts polling frequency. **FlareSolverr** integration bypasses Cloudflare protection.
