// Karten-Grundriss mit geteilten Pins (Phase 4).

const mapState = {
  mapId: 'tanglewood',
  mapPins: [],
  pinType: 'ghost',
  visible: false,
};

function mapDef() {
  return mapById[mapState.mapId] || MAPS[0];
}

function syncMapSelect() {
  if (!sync.connected || !sync.ws || sync.ws.readyState !== WebSocket.OPEN) return;
  sync.ws.send(JSON.stringify({ t: 'map', mapId: mapState.mapId }));
}

function syncMapPins() {
  if (!sync.connected || !sync.ws || sync.ws.readyState !== WebSocket.OPEN) return;
  sync.ws.send(JSON.stringify({ t: 'mapPins', pins: mapState.mapPins }));
}

function applyMapState(mapId, mapPins) {
  if (mapId) mapState.mapId = mapId;
  if (Array.isArray(mapPins)) mapState.mapPins = mapPins;
  const sel = document.getElementById('map-select');
  if (sel && mapState.mapId) sel.value = mapState.mapId;
  renderMap();
}

function addMapPin(x, y) {
  if (!sync.connected) {
    showSyncToast('Zuerst mit Sync verbinden');
    return;
  }
  const f = syncForm();
  const pin = {
    id: sync.id + '-' + Date.now(),
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    type: mapState.pinType,
    by: sync.id,
    name: f.name,
    color: f.color,
  };
  mapState.mapPins.push(pin);
  const pt = pinTypeById[pin.type];
  showSyncToast(`${f.name}: ${pt ? pt.icon + ' ' + pt.label : 'Pin'}`);
  syncMapPins();
  renderMap();
}

function removeMapPin(pinId) {
  const pin = mapState.mapPins.find((p) => p.id === pinId);
  if (!pin) return;
  if (pin.by !== sync.id) {
    showSyncToast('Nur eigene Pins entfernen');
    return;
  }
  mapState.mapPins = mapState.mapPins.filter((p) => p.id !== pinId);
  syncMapPins();
  renderMap();
}

function clearMapPins() {
  if (!sync.connected) return;
  mapState.mapPins = mapState.mapPins.filter((p) => p.by !== sync.id);
  syncMapPins();
  renderMap();
}

function renderMap() {
  const panel = document.getElementById('map-panel');
  const canvas = document.getElementById('map-canvas');
  if (!panel || !canvas) return;
  if (!mapState.visible) return;

  const map = mapDef();
  const pinsHtml = mapState.mapPins.map((p) => {
    const pt = pinTypeById[p.type] || PIN_TYPES[0];
    const mine = p.by === sync.id;
    return `<button type="button" class="map-pin${mine ? ' mine' : ''}" ` +
      `style="left:${p.x}%;top:${p.y}%;border-color:${p.color}" ` +
      `data-id="${p.id}" title="${p.name}: ${pt.label}">${pt.icon}</button>`;
  }).join('');

  canvas.innerHTML =
    `<svg class="map-svg" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet">${map.svg}</svg>` +
    `<div class="map-pins-layer">${pinsHtml}</div>`;

  canvas.querySelectorAll('.map-pin').forEach((btn) => {
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeMapPin(btn.dataset.id);
    });
  });

  const hit = canvas.querySelector('.map-svg') || canvas;
  hit.onclick = (e) => {
    if (e.target.closest('.map-pin')) return;
    const layer = canvas.querySelector('.map-pins-layer') || canvas;
    const r = layer.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (x < 0 || y < 0 || x > 100 || y > 100) return;
    addMapPin(x, y);
  };
}

function populateMapSelect() {
  const sel = document.getElementById('map-select');
  if (!sel || sel.options.length) return;
  for (const m of MAPS) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name + ' (' + m.size + ')';
    sel.appendChild(o);
  }
  sel.value = mapState.mapId;
}

function wireMap() {
  populateMapSelect();

  document.getElementById('btn-map')?.addEventListener('click', () => {
    mapState.visible = !mapState.visible;
    document.getElementById('map-panel')?.classList.toggle('hidden', !mapState.visible);
    if (mapState.visible) renderMap();
  });

  document.getElementById('map-select')?.addEventListener('change', (e) => {
    mapState.mapId = e.target.value;
    if (sync.connected) syncMapSelect();
    else renderMap();
  });

  document.getElementById('map-clear')?.addEventListener('click', clearMapPins);

  const types = document.getElementById('map-pin-types');
  if (types) {
    types.innerHTML = PIN_TYPES.map((p) =>
      `<button type="button" class="map-type-btn${p.id === mapState.pinType ? ' active' : ''}" ` +
      `data-type="${p.id}" title="${p.label}">${p.icon}</button>`
    ).join('');
    types.querySelectorAll('.map-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        mapState.pinType = btn.dataset.type;
        types.querySelectorAll('.map-type-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }
}

// Wird von app.js aufgerufen wenn Sync-Nachrichten Map-Daten enthalten.
function handleMapSyncMessage(msg) {
  if (msg.t === 'map') {
    applyMapState(msg.mapId, msg.mapPins || []);
    const m = mapById[msg.mapId];
    if (m) showSyncToast('Karte: ' + m.name + (msg.by ? ' (' + msg.by + ')' : ''));
    return true;
  }
  if (msg.t === 'mapPins') {
    applyMapState(null, msg.pins || []);
    return true;
  }
  return false;
}

function resetMapOnDisconnect() {
  mapState.mapPins = [];
  renderMap();
}
