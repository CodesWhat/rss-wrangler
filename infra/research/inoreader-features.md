# Inoreader Feature Research

> Comprehensive feature inventory of Inoreader (inoreader.com), a power-user focused RSS reader.
> Research compiled: 2026-02-07

---

## Pricing Tiers Overview

| Feature / Limit            | Free              | Pro ($7.50/mo annual, $9.99/mo monthly) | Custom / Teams (flexible)       |
|----------------------------|-------------------|-----------------------------------------|---------------------------------|
| RSS feeds                  | 150               | 2,500                                   | Custom limits                   |
| Web feeds                  | 20                | 20 (expandable via add-ons)             | Custom limits                   |
| Monitoring feeds           | 30                | 30 (expandable via add-ons)             | Custom limits                   |
| Rules and filters          | 30                | 30 (expandable via add-ons)             | Custom limits                   |
| Duplicate filters          | 10                | 10                                      | Custom limits                   |
| Article translations/day   | 10                | Unlimited                               | Unlimited                       |
| Text-to-speech/day         | 5 articles        | Unlimited                               | Unlimited                       |
| Boosted feeds              | 100               | 100                                     | Custom limits                   |
| Ads                        | Yes               | No                                      | No                              |
| Refresh guarantee          | Standard          | Max 1-hour                              | Max 1-hour+                     |
| API access                 | No                | Yes                                     | Yes                             |
| Offline reading (mobile)   | No                | Yes                                     | Yes                             |
| Priority support           | No                | Yes                                     | Yes                             |
| Team features              | No                | No                                      | Yes (all members get Pro)       |

---

## 1. Feed Management

### Folders
- Hierarchical folder organization for feeds
- A single feed can be assigned to multiple folders simultaneously
- Per-folder view settings (layout, sort, grouping) override global defaults
- Feeds and monitoring feeds can be grouped together in the same folder
- Uniform rules/filters can be applied at the folder level

### Tags
- Tag articles manually or via automation rules
- Each tag automatically creates a "smart folder" accessible from the sidebar
- AI-powered suggested tags (Pro) -- analyzes content and recommends relevant tags from existing taxonomy or proposes new ones
- Tags are searchable and filterable

### Bundles
- Aggregated collections of related feeds shareable via link
- Useful for onboarding others or distributing curated source lists
- Visible on user profile pages

### Feed Discovery
- Curated "Featured Collections" organized by topic (news, tech, business, marketing, lifestyle, sports, etc.)
- Global search across publicly available sources (not just your subscriptions)
- Search-to-feed conversion: any search query can become a monitoring feed
- Over 5 million indexed sources

### OPML
- Full OPML import (from Feedly, Google Reader, or any other RSS reader) via Preferences > Import/Export
- Full OPML export of all subscriptions
- OPML URL subscriptions: subscribe to an OPML file URL as a dynamic feed; Inoreader periodically checks for updates and syncs new feeds automatically

### Feed Health Monitoring
- Per-feed engagement tracking and activity statistics
- Feed health status indicators (active, stale, errored)
- Boost status indicator (rocket icon) in feed management
- Low-engagement feed identification to help prune dead subscriptions

### Boosted Feeds
- Boosting sets a feed to update at 10-minute polling intervals (vs. standard schedule)
- Up to 100 boosted feeds (Free and Pro)
- If another user has already boosted a feed, you benefit from the increased polling without using your own boost quota
- Toggle via Preferences > Subscriptions (rocket icon)

---

## 2. Reading Experience

### Article View Modes
Five distinct layout modes, switchable via the "Eye" icon menu or keyboard shortcuts (keys 1-5):

1. **List view** (key: 1) -- compact, text-focused, one-line-per-article
2. **Expanded view** (key: 2) -- full article content inline, no click required
3. **Card view** (key: 3) -- visual grid with thumbnails, good for image-heavy feeds
4. **Column view** (key: 4) -- multi-pane layout similar to email clients (list on left, article on right)
5. **Magazine view** (key: 5) -- clean, distraction-free layout balancing text and visuals

