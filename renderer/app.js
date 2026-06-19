// ---- State ----
const state = {
  evidence: {},          // key -> 'yes' | 'no' (absent = neutral)
  visible: 3,            // sichtbare Beweise je nach Schwierigkeit
  showImpossible: false,
  showBehaviors: true,
  open: new Set(),       // manuell aufgeklappte (angepinnte) Geister
  excluded: new Set(),   // manuell abgewählte Geister (Rechtsklick)
  soundOn: true,
  ghostCompact: false,
  ghostSearchQuery: '',
  ghostOnlyPossible: true,
  objectives: {},
  roundObjectives: [],   // nur die für diese Runde gewählten Ziel-Keys
  suspectGhost: '',
};

let objEditMode = false;
let prevPossibleCount = null;
const undoStack = [];
const UNDO_MAX = 20;
let streamLayoutBackup = null;
let overlayMode = 'full';

// ---- Sync (Multiplayer) ----
const sync = {
  ws: null,
  id: null,
  connected: false,
  phase: 'off', // off | connecting | connected | error
  reconnectTimer: null,
  manualOff: false,
  peers: new Map(),
  pingTimer: null,
  lastPingMs: null,
  connectAttempts: 0,
};

// Der Gratis-Relay (Render) schläft nach Leerlauf ein – beim ersten Verbinden
// mehrfach versuchen, während er aufwacht (~30 s).
const MAX_WAKE_ATTEMPTS = 4;

function wakeRelay(url) {
  const h = relayHealthUrl(url);
  if (!h) return;
  // Nur anstoßen, Antwort egal – weckt den schlafenden Server.
  fetch(h, { cache: 'no-store', mode: 'no-cors' }).catch(() => {});
}

