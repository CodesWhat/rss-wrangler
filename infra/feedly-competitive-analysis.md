# Feedly Competitive Feature Analysis

> Compiled 2026-02-07 for RSS Wrangler competitive roadmap planning.
> Based on comprehensive research of feedly.com, Feedly documentation, and third-party reviews.

---

## Pricing Tiers Overview

| Plan | Price | Key Limits |
|------|-------|------------|
| **Free** | $0 | 100 sources, 3 folders |
| **Pro** | ~$6/mo (billed annually) | 1,000 sources, unlimited folders |
| **Pro+** | ~$12/mo (billed annually) | 1,000 sources, AI Feeds, newsletters, RSS Builder |
| **Enterprise** | Custom pricing | Unlimited sources, team features, threat/market intel |

---

## 1. Feed Management

### Source Types (11 and growing)

| Source Type | Free | Pro | Pro+ | Enterprise |
|-------------|------|-----|------|------------|
| RSS feeds (paste URL) | Y | Y | Y | Y |
| Websites / trade publications (search by name) | Y | Y | Y | Y |
| Blogs (including Medium publications) | Y | Y | Y | Y |
| News publications (NYT, etc.) | Y | Y | Y | Y |
| Research journals (Nature, etc.) | Y | Y | Y | Y |
| YouTube channels (search, URL, or OPML import) | Y | Y | Y | Y |
| Podcasts (via RSS URL) | Y | Y | Y | Y |
| Reddit subreddits / searches | Y | Y | Y | Y |
| Keyword alerts (boolean AND/OR) | - | Y | Y | Y |
| Newsletters (via unique Feedly email address) | - | - | Y | Y |
| Twitter/X (accounts, hashtags, lists, searches) | - | - | Y | Y |
| Bluesky feeds (users and feeds) | - | - | Y | Y |
| LinkedIn posts (via Market Intelligence) | - | - | - | Y |
| Google News alerts | - | Y | Y | Y |

### Organization

- **Folders/Feeds**: Group sources into folders (Free: 3 folders, Pro+: unlimited)
- **Per-folder view settings**: Apply different view layouts (Cards, Magazine, Title-only) to different folders or individual feeds
- **Drag-and-drop reordering** of feeds and folders in sidebar
- **Redesigned sidebar** (2025+) with less clutter and greater personalization

### OPML Support

- **OPML import**: Drag-and-drop or file picker; imports feeds and folder structure
- **OPML export**: Available at `feedly.com/i/opml` (web only)
- **Limitation**: OPML does not include Boards, Read Later articles, AI Feeds, or Reddit feeds
- **YouTube OPML import**: Can import YouTube's subscription OPML directly

### Feed Discovery

- **Search by topic, name, or URL** from the "Follow Sources" panel
- **40+ million indexed sources** in Feedly's database
- **Recommended sources** based on existing subscriptions
- **RSS Builder** (Pro+/Enterprise): Create RSS feeds for websites that do not have native RSS -- point-and-click article selector on the page; up to 25 feeds (Pro+) or 100 feeds (Enterprise)

---

## 2. Reading Experience

### Layout Views

| View | Description |
|------|-------------|
| **Title-only** | Dense list, article titles only; fast scanning |
| **Magazine** | Default view; title + thumbnail + first few lines of article |
| **Cards** | Three-column visual grid; photo-heavy; good for design/photography feeds |
| **Compact Magazine** | Tighter spacing variant of Magazine view |

### Density Options

- Each view supports density preferences (comfortable / compact)
- Different views can be applied per folder or per individual feed

### Article Reading

- **Slider/panel view**: Article opens in a slide-out panel from the right; easy to jump back to article list
- **Inline expand**: Expand article directly within the list
- **Full article preview**: Shift+V to load full article content inside Feedly
- **Open original**: V key opens original article in new browser tab
- **Full-text extraction**: Feedly extracts linked article content (especially useful for Twitter/social sources)
- **Distraction-free reader mode**: Clean, minimalist article rendering

### Read State Management

- **Mark as read**: Toggle per-article (M key)
- **Mark as read and hide**: X key
- **Mark all as read**: Shift+A, with "Older than" time-based option
- **Auto-mark as read on scroll**: Configurable in preferences
- **Auto-mark articles older than 30 days as read**: Configurable
- **Sort order**: Newest first (default) or Oldest first, configurable per feed/folder
- **Recently Read section**: Access previously read articles

### Media Handling

