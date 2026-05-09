import { DiscoveryModule } from './discovery.js';
import { StorageManager } from './storage.js';
import { SubscriptionManager } from './subscription.js';
import { Telemetry } from './telemetry.js';
import { findFolderByName, flattenBookmarksWithIds as flattenBookmarks } from './utils.js';

const discovery = new DiscoveryModule();
const FREE_DOMAIN_LIMIT = 15;

let currentDiscoveryPromise = null;
let lastDiscoveryTime = 0;
const DISCOVERY_DEBOUNCE_MS = 1000 * 60 * 5; // 5 minutes

/**
 * Run discovery on bookmarks in the user-configured folder.
 */
async function discoverAllBookmarks(force = false) {
    const { onboardingComplete } = await chrome.storage.local.get({ onboardingComplete: false });
    if (!onboardingComplete && !force) {
        console.log("Discovery skipped: Onboarding not complete.");
        return { status: 'onboarding_pending' };
    }

    if (currentDiscoveryPromise) {
        console.log("Discovery already in progress, waiting for existing process...");
        return currentDiscoveryPromise;
    }

    if (!force && Date.now() - lastDiscoveryTime < DISCOVERY_DEBOUNCE_MS) {
        console.log("Discovery skipped: recently completed.");
        return { status: 'complete', cached: true };
    }

    currentDiscoveryPromise = (async () => {
        try {
            const isPro = await SubscriptionManager.isPro();
            const settings = await chrome.storage.local.get({ folderName: 'MyFeed', deepScan: false });
            const folderName = settings.folderName;
            const deepScanEnabled = isPro && settings.deepScan;

            console.log(`Starting '${folderName}' discovery (Pro: ${isPro}, DeepScan: ${deepScanEnabled}, Force: ${force})...`);
            Telemetry.debug(`Discovery started`, `folder: ${folderName}, pro: ${isPro}`);
            const tree = await chrome.bookmarks.getTree();
            let myFeedFolder = findFolderByName(tree, folderName);

            if (!myFeedFolder) {
                myFeedFolder = await chrome.bookmarks.create({ title: folderName });
                console.log(`No '${folderName}' folder found. Creating one.`);
                return { status: 'folder_empty', folderName };
            }

            let bookmarks = flattenBookmarks([myFeedFolder]);
            if (bookmarks.length === 0) {
                console.log(`Folder '${folderName}' is empty.`);
                return { status: 'folder_empty', folderName };
            }

            // Enforce free limit
            if (!isPro && bookmarks.length > FREE_DOMAIN_LIMIT) {
                console.log(`Free limit reached. Processing first ${FREE_DOMAIN_LIMIT} domains.`);
                bookmarks = bookmarks.slice(0, FREE_DOMAIN_LIMIT);
            }

            // 1. Load existing map once
            const results = await chrome.storage.local.get('discoveredFeeds');
            const feedMap = results.discoveredFeeds || {};
            let discoveryCount = 0;

            // 2. Parallelize the discovery process (Network intensive)
            const discoveryPromises = bookmarks.map(async (bm) => {
                if (!feedMap[bm.domain]) {
                    console.log(`Discovering for: ${bm.domain}`);
                    const result = await discovery.discover(bm.url, { deepScan: deepScanEnabled });
                    if (result && (result.feeds.length > 0 || result.sitemaps.length > 0)) {
                        return { domain: bm.domain, result };
                    }
                } else {
                    return { domain: bm.domain, existing: true };
                }
                return null;
            });

            const discoveryResults = await Promise.all(discoveryPromises);

            // 3. Apply all updates at once in a single atomic lock.
            await StorageManager.atomicUpdate(
                StorageManager.DISCOVERED_FEEDS_LOCK,
                'discoveredFeeds',
                (currentFeedMap) => {
                    const map = currentFeedMap || {};
                    let changed = false;
                    
                    discoveryResults.forEach(res => {
                        if (res && res.result) {
                            if (!map[res.domain]) {
                                map[res.domain] = res.result;
                                discoveryCount++;
                                changed = true;
                            }
                        } else if (res && res.existing) {
                            discoveryCount++;
                        }
                    });

                    return changed ? map : undefined;
                }
            );

            lastDiscoveryTime = Date.now();
            console.log(`'${folderName}' discovery complete. Found ${discoveryCount} feeds.`);
            Telemetry.logEvent('discovery_complete', { 
                count: discoveryCount,
                bookmarks: bookmarks.length,
                is_onboarding: force
            });
            Telemetry.debug(`Discovery complete`, `found: ${discoveryCount}`);
            return { status: 'complete', folderName, bookmarkCount: bookmarks.length, discoveryCount };
        } catch (error) {
            console.error("Discovery failed:", error);
            return { status: 'error', message: error.message };
        } finally {
            currentDiscoveryPromise = null;
        }
    })();

    return currentDiscoveryPromise;
}

/**
 * Onboard a new user by setting up the bookmark folder and triggering discovery.
 */
