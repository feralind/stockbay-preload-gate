/**
 * Minimal Playwright UI smoke: boot → buy → watch → hire → advance day → no console errors.
 * Run: node scripts/ui-smoke.cjs
 * Requires: npm i -D playwright && npx playwright install chromium
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.STOCKWAY_SMOKE_PORT) || 8765;

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
      let rel = urlPath === '/' ? '/index.html' : urlPath;
      // Block secret-like paths (mirrors serve posture lightly)
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
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('FAIL  Playwright not installed. Run: npm i -D playwright && npx playwright install chromium');
    process.exitCode = 1;
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const pw = await loadPlaywright();
  if (!pw) return;

  const server = await startStaticServer();
  const consoleErrors = [];
  const pageErrors = [];
  let browser;

  try {
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));

    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        // Skip interactive first-trade walkthrough — smoke exercises the live desk directly
        localStorage.setItem('stockway_onboarded_v1', '1');
      } catch (_) { /* ignore */ }
      window.__stockwayDisableSave = true;
    });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Fresh boots show the quote preload gate. When live providers are blocked
    // (CORS / no key), the skip button appears after the stall timeout — click it
    // so init can finish with simulated quotes (same as a human "Continue anyway").
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
    const brand = await page.locator('.brand-name').first().textContent();
    assert(/StockWay/i.test(brand || ''), 'brand should read StockWay');

    // Trade view → buy long
    await page.locator('.nav-item[data-view="trade"]').click();
    await page.waitForSelector('#btn-quick-long', { timeout: 15000 });
    await page.locator('#quick-shares').fill('1');
    const cashBefore = await page.evaluate(() => window.__stockwayTest.getCash());
    await page.locator('#btn-quick-long').click();
    await page.waitForSelector('#order-confirm-submit', { timeout: 10000 });
    await page.locator('#order-confirm-submit').click();
    await page.waitForTimeout(500);
    if (await dialogOk.isVisible().catch(() => false)) {
      await dialogOk.click();
    }
    const cashAfterBuy = await page.evaluate(() => window.__stockwayTest.getCash());
    assert(cashAfterBuy < cashBefore, `buy should spend cash (${cashBefore} → ${cashAfterBuy})`);

    // Watchlist
    const watchBefore = await page.evaluate(() => window.__stockwayTest.getWatchCount());
    await page.locator('#btn-watch-symbol, #btn-add-watch').first().click();
    await page.waitForTimeout(200);
    const watchAfter = await page.evaluate(() => window.__stockwayTest.getWatchCount());
    assert(watchAfter >= watchBefore, 'watchlist should not shrink after add');
    assert(watchAfter > 0, 'watchlist should have at least one symbol');

    // Hire staff
    await page.evaluate(() => window.__stockwayTest.ensureSmokeStaffUnlock());
    await page.locator('.nav-item[data-view="staff"]').click();
    await page.waitForSelector('.hire-btn', { timeout: 15000 });
    const staffBefore = await page.evaluate(() => window.__stockwayTest.getStaffCount());
    await page.locator('.hire-btn').first().click();
    if (await dialogOk.isVisible().catch(() => false)) {
      await dialogOk.click();
    }
    await page.waitForTimeout(400);
    const staffAfter = await page.evaluate(() => window.__stockwayTest.getStaffCount());
    assert(staffAfter > staffBefore, `hire should increase staff (${staffBefore} → ${staffAfter})`);

    // Advance a game day via test hook
    const dayBefore = await page.evaluate(() => window.__stockwayTest.getDay());
    const advanced = await page.evaluate(() => window.__stockwayTest.forceAdvanceGameDay());
    const dayAfter = await page.evaluate(() => window.__stockwayTest.getDay());
    assert(dayAfter === dayBefore + 1, `day should advance (${dayBefore} → ${dayAfter})`);
    assert(advanced?.to === dayAfter, 'forceAdvanceGameDay return matches');

    const dayLabel = await page.locator('#market-day').textContent();
    assert(new RegExp(`DAY\\s*${dayAfter}`, 'i').test(dayLabel || ''), `UI day label ${dayLabel}`);

    // Filter environmental noise (CDN/CORS/CSP meta) — app recovers via simulated quotes
    const seriousConsole = consoleErrors.filter((t) => {
      if (/favicon/i.test(t)) return false;
      if (/fonts\.g/i.test(t)) return false;
      if (/frame-ancestors/i.test(t)) return false;
      if (/404 \(Not Found\)/i.test(t)) return false;
      if (/CORS policy/i.test(t)) return false;
      if (/query1\.finance\.yahoo\.com|finnhub\.io/i.test(t)) return false;
      if (/net::ERR_FAILED|net::ERR_CONNECTION|net::ERR_NAME/i.test(t)) return false;
      if (/Failed to load resource/i.test(t)) return false;
      if (/net::ERR_/i.test(t) && /fonts|cdn\.jsdelivr|unpkg/i.test(t)) return false;
      return true;
    });
    const seriousPage = pageErrors.filter((t) => {
      if (/CORS|yahoo|finnhub|Failed to fetch/i.test(t)) return false;
      return true;
    });
    assert(seriousPage.length === 0, `page errors: ${seriousPage.join(' | ')}`);
    assert(seriousConsole.length === 0, `console errors: ${seriousConsole.join(' | ')}`);

    console.log('PASS  UI smoke boot');
    console.log('PASS  UI smoke buy');
    console.log('PASS  UI smoke watchlist');
    console.log('PASS  UI smoke hire staff');
    console.log('PASS  UI smoke advance day');
    console.log('PASS  UI smoke no console/page errors');
    console.log('\n6 UI smoke checks passed');
  } catch (e) {
    console.error('FAIL  UI smoke');
    console.error('     ', e.message);
    if (consoleErrors.length) console.error('      console:', consoleErrors.slice(0, 8));
    if (pageErrors.length) console.error('      page:', pageErrors.slice(0, 8));
    process.exitCode = 1;
  } finally {
    try { await browser?.close(); } catch (_) { /* ignore */ }
    await new Promise((r) => server.close(r));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