View settings can be configured at three levels:
- **Global** -- applies everywhere by default
- **Per-folder** -- overrides global for a specific folder
- **Per-feed** -- overrides folder/global for a specific feed

### Reader Mode / Full Content Fetch
- Click the "Load full content" icon (half-cup icon) or press `W` to fetch the complete article from the source URL
- Strips away navigation, ads, and clutter (Readability-style rendering)
- On mobile: pull down on an article to trigger full content fetch
- Once fetched, the full content version is permanently saved for annotation and offline access
- Works on RSS, newsletters, social posts, and other content types
- Pro feature for automatic/bulk fetching

### Media Support
- **Podcast player**: built-in background audio player with playlist management, progress tracking, and cross-browser sync; queue episodes while reading other articles
- **YouTube integration**: sync YouTube subscriptions; video descriptions displayed as articles; embedded playback
- **Audio/video enclosures**: native playback for feed items with media attachments

### Text-to-Speech
- Convert any article to audio on demand
- 50+ languages supported
- Proprietary infrastructure for fast synthesis
- System player integration with seeking and progress tracking
- Free tier: 5 articles/day; Pro tier: unlimited

### Translations
- Translate any article into a preferred language in-app
- Free tier: 10 translations/day; Pro tier: unlimited
- Can be automated via rules (up to 100 automatic translations/day)

### Theme and Display
- Dark mode toggle (via Eye icon)
- Sepia and custom themes
- Configurable font family, font size, and line height
- Option to disable images (bandwidth saving)

---

## 3. Smart Features

### Inoreader Intelligence (AI Suite)
- **Article Summaries**: generate concise overviews using predefined or custom prompts
- **Ask Questions**: query an article's content with natural language questions
- **Custom Prompts**: execute user-defined prompts against article content
- **Intelligence Reports**: bulk-process multiple articles to extract key points, compare sentiments, surface patterns, and generate structured reports
- **Team Intelligence Plan**: shared reporting and collaborative AI workflows

### Spotlights (formerly Highlighters)
- Define keyword groups with shared highlight colors
- Automatically color-highlight matching terms in all articles as you read
- Group related keywords under a single spotlight
- Case-sensitivity options per spotlight
- Shareable across team members
- Bulk management (activate/deactivate/delete multiple)
- **Available on all plans including Free**

### Highlights and Notes (Annotations)
- **Highlights**: select and mark text passages in articles with color coding
- **Notes**: attach written comments to either an entire article or a specific highlighted passage
- All highlights and notes are searchable and stored under Saved > Annotations
- Share highlights with team members (shows creator name and avatar)
- Notes can be kept private or shared with the team
- Highlights are a Pro feature; Notes are available on all plans

### Active Search / Monitoring Feeds
- Enter a keyword or phrase and create a "monitoring feed" that continuously scans the web for matching content
- Supports advanced search syntax and multi-keyword queries
- Filter by language (30 languages supported)
- Monitoring feeds appear in the sidebar alongside regular feeds
- Can be organized into folders, exported as RSS, included in digests
- Replaced the older "Active Search" and "Monitored Keywords" features (Jan 2024)
- Pro feature; Free tier gets 30 monitoring feeds

### Dashboard
- Customizable home screen with configurable gadgets
- Add trending articles, statistics, feed activity widgets
- Multiple dashboards supported
- Create, configure, and arrange gadgets
- Pro feature (dashboard customization)

---

## 4. Personalization

### Sort Options
- Newest first (default) or oldest first
- Configurable at global, folder, or feed level

### Filtering
- Content filters: keep or remove articles matching specific criteria (keywords, author, URL patterns, attachment presence)
- Duplicate filters: automatically remove articles with identical URLs across feeds within a comparison period; runs continuously in background
- Per-feed, per-folder, or global filter scope