function normalizeWsUrl(url) {
  url = (url || '').trim();
  if (!url) return DEFAULT_RELAY_URL;
  if (!/^wss?:\/\//i.test(url)) url = 'wss://' + url.replace(/^\/\//, '');
  return url;
}

function randomRoom() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function syncForm() {
  return {
    serverUrl: normalizeWsUrl(document.getElementById('sync-server')?.value),
    room: (document.getElementById('sync-room')?.value || '').trim().toUpperCase(),
    name: (document.getElementById('sync-name')?.value || 'Spieler').trim().slice(0, 24) || 'Spieler',
    color: document.getElementById('sync-color')?.value || '#7c5cff',
  };
}

function saveSyncConfig(patch) {
  window.overlay?.setConfig({ sync: patch });
}

function saveUiConfig(patch) {
  window.overlay?.setConfig({ ui: patch });
}

function relayHealthUrl(wsUrl) {
  try {
    const u = new URL(normalizeWsUrl(wsUrl));
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = '/health';
    u.search = '';
    return u.toString();
  } catch (_) {
    return '';
  }
}

function setSyncState(phase, detail) {
  sync.phase = phase;
  const dot = document.getElementById('sync-dot');
  const status = document.getElementById('sync-status');
  const btn = document.getElementById('sync-connect');
  const room = (document.getElementById('sync-room')?.value || '').trim().toUpperCase();
  const peerCount = sync.peers.size;

  if (dot) {
    dot.className = 'sync-dot ' + (phase === 'connected' ? 'on' : phase);
  }

  const labels = {
    off: 'Sync getrennt',
    connecting: 'Verbinde …',
    connected: 'Sync verbunden',
    error: 'Sync-Fehler',
  };
  let title = labels[phase] || labels.off;
  if (room) title += ` · Raum ${room}`;
  if (phase === 'connected') title += ` · ${peerCount} Mitspieler`;
  if (sync.lastPingMs != null && phase === 'connected') title += ` · ${sync.lastPingMs}ms`;
  if (detail) title += ` · ${detail}`;
  if (dot) dot.title = title;

  if (status) {
    if (phase === 'connected') status.textContent = `Verbunden${peerCount ? ` (${peerCount})` : ''}`;
    else if (phase === 'connecting') status.textContent = 'Verbinde …';
    else if (phase === 'error') status.textContent = 'Fehler';
    else status.textContent = 'Getrennt';
  }
  if (btn) btn.textContent = phase === 'connected' || phase === 'connecting' ? 'Trennen' : 'Verbinden';
  renderSyncPeers();
}

function startSyncPing() {
  clearInterval(sync.pingTimer);
  sync.pingTimer = setInterval(() => {
    if (!sync.connected) return;
    const url = relayHealthUrl(syncForm().serverUrl);
    if (!url) return;
    const t0 = performance.now();
    fetch(url, { cache: 'no-store' })
      .then((r) => { if (r.ok) sync.lastPingMs = Math.round(performance.now() - t0); })
      .catch(() => { sync.lastPingMs = null; })
      .finally(() => setSyncState('connected'));
  }, 30000);
}

function stopSyncPing() {
  clearInterval(sync.pingTimer);
  sync.pingTimer = null;
  sync.lastPingMs = null;
}

function setSyncUi(connected) {
  setSyncState(connected ? 'connected' : 'off');
}

function renderSyncPeers() {
  const el = document.getElementById('sync-peers');
  if (!el) return;
  if (!sync.connected) { el.innerHTML = ''; return; }
  const peers = [...sync.peers.values()];
  if (!peers.length) {
    el.innerHTML = '<div class="sync-peer-empty">Warte auf Mitspieler …</div>';
    return;
  }
  el.innerHTML = peers.map((p) =>
    `<span class="sync-peer-chip"><i style="background:${p.color}"></i>${p.name}</span>`
  ).join('');
}

function peerMarksFor(key) {
  const out = [];
  for (const p of sync.peers.values()) {
    const st = p.evidence && p.evidence[key];
    if (st === 'yes' || st === 'no') out.push({ name: p.name, color: p.color, st });
  }
  return out;
}

function showSyncToast(text) {
  const el = document.getElementById('sync-toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(showSyncToast._t);
  showSyncToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

function syncPush() {
  if (!sync.connected || !sync.ws || sync.ws.readyState !== WebSocket.OPEN) return;
  sync.ws.send(JSON.stringify({
    t: 'state',
    evidence: { ...state.evidence },
    pins: [...state.open],
  }));
}

function applyPeer(peer, isNew) {
  const prev = sync.peers.get(peer.id);
  sync.peers.set(peer.id, peer);

  if (!isNew && prev && prev.evidence) {
    for (const ev of EVIDENCE) {
      const was = prev.evidence[ev.key];
      const now = peer.evidence && peer.evidence[ev.key];
      if (now && now !== was) {
        const mark = now === 'yes' ? '✔' : '✕';
        showSyncToast(`${peer.name}: ${ev.short} ${mark}`);
      }
    }
  }
  render();
  if (sync.connected) setSyncState('connected');
}

function handleSyncMessage(msg) {
  if (msg.t === 'welcome') {
    sync.id = msg.id;
    const f = syncForm();
    sync.ws.send(JSON.stringify({ t: 'join', room: f.room, name: f.name, color: f.color }));
    return;
  }
  if (msg.t === 'peers' && Array.isArray(msg.peers)) {
    sync.peers.clear();
    for (const p of msg.peers) sync.peers.set(p.id, p);
    if (sync.connected) setSyncState('connected');
    render();
    return;
  }
  if (msg.t === 'peer') {
    const isNew = !sync.peers.has(msg.id);
    if (isNew) showSyncToast(`${msg.name} ist beigetreten`);
    applyPeer(msg, isNew);
    return;
  }
  if (msg.t === 'left') {
    const p = sync.peers.get(msg.id);
    if (p) showSyncToast(`${p.name} hat den Raum verlassen`);
    sync.peers.delete(msg.id);
    render();
    if (sync.connected) setSyncState('connected');
  }
}

function syncConnect() {
  if (sync.connected) {
    syncDisconnect(true);
    return;
  }
  sync.connectAttempts = 0;
  connectSync();
}

function connectSync() {
  const f = syncForm();
  if (!f.room) {
    showSyncToast('Bitte Raumcode eingeben');
    setSyncState('error', 'Kein Raumcode');
    return;
  }

  saveSyncConfig(f);
  clearTimeout(sync.reconnectTimer);
  sync.manualOff = false;
  sync.connectAttempts += 1;
  wakeRelay(f.serverUrl);
  if (sync.connectAttempts === 1) {
    setSyncState('connecting', 'verbinde …');
    showSyncToast('Verbinde … (Server wacht ggf. ~30 s auf)');
  } else {
    setSyncState('connecting', `Server wacht auf … (Versuch ${sync.connectAttempts})`);
  }

  try {
    const ws = new WebSocket(f.serverUrl);
    sync.ws = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      sync.connected = true;
      sync.connectAttempts = 0;
      setSyncState('connected');
      startSyncPing();
    };

    ws.onmessage = (e) => {
      try { handleSyncMessage(JSON.parse(e.data)); } catch (_) {}
    };

    ws.onclose = () => {
      const wasConnected = sync.connected;
      sync.connected = false;
      sync.ws = null;
      sync.peers.clear();
      stopSyncPing();
      if (wasConnected && !sync.manualOff) {
        setSyncState('connecting', 'Neu verbinden …');
        showSyncToast('Verbindung verloren – neu verbinden in 5s …');
        sync.reconnectTimer = setTimeout(connectSync, 5000);
      } else if (wasConnected) {
        setSyncState('off');
        showSyncToast('Verbindung getrennt');
      } else if (!opened && !sync.manualOff) {
        if (sync.connectAttempts < MAX_WAKE_ATTEMPTS) {
          setSyncState('connecting', `Server wacht auf … (Versuch ${sync.connectAttempts + 1})`);
          sync.reconnectTimer = setTimeout(connectSync, 8000);
        } else {
          setSyncState('error', 'Server nicht erreichbar');
          showSyncToast('Server nicht erreichbar – später erneut „Verbinden"');
        }
      } else {
        setSyncState('off');
      }
      sync.manualOff = false;
    };

    ws.onerror = () => {
      if (!opened) {
        setSyncState('error', 'Verbindung fehlgeschlagen');
        showSyncToast('Sync-Fehler: Server nicht erreichbar oder URL falsch');
      }
    };
  } catch (_) {
    setSyncState('error', 'Ungültige URL');
    showSyncToast('Ungültige Server-URL (wss://…)');
  }
}

function syncDisconnect(manual) {
  sync.manualOff = manual !== false;
  clearTimeout(sync.reconnectTimer);
  sync.reconnectTimer = null;
  stopSyncPing();
  if (sync.ws) {
    sync.ws.onclose = null;
    sync.ws.close();
    sync.ws = null;
  }
  sync.connected = false;
  sync.id = null;
  sync.peers.clear();
  setSyncState('off');
}

function wireSync() {
  document.getElementById('btn-sync')?.addEventListener('click', () => navigateTo('sync'));
  document.getElementById('sync-connect')?.addEventListener('click', syncConnect);
  document.getElementById('sync-random')?.addEventListener('click', () => {
    const inp = document.getElementById('sync-room');
    if (inp) inp.value = randomRoom();
  });
  document.getElementById('sync-copy-room')?.addEventListener('click', copyRoomCode);

  const roomInp = document.getElementById('sync-room');
  roomInp?.addEventListener('input', () => setSyncState(sync.phase));
  roomInp?.addEventListener('change', () => saveSyncConfig(syncForm()));

  for (const id of ['sync-server', 'sync-name', 'sync-color']) {
    document.getElementById(id)?.addEventListener('change', () => saveSyncConfig(syncForm()));
  }
}

const evByKey = Object.fromEntries(EVIDENCE.map((e) => [e.key, e]));

// Echte PNG-Grafik verwenden, falls vorhanden – sonst Fallback auf das SVG.
const pngAvailable = {};
function evIcon(ev) {
  if (ev.png && pngAvailable[ev.key]) return `<img class="ico-img" src="${ev.png}" alt="">`;
  return ev.svg;
}
function probePng(ev) {
  return new Promise((resolve) => {
    if (!ev.png) return resolve();
    const img = new Image();
    img.onload = () => { pngAvailable[ev.key] = img.naturalWidth > 0; resolve(); };
    img.onerror = () => { pngAvailable[ev.key] = false; resolve(); };
    img.src = ev.png;
  });
}

// ---- Filter-Logik ----
function isPossible(ghost) {
  const C = Object.keys(state.evidence).filter((k) => state.evidence[k] === 'yes');
  const R = new Set(Object.keys(state.evidence).filter((k) => state.evidence[k] === 'no'));
  const real = ghost.evidence;
  const full = ghost.orbsAlways ? [...real, 'orbs'] : real;

  // Jeder bestätigte Beweis muss zum Geist gehören.
  for (const c of C) if (!full.includes(c)) return false;

  // Mimic zeigt Kugeln immer – Kugeln auszuschließen widerlegt ihn.
  if (ghost.orbsAlways && R.has('orbs')) return false;

  // Es müssen genug nicht-ausgeschlossene echte Beweise übrig sein,
  // damit der Geist die sichtbare Anzahl überhaupt zeigen kann.
  const realNotRuled = real.filter((k) => !R.has(k));
  if (realNotRuled.length < state.visible) return false;

  // Mehr bestätigte echte Beweise als sichtbar ist unmöglich.
  const confirmedReal = real.filter((k) => C.includes(k)).length;
  if (confirmedReal > state.visible) return false;

  return true;
}

function pushUndo() {
  undoStack.push({ ...state.evidence });
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

function undoEvidence() {
  if (!undoStack.length) {
    showSyncToast('Nichts zum Rückgängigmachen');
    return;
  }
  state.evidence = undoStack.pop();
  render();
}

function cycleEvidence(key) {
  const st = state.evidence[key];
  pushUndo();
  if (!st) state.evidence[key] = 'yes';
  else if (st === 'yes') state.evidence[key] = 'no';
  else delete state.evidence[key];
  render();
}

function remainingToCheck(ghost) {
  return ghost.evidence.filter((k) => !state.evidence[k]);
}

function setEvidence(key, next) {
  pushUndo();
  if (next) state.evidence[key] = next;
  else delete state.evidence[key];
  render();
}

// ---- Rendering ----
function renderEvidenceBar() {
  const bar = document.getElementById('evidence-bar');
  bar.innerHTML = '';
  for (const ev of EVIDENCE) {
    const st = state.evidence[ev.key];
    const el = document.createElement('div');
    const peerMarks = peerMarksFor(ev.key);
    const conflictPeers = (st === 'yes' || st === 'no') ? peerMarks.filter((p) => p.st && p.st !== st) : [];
    const conflict = conflictPeers.length > 0;
    el.className = 'ev' + (st === 'yes' ? ' yes' : st === 'no' ? ' no' : '') + (conflict ? ' conflict' : '');
    const peerHtml = peerMarks.length
      ? `<div class="ev-peers">${peerMarks.map((p) =>
          `<span class="ev-peer" style="background:${p.color}" title="${p.name}: ${p.st === 'yes' ? '✔' : '✕'}"></span>`
        ).join('')}</div>`
      : '';
    const conflictHtml = conflict
      ? `<div class="ev-conflict" title="Konflikt – ${conflictPeers.map((p) => `${p.name}: ${p.st === 'yes' ? '✔' : '✕'}`).join(', ')} · du: ${st === 'yes' ? '✔' : '✕'}">⚠</div>`
      : '';

    el.innerHTML =
      `<div class="ev-mark">${st === 'yes' ? '✔' : st === 'no' ? '✕' : ''}</div>` +
      `<div class="ev-ico">${evIcon(ev)}</div>` +
      `<div class="ev-label">${ev.short}</div>` +
      peerHtml + conflictHtml;
    el.title = ev.name + ' – Links: ausgewählt · Rechts: ausgeschlossen';

    // Linksklick = "gefunden" (✔), Rechtsklick = "ausgeschlossen" (✕). Erneut = neutral.
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        const next = st === 'yes' ? undefined : 'yes';
        setEvidence(ev.key, next);
      } else if (e.button === 2) {
        e.preventDefault();
        const next = st === 'no' ? undefined : 'no';
        setEvidence(ev.key, next);
      } else {
        return;
      }
      const tile = bar.lastChild;
      if (tile) {
        tile.classList.remove('ev-pulse');
        void tile.offsetWidth;
        tile.classList.add('ev-pulse');
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    bar.appendChild(el);
  }
}

function renderStatus(possible) {
  const status = document.getElementById('status');
  const hint = document.getElementById('next-hint');

  status.classList.toggle('solved', possible.length === 1);
  if (possible.length === 1) {
    state.suspectGhost = possible[0].name;
    status.textContent = `✓ Es ist: ${possible[0].name}`;
  } else if (possible.length === 0) {
    status.textContent = 'Keine Übereinstimmung – Beweise prüfen';
  } else {
    status.textContent = `${possible.length} mögliche Geister`;
  }

  // Welche neutralen Beweise lohnt es noch zu testen?
  const stillUseful = new Set();
  for (const g of possible) for (const k of remainingToCheck(g)) stillUseful.add(k);
  if (possible.length > 1 && stillUseful.size) {
    const names = [...stillUseful].map((k) => evByKey[k].short).join(', ');
    hint.innerHTML = `Noch testen: <b>${names}</b>`;
  } else {
    hint.textContent = '';
  }
}

function renderGhosts(possible) {
  const list = document.getElementById('ghost-list');
  list.innerHTML = '';
  const possibleSet = new Set(possible.map((g) => g.name));
  const q = (state.ghostSearchQuery || '').trim().toLowerCase();

  const rank = (g) => {
    if (possibleSet.has(g.name)) return 0;
    if (state.excluded.has(g.name)) return 1;
    return 2;
  };
  let ordered = [...GHOSTS].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  if (q) ordered = ordered.filter((g) => g.name.toLowerCase().includes(q));
  if (state.ghostOnlyPossible) ordered = ordered.filter((g) => possibleSet.has(g.name));

  for (const g of ordered) {
    const possibleNow = possibleSet.has(g.name);
    const isExcluded = state.excluded.has(g.name);
    if (!possibleNow && !isExcluded && !state.showImpossible && !q) continue;

    const pinned = possible.length === 1 && possibleNow;
    const opened = state.open.has(g.name);
    const showDetails = !state.ghostCompact || opened || pinned;

    const card = document.createElement('div');
    card.className =
      'ghost' +
      (possibleNow ? '' : ' impossible') +
      (isExcluded ? ' excluded' : '') +
      (pinned ? ' pinned' : '') +
      (opened ? ' open' : '') +
      (state.ghostCompact && !showDetails ? ' ghost-short' : '');

    const full = g.orbsAlways ? [...g.evidence, 'orbs'] : g.evidence;
    const icons = full
      .map((k) => {
        const st = state.evidence[k];
        const cls = st === 'yes' ? 'yes' : st === 'no' ? 'no' : 'has';
        return `<span class="ev-icon ${cls}" title="${evByKey[k].name}">${evIcon(evByKey[k])}</span>`;
      })
      .join('');

    let body = '';
    if (showDetails) {
      body += `<div class="line"><b>Tempo:</b> ${g.speed}</div>`;
      body += `<div class="line"><b>Jagd:</b> ${g.hunt}</div>`;
      if (state.showBehaviors) {
        if (g.ability) body += `<div class="line"><b>Sonderfähigkeit:</b> ${g.ability}</div>`;
        if (g.strength) body += `<div class="line str"><b>Stärke:</b> ${g.strength}</div>`;
        if (g.weakness) body += `<div class="line wk"><b>Schwäche:</b> ${g.weakness}</div>`;
        if (g.behaviors && g.behaviors.length)
          body += `<div class="line"><b>Verhalten:</b><ul>${g.behaviors.map((b) => `<li>${b}</li>`).join('')}</ul></div>`;
        if (g.tip) body += `<div class="tip">💡 ${g.tip}</div>`;
      }
    }

    card.innerHTML =
      `<div class="ghost-head"><span class="ghost-name">${g.name}</span><span class="ghost-icons">${icons}</span></div>` +
      `<div class="ghost-body">${body}</div>`;

    const head = card.querySelector('.ghost-head');
    head.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (state.open.has(g.name)) state.open.delete(g.name);
        else state.open.add(g.name);
        render();
      } else if (e.button === 2) {
        e.preventDefault();
        if (state.excluded.has(g.name)) state.excluded.delete(g.name);
        else state.excluded.add(g.name);
        render();
      }
    });
    head.addEventListener('contextmenu', (e) => e.preventDefault());

    list.appendChild(card);
  }
}

