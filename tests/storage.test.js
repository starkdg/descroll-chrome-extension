import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager } from '../src/storage.js';

describe('StorageManager', () => {
    
    const mockStorage = {
        get: vi.fn(),
        set: vi.fn()
    };

    const mockLocks = {
        request: vi.fn(async (name, callback) => callback())
    };

    beforeEach(() => {
        vi.stubGlobal('chrome', { storage: { local: mockStorage } });
        vi.stubGlobal('navigator', { locks: mockLocks });
        vi.clearAllMocks();
    });

    it('should perform an atomic update when value changes', async () => {
        mockStorage.get.mockResolvedValue({ myKey: 'oldValue' });
        
        const updateFn = vi.fn((current) => current + 'New');
        const result = await StorageManager.atomicUpdate('myLock', 'myKey', updateFn);

        expect(mockLocks.request).toHaveBeenCalledWith('myLock', expect.any(Function));
        expect(updateFn).toHaveBeenCalledWith('oldValue');
        expect(mockStorage.set).toHaveBeenCalledWith({ myKey: 'oldValueNew' });
        expect(result).toBe('oldValueNew');
    });

    it('should not call storage.set if value remains unchanged', async () => {
        mockStorage.get.mockResolvedValue({ myKey: 'sameValue' });
        
        const updateFn = vi.fn((current) => current);
        await StorageManager.atomicUpdate('myLock', 'myKey', updateFn);

        expect(mockStorage.set).not.toHaveBeenCalled();
    });

    it('should not call storage.set if updateFn returns undefined', async () => {
        mockStorage.get.mockResolvedValue({ myKey: 'val' });
        
        const updateFn = vi.fn(() => undefined);
        await StorageManager.atomicUpdate('myLock', 'myKey', updateFn);

        expect(mockStorage.set).not.toHaveBeenCalled();
    });
});
