package server

// dashboardHTML is the embedded web dashboard page served at /.
// Self-contained HTML — no external dependencies. Fetches from the local API.
const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clipboard Pro — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f1117;--card:#181b23;--border:#2a2d3a;--fg:#e1e4ed;--muted:#6b7080;--primary:#4f8ff7;--green:#34d399;--red:#f87171}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);min-height:100vh}
.container{max-width:720px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;font-weight:700;margin-bottom:4px}
.subtitle{color:var(--muted);font-size:13px;margin-bottom:24px}
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.health-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.health-card .label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px}
.health-card .value{font-size:18px;font-weight:600}
.health-card .value.ok{color:var(--green)}
.health-card .value.err{color:var(--red)}
.search-row{display:flex;gap:8px;margin-bottom:16px}
.search-row input{flex:1;height:38px;padding:0 14px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:13px;outline:none}
.search-row input:focus{border-color:var(--primary)}
.search-row select{height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:12px;outline:none}
.items{display:flex;flex-direction:column;gap:8px}
.item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;cursor:pointer;transition:border-color .15s}
.item:hover{border-color:var(--primary)}
.item-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.badge{font-size:9px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;letter-spacing:.05em}
.badge.text{background:rgba(52,211,153,.15);color:var(--green)}
.badge.image{background:rgba(79,143,247,.15);color:var(--primary)}
.source{font-size:11px;color:var(--muted);flex:1}
.time{font-size:11px;color:var(--muted)}
.content{font-size:12px;font-family:monospace;color:var(--fg);opacity:.85;white-space:pre-wrap;word-break:break-all;line-height:1.5;max-height:72px;overflow:hidden}
.item img{max-height:80px;border-radius:6px;margin-top:4px}
.token-row{display:flex;gap:8px;margin-bottom:24px;align-items:center}
.token-row label{font-size:12px;color:var(--muted);white-space:nowrap}
.token-row input{flex:1;height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:12px;font-family:monospace}
.token-row button{height:32px;padding:0 12px;border-radius:6px;border:none;background:var(--primary);color:#fff;font-size:12px;cursor:pointer}
.empty{text-align:center;color:var(--muted);font-size:13px;padding:40px 0}
.pinned{border-left:3px solid var(--primary)}
</style>
</head>
<body>
<div class="container">
  <h1>Clipboard Pro</h1>
  <p class="subtitle">Web Dashboard — localhost only</p>

  <div class="token-row">
    <label>Auth Token:</label>
    <input id="tokenInput" type="password" placeholder="Paste your auth token here">
    <button onclick="loadAll()">Connect</button>
  </div>

  <div class="health-grid" id="healthGrid"></div>

  <div class="search-row">
    <input id="searchInput" placeholder="Search clipboard..." oninput="debounceSearch()">
    <select id="typeFilter" onchange="doSearch()">
      <option value="">All Types</option>
      <option value="text">Text</option>
      <option value="image">Image</option>
    </select>
    <select id="timeFilter" onchange="doSearch()">
      <option value="">Anytime</option>
      <option value="1h">1 Hour</option>
      <option value="24h">24 Hours</option>
      <option value="7d">7 Days</option>
      <option value="30d">30 Days</option>
    </select>
  </div>

  <div class="items" id="itemsList"></div>
</div>

<script>
const PORT = location.port || '27843'
const BASE = location.origin.includes('localhost') ? location.origin : 'http://127.0.0.1:' + PORT

function token() { return document.getElementById('tokenInput').value.trim() }
function headers() { return { Authorization: 'Bearer ' + token() } }

async function loadAll() {
  if (!token()) return
  localStorage.setItem('cb-token', token())
  await loadHealth()
  await doSearch()
}

async function loadHealth() {
  try {
    const r = await fetch(BASE + '/api/v1/ping')
    const d = await r.json()
    document.getElementById('healthGrid').innerHTML =
      card('Status', d.status === 'ok' ? 'Running' : 'Error', d.status === 'ok') +
      card('Version', d.version || '?', true) +
      card('API', ':' + PORT, true)
  } catch { document.getElementById('healthGrid').innerHTML = card('Status', 'Offline', false) }
}

function card(label, value, ok) {
  return '<div class="health-card"><div class="label">' + label +
    '</div><div class="value ' + (ok ? 'ok' : 'err') + '">' + value + '</div></div>'
}

let searchTimer
function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 300) }

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim()
  const type = document.getElementById('typeFilter').value
  const time = document.getElementById('timeFilter').value
  try {
    let url
    if (q || type || time) {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      if (time) params.set('time', time)
      params.set('limit', '50')
      url = BASE + '/api/v1/search?' + params
    } else {
      url = BASE + '/api/v1/history?limit=50&offset=0'
    }
    const r = await fetch(url, { headers: headers() })
    if (!r.ok) { document.getElementById('itemsList').innerHTML = '<div class="empty">Auth failed — check token</div>'; return }
    const d = await r.json()
    renderItems(d.items || [])
  } catch { document.getElementById('itemsList').innerHTML = '<div class="empty">Connection error</div>' }
}

function renderItems(items) {
  if (!items.length) { document.getElementById('itemsList').innerHTML = '<div class="empty">No items found</div>'; return }
  document.getElementById('itemsList').innerHTML = items.map(i => {
    const badge = '<span class="badge ' + i.type + '">' + i.type + '</span>'
    const src = '<span class="source">' + (i.sourceApp || 'Unknown') + '</span>'
    const time = '<span class="time">' + ago(i.createdAt) + '</span>'
    const body = i.type === 'image'
      ? '<img src="' + BASE + '/api/v1/image/' + i.id + '" alt="image">'
      : '<div class="content">' + esc(i.content || '').slice(0, 300) + '</div>'
    return '<div class="item' + (i.isPinned ? ' pinned' : '') + '" onclick="copyItem(' + i.id + ')">' +
      '<div class="item-header">' + badge + src + time + '</div>' + body + '</div>'
  }).join('')
}

async function copyItem(id) {
  try {
    const r = await fetch(BASE + '/api/v1/paste', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (r.ok) showToast('Copied to clipboard!')
  } catch {}
}

function showToast(msg) {
  let t = document.getElementById('toast')
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t) }
  t.textContent = msg
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:99;transition:opacity .3s;opacity:1'
  clearTimeout(t._timer)
  t._timer = setTimeout(() => { t.style.opacity = '0' }, 1500)
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

// Restore token from localStorage
const saved = localStorage.getItem('cb-token')
if (saved) { document.getElementById('tokenInput').value = saved; loadAll() }
</script>
</body>
</html>`