function render() {
  // Möglich = passt zu den Beweisen UND nicht manuell abgewählt.
  const possible = GHOSTS.filter((g) => isPossible(g) && !state.excluded.has(g.name));
  renderEvidenceBar();
  renderObjectives();
  renderMiniBubbles(possible);
  renderStatus(possible);
  renderSuspect(possible);
  renderGhosts(possible);
  maybeSoundAlarm(possible.length);
  syncPush();
}

// Geistername oben rechts in der Titelleiste.
function renderSuspect(possible) {
  const el = document.getElementById('suspect-ghost');
  if (!el) return;
  if (possible.length === 1) {
    el.textContent = '👻 ' + possible[0].name;
    el.classList.add('solved');
  } else if (possible.length === 0) {
    el.textContent = 'kein Treffer';
    el.classList.remove('solved');
  } else {
    el.textContent = possible.length + ' möglich';
    el.classList.remove('solved');
  }
}

function getMiniGhostLabel(possible) {
  if (state.suspectGhost) return state.suspectGhost;
  if (possible.length === 1) return possible[0].name;
  if (possible.length === 0) return 'Unbekannt';
  return `Offen (${possible.length})`;
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderObjectives() {
  const panel = document.getElementById('objectives-panel');
  if (!panel) return;

  // Bearbeiten-Modus: die Ziele dieser Runde auswählen (aus der vollen Liste).
  if (objEditMode) {
    const chips = OBJECTIVES.map((obj) => {
      const active = state.roundObjectives.includes(obj.key);
      return `<button type="button" class="obj-pick${active ? ' active' : ''}" data-pick="${obj.key}">${active ? '✓ ' : '＋ '}${obj.label}</button>`;
    }).join('');
    panel.innerHTML =
      `<div class="obj-head">Ziele dieser Runde wählen<button type="button" class="obj-edit" id="obj-done">Fertig</button></div>` +
      `<div class="obj-pick-list">${chips}</div>`;
    panel.querySelector('#obj-done')?.addEventListener('click', () => { objEditMode = false; render(); });
    panel.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.pick;
      const i = state.roundObjectives.indexOf(k);
      if (i >= 0) state.roundObjectives.splice(i, 1);
      else state.roundObjectives.push(k);
      render();
    }));
    return;
  }

  // Normalansicht: nur die gewählten Ziele dieser Runde abhaken.
  const active = OBJECTIVES.filter((o) => state.roundObjectives.includes(o.key));
  const head = `<div class="obj-head">Ziele dieser Runde<button type="button" class="obj-edit" id="obj-edit" title="Ziele wählen">✎</button></div>`;
  if (!active.length) {
    panel.innerHTML = head + `<div class="obj-empty">Noch keine Ziele – ✎ zum Wählen</div>`;
  } else {
    const items = active.map((obj) => {
      const done = !!state.objectives[obj.key];
      return `<label class="obj-item${done ? ' done' : ''}"><input type="checkbox" data-obj="${obj.key}"${done ? ' checked' : ''} /><span>${obj.label}</span></label>`;
    }).join('');
    panel.innerHTML = head + `<div class="obj-list">${items}</div>`;
    panel.querySelectorAll('input[data-obj]').forEach((inp) => {
      inp.addEventListener('change', () => { state.objectives[inp.dataset.obj] = inp.checked; render(); });
    });
  }
  panel.querySelector('#obj-edit')?.addEventListener('click', () => { objEditMode = true; render(); });
}

