import { SeenContentManager } from './seen.js';
import DOMPurify from 'dompurify';
import { Telemetry } from './telemetry.js';

/**
 * Discovery Module - Logic for finding feeds and sitemaps from a base URL.
 */

export class DiscoveryModule {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Sanitizes a string for safe display, removing all HTML tags.
     */
    sanitizeText(text) {
        if (!text) return '';
        const clean = this.stripCdata(text);
        // DOMPurify.sanitize with ALLOWED_TAGS: [] effectively strips all HTML tags
        return DOMPurify.sanitize(clean, { ALLOWED_TAGS: [] }).trim();
    }

    /**
     * Sanitizes a URL, ensuring it starts with http or https.
     */
    sanitizeUrl(url) {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? url : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * Main discovery function.
     * @param {string} url - The bookmark URL to analyze.
     * @param {Object} options - Discovery options.
     * @param {boolean} options.deepScan - Whether to crawl sub-pages for feeds.
     * @returns {Promise<Object>} - An object containing discovered feeds, sitemaps, and metadata.
     */
    async discover(url, options = { deepScan: false }) {
        try {
            const baseUrl = new URL(url).origin;
            if (this.cache.has(baseUrl)) return this.cache.get(baseUrl);

            Telemetry.logEvent('discovery_started');

            const results = {
                baseUrl,
                faviconData: '',
                feeds: [],
                sitemaps: [],
                metadata: {
                    title: '',
                    description: ''
                }
            };

            // 0. Fetch Favicon (Bake-in cache)
            results.faviconData = await this.fetchFaviconAsBase64(baseUrl);

            // 1. Fetch the base URL to check for <link> tags and metadata
            const htmlContent = await this.fetchWithTimeout(baseUrl);
            if (htmlContent) {
                results.metadata.title = this.extractTagContent(htmlContent, 'title');
                results.metadata.description = this.extractMetaContent(htmlContent, 'description');
                
                // Find <link> feeds
                results.feeds = this.extractFeedsFromHtmlContent(htmlContent, baseUrl);
            }

            // 2. Try common feed paths if none found in HTML
            if (results.feeds.length === 0) {
                const commonFeeds = await this.probeCommonFeedPaths(baseUrl);
                results.feeds.push(...commonFeeds);
            }

            // 3. Deep Scan: If enabled and still no feeds found, try common sub-paths
            if (results.feeds.length === 0 && options.deepScan) {
                console.log(`Deep Scan enabled for: ${baseUrl}`);
                const subPaths = ['/blog', '/news', '/posts', '/updates', '/rss-feed'];
                const subPathPromises = subPaths.map(async (path) => {
                    const subUrl = `${baseUrl}${path}`;
                    const content = await this.fetchWithTimeout(subUrl);
                    if (content) {
                        return this.extractFeedsFromHtmlContent(content, subUrl);
                    }
                    return [];
                });
                const subPathFeeds = await Promise.all(subPathPromises);
                results.feeds.push(...subPathFeeds.flat());
            }

            // 4. ONLY search for sitemaps if NO feeds were found anywhere
            if (results.feeds.length === 0) {
                // Try to find sitemap from robots.txt
                const robotsTxt = await this.fetchWithTimeout(`${baseUrl}/robots.txt`);
                if (robotsTxt) {
                    results.sitemaps.push(...this.extractSitemapsFromRobots(robotsTxt));
                }

                // Try common sitemap paths if none found in robots.txt
                if (results.sitemaps.length === 0) {
                    const commonSitemaps = await this.probeCommonSitemapPaths(baseUrl);
                    results.sitemaps.push(...commonSitemaps);
                }
            }

            this.cache.set(baseUrl, results);
            
            Telemetry.logEvent('discovery_completed', {
                feeds_found: results.feeds.length,
                sitemaps_found: results.sitemaps.length
            });

            return results;
        } catch (error) {
            console.error(`Discovery failed for ${url}:`, error);
            Telemetry.logEvent('discovery_failed', { error: error.message });
            return null;
        }
    }

    /**
     * Extracts content from a specific HTML tag using Regex (Service Worker safe).
     */
    extractTagContent(html, tag) {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Extracts content from a meta tag with a specific name (Service Worker safe).
     */
    extractMetaContent(html, name) {
        const regex = new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Extracts feed links from HTML content using Regex (Service Worker safe).
     */
    extractFeedsFromHtmlContent(html, baseUrl) {
        const feeds = [];
        const regex = /<link[^>]*rel=["']alternate["'][^>]*type=["'](application\/(rss\+xml|atom\+xml|feed\+json))["'][^>]*href=["']([^"']*)["'][^>]*>/gi;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const type = match[1];
            const href = match[3];
            const titleMatch = match[0].match(/title=["']([^"']*)["']/i);
            
            feeds.push({
                url: this.resolveUrl(href, baseUrl),
                type: type,
                title: titleMatch ? titleMatch[1] : 'RSS Feed'
            });
        }
        return feeds;
    }

    /**
     * Fetches and parses the most "active" content from discovered sources.
     * @param {Object} discoveryResults - The object returned by discover().
     * @param {Object} seenManager - Optional SeenContentManager to check new content against already seen content
     * @param {number} limit - Maximum number of new items to find
     * @returns {Promise<Array>} - A list of content items {title, url, date}.
     */
    async getRecentContent(discoveryResults, seenManager, limit = 10) {
        // Priority 1: RSS/Atom Feeds
        if (discoveryResults.feeds.length > 0) {
            for (const feed of discoveryResults.feeds) {
                const items = await this.parseFeed(feed.url);
                if (items && items.length > 0) {
                    if (!seenManager) return items.slice(0, limit);

                    const notSeenItems = [];
                    for (const item of items) {
                        const isSeen = await seenManager.peek(item.url);
                        const isOld = await seenManager.isTooOld(item.date);
                        
                        if (!isSeen && !isOld) {
                            notSeenItems.push(item);
                        }
                        // Stop digging once we have enough items
                        if (notSeenItems.length >= limit) break;
                    }
                    if (notSeenItems.length > 0) return notSeenItems;
                }
            }
        }

        // Priority 2: Sitemap (sorted by lastmod)
        if (discoveryResults.sitemaps.length > 0) {
            for (const sitemapUrl of discoveryResults.sitemaps) {
                const items = await this.parseSitemap(sitemapUrl);
                if (items && items.length > 0) {
                    if (!seenManager) return items.slice(0, limit);

                    const notSeenItems = [];
                    for (const item of items) {
                        const isSeen = await seenManager.peek(item.url);
                        const isOld = await seenManager.isTooOld(item.date);
                        
                        if (!isSeen && !isOld) {
                            notSeenItems.push(item);
                        }
                        // Stop digging once we have enough items
                        if (notSeenItems.length >= limit) break;
                    }
                    if (notSeenItems.length > 0) return notSeenItems;
                }
            }
        }

        return [];
    }

    async parseFeed(url) {
        const xmlText = await this.fetchWithTimeout(url);
        if (!xmlText) return null;

        // In foreground, use DOMParser. In background, use simplified regex parsing.
        if (typeof DOMParser !== 'undefined') {
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
            const items = [];
            
            // RSS 2.0
            const rssItems = doc.querySelectorAll('item');
            if (rssItems.length > 0) {
                rssItems.forEach(node => {
                    // Extract image from media:content, enclosure, or description
                    let imageUrl = node.querySelector('media\\:content, content')?.getAttribute('url') || 
                                   node.querySelector('enclosure[type^="image/"]')?.getAttribute('url') || '';
                    
                    if (!imageUrl) {
                        const description = node.querySelector('description')?.textContent || '';
                        const imgMatch = description.match(/<img[^>]*src=["']([^"']*)["']/i);
                        if (imgMatch) imageUrl = imgMatch[1];
                    }

                    items.push({
                        title: this.sanitizeText(node.querySelector('title')?.textContent || 'Untitled'),
                        url: this.sanitizeUrl(node.querySelector('link')?.textContent || ''),
                        date: node.querySelector('pubDate')?.textContent || '',
                        image: this.sanitizeUrl(imageUrl)
                    });
                });
                return items;
            }

            // Atom
            const atomEntries = doc.querySelectorAll('entry');
            if (atomEntries.length > 0) {
                atomEntries.forEach(node => {
                    let imageUrl = node.querySelector('link[rel="enclosure"][type^="image/"]')?.getAttribute('href') || 
                                   node.querySelector('media\\:content')?.getAttribute('url') || '';
                    
                    if (!imageUrl) {
                        const content = node.querySelector('content, summary')?.textContent || '';
                        const imgMatch = content.match(/<img[^>]*src=["']([^"']*)["']/i);
                        if (imgMatch) imageUrl = imgMatch[1];
                    }

                    items.push({
                        title: this.sanitizeText(node.querySelector('title')?.textContent || 'Untitled'),
                        url: this.sanitizeUrl(node.querySelector('link')?.getAttribute('href') || ''),
                        date: node.querySelector('updated, published')?.textContent || '',
                        image: this.sanitizeUrl(imageUrl)
                    });
                });
                return items;
            }
        } else {
            // Background Service Worker: Simplified Regex Parsing for RSS/Atom
            const items = [];
            const itemRegex = /<(item|entry)>([\s\S]*?)<\/\1>/gi;
            let match;
            
            while ((match = itemRegex.exec(xmlText)) !== null) {
                const content = match[2];
                const rawTitle = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Untitled';
                const rawLink = content.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || 
                             content.match(/<link[^>]*href=["']([^"']*)["']/i)?.[1] || '';
                const date = content.match(/<(pubDate|updated|published)>([\s\S]*?)<\/\1>/i)?.[2] || '';
                
                // Regex for image: media:content url, enclosure url, or img src in description
                let rawImage = content.match(/<(media:content|enclosure)[^>]*url=["']([^"']*)["']/i)?.[2] || 
                            content.match(/<img[^>]*src=["']([^"']*)["']/i)?.[1] || '';
                
                items.push({ 
                    title: this.sanitizeText(rawTitle), 
                    url: this.sanitizeUrl(rawLink.trim()), 
                    date,
                    image: this.sanitizeUrl(rawImage)
                });
            }
            return items;
        }

        return null;
    }

    stripCdata(text) {
        return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    }

    async parseSitemap(url) {
        const xmlText = await this.fetchWithTimeout(url);
        if (!xmlText) return null;

        // Ensure it's actually an XML sitemap and not an HTML page
        if (!xmlText.includes('<urlset') && !xmlText.includes('<sitemapindex')) {
            return null;
        }

        if (typeof DOMParser !== 'undefined') {
            const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
            const urls = Array.from(doc.querySelectorAll('url')).map(node => ({
                title: 'Sitemap Link',
                url: this.sanitizeUrl(node.querySelector('loc')?.textContent || ''),
                date: node.querySelector('lastmod')?.textContent || ''
            }));
            return urls.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        } else {
            // Background: Simple Regex for Sitemap
            const urls = [];
            const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
            let match;
            while ((match = urlRegex.exec(xmlText)) !== null) {
                const content = match[1];
                const loc = content.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || '';
                const lastmod = content.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1] || '';
                if (loc) urls.push({ 
                    title: 'Sitemap Link', 
                    url: this.sanitizeUrl(loc.trim()), 
                    date: lastmod 
                });
            }
            return urls.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        }
    }

    /**
     * Extracts RSS/Atom feeds from HTML <link> tags.
     */
    extractFeedsFromHtml(doc, baseUrl) {
        // This is kept for foreground use where DOMParser is available.
        const feeds = [];
        const selectors = [
            'link[type="application/rss+xml"]',
            'link[type="application/atom+xml"]',
            'link[type="application/feed+json"]'
        ];

        selectors.forEach(selector => {
            doc.querySelectorAll(selector).forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    feeds.push({
                        url: this.resolveUrl(href, baseUrl),
                        type: link.getAttribute('type'),
                        title: link.getAttribute('title') || 'RSS Feed'
                    });
                }
            });
        });

        return feeds;
    }

    /**
     * Parses robots.txt for Sitemap directives.
     */
    extractSitemapsFromRobots(content) {
        const sitemaps = [];
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase().startsWith('sitemap:')) {
                const url = trimmedLine.split(/sitemap:/i)[1]?.trim();
                // Basic validation: must look like a sitemap (usually .xml or has 'sitemap' in the name)
                if (url && (url.toLowerCase().endsWith('.xml') || url.toLowerCase().includes('sitemap'))) {
                    sitemaps.push(url);
                }
            }
        }
        return sitemaps;
    }

    /**
     * Probes common feed locations.
     */
    async probeCommonFeedPaths(baseUrl) {
        const paths = ['/feed/', '/rss/', '/index.xml', '/atom.xml'];
        const found = [];
        for (const path of paths) {
            const url = `${baseUrl}${path}`;
            if (await this.headRequest(url)) {
                found.push({ url, type: 'probed', title: `Probed ${path}` });
            }
        }
        return found;
    }

    /**
     * Probes common sitemap locations.
     */
    async probeCommonSitemapPaths(baseUrl) {
        const paths = ['/sitemap.xml', '/sitemap_index.xml'];
        const found = [];
        for (const path of paths) {
            const url = `${baseUrl}${path}`;
            if (await this.headRequest(url)) {
                found.push(url);
            }
        }
        return found;
    }

    /**
     * Fetches a favicon and converts it to a Base64 data URL.
     */
    async fetchFaviconAsBase64(baseUrl) {
        try {
            const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(baseUrl)}&size=32`;
            const response = await fetch(faviconUrl);
            if (!response.ok) return '';
            
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            return `data:image/png;base64,${base64}`;
        } catch (e) {
            console.warn("Favicon bake-in failed:", e);
            return '';
        }
    }

    /**
     * Helper to resolve relative URLs.
     */
    resolveUrl(url, base) {
        try {
            return new URL(url, base).href;
        } catch {
            return url;
        }
    }

    /**
     * Generic fetch with retry and exponential backoff.
     */
    async fetchWithRetry(url, options = {}) {
        const { 
            method = 'GET', 
            timeout = 5000, 
            retries = 3, 
            backoff = 1000
        } = options;

        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, { ...options, method, signal: controller.signal });
            clearTimeout(id);

            if (!response.ok) {
                // Retry on 5xx (Server Error) or 429 (Too Many Requests)
                if ((response.status >= 500 || response.status === 429) && retries > 0) {
                    Telemetry.debug(`Retrying ${method} ${url}`, `status: ${response.status}, left: ${retries}`);
                    console.warn(`Retrying ${method} ${url} (status: ${response.status}). Retries left: ${retries}`);
                    await new Promise(res => setTimeout(res, backoff));
                    return this.fetchWithRetry(url, { ...options, retries: retries - 1, backoff: backoff * 2 });
                }
                
                if (!response.ok && retries === 0) {
                    Telemetry.debug(`Fetch failed final`, `status: ${response.status}, url: ${url}`);
                }
                return response;
            }
            return response;
        } catch (e) {
            // Retry on AbortError (timeout) or network errors (TypeError)
            if (retries > 0 && (e.name === 'AbortError' || e.name === 'TypeError')) {
                Telemetry.debug(`Retrying ${method} ${url}`, `error: ${e.message}, left: ${retries}`);
                console.warn(`Retrying ${method} ${url} (error: ${e.message}). Retries left: ${retries}`);
                await new Promise(res => setTimeout(res, backoff));
                return this.fetchWithRetry(url, { ...options, retries: retries - 1, backoff: backoff * 2 });
            }
            
            if (retries === 0) {
                Telemetry.debug(`Fetch error final`, `error: ${e.message}, url: ${url}`);
            }
            throw e;
        }
    }

    /**
     * Fetch helper with timeout and retry.
     */
    async fetchWithTimeout(url, timeout = 5000) {
        try {
            const response = await this.fetchWithRetry(url, { timeout });
            if (!response.ok) return null;
            return await response.text();
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if a URL exists using a HEAD request with retry.
     */
    async headRequest(url) {
        try {
            const response = await this.fetchWithRetry(url, { method: 'HEAD', timeout: 3000 });
            return response.ok;
        } catch {
            return false;
        }
    }
}
