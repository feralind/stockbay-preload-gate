/**
 * Quote integrity — seed→live refresh, UI sync, options spot, daily shock cap.
 * Run: node scripts/quote-integrity-check.cjs
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error('     ', e.message);
    process.exitCode = 1;
  }
}

function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const api = await import(pathToFileURL(path.join(__dirname, '../js/api.js')).href);
  const {
    ALL_SYMBOLS: _ignore,
    getQuoteCache, seedQuote, fillMissingQuotes, isLiveAnchoredQuote,
    startSimulationMode, getCachedQuote,
    filterSymbolsForQuoteRefresh, applyLiveAnchor, onQuoteTransition,
    ensureLiveQuoteForDisplay, isSimulationMode, refreshQuotesMidRun, fetchQuote,
    preloadQuotesToTarget, countLiveAnchoredQuotes, buildPreloadSymbolOrder,
    formatPreloadStatusLabel, parsePreloadProgress,
    loadPersistedBaselines, buildBaselineSnapshot,
    startBackgroundQuotePreload, isBackgroundPreloadActive, __resetBackgroundPreloadForTests,
    __setStatusCallbackForTests,
  } = api;

  const symMod = await import(pathToFileURL(path.join(__dirname, '../js/symbols.js')).href);
  const { ALL_SYMBOLS } = symMod;

  const mkt = await import(pathToFileURL(path.join(__dirname, '../js/market.js')).href);
  const {
    applyPriceShock, resetDailyShockAccum, getDailyShockAccum,
    MAX_DAILY_SHOCK_PCT, clampDailyShockPct, rollQuotesForNewDay,
  } = mkt;

  const events = await import(pathToFileURL(path.join(__dirname, '../js/events.js')).href);
  const { triggerEvent } = events;

  let ui;
  try {
    ui = await import(pathToFileURL(path.join(__dirname, '../js/ui.js')).href);
  } catch (e) {
    console.warn('ui.js import failed (DOM stubs may be needed):', e.message);
  }

  // ---- Fix 1: startQuoteRefresh must still refresh seed / unanchored quotes ----

  await test('cold start: symbols beyond first 80 are source:seed', () => {
    getQuoteCache().clear();
    fillMissingQuotes(); // default: first 80
    const first80 = new Set(ALL_SYMBOLS.slice(0, 80));
    const offPool = ALL_SYMBOLS.filter((s) => !first80.has(s));
    assert.ok(offPool.length >= 400, `expected large off-pool, got ${offPool.length}`);
    // Seed a sample of off-pool (what listings/watchlist do on demand)
    const sample = offPool.slice(0, 40);
    sample.forEach((sym) => seedQuote(sym));
    for (const sym of sample) {
      const q = getCachedQuote(sym);
      assert.ok(q, `${sym} missing`);
      assert.equal(q.source, 'seed', `${sym} should be seed, got ${q.source}`);
      assert.equal(isLiveAnchoredQuote(q), false, `${sym} must not be live-anchored`);
    }
  });

  await test('filterSymbolsForQuoteRefresh keeps seeds during simulationMode', () => {
    assert.equal(typeof filterSymbolsForQuoteRefresh, 'function',
      'api.js must export filterSymbolsForQuoteRefresh');
    getQuoteCache().clear();
    seedQuote('SEEDY1');
    seedQuote('SEEDY2');
    applyLiveAnchor('LIVE1', {
      price: 100, open: 99, high: 101, low: 98, prevClose: 99,
      change: 1, changePct: 1, source: 'yahoo', updated: Date.now(),
    });
    startSimulationMode();
    assert.equal(isSimulationMode(), true);

    const filtered = filterSymbolsForQuoteRefresh(
      ['SEEDY1', 'SEEDY2', 'LIVE1', 'MISSING'],
      { simulationMode: true },
    );
    assert.ok(filtered.includes('SEEDY1'), 'seed must refresh in sim');
    assert.ok(filtered.includes('SEEDY2'), 'seed must refresh in sim');
    assert.ok(filtered.includes('MISSING'), 'missing cache must refresh');
    assert.ok(!filtered.includes('LIVE1'), 'live-anchored must be skipped in sim');

    const all = filterSymbolsForQuoteRefresh(
      ['SEEDY1', 'LIVE1'],
      { simulationMode: false },
    );
    assert.deepEqual(all.sort(), ['LIVE1', 'SEEDY1'].sort());
  });

  // ---- Fix 2: seed→live must push listings / options / watchlist sync ----

  await test('applyLiveAnchor emits onQuoteTransition seed→live', () => {
    assert.equal(typeof applyLiveAnchor, 'function', 'api.js must export applyLiveAnchor');
    assert.equal(typeof onQuoteTransition, 'function', 'api.js must export onQuoteTransition');
    getQuoteCache().clear();
    seedQuote('TRANS1');
    const before = getCachedQuote('TRANS1');
    assert.equal(before.source, 'seed');

    const seen = [];
    const unsub = onQuoteTransition((evt) => seen.push(evt));
    const livePx = before.price * 1.35; // clearly different from seed
    applyLiveAnchor('TRANS1', {
      price: livePx, open: livePx, high: livePx, low: livePx,
      prevClose: livePx * 0.99, change: livePx * 0.01, changePct: 1,
      source: 'yahoo', updated: Date.now(),
    });
    unsub?.();

    assert.equal(seen.length, 1, `expected 1 transition, got ${seen.length}`);
    assert.equal(seen[0].sym, 'TRANS1');
    assert.equal(seen[0].prev?.source, 'seed');
    assert.equal(isLiveAnchoredQuote(seen[0].next), true);
    assert.ok(Math.abs(getCachedQuote('TRANS1').price - livePx) < 0.01);
  });

  await test('seed→live syncs state.listings (and hot listings share same array)', () => {
    assert.ok(ui?.syncListingsFromQuotes, 'ui.syncListingsFromQuotes required');
    getQuoteCache().clear();
    const rng = mulberry32(42);
    const first80 = new Set(ALL_SYMBOLS.slice(0, 80));
    const offPool = ALL_SYMBOLS.filter((s) => !first80.has(s));
    const sample = [];
    while (sample.length < 20) {
      const sym = offPool[Math.floor(rng() * offPool.length)];
      if (!sample.includes(sym)) sample.push(sym);
    }

    const state = { listings: [], perks: ['scanner'] };
    for (const sym of sample) {
      const q = seedQuote(sym);
      state.listings.push({
        id: `t_${sym}`,
        sym,
        price: +(q.price * 0.95).toFixed(2),
        trueValue: q.price,
        marketPrice: q.price,
        changePct: q.changePct || 0,
        isDeal: true,
        isMarket: false,
      });
    }

    // Same wiring app.js uses: transition → syncListingsFromQuotes
    const unsub = onQuoteTransition(({ sym }) => {
      ui.syncListingsFromQuotes(state, [sym], { rescaleAsks: true });
    });

    const corrected = new Map();
    for (const sym of sample) {
      const seedPx = getCachedQuote(sym).price;
      const livePx = +(seedPx * (1.2 + rng() * 0.4)).toFixed(2);
      corrected.set(sym, livePx);
      applyLiveAnchor(sym, {
        price: livePx, open: livePx, high: livePx, low: livePx,
        prevClose: livePx * 0.995, change: livePx * 0.005, changePct: 0.5,
        source: 'yahoo', updated: Date.now(),
      });
    }
    unsub?.();

    for (const sym of sample) {
      const row = state.listings.find((l) => l.sym === sym);
      assert.ok(row, `listing missing for ${sym}`);
      assert.ok(
        Math.abs(row.marketPrice - corrected.get(sym)) < 0.02,
        `${sym} listing.marketPrice ${row.marketPrice} != live ${corrected.get(sym)}`,
      );
    }
  });

  await test('onQuoteTransition handler can refresh watchlist quote snapshot', () => {
    getQuoteCache().clear();
    seedQuote('WATCH1');
    const seedPx = getCachedQuote('WATCH1').price;
    const livePx = +(seedPx * 1.5).toFixed(2);

    let watchPrice = seedPx;
    const unsub = onQuoteTransition(({ sym, next }) => {
      if (sym === 'WATCH1') watchPrice = next.price;
    });
    applyLiveAnchor('WATCH1', {
      price: livePx, open: livePx, high: livePx, low: livePx,
      prevClose: livePx * 0.99, change: 1, changePct: 1,
      source: 'finnhub', updated: Date.now(),
    });
    unsub?.();
    assert.ok(Math.abs(watchPrice - livePx) < 0.01, `watchlist should update immediately, got ${watchPrice}`);
  });

  // ---- Fix 4: options chain must not silently use seed spot ----

  await test('ensureLiveQuoteForDisplay refuses silent seed for options', async () => {
    assert.equal(typeof ensureLiveQuoteForDisplay, 'function',
      'api.js must export ensureLiveQuoteForDisplay');
    getQuoteCache().clear();
    seedQuote('OPTSEED');
    const listingFallback = { marketPrice: getCachedQuote('OPTSEED').price };

    // Offline / no network: must report unanchored rather than pretend it's live
    const result = await ensureLiveQuoteForDisplay('OPTSEED', {
      listingFallbackPrice: listingFallback.marketPrice,
      allowSeed: false,
    });
    assert.equal(result.anchored, false, 'seed must not count as anchored for options');
    assert.equal(result.source, 'seed');
    // When live is injected, becomes anchored
    applyLiveAnchor('OPTSEED', {
      price: 55, open: 54, high: 56, low: 53, prevClose: 54,
      change: 1, changePct: 1.8, source: 'yahoo', updated: Date.now(),
    });
    const live = await ensureLiveQuoteForDisplay('OPTSEED', { allowSeed: false });
    assert.equal(live.anchored, true);
    assert.ok(Math.abs(live.price - 55) < 0.01);
  });

  // ---- Fix 5: per-symbol daily cumulative shock cap ----

  await test('daily shock cap clamps cumulative events before apply', () => {
    assert.equal(typeof clampDailyShockPct, 'function', 'market.js must export clampDailyShockPct');
    assert.equal(typeof resetDailyShockAccum, 'function');
    assert.ok(MAX_DAILY_SHOCK_PCT >= 0.09 && MAX_DAILY_SHOCK_PCT <= 0.10,
      `MAX_DAILY_SHOCK_PCT should be ~9–10%, got ${MAX_DAILY_SHOCK_PCT}`);

    resetDailyShockAccum();
    getQuoteCache().clear();
    getQuoteCache().set('NVDA', {
      price: 100, prevClose: 100, baselinePrice: 100, high: 100, low: 100, source: 'yahoo',
    });

    // Two 5% event-sized shocks should leave room; a third should be clipped by daily cap
    applyPriceShock('NVDA', 0.05, { maxPct: 0.05, countDaily: true });
    applyPriceShock('NVDA', 0.05, { maxPct: 0.05, countDaily: true });
    const mid = getCachedQuote('NVDA').price;
    applyPriceShock('NVDA', 0.05, { maxPct: 0.05, countDaily: true });
    const after = getCachedQuote('NVDA').price;

    const accum = getDailyShockAccum('NVDA');
    assert.ok(Math.abs(accum) <= MAX_DAILY_SHOCK_PCT + 1e-9,
      `accum ${accum} exceeds daily cap ${MAX_DAILY_SHOCK_PCT}`);
    // Third shock must not add a full +5% on top of ~10.25 compound from two 5%s
    const thirdMove = (after - mid) / mid;
    assert.ok(thirdMove < 0.03, `third shock moved ${(thirdMove * 100).toFixed(2)}% — daily cap failed`);
  });

  await test('daily shock accum resets on new session day', () => {
    resetDailyShockAccum();
    getQuoteCache().set('AMD', {
      price: 100, prevClose: 100, baselinePrice: 100, high: 100, low: 100,
    });
    applyPriceShock('AMD', 0.05, { maxPct: 0.05, countDaily: true });
    assert.ok(Math.abs(getDailyShockAccum('AMD')) > 0);
    rollQuotesForNewDay();
    assert.equal(getDailyShockAccum('AMD') || 0, 0, 'accum must reset on rollQuotesForNewDay');
  });

  await test('world events use daily tracked shocks (NVDA multi-template)', () => {
    resetDailyShockAccum();
    getQuoteCache().clear();
    for (const sym of ['NVDA', 'AMD', 'AVGO', 'PFE', 'AAPL', 'MSFT']) {
      getQuoteCache().set(sym, {
        price: 100, prevClose: 100, baselinePrice: 100, high: 100, low: 100, source: 'yahoo',
      });
    }
    // Stack three bullish NVDA-heavy events — each capped at 5%, daily must stop ~10%
    for (let i = 0; i < 3; i++) {
      triggerEvent({
        id: `ai_boom_stack_${i}`,
        headline: 'AI boom',
        sectors: { tech: 0.03 },
        symbols: { NVDA: 0.08, AMD: 0.06, AVGO: 0.04 },
      });
    }

    const nvda = getCachedQuote('NVDA');
    const dayMove = Math.abs(nvda.price / 100 - 1);
    assert.ok(dayMove <= MAX_DAILY_SHOCK_PCT + 0.015,
      `NVDA day move ${(dayMove * 100).toFixed(2)}% exceeds ~${MAX_DAILY_SHOCK_PCT * 100}% cap`);
    assert.ok(Math.abs(getDailyShockAccum('NVDA')) <= MAX_DAILY_SHOCK_PCT + 1e-9);
  });

  // ---- Fix 3: force live before trade + no silent equity snap / one-time notice ----

  await test('fix3b: seed→live keeps avgPrice and fires price-corrected notice once', async () => {
    const portMod = await import(pathToFileURL(path.join(__dirname, '../js/portfolio.js')).href);
    const { createPortfolio, buyLong, markPriceCorrectedNotices } = portMod;
    assert.equal(typeof markPriceCorrectedNotices, 'function',
      'portfolio.js must export markPriceCorrectedNotices');

    getQuoteCache().clear();
    const seed = seedQuote('FIX3B');
    const seedPx = seed.price;
    assert.equal(seed.source, 'seed');

    const portfolio = createPortfolio(50_000);
    const bought = buyLong(portfolio, 'FIX3B', 10, seedPx);
    assert.equal(bought.ok, true);
    assert.ok(Math.abs(portfolio.longs.FIX3B.avgPrice - seedPx) < 0.01);

    const livePx = +(seedPx * 1.55).toFixed(2);
    const notices1 = [];
    const unsub = onQuoteTransition(({ sym, next }) => {
      const n = markPriceCorrectedNotices(sym, portfolio, { livePrice: next?.price });
      notices1.push(...n);
    });
    applyLiveAnchor('FIX3B', {
      price: livePx, open: livePx, high: livePx, low: livePx,
      prevClose: livePx * 0.99, change: 1, changePct: 1,
      source: 'yahoo', updated: Date.now(),
    });
    unsub?.();

    assert.ok(Math.abs(portfolio.longs.FIX3B.avgPrice - seedPx) < 0.01,
      `avgPrice must stay at seed entry ${seedPx}, got ${portfolio.longs.FIX3B.avgPrice}`);
    assert.equal(notices1.length, 1, `expected 1 price-corrected notice, got ${notices1.length}`);
    assert.equal(notices1[0].sym, 'FIX3B');
    assert.equal(portfolio.longs.FIX3B.priceCorrectedAck, true);

    // Second transition / re-anchor must NOT re-fire
    const notices2 = markPriceCorrectedNotices('FIX3B', portfolio, { livePrice: livePx * 1.01 });
    assert.equal(notices2.length, 0, 'notice must fire only once per position');
  });

  await test('fix3b: adding shares clears priceCorrectedAck (long + short); partial sell keeps it', async () => {
    const portMod = await import(pathToFileURL(path.join(__dirname, '../js/portfolio.js')).href);
    const { createPortfolio, buyLong, sellLong, openShort, coverShort } = portMod;

    getQuoteCache().clear();
    // --- Long: corrected then add ---
    const longP = createPortfolio(100_000);
    buyLong(longP, 'ADD1', 10, 50);
    longP.longs.ADD1.priceCorrectedAck = true;
    const add = buyLong(longP, 'ADD1', 10, 80); // blend → avg 65
    assert.equal(add.ok, true);
    assert.ok(!longP.longs.ADD1.priceCorrectedAck, 'buyLong add must clear priceCorrectedAck');
    assert.ok(Math.abs(longP.longs.ADD1.avgPrice - 65) < 0.01, `blended avg expected 65, got ${longP.longs.ADD1.avgPrice}`);

    // --- Long: corrected then partial sell keeps flag ---
    const longSell = createPortfolio(100_000);
    buyLong(longSell, 'KEEP1', 10, 40);
    longSell.longs.KEEP1.priceCorrectedAck = true;
    const sold = sellLong(longSell, 'KEEP1', 3, 55);
    assert.equal(sold.ok, true);
    assert.equal(longSell.longs.KEEP1.shares, 7);
    assert.equal(longSell.longs.KEEP1.priceCorrectedAck, true, 'partial sell must keep priceCorrectedAck');
    // Full close deletes the position object
    sellLong(longSell, 'KEEP1', 7, 55);
    assert.equal(longSell.longs.KEEP1, undefined, 'full close must delete position');

    // --- Short: corrected then add ---
    const shortP = createPortfolio(100_000);
    openShort(shortP, 'ADD2', 10, 100, true);
    shortP.shorts.ADD2.priceCorrectedAck = true;
    const shortAdd = openShort(shortP, 'ADD2', 10, 60, true); // blend → avg 80
    assert.equal(shortAdd.ok, true);
    assert.ok(!shortP.shorts.ADD2.priceCorrectedAck, 'openShort add must clear priceCorrectedAck');
    assert.ok(Math.abs(shortP.shorts.ADD2.avgPrice - 80) < 0.01, `short blended avg expected 80, got ${shortP.shorts.ADD2.avgPrice}`);

    // --- Short: corrected then partial cover keeps flag ---
    const shortCover = createPortfolio(100_000);
    openShort(shortCover, 'KEEP2', 10, 90, true);
    shortCover.shorts.KEEP2.priceCorrectedAck = true;
    const covered = coverShort(shortCover, 'KEEP2', 4, 85);
    assert.equal(covered.ok, true);
    assert.equal(shortCover.shorts.KEEP2.shares, 6);
    assert.equal(shortCover.shorts.KEEP2.priceCorrectedAck, true, 'partial cover must keep priceCorrectedAck');
    coverShort(shortCover, 'KEEP2', 6, 85);
    assert.equal(shortCover.shorts.KEEP2, undefined, 'full cover must delete short');
  });

  await test('fix3a: ensureLiveQuoteForDisplay resolves seed before trade fill', async () => {
    getQuoteCache().clear();
    seedQuote('FIX3A');
    assert.equal(getCachedQuote('FIX3A').source, 'seed');

    // Offline: allowSeed true → returns seed without blocking
    const offline = await ensureLiveQuoteForDisplay('FIX3A', {
      allowSeed: true,
      force: true,
    });
    assert.equal(offline.anchored, false);
    assert.ok(offline.price > 0, 'offline must still return a tradeable seed price');

    // Inject live then resolve — trade path should prefer anchored
    applyLiveAnchor('FIX3A', {
      price: 88.5, open: 88, high: 89, low: 87, prevClose: 87.5,
      change: 1, changePct: 1.1, source: 'yahoo', updated: Date.now(),
    });
    const live = await ensureLiveQuoteForDisplay('FIX3A', { allowSeed: true });
    assert.equal(live.anchored, true);
    assert.ok(Math.abs(live.price - 88.5) < 0.01);
  });

  // ---- Mid-run Sync must not yank live-anchored sim tape (buy-low / refresh / sell-high) ----

  await test('toolbar mid-run refresh: drifted live-anchored stays; seed still refreshes', async () => {
    assert.equal(typeof refreshQuotesMidRun, 'function',
      'api.js must export refreshQuotesMidRun (toolbar / Deal Desk Sync path)');
    getQuoteCache().clear();
    const portMod = await import(pathToFileURL(path.join(__dirname, '../js/portfolio.js')).href);
    const { createPortfolio, buyLong } = portMod;

    // Live-anchored, then drift downward (sim tape) while holding a position
    applyLiveAnchor('HOLD1', {
      price: 315, open: 314, high: 316, low: 313, prevClose: 310,
      change: 5, changePct: 1.6, source: 'yahoo', updated: Date.now(),
    });
    startSimulationMode();
    const cache = getQuoteCache();
    const drifted = cache.get('HOLD1');
    drifted.price = 300;
    drifted.change = 300 - drifted.prevClose;
    drifted.changePct = ((300 / drifted.prevClose) - 1) * 100;
    drifted.simulated = true;
    cache.set('HOLD1', drifted);
    assert.equal(isLiveAnchoredQuote(getCachedQuote('HOLD1')), true);
    assert.ok(Math.abs(getCachedQuote('HOLD1').price - 300) < 0.01);

    const pf = createPortfolio(50_000);
    const bought = buyLong(pf, 'HOLD1', 2, 300, {}, []);
    assert.equal(bought.ok, true, 'must open a position on the drifted sim price');

    seedQuote('SEEDHOLD');
    assert.equal(getCachedQuote('SEEDHOLD').source, 'seed');
    assert.equal(isLiveAnchoredQuote(getCachedQuote('SEEDHOLD')), false);

    const mid = await refreshQuotesMidRun(['HOLD1', 'SEEDHOLD']);
    assert.ok(mid.skipped.includes('HOLD1'), 'live-anchored must be skipped by mid-run filter');
    assert.ok(mid.refreshed.includes('SEEDHOLD'), 'seed must still be selected for refresh');
    assert.ok(!mid.refreshed.includes('HOLD1'), 'must not re-fetch drifted live-anchored');
    assert.ok(Math.abs(getCachedQuote('HOLD1').price - 300) < 0.01,
      'toolbar refresh must NOT snap sim price back to a new live print');

    // Contract of fetchQuote(force:false) during sim — keepSimulating
    const again = await fetchQuote('HOLD1', { force: false });
    assert.ok(Math.abs(again.price - 300) < 0.01, 'force:false must keep sim tape');
  });

  await test('viewport mid-run refresh: drifted live-anchored stays; seed still refreshes', async () => {
    // Same soft helper Deal Desk viewport / 12s interval uses (refreshQuotesMidRun).
    getQuoteCache().clear();
    applyLiveAnchor('VIEW1', {
      price: 200, open: 199, high: 201, low: 198, prevClose: 195,
      change: 5, changePct: 2.5, source: 'yahoo', updated: Date.now(),
    });
    startSimulationMode();
    const cache = getQuoteCache();
    const drifted = cache.get('VIEW1');
    drifted.price = 180;
    drifted.simulated = true;
    cache.set('VIEW1', drifted);

    seedQuote('VIEWSEED');
    const mid = await refreshQuotesMidRun(['VIEW1', 'VIEWSEED']);
    assert.ok(mid.skipped.includes('VIEW1'), 'viewport path must skip live-anchored');
    assert.ok(mid.refreshed.includes('VIEWSEED'), 'viewport path must still refresh seeds');
    assert.ok(Math.abs(getCachedQuote('VIEW1').price - 180) < 0.01,
      'viewport refresh must NOT yank drifted sim price to live');
  });

  // ---- Boot preload gate (first launch / Reset) + background climb ----

  await test('preload gate: blocks only until 50 anchored (cache-first, not 500)', async () => {
    getQuoteCache().clear();
    __resetBackgroundPreloadForTests();
    const gateTarget = 50;
    const cachedCount = 35;

    for (let i = 0; i < cachedCount; i++) {
      const sym = ALL_SYMBOLS[i];
      applyLiveAnchor(sym, {
        price: 100 + (i % 50),
        open: 99, high: 101, low: 98, prevClose: 97,
        change: 3, changePct: 3, source: 'yahoo', updated: Date.now(),
      });
      const q = getQuoteCache().get(sym);
      q.fromCache = true;
      q.source = 'cached';
      q.simulated = true;
      getQuoteCache().set(sym, q);
    }
    assert.equal(countLiveAnchoredQuotes(), cachedCount);

    let networkCalls = 0;
    const result = await preloadQuotesToTarget({
      target: gateTarget,
      prioritySymbols: ['AAPL', 'NVDA'],
      batchSize: 10,
      gapMs: 0,
      fetchOne: async () => {
        networkCalls++;
        return {
          price: 120, open: 119, high: 121, low: 118, prevClose: 117,
          change: 3, changePct: 2.5, source: 'yahoo', updated: Date.now(),
        };
      },
    });

    assert.ok(result.loaded >= gateTarget, `gate must reach ${gateTarget}, got ${result.loaded}`);
    assert.ok(result.loaded < 500, 'blocking gate must NOT wait for 500');
    assert.ok(networkCalls <= (gateTarget - cachedCount) + 2,
      `only fetch delta to 50 (~${gateTarget - cachedCount}), got ${networkCalls}`);
    assert.ok(networkCalls >= (gateTarget - cachedCount) - 2);
    assert.equal(result.aborted, false);

    const label = formatPreloadStatusLabel(12, 50);
    assert.equal(label, 'Loading quotes… 12 / 50');
    assert.deepEqual(parsePreloadProgress(label), { loaded: 12, target: 50 });
  });

  await test('preload gate: stalled fetch + abort becomes playable (short timeout/skip)', async () => {
    getQuoteCache().clear();
    __resetBackgroundPreloadForTests();
    let skip = false;
    let started = 0;

    const hung = preloadQuotesToTarget({
      target: 50,
      batchSize: 4,
      gapMs: 0,
      shouldAbort: () => skip,
      fetchOne: () => {
        started++;
        return new Promise(() => {});
      },
    });

    await new Promise((r) => setTimeout(r, 80));
    assert.ok(started >= 1, 'preload should have attempted at least one fetch');
    skip = true;

    const result = await Promise.race([
      hung,
      new Promise((_, rej) => setTimeout(() => rej(new Error('preload hung after abort')), 2000)),
    ]);

    assert.equal(result.aborted, true);
    assert.ok(result.loaded < 50);
  });

  await test('after gate clears, background climb toward 500 does not block', async () => {
    getQuoteCache().clear();
    __resetBackgroundPreloadForTests();

    // Simulate gate already satisfied at 50
    for (let i = 0; i < 50; i++) {
      applyLiveAnchor(ALL_SYMBOLS[i], {
        price: 100, open: 99, high: 101, low: 98, prevClose: 97,
        change: 1, changePct: 1, source: 'yahoo', updated: Date.now(),
      });
    }
    assert.equal(countLiveAnchoredQuotes(), 50);

    let networkCalls = 0;
    let done = null;
    const donePromise = new Promise((r) => { done = r; });
    __setStatusCallbackForTests(() => {});

    const started = startBackgroundQuotePreload({
      target: 80, // small stand-in for 500 so the test stays fast
      gapMs: 0,
      fetchOne: async () => {
        networkCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return {
          price: 110, open: 109, high: 111, low: 108, prevClose: 107,
          change: 3, changePct: 2.5, source: 'yahoo', updated: Date.now(),
        };
      },
      onDone: (info) => done(info),
    });

    assert.equal(started, true, 'background preload must start');
    assert.equal(isBackgroundPreloadActive(), true);
    // Caller is not blocked — we reach here while fetches are still in flight
    assert.ok(countLiveAnchoredQuotes() < 80, 'must not have finished before returning');

    const info = await Promise.race([
      donePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('background climb hung')), 5000)),
    ]);
    assert.ok(info.loaded >= 80);
    assert.ok(networkCalls >= 25, `should fetch remaining delta, got ${networkCalls}`);
    assert.equal(isBackgroundPreloadActive(), false);
    __setStatusCallbackForTests(null);
  });

  await test('badge reflects background progress then settles at target', async () => {
    getQuoteCache().clear();
    __resetBackgroundPreloadForTests();

    const bgLabel = formatPreloadStatusLabel(187, 500, { background: true });
    assert.equal(bgLabel, 'Anchoring baselines… 187 / 500');
    const progress = parsePreloadProgress(bgLabel);
    assert.deepEqual(progress, { loaded: 187, target: 500 });
    // Contract matching ui.js renderFeedStatus short form
    assert.equal(`${progress.loaded}/${progress.target} bases`, '187/500 bases');

    const settled = 'Connected · 512 baselines (Yahoo)';
    assert.equal(parsePreloadProgress(settled), null, 'settled label has no X/Y progress');
    assert.match(settled, /(\d+)\s*baselines/i);
    const m = settled.match(/(\d+)\s*baselines/i);
    assert.equal(`${m[1]} bases`, '512 bases');

    for (let i = 0; i < 5; i++) {
      applyLiveAnchor(ALL_SYMBOLS[i], {
        price: 100, open: 99, high: 101, low: 98, prevClose: 97,
        change: 1, changePct: 1, source: 'yahoo', updated: Date.now(),
      });
    }
    const labels = [];
    __setStatusCallbackForTests((_mode, label) => { labels.push(label); });

    let finished = null;
    const finishedP = new Promise((r) => { finished = r; });
    startBackgroundQuotePreload({
      target: 12,
      gapMs: 0,
      fetchOne: async () => ({
        price: 105, open: 104, high: 106, low: 103, prevClose: 102,
        change: 3, changePct: 3, source: 'yahoo', updated: Date.now(),
      }),
      onDone: () => finished(true),
    });
    await finishedP;

    const progressLabels = labels.filter((l) => /\/\s*12/.test(l) && /anchoring/i.test(l));
    assert.ok(progressLabels.length >= 1, 'background must emit anchoring X/Y labels for the badge');
    const lastProgress = parsePreloadProgress(progressLabels[progressLabels.length - 1]);
    assert.ok(lastProgress && lastProgress.loaded >= 12);
    const settledLabels = labels.filter((l) => /connected/i.test(l) && /baselines/i.test(l));
    assert.ok(settledLabels.length >= 1, 'must settle to Connected · N baselines');
    __setStatusCallbackForTests(null);
  });

  // ---- Hot listings sliding-window rotation ----

  function makeDealListings(count, { live = false } = {}) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      const sym = ALL_SYMBOLS[i];
      const mkt = 100 + i;
      const edge = 0.20 - i * 0.008; // strictly decreasing deal score
      const ask = +(mkt * (1 - edge)).toFixed(2);
      if (live) {
        applyLiveAnchor(sym, {
          price: mkt, open: mkt, high: mkt, low: mkt, prevClose: mkt * 0.99,
          change: 1, changePct: 1, source: 'yahoo', updated: Date.now(),
        });
      } else {
        seedQuote(sym);
      }
      rows.push({
        id: `hot_${sym}`,
        sym,
        price: ask,
        trueValue: mkt,
        marketPrice: mkt,
        changePct: 0,
        isDeal: edge > 0.09,
        isMarket: false,
      });
    }
    return rows;
  }

  await test('hot listings: pool slides window on rotation (no reshuffle)', () => {
    assert.ok(ui?.buildHotListingPool && ui?.slideHotListingWindow && ui?.nextHotRotationOffset,
      'ui must export hot rotation helpers');
    getQuoteCache().clear();
    ui.resetHotListingRotationForTests?.();

    const listings = makeDealListings(30, { live: true });
    const pool = ui.buildHotListingPool(listings, 18);
    assert.equal(pool.length, 18);
    // Highest deal edge first
    assert.equal(pool[0].sym, listings[0].sym);
    assert.ok(ui.listingDealEdge(pool[0]) >= ui.listingDealEdge(pool[1]));

    const w0 = ui.slideHotListingWindow(pool, 0, 5);
    const w1 = ui.slideHotListingWindow(pool, 1, 5);
    const w2 = ui.slideHotListingWindow(pool, 2, 5);
    assert.deepEqual(w0.map((l) => l.sym), pool.slice(0, 5).map((l) => l.sym));
    assert.deepEqual(w1.map((l) => l.sym), pool.slice(1, 6).map((l) => l.sym));
    assert.deepEqual(w2.map((l) => l.sym), pool.slice(2, 7).map((l) => l.sym));
    // Overlap proves slide, not random redraw
    assert.equal(w0[1].sym, w1[0].sym);
    assert.equal(w0[4].sym, w1[3].sym);

    const seen = new Set();
    let offset = 0;
    for (let step = 0; step < pool.length; step++) {
      const win = ui.slideHotListingWindow(pool, offset, 5);
      win.forEach((l) => {
        assert.ok(pool.some((p) => p.sym === l.sym), `${l.sym} must stay inside the fixed pool`);
        seen.add(l.sym);
      });
      offset = ui.nextHotRotationOffset(offset, pool.length, 1);
    }
    assert.equal(seen.size, pool.length, 'full slide should visit every pool candidate over time');
  });

  await test('hot listings: all pool candidates must be live-anchored before rotate', () => {
    assert.ok(ui?.hotPoolAllLiveAnchored && ui?.getHotListingPoolSymbols);
    getQuoteCache().clear();
    ui.resetHotListingRotationForTests?.();

    const listings = makeDealListings(20, { live: false });
    const ranked = ui.buildHotListingPool(listings, 18);
    assert.equal(ui.hotPoolAllLiveAnchored(ranked), false, 'seed pool must not look live');

    const state = { listings, perks: ['scanner'] };
    // Stub document for viewport helper
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = { getElementById: () => null, querySelector: () => null, visibilityState: 'visible' };
    }
    const viewport = ui.getListingsViewportSymbols(state);
    const prefetchSyms = ui.getHotListingPoolSymbols(state);
    assert.ok(prefetchSyms.length >= 15, `expected ~15–24 prefetch candidates, got ${prefetchSyms.length}`);
    for (const sym of prefetchSyms) {
      assert.ok(viewport.includes(sym), `viewport prefetch must include pool sym ${sym}`);
    }
    assert.ok(viewport.length >= prefetchSyms.length);

    // Rotation pool stays empty (no seed flash) until enough live anchors exist
    assert.equal(ui.getHotListingPool(state).length, 0, 'rotation pool must not include seeds');
    assert.equal(ui.getHotListingVisible(state).length, 0);

    // Advance blocked while seeds remain
    const blocked = ui.advanceHotListingRotation(state);
    assert.equal(blocked.advanced, false);
    assert.equal(blocked.reason, 'waiting-live');

    // One stuck seed must not freeze rotation once the rest are live
    for (let i = 0; i < ranked.length; i++) {
      if (i === 3) continue; // leave ranked[3] as seed (unfetchable stand-in)
      const l = ranked[i];
      applyLiveAnchor(l.sym, {
        price: l.marketPrice, open: l.marketPrice, high: l.marketPrice, low: l.marketPrice,
        prevClose: l.marketPrice * 0.99, change: 1, changePct: 1, source: 'yahoo', updated: Date.now(),
      });
    }
    const livePool = ui.getHotListingPool(state);
    assert.ok(livePool.length >= 6, `expected live rotation pool, got ${livePool.length}`);
    assert.ok(!livePool.some((l) => l.sym === ranked[3].sym), 'stuck seed must be excluded from rotation pool');
    assert.equal(ui.hotPoolAllLiveAnchored(livePool), true);
    assert.ok(ui.getHotListingVisible(state).every((l) => {
      const q = getCachedQuote(l.sym);
      return isLiveAnchoredQuote(q);
    }), 'visible hot rows must be live-anchored');

    const moved = ui.advanceHotListingRotation(state);
    assert.equal(moved.advanced, true);
    assert.equal(moved.offset, 1);
  });

  await test('hot listings: hover pauses rotation; resume only after leave delay', async () => {
    getQuoteCache().clear();
    ui.resetHotListingRotationForTests?.();
    const listings = makeDealListings(20, { live: true });
    const state = { listings, perks: ['scanner'] };

    ui.pauseHotListingRotation();
    assert.equal(ui.isHotListingRotationPaused(), true);
    const paused = ui.advanceHotListingRotation(state);
    assert.equal(paused.advanced, false);
    assert.equal(paused.reason, 'paused');
    assert.equal(ui.getHotRotationOffset(), 0);

    ui.scheduleHotListingResume(40);
    // Still paused before delay elapses
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(ui.isHotListingRotationPaused(), true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ui.isHotListingRotationPaused(), false);
    const resumed = ui.advanceHotListingRotation(state);
    assert.equal(resumed.advanced, true);
  });

  await test('hot listings: selected symbol stays pinned across rotations', () => {
    getQuoteCache().clear();
    ui.resetHotListingRotationForTests?.();
    const listings = makeDealListings(20, { live: true });
    const pool = ui.buildHotListingPool(listings, 18);
    const pin = pool[0].sym; // top deal — falls out of a window that starts later

    for (let offset = 0; offset < pool.length; offset++) {
      const win = ui.slideHotListingWindow(pool, offset, 5, pin);
      assert.equal(win.length, 5);
      assert.ok(win.some((l) => l.sym === pin), `pin ${pin} missing at offset ${offset}`);
      // Non-pin seats still come from the sliding window / pool
      win.forEach((l) => assert.ok(pool.some((p) => p.sym === l.sym)));
    }

    // Without pin, a late window should not include pool[0]
    const late = ui.slideHotListingWindow(pool, 10, 5, null);
    assert.ok(!late.some((l) => l.sym === pin), 'control: unpinned late window drops early pool symbols');
  });

  console.log('');
  console.log(`Done: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
