# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-29

### Added
- **Onboarding Flow:** Smooth setup process for new users, including permission requests and folder selection.
- **Empty States:** Beautifully designed placeholders for when no content is available.
- **Atomic Storage:** Implementation of a task queue/mutex for `discoveredFeeds` to prevent data loss.
- **Content Sanitization:** Rigorous sanitization of fetched content using DOMPurify.
- **Error Resilience:** Retry logic with exponential backoff for feed discovery.
- **Store Assets:** Completed all required screenshots, promotional tiles, and store descriptions.
- **Automated Testing:** Comprehensive unit tests for core modules (`utils`, `view`, `discovery`, `seen`, `storage`).
- **Telemetry:** Privacy-first anonymous error reporting.

### Changed
- **Performance Optimization:** Implemented skeleton loaders and memory pruning for the `feedPool` (max 500 items).
- **Favicon Handling:** Enhanced favicon caching with high-resolution support.
- **Code Structure:** Refactored `app.js` into modular View/Controller components.
- **Manifest V3 Compliance:** Minimized permissions (moved `<all_urls>` to optional) and secured CSP.

### Fixed
- Various accessibility (a11y) improvements, ensuring keyboard navigability and proper contrast.


## [1.0.8] - 2026-05-09

### Fixed
- **Telemetry:** Implemented session-aware tracking to resolve "zero active user" reporting in GA4.
- **Permissions:** Added explicit host permissions for Google Analytics to ensure reliable event delivery.
- **Diagnostics:** Enhanced discovery events with granular metadata to better diagnose user onboarding drop-off.

## [1.0.7] - 2026-05-08

### Changed
- Minor internal optimizations and dependency updates.

## [1.0.6] - 2026-05-06

### Added 
- **Analog Clock** added clock.js to display a clock on the newtab.html p age
