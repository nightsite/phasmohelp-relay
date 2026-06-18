// WebSocket-Relay für Phasmo Overlay.
// Clients treten mit einem Raum-Code bei; Beweise werden im Raum gespiegelt.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// room -> Map(clientId -> client)
const rooms = new Map();
let nextId = 1;

function ensureRoom(code) {
  if (!rooms.has(code)) rooms.set(code, new Map());
  return rooms.get(code);
}

function roomPeers(members, exceptId) {
  const out = [];
  for (const [id, c] of members) {
    if (id === exceptId) continue;
    out.push({ id, name: c.name, color: c.color, evidence: c.evidence, pins: c.pins });
  }
  return out;
}

function broadcastRoom(members, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const [id, c] of members) {
    if (exceptId != null && id === exceptId) continue;
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
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
      const members = ensureRoom(room);
      members.set(id, self);
      ws.send(JSON.stringify({ t: 'peers', peers: roomPeers(members, id) }));
      broadcastRoom(members, {
        t: 'peer',
        id,
        name: self.name,
        color: self.color,
        evidence: self.evidence,
        pins: self.pins,
      }, id);
      return;
    }

    if (!room || !rooms.has(room)) return;
    const members = rooms.get(room);

    if (msg.t === 'state') {
      if (msg.evidence && typeof msg.evidence === 'object') self.evidence = msg.evidence;
      if (Array.isArray(msg.pins)) self.pins = msg.pins;
      broadcastRoom(members, {
        t: 'peer',
        id,
        name: self.name,
        color: self.color,
        evidence: self.evidence,
        pins: self.pins,
      }, id);
    }
  });

  ws.on('close', () => {
    if (!room || !rooms.has(room)) return;
    const members = rooms.get(room);
    members.delete(id);
    if (members.size === 0) rooms.delete(room);
    else broadcastRoom(members, { t: 'left', id }, id);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Relay läuft auf ' + HOST + ':' + PORT);
});
