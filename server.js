const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------
const players = new Map();       // wallet -> player object
const wsClients = new Map();     // wallet -> ws
const chatHistory = [];          // last 50 messages
const MAX_CHAT = 50;
const ZONES = ['main', 'arena', 'fishing', 'mining', 'crafting'];
const NPC_SPRITES = ['pepe', 'doge', 'bonk', 'popcat', 'pengu', 'wojak', 'chillguy', 'frog', 'mog', 'fwog'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePlayer(wallet) {
  return {
    wallet,
    username: 'Player',
    x: 200 + Math.random() * 400,
    y: 150 + Math.random() * 300,
    sprite: NPC_SPRITES[Math.floor(Math.random() * NPC_SPRITES.length)],
    pet: null,
    coins: 1000,
    zone: 'main',
    hp: 100,
    maxHp: 100,
    level: 1,
    equipped: {},
    isNpc: false,
  };
}

function broadcast(msg, zone) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [wallet, ws] of wsClients) {
    if (ws.readyState !== 1) continue; // OPEN
    if (zone) {
      const p = players.get(wallet);
      if (!p || p.zone !== zone) continue;
    }
    ws.send(data);
  }
}

function broadcastAll(msg) {
  broadcast(msg, null);
}

function playerCount() {
  let real = 0;
  for (const p of players.values()) if (!p.isNpc) real++;
  return players.size; // total including NPCs for "alive world" feel
}

function sendPlayerCount() {
  broadcastAll({ type: 'player_count', count: playerCount() });
}

function zonePlayerStates(zone) {
  const list = [];
  for (const p of players.values()) {
    if (p.zone === zone) {
      list.push({
        wallet: p.wallet,
        username: p.username,
        x: p.x,
        y: p.y,
        sprite: p.sprite,
        pet: p.pet,
        hp: p.hp,
        maxHp: p.maxHp,
        level: p.level,
        equipped: p.equipped,
        isNpc: p.isNpc || false,
      });
    }
  }
  return list;
}

function broadcastZoneStates(zone) {
  broadcast({ type: 'zone_player_states', players: zonePlayerStates(zone) }, zone);
}

// ---------------------------------------------------------------------------
// NPC bots — fake meme wallets that wander around
// ---------------------------------------------------------------------------
const NPC_NAMES = ['ShibaMaster', 'PepeLord', 'DogeKing', 'BonkWhale', 'PopcatSensei',
                   'WojakFren', 'ChillDude', 'FrogVibes', 'MogHunter', 'FwogTrader'];

function spawnNpcs() {
  const count = 5 + Math.floor(Math.random() * 6); // 5-10
  for (let i = 0; i < count; i++) {
    const wallet = 'NPC_' + Array.from({ length: 8 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const npc = makePlayer(wallet);
    npc.username = NPC_NAMES[i % NPC_NAMES.length];
    npc.sprite = NPC_SPRITES[i % NPC_SPRITES.length];
    npc.isNpc = true;
    npc.zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    players.set(wallet, npc);
  }
}

function wanderNpcs() {
  for (const p of players.values()) {
    if (!p.isNpc) continue;
    p.x += (Math.random() - 0.5) * 60;
    p.y += (Math.random() - 0.5) * 60;
    p.x = Math.max(50, Math.min(750, p.x));
    p.y = Math.max(50, Math.min(550, p.y));
  }
  // broadcast zone states for zones with NPCs
  const npcZones = new Set();
  for (const p of players.values()) if (p.isNpc) npcZones.add(p.zone);
  for (const z of npcZones) broadcastZoneStates(z);
}

spawnNpcs();
setInterval(wanderNpcs, 2000);

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', players: playerCount() });
});

// User info — return existing or create new
app.get('/user/info', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.json({ error: 'wallet required' });
  let p = players.get(wallet);
  if (!p) {
    p = makePlayer(wallet);
    players.set(wallet, p);
  }
  res.json(p);
});

// Change username
app.post('/user/change-username', (req, res) => {
  const { wallet, username } = req.body || {};
  if (!wallet || !username) return res.json({ error: 'wallet and username required' });
  const p = players.get(wallet);
  if (!p) return res.json({ error: 'player not found' });
  p.username = username.slice(0, 20);
  res.json({ ok: true, username: p.username });
});

// Zones status
app.get('/zones/status', (req, res) => {
  const status = ZONES.map(z => {
    let count = 0;
    for (const p of players.values()) if (p.zone === z) count++;
    return { zone: z, players: count };
  });
  res.json(status);
});

// Chat recent
app.get('/chat/recent', (req, res) => {
  res.json(chatHistory.slice(-MAX_CHAT));
});

// Arena state
app.get('/arena/state', (req, res) => {
  res.json({ active: false, players: [] });
});

// Shop purchase (mock)
app.post('/shop/purchase', (req, res) => {
  const { wallet, item } = req.body || {};
  if (!wallet) return res.json({ error: 'wallet required' });
  const p = players.get(wallet);
  if (!p) return res.json({ error: 'player not found' });
  const cost = 50; // flat mock cost
  if (p.coins < cost) return res.json({ error: 'not enough coins' });
  p.coins -= cost;
  res.json({ ok: true, coins: p.coins, item });
});

