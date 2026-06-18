// ---- State ----
const state = {
  evidence: {},          // key -> 'yes' | 'no' (absent = neutral)
  visible: 3,            // sichtbare Beweise je nach Schwierigkeit
  showImpossible: false,
  showBehaviors: true,
  open: new Set(),       // manuell aufgeklappte (angepinnte) Geister
  excluded: new Set(),   // manuell abgewählte Geister (Rechtsklick)
  soundOn: true,         // Sound-Alarm bei nur 1 Geist
};

// Jagd-Schwellen (Standard 50%, Ausnahmen hier). Für die Sanity-Warnung.
const HUNT_PCT = { Demon: 70, Thaye: 75, Mare: 60, Raiju: 65, Shade: 35, Deogen: 40 };
function huntThreshold(g) {
  return HUNT_PCT[g.name] != null ? HUNT_PCT[g.name] : 50;
}

let lastPossible = [];
let prevPossibleCount = null;

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
};

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
  setSyncState('connecting');

  try {
    const ws = new WebSocket(f.serverUrl);
    sync.ws = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      sync.connected = true;
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
        setSyncState('error', 'Server nicht erreichbar');
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
  document.getElementById('btn-sync')?.addEventListener('click', () => {
    const panel = document.getElementById('sync-panel');
    panel?.classList.toggle('hidden');
    saveUiConfig({ panels: { ...getPanelState(), sync: panel && !panel.classList.contains('hidden') } });
  });
  document.getElementById('sync-connect')?.addEventListener('click', syncConnect);
  document.getElementById('sync-random')?.addEventListener('click', () => {
    const inp = document.getElementById('sync-room');
    if (inp) inp.value = randomRoom();
  });

  for (const id of ['sync-server', 'sync-room', 'sync-name', 'sync-color']) {
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

function remainingToCheck(ghost) {
  return ghost.evidence.filter((k) => !state.evidence[k]);
}

// ---- Rendering ----
function renderEvidenceBar() {
  const bar = document.getElementById('evidence-bar');
  bar.innerHTML = '';
  for (const ev of EVIDENCE) {
    const st = state.evidence[ev.key];
    const el = document.createElement('div');
    el.className = 'ev' + (st === 'yes' ? ' yes' : st === 'no' ? ' no' : '');
    const peerMarks = peerMarksFor(ev.key);
    const peerHtml = peerMarks.length
      ? `<div class="ev-peers">${peerMarks.map((p) =>
          `<span class="ev-peer" style="background:${p.color}" title="${p.name}: ${p.st === 'yes' ? '✔' : '✕'}"></span>`
        ).join('')}</div>`
      : '';

    el.innerHTML =
      `<div class="ev-mark">${st === 'yes' ? '✔' : st === 'no' ? '✕' : ''}</div>` +
      `<div class="ev-ico">${evIcon(ev)}</div>` +
      `<div class="ev-label">${ev.short}</div>` +
      peerHtml;
    el.title = ev.name + ' – Links: ausgewählt · Rechts: ausgeschlossen';

    // Linksklick = "gefunden" (✔), Rechtsklick = "ausgeschlossen" (✕). Erneut = neutral.
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        state.evidence[ev.key] = st === 'yes' ? undefined : 'yes';
      } else if (e.button === 2) {
        e.preventDefault();
        state.evidence[ev.key] = st === 'no' ? undefined : 'no';
      } else {
        return;
      }
      if (!state.evidence[ev.key]) delete state.evidence[ev.key];
      el.classList.remove('ev-pulse');
      void el.offsetWidth;
      el.classList.add('ev-pulse');
      render();
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

  // Reihenfolge: mögliche zuerst, dann abgewählte, dann (optional) unmögliche.
  const rank = (g) => {
    if (possibleSet.has(g.name)) return 0;
    if (state.excluded.has(g.name)) return 1;
    return 2;
  };
  const ordered = [...GHOSTS].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  for (const g of ordered) {
    const possibleNow = possibleSet.has(g.name);
    const isExcluded = state.excluded.has(g.name);
    // Abgewählte bleiben sichtbar (damit man sie zurückholen kann),
    // durch Beweise unmögliche nur, wenn die Option an ist.
    if (!possibleNow && !isExcluded && !state.showImpossible) continue;

    // Einziger übriger Geist bleibt automatisch aufgeklappt (grün).
    const pinned = possible.length === 1 && possibleNow;
    const opened = state.open.has(g.name);

    const card = document.createElement('div');
    card.className =
      'ghost' +
      (possibleNow ? '' : ' impossible') +
      (isExcluded ? ' excluded' : '') +
      (pinned ? ' pinned' : '') +
      (opened ? ' open' : '');

    const full = g.orbsAlways ? [...g.evidence, 'orbs'] : g.evidence;
    const icons = full
      .map((k) => {
        const st = state.evidence[k];
        const cls = st === 'yes' ? 'yes' : st === 'no' ? 'no' : 'has';
        return `<span class="ev-icon ${cls}" title="${evByKey[k].name}">${evIcon(evByKey[k])}</span>`;
      })
      .join('');

    let body = '';
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

    card.innerHTML =
      `<div class="ghost-head"><span class="ghost-name">${g.name}</span><span class="ghost-icons">${icons}</span></div>` +
      `<div class="ghost-body">${body}</div>`;

    // Linksklick = anpinnen (offen halten), Rechtsklick = Geist ab-/zuwählen.
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
  lastPossible = possible;
  renderEvidenceBar();
  renderStatus(possible);
  renderGhosts(possible);
  maybeSoundAlarm(possible.length);
  syncPush();
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
  render();
}

// ---- Tools (Timer) ----
function wireTools() {
  document.getElementById('btn-tools').addEventListener('click', () => {
    const panel = document.getElementById('tools');
    panel.classList.toggle('hidden');
    saveUiConfig({ panels: { ...getPanelState(), tools: panel && !panel.classList.contains('hidden') } });
  });
  document.getElementById('toggle-sound').addEventListener('change', (e) => {
    state.soundOn = e.target.checked;
  });

  // Jagd-Timer: Countdown der (geschätzten) Jagddauer je nach Kartengröße.
  let huntInt = null;
  const huntTime = document.getElementById('hunt-time');
  document.getElementById('hunt-start').addEventListener('click', () => {
    if (huntInt) clearInterval(huntInt);
    let rem = parseInt(document.getElementById('hunt-size').value, 10);
    huntTime.className = 'hunt-active';
    huntTime.textContent = rem + 's';
    huntInt = setInterval(() => {
      rem--;
      if (rem <= 0) {
        clearInterval(huntInt); huntInt = null;
        huntTime.className = 'safe';
        huntTime.textContent = 'sicher ✓';
      } else {
        huntTime.textContent = rem + 's';
        huntTime.className = rem <= 5 ? 'hunt-active hunt-warn' : 'hunt-active';
      }
    }, 1000);
  });

  // Sanity-Schätzer: läuft ab Start herunter, färbt sich an der Jagd-Schwelle rot.
  let sanityInt = null;
  const sanityVal = document.getElementById('sanity-val');
  function updateSanity(s) {
    const maxThr = lastPossible.length ? Math.max(...lastPossible.map(huntThreshold)) : 50;
    sanityVal.textContent = Math.round(s) + '%';
    sanityVal.className = s <= maxThr ? 'warn' : '';
  }
  document.getElementById('sanity-start').addEventListener('click', () => {
    if (sanityInt) clearInterval(sanityInt);
    let s = 100;
    const perSec = parseFloat(document.getElementById('sanity-rate').value) / 60;
    updateSanity(s);
    sanityInt = setInterval(() => {
      s -= perSec;
      if (s <= 0) { s = 0; clearInterval(sanityInt); sanityInt = null; }
      updateSanity(s);
    }, 1000);
  });

  // Aktivitäts-Timer: zählt hoch; Reset setzt auf 0.
  let actSec = 0;
  const actTime = document.getElementById('activity-time');
  const fmt = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  setInterval(() => { actSec++; actTime.textContent = fmt(actSec); }, 1000);
  document.getElementById('activity-reset').addEventListener('click', () => {
    actSec = 0; actTime.textContent = fmt(0);
  });
}

// ---- UI / Theme / Panels ----
const THEME_ACCENTS = { default: '#7c5cff', midnight: '#4a9eff', ember: '#ff8c42' };

function getPanelState() {
  return {
    sync: !document.getElementById('sync-panel')?.classList.contains('hidden'),
    tools: !document.getElementById('tools')?.classList.contains('hidden'),
    settings: !document.getElementById('settings')?.classList.contains('hidden'),
  };
}

function applyPanels(panels) {
  if (!panels) return;
  const map = [
    ['sync-panel', panels.sync],
    ['tools', panels.tools],
    ['settings', panels.settings],
  ];
  for (const [id, open] of map) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !open);
  }
}

function applyTheme(ui) {
  const app = document.getElementById('app');
  if (!app || !ui) return;
  app.classList.toggle('compact', !!ui.compact);
  app.classList.remove('theme-midnight', 'theme-ember');
  if (ui.theme === 'midnight') app.classList.add('theme-midnight');
  if (ui.theme === 'ember') app.classList.add('theme-ember');
  const accent = ui.accent || THEME_ACCENTS[ui.theme] || THEME_ACCENTS.default;
  app.style.setProperty('--accent', accent);
}

function applyUiFromConfig(cfg) {
  const ui = cfg.ui || {};
  applyPanels(ui.panels);
  applyTheme(ui);
  const compact = document.getElementById('toggle-compact');
  const themeSel = document.getElementById('theme-select');
  const accent = document.getElementById('accent-color');
  if (compact) compact.checked = !!ui.compact;
  if (themeSel && ui.theme) themeSel.value = ui.theme;
  if (accent && ui.accent) accent.value = ui.accent;
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
  document.getElementById('btn-reset').addEventListener('click', reset);
  document.getElementById('btn-settings').addEventListener('click', () => {
    const panel = document.getElementById('settings');
    panel.classList.toggle('hidden');
    saveUiConfig({ panels: { ...getPanelState(), settings: panel && !panel.classList.contains('hidden') } });
  });
  document.getElementById('btn-min').addEventListener('click', () => window.overlay?.minimize());
  document.getElementById('btn-close').addEventListener('click', () => window.overlay?.quit());

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

  // Hotkey neu belegen
  const btnRebind = document.getElementById('btn-rebind');
  btnRebind.addEventListener('click', () => {
    btnRebind.textContent = '… drücken';
    btnRebind.disabled = true;
    window.overlay?.startHotkeyCapture();
  });

  if (window.overlay) {
    window.overlay.onReset(reset);
    window.overlay.onClickThroughChanged((on) => {
      document.getElementById('clickthrough-banner').classList.toggle('hidden', !on);
    });
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
    theme: document.getElementById('theme-select')?.value || 'default',
    accent: document.getElementById('accent-color')?.value,
    panels: getPanelState(),
  };
}

// Gespeicherte Einstellungen laden und in die UI übernehmen.
async function initFromConfig() {
  if (!window.overlay?.getConfig) return;
  try {
    const cfg = await window.overlay.getConfig();
    if (cfg.hotkey) {
      setHotkeyLabel(cfg.hotkey);
      const frHk = document.getElementById('fr-hotkey');
      if (frHk) frHk.textContent = cfg.hotkey.label || 'H';
    }
    applyUiFromConfig(cfg);
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
    if (s.room && s.serverUrl) syncConnect();
  } catch (_) {}
}

wireUi();
wireTools();
wireSync();
wireOnboarding();
initFromConfig();
render();
// Prüfen, ob echte PNGs vorliegen, dann neu rendern.
Promise.all(EVIDENCE.map(probePng)).then(render);