async function onboardUser(folderName) {
    try {
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
                { title: 'Colossal (Art & Culture)', url: 'https://www.thisiscolossal.com/' },
		{ title: 'Popular Science', url: 'https://popsci.com/'},
		{ title: 'Study Finds', url: 'https://studyfinds.com/'},
		{ title: 'Daily Caller', url: 'https://dailycaller.com/'},
		{ title: 'CBS News', url: 'https://cbsnews.com/'},
            ];

            for (const s of starters) {
                await chrome.bookmarks.create({ parentId: newFolder.id, title: s.title, url: s.url });
            }
        }

        // Trigger discovery after setup
        return await discoverAllBookmarks(true); // Force discovery on onboarding
    } catch (error) {
        console.error("Onboarding failed:", error);
        return { status: 'error', message: error.message };
    }
}

// 1. On Message (e.g., from onboarding)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'triggerDiscovery') {
        console.log("Discovery triggered via message.");
        discoverAllBookmarks(message.force || false).then((result) => {
            sendResponse(result);
        });
        return true; // Keep channel open for async response
    } else if (message.action === 'onboardUser') {
        console.log("Onboarding triggered via message.");
        onboardUser(message.folderName).then((result) => {
            sendResponse(result);
        });
        return true;
    }
});

// 2. On New Bookmark Added
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    handleBookmarkChange(bookmark.parentId, bookmark.url);
});

// 3. On Bookmark Removed
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    handleBookmarkRemoval(removeInfo.parentId);
});

// 4. On Bookmark Moved (e.g. into the feed folder)
chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
    try {
        const bookmark = await chrome.bookmarks.get(id);
        // Check both old and new parents
        await handleBookmarkRemoval(moveInfo.oldParentId);
        await handleBookmarkChange(moveInfo.parentId, bookmark[0].url);
    } catch (e) {
        console.error("Error processing bookmark move:", e);
    }
});

// 5. On Bookmark Changed (e.g. URL update)
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
    if (changeInfo.url) {
        try {
            const bookmark = await chrome.bookmarks.get(id);
            await handleBookmarkChange(bookmark[0].parentId, changeInfo.url);
        } catch (e) {
            console.error("Error processing bookmark change:", e);
        }
    }
});

/**
 * Shared logic for bookmark additions or updates.
 */
async function handleBookmarkChange(parentId, url) {
    if (currentDiscoveryPromise) {
        await currentDiscoveryPromise;
    }

    const settings = await chrome.storage.local.get({ folderName: 'MyFeed' });
    const folderName = settings.folderName;

    try {
        const parent = await chrome.bookmarks.get(parentId);
        if (!parent || parent[0].title !== folderName) return;

        console.log(`Bookmark change in '${folderName}' detected: ${url}`);
        if (url) {
            const domain = new URL(url).hostname;
            
            await StorageManager.atomicUpdate(
                StorageManager.DISCOVERED_FEEDS_LOCK,
                'discoveredFeeds',
                async (currentFeedMap) => {
                    const map = currentFeedMap || {};
                    if (map[domain]) return undefined;

                    const isPro = await SubscriptionManager.isPro();
                    const currentCount = Object.keys(map).length;

                    if (!isPro && currentCount >= FREE_DOMAIN_LIMIT) {
                        console.log(`Free limit of ${FREE_DOMAIN_LIMIT} domains reached.`);
                        return undefined;
                    }

                    console.log(`Starting discovery for new domain: ${domain}`);
                    const settings = await chrome.storage.local.get({ deepScan: false });
                    const result = await discovery.discover(url, { deepScan: isPro && settings.deepScan });
                    
                    if (result && (result.feeds.length > 0 || result.sitemaps.length > 0)) {
                        map[domain] = result;
                        return map;
                    }
                    return undefined;
                }
            );
        }
    } catch (e) {
        console.error("Error in handleBookmarkChange:", e);
    }
}

/**
 * Shared logic for bookmark removals or moves out of the folder.
 */
async function handleBookmarkRemoval(parentId) {
    const settings = await chrome.storage.local.get({ folderName: 'MyFeed' });
    const folderName = settings.folderName;

    try {
        const parent = await chrome.bookmarks.get(parentId);
        if (!parent || parent[0].title !== folderName) return;

        const tree = await chrome.bookmarks.getTree();
        const folder = findFolderByName(tree, folderName);
        if (!folder) return;

        const remainingBookmarks = flattenBookmarks([folder]);
        const domainsInFolder = new Set(remainingBookmarks.map(bm => bm.domain));

        await StorageManager.atomicUpdate(
            StorageManager.DISCOVERED_FEEDS_LOCK,
            'discoveredFeeds',
            (feedMap) => {
                const map = feedMap || {};
                let changed = false;
                for (const domain in map) {
                    if (!domainsInFolder.has(domain)) {
                        console.log(`Removing domain ${domain} from discovery map.`);
                        delete map[domain];
                        changed = true;
                    }
                }
                return changed ? map : undefined;
            }
        );
    } catch (e) {
        console.error("Error in handleBookmarkRemoval:", e);
    }
}

// Perform a background sync on startup or install to ensure consistency
chrome.runtime.onInstalled.addListener(() => {
    console.log("DeScroll installed/updated. Triggering initial discovery...");
    discoverAllBookmarks();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started. Triggering background discovery sync...");
    discoverAllBookmarks();
});

// Trigger discovery on service worker wake-up (if not recently run)
discoverAllBookmarks();