### Custom Views
- Per-feed and per-folder view style overrides
- Group articles by feed within a folder view
- Configurable default sorting and grouping via Eye icon menu
- Saved web pages section for clipped content
- Read Later / playlist system for deferred reading

### Column View
- Multi-pane reading layout (article list + reading pane side-by-side)
- On mobile web, falls back to list view automatically

---

## 5. Social and Sharing

### Sharing to External Services
- Share articles to social media and messaging platforms directly from the article toolbar
- Save to: Pocket, Evernote, OneNote, Google Drive, Dropbox, Instapaper, Raindrop.io
- Integration with LinkedIn for sharing
- Webhooks for custom sharing workflows

### Broadcast Feeds
- "Broadcast" articles to your public Inoreader profile page
- Profile pages display your shared articles, activity, and bundles
- Others can subscribe to your broadcast feed as an RSS feed

### Folder RSS Feeds
- Export any folder as a merged RSS feed URL
- Allows others to subscribe to your curated multi-source collections

### HTML Clips
- Export feeds or folders as embeddable HTML clips for websites/newsletters

### Email Digests
- Schedule automatic email mailings to a list of recipients
- Redesigned drag-and-drop digest editor with enhanced customization
- Select folders, tags, or specific feeds to include
- Use cases: competitor monitoring reports, media monitoring, team briefings
- Available on Teams/Enterprise plans

### Team Features
- **Team Channels**: collaborative spaces where all members can contribute articles with comments and notes
- **Team Folders**: shared feed collections visible in the Team dashboard; all members can follow with one click; admins add/remove feeds
- **Access Delegation**: admins assign channel access to specific team members
- **Shared Spotlights**: team-visible keyword highlights
- **Shared Highlights/Notes**: team members see each other's annotations
- **Slack and Microsoft Teams integration**: auto-forward channel articles to Slack/Teams workspaces
- **Team Intelligence Plan**: collaborative AI-powered reporting
- All team members receive Pro-level access while on the team
- Custom limits available per team member on request

---

## 6. Filtering and Rules Engine

### Rules (Pro feature)
Automation workflows based on trigger-condition-action logic, similar to email filters.

#### Triggers
| Trigger                   | Description                                                |
|---------------------------|------------------------------------------------------------|
| New article               | Fires when a new article arrives in a specified feed/folder|
| Article starred           | Fires when you star an article                             |
| Tag added                 | Fires when a specific tag is applied to an article         |
| New Intelligence report   | Fires when an Intelligence report is generated (2025)      |
| New upload                | Fires when a file is uploaded to Inoreader (2025)          |

#### Conditions
- Keyword match in title
- Keyword match in body/content
- Author name match
- URL string match
- Attachment presence
- Combination of multiple conditions with AND/OR logic

#### Actions
| Action                        | Description                                              |
|-------------------------------|----------------------------------------------------------|
| Assign tag                    | Auto-tag matching articles                               |
| Save to Read Later            | Add to reading list                                      |
| Mark as read                  | Auto-dismiss matching articles                           |
| Star article                  | Auto-star matching articles                              |
| Send push notification        | Mobile push alert for matching articles                  |
| Send desktop notification     | Browser notification                                     |
| Send to email                 | Forward article via email                                |
| Send to Pocket                | Auto-save to Pocket                                      |
| Send to Instapaper            | Auto-save to Instapaper                                  |
| Send to Evernote              | Auto-save to Evernote                                    |
| Send to OneNote               | Auto-save to OneNote                                     |
| Send to Dropbox               | Auto-save to Dropbox                                     |
| Send to Google Drive          | Auto-save to Google Drive                                |
| Send to Raindrop.io           | Auto-save to Raindrop.io (2025)                          |
| Trigger webhook               | HTTP POST to external URL for custom integrations        |
| Create summary                | Auto-generate AI summary (2025)                          |
| Translate article             | Auto-translate to selected language (2025, 100/day limit)|
| Add note                      | Auto-attach a custom note to the article (2025)          |

