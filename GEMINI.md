# DeScroll Chrome Extension

A Chrome Extension designed to replace the habit-forming infinite
scroll of social media with a "beneficial scroll" of curated content
sourced from the feeds discovered from the user's own bookmarks. 

## Project Overview

The extension overrides the default Chrome New Tab page (`chrome://newtab`) with a custom interface. It fetches the user's bookmark tree, flattens it into a linear list, and presents it as a modern, aesthetically pleasing feed.

### Technologies
- **Manifest V3:** The latest Chrome Extension standard.
- **Vanilla JS:** No external frameworks used to maintain high performance and simplicity.
- **IntersectionObserver API:** Powers the infinite scroll mechanism.
- **CSS Variables:** Used for consistent styling and easy theme adjustments.

## Architecture

- `manifest.json`: Configuration for the extension, including permissions (`bookmarks`, `favicon`, `storage`, `<all_urls>`) and the `newtab` override.
- `newtab.html`: The structural skeleton for the feed and header.
- `app.js`: The core logic for bookmark processing, shuffling, and batch rendering.
- `styles.css`: An "Intentional Minimalism" design focused on readability and clarity.

## Building and Running

### Development Mode
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** in the top right corner.
3.  Click **Load unpacked**.
4.  Select the project directory.
5.  Open a new tab to see the extension in action.

### Testing
- Manual testing is required by opening new tabs and verifying bookmark rendering and scroll performance.
- Check the console on the New Tab page for logs related to bookmark loading and batch rendering.

## Development Conventions

- **Surgical Updates:** When modifying existing files, use precise `replace` operations to maintain code integrity.
- **Performance:** Ensure that large bookmark trees (1000+ items) do not impact the browser's "Time to First Meaningful Paint" by using batch rendering (currently 10 items per batch).
- **Permissions:** Always verify if a new feature requires additional permissions in `manifest.json` (e.g., `history` or `topSites`).
- **Discovery Logic:** Future features involving RSS/Sitemap discovery from bookmarked domains should be modularized to avoid blocking the main UI thread.

## TODO / Future Features
- [ ] Implement RSS/Feed discovery from bookmarked domains.
- [ ] Add a search/filter bar for the bookmark feed.
- [ ] Implement a "Mindfulness Mode" that limits scroll depth or adds breathing prompts.
- [x] Implement a mutex or task queue in `background.js` to ensure atomic writes to `discoveredFeeds`. (Implemented via Web Locks API in src/storage.js)
- [x] Support for favicon high-resolution icons using the `favicon` permission. (Implemented via _favicon API with 64px/128px sizes and dynamic domain-colored placeholders)



