# NewsBlur Competitive Analysis: Comprehensive Feature Inventory

> **Source**: newsblur.com | github.com/samuelclay/NewsBlur
> **Last updated**: 2026-02-07
> **License**: MIT (fully open source)
> **Creator**: Samuel Clay

---

## 1. Feed Management

### Subscription Limits (by tier)
- **Free**: 64 feeds
- **Premium** ($36/year): 1,024 feeds
- **Premium Archive** ($99/year): 4,096 feeds
- **Premium Pro** ($299/year): 10,000 feeds

### Folder Organization
- Hierarchical folder structure with unlimited nesting (folders inside folders)
- Drag-and-drop reordering of feeds and folders
- Move feeds between folders
- Rename feeds and folders
- Delete folders (with option to unsubscribe from all feeds inside)
- Collapsible folder tree in sidebar
- Per-folder reading settings (view mode, sort order, auto mark-as-read)
- Custom icons for folders and feeds (emoji, 240+ preset icons in 84 colors, or uploaded images) -- added January 2026

### OPML Support
- OPML import via file upload (`/import/opml_upload`)
- OPML export for backup/migration (`/import/opml_export` or `newsblur.com/import/opml_export`)
- Preserves folder hierarchy during import/export

### Feed Discovery & Addition
- Add feeds by URL or website address (auto-discovers RSS/Atom feeds)
- Feed directory with autocomplete search
- "Discover Sites" feature: infinite scroll of related sites based on sentence transformer embeddings (not collaborative filtering)
- Trending sites visibility on the dashboard
- "Discover Stories" feature: find topically related stories across your archive (Premium Archive)

### Feed Statistics & Info
- Per-feed statistics panel showing update frequency, subscriber count, and history
- Feed fetcher details (last fetch time, update schedule, error status)
- Feed refresh frequency determined dynamically by popularity and update frequency (more popular/active feeds update more often)
- Premium Pro feeds update every 5-15 minutes vs. standard 15-60 minute intervals
- Publisher-facing controls: CSS class detection (`.entry`, `.post`, `.article`, etc.) for story boundary detection
- Opt-out available for publishers who contact the developer

### Feed Fetcher Behavior
- Real-time RSS via PubSubHubbub/WebSub -- stories pushed directly as they publish
- Automatic expansion of truncated RSS feeds to full text
- Story change tracking -- monitors article edits/updates after initial publication
- Authenticated feed support for password-protected feeds

---

## 2. Reading Experience

### Story Views (4 modes)
1. **Feed View**: Default RSS content display, plain rendered HTML from the feed
2. **Text View**: Full-text extraction from the original site (bypasses truncated feeds); sticky per-feed setting
3. **Story View**: Renders each individual blog post from the original site, one at a time
4. **Original View**: Loads the entire original website in an iframe, preserving full design, typeface, and layout

### View Switching Shortcuts
- `Enter` -- open story in Story View
- `Shift+Enter` -- open story in Text View
- Double-click story title to temporarily toggle Story View

### Layout Modes (4 layouts)
1. **Split View**: Two-pane layout with story titles list + full article pane; configurable title position (top, bottom, left)
2. **List View**: Single-pane with story list entries above the article body; one article visible at a time
3. **Full View**: Continuously scrolling full articles (river of news)
4. **Grid View**: Magazine-style layout with large image thumbnails and content previews

### Layout Persistence
- View mode and layout saved per-feed and per-folder independently
- Default layout configurable in global Preferences, with per-feed/folder overrides

### Reading Preferences
- Sort by oldest-first or newest-first
- Filter by unread, all stories, or saved stories
- Dark theme and light theme
- Font selection, size, and density settings
- Auto mark-as-read on scroll (configurable scroll position marker)
- Autoscrolling for hands-free reading
- Landscape orientation support (mobile)
- Per-feed and per-folder auto mark-as-read duration slider (1 day to 365 days, or "never") -- added January 2026
- "River of News" mode for reading across folders chronologically (Premium)

### Full-Text Extraction
- Automatic full-text retrieval from original sites when RSS provides only excerpts
- Text view is "sticky" per-feed -- remembers your preference
- Powered by dedicated Node.js text extraction service

