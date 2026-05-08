import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeenContentManager } from '../src/seen.js';

describe('SeenContentManager', () => {
    let seenManager;
    
    // Mock chrome.storage.local
    const mockStorage = {
        get: vi.fn(),
        set: vi.fn(),
        onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    };

    beforeEach(() => {
        vi.stubGlobal('chrome', { storage: { local: mockStorage, onChanged: mockStorage.onChanged } });
        vi.useFakeTimers();
        seenManager = new SeenContentManager(7);
    });

    it('should synchronize cache when storage changes (cross-tab sync)', async () => {
        // Find the listener that was added
        const listener = mockStorage.onChanged.addListener.mock.calls[0][0];
        expect(listener).toBeDefined();

        const newSeenData = { 'https://newly-seen.com': Date.now() };
        
        // Simulate a storage change event from another tab
        listener({
            seenUrls: { newValue: newSeenData }
        }, 'local');

        expect(seenManager.cache).toEqual(newSeenData);
        expect(await seenManager.peek('https://newly-seen.com')).toBe(true);
    });

    it('should return correct windowMs', async () => {
        mockStorage.get.mockResolvedValue({ seenSettings: { windowDays: 5 } });
        const ms = await seenManager.getWindowMs();
        expect(ms).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it('should identify old content correctly', async () => {
        mockStorage.get.mockResolvedValue({ seenSettings: { windowDays: 7 } });
        
        const now = Date.now();
        const oldDate = new Date(now - (10 * 24 * 60 * 60 * 1000)).toISOString(); // 10 days ago
        const recentDate = new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString(); // 2 days ago
        
        expect(await seenManager.isTooOld(oldDate)).toBe(true);
        expect(await seenManager.isTooOld(recentDate)).toBe(false);
    });

    it('should mark a URL as seen and debounce storage write', async () => {
        mockStorage.get.mockResolvedValue({ seenUrls: {} });
        
        await seenManager.markSeen('https://test.com');
        expect(await seenManager.peek('https://test.com')).toBe(true);
        
        // Storage shouldn't be called immediately due to debounce
        expect(mockStorage.set).not.toHaveBeenCalled();
        
        // Fast-forward time
        vi.runAllTimers();
        expect(mockStorage.set).toHaveBeenCalled();
    });

    it('should prune expired entries during ensureLoaded', async () => {
        const now = Date.now();
        const windowMs = 7 * 24 * 60 * 60 * 1000;
        
        const mockData = {
            'https://old.com': now - (windowMs + 1000), // Expired
            'https://new.com': now - 1000 // Fresh
        };
        
        mockStorage.get.mockResolvedValue({ 
            seenSettings: { windowDays: 7 },
            seenUrls: mockData 
        });

        const cache = await seenManager.ensureLoaded();
        
        expect(cache['https://new.com']).toBeDefined();
        expect(cache['https://old.com']).toBeUndefined();
        expect(mockStorage.set).toHaveBeenCalled();
    });
});
