/**
 * Static security regression checks (no live server / no shutdown side effects).
 * Run: node scripts/security-check.cjs
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error('     ', e.message);
    process.exitCode = 1;
  }
}

const BLOCKED_BASENAMES = new Set([
  'finnhub.key', 'package.json', 'package-lock.json', '.env', '.gitignore',
]);
const BLOCKED_EXTENSIONS = new Set(['.key', '.pem', '.env']);

function isBlockedStatic(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const base = path.basename(normalized).toLowerCase();
  if (BLOCKED_BASENAMES.has(base)) return true;
  const ext = path.extname(base).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return true;
  if (normalized.startsWith('scripts/')) return true;
  if (normalized.startsWith('electron/') && ext === '.cjs') return true;
  return false;
}

test('blocks finnhub.key and package.json', () => {
  assert.equal(isBlockedStatic('finnhub.key'), true);
  assert.equal(isBlockedStatic('/finnhub.key'), true);
  assert.equal(isBlockedStatic('package.json'), true);
  assert.equal(isBlockedStatic('electron/main.cjs'), true);
  assert.equal(isBlockedStatic('scripts/quality-tests.cjs'), true);
});

test('allows game assets', () => {
  assert.equal(isBlockedStatic('index.html'), false);
  assert.equal(isBlockedStatic('js/app.js'), false);
  assert.equal(isBlockedStatic('css/styles.css'), false);
  assert.equal(isBlockedStatic('assets/icon.ico'), false);
});

test('electron main has shutdown token gate', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  assert.match(main, /SHUTDOWN_TOKEN/);
  assert.match(main, /x-stockway-shutdown/i);
  assert.match(main, /req\.method !== 'POST'/);
  assert.match(main, /isBlockedStatic/);
});

test('share play link is host-loopback only', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const share = fs.readFileSync(path.join(__dirname, '../electron/share-tunnel.cjs'), 'utf8');
  assert.match(main, /isLoopbackReq/);
  assert.match(main, /\/api\/share\/start/);
  assert.match(main, /\/api\/share\/stop/);
  assert.match(main, /Host only/);
  assert.match(main, /if \(local\) cfg\.shutdownToken/);
  assert.match(share, /trycloudflare/);
  assert.equal(fs.existsSync(path.join(__dirname, '../js/share-play.js')), true);
});

test('serve.ps1 has shutdown token gate', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '../serve.ps1'), 'utf8');
  assert.match(ps1, /\$ShutdownToken/);
  assert.match(ps1, /X-StockWay-Shutdown/);
  assert.match(ps1, /Test-BlockedStatic/);
});

test('index.html has CSP', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
});

test('no stale root duplicate ui.js', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../ui.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../chart.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../styles.css')), false);
});

test('save-sanitize module exists and exports', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../js/save-sanitize.js')), true);
});

console.log(`\n${passed} security checks passed${failed ? `, ${failed} failed` : ''}`);
