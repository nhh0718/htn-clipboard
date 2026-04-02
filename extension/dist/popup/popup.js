"use strict";
// popup.ts — Clipboard Pro extension popup controller
// ── Utilities ────────────────────────────────────────────────────────────────
/** Returns a human-readable relative time string: Xs / Xm / Xh / Xd ago */
function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60)
        return `${diff}s ago`;
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)
        return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
/** Truncates a string to n characters and appends ellipsis if needed */
function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '\u2026' : s;
}
/** Sends a message to the background service worker */
async function sendMsg(msg) {
    return chrome.runtime.sendMessage(msg);
}
// ── DOM references ────────────────────────────────────────────────────────────
const searchInput = document.getElementById('search');
const statusDiv = document.getElementById('status');
const itemsList = document.getElementById('items-list');
const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('settings-btn');
const tokenInput = document.getElementById('token-input');
const toggleTokenBtn = document.getElementById('toggle-token');
const saveTokenBtn = document.getElementById('save-token');
// ── Status helpers ────────────────────────────────────────────────────────────
function setStatus(text, cls) {
    statusDiv.textContent = text;
    statusDiv.className = cls;
}
// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing)
        existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('fade-out'), 1200);
    setTimeout(() => toast.remove(), 1500);
}
// ── Render ────────────────────────────────────────────────────────────────────
function renderItems(items) {
    itemsList.innerHTML = '';
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No clipboard items found.';
        itemsList.appendChild(empty);
        return;
    }
    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'item';
        div.dataset['id'] = String(item.id);
        const displayText = item.type === 'image'
            ? '[Image]'
            : truncate(item.content.replace(/\s+/g, ' ').trim(), 150);
        const textEl = document.createElement('div');
        textEl.className = 'item-text';
        textEl.textContent = displayText;
        const metaEl = document.createElement('div');
        metaEl.className = 'item-meta';
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'source-app';
        sourceSpan.textContent = item.sourceApp || 'Unknown';
        const timeSpan = document.createElement('span');
        timeSpan.textContent = timeAgo(item.createdAt);
        if (item.isPinned) {
            const pin = document.createElement('span');
            pin.className = 'item-pinned';
            pin.textContent = '\uD83D\uDCCC ';
            textEl.prepend(pin);
        }
        metaEl.appendChild(sourceSpan);
        metaEl.appendChild(timeSpan);
        div.appendChild(textEl);
        div.appendChild(metaEl);
        div.addEventListener('click', () => void handlePaste(item.id));
        itemsList.appendChild(div);
    }
}
// ── Actions ───────────────────────────────────────────────────────────────────
async function handlePaste(id) {
    const res = (await sendMsg({ action: 'paste', id }));
    if (res?.error) {
        showToast('Error: ' + res.error);
    }
    else {
        showToast('Copied!');
    }
}
async function loadHistory() {
    setStatus('Loading\u2026', 'loading');
    try {
        const res = (await sendMsg({ action: 'getHistory', limit: 20, offset: 0 }));
        if (res?.error) {
            setStatus('Error: ' + res.error, 'disconnected');
            return;
        }
        setStatus(`${res.total} items`, 'connected');
        renderItems(res.items ?? []);
    }
    catch (e) {
        setStatus('Failed to load history', 'disconnected');
        console.error(e);
    }
}
// ── Search with 300ms debounce ────────────────────────────────────────────────
let searchTimeout = null;
searchInput.addEventListener('input', () => {
    if (searchTimeout !== null)
        clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => void runSearch(), 300);
});
async function runSearch() {
    const query = searchInput.value.trim();
    if (query === '') {
        void loadHistory();
        return;
    }
    setStatus('Searching\u2026', 'loading');
    try {
        const res = (await sendMsg({ action: 'search', query, limit: 20 }));
        if (res?.error) {
            setStatus('Search error', 'disconnected');
            return;
        }
        setStatus(`${res.total} results`, 'connected');
        renderItems(res.items ?? []);
    }
    catch (e) {
        setStatus('Search failed', 'disconnected');
        console.error(e);
    }
}
// ── Settings panel ────────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
    const hidden = settingsPanel.hasAttribute('hidden');
    if (hidden) {
        settingsPanel.removeAttribute('hidden');
        void loadSavedToken();
    }
    else {
        settingsPanel.setAttribute('hidden', '');
    }
});
toggleTokenBtn.addEventListener('click', () => {
    tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
});
saveTokenBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    chrome.storage.local.set({ authToken: token }, () => {
        showToast('Token saved!');
        settingsPanel.setAttribute('hidden', '');
        void init();
    });
});
async function loadSavedToken() {
    const result = await chrome.storage.local.get('authToken');
    tokenInput.value = result['authToken'] ?? '';
}
// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    setStatus('Connecting\u2026', 'loading');
    itemsList.innerHTML = '';
    try {
        const res = (await sendMsg({ action: 'ping' }));
        if (!res?.ok) {
            setStatus('Clipboard Pro not running', 'disconnected');
            renderItems([]);
            return;
        }
        await loadHistory();
    }
    catch (e) {
        setStatus('Cannot reach Clipboard Pro', 'disconnected');
        console.error(e);
    }
}
void init();
