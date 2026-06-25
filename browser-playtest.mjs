import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://pumpville-deploy.vercel.app';
const PROXY = process.env.PLAY_PROXY || 'http://127.0.0.1:12334';
const mockFile = process.env.MOCK_FILE || './mock-legacy.js';
const mockSrc = fs.readFileSync(new URL(mockFile, import.meta.url), 'utf8');

const logs = [];
const tag = (m) => { console.log(m); };

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: PROXY },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Inject the mock wallet BEFORE any page script runs (correct wallet-standard timing).
  await ctx.addInitScript(mockSrc);
  const page = await ctx.newPage();

  page.on('console', (m) => {
    const t = m.text();
    logs.push(t);
    if (/spawn|splash|wallet|connect|game_state|websocket|godot|auth|token|error|fail|enter|loading|inGame/i.test(t)) {
      tag('  [console] ' + t.slice(0, 160));
    }
  });
  page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); tag('  [pageerror] ' + e.message.slice(0, 160)); });

  tag('=== NAVIGATE ===');
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => tag('  goto: ' + e.message));
  await page.waitForTimeout(7000);
  tag('  title: ' + await page.title());
  tag('  mock present: ' + await page.evaluate(() => !!(window.solana && window.solana.isPhantom)));

  await page.screenshot({ path: 'C:/Users/79150/AppData/Local/Temp/pt-1-landing.png' });
  tag('  shot 1: landing');

  // Click CONNECT WALLET
  tag('\n=== CLICK CONNECT WALLET ===');
  const connect = page.locator('text=/connect wallet/i').first();
  await connect.click({ timeout: 10000 }).catch(e => tag('  connect click: ' + e.message));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:/Users/79150/AppData/Local/Temp/pt-2-modal.png' });
  tag('  shot 2: wallet modal');

  // Click Phantom in the modal
  tag('\n=== SELECT PHANTOM ===');
  const phantom = page.locator('text=/phantom/i').first();
  await phantom.click({ timeout: 8000 }).catch(e => tag('  phantom click: ' + e.message));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:/Users/79150/AppData/Local/Temp/pt-3-after-connect.png' });
  tag('  shot 3: after connect+sign');

  // Give the game time to authenticate + open WS + spawn
  tag('\n=== WAIT FOR WORLD ENTRY (20s) ===');
  await page.waitForTimeout(20000);
  await page.screenshot({ path: 'C:/Users/79150/AppData/Local/Temp/pt-4-world.png' });
  tag('  shot 4: world (final)');

  // Inspect end state
  const state = await page.evaluate(() => {
    const token = localStorage.getItem('auth_token');
    const wallet = localStorage.getItem('auth_wallet');
    return {
      token: token ? token.slice(0, 20) + '...(' + token.split('.').length + ' segs)' : null,
      wallet,
      hasIframe: !!document.querySelector('iframe'),
      bodyText: (document.body.innerText || '').slice(0, 200),
    };
  });
  tag('\n=== END STATE ===');
  tag('  auth_token: ' + state.token);
  tag('  auth_wallet: ' + state.wallet);
  tag('  game iframe present: ' + state.hasIframe);

  // Verdict signals from console
  const joined = logs.some(l => /local_player_spawned|hiding splash|inGame|spawned|new_player/i.test(l));
  const wsConnected = logs.some(l => /websocket.*open|connected to server|godot_websocket_ready/i.test(l));
  const frozen = logs.some(l => /waiting for wallet|failed to receive wallet|not connected after/i.test(l));
  tag('\n================ VERDICT ================');
  tag('  WS connected signal : ' + (wsConnected ? '✅' : '—'));
  tag('  player spawned signal: ' + (joined ? '✅' : '—'));
  tag('  frozen/hang signal   : ' + (frozen ? '⚠️ present' : 'none'));
  tag('  auth token stored    : ' + (state.token ? '✅ (' + (state.token.includes('3 segs') ? 'JWT-shaped' : 'check') + ')' : '❌'));
  tag('=========================================');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