// Mini-Modus ("Overlay aus"): Geist, Ziele und Beweis-Bubbles.
function renderMiniBubbles(possible) {
  const el = document.getElementById('mini-bubbles');
  if (!el) return;
  const poss = possible || GHOSTS.filter((g) => isPossible(g) && !state.excluded.has(g.name));
  const ghostLabel = getMiniGhostLabel(poss);
  const found = EVIDENCE.filter((ev) => state.evidence[ev.key] === 'yes');
  const objSource = OBJECTIVES.filter((o) => state.roundObjectives.includes(o.key))
    .map((o) => ({ label: o.label, done: !!state.objectives[o.key] }));
  const objHtml = objSource.map((obj) =>
    `<span class="mini-obj${obj.done ? ' done' : ''}" title="${escHtml(obj.label)}">${obj.done ? '✓' : '○'} ${escHtml(obj.label)}</span>`
  ).join('');
  const evHtml = found
    .map((ev) => `<span class="mini-bubble" title="${ev.name}"><span class="ev-ico">${evIcon(ev)}</span></span>`)
    .join('');
  el.innerHTML =
    `<div class="mini-ghost" title="Vermuteter / eindeutiger Geist">${ghostLabel}</div>` +
    `<div class="mini-objs">${objHtml}</div>` +
    (evHtml ? `<div class="mini-ev-row">${evHtml}</div>` : '');
  el.classList.remove('empty');
  if (overlayMode === 'mini') scheduleMiniBounds();
}

