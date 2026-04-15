# DeScroll Roadmap

## 1. User Experience & Onboarding (Highest Priority)
- [x] Create an Onboarding Flow
- [x] Design "Empty States"
- [x] Smooth Loading States: Replace the "Looking for more items..." text with skeleton loaders or more elegant animations.
- [x] Accessibility (a11y) Audit: Ensure all cards are navigable via keyboard, have contrast, and proper aria-labels.


## 2. Technical Robustness & Performance
- [x] Atomic Storage Updates: Implement a task queue/mutex for `discoveredFeeds`.
- [x] Content Sanitization: Rigorously sanitize fetched titles/descriptions using DOMPurify.
- [x] Resource Optimization: Prune `feedPool` memory (MAX 500 items). Caching favicons is complete. Caching article images is a future enhancement.
- [x] Error Resilience: Add retry logic with exponential backoff for feed discovery.

## 3. Chrome Web Store Compliance
- [x] Permission Minimization: Move `<all_urls>` to optional permissions.
- [x] Manifest V3 Best Practices: Ensure no remote code execution and secure CSP.
- [ ] Store Assets: Create screenshots, promotional tiles, and a compelling description.

## 4. Maintainability & Engineering Standards
- [x] Automated Testing: Comprehensive unit tests for all core modules (`utils`, `view`, `discovery`, `seen`, `storage`).
- [x] Code Modularization: Refactor `app.js` into modular View/Controller components.
- [ ] CI/CD Pipeline: Set up GitHub Actions for linting, testing, and building.
- [x] Logging & Telemetry: Privacy-first anonymous error reporting.

## 5. Product Features (Nice-to-Haves)
- [ ] "Focus Mode" Enhancements: Add work timers or scroll limits.
- [ ] Search & Filter: Filter feed by domain or keywords.
- [ ] Export/Import Settings: Backup discovered feeds and "seen" history.