### Story Change Tracking
- Monitors articles for edits after publication
- Visual diff of changes since original publication

### Date Range Filtering
- Filter stories by publication date across feeds, folders, saved stories, and read stories
- Quick duration buttons and manual date inputs for research/catch-up scenarios (added October 2025)

---

## 3. Intelligence / Training System

### Core Concept
Stories are scored into three categories based on user training:
- **Focus (green)**: Stories matching positive training criteria -- surfaced prominently
- **Unread (neutral/grey)**: No training match in either direction
- **Hidden (red)**: Stories matching negative training criteria -- suppressed from view

### Classifier Types (6 dimensions)
1. **Author**: Like or dislike specific authors
2. **Tag**: Like or dislike specific tags/categories attached to stories
3. **Title**: Like or dislike keyword patterns in titles
4. **Text**: Train on any highlighted phrase in full article text (Premium Archive) -- added November 2025
5. **URL**: Train on story permalink URL patterns (e.g., filter `/sponsored/` paths) -- added January 2026
6. **Site/Feed**: Like or dislike entire feed sources

### Training Mechanics
- Click "Train This Story" on any story to access the classifier interface
- For text classifiers: highlight any phrase, click "Train" to mark as liked/disliked
- Training is personal and individual -- no collaborative filtering/"popularity bubble"
- "Green always wins" -- if a story matches both positive and negative classifiers, it appears as Focus

### Regex Mode (Premium Pro)
- Regular expression support for Title, Text, and URL classifiers
- Supports word boundaries (`\bapple\b`), alternation (`iPhone|iPad`), character classes (`[0-9]+`)
- Built-in regex help tool with syntax guidance and real-time validation
- Case-insensitive matching
- Added January 2026

### Global and Folder-Scoped Training (Premium Archive)
- Any classifier can be set to apply globally across all subscriptions
- Classifiers can be scoped to a specific folder
- Eliminates redundant per-feed training for common preferences
- Added February 2026

### Manage Training Tab
- Consolidated view of every classifier ever trained, organized by folder
- Filter by: folder/site dropdown, instant search, likes/dislikes toggle, classifier type
- Bulk editing: modify multiple classifiers across feeds and save in one click
- Search matches against classifier names, feed titles, and folder names
- Added January 2026

### Focus Mode
- Filters the story list to only show Focus (green) stories
- Available as a reading filter alongside "Unread" and "All Stories"
- Works across individual feeds, folders, and river-of-news views

---

## 4. Personalization & Scoring

### Story Score Indicators
- **Green bullet**: Stories you like (matches positive training)
- **Grey bullet**: Unrated/neutral stories
- **Red bullet**: Stories you dislike (matches negative training)

### Score-Based Filtering
- Filter to show: All stories, Unread only, or Focus only
- Hidden (red) stories suppressed by default but accessible via "Show Hidden Stories"
- Each feed/folder can have its own filter level

### Reading Preferences (Manage > Preferences)
- Story ordering (oldest/newest first)
- Default layout mode per feed/folder
- Font family, size, and spacing
- Content density
- Theme (dark/light)
- Mark-as-read behavior (on scroll, on open, manual)
- Show/hide Ask AI button
- Auto mark-as-read duration per feed/folder (1 day to "never")
- Disable social features toggle for distraction-free reading

### Auto Mark-as-Read
- Global default setting
- Per-feed override
- Per-folder override (cascades to child feeds)
- Configurable duration slider: 1 day to 365 days, or "never"

---

## 5. Social Features

### Blurblogs (Public Shared Pages)
- Every user gets a public "blurblog" -- a blog of all shared stories with comments
- Blurblogs have their own RSS feed -- subscribable from any feed reader
- Blurblogs have HTML web pages viewable without a NewsBlur account
- Custom blurblog URL (username-based)

### Privacy Levels (3 tiers)
- **Public** (default): Everyone can see stories and comment
- **Protected**: Everyone can see stories, but only approved followers can reply/comment
- **Private**: Only approved followers can see shares and comment

### Sharing & Commenting
- Share any story to your blurblog with an optional comment
- One-level-deep reply threads on shared stories
- Like/favorite comments from other users
- Unshare stories (remove from blurblog)
- External sharing to Facebook, Twitter/X, Instapaper, Pocket, Evernote, email, and others

