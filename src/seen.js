/**
 * Manages seen content URLs with a rolling window for filtering.
 * Uses in-memory caching to avoid redundant storage I/O and expensive iterations.
 */
export class SeenContentManager {
    constructor(defaultWindowDays = 7) {
        this.defaultWindowMs = defaultWindowDays * 24 * 60 * 60 * 1000;
        this.storageKey = 'seenUrls';
        this.settingsKey = 'seenSettings';
        this.cache = null; // In-memory cache for the current tab session
        this.saveTimeout = null; // Timer for debouncing writes

        // Synchronize cache across tabs when storage changes
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes[this.storageKey]) {
                this.cache = changes[this.storageKey].newValue;
            }
        });
    }

    /**
     * Gets the configured window in milliseconds.
     */
    async getWindowMs() {
        const result = await chrome.storage.local.get(this.settingsKey);
        const windowDays = result[this.settingsKey]?.windowDays || 7;
        return windowDays * 24 * 60 * 60 * 1000;
    }

    /**
     * Ensures the seen list is loaded into memory and pruned of expired entries.
     * Only performs the full iteration once per session.
     */
    async ensureLoaded() {
        if (this.cache) return this.cache;

        const windowMs = await this.getWindowMs();
        const result = await chrome.storage.local.get(this.storageKey);
        const seenMap = result[this.storageKey] || {};
        const now = Date.now();
        
        let changed = false;
        // Use for...in for memory efficiency on large objects
        for (const url in seenMap) {
            if (now - seenMap[url] >= windowMs) {
                delete seenMap[url];
                changed = true;
            }
        }

        if (changed) {
            // No await here; let it save in background to not block the main UI
            chrome.storage.local.set({ [this.storageKey]: seenMap });
        }

        this.cache = seenMap;
        return this.cache;
    }

    /**
     * Checks if a date string represents a date older than the rolling window.
     * @param {string} dateString - The date string to check.
     * @returns {Promise<boolean>} - True if the date is older than the window.
     */
    async isTooOld(dateString) {
        if (!dateString) return false;
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return false;

        const windowMs = await this.getWindowMs();
        return (Date.now() - date.getTime()) >= windowMs;
    }

    /**
     * Check if a target url has already been seen without marking it.
     **/
    async peek(targetUrl) {
        const seenMap = await this.ensureLoaded();
        return !!seenMap[targetUrl];
    }

    /**
     * Mark a URL as seen.
     **/
    async markSeen(targetUrl) {
        const seenMap = await this.ensureLoaded();
        if (seenMap[targetUrl]) return;

        seenMap[targetUrl] = Date.now();
        
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            chrome.storage.local.set({ [this.storageKey]: this.cache });
            this.saveTimeout = null;
        }, 500);
    }

    /**
     * Check if a target url has already been seen.
     * If it hasn't been seen, it marks it as seen and returns false.
     * If it has been seen, returns true.
     * Uses debouncing to batch multiple writes to storage.
     **/
    async hasSeen(targetUrl) {
        const seenMap = await this.ensureLoaded();

        if (seenMap[targetUrl]) {
            return true;
        }
        
        // Update in-memory cache immediately
        seenMap[targetUrl] = Date.now();
        
        // Debounce storage write (batching updates)
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            chrome.storage.local.set({ [this.storageKey]: this.cache });
            this.saveTimeout = null;
        }, 500);
        
        return false;
    }
}
