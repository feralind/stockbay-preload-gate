/**
 * Live UI regression: legendary Black Market coachmark Skip + Open Black Market.
 * Run: node scripts/verify-bm-coach.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.STOCKWAY_SMOKE_PORT) || 8771;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let rel = urlPath === '/' ? '/index.html' : urlPath;
        if (/finnhub\.key|package\.json|\.env/i.test(rel)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const filePath = path.normalize(path.join(root, rel));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const server = await startStaticServer();
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.nav-item[data-view="blackmarket"]', { timeout: 15000 });

    // Preload gate / blur overlays steal pointer events — clear them for this regression.
    await page.evaluate(() => {
      localStorage.setItem('stockway_onboarded_v1', '1');
      ['quote-preload-overlay', 'onboard-overlay', 'day-summary-overlay'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
    });

    // --- Skip path ---
    await page.evaluate(async () => {
      const walk = await import('/js/onboarding-walkthrough.js');
      const bm = await import('/js/blackmarket.js');
      const legend = bm.BLACKMARKET_ITEM_POOL.find((i) => i.rarity === 'legendary');
      const state = { meta: { blackMarketLegendCoachShown: false } };
      bm.maybeShowBlackMarketLegendaryCoach(state, { items: [legend] }, {
        showCoachmark: walk.showCoachmark,
        hideCoachmark: walk.hideCoachmark,
        switchView: (viewId) => {
          document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
          document.querySelectorAll('.view-panel').forEach((el) => el.classList.remove('active'));
          document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add('active');
          document.getElementById(`view-${viewId}`)?.classList.add('active');
          window.__bmCoachNavigated = viewId;
        },
        saveGame: () => {},
      });
    });

    await page.waitForSelector('#coachmark-root:not(.hidden)', { timeout: 5000 });
    const tipText = await page.locator('#coachmark-text').innerText();
    assert(/Legendary Black Market/i.test(tipText), `unexpected tip text: ${tipText}`);

    // Spotlight should cover Black Market nav (not stuck at 0,0 corner with no target)
    const spotOk = await page.evaluate(() => {
      const spot = document.getElementById('coachmark-spotlight');
      const nav = document.querySelector('.nav-item[data-view="blackmarket"]');
      if (!spot || !nav) return false;
      const sr = spot.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      return sr.width > 10 && sr.height > 10
        && Math.abs(sr.top - (nr.top - 8)) < 24
        && Math.abs(sr.left - (nr.left - 8)) < 24;
    });
    assert(spotOk, 'spotlight not anchored on Black Market nav');

    await page.click('#coachmark-skip', { force: true });
    await page.waitForFunction(() => {
      const root = document.getElementById('coachmark-root');
      return !root || root.classList.contains('hidden');
    }, { timeout: 3000 });
    console.log('PASS  live coachmark Skip dismisses tip');

    // --- Open Black Market path (fresh flag) ---
    await page.evaluate(async () => {
      window.__bmCoachNavigated = null;
      ['quote-preload-overlay', 'onboard-overlay'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
      const walk = await import('/js/onboarding-walkthrough.js');
      const bm = await import('/js/blackmarket.js');
      const legend = bm.BLACKMARKET_ITEM_POOL.find((i) => i.rarity === 'legendary');
      const state = { meta: { blackMarketLegendCoachShown: false } };
      bm.maybeShowBlackMarketLegendaryCoach(state, { items: [legend] }, {
        showCoachmark: walk.showCoachmark,
        hideCoachmark: walk.hideCoachmark,
        switchView: (viewId) => {
          document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
          document.querySelectorAll('.view-panel').forEach((el) => el.classList.remove('active'));
          document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add('active');
          document.getElementById(`view-${viewId}`)?.classList.add('active');
          window.__bmCoachNavigated = viewId;
        },
        saveGame: () => {},
      });
    });

    await page.waitForSelector('#coachmark-root:not(.hidden)', { timeout: 5000 });
    const nextLabel = await page.locator('#coachmark-next').innerText();
    assert(/Open Black Market/i.test(nextLabel), `next label wrong: ${nextLabel}`);
    await page.click('#coachmark-next', { force: true });
    await page.waitForFunction(() => {
      const root = document.getElementById('coachmark-root');
      return (!root || root.classList.contains('hidden')) && window.__bmCoachNavigated === 'blackmarket';
    }, { timeout: 3000 });
    const viewActive = await page.evaluate(() => document.getElementById('view-blackmarket')?.classList.contains('active'));
    assert(viewActive, 'view-blackmarket not active after Open Black Market');
    console.log('PASS  live coachmark Open Black Market dismisses and navigates');

    // --- Confirm app.js call-site wiring shape by static read through fetch ---
    const appSrc = await page.evaluate(async () => {
      const res = await fetch('/js/app.js');
      return res.text();
    });
    assert(/maybeShowBlackMarketLegendaryCoach\(state,\s*listing,\s*\{[\s\S]*?showCoachmark,[\s\S]*?hideCoachmark,[\s\S]*?saveGame,[\s\S]*?switchView,/.test(appSrc),
      'app.js call site missing hideCoachmark/switchView wiring');
    console.log('PASS  app.js call site passes hideCoachmark + switchView');

    if (errors.length) {
      throw new Error(`page errors: ${errors.join(' | ')}`);
    }
    console.log('\nAll live legendary-coachmark checks passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('FAIL ', err.message || err);
  process.exit(1);
});