#### Rule Management
- "Copy from" feature to duplicate and modify existing rules
- Manual rule execution (retroactively apply rules to existing articles)
- Rules available on mobile (iOS/Android 7.9.6+)
- Free tier: 30 rules; Pro tier: 30 (expandable via add-ons)

### Filters (separate from rules)
- **Content filters**: remove or keep articles matching keyword/author/URL criteria
- **Duplicate filters**: remove articles with identical URLs across specified feeds/timeframes
- Filters run continuously in background, even when not actively using Inoreader
- Free tier: 30 filters + 10 duplicate filters

---

## 7. Notifications

### Push Notifications
- Mobile push notifications triggered by rules (matching keyword, author, feed, etc.)
- Desktop browser notifications
- Configurable per-rule granularity

### Keyword Alerts via Monitoring Feeds
- Create monitoring feeds for specific keywords/phrases
- Combine with rules to trigger push notifications when new matching content appears
- Effectively replicates Google Alerts functionality within Inoreader
- Supports 30 languages

### Channel Monitoring (Teams)
- Team channels forward articles to Slack or Microsoft Teams automatically
- Email digest scheduling for periodic summaries

---

## 8. Mobile (iOS and Android)

### Core Mobile Features
- Native iOS and Android apps
- Progressive Web App (PWA) installable on Chrome and Safari
- Full feature parity with web for reading, tagging, starring, sharing
- Rules and filters management on mobile (v7.9.6+)

### Offline Reading (Pro)
- Download selected feeds, folders, tags, and saved articles for offline access
- Full content articles available offline (where fetched)
- Offline actions (tag, save, mark read) sync when back online
- Requires app version 7.7+

### Gesture Navigation
- Swipe folder to jump directly to article list (skip feed list)
- Swipe article right for context menu with quick actions
- Pull down on article to fetch full content

### Widgets
- **Unread counter widget**: shows unread article count on home screen
- **Recent Story widget**: displays a single recent article
- **Recent Articles widget**: shows a list of recent articles
- Widgets update in real-time as you interact with Inoreader

### Mobile-Specific Features
- Background audio player for podcasts (persists across views)
- Text-to-speech with system player integration
- Dark theme and large text accessibility options
- Share to social media and messaging apps via native share sheet

---

## 9. Power User Features

### Keyboard Shortcuts (57+ shortcuts)
Key shortcuts include:

| Shortcut         | Action                          |
|------------------|---------------------------------|
| `H` or `?`       | Open keyboard shortcut help     |
| `Space`          | Next article                    |
| `Shift+Space`   | Previous article                |
| `J` / `K`       | Navigate between feeds          |
| `N` / `P`       | Next / previous article         |
| `O` or `Enter`  | Open/close article              |
| `F`             | Toggle favorite/star            |
| `T`             | Add tags                        |
| `W`             | Load full content (Readability) |
| `S`             | Share article                   |
| `M`             | Mark as read                    |
| `1`-`5`         | Switch view modes (list, expanded, card, column, magazine) |
| `Shift+A`       | Mark all as read                |
| `R`             | Refresh                         |
| `G then A`      | Go to All Articles              |
| `G then S`      | Go to Starred                   |

### API
- RESTful API accessible via HTTP/HTTPS
- Google Reader-compatible API endpoints (enables third-party client support)
- OAuth 2.0 authentication
- Available to Pro subscribers and approved developers building public apps
- Compatible third-party clients: Reeder, ReadKit, NetNewsWire, and others

### Zapier Integration
- Connect Inoreader to 1,500+ web services
- Available triggers: new article in folder, article starred, tag added
- Available actions: create article, add tag, etc.
- No-code automation workflow builder
- Pro plan required

### n8n Integration (2025)
- Connect with 1,000+ apps and services
- Build monitoring systems, share curated news automatically, feed AI tools with fresh content
- More flexible than Zapier for advanced workflows

### IFTTT Support
- Applet-based automation for external workflows
- Trigger on new articles, stars, tags

