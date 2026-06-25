import WebSocket from 'ws';

const URL = 'wss://pv-server-4h5e.onrender.com';
const RUN_MS = 15000;

const received = [];        // raw transcript
const typeCounts = {};      // type -> count
let gotGameState = false;
let gotZonePlayerStates = false;
let gotPing = false;
let opened = false;

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

log(`Connecting to ${URL} ...`);
const ws = new WebSocket(URL);

const startTimer = setTimeout(() => {
  finish('timeout-15s');
}, RUN_MS);

ws.on('open', () => {
  opened = true;
  log('WS OPEN');

  const helloMsg = {
    type: 'wallet_connected',
    token: 'test-token-123',
    wallet: 'TestWallet1111111111111111111111111111111',
    sprite: 'pepe',
    pet: null,
  };
  log('SEND >>>', JSON.stringify(helloMsg));
  ws.send(JSON.stringify(helloMsg));

  // Send a player_move after 2s
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const moveMsg = {
        type: 'player_move',
        x: 300,
        y: 300,
        direction: 'down',
        animation: 'walk',
      };
      log('SEND >>>', JSON.stringify(moveMsg));
      ws.send(JSON.stringify(moveMsg));
    } else {
      log('Cannot send player_move, socket not OPEN (state=' + ws.readyState + ')');
    }
  }, 2000);
});

ws.on('message', (data, isBinary) => {
  const raw = isBinary ? `<binary ${data.length} bytes>` : data.toString();
  received.push(raw);

  let parsed = null;
  let type = '(unparseable)';
  if (!isBinary) {
    try {
      parsed = JSON.parse(raw);
      type = parsed && parsed.type ? parsed.type : '(no-type field)';
    } catch (e) {
      type = '(non-json)';
    }
  } else {
    type = '(binary)';
  }

  typeCounts[type] = (typeCounts[type] || 0) + 1;
  if (type === 'game_state') gotGameState = true;
  if (type === 'zone_player_states') gotZonePlayerStates = true;
  if (type === 'ping') gotPing = true;

  log(`RECV <<< [type=${type}]`, raw.length > 2000 ? raw.slice(0, 2000) + ' ...[truncated]' : raw);
});

ws.on('error', (err) => {
  log('WS ERROR:', err && err.message ? err.message : String(err));
  if (err && err.code) log('  err.code =', err.code);
});

ws.on('unexpected-response', (req, res) => {
  log('WS UNEXPECTED-RESPONSE: HTTP status', res.statusCode, res.statusMessage);
  log('  headers:', JSON.stringify(res.headers));
  let body = '';
  res.on('data', (c) => (body += c.toString()));
  res.on('end', () => {
    if (body) log('  body:', body.slice(0, 1000));
  });
});

ws.on('close', (code, reason) => {
  log(`WS CLOSE: code=${code} reason="${reason ? reason.toString() : ''}"`);
});

function finish(why) {
  clearTimeout(startTimer);
  log('-----------------------------------------');
  log('SUMMARY (reason:', why + ')');
  log('  WS opened (handshake OK)?  ', opened);
  log('  Total messages received:   ', received.length);
  log('  Message types received:    ', JSON.stringify(typeCounts));
  log('  game_state received?       ', gotGameState);
  log('  zone_player_states received?', gotZonePlayerStates);
  log('  ping received?             ', gotPing);
  log('-----------------------------------------');
  try { ws.terminate(); } catch (e) {}
  // give logs a tick to flush
  setTimeout(() => process.exit(0), 200);
}
