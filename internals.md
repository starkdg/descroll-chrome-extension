# DeScroll Chrome Extension - Internals & Architecture

DeScroll is a Chrome Extension (Manifest V3) that replaces the
habit-forming infinite scroll of social media with a "beneficial
scroll" on the New Tab page. It generates a custom feed by discovering
content (RSS/Atom/Sitemap) from domains found in a user-specified
bookmark folder.

---

## Architecture & Design

The extension is built with modular Vanilla JS (ES Modules),
emphasizing performance, privacy, and a minimalist aesthetic.

### 1. User Configuration & Onboarding
- **Onboarding Flow:** When first installed, the extension presents an
  onboarding overlay to request the `<all_urls>` permission (necessary
  for feed discovery) and to let the user specify which bookmark
  folder to use as a source.
- **Auto-Provisioning:** If the specified folder (default: `MyFeed`)
  does not exist, the extension automatically creates it and populates
  it with high-quality "starter" bookmarks to provide immediate value.
- **Options Page (`options.html/js`):** Allows customization of:
    - **Bookmark Folder Name:** The source folder for discovery
      (default: `MyFeed`).
    - **Feed Depth:** `domainCount` (number of domains to sample) and
      `itemsPerDomain` (items to show per domain).
    - **Seen Window:** `windowDays` (how long to hide previously
      viewed content).

### 2. Core Modules
- **`app.js` (UI Orchestrator):** The entry point for the New Tab
  page. It initializes the `FeedView`, `DiscoveryModule`, and
  `SeenContentManager`.
    - Implements infinite scroll via `IntersectionObserver`.
    - Manages a `feedPool` in `chrome.storage.session` to ensure the
      feed is ready immediately and persists across new tab openings
      in the same session.
    - Handles batch rendering (10 items at a time) to maintain high
      performance.
- **`view.js` (UI/UX Engine):** Handles all DOM operations, including:
    - Skeleton screens for loading states.
    - Dynamic card generation with high-resolution favicons
      (`_favicon` API) and brand-colored placeholders.
    - Infinite scroll setup and empty state messaging.
- **`discovery.js` (Discovery Engine):** Finds content sources
  (RSS/Atom/Sitemap).
    - **Hybrid Parsing:** Uses `DOMParser` in the foreground (New Tab)
      and fallback Regex-based parsing in the background (Service
      Worker) where DOM APIs are unavailable.
    - **Priority Logic:** Prefers `<link>` tags in HTML, then probes
      common paths (e.g., `/feed/`), and finally falls back to
      Sitemaps if no feeds are found.
- **`storage.js` (Atomic State):** Uses the **Web Locks API** to
  ensure atomic read-modify-write operations on shared storage keys
  like `discoveredFeeds`, preventing data loss during concurrent
  background discovery tasks.
- **`seen.js` (State Management):** Filters out content seen within
  the configured `windowDays`.
    - Uses an in-memory cache and debounced writes (500ms) to minimize
      storage I/O and performance overhead.

### 3. Background Services
- **`background.js` (Service Worker):** Listens for bookmark events
  and triggers the discovery process for new domains. It ensures the
  `discoveredFeeds` registry is kept up to date without blocking the
  main UI.

---

## Data Structures & Storage

| Storage Key | Location | Purpose |
| :--- | :--- | :--- |
| `folderName` | `local` | The user-configured bookmark folder name. |
| `onboardingComplete` | `local` | Boolean flag indicating if the setup is finished. |
| `discoveredFeeds` | `local` | A registry mapping domains to their discovered feed/sitemap URLs. |
| `seenUrls` | `local` | A map of `url: timestamp` for filtering recently viewed items. |
| `feedPool` | `session` | A pre-shuffled, ready-to-render list of items for the current session. |

---

## Technical Considerations

- **Atomic Writes:** All updates to `discoveredFeeds` MUST go through
  `StorageManager.atomicUpdate` to prevent race conditions.
- **Performance:** Large bookmark trees are flattened and processed
  efficiently. Batch rendering ensures that the "Time to First
  Meaningful Paint" remains low.
- **Privacy:** All discovery and filtering happen locally in the
  browser. No data is sent to external servers except for the standard
  fetching of RSS feeds and sitemaps from the respective domains.
- **Browser Compatibility:** While designed for Chrome, the extension
  uses standard Web APIs (IntersectionObserver, Web Locks, ES
  Modules). It includes specific error handling for favicon fetching
  and cross-origin resource sharing (CORS).
