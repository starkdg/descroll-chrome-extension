/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoveryModule } from '../src/discovery.js';

describe('DiscoveryModule', () => {
    let discovery;

    beforeEach(() => {
        discovery = new DiscoveryModule();
        vi.clearAllMocks();
    });

    describe('URL and Text Sanitization', () => {
        it('should resolve relative URLs correctly', () => {
            expect(discovery.resolveUrl('/feed.xml', 'https://example.com')).toBe('https://example.com/feed.xml');
            expect(discovery.resolveUrl('https://other.com/rss', 'https://example.com')).toBe('https://other.com/rss');
        });

        it('should sanitize URLs and only allow http/https', () => {
            expect(discovery.sanitizeUrl('https://example.com')).toBe('https://example.com');
            expect(discovery.sanitizeUrl('javascript:alert(1)')).toBe('');
        });

        it('should sanitize text and remove HTML tags', () => {
            // Using DOMPurify under the hood
            expect(discovery.sanitizeText('Hello <b>World</b>')).toBe('Hello World');
            expect(discovery.sanitizeText('<![CDATA[Unescaped]]>')).toBe('Unescaped');
        });
    });

    describe('Metadata Extraction', () => {
        const mockHtml = `
            <html>
                <head>
                    <title>My Blog</title>
                    <meta name="description" content="A blog about coding">
                </head>
            </html>
        `;

        it('should extract title tag content', () => {
            const title = discovery.extractTagContent(mockHtml, 'title');
            expect(title).toBe('My Blog');
        });

        it('should extract meta description content', () => {
            const description = discovery.extractMetaContent(mockHtml, 'description');
            expect(description).toBe('A blog about coding');
        });
    });

    describe('Feed Extraction', () => {
        const mockHtml = `
            <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
            <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
        `;

        it('should extract RSS and Atom feeds from HTML links', () => {
            const feeds = discovery.extractFeedsFromHtmlContent(mockHtml, 'https://example.com');
            expect(feeds).toHaveLength(2);
            expect(feeds[0].url).toBe('https://example.com/rss.xml');
            expect(feeds[0].type).toBe('application/rss+xml');
            expect(feeds[1].url).toBe('https://example.com/atom.xml');
        });
    });

    describe('Feed Content Extraction (parseFeed)', () => {
        it('should extract items with snippets from RSS 2.0', async () => {
            const rssXml = `
                <rss version="2.0">
                    <channel>
                        <item>
                            <title>RSS Item</title>
                            <link>https://example.com/item1</link>
                            <description>RSS description text.</description>
                            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
                        </item>
                    </channel>
                </rss>
            `;
            vi.spyOn(discovery, 'fetchWithTimeout').mockResolvedValue(rssXml);
            
            const items = await discovery.parseFeed('https://example.com/rss.xml');
            expect(items).toHaveLength(1);
            expect(items[0].title).toBe('RSS Item');
            expect(items[0].snippet).toBe('RSS description text.');
        });

        it('should extract items with snippets from Atom', async () => {
            const atomXml = `
                <feed xmlns="http://www.w3.org/2005/Atom">
                    <entry>
                        <title>Atom Item</title>
                        <link href="https://example.com/item1"/>
                        <summary>Atom summary text.</summary>
                        <updated>2024-01-01T00:00:00Z</updated>
                    </entry>
                </feed>
            `;
            vi.spyOn(discovery, 'fetchWithTimeout').mockResolvedValue(atomXml);
            
            const items = await discovery.parseFeed('https://example.com/atom.xml');
            expect(items).toHaveLength(1);
            expect(items[0].title).toBe('Atom Item');
            expect(items[0].snippet).toBe('Atom summary text.');
        });

        it('should fallback to content:encoded or content if description/summary is missing', async () => {
            const mixedXml = `
                <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
                    <item>
                        <title>Encoded Item</title>
                        <link>https://example.com/item2</link>
                        <content:encoded>Encoded content.</content:encoded>
                    </item>
                </rss>
            `;
            // Note: in jsdom/xml, content:encoded might need special handling as seen in discovery.js
            vi.spyOn(discovery, 'fetchWithTimeout').mockResolvedValue(mixedXml);
            
            const items = await discovery.parseFeed('https://example.com/rss.xml');
            expect(items).toHaveLength(1);
            expect(items[0].snippet).toBe('Encoded content.');
        });
    });

    describe('Robots.txt Parsing', () => {
        it('should extract sitemaps from robots.txt content', () => {
            const robots = `
                User-agent: *
                Allow: /
                Sitemap: https://example.com/sitemap.xml
                Sitemap: https://example.com/sitemap_index.xml
            `;
            const sitemaps = discovery.extractSitemapsFromRobots(robots);
            expect(sitemaps).toEqual([
                'https://example.com/sitemap.xml',
                'https://example.com/sitemap_index.xml'
            ]);
        });
    });
});