// Fishing inventory
app.get('/fishing/inventory', (req, res) => { res.json([]); });

// Marketplace listings
app.get('/marketplace/listings', (req, res) => { res.json([]); });

// Consumables inventory
app.get('/consumables/inventory', (req, res) => { res.json([]); });

// Friends
app.get('/friends', (req, res) => { res.json([]); });

// Broadcast current
app.get('/broadcast/current', (req, res) => { res.json(null); });

// Frenzy status
app.get('/frenzy/status', (req, res) => { res.json({ active: false }); });

// Shop claims
app.get('/shop/claims', (req, res) => { res.json([]); });

// Friend requests incoming
app.get('/friend-requests/incoming', (req, res) => { res.json([]); });

// Friend notifications
app.get('/friend-notifications', (req, res) => { res.json([]); });

// Messages
app.get('/messages', (req, res) => { res.json([]); });

// Ban status
app.get('/admin/ban-status', (req, res) => { res.json({ banned: false }); });

// Token config
app.get('/shop/token-config', (req, res) => { res.json({ tokens: [] }); });

// Catch-all — return ok so the game client doesn't choke on missing endpoints
app.all('*', (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Ping all clients every 30s
setInterval(() => {
  for (const ws of wsClients.values()) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

wss.on('connection', (ws) => {
  let playerWallet = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type } = msg;

    // ---- wallet_connected ----
    if (type === 'wallet_connected') {
      playerWallet = msg.wallet;
      if (!playerWallet) return;

      let p = players.get(playerWallet);
      if (!p) {
        p = makePlayer(playerWallet);
        players.set(playerWallet, p);
      }
      wsClients.set(playerWallet, ws);

      // Send game state to the connecting client
      ws.send(JSON.stringify({
        type: 'game_state',
        player: {
          wallet: p.wallet,
          username: p.username,
          x: p.x,
          y: p.y,
          sprite: p.sprite,
          pet: p.pet,
          coins: p.coins,
          zone: p.zone,
          hp: p.hp,
          maxHp: p.maxHp,
          level: p.level,
          equipped: p.equipped,
        },
        players: zonePlayerStates(p.zone),
        zone: p.zone,
        zones: ZONES,
      }));

      sendPlayerCount();
      broadcastZoneStates(p.zone);
      return;
    }

    // ---- pong (keepalive response) ----
    if (type === 'pong') {
      // client is alive, nothing to do
      return;
    }

    // ---- chat_message ----
    if (type === 'chat_message') {
      const p = players.get(playerWallet);
      if (!p) return;
      const entry = {
        wallet: playerWallet,
        username: p.username,
        message: (msg.message || '').slice(0, 500),
        zone: p.zone,
        timestamp: Date.now(),
      };
      chatHistory.push(entry);
      if (chatHistory.length > MAX_CHAT) chatHistory.shift();
      broadcast({
        type: 'chat_message',
        wallet: entry.wallet,
        username: entry.username,
        message: entry.message,
        timestamp: entry.timestamp,
      }, p.zone);
      return;
    }

    // ---- change_sprite ----
    if (type === 'change_sprite') {
      const p = players.get(playerWallet);
      if (!p) return;
      p.sprite = msg.sprite || p.sprite;
      broadcastZoneStates(p.zone);
      return;
    }

    // ---- player_move ----
    if (type === 'player_move') {
      const p = players.get(playerWallet);
      if (!p) return;
      if (typeof msg.x === 'number') p.x = msg.x;
      if (typeof msg.y === 'number') p.y = msg.y;
      broadcastZoneStates(p.zone);
      return;
    }

    // ---- zone_change ----
    if (type === 'zone_change') {
      const p = players.get(playerWallet);
      if (!p) return;
      const newZone = msg.zone;
      if (!ZONES.includes(newZone)) return;
      const oldZone = p.zone;
      p.zone = newZone;
      p.x = 400;
      p.y = 300;

      // Notify old zone that player left
      broadcast({ type: 'player_disconnected', wallet: playerWallet }, oldZone);
      broadcastZoneStates(oldZone);

      // Send new zone state to the player
      ws.send(JSON.stringify({
        type: 'zone_changed',
        zone: newZone,
        players: zonePlayerStates(newZone),
      }));
      broadcastZoneStates(newZone);
      return;
    }
  });

  ws.on('close', () => {
    if (playerWallet) {
      const p = players.get(playerWallet);
      const zone = p ? p.zone : null;
      wsClients.delete(playerWallet);
      players.delete(playerWallet);
      broadcastAll({ type: 'player_disconnected', wallet: playerWallet });
      sendPlayerCount();
      if (zone) broadcastZoneStates(zone);
    }
  });

  ws.on('error', () => {});
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Pumpville backend running on port ${PORT}`);
  console.log(`NPCs spawned: ${[...players.values()].filter(p => p.isNpc).length}`);
});