### Following System
- Follow other NewsBlur users to subscribe to their blurblogs
- Followers/following lists on user profiles
- Find friends by username, email, or blurblog title
- Mute/unmute specific users (hide their shares without unfollowing)
- Public profile pages showing common followers/followings

### Global Shared Stories
- Discovery feed of publicly shared stories across the NewsBlur community
- Can be disabled entirely in Preferences for distraction-free reading

### Disabling Social Features
- Single toggle in Preferences > Feeds > Sharing to hide all social UI elements
- Removes: Global Shared Stories folder, share buttons, comments, blurblog features
- Fully reversible

---

## 6. Notifications

### Platform Coverage
- **iOS**: Push notifications (since v7.0)
- **Android**: Push notifications (since v6.0)
- **Web**: Browser push notifications
- **Email**: Story delivery via email for high-priority feeds

### Configuration
- Per-feed notification toggle (swipe-right gesture on iOS to enable)
- Two notification levels per feed:
  - **All Unread**: Every new story triggers a notification
  - **Focus Only**: Only stories matching positive training generate notifications
- Accessible via Manage > Notifications on web, or feed settings on mobile

### Filtering Integration
- Notifications respect intelligence training -- train on authors, tags, titles, text to control which stories notify
- "Overprovision and dial back" approach: enable broadly, then tighten Focus filters

### Current Limitations
- Per-feed only (no per-folder bulk notification toggle as of early 2026)
- No standalone keyword alert system separate from intelligence training

---

## 7. Mobile Apps

### iOS / macOS
- **Native app**: Free on App Store (iOS 14.0+, macOS 11.0+)
- Supports iPhone, iPad, and Mac (Apple Silicon)
- Offline support for stories and images with configurable sync settings
- Homescreen widget displaying 3-6 stories
- Share extension (save stories from other apps into NewsBlur)
- Gesture-based navigation for stories and feeds
- Full intelligence training from mobile (train with a tap)
- All 4 view modes (Feed, Text, Story, Original)
- All 4 layout modes (Split, List, Full, Grid)
- Dark mode
- Autoscrolling for hands-free reading
- Push notifications per feed
- Swipe gestures for feed and story actions
- Statistics visualization for subscribed sites
- Landscape orientation support

### Android
- **Native app**: Free on Google Play and F-Droid
- Material Design UI with gesture navigation
- Offline support for stories and images
- Intelligence training from mobile
- All view and layout modes
- Dark mode
- Push notifications per feed
- Mark-as-read on scroll
- Sticky Text/Story view preferences per feed
- Full open-source (available on F-Droid for privacy-focused users)

### Offline Reading
- Configurable offline sync (story count, image downloading)
- Read while offline; re-sync read states and saved stories when reconnected
- Works on both iOS and Android

---

## 8. Power User Features

### Keyboard Shortcuts
- `j` / `k` -- Navigate between stories (next/previous)
- `n` / `p` -- Next/previous story
- `Shift+j` / `Shift+k` -- Navigate between feeds/sites
- `Shift+Up` / `Shift+Down` -- Navigate between feeds/sites (arrow alternative)
- `Enter` -- Open story in Story View
- `Shift+Enter` -- Open story in Text View
- `Left` / `Right` arrows -- Control reading view (customizable)
- `Up` / `Down` arrows -- Navigate stories or scroll (customizable)
- `Space` -- Scroll page (configurable scroll percentage)
- `f` -- Open feed trainer
- `t` -- Open story training
- `s` -- Save/star story
- `Shift+s` -- Share story
- `o` / `v` -- Open in original/background tab
- **Keyboard Shortcuts Manager**: Customize arrow keys and space bar behavior (scroll amount, navigation vs. view switching)

