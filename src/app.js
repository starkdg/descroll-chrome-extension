import { DiscoveryModule } from './discovery.js';
import { SeenContentManager } from './seen.js';
import { StorageManager } from './storage.js';
import { SubscriptionManager } from './subscription.js';
import { FeedView } from './view.js';
import { shuffleArray, findFolderByName, flattenBookmarksWithIds } from './utils.js';
import { Telemetry } from './telemetry.js';

const FREE_DOMAIN_LIMIT = 15;

class DeScrollApp {
    constructor() {
        this.view = new FeedView();
        this.discovery = new DiscoveryModule();
        this.seenManager = new SeenContentManager();
        this.allItems = [];
        this.currentIndex = 0;
        this.BATCH_SIZE = 5;
        this.isFetching = false;
        this.isCaughtUp = false;
        this.setupListeners();
    }

    setupListeners() {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName === 'local') {
                if (changes.folderName) {
                    console.log("Folder name changed, resetting feed state...");
                    await this.refreshFeed();
                }
                if (changes.theme) {
                    this.applyTheme(changes.theme.newValue);
                }
            }
        });
    }

    applyTheme(theme) {
        if (theme === 'light' || theme === 'dark') {
            document.documentElement.setAttribute('data-theme', theme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    async refreshFeed() {
        this.allItems = [];
        this.currentIndex = 0;
        this.isCaughtUp = false;
        this.view.prepareFeed();

        // Trigger discovery and wait for it to complete for the new folder
        const discoveryResult = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'triggerDiscovery' }, resolve);
        });

        await this.loadFeed();
        this.initializeDisplay(discoveryResult);
    }

    async init() {
        console.log("Initializing DeScroll...");
        this.view.setFavicon();
        
        const local = await chrome.storage.local.get({ 
            onboardingComplete: false,
            theme: 'system'
        });

        this.applyTheme(local.theme);
        
        if (!local.onboardingComplete) {
            this.view.showOnboarding(this.handleStartOnboarding.bind(this));
            return;
        }

        this.view.prepareFeed();

        const discoveryResult = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'triggerDiscovery' }, resolve);
        });

        await this.loadFeed();
        this.initializeDisplay(discoveryResult);
    }

    async handleStartOnboarding(folderName) {
        const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
        if (!granted) {
            alert("DeScroll needs permission to find feeds on your bookmarked sites to work correctly.");
            return false;
        }

        await chrome.storage.local.set({ folderName: folderName });
        const isCustom = folderName !== 'MyFeed';
        Telemetry.logEvent('onboarding_start', { is_custom: isCustom });

        // Check if folder exists, if not, create it with starter bookmarks
        const tree = await chrome.bookmarks.getTree();
        const existingFolder = findFolderByName(tree, folderName);

        if (!existingFolder) {
            console.log(`Folder "${folderName}" not found. Creating it with starter content...`);
            const newFolder = await chrome.bookmarks.create({ title: folderName });
            
            // Add some high-quality starter bookmarks to the new folder
            const starters = [
                { title: 'The Verge', url: 'https://www.theverge.com/' },
                { title: 'Ars Technica', url: 'https://arstechnica.com/' },
		{ title: 'Tech Crunch' , url: 'https://techcrunch.com/'},
            ];

            for (const s of starters) {
                await chrome.bookmarks.create({ parentId: newFolder.id, title: s.title, url: s.url });
            }
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'triggerDiscovery' }, async (response) => {
                await chrome.storage.local.set({ onboardingComplete: true });
                this.view.hideOnboarding();
                await this.loadFeed();
                this.initializeDisplay(response);
                resolve(true);
            });
        });
    }

    async initializeDisplay(discoveryResult) {
        if (discoveryResult && discoveryResult.status && discoveryResult.status !== 'complete') {
            this.view.showEmptyState(discoveryResult);
            return;
        }

        if (this.allItems.length > 0) {
            this.renderFullFeed();
            return;
        }

        if (discoveryResult && discoveryResult.discoveryCount === 0) {
            this.view.showEmptyState(discoveryResult);
        } else {
            this.view.showEmptyState({ status: 'caught_up' });
        }
    }

    renderFullFeed() {
        this.view.prepareFeed(); // Reset container and show skeletons
        
        setTimeout(() => {
            this.view.clearSkeletons();
            this.currentIndex = 0;
            this.renderBatch();
            this.view.setupInfiniteScroll(this.handleInfiniteScroll.bind(this));
        }, 400);
    }

    renderBatch() {
        const batch = this.allItems.slice(this.currentIndex, this.currentIndex + this.BATCH_SIZE);
        
        this.view.appendBatch(batch, {
            onMarkSeen: (url) => this.seenManager.markSeen(url),
            onRemove: (item) => {
                // Potential to sync with allItems if needed
            },
            onDeleteBookmark: (item) => this.handleDeleteBookmark(item)
        });
        
        this.currentIndex += this.BATCH_SIZE;
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

            const session = await chrome.storage.session.get('feedPool');
            const filteredPool = (session.feedPool || []).filter(p => p.domain !== item.domain);
            await chrome.storage.session.set({ feedPool: filteredPool });
            
            this.allItems = this.allItems.filter(p => p.domain !== item.domain);

        } catch (error) {
            console.error("Failed to delete bookmark:", error);
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
            this.view.showSentinelError("Error loading fresh content.");
        } finally {
            this.isFetching = false;
        }
    }

    async loadFeed() {
        const discoveredContent = await this.fetchDiscoveryContent();
        this.allItems = [...discoveredContent];
    }

    async fetchDiscoveryContent() {
        try {
            const session = await chrome.storage.session.get('feedPool');
            if (session.feedPool && session.feedPool.length > 0) {
                return session.feedPool;
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

        // Apply Pro limits to capacity
        let domains = allDomains;
        if (!isPro && domains.length > FREE_DOMAIN_LIMIT) {
            domains = domains.slice(0, FREE_DOMAIN_LIMIT);
        }

        const domainCap = !isPro ? Math.min(local.domainCount, FREE_DOMAIN_LIMIT) : local.domainCount;
        const randomDomains = shuffleArray(domains).slice(0, domainCap);
        const currentUrls = new Set(this.allItems.map(item => item.url));

        const fetchPromises = randomDomains.map(async (domain) => {
            try {
                let content = await this.discovery.getRecentContent(local.discoveredFeeds[domain], this.seenManager, local.itemsPerDomain);
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
            
            // Resource Optimization: Prune feedPool to monitor memory usage
            // When it grows to 500 items, trim the first 100 off to keep it lean.
            const MAX_POOL_SIZE = 500;
            const TRIM_AMOUNT = 100;
            
            if (updatedPool.length > MAX_POOL_SIZE) {
                console.log(`Pruning feedPool: ${updatedPool.length} items. Trimming oldest ${TRIM_AMOUNT}.`);
                updatedPool = updatedPool.slice(TRIM_AMOUNT);
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