- **Inline YouTube playback** in distraction-free view
- **Podcast RSS support** (audio player not confirmed as built-in)
- **Hero images / thumbnails** displayed in Magazine and Card views
- **Embedded video detection** in search results

---

## 3. AI / Smart Features (Leo AI Assistant)

### Core Leo AI Skills

| Skill | Description | Plan |
|-------|-------------|------|
| **Topic Prioritization** | Highlight articles matching user-defined topics, trends, keywords | Pro+ |
| **Deduplication** | Remove articles with 85%+ content overlap | Pro+ (auto-enabled) |
| **Mute Filters** | AI-powered content removal by keyword, topic, or author | Pro+ |
| **Summarization** | AI-generated article summaries highlighting key takeaways | Pro+ |
| **Business Events** | Track funding, partnerships, product launches, leadership changes | Pro+ |
| **Industry Tracking** | Filter by specific industries (retail, travel, etc.) | Pro+ |
| **Like Board** | Train AI by example -- point to a curated Board, Leo learns what to prioritize | Pro+ |
| **Ask AI** | GenAI-powered synthesis across articles with source citations | Enterprise |
| **Bulk Ask AI** | Apply AI prompts to multiple articles simultaneously | Enterprise |
| **Prompt Suggestions** | AI-generated query suggestions tailored to research context | Enterprise |

### AI Feed Builder

