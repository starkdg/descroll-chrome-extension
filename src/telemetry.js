import { CONFIG } from './config.js';

const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MAX_LOCAL_LOGS = 50;

export class Telemetry {
    /**
     * Sends an anonymous event to GA4 via Measurement Protocol.
     */
    static async logEvent(name, params = {}) {
        const settings = await chrome.storage.local.get({ enableTelemetry: true });
        if (!settings.enableTelemetry) return;

        try {
            const clientId = await this.getOrCreateClientId();
            
            const payload = {
                client_id: clientId,
                events: [{
                    name: name,
                    params: {
                        ...params,
                        engagement_time_msec: 1, // Required by GA4
                    }
                }]
            };

            // Use fetch to send the ping - no external scripts required
            await fetch(`${GA_ENDPOINT}?measurement_id=${CONFIG.GA_MEASUREMENT_ID}&api_secret=${CONFIG.GA_API_SECRET}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // Silently fail GA4 pings to avoid interrupting the user
            this.debug('GA4 ping failed', e.message);
        }
    }

    /**
     * Adds a message to the local diagnostic log in chrome.storage.local.
     */
    static async debug(message, data = null) {
        const timestamp = new Date().toISOString();
        const entry = {
            timestamp,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data) : data) : ''
        };

        try {
            const result = await chrome.storage.local.get('diagnosticLogs');
            let logs = result.diagnosticLogs || [];
            
            // Add to start of array
            logs.unshift(entry);
            
            // Rotate: keep last 50
            if (logs.length > MAX_LOCAL_LOGS) {
                logs = logs.slice(0, MAX_LOCAL_LOGS);
            }

            await chrome.storage.local.set({ diagnosticLogs: logs });
        } catch (e) {
            console.error("Local logging failed:", e);
        }
    }

    /**
     * Gets or creates a unique anonymous ID for this installation.
     */
    static async getOrCreateClientId() {
        const result = await chrome.storage.local.get('clientId');
        if (result.clientId) return result.clientId;

        const newId = this.generateUUID();
        await chrome.storage.local.set({ clientId: newId });
        return newId;
    }

    static generateUUID() {
        return ([1e7]+-1e3+-4e3+-8e2+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    /**
     * Clears all local diagnostic logs.
     */
    static async clearLogs() {
        await chrome.storage.local.remove('diagnosticLogs');
    }
}
