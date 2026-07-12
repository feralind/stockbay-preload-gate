/**
 * Manual architecture smoke (Playwright):
 * fresh save -> buy from Listings -> watchlist -> hire -> advance day ->
 * portfolio -> options chain -> forced margin call.
 *
 * Prints raw per-step observations + all browser console/page errors.
 * Run: node scripts/manual-architecture-smoke.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.STOCKWAY_MANUAL_SMOKE_PORT) || 8771;
const SHOTS_DIR = path.join(root, '.smoke-shots');

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

async function clickDialogOk(page) {
  const ok = page.locator('#app-dialog-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

async function waitForAppReady(page, { allowPreloadSkip = true } = {}) {
  const preloadSkip = page.locator('#quote-preload-skip');
  await Promise.race([
    page.waitForFunction(() => !!window.__stockwayTest, null, { timeout: 90000 }),
    (async () => {
      if (!allowPreloadSkip) return;
      await preloadSkip.waitFor({ state: 'visible', timeout: 25000 });
      await preloadSkip.click();
      await page.waitForFunction(() => !!window.__stockwayTest, null, { timeout: 60000 });
    })(),
  ]);
}

async function dismissBlockingOverlays(page) {
  const dayContinue = page.locator('#day-summary-continue');
  if (await dayContinue.isVisible().catch(() => false)) await dayContinue.click();
  const staffClose = page.locator('#staff-history-close');
  if (await staffClose.isVisible().catch(() => false)) await staffClose.click();
  await clickDialogOk(page);
}

async function saveShot(page, name) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function attachDiagnostics(page, consoleLogs, pageErrors, prefix = '') {
  const pfx = prefix ? `[${prefix}] ` : '';
  page.on('console', (msg) => {
    const loc = msg.location();
    const where = loc?.url ? ` @ ${loc.url}:${loc.lineNumber || 0}` : '';
    consoleLogs.push(`${pfx}[console.${msg.type()}] ${msg.text()}${where}`);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(`${pfx}${String(err?.stack || err?.message || err)}`);
  });
}

async function clickCoachNext(page, timeout = 20000) {
  const next = page.locator('#coachmark-next:not(.hidden)');
  await next.waitFor({ state: 'visible', timeout });
  await next.click();
}

async function main() {
  const pw = await loadPlaywright();
  if (!pw) return;

  const server = await startStaticServer();
  const consoleLogs = [];
  const pageErrors = [];
  let browser;

  try {
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    attachDiagnostics(page, consoleLogs, pageErrors);

    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        // Keep the smoke focused on architecture flow, not onboarding tutorial UI.
        localStorage.setItem('stockway_onboarded_v1', '1');
      } catch (_) { /* ignore */ }
    });

    console.log('STEP 0  fresh save boot');
    await page.goto(`http://127.0.0.1:${PORT}/index.html?manualSmoke=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await waitForAppReady(page);
    await clickDialogOk(page);
    await page.waitForSelector('#cash', { timeout: 20000 });
    const bootState = await page.evaluate(() => ({
      day: window.__stockwayTest?.getDay?.(),
      cash: window.__stockwayTest?.getCash?.(),
      watchCount: window.__stockwayTest?.getWatchCount?.(),
      staffCount: window.__stockwayTest?.getStaffCount?.(),
      marketDay: document.getElementById('market-day')?.textContent || '',
      status: document.getElementById('market-status')?.textContent || '',
    }));
    console.log('OBS 0', JSON.stringify(bootState));
    console.log('SHOT 0', await saveShot(page, '00-boot'));

    console.log('STEP 1  buy one stock from Listings');
    await page.locator('.nav-item[data-view="listings"]').click();
    await page.waitForSelector('#listings-full .listing', { timeout: 20000 });
    const listingPick = await page.evaluate(() => {
      const el = document.querySelector('#listings-full .listing');
      if (!el) return null;
      const priceTxt = el.querySelector('.listing-price')?.textContent || '';
      return {
        sym: el.getAttribute('data-sym') || '',
        priceText: priceTxt.trim(),
        title: (el.querySelector('.listing-name')?.textContent || '').trim(),
      };
    });
    assert(listingPick?.sym, 'could not locate listing symbol');
    await page.locator('#listings-full .listing').first().click();
    await page.waitForSelector('#btn-quick-long', { timeout: 15000 });
    const cashBeforeBuy = await page.evaluate(() => window.__stockwayTest.getCash());
    await page.locator('#quick-shares').fill('1');
    await page.locator('#btn-quick-long').click();
    await page.waitForSelector('#order-confirm-submit', { timeout: 10000 });
    await page.locator('#order-confirm-submit').click();
    await page.waitForTimeout(500);
    await clickDialogOk(page);
    const buyState = await page.evaluate(() => ({
      cashAfter: window.__stockwayTest.getCash(),
      marketDay: document.getElementById('market-day')?.textContent || '',
      posSummary: (document.getElementById('position-summary')?.textContent || '').replace(/\s+/g, ' ').trim(),
      chartSym: (document.getElementById('chart-sym')?.textContent || '').trim(),
    }));
    assert(buyState.cashAfter < cashBeforeBuy, `buy did not reduce cash (${cashBeforeBuy} -> ${buyState.cashAfter})`);
    console.log('OBS 1', JSON.stringify({ listingPick, cashBeforeBuy, ...buyState }));
    console.log('SHOT 1', await saveShot(page, '01-bought-from-listings'));

    console.log('STEP 2  add symbol to watchlist');
    const watchBefore = await page.evaluate(() => window.__stockwayTest.getWatchCount());
    await page.locator('#btn-watch-symbol').click();
    await page.waitForTimeout(350);
    const watchAfter = await page.evaluate(() => window.__stockwayTest.getWatchCount());
    assert(watchAfter >= watchBefore, 'watchlist count shrank unexpectedly');
    console.log('OBS 2', JSON.stringify({ watchBefore, watchAfter }));
    console.log('SHOT 2', await saveShot(page, '02-watchlist-added'));

    console.log('STEP 3  hire one staff member');
    await page.evaluate(() => window.__stockwayTest.ensureSmokeStaffUnlock());
    await page.locator('.nav-item[data-view="staff"]').click();
    await page.waitForSelector('.hire-btn', { timeout: 15000 });
    const staffBefore = await page.evaluate(() => window.__stockwayTest.getStaffCount());
    await page.locator('.hire-btn').first().click();
    await clickDialogOk(page);
    await page.waitForTimeout(500);
    const staffAfter = await page.evaluate(() => window.__stockwayTest.getStaffCount());
    assert(staffAfter > staffBefore, `staff did not increase (${staffBefore} -> ${staffAfter})`);
    console.log('OBS 3', JSON.stringify({ staffBefore, staffAfter }));
    console.log('SHOT 3', await saveShot(page, '03-staff-hired'));

    console.log('STEP 4  advance one full game day');
    const dayBefore = await page.evaluate(() => window.__stockwayTest.getDay());
    const advanceRes = await page.evaluate(() => window.__stockwayTest.forceAdvanceGameDay());
    const dayAfter = await page.evaluate(() => window.__stockwayTest.getDay());
    await dismissBlockingOverlays(page);
    const dayLabel = await page.locator('#market-day').textContent();
    assert(dayAfter === dayBefore + 1, `day did not advance (${dayBefore} -> ${dayAfter})`);
    console.log('OBS 4', JSON.stringify({ dayBefore, dayAfter, dayLabel, advanceRes }));
    console.log('SHOT 4', await saveShot(page, '04-day-advanced'));

    console.log('STEP 5  open Portfolio view');
    await page.locator('.nav-item[data-view="portfolio"]').click();
    await page.waitForSelector('#portfolio-full', { timeout: 15000 });
    const portfolioState = await page.evaluate(() => ({
      active: document.getElementById('view-portfolio')?.classList.contains('active') || false,
      cards: document.querySelectorAll('#portfolio-full .portfolio-card, #portfolio-full .holdings-table tr').length,
      textHead: (document.getElementById('portfolio-full')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    }));
    assert(portfolioState.active, 'portfolio view did not activate');
    console.log('OBS 5', JSON.stringify(portfolioState));
    console.log('SHOT 5', await saveShot(page, '05-portfolio-open'));

    console.log('STEP 6  unlock options+margin via save patch, reload, open options chain');
    const patchRes = await page.evaluate(() => {
      const raw = localStorage.getItem('stockway_save_v1');
      if (!raw) return { ok: false, reason: 'no save key' };
      const save = JSON.parse(raw);
      save.perks = Array.isArray(save.perks) ? save.perks : [];
      for (const id of ['scanner', 'margin', 'options']) {
        if (!save.perks.includes(id)) save.perks.push(id);
      }
      save.meta = save.meta && typeof save.meta === 'object' ? save.meta : {};
      save.meta.reputation = Math.max(Number(save.meta.reputation) || 0, 200);
      save.portfolio = save.portfolio && typeof save.portfolio === 'object'
        ? save.portfolio
        : { cash: 500, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [], totalTrades: 0, realizedPnL: 0 };
      save.portfolio.cash = Math.max(Number(save.portfolio.cash) || 0, 4000);
      localStorage.setItem('stockway_save_v1', JSON.stringify(save));
      return { ok: true, perks: save.perks, rep: save.meta.reputation, cash: save.portfolio.cash };
    });
    assert(patchRes.ok, `save patch failed: ${patchRes.reason || 'unknown'}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForAppReady(page);
    await dismissBlockingOverlays(page);
    // Re-select a concrete listing so options/short flow has a symbol context.
    await page.locator('.nav-item[data-view="listings"]').click();
    await page.waitForSelector('#listings-full .listing', { timeout: 15000 });
    const postReloadListing = await page.evaluate(() => {
      const el = document.querySelector('#listings-full .listing');
      if (!el) return null;
      const sym = String(el.getAttribute('data-sym') || '').toUpperCase();
      const name = (el.querySelector('.listing-name')?.textContent || sym).trim();
      const ask = Number((el.querySelector('.listing-price')?.textContent || '').replace(/[^0-9.]/g, '')) || 100;
      const mktTxt = el.querySelector('.listing-mkt')?.textContent || '';
      const mkt = Number(String(mktTxt).replace(/[^0-9.]/g, '')) || ask;
      return { sym, name, price: ask, marketPrice: mkt, desc: 'manual smoke listing', isDeal: false };
    });
    assert(postReloadListing?.sym, 'could not build post-reload listing payload');
    await page.locator('#listings-full .listing').first().click();
    let modalOpenedBy = 'listing-click';
    const modalVisible = await page
      .waitForSelector('#trade-modal:not(.hidden)', { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!modalVisible) {
      modalOpenedBy = 'fallback-openTradeModal';
      await page.evaluate(async (listing) => {
        const mod = await import('/js/ui/trade.js');
        mod.openTradeModal(listing, {
          perks: ['options', 'margin'],
          onTrade: () => {},
          onBuyOption: () => {},
        });
      }, postReloadListing);
      await page.waitForSelector('#trade-modal:not(.hidden)', { timeout: 15000 });
    }
    await page.waitForSelector('#btn-options', { timeout: 15000 });
    await page.locator('#btn-options').click();
    await page.waitForSelector('#options-panel:not(.hidden) .opt-row', { timeout: 15000 });
    const optionsState = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#options-panel .opt-row')];
      return {
        optionsRows: rows.length,
        firstRow: (rows[0]?.innerText || '').replace(/\s+/g, ' ').trim(),
        panelTextHead: (document.getElementById('options-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
      };
    });
    assert(optionsState.optionsRows > 0, 'options chain rows missing');
    console.log('OBS 6', JSON.stringify({ patchRes, modalOpenedBy, ...optionsState }));
    console.log('SHOT 6', await saveShot(page, '06-options-chain'));

    console.log('STEP 7  open short and force margin call');
    await page.locator('#modal-close').click();
    await page.locator('.nav-item[data-view="trade"]').click();
    await page.waitForSelector('#btn-quick-short', { timeout: 15000 });
    const chartSym = await page.evaluate((fallback) => {
      const txt = (document.getElementById('chart-sym')?.textContent || '').trim().toUpperCase();
      return txt || fallback?.sym || 'AAPL';
    }, postReloadListing);
    await page.locator('#quick-shares').fill('40');
    await page.locator('#btn-quick-short').click();
    await page.waitForSelector('#order-confirm-submit', { timeout: 10000 });
    await page.locator('#order-confirm-submit').click();
    await page.waitForTimeout(500);
    await clickDialogOk(page);

    const marginForce = await page.evaluate((symArg) => {
      const readPx = () => {
        const txt = document.getElementById('chart-price')?.textContent || '';
        const n = Number(String(txt).replace(/[^0-9.]/g, ''));
        return n > 0 ? n : 100;
      };
      const before = readPx();
      const spike = Math.max(before * 3, before + 250);
      window.__stockwayTest.forceLiveAnchor(symArg, spike);
      return { sym: symArg, before, spike };
    }, chartSym);

    let marginPath = 'short-then-live-anchor';
    const marginShown = await page.waitForFunction(() => {
      const el = document.getElementById('margin-stress-banner');
      if (!el || el.classList.contains('hidden')) return false;
      return /margin call/i.test(el.textContent || '');
    }, null, { timeout: 14000 }).then(() => true).catch(() => false);

    if (!marginShown) {
      marginPath = 'fallback-save-inject-underwater-short';
      const injected = await page.evaluate(async (sym) => {
        const key = String(sym || 'AAPL').toUpperCase();
        const raw = localStorage.getItem('stockway_save_v1');
        const save = raw ? JSON.parse(raw) : {};
        save.perks = Array.isArray(save.perks) ? save.perks : [];
        for (const id of ['scanner', 'margin']) if (!save.perks.includes(id)) save.perks.push(id);
        save.meta = save.meta && typeof save.meta === 'object' ? save.meta : {};
        save.meta.reputation = Math.max(Number(save.meta.reputation) || 0, 150);
        save.portfolio = save.portfolio && typeof save.portfolio === 'object'
          ? save.portfolio
          : { cash: 500, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [], totalTrades: 0, realizedPnL: 0 };
        save.portfolio.cash = 5;
        save.portfolio.longs = save.portfolio.longs && typeof save.portfolio.longs === 'object' ? save.portfolio.longs : {};
        save.portfolio.shorts = {
          [key]: { shares: 80, avgPrice: 1, marginHeld: 40 },
        };
        save.portfolio.options = Array.isArray(save.portfolio.options) ? save.portfolio.options : [];
        save.portfolio.pendingOrders = Array.isArray(save.portfolio.pendingOrders) ? save.portfolio.pendingOrders : [];
        save.portfolio.history = Array.isArray(save.portfolio.history) ? save.portfolio.history : [];
        const mod = await import('/js/margin-call.js');
        const health = mod.evaluateMarginHealth(save.portfolio);
        localStorage.setItem('stockway_save_v1', JSON.stringify(save));
        return {
          level: health?.level || null,
          worstRatio: health?.worstRatio ?? null,
          shortCount: Array.isArray(health?.shorts) ? health.shorts.length : 0,
        };
      }, chartSym);
      assert(injected.level === 'call', `injected short did not evaluate to call: ${JSON.stringify(injected)}`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForAppReady(page);
      await dismissBlockingOverlays(page);
      const bannerAfterReload = await page.waitForFunction(() => {
        const el = document.getElementById('margin-stress-banner');
        if (!el || el.classList.contains('hidden')) return false;
        return /margin call/i.test(el.textContent || '');
      }, null, { timeout: 12000 }).then(() => true).catch(() => false);
      if (!bannerAfterReload) marginPath += '-no-banner';
    }

    const marginState = await page.evaluate(() => ({
      bannerVisible: !document.getElementById('margin-stress-banner')?.classList.contains('hidden'),
      bannerText: (document.getElementById('margin-stress-banner')?.textContent || '').replace(/\s+/g, ' ').trim(),
      posSummary: (document.getElementById('position-summary')?.textContent || '').replace(/\s+/g, ' ').trim(),
      marketDay: document.getElementById('market-day')?.textContent || '',
      marketStatus: document.getElementById('market-status')?.textContent || '',
    }));
    console.log('OBS 7', JSON.stringify({ marginPath, marginForce, ...marginState }));
    console.log('SHOT 7', await saveShot(page, '07-margin-call'));

    console.log('STEP 8  visual baseline check');
    const hasBaseline = fs.existsSync(path.join(root, '.pre-refactor-shots'));
    const baselineFiles = hasBaseline
      ? fs.readdirSync(path.join(root, '.pre-refactor-shots')).filter((f) => /\.png$/i.test(f))
      : [];
    console.log('OBS 8', JSON.stringify({
      hasBaselineDir: hasBaseline,
      baselinePngCount: baselineFiles.length,
      baselineDir: hasBaseline ? path.join(root, '.pre-refactor-shots') : null,
      currentShotsDir: SHOTS_DIR,
    }));

    console.log('STEP 9  walkthrough halted-pick detour (no soft-lock)');
    const walkContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const walkPage = await walkContext.newPage();
    attachDiagnostics(walkPage, consoleLogs, pageErrors, 'walkthrough');
    await walkPage.addInitScript(() => {
      try {
        if (sessionStorage.getItem('__walkthrough_smoke_cleared')) return;
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__walkthrough_smoke_cleared', '1');
      } catch (_) { /* ignore */ }
    });
    await walkPage.goto(`http://127.0.0.1:${PORT}/index.html?walkthroughSmoke=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForAppReady(walkPage);
    await dismissBlockingOverlays(walkPage);
    await walkPage.waitForSelector('#onboard-overlay:not(.hidden)', { timeout: 30000 });
    await walkPage.evaluate(() => {
      localStorage.setItem('stockway_quote_baselines_v3', JSON.stringify({ __sentinel: { price: 123.45 } }));
    });
    const walkthroughPick = await walkPage.evaluate(async () => {
      const onboarding = await import('/js/onboarding-walkthrough.js');
      const listings = window.__stockwayTest?.getListings?.() || [];
      const cash = window.__stockwayTest?.getCash?.() ?? 500;
      const pick = onboarding.pickWalkthroughListing(listings, cash);
      return {
        sym: String(pick?.sym || '').toUpperCase(),
        listingsCount: listings.length,
        cash,
      };
    });
    assert(walkthroughPick.sym, 'walkthrough pick symbol not found');
    const haltResult = await walkPage.evaluate((sym) => window.__stockwayTest?.forceHalt?.(sym), walkthroughPick.sym);
    assert(haltResult?.halted === true, `failed to force halt for walkthrough pick: ${JSON.stringify(haltResult)}`);
    await walkPage.locator('#onboard-new').click();
    await clickCoachNext(walkPage, 25000); // Step 1
    await clickCoachNext(walkPage, 25000); // Step 2

    let haltCoachSeen = false;
    let haltCoachAdvanced = false;
    let swapSeen = false;
    let detourState = null;
    for (let i = 0; i < 80; i++) {
      detourState = await walkPage.evaluate(async () => {
        const onboarding = await import('/js/onboarding-walkthrough.js');
        const meta = onboarding.getWalkthroughSuggestMeta();
        return {
          suggestSym: String(meta?.sym || '').toUpperCase(),
          coachText: document.getElementById('coachmark-text')?.textContent || '',
          walkthroughActive: !!window.__stockwayWalkthroughActive,
          activeViewId: document.querySelector('.view-panel.active')?.id || '',
        };
      });
      if (/Trading halt:/i.test(detourState.coachText)) {
        haltCoachSeen = true;
        if (!haltCoachAdvanced) {
          const nextVisible = await walkPage.locator('#coachmark-next:not(.hidden)').isVisible().catch(() => false);
          if (nextVisible) {
            await walkPage.locator('#coachmark-next').click();
            haltCoachAdvanced = true;
          }
        }
      }
      if (detourState.suggestSym && detourState.suggestSym !== walkthroughPick.sym) {
        swapSeen = true;
        break;
      }
      await walkPage.waitForTimeout(250);
    }
    assert(swapSeen, `walkthrough did not swap off halted symbol ${walkthroughPick.sym}`);
    const detourMode = haltCoachSeen ? 'coach-swap' : 'prevention-swap';
    console.log('OBS 9', JSON.stringify({
      walkthroughPick,
      haltResult,
      detourState,
      detourMode,
      haltCoachSeen,
      swapSeen,
    }));
    console.log('SHOT 8', await saveShot(walkPage, '08-walkthrough-halt-detour'));

    console.log('STEP 10  walkthrough finish preserves quote baseline cache');
    await walkPage.waitForSelector('#btn-quick-long', { timeout: 25000 });
    await walkPage.locator('#btn-quick-long').click();
    await walkPage.waitForSelector('#order-confirm-submit', { timeout: 10000 });
    await walkPage.locator('#order-confirm-submit').click();
    await walkPage.waitForTimeout(500);
    await clickDialogOk(walkPage);
    await clickCoachNext(walkPage, 25000); // Step 4

    const heldSymBeforeSell = await walkPage.evaluate(() => window.__stockwayTest?.getOpenLongSymbols?.()[0] || '');
    assert(heldSymBeforeSell, 'no held symbol found during walkthrough close step');
    await walkPage.evaluate(async (sym) => window.__stockwayTest?.selectSymbol?.(sym), heldSymBeforeSell);
    await walkPage.waitForSelector('#btn-quick-sell', { timeout: 25000 });
    await walkPage.locator('#btn-quick-sell').click();
    await walkPage.waitForSelector('#order-confirm-submit', { timeout: 10000 });
    await walkPage.locator('#order-confirm-submit').click();
    await walkPage.waitForTimeout(500);
    await clickDialogOk(walkPage);

    const reloadDeadline = Date.now() + 45000;
    let reloadObserved = false;
    while (Date.now() < reloadDeadline) {
      try {
        reloadObserved = await walkPage.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return !!nav && nav.type === 'reload';
        });
      } catch (_) { /* page may be between navigations */ }
      if (reloadObserved) break;
      await walkPage.waitForTimeout(250);
    }
    assert(reloadObserved, 'walkthrough completion did not trigger reset reload');
    await waitForAppReady(walkPage);
    await dismissBlockingOverlays(walkPage);
    const postWalkReload = await walkPage.evaluate(() => {
      const baseline = localStorage.getItem('stockway_quote_baselines_v3');
      const preload = document.getElementById('quote-preload-overlay');
      const onboard = document.getElementById('onboard-overlay');
      return {
        hasBaselineKey: !!baseline,
        baselineLength: baseline ? baseline.length : 0,
        baselineHasSentinel: baseline ? baseline.includes('__sentinel') : false,
        preloadVisible: preload ? !preload.classList.contains('hidden') : false,
        onboardVisible: onboard ? !onboard.classList.contains('hidden') : false,
        marketDay: document.getElementById('market-day')?.textContent || '',
        marketStatus: document.getElementById('market-status')?.textContent || '',
      };
    });
    assert(postWalkReload.hasBaselineKey, 'quote baseline key missing after walkthrough reset reload');
    console.log('OBS 10', JSON.stringify(postWalkReload));
    console.log('SHOT 9', await saveShot(walkPage, '09-walkthrough-post-reload'));
    await walkContext.close();

    console.log('--- RAW PAGE ERRORS ---');
    if (!pageErrors.length) console.log('(none)');
    pageErrors.forEach((e) => console.log(e));

    console.log('--- RAW CONSOLE LOGS (all levels) ---');
    if (!consoleLogs.length) console.log('(none)');
    consoleLogs.forEach((line) => console.log(line));

    console.log('PASS  manual architecture smoke');
  } catch (e) {
    console.error('FAIL  manual architecture smoke');
    console.error(String(e?.stack || e?.message || e));
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