- Create custom AI Feeds that combine keyword queries with AI Models
- AI Models are pre-trained on 1,000+ topics (especially strong in cybersecurity/threat intel)
- AI Feeds produce 9x more relevant results than raw keyword monitoring (Feedly's claim)
- Source bundles curated by Feedly for specific domains

### Training and Feedback

- **Train Leo** via the "Train Leo" panel in feeds
- **Four priority types**: Topics, Business Events, Industry, Like Board
- **Reinforcement learning**: Saving articles to Boards sends positive signals
- **Thumbs up/down feedback** on Leo's suggestions
- **Continuous adaptation** to evolving user preferences

### Multilingual AI

- Automatic collection, translation, and enrichment of foreign-language articles
- Market intelligence available in 15+ languages

---

## 4. Personalization

### Priority / Ranking

- **Priority Inbox**: Leo surfaces high-priority articles matching trained preferences at top of feed
- **Popular articles**: Sort folders by "Most Shared" or "Most Popular"
- **Custom training**: Refine priority via topic selection, like-board examples, and explicit feedback

### Muting

- Mute specific **keywords** (with title: and author: prefixes for precision)
- Mute entire **topics** (1,000+ pre-trained AI topic models)
- Mute specific **authors** via author: operator
- Duration options: 1 day, 1 week, 1 month, or forever
- Create mute filters directly by highlighting text in an article
- Pause/resume/edit/delete filters from management panel

### Highlights and Notes

- **Highlight text** within any article (drag-select, then click Highlight)
- **Add notes** to articles via note panel at top of article
- **Search notes and highlights** via Power Search
- **Annotated section** (Business plan) collects all annotated articles
- **Tag teammates** in notes/highlights to notify them

### Saved Searches

- Save search queries by bookmarking the URL
- Convert searches to AI Feeds for ongoing monitoring
- Power Search with operators: AND, OR, NOT, title-only, time range, media type

### Boards

- **Personal Boards**: Save and organize articles for yourself
- **Team Boards** (Enterprise): Shared private spaces; save, organize, annotate collaboratively
- **Boards never expire**: Permanent access to saved content
- **Board-based AI training**: Like Board skill learns from board curation patterns

---

## 5. Social / Sharing / Team Features

### Sharing Options

- Share to **Buffer**, **LinkedIn**, **Twitter/X**, and more
- Share via **email**, **copy link**
- **Customize sharing toolbar**: Select which sharing tools appear
- One-tap sharing from article view

### Annotations for Teams

- Highlight and add notes to any article in a Board
- Tag teammates via @mention in notes (sends email or Slack notification)
- Annotated articles collected in dedicated Annotated section (Business/Enterprise)

### Team Features (Enterprise)

- **Team Feeds and Boards**: Shared collections across organization
- **Team Newsletters**: Round up best content from Boards, send branded newsletters to stakeholders
- **Team onboarding**: Streamlined setup with personalized experiences for new members
- **Role-based access** and organizational administration

### Integrations

| Integration | Type | Plan |
|------------|------|------|
| **Slack** | Share articles, Board notifications to channels | Pro+ |
| **Microsoft Teams** | Share articles, Board notifications to channels | Pro+ |
| **Evernote** | Clip articles (C key shortcut) | Pro |
| **Pocket** | Save articles in one tap | Pro |
| **Buffer** | Share to social media | Pro |
| **LinkedIn** | Share articles directly | Pro |
| **Dropbox** | Auto-backup Read Later and Boards (PDF/HTML) | Pro |
| **OneNote** | Save articles | Pro |
| **Zapier** | 6,000+ app automations | Pro |
| **IFTTT** | Automation recipes | Pro |
| **ThreatConnect** | Threat intelligence platform delivery | Enterprise |
| **Anomali ThreatStream** | Threat intelligence enrichment | Enterprise |

---

## 6. Filtering

### Mute Filters (detailed)

- **Keyword-based**: Type any word or phrase to mute
- **Title-only filtering**: Use `title:` prefix to match only article titles
- **Author filtering**: Use `author:` prefix to mute all articles from a specific author
- **Topic-based muting**: Use Feedly AI's 1,000+ pre-trained topics to mute broad categories
- **Scope**: Apply per-folder or across all folders globally
- **Duration**: 1 day, 1 week, 1 month, or forever
- **Inline creation**: Highlight a keyword in an article, select "Mute This Phrase"
- **Management**: View removed articles, pause/resume, edit, delete filters
- **Mobile support**: Manage mute filters on mobile (limited compared to web)
- **Plan**: Pro+ and Enterprise

### Priority Rules

- Train Leo with four priority types: Topics, Business Events, Industry, Like Board
- Priority articles surfaced with visual indicator (green Leo icon)
- Can define multiple priority rules per feed

### Natural Language Filters (Enterprise)

- Refine AI Feeds using natural language queries for niche topics
- More expressive than boolean keyword matching

---

## 7. Notifications

### Keyword Alerts

- Create keyword alerts (with AND/OR boolean operators) that scan across the web
- New matching articles appear in dedicated Keyword Alert feeds
- Deduplication is auto-enabled for keyword alerts

### Integration-Based Notifications

- **Slack/Teams**: Board activity triggers channel notifications
- **Zapier triggers**: New article in Board, new article in Feed, new article in Folder, article saved for later, new highlight, new note, new popular article
- **IFTTT**: Email digest, push notifications, custom actions on new articles
- **Webhooks** (via API): HTTPS webhooks for programmatic notification

### No Native Push Notifications (confirmed)

- Feedly does not offer built-in push notifications for new articles
- Community browser extensions (Feedly Notifier) provide unread count badges and desktop notifications for Chrome, Firefox, Opera, and Edge

---

## 8. Mobile / Cross-Platform

### Platforms

- **Web app** (feedly.com)
- **iOS app** (App Store)
- **Android app** (Google Play)
- No official desktop app (web-only on desktop)

### Mobile Features

- Full feature parity with web for reading and organization
- **Dark mode / Night theme**: Toggle between Day and Night themes in sidebar
- **Gesture navigation**:
  - Short swipe left: Mark article as read
  - Long swipe left: Mark all visible articles as read
  - Swipe down: Refresh (from top of feed)
  - Left edge swipe: Open navigation sidebar
  - Swipe left/right: Navigate between articles
- **Offline reading**: Limited offline caching (not a primary advertised feature)
- **Per-feed view settings** work on mobile

### Themes

- **Day theme** (light background)
- **Night theme** (dark background)
- No additional custom color themes (third-party Stylish/Userstyles plugins exist for web)

---

## 9. Power User Features

### Keyboard Shortcuts (25 total)

**Navigation:**
| Shortcut | Action |
|----------|--------|
| `G` then `T` | Show Today |
| `G` then `A` | Show All |
| `G` then `F` | Show Favorites |
| `G` then `G` | Jump to... (quick navigation) |
| `G` then `L` | Show Read Later |
| `G` then `I` | Show Index |
| `G` then `O` | Organize Sources |
| `Shift + J` | Next source/collection |
| `Shift + K` | Previous source/collection |
| `R` | Refresh |

**Article List:**
| Shortcut | Action |
|----------|--------|
| `J` | Inline next article |
| `K` | Inline previous article |
| `N` | Select next article |
| `P` | Select previous article |
| `Shift + A` | Mark all as read |

**Selected Article:**
| Shortcut | Action |
|----------|--------|
| `O` | Inline or close selected article |
| `V` | Open original in new tab |
| `Shift + V` | Preview (full article in Feedly) |
| `M` | Toggle mark as read |
| `X` | Mark as read and hide |
| `S` | Save to Read Later |
| `T` | Save to Board |
| `B` | Save to Buffer |
| `C` | Clip to Evernote |
| `?` | Show keyboard shortcuts overlay |

### API

- **RESTful API** at `api.feedly.com` (HTTPS, JSON)
- **Endpoints**: Feeds, entries, boards, search, markers, tags, subscriptions, profiles
- **Search API** with pagination (continuation tokens)
- **Webhooks**: HTTPS webhooks for real-time event notifications
- **Rate limit**: 100,000 API requests/month
- **Authentication**: Developer access token from Feedly account
- **Python client**: Official `feedly/python-api-client` on GitHub
- **MCP Server** (2025): For Claude AI integration with Feedly Threat Graph

### Automation

- **Zapier**: 8 triggers (new AI Feed article, new Board article, new Feed article, new Folder article, saved for later, new highlight, new note, new popular article)
- **IFTTT**: Triggers and actions for content automation, email digests, cross-posting
- **Browser extensions**: Feedly Mini (Chrome/Firefox) for saving articles to Boards from any webpage; Feedly Notifier (Chrome/Firefox/Opera/Edge) for unread count badges

### Bookmarklet

- **Feedly Feedlet**: Third-party universal bookmarklet for subscribing to RSS feeds from any page

---

## 10. Digest / Summary / Newsletter

### Automated Newsletters (Enterprise)

- Pull content from AI Feeds or Folders automatically
- Choose recurring schedule (daily, weekly)
- Runs on autopilot -- sends branded emails with curated content
- Include AI-generated summaries per article (optional)
- Enhanced formatting with custom styling and branding
- Send to multiple stakeholder groups

### Email Digest via Third-Party

- **Zapier**: Aggregate Feedly articles into email digests (daily, weekly, biweekly)
- **IFTTT**: Email Digest action -- adds items to daily digest sent at specified time
- Can combine with Board/Folder triggers for topic-specific digests

### Newsletter Subscriptions (Inbound)

- **Pro+ and Enterprise**: Subscribe to email newsletters directly in Feedly
- Each Feedly account gets a unique email address for newsletter subscriptions
- Newsletters appear in feeds alongside RSS articles, organized identically
- Newsletters can be grouped into folders and processed by Leo AI

---

## 11. Backup and Data Portability

| Feature | Plan |
|---------|------|
| OPML export (feeds + folders) | Free |
| OPML import (feeds + folders) | Free |
| Dropbox auto-backup (Read Later + Boards, PDF/HTML) | Pro |
| Zapier/IFTTT archive workflows | Pro |
| API data access | Pro+ |

---

## 12. Specialized Verticals (Enterprise)

### Feedly for Threat Intelligence

- Pre-trained AI models for: CVEs, malware families, threat actors, IoCs, ATT&CK techniques
- **CVE Insights Cards**: Real-time CVSS scores, patches, timelines
- **Vulnerability Agent**: CVSS Vector filtering by exploitation method
- **Cyberattack Agent**: Filter for attack chains, victims, attributions
- **IoC Research Tool**: Auto-connect indicators to threat actors and malware
- **Malware Category AI Models**: Organize by STIX categories
- **Top Stories for Threat Intelligence**: Sort threats by media coverage volume

### Feedly for Market Intelligence

- **The Scanner**: Explore potential future market developments
- **The Radar**: Detect emerging market signals
- **The Monitor**: Track current market conditions
- **Startup Innovation Radar**: Real-time startup database
- **Emerging Trends Dashboard**: Surface industry trends from weak signals
- **Press Release Intelligence**: 4,000+ company press release sources
- **New Deals Tracking**: Uncover competitor contracts
- **Industry AI Models**: Nine industry-specific models for breaking news

---

## Summary: Key Competitive Differentiators

1. **Leo AI is the primary moat** -- prioritization, deduplication, summarization, mute filters, and like-board training create a highly personalized feed
2. **11 source types** beyond RSS -- YouTube, podcasts, Reddit, newsletters, Twitter, Bluesky, keyword alerts
3. **RSS Builder** for sites without feeds is a unique power feature
4. **Enterprise vertical products** (Threat Intel, Market Intel) create upsell paths
5. **40M+ indexed sources** make discovery frictionless
6. **Automated newsletters** from curated feeds is a strong team/business feature
7. **25 keyboard shortcuts** with vim-like navigation (j/k/n/p) appeal to power users
8. **Zapier/IFTTT** with 8 specific triggers enable deep workflow automation

---

## Feature Gap Analysis for RSS Wrangler

Features Feedly has that may be worth evaluating for our roadmap:

| Category | Feedly Feature | Priority |
|----------|---------------|----------|
| AI | Article summarization | High |
| AI | Deduplication (85% threshold) | High |
| AI | Priority inbox / topic prioritization | High |
| AI | Like-Board training (learn by example) | Medium |
| Feeds | RSS Builder for non-RSS sites | Medium |
| Feeds | Newsletter subscription via email | Medium |
| Feeds | YouTube / podcast / Reddit as sources | High |
| Reading | Multiple view layouts (title/magazine/card) | Medium |
| Reading | Per-feed view settings | Low |
| Reading | Slider/panel article reader | Medium |
| Filtering | Mute filters with duration + scope options | High |
| Filtering | Author and title-only mute operators | Medium |
| Sharing | Team Boards with annotations | Low (future) |
| Sharing | Automated team newsletters | Low (future) |
| Power | Comprehensive keyboard shortcuts (25) | High |
| Power | Zapier/IFTTT with 8 trigger types | Medium |
| Power | REST API with webhooks | Medium |
| Power | Browser extension for saving from web | Medium |
| Digest | Daily/weekly email digests | Medium |
| Backup | OPML import/export | Already have |
| Backup | Dropbox auto-backup (PDF/HTML) | Low |
| Mobile | Gesture navigation | Medium |
| Mobile | Dark/light theme toggle | Already have |

---

## Sources

- [Feedly Official Site](https://feedly.com/)
- [Feedly AI](https://feedly.com/ai)
- [Feedly Documentation - Plans Comparison](https://docs.feedly.com/article/140-what-is-the-difference-between-feedly-basic-pro-and-teams)
- [Feedly Documentation - Mute Filters](https://docs.feedly.com/category/706-mute-filters)
- [Feedly Documentation - OPML Export](https://docs.feedly.com/article/52-how-can-i-export-my-sources-and-feeds-through-opml)
- [Feedly Documentation - Keyboard Shortcuts](https://docs.feedly.com/article/81-what-are-the-keyboard-shortcuts)
- [Feedly Documentation - RSS Builder](https://docs.feedly.com/category/592-rss-builder)
- [Feedly Documentation - Slack Integration](https://docs.feedly.com/article/816-how-to-use-feedlys-integration-for-slack-v2)
- [Feedly Documentation - Dropbox Backup](https://docs.feedly.com/article/398-how-to-setup-a-dropbox-backup)
- [Feedly Documentation - Automated Newsletters](https://docs.feedly.com/article/692-guide-to-automated-newsletters)
- [Feedly Documentation - Mark as Read](https://docs.feedly.com/article/503-how-to-enable-disable-mark-as-read-on-scroll)
- [Feedly New Features Page](https://feedly.com/new-features)
- [Feedly Blog - Boards, Notes, Highlights](https://blog.feedly.com/boards/)
- [Feedly Blog - View Layouts](https://blog.feedly.com/experiment-02-title-only-magazine-and-card-views/)
- [Feedly Blog - 10 Source Types](https://feedly.com/new-features/posts/the-10-types-of-sources-you-can-add-on-feedly)
- [Feedly Blog - Leo AI](https://blog.feedly.com/leo/)
- [Feedly Blog - Newsletters in Feedly](https://blog.feedly.com/get-newsletters-in-feedly/)
- [Feedly Blog - Mobile Tips](https://blog.feedly.com/tips-and-tricks-for-using-feedly-mobile/)
- [Feedly Developer API](https://developers.feedly.com/reference/introduction)
- [Feedly Zapier Integration](https://zapier.com/apps/feedly/integrations)
- [Feedly IFTTT Integration](https://ifttt.com/feedly)
- [UseTheKeyboard - Feedly Shortcuts](https://usethekeyboard.com/feedly/)
- [TechCrunch - Feedly Boards/Notes Launch](https://techcrunch.com/2017/04/04/feedlys-reader-app-now-caters-to-knowledge-workers-with-launch-of-boards-notes-annotations/)
- [Zapier - Best RSS Readers 2026](https://zapier.com/blog/best-rss-feed-reader-apps/)
- [G2 - Feedly Reviews](https://www.g2.com/products/feedly-news-reader/reviews)
- [Elegant Themes - How to Use Feedly Guide](https://www.elegantthemes.com/blog/marketing/how-to-use-feedly-the-ultimate-guide)