function applyOverlayMode(mode) {
  overlayMode = mode === 'mini' ? 'mini' : 'full';
  document.getElementById('app')?.classList.toggle('overlay-mini', overlayMode === 'mini');
  const possible = GHOSTS.filter((g) => isPossible(g) && !state.excluded.has(g.name));
  renderMiniBubbles(possible);
}

function scheduleMiniBounds() {
  requestAnimationFrame(() => {
    if (overlayMode !== 'mini') return;
    const el = document.getElementById('mini-bubbles');
    if (!el) return;
    window.overlay?.setMiniBounds?.(el.offsetWidth + 12, el.offsetHeight + 12);
  });
}

// Sound + kurzes Aufleuchten, sobald nur noch 1 Geist möglich ist.
function maybeSoundAlarm(count) {
  if (state.soundOn && count === 1 && prevPossibleCount !== null && prevPossibleCount !== 1) {
    beep();
    const s = document.getElementById('status');
    s.classList.remove('flash');
    void s.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
    s.classList.add('flash');
  }
  prevPossibleCount = count;
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.36);
    setTimeout(() => ctx.close(), 600);
  } catch (_) {}
}

function reset() {
  state.evidence = {};
  state.open.clear();
  state.excluded.clear();
  state.objectives = {};
  state.roundObjectives = [];
  objEditMode = false;
  state.suspectGhost = '';
  render();
}