### Pipedream Integration
- Developer-focused API integration platform
- Custom code triggers and actions

### MCP Server
- Inoreader MCP (Model Context Protocol) support via Zapier
- Connect Inoreader actions with AI tools supporting MCP

### Browser Extension (v6.0+)
- Two-click saving of web pages to Inoreader
- Tag assignment during save
- Highlight and annotate text while browsing external sites
- Save private pages (LinkedIn posts, X/Twitter posts, Bluesky posts)
- Contextual right-click menu for quick actions
- Customizable preferences
- Teams functionality built-in

### Web Clipper
- Save external web pages into "Saved web pages" collection
- Captures title, URL, timestamp, and full page content
- Accessible from within Inoreader at any time

### File Uploads (2025)
- Upload personal documents (PDF, etc.) and convert them into readable articles
- Annotate, organize, tag, and share uploaded documents
- Trigger rules on new uploads

### Login Activity Log
- Track active sessions and login locations
- Security monitoring for account access

---

## 10. Content Sources

### RSS / Atom Feeds
- Core functionality; supports RSS 2.0, RSS 1.0, Atom feeds
- Auto-discovery of feed URLs from website URLs
- Up to 150 feeds (Free) or 2,500 feeds (Pro)

### Newsletters
- Each "Newsletter Feed" has a unique email address
- Subscribe to email newsletters using the Inoreader-generated address
- Newsletters appear as regular feed items in the sidebar
- No inbox clutter; newsletters decluttered from personal email
- Up to 20 newsletter feeds (Pro); Free tier may have limits

### Social Media Feeds
- **Twitter/X**: subscribe to home timeline, specific users, or search queries (via URL)
- **Facebook Pages**: monitor public page posts
- **Reddit**: subscribe to subreddits; posts displayed as regular articles
- **Telegram Channels**: follow public channels
- **Mastodon**: follow accounts and feeds
- **Bluesky** (2025): follow accounts, hashtags, search results, and home timeline
- Algorithm-free consumption of social content

### YouTube
- Sync YouTube subscriptions directly
- Video descriptions displayed as articles
- Embedded video playback
- New audio player with transcripts, topic extraction, and AI summaries for videos

### Podcasts
- Subscribe to podcast feeds
- Built-in background audio player with playlist, progress tracking, cross-browser sync
- Transcripts, topic extraction, and AI summaries (2025)

### Google News Alerts
- Create keyword/topic searches delivered as feeds
- Multiple language support
- Effectively replaces Google Alerts with in-app monitoring feeds

### Web Feeds (sites without RSS)
- Create RSS-like feeds from websites that lack native RSS support
- Inoreader crawls the page and suggests feed extraction options
- Listed in sidebar alongside regular feeds
- Cookie consent and overlay element removal for cleaner tracking
- Pro feature; Free tier: 20 web feeds

### Track Changes (Web Page Monitoring)
- Monitor visual or textual changes on any web page
- **Visual monitoring**: select a screen area, set a change threshold, receive alerts on visual changes
- **Text monitoring**: select specific text elements on a page, receive alerts when text changes
- Use cases: price monitoring, product availability, competitor tracking, changelog following
- Pro feature

### File Uploads
- Upload PDFs and documents; converted to readable article format
- Organize alongside other content sources

### Pocket Import (2025)
- Link Pocket account and transfer saved articles into Inoreader

---

## Integration Ecosystem Summary

| Integration         | Direction      | Tier     |
|---------------------|----------------|----------|
| Pocket              | Send + Import  | Pro      |
| Instapaper          | Send           | Pro      |
| Evernote            | Send           | Pro      |
| OneNote             | Send           | Pro      |
| Google Drive        | Send           | Pro      |
| Dropbox             | Send           | Pro      |
| Raindrop.io         | Send           | Pro      |
| Readwise            | Sync highlights| Pro      |
| Slack               | Receive (Teams)| Teams    |
| Microsoft Teams     | Receive (Teams)| Teams    |
| Zapier              | Bidirectional  | Pro      |
| n8n                 | Bidirectional  | Pro      |
| IFTTT               | Bidirectional  | Pro      |
| Pipedream           | Bidirectional  | Pro      |
| Webhooks            | Send           | Pro      |
| Bluesky             | Receive        | All      |
| SAML SSO            | Auth           | Teams    |

