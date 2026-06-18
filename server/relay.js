// WebSocket-Relay für Phasmo Overlay (Beweise + Karten-Pins).
// Raum-basiert: Clients treten per Code bei, nichts wird dauerhaft gespeichert.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// room -> { members: Map(id -> client), mapId, mapPins }
const rooms = new Map();
let nextId = 1;

function ensureRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { members: new Map(), mapId: 'tanglewood', mapPins: [] });
  }
  return rooms.get(code);
}

function roomPeers(r, exceptId) {
  const out = [];
  for (const [id, c] of r.members) {
    if (id === exceptId) continue;
    out.push({ id, name: c.name, color: c.color, evidence: c.evidence, pins: c.pins });
  }
  return out;
}

function broadcastRoom(code, msg, exceptId) {
  const r = rooms.get(code);
  if (!r) return;
  const data = JSON.stringify(msg);
  for (const [id, c] of r.members) {
    if (exceptId != null && id === exceptId) continue;
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
}

function broadcastRoomAll(code, msg) {
  broadcastRoom(code, msg, null);
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('phasmo-relay ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const id = nextId++;
  let room = null;
  const self = { ws, name: 'Spieler', color: '#7c5cff', evidence: {}, pins: [] };

  ws.send(JSON.stringify({ t: 'welcome', id }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    if (msg.t === 'join') {
      room = String(msg.room || '').trim().toUpperCase() || 'LOBBY';
      self.name = String(msg.name || 'Spieler').slice(0, 24);
      self.color = msg.color || self.color;
      const r = ensureRoom(room);
      r.members.set(id, self);
      ws.send(JSON.stringify({
        t: 'peers',
        peers: roomPeers(r, id),
        mapId: r.mapId,
        mapPins: r.mapPins,
      }));
      broadcastRoom(room, {
        t: 'peer',
        id,
        name: self.name,
        color: self.color,
        evidence: self.evidence,
        pins: self.pins,
      }, id);
      return;
    }

    if (!room) return;
    const r = rooms.get(room);
    if (!r) return;

    if (msg.t === 'state') {
      if (msg.evidence && typeof msg.evidence === 'object') self.evidence = msg.evidence;
      if (Array.isArray(msg.pins)) self.pins = msg.pins;
      broadcastRoom(room, {
        t: 'peer',
        id,
        name: self.name,
        color: self.color,
        evidence: self.evidence,
        pins: self.pins,
      }, id);
      return;
    }

    if (msg.t === 'map' && msg.mapId) {
      r.mapId = String(msg.mapId).slice(0, 48);
      r.mapPins = [];
      broadcastRoomAll(room, { t: 'map', mapId: r.mapId, mapPins: r.mapPins, by: self.name });
      return;
    }

    if (msg.t === 'mapPins' && Array.isArray(msg.pins)) {
      r.mapPins = msg.pins.slice(0, 200).map((p) => ({
        id: String(p.id || '').slice(0, 48),
        x: Math.max(0, Math.min(100, Number(p.x) || 0)),
        y: Math.max(0, Math.min(100, Number(p.y) || 0)),
        type: String(p.type || 'ghost').slice(0, 16),
        by: Number(p.by) || id,
        name: String(p.name || self.name).slice(0, 24),
        color: String(p.color || self.color).slice(0, 16),
      }));
      broadcastRoomAll(room, { t: 'mapPins', pins: r.mapPins });
      return;
    }
  });

  ws.on('close', () => {
    if (!room || !rooms.has(room)) return;
    const r = rooms.get(room);
    r.members.delete(id);
    const hadPins = r.mapPins.some((p) => p.by === id);
    if (hadPins) {
      r.mapPins = r.mapPins.filter((p) => p.by !== id);
      broadcastRoomAll(room, { t: 'mapPins', pins: r.mapPins });
    }
    if (r.members.size === 0) rooms.delete(room);
    else broadcastRoom(room, { t: 'left', id }, id);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Relay läuft auf ' + HOST + ':' + PORT);
});