async function copyRoomCode() {
  const room = (document.getElementById('sync-room')?.value || '').trim().toUpperCase();
  if (!room) {
    showSyncToast('Kein Raumcode zum Kopieren');
    return;
  }
  try {
    await navigator.clipboard.writeText(room);
    showSyncToast(`Raumcode ${room} kopiert`);
  } catch (_) {
    showSyncToast('Kopieren fehlgeschlagen');
  }
}

async function applyStreamLayout(enable) {
  const btn = document.getElementById('btn-stream-layout');
  if (enable) {
    const cfg = await window.overlay?.getConfig?.() || {};
    streamLayoutBackup = {
      opacity: cfg.opacity ?? 1,
      scale: cfg.scale ?? 1,
      compact: !!cfg.ui?.compact,
      showBehaviors: state.showBehaviors,
    };
    window.overlay?.setConfig({ opacity: 0.85, scale: 1.2 });
    const op = document.getElementById('opacity');
    const sc = document.getElementById('scale');
    if (op) op.value = '0.85';
    if (sc) sc.value = '1.2';
    state.showBehaviors = false;
    const beh = document.getElementById('toggle-behaviors');
    if (beh) beh.checked = false;
    saveUiConfig({ compact: true, streamLayout: true });
    applyTheme({ ...getUiSnapshot(), compact: true, streamLayout: true });
    const compact = document.getElementById('toggle-compact');
    if (compact) compact.checked = true;
    if (btn) btn.textContent = 'Stream-Layout aus';
    render();
    showSyncToast('Stream-Layout aktiv');
  } else if (streamLayoutBackup) {
    const b = streamLayoutBackup;
    window.overlay?.setConfig({ opacity: b.opacity, scale: b.scale });
    const op = document.getElementById('opacity');
    const sc = document.getElementById('scale');
    if (op) op.value = b.opacity;
    if (sc) sc.value = b.scale;
    state.showBehaviors = b.showBehaviors;
    const beh = document.getElementById('toggle-behaviors');
    if (beh) beh.checked = b.showBehaviors;
    saveUiConfig({ compact: b.compact, streamLayout: false });
    applyTheme({ ...getUiSnapshot(), compact: b.compact, streamLayout: false });
    const compact = document.getElementById('toggle-compact');
    if (compact) compact.checked = b.compact;
    streamLayoutBackup = null;
    if (btn) btn.textContent = 'Stream-Layout';
    render();
    showSyncToast('Stream-Layout aus');
  }
}

async function toggleStreamLayout() {
  const cfg = await window.overlay?.getConfig?.().catch(() => ({}));
  const on = !!(cfg?.ui?.streamLayout);
  await applyStreamLayout(!on);
}

// ---- UI / Theme / Pages ----
const THEME_ACCENTS = { default: '#7c5cff', midnight: '#4a9eff', ember: '#ff8c42' };
const PAGES = ['main', 'sync', 'settings'];
let currentPage = 'main';

function navigateTo(page, { persist = true } = {}) {
  if (!PAGES.includes(page)) page = 'main';
  currentPage = page;
  for (const p of PAGES) {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', p !== page);
  }
  document.getElementById('btn-main')?.classList.toggle('active', page === 'main');
  document.getElementById('btn-sync')?.classList.toggle('active', page === 'sync');
  document.getElementById('btn-settings')?.classList.toggle('active', page === 'settings');
  if (persist) saveUiConfig({ page });
}

function getPanelState() {
  return { page: currentPage };
}

function applyPanels(ui) {
  const page = typeof ui === 'string' ? ui : ui?.page;
  if (page && PAGES.includes(page)) {
    navigateTo(page, { persist: false });
    return;
  }
  if (ui && typeof ui === 'object') {
    if (ui.settings) navigateTo('settings', { persist: false });
    else if (ui.sync) navigateTo('sync', { persist: false });
    else navigateTo('main', { persist: false });
    return;
  }
  navigateTo('main', { persist: false });
}

function applyTheme(ui) {
  const app = document.getElementById('app');
  if (!app || !ui) return;
  app.classList.toggle('compact', !!ui.compact);
  app.classList.toggle('minimal', !!ui.minimal);
  app.classList.toggle('stream-layout', !!ui.streamLayout);
  app.classList.toggle('no-anim', ui.animations === false);
  app.classList.remove('theme-midnight', 'theme-ember');
  if (ui.theme === 'midnight') app.classList.add('theme-midnight');
  if (ui.theme === 'ember') app.classList.add('theme-ember');
  const accent = ui.accent || THEME_ACCENTS[ui.theme] || THEME_ACCENTS.default;
  app.style.setProperty('--accent', accent);
  const toolbar = document.getElementById('ghost-toolbar');
  if (toolbar) toolbar.classList.toggle('hidden', !!ui.compact);
}

function applyUiFromConfig(cfg) {
  const ui = cfg.ui || {};
  applyPanels(ui.page ?? ui.panels);
  applyTheme(ui);
  state.ghostCompact = !!ui.ghostCompact;
  state.ghostOnlyPossible = ui.ghostSearchOnlyPossible !== false;
  const compact = document.getElementById('toggle-compact');
  const minimal = document.getElementById('toggle-minimal');
  const ghostCompact = document.getElementById('toggle-ghost-compact');
  const ghostOnly = document.getElementById('ghost-only-possible');
  const themeSel = document.getElementById('theme-select');
  const accent = document.getElementById('accent-color');
  const streamBtn = document.getElementById('btn-stream-layout');
  const animations = document.getElementById('toggle-animations');
  if (animations) animations.checked = ui.animations !== false;
  if (compact) compact.checked = !!ui.compact;
  if (minimal) minimal.checked = !!ui.minimal;
  if (ghostCompact) ghostCompact.checked = !!ui.ghostCompact;
  if (ghostOnly) ghostOnly.checked = state.ghostOnlyPossible;
  if (themeSel && ui.theme) themeSel.value = ui.theme;
  if (accent && ui.accent) accent.value = ui.accent;
  if (streamBtn) streamBtn.textContent = ui.streamLayout ? 'Stream-Layout aus' : 'Stream-Layout';
  syncCustomSelects?.();
}

