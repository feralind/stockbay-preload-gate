/**
 * One-shot visual capture of revenge cool-down UI (disabled opens + coachmark).
 * Run: node scripts/capture-cooloff-shot.cjs
 * Boots its own static server unless STOCKWAY_SHOT_PORT is already serving.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.STOCKWAY_SHOT_PORT) || 8766;
const OUT_DIR = path.join(root, '.tmp-shots');
const OUT = path.join(OUT_DIR, 'revenge-cooloff.png');
const OUT_BTNS = path.join(OUT_DIR, 'revenge-cooloff-buttons.png');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
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
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e.message || e));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') resolve(null);
      else reject(err);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const { chromium } = await import('playwright');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('pageerror', (e) => console.warn('pageerror', e.message));

  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('stockway_onboarded_v1', '1');
    } catch (_) { /* ignore */ }
    window.__stockwayDisableSave = true;
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const preloadSkip = page.locator('#quote-preload-skip');
  await Promise.race([
    page.waitForFunction(() => !!window.__stockwayTest, null, { timeout: 90000 }),
    (async () => {
      await preloadSkip.waitFor({ state: 'visible', timeout: 25000 });
      await preloadSkip.click();
      await page.waitForFunction(() => !!window.__stockwayTest, null, { timeout: 60000 });
    })(),
  ]);
  await page.evaluate(() => window.__stockwayTest?.disableSave?.());

  const dialogOk = page.locator('#app-dialog-ok');
  if (await dialogOk.isVisible().catch(() => false)) {
    await dialogOk.click();
  }

  await page.waitForSelector('#cash', { timeout: 30000 });
  await page.locator('.nav-item[data-view="trade"]').click();
  await page.waitForSelector('#btn-quick-long', { state: 'visible', timeout: 15000 });

  // Clear any perk / unlock callouts so the cool-down tip is the only overlay
  await page.evaluate(() => {
    document.querySelectorAll('.perk-callout, #perk-callout-root').forEach((el) => {
      el.classList.add('hidden');
      el.remove?.();
    });
    document.getElementById('coachmark-root')?.classList.add('hidden');
  });

  await page.locator('#btn-quick-long').scrollIntoViewIfNeeded();

  const armed = await page.evaluate(() => window.__stockwayTest.forceRevengeCooloff(-1e9));
  console.log('armed', JSON.stringify(armed));

  await page.waitForTimeout(400);
  // renderAll may re-show the scanner unlock callout — dismiss it for a clean shot
  await page.locator('#perk-callout-dismiss').click({ timeout: 2000 }).catch(() => {});
  await page.evaluate(() => {
    document.getElementById('perk-callout-root')?.classList.add('hidden');
  });
  await page.locator('#btn-quick-long').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const snap = await page.evaluate(() => ({
    buyDisabled: !!document.getElementById('btn-quick-long')?.disabled,
    shortDisabled: !!document.getElementById('btn-quick-short')?.disabled,
    sellDisabled: !!document.getElementById('btn-quick-sell')?.disabled,
    title: document.getElementById('btn-quick-long')?.title || '',
    coachVisible: !document.getElementById('coachmark-root')?.classList.contains('hidden'),
    coachText: (document.getElementById('coachmark-text')?.textContent || '').slice(0, 120),
  }));
  console.log('snap', JSON.stringify(snap, null, 2));

  await page.screenshot({ path: OUT, fullPage: false });

  const actions = page.locator('.trade-ticket-actions');
  if (await actions.count()) {
    await actions.screenshot({ path: OUT_BTNS });
  } else {
    const box = await page.locator('#btn-quick-long').boundingBox();
    if (box) {
      await page.screenshot({
        path: OUT_BTNS,
        clip: {
          x: Math.max(0, box.x - 24),
          y: Math.max(0, box.y - 48),
          width: Math.min(720, box.width + 480),
          height: Math.min(220, box.height + 140),
        },
      });
    }
  }

  console.log('WROTE', OUT);
  console.log('WROTE', OUT_BTNS);

  await browser.close();
  if (server) server.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
