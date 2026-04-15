/**
 * Storage Synchronization Utilities
 * Uses the Web Locks API to ensure atomic read-modify-write operations on shared storage keys.
 */

export const StorageManager = {
    /**
     * Named lock for the discoveredFeeds storage object.
     */
    DISCOVERED_FEEDS_LOCK: 'discoveredFeeds_lock',

    /**
     * Performs an atomic update on a specific storage key using a named lock.
     * @param {string} lockName - The name of the lock to use for synchronization.
     * @param {string} storageKey - The chrome.storage.local key to update.
     * @param {function} updateFn - A function that receives the current value and returns the updated value.
     *                              If it returns undefined or the same value, no write is performed.
     * @returns {Promise<any>} - The updated value.
     */
    async atomicUpdate(lockName, storageKey, updateFn) {
        return navigator.locks.request(lockName, async (lock) => {
            const results = await chrome.storage.local.get(storageKey);
            const currentValue = results[storageKey];
            
            // Allow the update function to be async if needed
            const updatedValue = await updateFn(currentValue);

            // Only write if something actually changed (or if updateFn explicitly returned a value)
            if (updatedValue !== undefined && updatedValue !== currentValue) {
                await chrome.storage.local.set({ [storageKey]: updatedValue });
                return updatedValue;
            }
            
            return currentValue;
        });
    }
};