### API
- Full REST API at `newsblur.com/api`
- No API key required; session-based authentication via `newsblur_sessionid` cookie
- OAuth2 support (requires developer approval for client credentials)
- Complete endpoint coverage:
  - Authentication (login, logout, signup)
  - Feed management (add, delete, rename, move, reorder)
  - Story retrieval (by feed, river, read, unread hashes, starred)
  - Story actions (mark read/unread, star/unstar, save with tags)
  - Social features (share, unshare, comment, reply, follow/unfollow, mute)
  - Intelligence/classifier (get training, save training)
  - Search
  - OPML import/export
  - Feed statistics and icons
  - Original text extraction
- Entire API is open source -- implementation viewable in the codebase
- No advertising against retrieved data (commercial use otherwise permitted)

### Bookmarklet
- "Add to NewsBlur" bookmarklet for one-click feed subscription from any page
- "Share on NewsBlur" bookmarklet for sharing any web page to your blurblog
- Available under Manage > Goodies > Bookmarklet

### Browser Extensions (Community)
- **Firefox**: NewsBlur.com-Notifier (unread count badge in toolbar)
- **Chrome**: Newsblur Notifier Plus (unread count), Newsblur Favicon Count, Unofficial NewsBlur Reader, Background Tab extension (open story in background tab via hotkey)
- **Safari**: NewsBlur-Helper (macOS 10.12.6+ / Safari 11+ integration)

### Third-Party App Compatibility
- Reeder
- ReadKit
- Unread
- NetNewsWire
- Any app supporting the NewsBlur sync API

### Integrations
- **IFTTT**: Trigger automations from new stories, saved stories, shared stories
- **Zapier**: Workflow automation
- Custom RSS feeds for saved story tags (pipe into any service)

---

## 9. Content Types

### Standard RSS/Atom Feeds
- Full RSS 2.0 and Atom 1.0 support
- Automatic feed discovery from website URLs
- Real-time updates via PubSubHubbub/WebSub

### Email Newsletters
- Unique forwarding email address per user
- Forward newsletters from your email client to NewsBlur
- Newsletters appear as feeds in your feed list
- Group newsletters into folders
- Train newsletters with intelligence system (prioritize favorites)
- Responsive formatting across all screen sizes
- Setup via Manage > Email Newsletters

### YouTube Channels
- Subscribe to YouTube channels by pasting channel URL
- Embedded video player inline in story view
- Auto-enable YouTube captions preference (added December 2025)
- Video descriptions included in feed content

### Podcasts
- Basic podcast feed support (RSS enclosure tags)
- Inline audio player for podcast episodes
- Player does not persist across folder navigation (known limitation)
- No dedicated playlist or download management (mobile podcast playback is basic)

### Saved Stories & Tagging
- Star/save any story for later
- Auto-tagging from folder membership (story saved from a feed in "Tech" folder gets "tech" tag)
- Custom tags with autocomplete from previously used tags
- Remove individual tags from saved stories
- Each tag gets its own RSS feed (subscribable, IFTTT-compatible)
- Search and filter by tag
- Saved stories accessible via API (`/reader/starred_stories`)

### Saved Searches
- Save frequently used search queries as dedicated virtual feeds
- Saved searches appear in sidebar alongside regular feeds
- Premium feature

---

## 10. AI Features

### Ask AI (Premium Archive)
- Conversational AI for story context and comprehension
- Select any story and click "Ask AI" in the toolbar
- Preset quick questions (summarize, explain background, key takeaways)
- Free-form questions about any story
- Voice input for queries
- Multiple AI model choices
- Conversation history for follow-up questions
- Togglable via Manage > Preferences > Stories
- Added January 2026

### Discovery via Embeddings
- "Discover Stories" uses sentence transformer embeddings (not collaborative filtering)
- Related stories grouped by topic and folder
- "Discover Sites" shows related feeds with infinite scroll
- Available to all users (sites) and Premium Archive (stories)

---

## 11. Search

### Full-Text Search (Premium)
- Search across all subscribed feeds
- Search within individual feeds or folders
- Search saved stories
- Search blurblogs
- Results filterable as you type

### Saved Searches
- Save any search as a virtual feed
- Appears in sidebar for quick access
- Custom RSS feed available for each saved search

---

## 12. Self-Hosting & Open Source

### Codebase
- **Repository**: github.com/samuelclay/NewsBlur
- **License**: MIT
- **Language**: Python 3.7+ (backend), Backbone.js (frontend)
- Fully open source -- every feature available to self-hosters

