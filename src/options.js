import { DiscoveryModule } from './discovery.js';
import { SubscriptionManager } from './subscription.js';
import { Telemetry } from './telemetry.js';
import { applyTheme } from './view.js';

// Default values
const DEFAULTS = {
    domainCount: 5,
    itemsPerDomain: 10,
    folderName: 'MyFeed',
    windowDays: 7,
    deepScan: false,
    enableTelemetry: true,
    theme: 'system'
};

/**
 * Loads and displays the diagnostic logs.
 */
async function loadLogs() {
    const display = document.getElementById('log-display');
    const result = await chrome.storage.local.get('diagnosticLogs');
    const logs = result.diagnosticLogs || [];

    if (logs.length === 0) {
        display.textContent = 'No logs recorded yet.';
        return;
    }

    display.innerHTML = logs.map(log => `
        <div class="log-entry">
            <span class="log-time">[${log.timestamp.split('T')[1].split('.')[0]}]</span>
            <span class="log-msg">${log.message}</span>
            ${log.data ? `<span class="log-data">(${log.data})</span>` : ''}
        </div>
    `).join('');
    
    // Auto-scroll to bottom
    display.scrollTop = display.scrollHeight;
}

/**
 * Clears the diagnostic logs.
 */
async function clearLogs() {
    await Telemetry.clearLogs();
    loadLogs();
}

// Listen for log updates
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.diagnosticLogs) {
        loadLogs();
    }
});

// Discovery Logic
const discovery = new DiscoveryModule();

async function runDiscovery() {
    const input = document.getElementById('urlInput');
    const output = document.getElementById('output');
    const url = input.value.trim();
    if (!url) return;

    output.innerHTML = 'Discovering... please wait.';
    try {
        const results = await discovery.discover(url);
        if (!results) throw new Error('Discovery failed');
        
        output.innerHTML = `
            <strong>Success!</strong><br>
            Feeds found: ${results.feeds.length}<br>
            Sitemaps found: ${results.sitemaps.length}
        `;
    } catch (e) {
        output.innerHTML = `<span style="color:red;">Error: ${e.message}</span>`;
    }
}

// Saves options to chrome.storage
async function saveOptions() {
    const domainCount = document.getElementById('domainCount').value;
    const itemsPerDomain = document.getElementById('itemsPerDomain').value;
    const folderNameInput = document.getElementById('folderName').value.trim();
    const windowDays = document.getElementById('windowDays').value;
    const deepScan = document.getElementById('deepScan').checked;
    const enableTelemetry = document.getElementById('enableTelemetry').checked;
    const theme = document.getElementById('theme').value;

    const currentSettings = await chrome.storage.local.get({ folderName: DEFAULTS.folderName });
    const newFolderName = folderNameInput || DEFAULTS.folderName;
    const folderChanged = currentSettings.folderName !== newFolderName;

    chrome.storage.local.set({
        domainCount: parseInt(domainCount, 10),
        itemsPerDomain: parseInt(itemsPerDomain, 5),
        folderName: newFolderName,
        deepScan: deepScan,
        enableTelemetry: enableTelemetry,
        theme: theme,
        seenSettings: {
            windowDays: parseInt(windowDays, 10) || DEFAULTS.windowDays
        }
    }, async () => {
        if (folderChanged) {
            console.log("Folder name changed, clearing discovered feeds and triggering discovery...");
            // Clear the discovered feeds and session feed pool to force a fresh start
            await chrome.storage.local.remove('discoveredFeeds');
            try {
                await chrome.storage.session.remove('feedPool');
            } catch (e) {
                // Session storage might not be available in all contexts, ignore
            }
            
            // Trigger discovery for the new folder, forcing it since settings changed
            chrome.runtime.sendMessage({ action: 'triggerDiscovery', force: true });
        }

        const status = document.getElementById('status');
        status.textContent = 'Settings saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
    chrome.storage.local.get({
        domainCount: DEFAULTS.domainCount,
        itemsPerDomain: DEFAULTS.itemsPerDomain,
        folderName: DEFAULTS.folderName,
        deepScan: DEFAULTS.deepScan,
        enableTelemetry: DEFAULTS.enableTelemetry,
        theme: DEFAULTS.theme,
        seenSettings: { windowDays: DEFAULTS.windowDays }
    }, (items) => {
        document.getElementById('domainCount').value = items.domainCount;
        document.getElementById('itemsPerDomain').value = items.itemsPerDomain;
        document.getElementById('folderName').value = items.folderName;
        document.getElementById('windowDays').value = items.seenSettings.windowDays;
        document.getElementById('deepScan').checked = items.deepScan;
        document.getElementById('enableTelemetry').checked = items.enableTelemetry;
        document.getElementById('theme').value = items.theme;
        
        // Set support link
        const supportLink = document.getElementById('supportLink');
        if (supportLink) {
            supportLink.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/support`;
        }

        applyTheme(items.theme);
        initSubscriptionUI();
        loadLogs();
    });
}

async function initSubscriptionUI() {
    const isPro = await SubscriptionManager.isPro();
    const deepScanInput = document.getElementById('deepScan');

    if (isPro) {
        // For the free release, keep Deep Scan active
        deepScanInput.disabled = false;
    }
}

async function exportToOpml() {
    const isPro = await SubscriptionManager.isPro();
    if (!isPro) {
        alert("OPML Export is a Pro feature. Please upgrade to use it.");
        return;
    }

    const data = await chrome.storage.local.get('discoveredFeeds');
    const feeds = data.discoveredFeeds || {};
    
    let opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>DeScroll Discovered Feeds</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="DeScroll Feeds" title="DeScroll Feeds">`;

    for (const domain in feeds) {
        const result = feeds[domain];
        if (result.feeds && result.feeds.length > 0) {
            const feed = result.feeds[0]; // Export the first discovered feed for each domain
            opml += `
      <outline type="rss" text="${domain}" title="${domain}" xmlUrl="${feed.url}" htmlUrl="${result.baseUrl}"/>`;
        }
    }

    opml += `
    </outline>
  </body>
</opml>`;

    const blob = new Blob([opml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'descroll-feeds.opml';
    a.click();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('testBtn').addEventListener('click', runDiscovery);
document.getElementById('upgradeBtn').addEventListener('click', () => SubscriptionManager.openPaymentPage());
document.getElementById('manageBtn').addEventListener('click', () => SubscriptionManager.openLoginPage());
document.getElementById('exportOpml').addEventListener('click', exportToOpml);
document.getElementById('theme').addEventListener('change', (e) => applyTheme(e.target.value));
document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
