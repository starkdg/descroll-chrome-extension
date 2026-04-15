import { DiscoveryModule } from './discovery.js';
import { StorageManager } from './storage.js';
import { SubscriptionManager } from './subscription.js';
import { Telemetry } from './telemetry.js';

const discovery = new DiscoveryModule();
const FREE_DOMAIN_LIMIT = 15;

let currentDiscoveryPromise = null;

/**
 * Run discovery on bookmarks in the user-configured folder.
 */
async function discoverAllBookmarks() {
    if (currentDiscoveryPromise) {
        console.log("Discovery already in progress, waiting for existing process...");
        return currentDiscoveryPromise;
    }

    currentDiscoveryPromise = (async () => {
        try {
            const isPro = await SubscriptionManager.isPro();
            const settings = await chrome.storage.local.get({ folderName: 'MyFeed', deepScan: false });
            const folderName = settings.folderName;
            const deepScanEnabled = isPro && settings.deepScan;

            console.log(`Starting '${folderName}' discovery (Pro: ${isPro}, DeepScan: ${deepScanEnabled})...`);
            Telemetry.debug(`Discovery started`, `folder: ${folderName}, pro: ${isPro}`);
            const tree = await chrome.bookmarks.getTree();
            const myFeedFolder = findFolderByName(tree, folderName);

            if (!myFeedFolder) {
                console.log(`No '${folderName}' folder found.`);
                return { status: 'folder_not_found', folderName };
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

            // 3. Apply all updates at once in a single atomic lock
            await StorageManager.atomicUpdate(
                StorageManager.DISCOVERED_FEEDS_LOCK,
                'discoveredFeeds',
                (currentFeedMap) => {
                    const map = currentFeedMap || {};
                    discoveryResults.forEach(res => {
                        if (res) {
                            if (res.result) {
                                map[res.domain] = res.result;
                                discoveryCount++;
                            } else if (res.existing) {
                                discoveryCount++;
                            }
                        }
                    });
                    return map;
                }
            );

            console.log(`'${folderName}' discovery complete. Found ${discoveryCount} feeds.`);
            Telemetry.logEvent('discovery_complete', { count: discoveryCount });
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

function findFolderByName(nodes, name) {
    for (const node of nodes) {
        if (node.title === name && !node.url) return node;
        if (node.children) {
            const found = findFolderByName(node.children, name);
            if (found) return found;
        }
    }
    return null;
}

function flattenBookmarks(nodes, list = []) {
    for (const node of nodes) {
        if (node.url) {
            try {
                const url = new URL(node.url);
                if (url.protocol.startsWith('http')) {
                    list.push({
                        url: node.url,
                        domain: url.hostname
                    });
                }
            } catch (e) {}
        }
        if (node.children) flattenBookmarks(node.children, list);
    }
    return list;
}

// 1. On Message (e.g., from onboarding)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'triggerDiscovery') {
        console.log("Discovery triggered via message.");
        discoverAllBookmarks().then((result) => {
            sendResponse(result);
        });
        return true; // Keep channel open for async response
    }
});

// 2. On New Bookmark Added
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    // Get the configured folder name
    const settings = await chrome.storage.local.get({ folderName: 'MyFeed' });
    const folderName = settings.folderName;

    // Check if the bookmark is in the configured folder
    const parent = await chrome.bookmarks.get(bookmark.parentId);
    if (!parent || parent[0].title !== folderName) {
        console.log(`Bookmark added, but not in '${folderName}' folder. Skipping discovery.`);
        return;
    }

    console.log(`New '${folderName}' bookmark detected: ${bookmark.url}`);
    if (bookmark.url) {
        try {
            const domain = new URL(bookmark.url).hostname;
            const res = await chrome.storage.local.get('discoveredFeeds');
            const currentFeedMap = res.discoveredFeeds || {};

            if (!currentFeedMap[domain]) {
                const isPro = await SubscriptionManager.isPro();
                const currentCount = Object.keys(currentFeedMap).length;

                if (!isPro && currentCount >= FREE_DOMAIN_LIMIT) {
                    console.log(`Free limit of ${FREE_DOMAIN_LIMIT} domains reached. Skipping discovery for ${domain}.`);
                    return;
                }

                console.log(`Starting discovery for new domain: ${domain} (Pro: ${isPro})`);
                Telemetry.debug(`New domain discovery`, `domain: ${domain}`);
                const settings = await chrome.storage.local.get({ deepScan: false });
                const result = await discovery.discover(bookmark.url, { deepScan: isPro && settings.deepScan });
                if (result && (result.feeds.length > 0 || result.sitemaps.length > 0)) {
                    console.log(`Successfully discovered ${result.feeds.length} feeds for ${domain}`);
                    
                    await StorageManager.atomicUpdate(
                        StorageManager.DISCOVERED_FEEDS_LOCK,
                        'discoveredFeeds',
                        (feedMap) => {
                            const map = feedMap || {};
                            map[domain] = result;
                            return map;
                        }
                    );
                } else {
                    console.log(`No feeds found for new domain: ${domain}`);
                }
            } else {
                console.log(`Domain ${domain} already exists in discovery map.`);
            }
        } catch (e) {
            console.error("Error processing new bookmark:", e);
        }
    }
});