// ---- Settings / UI-Buttons ----
function setHotkeyLabel(binding) {
  const label = (binding && binding.label) || 'H';
  const a = document.getElementById('hotkey-label');
  const b = document.getElementById('hk-toggle');
  if (a) a.textContent = label;
  if (b) b.textContent = label;
}

function wireUi() {
  document.getElementById('btn-main')?.addEventListener('click', () => navigateTo('main'));
  document.getElementById('btn-reset').addEventListener('click', reset);
  document.getElementById('btn-undo')?.addEventListener('click', undoEvidence);
  document.getElementById('btn-settings').addEventListener('click', () => navigateTo('settings'));

  document.getElementById('btn-stream-layout')?.addEventListener('click', toggleStreamLayout);

  document.getElementById('toggle-minimal')?.addEventListener('change', (e) => {
    saveUiConfig({ minimal: e.target.checked });
    applyTheme({ ...getUiSnapshot(), minimal: e.target.checked });
  });
  document.getElementById('toggle-ghost-compact')?.addEventListener('change', (e) => {
    state.ghostCompact = e.target.checked;
    saveUiConfig({ ghostCompact: e.target.checked });
    render();
  });
  document.getElementById('ghost-search')?.addEventListener('input', (e) => {
    state.ghostSearchQuery = e.target.value;
    render();
  });
  document.getElementById('ghost-only-possible')?.addEventListener('change', (e) => {
    state.ghostOnlyPossible = e.target.checked;
    saveUiConfig({ ghostSearchOnlyPossible: e.target.checked });
    render();
  });

  document.getElementById('toggle-compact')?.addEventListener('change', (e) => {
    saveUiConfig({ compact: e.target.checked });
    applyTheme({ ...getUiSnapshot(), compact: e.target.checked });
  });
  document.getElementById('theme-select')?.addEventListener('change', (e) => {
    const theme = e.target.value;
    const accent = THEME_ACCENTS[theme] || THEME_ACCENTS.default;
    document.getElementById('accent-color').value = accent;
    saveUiConfig({ theme, accent });
    applyTheme({ ...getUiSnapshot(), theme, accent });
  });
  document.getElementById('accent-color')?.addEventListener('input', (e) => {
    const accent = e.target.value;
    saveUiConfig({ accent });
    applyTheme({ ...getUiSnapshot(), accent });
  });

  document.getElementById('btn-export-config')?.addEventListener('click', async () => {
    const r = await window.overlay?.exportConfig?.();
    showSyncToast(r?.ok ? 'Einstellungen exportiert' : 'Export abgebrochen');
  });
  document.getElementById('btn-import-config')?.addEventListener('click', async () => {
    const r = await window.overlay?.importConfig?.();
    showSyncToast(r?.ok ? 'Einstellungen importiert' : (r?.error || 'Import fehlgeschlagen'));
  });
  document.getElementById('btn-open-logs')?.addEventListener('click', () => window.overlay?.openLogs?.());

  document.getElementById('btn-check-update')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-update');
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Suche …';
    const r = await window.overlay?.checkUpdate?.();
    btn.disabled = false; btn.textContent = old;
    if (!r) return;
    if (r.reason === 'dev') showSyncToast('Update-Check nur in der gebauten App (.exe)');
    else if (r.ok && r.available) showSyncToast('Neue Version verfügbar: ' + r.version);
    else if (r.ok) showSyncToast('Du hast die neueste Version ✓');
    else showSyncToast('Update-Check fehlgeschlagen');
  });

  document.getElementById('update-action')?.addEventListener('click', async () => {
    const btn = document.getElementById('update-action');
    if (btn?.dataset.mode === 'install') {
      window.overlay?.installUpdate?.();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Lädt …';
    const r = await window.overlay?.downloadUpdate?.();
    if (!r?.ok) {
      btn.disabled = false;
      btn.textContent = 'Jetzt updaten';
      showSyncToast('Update-Download fehlgeschlagen');
    }
  });

  document.getElementById('evidence-count').addEventListener('change', (e) => {
    state.visible = parseInt(e.target.value, 10);
    render();
  });
  document.getElementById('opacity').addEventListener('input', (e) => {
    window.overlay?.setConfig({ opacity: parseFloat(e.target.value) });
  });
  document.getElementById('scale').addEventListener('input', (e) => {
    window.overlay?.setConfig({ scale: parseFloat(e.target.value) });
  });
  document.getElementById('toggle-stream').addEventListener('change', (e) => {
    window.overlay?.setConfig({ contentProtection: e.target.checked });
  });
  document.getElementById('toggle-impossible').addEventListener('change', (e) => {
    state.showImpossible = e.target.checked;
    render();
  });
  document.getElementById('toggle-behaviors').addEventListener('change', (e) => {
    state.showBehaviors = e.target.checked;
    render();
  });
  document.getElementById('toggle-sound').addEventListener('change', (e) => {
    state.soundOn = e.target.checked;
  });
  document.getElementById('toggle-animations')?.addEventListener('change', (e) => {
    saveUiConfig({ animations: e.target.checked });
    applyTheme({ ...getUiSnapshot(), animations: e.target.checked });
  });

  // Hotkey neu belegen
  const btnRebind = document.getElementById('btn-rebind');
  btnRebind.addEventListener('click', () => {
    btnRebind.textContent = '… drücken';
    btnRebind.disabled = true;
    window.overlay?.startHotkeyCapture();
  });

  if (window.overlay) {
    window.overlay.onReset(reset);
    window.overlay.onUndoEvidence?.(() => undoEvidence());
    window.overlay.onEvidenceKey?.((index) => {
      if (index >= 0 && index < EVIDENCE.length) cycleEvidence(EVIDENCE[index].key);
    });
    window.overlay.onSetMinimal?.((on) => {
      const el = document.getElementById('toggle-minimal');
      if (el) el.checked = !!on;
      saveUiConfig({ minimal: !!on });
      applyTheme({ ...getUiSnapshot(), minimal: !!on });
    });
    window.overlay.onClickThroughChanged((on) => {
      document.getElementById('clickthrough-banner').classList.toggle('hidden', !on);
    });
    window.overlay.onOverlayMode?.((mode) => applyOverlayMode(mode));
    window.overlay.onHotkeyCaptured((binding) => {
      setHotkeyLabel(binding);
      btnRebind.textContent = 'Ändern';
      btnRebind.disabled = false;
    });
    window.overlay.onUpdateStatus((info) => {
      if (!info || !info.available) return;
      const el = document.getElementById('update-banner');
      const text = document.getElementById('update-banner-text');
      const btn = document.getElementById('update-action');
      if (!el || !text) return;
      if (info.downloading) {
        text.textContent = `Update wird geladen … ${info.percent || 0}%`;
        if (btn) { btn.classList.remove('hidden'); btn.disabled = true; btn.textContent = 'Lädt …'; }
      } else if (info.downloaded) {
        text.textContent = `Version ${info.version} bereit – Neustart zum Installieren`;
        if (btn) {
          btn.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Neustarten & installieren';
          btn.dataset.mode = 'install';
        }
      } else {
        text.textContent = `Neue Version ${info.version} verfügbar`;
        if (btn) {
          btn.classList.remove('hidden');
          btn.disabled = false;
          btn.textContent = 'Jetzt updaten';
          btn.dataset.mode = 'download';
        }
      }
      el.classList.remove('hidden');
    });
    window.overlay.onConfigImported((cfg) => {
      if (cfg) applyUiFromConfig(cfg);
      initFromConfig();
    });
  }
}

