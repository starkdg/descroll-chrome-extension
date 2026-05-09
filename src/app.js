import { DiscoveryModule } from './discovery.js';
import { SeenContentManager } from './seen.js';
import { StorageManager } from './storage.js';
import { SubscriptionManager } from './subscription.js';
import { FeedView, applyTheme } from './view.js';
import { shuffleArray, findFolderByName, flattenBookmarksWithIds } from './utils.js';
import { Telemetry } from './telemetry.js';
import { AnalogClock } from './clock.js';

const FREE_DOMAIN_LIMIT = 15;

class DeScrollApp {
    constructor() {
        this.view = new FeedView();
        this.discovery = new DiscoveryModule();
        this.seenManager = new SeenContentManager();
        this.clock = new AnalogClock();
        this.allItems = [];
        this.currentIndex = 0;
        this.BATCH_SIZE = 5;
        this.isFetching = false;
        this.isCaughtUp = false;
        this.refreshingPromise = null;
        this.showWelcomeHint = false;
        this.batchCount = 0;
        //this.setupListeners();
    }

    setupListeners() {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName === 'local') {
                if (changes.folderName) {
                    console.log("Folder name changed, resetting feed state...");
                    Telemetry.debug('Folder name changed', changes.folderName.newValue);
		    await this.refreshFeed();
                }
                if (changes.theme) {
                    applyTheme(changes.theme.newValue);
                }
            }
            if (areaName === 'session' && changes.feedPool) {
                const oldPool = changes.feedPool.oldValue || [];
                const newPool = changes.feedPool.newValue || [];
                this.allItems = [...newPool];
                if (newPool.length < oldPool.length) {
                    const newUrls = new Set(newPool.map(i => i.url));
                    const removedDomains = new Set(
                        oldPool.filter(i => !newUrls.has(i.url)).map(i => i.domain)
                    );

                    removedDomains.forEach(domain => {
                        this.view.removeCardsByDomain(domain);
                    });
                }
            }
        });
    }

    async loadFeed(ignoreCache = false) {
        this.allItems = await this.fetchDiscoveryContent(ignoreCache);
    }

    async refreshFeed(ignoreCache = true) {
        if (this.refreshingPromise) {
            console.log("Refresh already in progress, waiting...");
            return this.refreshingPromise;
        }

        this.refreshingPromise = (async () => {
            try {
                console.log(`Starting feed refresh (ignoreCache: ${ignoreCache})...`);
                this.allItems = [];
                this.currentIndex = 0;
                this.batchCount = 0;
                this.isCaughtUp = false;
                this.view.prepareFeed(this.BATCH_SIZE);

                await this.loadFeed(ignoreCache);
                this.initializeDisplay();
            } finally {
                this.refreshingPromise = null;
            }
        })();

        return this.refreshingPromise;
    }

    async init() {
        const startTime = performance.now();
        console.log("Initializing DeScroll...");
        this.view.setFavicon();

        // Set feedback link
        const feedbackLink = document.getElementById('feedback-link');
        if (feedbackLink) {
            feedbackLink.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/support`;
        }
        
        const local = await chrome.storage.local.get({ 
            onboardingComplete: false,
            theme: 'system'
        });

        applyTheme(local.theme);
        
        if (!local.onboardingComplete) {
            await new Promise(resolve => {
                this.view.showOnboarding(async (folderName) => {
                    const result = await this.handleStartOnboarding(folderName);
                    if (result) {
                        this.showWelcomeHint = true;
                        resolve(result);
                        return true;
                    }
                    return false;
                });
            });

            await chrome.storage.local.set({ onboardingComplete: true });
        }

	// setup listeners once onboarding is complete to avoid listener for
	// folderName changes unnecessarily triggering discovery process
	// along with onboarding
	this.setupListeners();
	
        Telemetry.logEvent('feed_init');
        
        const isRefresh = performance.getEntriesByType('navigation')[0]?.type === 'reload';

        if (isRefresh) {
            console.log("DeScroll: Page refresh detected, forcing new content.");
            await this.refreshFeed(true);
        } else {
            // Restore shared session pool if it exists
            await this.loadFeed(false);
            
            if (this.allItems.length > 0) {
                console.log("DeScroll: Restoring shared session feed.");
                this.renderFullFeed();
            } else {
                // First run or cache expired
                await this.refreshFeed();
            }
        }

        const loadTime = Math.round(performance.now() - startTime);
        Telemetry.logEvent('page_load_performance', { 
            load_time_ms: loadTime,
            item_count: this.allItems.length,
            is_refresh: isRefresh
        });
    }

    async handleStartOnboarding(folderName) {
        const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
        if (!granted) {
            this.view.showOnboardingError("DeScroll needs permission to find feeds on your bookmarked sites to work correctly.");
            return null;
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'onboardUser', folderName: folderName }, async (response) => {
                if (response && response.status === 'error') {
                    this.view.showOnboardingError(`Onboarding failed: ${response.message}`);
                    resolve(null);
                    return;
                }

                Telemetry.logEvent('onboarding_complete', { folder: folderName });
                
                this.view.hideOnboarding();
                resolve(response);
            });
        });
    }

    async initializeDisplay(discoveryResult) {
        if (this.allItems.length > 0) {
            console.log(`initializeDisplay: Rendering ${this.allItems.length} items.`);
            this.renderFullFeed(true);
            return;
        }

        if (discoveryResult && discoveryResult.status && discoveryResult.status !== 'complete') {
            this.view.showEmptyState(discoveryResult);
            return;
        }

        if (!discoveryResult) {
            const settings = await chrome.storage.local.get({ folderName: 'MyFeed', discoveredFeeds: {} });
            const tree = await chrome.bookmarks.getTree();
            const folder = findFolderByName(tree, settings.folderName);
            
            if (!folder) {
                this.view.showEmptyState({ status: 'folder_not_found', folderName: settings.folderName });
                return;
            }

            const bookmarks = flattenBookmarksWithIds([folder]);
            if (bookmarks.length === 0) {
                this.view.showEmptyState({ status: 'folder_empty', folderName: settings.folderName });
                return;
            }

            const discoveryCount = Object.keys(settings.discoveredFeeds || {}).length;
            if (discoveryCount === 0) {
                this.view.prepareFeed(this.BATCH_SIZE);
                return;
            }
        }

        if (discoveryResult && discoveryResult.discoveryCount === 0) {
            this.view.showEmptyState(discoveryResult);
        } else {
            this.view.showEmptyState({ status: 'caught_up' });
        }
    }

    renderFullFeed(alreadyPrepared = false) {
        if (!alreadyPrepared) {
            this.view.prepareFeed(this.BATCH_SIZE);
        } else {
            if (this.view.container) this.view.container.innerHTML = '';
        }
        
        setTimeout(() => {
            this.view.clearSkeletons();
            
            if (this.showWelcomeHint) {
                this.view.showFeedHint("<strong>Welcome!</strong> Your feed is being built from your bookmarks. You can change your feed folder anytime in the <strong>Settings</strong>.");
                this.showWelcomeHint = false;
            }

            this.currentIndex = 0;
            this.renderBatch();
            this.view.setupInfiniteScroll(this.handleInfiniteScroll.bind(this));
        }, 400);
    }

    renderBatch() {
        const batch = this.allItems.slice(this.currentIndex, this.currentIndex + this.BATCH_SIZE);
        
        this.view.appendBatch(batch, {
            onMarkSeen: (url) => this.seenManager.markSeen(url),
            onClick: (item) => {
                Telemetry.logEvent('item_clicked', { 
                    domain: item.domain, 
                    type: item.type 
                });
            },
            onRemove: (item) => {
                this.seenManager.markSeen(item.url);
                Telemetry.logEvent('item_removed', { domain: item.domain });
            },
            onDeleteBookmark: (item) => this.handleDeleteBookmark(item)
        });
        
        this.currentIndex += this.BATCH_SIZE;
        this.batchCount++;
        Telemetry.logEvent('batch_loaded', { 
            batch_index: this.batchCount,
            item_count: batch.length
        });
        this.view.updateSentinel(this.currentIndex < this.allItems.length);
    }

    async handleDeleteBookmark(item) {
        const confirmed = confirm(`Are you sure you want to delete the bookmark for ${item.domain}?`);
        if (!confirmed) return;

        try {
            const settings = await chrome.storage.local.get({ folderName: 'MyFeed' });
            const tree = await chrome.bookmarks.getTree();
            const targetFolder = findFolderByName(tree, settings.folderName);
            
            if (targetFolder) {
                const bookmarks = flattenBookmarksWithIds([targetFolder]);
                const toDelete = bookmarks.filter(bm => bm.domain === item.domain);
                for (const bm of toDelete) {
                    await chrome.bookmarks.remove(bm.id);
                }
            }

            await StorageManager.atomicUpdate(
                StorageManager.DISCOVERED_FEEDS_LOCK,
                'discoveredFeeds',
                (feedMap) => {
                    if (feedMap && feedMap[item.domain]) {
                        delete feedMap[item.domain];
                        return feedMap;
                    }
                    return undefined;
                }
            );

            this.view.removeCardsByDomain(item.domain);
            Telemetry.logEvent('bookmark_deleted', { domain: item.domain });

            const session = await chrome.storage.session.get('feedPool');
            const filteredPool = (session.feedPool || []).filter(p => p.domain !== item.domain);
            await chrome.storage.session.set({ feedPool: filteredPool });
            
            this.allItems = this.allItems.filter(p => p.domain !== item.domain);

        } catch (error) {
            console.error("Failed to delete bookmark:", error);
            Telemetry.debug('Bookmark deletion failed', error.message);
            alert("Error deleting bookmark.");
        }
    }

    async handleInfiniteScroll() {
        if (this.isFetching || this.isCaughtUp) return;

        if (this.currentIndex < this.allItems.length) {
            this.renderBatch();
            return;
        }

        this.isFetching = true;
        try {
            const session = await chrome.storage.session.get('feedPool');
            const sessionPool = session.feedPool || [];

            // If shared pool has more items, use them first
            if (this.allItems.length < sessionPool.length) {
                this.allItems = [...sessionPool];
                this.renderBatch();
                this.isFetching = false;
                return;
            }

            this.view.renderSkeletons(2);
            const newContent = await this.refillFeedPool();
            this.view.clearSkeletons();

            if (newContent.length > 0) {
                this.allItems.push(...newContent);
                this.renderBatch();
            } else {
                this.isCaughtUp = true;
                this.view.updateSentinel(false);
            }
        } catch (err) {
            console.error("Infinite scroll failed:", err);
            Telemetry.debug('Infinite scroll error', err.message);
            this.view.showSentinelError("Error loading fresh content.");
        } finally {
            this.isFetching = false;
        }
    }

    async fetchDiscoveryContent(ignoreCache = false) {
        try {
            if (!ignoreCache) {
                const session = await chrome.storage.session.get('feedPool');
                // Use the pool if it has content to ensure strict replication
                if (session.feedPool && session.feedPool.length > 0) {
                    return session.feedPool;
                }
            } else {
                await chrome.storage.session.remove('feedPool');
            }
        } catch (e) {
            console.warn("Session storage access failed.");
        }
        return await this.refillFeedPool();
    }

    async refillFeedPool() {
        const isPro = await SubscriptionManager.isPro();
        const local = await chrome.storage.local.get({
            discoveredFeeds: {},
            domainCount: 40,
            itemsPerDomain: 10
        });

        const allDomains = Object.keys(local.discoveredFeeds || {});
        if (allDomains.length === 0) return [];

        let domains = allDomains;
        if (!isPro && domains.length > FREE_DOMAIN_LIMIT) {
            domains = domains.slice(0, FREE_DOMAIN_LIMIT);
        }

        const domainCap = !isPro ? Math.min(local.domainCount, FREE_DOMAIN_LIMIT) : local.domainCount;
        const randomDomains = shuffleArray(domains).slice(0, domainCap);
        const currentUrls = new Set(this.allItems.map(item => item.url));

        const fetchPromises = randomDomains.map(async (domain) => {
            try {
                // seenManager is used here to filter out what has already been seen
                let content = await this.discovery.getRecentContent(
		    local.discoveredFeeds[domain],
		    this.seenManager, local.itemsPerDomain);
                if (content && content.length > 0) {
                    content = content.filter(item => !currentUrls.has(item.url));
                    return content.slice(0, local.itemsPerDomain).map(item => ({
                        ...item,
                        domain,
                        faviconData: local.discoveredFeeds[domain]?.faviconData || '',
                        type: 'discovery'
                    }));
                }
            } catch (error) {
                console.error(`Error fetching for ${domain}:`, error);
            }
            return [];
        });

        const results = await Promise.all(fetchPromises);
        const newItems = results.flat();

        if (newItems.length === 0) return [];

        const shuffled = shuffleArray(newItems);
        
        try {
            const session = await chrome.storage.session.get('feedPool');
            let updatedPool = [...(session.feedPool || []), ...shuffled];
            const MAX_POOL_SIZE = 500;
            if (updatedPool.length > MAX_POOL_SIZE) {
                updatedPool = updatedPool.slice(updatedPool.length - 100);
            }
            await chrome.storage.session.set({ feedPool: updatedPool });
        } catch (e) {
            console.error("Failed to update session pool:", e);
        }

        return shuffled;
    }
}

// Start the app
const app = new DeScrollApp();
app.init();
