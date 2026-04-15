/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiscoveryModule } from '../src/discovery.js';

describe('DiscoveryModule Retry Logic', () => {
    let discovery;

    beforeEach(() => {
        discovery = new DiscoveryModule();
        vi.resetAllMocks();
        global.fetch = vi.fn();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should retry on 500 error and eventually succeed', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 500 });
        fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('success') });

        const promise = discovery.fetchWithTimeout('https://example.com');
        
        // Wait for first failure and timer to be set
        await vi.runAllTimersAsync();
        
        const result = await promise;
        expect(result).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 error and eventually succeed', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 429 });
        fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('success') });

        const promise = discovery.fetchWithTimeout('https://example.com');
        await vi.runAllTimersAsync();
        
        const result = await promise;
        expect(result).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error (TypeError)', async () => {
        fetch.mockRejectedValueOnce(new TypeError('Network Error'));
        fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('success') });

        const promise = discovery.fetchWithTimeout('https://example.com');
        await vi.runAllTimersAsync();
        
        const result = await promise;
        expect(result).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout (AbortError)', async () => {
        fetch.mockRejectedValueOnce({ name: 'AbortError', message: 'The user aborted a request.' });
        fetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('success') });

        const promise = discovery.fetchWithTimeout('https://example.com');
        await vi.runAllTimersAsync();
        
        const result = await promise;
        expect(result).toBe('success');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should give up after max retries', async () => {
        fetch.mockResolvedValue({ ok: false, status: 500 });

        const promise = discovery.fetchWithTimeout('https://example.com', 1000);
        
        // Wait for all retries
        for (let i = 0; i < 4; i++) {
            await vi.runAllTimersAsync();
        }
        
        const result = await promise;
        expect(result).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should not retry on 404 error', async () => {
        fetch.mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await discovery.fetchWithTimeout('https://example.com');
        expect(result).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should double backoff delay each time', async () => {
        fetch.mockResolvedValue({ ok: false, status: 500 });
        
        const spy = vi.spyOn(global, 'setTimeout');
        
        const promise = discovery.fetchWithTimeout('https://example.com');
        
        // 1st retry
        await vi.runOnlyPendingTimersAsync(); 
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 1000); // Backoff 1000
        
        // 2nd retry
        await vi.runOnlyPendingTimersAsync();
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 2000); // Backoff 2000
        
        // 3rd retry
        await vi.runOnlyPendingTimersAsync();
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 4000); // Backoff 4000

        await promise;
    });

    describe('headRequest Retry', () => {
        it('should retry on 500 error for HEAD requests', async () => {
            fetch.mockResolvedValueOnce({ ok: false, status: 500 });
            fetch.mockResolvedValueOnce({ ok: true });

            const promise = discovery.headRequest('https://example.com');
            await vi.runAllTimersAsync();
            
            const result = await promise;
            expect(result).toBe(true);
            expect(fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ method: 'HEAD' }));
            expect(fetch).toHaveBeenCalledTimes(2);
        });
    });
});