function getUiSnapshot() {
  return {
    compact: document.getElementById('toggle-compact')?.checked,
    minimal: document.getElementById('toggle-minimal')?.checked,
    streamLayout: document.getElementById('btn-stream-layout')?.textContent === 'Stream-Layout aus',
    theme: document.getElementById('theme-select')?.value || 'default',
    accent: document.getElementById('accent-color')?.value,
    ghostCompact: document.getElementById('toggle-ghost-compact')?.checked,
    ghostSearchOnlyPossible: document.getElementById('ghost-only-possible')?.checked,
    animations: document.getElementById('toggle-animations')?.checked !== false,
    page: currentPage,
  };
}

// Gespeicherte Einstellungen laden und in die UI übernehmen.
async function initFromConfig() {
  if (!window.overlay?.getConfig) return false;
  try {
    const cfg = await window.overlay.getConfig();
    if (cfg.hotkey) {
      setHotkeyLabel(cfg.hotkey);
      const frHk = document.getElementById('fr-hotkey');
      if (frHk) frHk.textContent = cfg.hotkey.label || 'H';
    }
    applyUiFromConfig(cfg);
    if (cfg.ui?.streamLayout) streamLayoutBackup = null;
    const op = document.getElementById('opacity');
    const sc = document.getElementById('scale');
    const st = document.getElementById('toggle-stream');
    if (op && typeof cfg.opacity === 'number') op.value = cfg.opacity;
    if (sc && typeof cfg.scale === 'number') sc.value = cfg.scale;
    if (st) st.checked = !!cfg.contentProtection;
    const s = cfg.sync || {};
    const srv = document.getElementById('sync-server');
    const room = document.getElementById('sync-room');
    const name = document.getElementById('sync-name');
    const color = document.getElementById('sync-color');
    if (srv && s.serverUrl) srv.value = s.serverUrl;
    else if (srv) srv.value = DEFAULT_RELAY_URL;
    if (room && s.room) room.value = s.room;
    if (name && s.name) name.value = s.name;
    if (color && s.color) color.value = s.color;
    return !!(s.room && s.serverUrl);
  } catch (_) {
    return false;
  }
}

async function boot() {
  const appEl = document.getElementById('app');
  appEl?.classList.add('booting');

  wireUi();
  wireSync();
  wireOnboarding();

  const shouldSync = await initFromConfig();
  const ver = await window.overlay?.getVersion?.().catch(() => '');
  const verEl = document.getElementById('app-version');
  if (verEl && ver) verEl.textContent = 'v' + ver;
  await Promise.all(EVIDENCE.map(probePng));
  render();

  appEl?.classList.remove('booting');
  await window.overlay?.signalReady?.();

  if (shouldSync) syncConnect();
  maybeShowFirstRun?.();
}

boot();