---

## Notable Limitations

- Highlights sync to Readwise, but notes do not
- Safari browser extension lacks tagging and annotation features (compared to Chrome extension)
- Annotations not accessible via IFTTT
- Third-party RSS clients (Reeder, etc.) cannot access system folders (Read Later, Saved Web Pages)
- Column view falls back to list view on mobile web
- Article retention defaults to 30 days per feed (configurable)
- Legacy social features (old-style following/commenting between Inoreader users) were deprecated March 2025

---

## Sources

- [Inoreader Homepage](https://www.inoreader.com/)
- [Inoreader Pricing](https://www.inoreader.com/pricing)
- [Inoreader Features Page](https://www.inoreader.com/features/)
- [Inoreader 2025 Year in Review](https://www.inoreader.com/blog/2025/12/inoreader-2025-intelligence-and-automation-in-one-content-hub.html)
- [Inoreader Q1 2025 Highlights](https://www.inoreader.com/blog/2025/03/inoreader-q1-highlights-a-strong-start-to-2025.html)
- [Inoreader for Teams](https://www.inoreader.com/blog/2022/04/inoreader-for-teams-bring-the-content-discovery-and-distribution-to-a-higher-level.html)
- [Rules and Filters Guide](https://www.inoreader.com/blog/2023/06/streamline-content-discovery-with-filters-and-rules.html)
- [New Rule Triggers and Actions (Oct 2025)](https://www.inoreader.com/blog/2025/10/introducing-new-rule-triggers-and-actions-translations-summaries-and-more.html)
- [Active Reading Tools (Jun 2025)](https://www.inoreader.com/blog/2025/06/new-and-improved-tools-for-active-reading.html)
- [Monitoring Feeds Guide](https://www.inoreader.com/blog/2024/01/stay-in-the-know-with-monitoring-feeds.html)
- [Full Content View](https://www.inoreader.com/blog/2022/11/how-to-take-advantage-of-the-full-content-view-in-inoreader.html)
- [Offline Mode Enhancement](https://www.inoreader.com/blog/2024/04/app-update-seamless-reading-with-enhanced-offline-mode.html)
- [Text-to-Speech](https://www.inoreader.com/blog/2022/05/listen-to-your-articles-on-the-go-with-text-to-speech.html)
- [Web Feeds and Track Changes](https://www.inoreader.com/blog/2025/02/improved-web-feeds-track-changes.html)
- [Boosted Feeds](https://www.inoreader.com/blog/2015/03/inoreader-how-to-boosting-feeds.html)
- [Keyboard Shortcuts](https://www.inoreader.com/blog/2015/05/inoreader-how-to-save-time-with.html)
- [Developer Portal / API](https://www.inoreader.com/developers/)
- [Zapier Integration](https://zapier.com/apps/inoreader/integrations)
- [Browser Extension 6.0](https://chromewebstore.google.com/detail/inoreader-read-later-and/kfimphpokifbjgmjflanmfeppcjimgah)
- [Empowering My Reading Workflow With Inoreader (User Review)](https://numericcitizen.me/empowering-my-reading-workflow-with-inoreader/)
- [Inoreader iOS App Store](https://apps.apple.com/us/app/inoreader-news-rss-reader/id892355414)
- [Inoreader Google Play Store](https://play.google.com/store/apps/details?id=com.innologica.inoreader&hl=en_US)
- [5 Best RSS Readers 2026 (FeedSpot)](https://www.feedspot.com/blog/best-rss-reader/)
- [Inoreader Reviews (G2)](https://www.g2.com/products/inoreader/reviews)