### Technology Stack
- **Web framework**: Django
- **Relational DB**: PostgreSQL (feeds, subscriptions, accounts)
- **Document store**: MongoDB (stories, read states, feed histories)
- **Cache/queue**: Redis (story assembly, caching)
- **Search**: Elasticsearch (optional)
- **Task processing**: Celery + RabbitMQ (asynchronous feed fetching)
- **Text extraction**: Node.js services (original text, image processing)

### Docker Deployment
- Single-command install: `git clone ... && cd NewsBlur && make`
- Full docker-compose stack with all services
- Self-signed HTTPS by default (localhost)
- `AUTO_PREMIUM=True` by default for self-hosted instances

### Configuration (`newsblur_web/local_settings.py`)
- `NEWSBLUR_URL` -- installation domain
- `SESSION_COOKIE_DOMAIN` -- auth cookie scope
- `AUTO_PREMIUM` -- auto-grant premium features (default True)
- `AUTO_ENABLE_NEW_USERS` -- auto-activate accounts (default True)
- `ENFORCE_SIGNUP_CAPTCHA` -- signup protection
- `OPENAI_API_KEY` -- enables AI features (Ask AI, story discovery)
- `DAYS_OF_UNREAD` / `DAYS_OF_UNREAD_FREE` -- story retention period
- Email delivery, Stripe/PayPal, AWS S3, social API keys (for production deployments)

### Developer Tools
- `make log` -- view web and Node logs
- `make logall` -- all container logs
- `make shell` -- Django shell with loaded models
- `make bash` -- container shell access
- `make test` -- run test suite
- `make lint` -- code formatting (isort, black, flake8)
- `make mongo` / `make redis` / `make postgres` -- database shells
- Git worktree support for parallel feature development on isolated port sets

---

## 13. Pricing Tiers Summary

| Feature | Free | Premium ($36/yr) | Archive ($99/yr) | Pro ($299/yr) |
|---|---|---|---|---|
| Feed limit | 64 | 1,024 | 4,096 | 10,000 |
| Update frequency | Standard | Standard | Standard | 5-15 min |
| River of News | No | Yes | Yes | Yes |
| Full-text search | No | Yes | Yes | Yes |
| Saved searches | No | Yes | Yes | Yes |
| Private sharing | No | Yes | Yes | Yes |
| Story archiving | 14 days | 30 days | Unlimited | Unlimited |
| Text classifiers | No | No | Yes | Yes |
| Global/folder-scoped training | No | No | Yes | Yes |
| Ask AI | No | No | Yes | Yes |
| Discover Stories | No | No | Yes | Yes |
| Regex classifiers | No | No | No | Yes |
| URL classifiers | No | Yes (exact) | Yes (exact) | Yes (+ regex) |
| Custom mark-as-read duration | No | Yes | Yes | Yes |
| Self-hosted | All features (MIT) | -- | -- | -- |

---

## 14. Differentiating Strengths (Competitive Takeaways)

1. **Intelligence training depth**: Six classifier dimensions (author, tag, title, text, URL, site) with regex support and global/folder scoping -- far beyond simple keyword filters
2. **Open source + self-hostable**: Full MIT-licensed codebase with Docker single-command deployment; self-hosters get all features
3. **Social layer**: Blurblogs, comments, following, and shared story discovery create a social network within the reader
4. **Original site rendering**: True iframe-based original view preserves publisher design intent
5. **Story change tracking**: Monitors article edits post-publication -- rare among RSS readers
6. **Third-party app ecosystem**: API compatibility with Reeder, ReadKit, Unread, NetNewsWire
7. **Newsletter-as-feed**: Email forwarding turns newsletters into trainable, searchable RSS feeds
8. **Granular notification filtering**: Per-feed notifications filtered through intelligence training (Focus-only mode)
9. **AI integration**: Ask AI for story context and sentence-transformer-powered discovery
10. **Longevity**: Active solo development since 2009, survived the Google Reader shutdown, consistent feature releases through 2026

---

*Sources: newsblur.com, blog.newsblur.com, github.com/samuelclay/NewsBlur, NewsBlur Forum, App Store listings*
