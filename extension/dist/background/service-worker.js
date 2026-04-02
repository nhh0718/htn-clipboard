"use strict";
// service-worker.ts — API client + message handler for Clipboard Pro extension.
// API client that communicates with the local Clipboard Pro daemon.
class ClipboardProAPI {
    constructor() {
        this.baseUrl = 'http://localhost:27843';
        this.token = '';
    }
    async loadToken() {
        const result = await chrome.storage.local.get('authToken');
        this.token = result['authToken'] ?? '';
    }
    headers() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }
    async ping() {
        try {
            const r = await fetch(`${this.baseUrl}/api/v1/ping`, {
                signal: AbortSignal.timeout(2000),
            });
            return r.ok;
        }
        catch {
            return false;
        }
    }
    async getHistory(limit, offset) {
        const r = await fetch(`${this.baseUrl}/api/v1/history?limit=${limit}&offset=${offset}`, { headers: this.headers(), signal: AbortSignal.timeout(3000) });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
        return r.json();
    }
    async search(query, type, time, limit) {
        const params = new URLSearchParams();
        if (query)
            params.set('q', query);
        if (type)
            params.set('type', type);
        if (time)
            params.set('time', time);
        params.set('limit', String(limit));
        const r = await fetch(`${this.baseUrl}/api/v1/search?${params}`, { headers: this.headers(), signal: AbortSignal.timeout(3000) });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
        return r.json();
    }
    async paste(id) {
        const r = await fetch(`${this.baseUrl}/api/v1/paste`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ id }),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
    }
    async deleteItem(id) {
        const r = await fetch(`${this.baseUrl}/api/v1/delete`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ id }),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
    }
    async togglePin(id) {
        const r = await fetch(`${this.baseUrl}/api/v1/pin`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ id }),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
    }
}
const api = new ClipboardProAPI();
// Load token once at startup; refresh when storage changes.
api.loadToken();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['authToken']) {
        api.loadToken();
    }
});
// Listen for messages from the popup and route them to the API.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handle = async () => {
        switch (msg.action) {
            case 'ping':
                return { ok: await api.ping() };
            case 'getHistory':
                return api.getHistory(msg.limit ?? 30, msg.offset ?? 0);
            case 'search':
                if (!msg.query && !msg.type && !msg.time)
                    return { items: [], total: 0 };
                return api.search(msg.query ?? '', msg.type ?? '', msg.time ?? '', msg.limit ?? 30);
            case 'paste':
                if (msg.id === undefined)
                    return { error: 'missing id' };
                await api.paste(msg.id);
                return { ok: true };
            case 'delete':
                if (msg.id === undefined)
                    return { error: 'missing id' };
                await api.deleteItem(msg.id);
                return { ok: true };
            case 'pin':
                if (msg.id === undefined)
                    return { error: 'missing id' };
                await api.togglePin(msg.id);
                return { ok: true };
            default:
                return { error: 'unknown action' };
        }
    };
    handle()
        .then(sendResponse)
        .catch((e) => sendResponse({ error: String(e) }));
    // Return true to keep the message channel open for async response.
    return true;
});
