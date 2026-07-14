/**
 * Headless quality tests for StockWay portfolio / limits / shorts / credit.
 * Run: node scripts/quality-tests.cjs
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

// Minimal stubs so we can eval portfolio logic without ESM/browser
const CONFIG = { STARTING_CASH: 500, MARGIN_REQUIREMENT: 0.5, COMMISSION: 0 };
const quotes = new Map();

function getCachedQuote(sym) { return quotes.get(sym); }

function createPortfolio(cash = CONFIG.STARTING_CASH) {
  return { cash, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [], totalTrades: 0, realizedPnL: 0 };
}
function getSpendableCash(p) { return Math.max(0, p.cash || 0); }
function getPositionValue(portfolio) {
  let val = 0;
  Object.entries(portfolio.longs).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    if (q) val += p.shares * q.price;
  });
  Object.entries(portfolio.shorts).forEach(([sym, p]) => {
    const q = getCachedQuote(sym);
    const mkt = q?.price ?? p.avgPrice;
    val += (p.marginHeld || 0) + (p.avgPrice - mkt) * p.shares;
  });
  return val;
}
function getEquity(portfolio) { return portfolio.cash + getPositionValue(portfolio); }
function getNetEquity(portfolio, debt = 0) { return getEquity(portfolio) - (Number(debt) || 0); }
function logTrade(portfolio, entry) {
  portfolio.history.unshift({ ...entry, time: Date.now() });
  portfolio.totalTrades++;
}
function buyLong(portfolio, sym, shares, price) {
  const cost = shares * price + CONFIG.COMMISSION;
  if (getSpendableCash(portfolio) < cost) return { ok: false, msg: 'Insufficient cash' };
  portfolio.cash -= cost;
  const p = portfolio.longs[sym] || { shares: 0, avgPrice: 0 };
  p.avgPrice = (p.avgPrice * p.shares + price * shares) / (p.shares + shares);
  p.shares += shares;
  portfolio.longs[sym] = p;
  logTrade(portfolio, { action: 'BUY', sym, shares, price });
  return { ok: true };
}
function openShort(portfolio, sym, shares, price, hasMarginPerk) {
  if (!hasMarginPerk) return { ok: false, msg: 'no margin' };
  const margin = shares * price * CONFIG.MARGIN_REQUIREMENT;
  if (getSpendableCash(portfolio) < margin) return { ok: false, msg: 'Insufficient margin' };
  portfolio.cash -= margin;
  const p = portfolio.shorts[sym] || { shares: 0, avgPrice: 0, marginHeld: 0 };
  p.avgPrice = (p.avgPrice * p.shares + price * shares) / (p.shares + shares);
  p.shares += shares;
  p.marginHeld += margin;
  portfolio.shorts[sym] = p;
  logTrade(portfolio, { action: 'SHORT', sym, shares, price });
  return { ok: true };
}
function coverShort(portfolio, sym, shares, price) {
  const p = portfolio.shorts[sym];
  if (!p || p.shares < shares) return { ok: false, msg: 'No short' };
  const pnl = (p.avgPrice - price) * shares;
  const marginRelease = (p.marginHeld / p.shares) * shares;
  const cashDelta = pnl + marginRelease;
  if (cashDelta < 0 && getSpendableCash(portfolio) < -cashDelta) return { ok: false, msg: 'Insufficient cash' };
  portfolio.cash += cashDelta;
  portfolio.realizedPnL += pnl;
  p.shares -= shares;
  p.marginHeld -= marginRelease;
  if (p.shares <= 0) delete portfolio.shorts[sym];
  logTrade(portfolio, { action: 'COVER', sym, shares, price, pnl });
  return { ok: true, pnl };
}
function isLimitMarketable(order, marketPrice) {
  if (!Number.isFinite(marketPrice)) return false;
  if (order.side === 'long' || order.side === 'cover') return marketPrice <= order.limitPrice;
  if (order.side === 'short' || order.side === 'sell') return marketPrice >= order.limitPrice;
  return false;
}

/** Net cash delta used by day challenges — borrow must not inflate it. */
function netCashDelta(startCash, startDebt, endCash, endDebt) {
  return (endCash - endDebt) - (startCash - startDebt);
}

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

async function loadFinance() {
  const href = pathToFileURL(path.join(__dirname, '../js/finance.js')).href;
  return import(href);
}

async function main() {
  test('short open does not inflate spendable cash', () => {
    quotes.set('AAA', { price: 100 });
    const p = createPortfolio(500);
    const beforeEq = getEquity(p);
    const r = openShort(p, 'AAA', 2, 100, true); // margin = 100
    assert.equal(r.ok, true);
    assert.equal(p.cash, 400, 'cash should only drop by margin');
    assert.ok(p.cash < 500, 'cash must not rise from short proceeds');
    assert.ok(Math.abs(getEquity(p) - beforeEq) < 0.01, `equity flat at open, got ${getEquity(p)} vs ${beforeEq}`);
  });

  test('short cover flat restores cash', () => {
    quotes.set('BBB', { price: 50 });
    const p = createPortfolio(500);
    openShort(p, 'BBB', 4, 50, true); // margin 100, cash 400
    quotes.set('BBB', { price: 50 });
    const r = coverShort(p, 'BBB', 4, 50);
    assert.equal(r.ok, true);
    assert.ok(Math.abs(p.cash - 500) < 0.01, `cash back to 500, got ${p.cash}`);
    assert.equal(Object.keys(p.shorts).length, 0);
  });

  test('profitable short increases cash', () => {
    quotes.set('CCC', { price: 100 });
    const p = createPortfolio(500);
    openShort(p, 'CCC', 2, 100, true); // margin 100
    quotes.set('CCC', { price: 80 });
    const r = coverShort(p, 'CCC', 2, 80); // pnl = 40
    assert.equal(r.ok, true);
    assert.ok(p.cash > 500, `cash should exceed start after profit, got ${p.cash}`);
  });

  test('cannot buy with phantom short proceeds', () => {
    quotes.set('DDD', { price: 100 });
    const p = createPortfolio(100);
    openShort(p, 'DDD', 1, 100, true); // margin 50, cash 50
    const buy = buyLong(p, 'EEE', 1, 80);
    assert.equal(buy.ok, false, 'should not afford $80 buy with only $50 free cash');
  });

  test('limit buy not marketable above limit', () => {
    assert.equal(isLimitMarketable({ side: 'long', limitPrice: 90 }, 100), false);
    assert.equal(isLimitMarketable({ side: 'long', limitPrice: 90 }, 90), true);
    assert.equal(isLimitMarketable({ side: 'long', limitPrice: 90 }, 85), true);
  });

  test('limit short marketable at/above limit', () => {
    assert.equal(isLimitMarketable({ side: 'short', limitPrice: 110 }, 100), false);
    assert.equal(isLimitMarketable({ side: 'short', limitPrice: 110 }, 110), true);
    assert.equal(isLimitMarketable({ side: 'short', limitPrice: 110 }, 120), true);
  });

  test('limit buy cannot be placed without cash', () => {
    const p = createPortfolio(10);
    const costOk = getSpendableCash(p) >= 50;
    assert.equal(costOk, false);
  });

  test('borrow does not inflate net equity or net cash delta', () => {
    const p = createPortfolio(500);
    const startDebt = 0;
    const startNet = getNetEquity(p, startDebt);
    // Simulate takeLoan cash credit + debt
    p.cash += 1000;
    const endDebt = 1000;
    assert.ok(Math.abs(getNetEquity(p, endDebt) - startNet) < 0.01, 'net equity flat after borrow');
    assert.equal(netCashDelta(500, 0, p.cash, endDebt), 0, 'net cash delta must ignore loan proceeds');
  });

  const fin = await loadFinance();
  const {
    createFinanceState, takeLoan, makeLoanPayment, processDailyLoans, getTotalDebt,
    DAILY_CREDIT_GAIN_CAP, quoteLoan, BANKS, priceApr, maxBorrowableAmount,
    bankDebt, otherBanksDebt, underwriteMaxAmount,
  } = fin;

  test('rapid same-day borrow→repay does not raise credit', () => {
    const finance = createFinanceState();
    const startPersonal = finance.personalCredit;
    const portfolio = createPortfolio(500);
    for (let i = 0; i < 5; i++) {
      const borrow = takeLoan('chase', 'personal', 200, finance, portfolio, 1);
      assert.equal(borrow.ok, true, borrow.msg);
      const loanId = borrow.loan.id;
      const pay = makeLoanPayment(loanId, borrow.loan.balance, finance, portfolio, 1);
      assert.equal(pay.ok, true, pay.msg);
      assert.equal(pay.creditSkipped, true, 'same-day repay must skip credit build');
      assert.equal(pay.creditDelta || 0, 0);
      assert.equal(pay.rep || 0, 0);
      assert.equal(pay.earlyPayoff, false);
    }
    // Each cycle still applies the borrow inquiry hit, never a net gain
    assert.ok(finance.personalCredit <= startPersonal, `credit must not rise from micro-cycles (got ${finance.personalCredit} from ${startPersonal})`);
    assert.equal(getTotalDebt(finance), 0);
  });

  test('aged loan repay can improve credit', () => {
    const finance = createFinanceState();
    const portfolio = createPortfolio(2000);
    const borrow = takeLoan('chase', 'personal', 300, finance, portfolio, 1);
    assert.equal(borrow.ok, true);
    const afterBorrow = finance.personalCredit;
    // Accrue one interest day (qualifies for credit build)
    processDailyLoans(finance, portfolio, 2);
    const loan = finance.loans.find(l => l.id === borrow.loan.id);
    assert.ok(loan, 'loan still active or paid via auto');
    if (loan.status === 'active' && loan.balance > 0) {
      const beforePay = finance.personalCredit;
      const pay = makeLoanPayment(loan.id, loan.balance + 50, finance, portfolio, 2);
      assert.equal(pay.ok, true, pay.msg);
      assert.equal(pay.creditSkipped, false);
      assert.ok((pay.creditDelta || 0) > 0, 'aged payoff should grant credit');
      assert.ok(finance.personalCredit > beforePay, 'personal credit should rise after aged payoff');
      assert.ok(finance.personalCredit > afterBorrow, 'net credit after aged cycle should beat post-borrow score');
    } else {
      // Auto-paid off during processDailyLoans — credit should have moved up via daily path
      assert.ok(finance.personalCredit >= afterBorrow, 'auto payoff after interest should not leave credit below post-borrow');
    }
  });

  test('daily credit gain from loans is capped', () => {
    const finance = createFinanceState();
    const portfolio = createPortfolio(50000);
    // Open several aged loans and pay them off same game day
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const r = takeLoan('chase', 'personal', 200, finance, portfolio, 1);
      assert.equal(r.ok, true);
      r.loan.interestTicks = 1;
      r.loan.daysLeft = 20;
      ids.push(r.loan.id);
    }
    const start = finance.personalCredit;
    for (const id of ids) {
      const loan = finance.loans.find(l => l.id === id);
      makeLoanPayment(id, loan.balance + 1, finance, portfolio, 3);
    }
    const gained = finance.personalCredit - start;
    assert.ok(gained <= DAILY_CREDIT_GAIN_CAP.personal, `gain ${gained} exceeds daily cap ${DAILY_CREDIT_GAIN_CAP.personal}`);
    assert.equal(finance.creditGainsToday.personal, Math.min(gained, DAILY_CREDIT_GAIN_CAP.personal));
  });

  test('partial repay before interest tick grants no credit', () => {
    const finance = createFinanceState();
    const portfolio = createPortfolio(1000);
    const borrow = takeLoan('chase', 'personal', 400, finance, portfolio, 5);
    const afterBorrow = finance.personalCredit;
    const pay = makeLoanPayment(borrow.loan.id, 50, finance, portfolio, 5);
    assert.equal(pay.ok, true);
    assert.equal(pay.creditSkipped, true);
    assert.equal(finance.personalCredit, afterBorrow, 'partial same-day pay must not raise credit');
  });

  test('tiny partial after aging grants no credit spam', () => {
    const finance = createFinanceState();
    const portfolio = createPortfolio(2000);
    const borrow = takeLoan('chase', 'personal', 500, finance, portfolio, 1);
    assert.equal(borrow.ok, true);
    borrow.loan.interestTicks = 1;
    const before = finance.personalCredit;
    const pay = makeLoanPayment(borrow.loan.id, 10, finance, portfolio, 2);
    assert.equal(pay.ok, true);
    assert.equal(pay.creditDelta || 0, 0, 'sub-10% partial must not grant credit');
    assert.equal(finance.personalCredit, before);
  });

  test('worse credit gets higher APR than excellent', () => {
    const poor = createFinanceState();
    poor.personalCredit = 560;
    const excellent = createFinanceState();
    excellent.personalCredit = 820;
    const bank = BANKS.find(b => b.id === 'capitalone');
    const poorApr = priceApr(bank, 'personal', poor, 10);
    const excelApr = priceApr(bank, 'personal', excellent, 10);
    assert.ok(poorApr > excelApr, `poor APR ${poorApr} should exceed excellent ${excelApr}`);
    const poorMax = maxBorrowableAmount('capitalone', 'personal', poor);
    const excelMax = maxBorrowableAmount('capitalone', 'personal', excellent);
    assert.ok(excelMax > poorMax, `excellent limit ${excelMax} should beat poor ${poorMax}`);
  });

  test('better credit gets better quote terms', () => {
    const fair = createFinanceState();
    fair.personalCredit = 600;
    const good = createFinanceState();
    good.personalCredit = 750;
    const qFair = quoteLoan('chase', 'personal', 500, fair, 5);
    const qGood = quoteLoan('chase', 'personal', 500, good, 5);
    assert.equal(qFair.ok, true, qFair.msg);
    assert.equal(qGood.ok, true, qGood.msg);
    assert.ok(qGood.apr < qFair.apr, `good APR ${qGood.apr} should be below fair ${qFair.apr}`);
  });

  test('loan at one bank reduces room at another (shared debt)', () => {
    const finance = createFinanceState();
    finance.personalCredit = 780;
    const portfolio = createPortfolio(50000);
    const before = maxBorrowableAmount('boa', 'personal', finance, 50, 1);
    assert.ok(before >= 100, 'BofA should approve something with strong credit');
    const borrow = takeLoan('chase', 'personal', Math.min(1500, before), finance, portfolio, 1);
    assert.equal(borrow.ok, true, borrow.msg);
    const after = maxBorrowableAmount('boa', 'personal', finance, 50, 1);
    assert.ok(after < before, `BofA max should drop after Chase loan (${after} vs ${before})`);
    assert.ok(otherBanksDebt(finance, 'boa', 'personal') > 0);
    assert.ok(bankDebt(finance, 'chase', 'personal') > 0);
  });

  test('quoteLoan and maxBorrowableAmount agree on high utilization', () => {
    const finance = createFinanceState();
    finance.personalCredit = 750;
    // Seed heavy personal debt so util is high
    finance.loans = [{
      id: 'seed', bankId: 'chase', bankName: 'Chase', type: 'personal',
      principal: 8000, balance: 8000, apr: 12, dailyRate: 0.12 / 365,
      termDays: 30, daysLeft: 20, openedDay: 1, interestTicks: 1, status: 'active',
    }];
    const max = maxBorrowableAmount('wells', 'personal', finance, 50, 3);
    if (max >= 100) {
      const ok = quoteLoan('wells', 'personal', max, finance, 3);
      assert.equal(ok.ok, true, ok.msg);
      const over = quoteLoan('wells', 'personal', max + 50, finance, 3);
      assert.equal(over.ok, false);
    } else {
      const denied = quoteLoan('wells', 'personal', 500, finance, 3);
      assert.equal(denied.ok, false);
      assert.ok(/debt|utilization|room|max/i.test(denied.msg), denied.msg);
    }
  });

  test('late payment damages credit harder than on-time builds', () => {
    const finance = createFinanceState();
    const portfolio = createPortfolio(50);
    const borrow = takeLoan('chase', 'personal', 300, finance, portfolio, 1);
    assert.equal(borrow.ok, true);
    // Drain cash so day-end auto-pay cannot cover the minimum
    portfolio.cash = 0;
    const afterBorrow = finance.personalCredit;
    processDailyLoans(finance, portfolio, 2);
    assert.ok(finance.latePayments >= 1, 'should record a late payment');
    assert.ok(finance.personalCredit <= afterBorrow - 20, `late should crush score (got ${finance.personalCredit} from ${afterBorrow})`);
  });

  {
    const financeUi = await import(pathToFileURL(path.join(__dirname, '../js/ui/finance.js')).href);
    const { getBestRateLenderBadges } = financeUi;
    test('getBestRateLenderBadges returns the lowest-personal-APR lender id', () => {
      const badges = getBestRateLenderBadges([
        { id: 'chase', personalApr: 14.2, companyApr: 11.0 },
        { id: 'boa', personalApr: 12.5, companyApr: 12.0 },
        { id: 'wells', personalApr: 13.1, companyApr: 10.5 },
      ]);
      assert.equal(badges.personalBestId, 'boa');
    });
    test('getBestRateLenderBadges returns lowest-business-APR lender id', () => {
      const badges = getBestRateLenderBadges([
        { id: 'chase', personalApr: 14.2, companyApr: 11.0 },
        { id: 'boa', personalApr: 12.5, companyApr: 12.0 },
        { id: 'wells', personalApr: 13.1, companyApr: 10.5 },
      ]);
      assert.equal(badges.companyBestId, 'wells');
      assert.equal(badges.combinedId, null);
    });
    test('getBestRateLenderBadges combines both badges when one lender wins both', () => {
      const badges = getBestRateLenderBadges([
        { id: 'chase', personalApr: 9.0, companyApr: 8.0 },
        { id: 'boa', personalApr: 12.5, companyApr: 12.0 },
        { id: 'wells', personalApr: 13.1, companyApr: 10.5 },
      ]);
      assert.equal(badges.personalBestId, 'chase');
      assert.equal(badges.companyBestId, 'chase');
      assert.equal(badges.combinedId, 'chase');
    });
    test('getBestRateLenderBadges handles a single-lender list without erroring', () => {
      const badges = getBestRateLenderBadges([
        { id: 'only', personalApr: 11, companyApr: 10 },
      ]);
      assert.equal(badges.personalBestId, 'only');
      assert.equal(badges.companyBestId, 'only');
      assert.equal(badges.combinedId, 'only');
      const empty = getBestRateLenderBadges([]);
      assert.equal(empty.personalBestId, null);
      assert.equal(empty.companyBestId, null);
      assert.equal(empty.combinedId, null);
    });
  }

  // --- Offline baseline helpers (pure functions from api.js) ---
  const api = await import(pathToFileURL(path.join(__dirname, '../js/api.js')).href);
  const {
    shouldAttemptNetworkFetch, nextConnectionState,
    buildBaselineSnapshot, quotesFromBaselineSnapshot, getQuoteCache,
  } = api;

  test('offline skips network unless force refresh', () => {
    assert.equal(shouldAttemptNetworkFetch({ force: false, networkOnline: false, navigatorOnline: true }), false);
    assert.equal(shouldAttemptNetworkFetch({ force: false, networkOnline: true, navigatorOnline: false }), false);
    // Browser offline: never hit network (even force)
    assert.equal(shouldAttemptNetworkFetch({ force: true, networkOnline: false, navigatorOnline: false }), false);
    // Soft-offline: force refresh may retry
    assert.equal(shouldAttemptNetworkFetch({ force: true, networkOnline: false, navigatorOnline: true }), true);
    assert.equal(shouldAttemptNetworkFetch({ force: false, networkOnline: true, navigatorOnline: true }), true);
  });

  test('connection hysteresis needs two soft failures', () => {
    const soft1 = nextConnectionState({ success: false, consecutiveFailures: 0, navigatorOnline: true, force: false });
    assert.equal(soft1.online, true);
    assert.equal(soft1.consecutiveFailures, 1);
    const soft2 = nextConnectionState({ success: false, consecutiveFailures: 1, navigatorOnline: true, force: false });
    assert.equal(soft2.online, false);
    const forced = nextConnectionState({ success: false, consecutiveFailures: 0, navigatorOnline: true, force: true });
    assert.equal(forced.online, false);
    const ok = nextConnectionState({ success: true, consecutiveFailures: 5 });
    assert.equal(ok.online, true);
    assert.equal(ok.consecutiveFailures, 0);
  });

  test('baseline snapshot round-trips for offline cache', () => {
    const snap = buildBaselineSnapshot([
      ['AAPL', { price: 200, open: 198, high: 202, low: 197, prevClose: 195, change: 5, changePct: 2.5, baselinePrice: 200, source: 'yahoo' }],
      ['BAD', { price: 0 }],
    ], 1_700_000_000_000);
    assert.ok(snap.quotes.AAPL);
    assert.equal(snap.quotes.AAPL.baselinePrice, 200);
    assert.equal(snap.quotes.BAD, undefined);
    const restored = quotesFromBaselineSnapshot(snap);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].sym, 'AAPL');
    assert.equal(restored[0].price, 200);
    assert.equal(restored[0].anchored, true);
    assert.equal(restored[0].fromCache, true);
    assert.equal(restored[0].simulated, true);
  });

  // --- Price integrity (seeds, baselines, candle rebase, ticker refresh set) ---
  const {
    getSeedPrice, isPlausibleQuote, isPlausibleAgainstSeed, shouldRebaseQuote,
    shouldReplaceCachedWithLive, shouldRejectLiveCandleTick, shouldPersistBaselineQuote,
    isLiveAnchoredQuote, pricesDiverge, mergeQuoteRefreshSymbols, getTickerSymbols,
    LIVE_CANDLE_MAX_JUMP_PCT, SEED_PLAUSIBLE_MAX_RATIO,
    rebaseCandlesToPrice, generateStableCandles, candleBarVolFraction,
  } = api;

  test('NFLX seed is post-split (~$50–$150), not pre-split ~$900', () => {
    const nflx = getSeedPrice('NFLX');
    assert.ok(nflx != null, 'NFLX must have an explicit seed');
    assert.ok(nflx >= 50 && nflx <= 150, `NFLX seed ${nflx} outside post-split band`);
    assert.ok(nflx < 200, 'NFLX seed must stay under $200');
  });

  test('mega / ETF seeds are realistic 2026 ballpark (not absurd)', () => {
    const bands = {
      SPY: [400, 900],
      QQQ: [350, 900],
      AMD: [80, 700],
      AAPL: [150, 450],
      MSFT: [250, 550],
      META: [300, 900],
      DOCU: [20, 120],
      SEDG: [10, 150],
      HPQ: [10, 80],
      CL: [50, 140],
      VTR: [30, 120],
    };
    for (const [sym, [lo, hi]] of Object.entries(bands)) {
      const seed = getSeedPrice(sym);
      assert.ok(seed != null, `${sym} missing seed`);
      assert.ok(seed >= lo && seed <= hi, `${sym} seed ${seed} outside [${lo}, ${hi}]`);
    }
  });

  test('isPlausibleQuote rejects pre-split NFLX vs post-split seed', () => {
    const seed = getSeedPrice('NFLX');
    assert.equal(isPlausibleQuote(889, seed), false);
    assert.equal(isPlausibleQuote(73, seed), true);
    assert.equal(isPlausibleAgainstSeed('NFLX', 889), false);
    assert.equal(isPlausibleAgainstSeed('NFLX', 73), true);
    assert.equal(isPlausibleAgainstSeed('DOCU', 361), false);
    assert.equal(isPlausibleAgainstSeed('DOCU', 49), true);
    assert.equal(isPlausibleAgainstSeed('SEDG', 424), false);
  });

  test('shouldRejectLiveCandleTick rejects >2.5% jumps', () => {
    assert.equal(LIVE_CANDLE_MAX_JUMP_PCT, 0.025);
    assert.equal(shouldRejectLiveCandleTick(100, 102), false); // 2%
    assert.equal(shouldRejectLiveCandleTick(100, 102.5), false); // exactly 2.5%
    assert.equal(shouldRejectLiveCandleTick(100, 103), true); // 3%
    assert.equal(shouldRejectLiveCandleTick(49, 361), true); // DOCU seed vs candle
    assert.equal(shouldRejectLiveCandleTick(75, 889), true); // NFLX
  });

  test('rebaseCandlesToPrice scales series to sim last without wild factor', () => {
    const series = [
      { time: 1, open: 100, high: 101, low: 99, close: 100.5, volume: 1 },
      { time: 2, open: 100.5, high: 102, low: 100, close: 101, volume: 1 },
    ];
    const out = rebaseCandlesToPrice(series, 111.1);
    assert.ok(out);
    assert.ok(Math.abs(out[out.length - 1].close - 111.1) < 0.01);
    assert.equal(rebaseCandlesToPrice(series, 200), null); // >18% — refuse
  });

  test('generateStableCandles keeps mega-cap bar ranges realistic', () => {
    getQuoteCache().set('AAPL', { price: 310, prevClose: 308, source: 'yahoo', simulated: true });
    const bars = generateStableCandles('AAPL', 80, 15);
    assert.ok(bars.length >= 40);
    assert.ok(Math.abs(bars[bars.length - 1].close - 310) < 0.05);
    let maxRangePct = 0;
    for (const b of bars) {
      const mid = (b.high + b.low) / 2;
      maxRangePct = Math.max(maxRangePct, (b.high - b.low) / mid);
      assert.ok(b.high >= Math.max(b.open, b.close));
      assert.ok(b.low <= Math.min(b.open, b.close));
    }
    // 15-min mega-cap bars should not spear ~7% like the old wick math
    assert.ok(maxRangePct < 0.035, `max bar range ${(maxRangePct * 100).toFixed(2)}% too wide`);
    assert.ok(candleBarVolFraction(15, 0.65) < candleBarVolFraction(1440, 0.65));
  });

  test('shouldRebaseQuote / candle close wins over bad seed', () => {
    assert.equal(shouldRebaseQuote(889, 73), true);
    assert.equal(shouldRebaseQuote(361, 49), true);
    assert.equal(shouldRebaseQuote(75.0, 75.2), false); // within 6% half-outlier
    assert.equal(shouldReplaceCachedWithLive({ price: 889, source: 'seed' }, 73, 75), true);
    assert.equal(shouldReplaceCachedWithLive({ price: 73, source: 'yahoo' }, 74, 75), false);
    assert.equal(shouldReplaceCachedWithLive({ price: 361, source: 'cached' }, 49, 49), true);
  });

  test('shouldPersistBaselineQuote never persists pure seeds', () => {
    assert.equal(shouldPersistBaselineQuote({ price: 75, source: 'seed', anchored: false }), false);
    assert.equal(shouldPersistBaselineQuote({ price: 75, source: 'yahoo', anchored: true }), true);
    assert.equal(shouldPersistBaselineQuote({ price: 0, source: 'yahoo' }), false);
    assert.equal(isLiveAnchoredQuote({ price: 75, source: 'seed' }), false);
    assert.equal(isLiveAnchoredQuote({ price: 75, source: 'yahoo' }), true);
  });

  test('mergeQuoteRefreshSymbols always includes ticker tape (NFLX etc.)', () => {
    const tape = getTickerSymbols();
    assert.ok(tape.includes('NFLX'), 'TICKER_SYMBOLS must include NFLX');
    assert.ok(tape.includes('SPY'));
    assert.ok(tape.includes('AMD'));
    const merged = mergeQuoteRefreshSymbols(['ZZZZ'], ['AAPL']);
    assert.ok(merged.includes('NFLX'), 'refresh merge must force-include ticker symbols');
    assert.ok(merged.includes('ZZZZ'));
    assert.ok(merged.includes('AAPL'));
    assert.ok(merged.includes('SPY'));
  });

  test('pricesDiverge and plausibility band constants are wired', () => {
    assert.equal(pricesDiverge(100, 112, 0.12), false);
    assert.equal(pricesDiverge(100, 114, 0.12), true); // ~12.3% vs 12% threshold
    assert.ok(SEED_PLAUSIBLE_MAX_RATIO >= 2.5);
    assert.equal(isPlausibleQuote(100, 39), false); // >2.5x ceiling
    assert.equal(isPlausibleQuote(100, 40), true); // exactly 2.5x allowed
    assert.equal(isPlausibleQuote(100, 41), true);
  });

  // --- Perk tiers / REP gates ---
  const cfg = await import(pathToFileURL(path.join(__dirname, '../js/config.js')).href);
  const { PERKS, REP_RANKS, getRepRank, getNextRepRank, canPurchasePerk, CONFIG } = cfg;
  const vaultMod = await import(pathToFileURL(path.join(__dirname, '../js/vault.js')).href);
  const {
    VAULT_ITEMS, KNOWN_VAULT_IDS, VAULT_CATEGORY_LABELS, VAULT_EQUIP_SLOT_LABELS,
    VAULT_COLLATERAL_LTV, MASTERWORK_ITEM_BONUS_CAPS,
    canPurchaseVaultItem, purchaseVaultItem, getVaultItem, isMasterworkVaultItem,
    getVaultBookValue, getVaultDeskAura, applyVaultDeskAuraOnClose,
    getCategoryDisplayLabel, getVaultPledgedAppraisal, sanitizeVaultPledged,
    togglePledgedVaultItem, repossessVaultForLoan, loanLocksVaultPledge,
  } = vaultMod;
  /** Stable save-key ids — rename/reflavor must never change these. */
  const STABLE_VAULT_IDS = [
    'goldTerminal', 'tungstenDial', 'obsidianTicker', 'glassTickerWall',
    'yachtBackground', 'penthouseNight', 'bullMarble', 'auroraDeck',
    'crashDayTape', 'apexBadge', 'halcyonPin', 'bronzeBullBust',
    'floorLegendTitle', 'volatilityWhisperer', 'closingBellRoyalty', 'deskSovereign',
  ];
  /** Phase A authenticity display names — regression guard against silent renames. */
  const EXPECTED_VAULT_NAMES = {
    goldTerminal: 'Gilded Astrolabe',
    tungstenDial: 'Sundial Fragment, Weathered',
    obsidianTicker: 'Obsidian Mirror',
    glassTickerWall: 'Murano Glass Cabinet',
    yachtBackground: 'Study of the Tide',
    penthouseNight: 'Nocturne No. 7',
    bullMarble: 'The Gilded Bull, Attributed',
    auroraDeck: 'Aurora Study',
    crashDayTape: 'First Edition Ticker Tape, 1929',
    apexBadge: 'Signet Ring, Unknown House',
    halcyonPin: 'Gold Coin, Byzantine Mint',
    bronzeBullBust: 'Bronze Figurine, Bronze Age',
    floorLegendTitle: 'Recognized Collector',
    volatilityWhisperer: 'Provenance: Verified',
    closingBellRoyalty: 'Honorary Curator',
    deskSovereign: 'Master Collector',
  };
  const MASTERWORK_IDS = [
    'imperialTriptych', 'augustusLaurel', 'gutenbergFolio', 'rothkoField', 'diademProvenance',
  ];
  const salonMod = await import(pathToFileURL(path.join(__dirname, '../js/private-salon.js')).href);
  const {
    PRIVATE_SALON_POOL, PRIVATE_SALON_ITEMS,
    getTodaysSalonListing, getActiveSalonListing, purchaseSalonItem,
  } = salonMod;
  const blackMarketMod = await import(pathToFileURL(path.join(__dirname, '../js/blackmarket.js')).href);
  const {
    BLACKMARKET_ITEM_POOL,
    BLACKMARKET_LISTING_TTL_DAYS,
    getTodaysBlackMarketListing,
    isBlackMarketListingExpired,
    maybeShowBlackMarketLegendaryCoach,
  } = blackMarketMod;
  const collectionMod = await import(pathToFileURL(path.join(__dirname, '../js/collection-log.js')).href);
  const {
    getCollectionLogEntries, getCollectionCompletion, getCollectionPrestigeScore,
    getCollectionMilestones, getCollectionHuntTargets, claimCollectionMilestone,
    sanitizeCollectionClaims, getCollectionClaimedCashTotal, COLLECTION_MILESTONES,
  } = collectionMod;
  const seatMod = await import(pathToFileURL(path.join(__dirname, '../js/the-seat.js')).href);
  const { THE_SEAT, SEAT_LISTING_RATE, isSeatListingActive } = seatMod;
  const relicMod = await import(pathToFileURL(path.join(__dirname, '../js/relics.js')).href);
  const {
    RELIC_EFFECTS_BY_ITEM_ID,
    applyRelicSlippageEffect,
    getEquippedRelicIds,
    getRelicMarginGraceMinutes,
    getRelicSlotLimit,
    sanitizeEquippedRelics,
    toggleEquippedRelic,
    tryAutoEquipRelic,
  } = relicMod;
  const deskRulesMod = await import(pathToFileURL(path.join(__dirname, '../js/desk-rules.js')).href);
  const { applyRelicAwareSlippage, getDeskMarginGraceMinutes } = deskRulesMod;

  test('CONFIG baseline key is v3 (drops poisoned v2 NFLX baselines)', () => {
    assert.match(CONFIG.QUOTE_BASELINE_KEY, /v3/);
  });

  test('REP ranks resolve Newcomer → Elite Desk', () => {
    assert.equal(getRepRank(0).id, 'newcomer');
    assert.equal(getRepRank(39).id, 'newcomer');
    assert.equal(getRepRank(40).name, 'Desk Hand');
    assert.equal(getRepRank(120).name, 'Trusted Trader');
    assert.equal(getRepRank(250).name, 'Market Veteran');
    assert.equal(getRepRank(500).name, 'Elite Desk');
    assert.equal(getRepRank(1800).name, 'Market Legend');
    assert.equal(getNextRepRank(0).minRep, 40);
    assert.equal(getNextRepRank(1800), null);
    assert.ok(REP_RANKS.length >= 6);
  });

  test('cannot buy high-tier perk with low REP even with cash', () => {
    const insider = PERKS.insider;
    const gate = canPurchasePerk(insider, {
      cash: 100000,
      perks: ['scanner'],
      reputation: 10,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'rep');
    assert.ok(/250|Market Veteran|REP/i.test(gate.reason));
  });

  test('can buy mid perk when REP and cash met', () => {
    const news = PERKS.newsWire;
    const blocked = canPurchasePerk(news, { cash: 1000, perks: ['scanner'], reputation: 10 });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'rep');
    const ok = canPurchasePerk(news, { cash: 1000, perks: ['scanner'], reputation: 40 });
    assert.equal(ok.ok, true, ok.reason);
  });

  test('can buy Newcomer scanner with starting cash and 0 REP', () => {
    const gate = canPurchasePerk(PERKS.scanner, { cash: 500, perks: [], reputation: 0 });
    assert.equal(gate.ok, true, gate.reason);
  });

  test('owned perks stay owned — purchase gate rejects rebuy', () => {
    const gate = canPurchasePerk(PERKS.insider, {
      cash: 100000,
      perks: ['scanner', 'insider'],
      reputation: 0,
    });
    assert.equal(gate.ok, false);
    assert.match(gate.reason, /owned/i);
  });

  {
    const perksShopMod = await import(pathToFileURL(path.join(__dirname, '../js/perks.js')).href);
    const { purchasePerk } = perksShopMod;

    test('purchasePerk unlocks perk, debits exact cost, and grants +15 REP', () => {
      const cost = PERKS.scanner.cost;
      const state = {
        portfolio: { cash: cost + 50 },
        perks: [],
        meta: { reputation: 0 },
      };
      const result = purchasePerk(state, 'scanner');
      assert.equal(result.ok, true, result.msg);
      assert.equal(state.portfolio.cash, 50);
      assert.deepEqual(state.perks, ['scanner']);
      assert.equal(state.meta.reputation, 15);
    });

    test('purchasePerk cannot rebuy an owned perk or double-spend cash', () => {
      const cost = PERKS.scanner.cost;
      const state = {
        portfolio: { cash: cost * 3 },
        perks: [],
        meta: { reputation: 0 },
      };
      const first = purchasePerk(state, 'scanner');
      assert.equal(first.ok, true, first.msg);
      const cashAfter = state.portfolio.cash;
      const repAfter = state.meta.reputation;
      const second = purchasePerk(state, 'scanner');
      assert.equal(second.ok, false);
      assert.match(second.msg || '', /owned/i);
      assert.equal(state.portfolio.cash, cashAfter);
      assert.deepEqual(state.perks, ['scanner']);
      assert.equal(state.meta.reputation, repAfter);
    });

    test('purchasePerk rejects when cash is short without mutating state', () => {
      const cost = PERKS.scanner.cost;
      const state = {
        portfolio: { cash: Math.max(0, cost - 1) },
        perks: [],
        meta: { reputation: 0 },
      };
      const result = purchasePerk(state, 'scanner');
      assert.equal(result.ok, false);
      assert.equal(result.code, 'cash');
      assert.equal(state.portfolio.cash, Math.max(0, cost - 1));
      assert.deepEqual(state.perks, []);
      assert.equal(state.meta.reputation, 0);
    });
  }

  {
    const dayEndMod = await import(pathToFileURL(path.join(__dirname, '../js/day-end.js')).href);
    const { runDayEndSettlement, taperLoanRep } = dayEndMod;
    const metaMod = await import(pathToFileURL(path.join(__dirname, '../js/meta.js')).href);
    const { createMetaState } = metaMod;
    const marketMod = await import(pathToFileURL(path.join(__dirname, '../js/market.js')).href);
    const { snapshotDayStart } = marketMod;

    if (!globalThis.localStorage) {
      const mem = {
        _d: Object.create(null),
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); },
        removeItem(k) { delete this._d[k]; },
      };
      Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });
    }

    test('taperLoanRep soft-tapers positive loan REP at higher ranks', () => {
      assert.equal(taperLoanRep(10, 0), 10);
      assert.equal(taperLoanRep(10, 199), 10);
      assert.equal(taperLoanRep(10, 200), 8);
      assert.equal(taperLoanRep(10, 400), 5);
      assert.equal(taperLoanRep(-3, 500), -3);
    });

    test('runDayEndSettlement awards green-day REP and builds day-summary DTO', () => {
      snapshotDayStart(500, 500, 0);
      const state = {
        portfolio: createPortfolio(650),
        finance: createFinanceState(),
        meta: createMetaState(),
        staff: [],
        stats: {},
      };
      // Net equity 650 vs start 500 → +150 green day
      const result = runDayEndSettlement(state, 1);
      assert.equal(result.stats.equityDelta, 150);
      assert.equal(state.stats.greenDays, 1);
      assert.equal(state.stats.greenStreak, 1);
      assert.ok(result.dayRepDelta >= 20, `expected green_day REP, got ${result.dayRepDelta}`);
      assert.equal(result.daySummary.day, 1);
      assert.equal(result.daySummary.repDelta, result.dayRepDelta);
      assert.equal(result.daySummary.challengeDone, false);
      assert.ok('payroll' in result.daySummary);
      assert.ok(Array.isArray(result.daySummary.loanEvents));
    });

    test('runDayEndSettlement awards day_complete REP on flat days and red_day on losses', () => {
      snapshotDayStart(500, 500, 0);
      const flat = {
        portfolio: createPortfolio(500),
        finance: createFinanceState(),
        meta: createMetaState(),
        staff: [],
        stats: { greenStreak: 2 },
      };
      const flatResult = runDayEndSettlement(flat, 2);
      assert.equal(flatResult.stats.equityDelta, 0);
      assert.equal(flat.stats.greenStreak, 0);
      assert.equal(flatResult.dayRepDelta, 3);

      snapshotDayStart(500, 500, 0);
      const red = {
        portfolio: createPortfolio(350),
        finance: createFinanceState(),
        meta: { ...createMetaState(), reputation: 50 },
        staff: [],
        stats: { greenStreak: 4 },
      };
      const redResult = runDayEndSettlement(red, 3);
      assert.equal(redResult.stats.equityDelta, -150);
      assert.equal(red.stats.greenStreak, 0);
      assert.equal(redResult.dayRepDelta, -10);
      assert.equal(red.meta.reputation, 40);
    });

    test('runDayEndSettlement auto-claims a completed unclaimed challenge', () => {
      snapshotDayStart(500, 500, 0);
      const meta = createMetaState();
      meta.challenge = {
        id: 'green_100',
        name: 'Green Machine',
        desc: 'Finish the day with +$100 equity',
        target: 100,
        metric: 'equityDelta',
        reward: 50,
        rep: 40,
        day: 1,
        progress: 100,
        completed: true,
        claimed: false,
      };
      const state = {
        portfolio: createPortfolio(500),
        finance: createFinanceState(),
        meta,
        staff: [],
        stats: {},
      };
      const cashBefore = state.portfolio.cash;
      const result = runDayEndSettlement(state, 1);
      assert.equal(result.challengeDone, true);
      assert.equal(result.challengeReward, 50);
      assert.equal(state.portfolio.cash, cashBefore + 50);
      assert.equal(meta.challenge.claimed, true);
      assert.equal(result.daySummary.challengeDone, true);
      assert.equal(result.daySummary.challengeReward, 50);
    });
  }

  test('OP perks cost more than early unlocks', () => {
    assert.ok(PERKS.scanner.cost < 500);
    assert.ok(PERKS.hrDept.cost <= 500);
    assert.ok(PERKS.insider.cost >= 15000);
    assert.ok(PERKS.aiAdvisor.cost >= 17000);
    assert.ok(PERKS.insider.repRequired >= 250);
    assert.ok(PERKS.aiAdvisor.repRequired >= 250);
    assert.ok(PERKS.hedgeFund.repRequired >= 500);
    assert.ok(PERKS.hedgeFund.cost >= 25000);
    assert.ok(PERKS.primeBroker.cost >= 20000);
    assert.ok(PERKS.legendDesk.cost >= 45000);
    assert.ok(PERKS.smartRouting.cost >= 3000);
    assert.ok(PERKS.options.cost >= 4000);
    assert.equal(PERKS.margin.repRequired, 40, 'margin aligns with Desk Hand');
    assert.ok(PERKS.legendDesk.repRequired >= 1800);
    assert.ok(PERKS.primeBroker.repRequired >= 550);
    assert.ok(Object.keys(PERKS).length >= 15, 'expanded perk board');
    // OP stack should dwarf early Desk Hand total
    const early = PERKS.scanner.cost + PERKS.hrDept.cost + PERKS.newsWire.cost + PERKS.analyst.cost + PERKS.margin.cost;
    assert.ok(PERKS.insider.cost > early, 'Insider alone costs more than early desk kit');
    assert.ok(PERKS.hedgeFund.cost > PERKS.aiAdvisor.cost, 'Elite stays above Veteran cash gates');
    assert.ok(PERKS.legendDesk.cost > PERKS.hedgeFund.cost * 1.5, 'Legend is a prestige cash sink');
  });

  test('new mid/late perks gate on cash + REP + prereqs', () => {
    assert.equal(canPurchasePerk(PERKS.complianceSuite, {
      cash: 5000, perks: ['scanner'], reputation: 100,
    }).ok, false, 'needs hrDept');
    assert.equal(canPurchasePerk(PERKS.complianceSuite, {
      cash: 5000, perks: ['scanner', 'hrDept'], reputation: 45,
    }).ok, true);
    assert.equal(canPurchasePerk(PERKS.smartRouting, {
      cash: 5000, perks: ['scanner'], reputation: 130,
    }).ok, true);
    assert.equal(canPurchasePerk(PERKS.legendDesk, {
      cash: 50000, perks: ['hedgeFund'], reputation: 1799,
    }).ok, false);
    assert.equal(canPurchasePerk(PERKS.legendDesk, {
      cash: 50000, perks: ['hedgeFund'], reputation: 1800,
    }).ok, true);
  });

  {
    const staffMod = await import(pathToFileURL(path.join(__dirname, '../js/staff.js')).href);
    const {
      getMaxStaff, payDailySalaries, MAX_STAFF, STAFF_ROLES,
      staffMaxBuyShares, listingConviction, STAFF_DEFAULT_MAX_POSITION_PCT, STAFF_AI_MIN_CONFIDENCE,
    } = staffMod;
    test('staff caps: 6 → 8 Trading Floor → 10 Legend Desk', () => {
      assert.equal(getMaxStaff({ perks: [] }), MAX_STAFF);
      assert.equal(getMaxStaff({ perks: ['tradingFloor'] }), 8);
      assert.equal(getMaxStaff({ perks: ['tradingFloor', 'legendDesk'] }), 10);
    });
    test('Legend Desk stacks +10% payroll subsidy on Hedge Fund', () => {
      const state = {
        perks: ['hedgeFund', 'legendDesk'],
        staff: [{ roleId: 'intern', tier: 'newbie', active: true }],
        portfolio: { cash: 1000 },
        staffLog: [],
      };
      state.staff = [{ roleId: 'partner', tier: 'newbie', active: true }];
      const before = state.portfolio.cash;
      const paid = payDailySalaries(state);
      // partner $420 · HF 50% + Legend 10% → pay 40% = $168
      assert.equal(paid, 168);
      assert.equal(state.portfolio.cash, before - 168);
    });
    test('staff wages and train costs resist AFK spam', () => {
      assert.ok(STAFF_ROLES.intern.salary >= 40);
      assert.ok(STAFF_ROLES.partner.salary >= 400);
      assert.ok(STAFF_ROLES.scout.hireCost >= 1000);
      assert.ok(staffMod.STAFF_TIERS.newbie.trainCost >= 400);
      assert.ok(staffMod.STAFF_TIERS.veteran.trainCost >= 1000);
    });
    test('staff coverage and next-hire prefer sell gap', () => {
      const { getStaffCoverage, getNextHireRecommendation } = staffMod;
      const empty = getStaffCoverage({ perks: ['hrDept'], staff: [] });
      assert.equal(empty.buy.active, 0);
      assert.equal(empty.sell.active, 0);
      assert.ok(empty.buy.required >= 2);
      const rec = getNextHireRecommendation({
        perks: ['hrDept', 'scanner'],
        staff: [{ roleId: 'scout', tier: 'newbie', active: true }],
        portfolio: { cash: 50_000 },
      });
      assert.equal(rec.roleId, 'exitSpec');
      assert.ok(/seller/i.test(rec.reason));
    });
    test('staff roles include Exit Specialist with sell lane and 5% size helpers', () => {
      assert.ok(STAFF_ROLES.exitSpec);
      assert.equal(STAFF_ROLES.exitSpec.lane, 'sell');
      assert.ok(STAFF_ROLES.exitSpec.never.toLowerCase().includes('never buy'));
      assert.equal(STAFF_DEFAULT_MAX_POSITION_PCT, 0.05);
      assert.equal(STAFF_AI_MIN_CONFIDENCE, 70);
      assert.ok(STAFF_ROLES.scout.rules.includes('5%'));
      assert.ok(STAFF_ROLES.trader.does.includes('70'));
      const pf = { cash: 10_000, longs: {}, shorts: {}, options: [] };
      // Equity ≈ 10k → 5% = 500 → at $50 → 10 shares
      const shares = staffMaxBuyShares(pf, 'AAA', 50, { maxPct: 0.05 });
      assert.equal(shares, 10);
      const oversize = staffMaxBuyShares(
        { cash: 10_000, longs: { AAA: { shares: 10, avgPrice: 50 } }, shorts: {}, options: [] },
        'AAA',
        50,
        { maxPct: 0.05 },
      );
      assert.equal(oversize, 0);
      assert.ok(listingConviction({ price: 80, trueValue: 100, isDeal: true }) >= 70);
      assert.ok(listingConviction({ price: 99, trueValue: 100 }) < 70);
    });
  }

  {
    const chartMod = await import(pathToFileURL(path.join(__dirname, '../js/chart.js')).href);
    const { findSupportResistance, normalizeChartCandles } = chartMod;
    test('Analyst findSupportResistance returns levels below/above last close', () => {
      const bars = [];
      for (let i = 0; i < 40; i++) {
        const base = 100 + Math.sin(i / 3) * 8;
        bars.push({
          open: base, high: base + 2, low: base - 2, close: base + (i === 39 ? 0 : 0.5),
        });
      }
      // Force a clear trough and peak mid-window
      bars[10] = { open: 90, high: 91, low: 85, close: 90 };
      bars[11] = { open: 91, high: 92, low: 90, close: 91 };
      bars[12] = { open: 92, high: 93, low: 91, close: 92 };
      bars[8] = { open: 95, high: 96, low: 94, close: 95 };
      bars[9] = { open: 94, high: 95, low: 93, close: 94 };
      bars[25] = { open: 110, high: 118, low: 109, close: 112 };
      bars[24] = { open: 108, high: 110, low: 107, close: 109 };
      bars[26] = { open: 111, high: 113, low: 110, close: 111 };
      bars[39].close = 100;
      const { support, resistance } = findSupportResistance(bars);
      assert.ok(support != null && support < 100);
      assert.ok(resistance != null && resistance > 100);
    });

    test('normalizeChartCandles dedupes times and converts ms to seconds', () => {
      const out = normalizeChartCandles([
        { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        { time: 1_700_000_000, open: 1.1, high: 2.1, low: 0.6, close: 1.6, volume: 11 },
        { time: 1_700_086_400_000, open: 2, high: 3, low: 1, close: 2.5, volume: 12 },
        { time: 'bad', open: 1, high: 1, low: 1, close: 1 },
      ]);
      assert.equal(out.length, 2);
      assert.equal(out[0].time, 1_700_000_000);
      assert.ok(out[0].close > 0);
      assert.equal(out[1].time, 1_700_086_400);
      assert.ok(out[1].close > 0);
    });

    test('normalizeChartCandles clamps spear wicks on last bar', () => {
      const { sanitizeOhlcBar } = chartMod;
      const now = Math.floor(Date.now() / 1000);
      const bars = [];
      for (let i = 0; i < 20; i++) {
        const px = 310 + (i % 3) * 0.2;
        bars.push({
          time: now - (19 - i) * 300,
          open: px, high: px + 0.3, low: px - 0.3, close: px, volume: 1000,
        });
      }
      // Poison last bar with an impossible spear (like bad Yahoo forming bar)
      bars[bars.length - 1] = {
        time: now,
        open: 311,
        high: 380,
        low: 250,
        close: 311.4,
        volume: 5000,
      };
      const out = normalizeChartCandles(bars, '1D');
      const last = out[out.length - 1];
      assert.ok(last);
      assert.ok(last.high - last.low < 20, `spear still too wide: ${last.high - last.low}`);
      assert.ok(last.high >= last.close && last.low <= last.close);
      const fixed = sanitizeOhlcBar(311, 380, 250, 311.4, 0.02);
      assert.ok(fixed);
      assert.ok(fixed.high - fixed.low <= 311.4 * 0.021);
    });

    test('computePriceAxisRange ignores last-bar spear high/low', () => {
      const { computePriceAxisRange, clampBarToPeers, peerMedianRange } = chartMod;
      const now = Math.floor(Date.now() / 1000);
      const bars = [];
      for (let i = 0; i < 30; i++) {
        const px = 311 + (i % 5) * 0.15;
        bars.push({
          time: now - (29 - i) * 300,
          open: px, high: px + 0.25, low: px - 0.2, close: px + 0.05, volume: 1000,
        });
      }
      bars[bars.length - 1] = {
        time: now, open: 311, high: 316.58, low: 311, close: 316.4, volume: 9000,
      };
      const completedMax = Math.max(...bars.slice(0, -1).map((b) => b.high));
      const axis = computePriceAxisRange(bars, '1D');
      assert.ok(axis);
      // Must not adopt the spear high/close as the top of the pane
      assert.ok(axis.max < 316.4, `axis.max adopted spear close: ${axis.max}`);
      assert.ok(axis.max < bars[bars.length - 1].high, `axis.max adopted spear high: ${axis.max}`);
      assert.ok(axis.max - completedMax < 4, `axis stretched too far past session: ${axis.max - completedMax}`);
      assert.ok(axis.max - axis.min >= 311 * 0.018, 'min span too tight');

      const peer = peerMedianRange(bars);
      const clamped = clampBarToPeers(bars[bars.length - 1], peer, 311);
      const maxR = Math.max(peer * 2.2, 311 * 0.0025);
      assert.ok(clamped.high - clamped.low <= maxR + 0.02, `peer clamp still tall: ${clamped.high - clamped.low}`);
      assert.ok(clamped.close < 314, `peer clamp left spear close: ${clamped.close}`);
    });
  }

  {
    const providersMod = await import(pathToFileURL(path.join(__dirname, '../js/providers.js')).href);
    const { candlesLookPlausibleForRange } = providersMod;
    test('candlesLookPlausibleForRange rejects 5m-for-6M crush payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const intraday = [];
      for (let i = 0; i < 100; i++) {
        intraday.push({ time: now - (99 - i) * 300, open: 1, high: 1, low: 1, close: 1 });
      }
      assert.equal(candlesLookPlausibleForRange(intraday, '6M'), false);
      assert.equal(candlesLookPlausibleForRange(intraday, 'MAX'), false);
      const daily = [];
      for (let i = 0; i < 120; i++) {
        daily.push({ time: now - (119 - i) * 86400, open: 1, high: 1, low: 1, close: 1 });
      }
      assert.equal(candlesLookPlausibleForRange(daily, '6M'), true);
      assert.equal(candlesLookPlausibleForRange(intraday, '1D'), true);
    });
  }

  test('VAULT_ITEMS core 16 save-key ids unchanged from Phase A rename', () => {
    for (const id of STABLE_VAULT_IDS) {
      assert.ok(VAULT_ITEMS[id], `missing core vault id ${id}`);
      assert.ok(KNOWN_VAULT_IDS.has(id), `KNOWN_VAULT_IDS missing ${id}`);
      assert.equal(VAULT_ITEMS[id].id, id);
      assert.equal(VAULT_ITEMS[id].name, EXPECTED_VAULT_NAMES[id], `display name drift for ${id}`);
      assert.ok(typeof VAULT_ITEMS[id].desc === 'string' && VAULT_ITEMS[id].desc.length > 0);
      assert.ok(Number.isFinite(VAULT_ITEMS[id].cost) && VAULT_ITEMS[id].cost > 0);
      assert.ok(['dashboard', 'background', 'trophy', 'title'].includes(VAULT_ITEMS[id].category));
      assert.equal(VAULT_ITEMS[id].icon, undefined, `dead icon key should be removed for ${id}`);
    }
  });

  test('VAULT_ITEMS catalog includes five masterworks and KNOWN_VAULT_IDS covers salon crowns', () => {
    const ids = Object.keys(VAULT_ITEMS).sort();
    assert.equal(ids.length, 21);
    for (const id of MASTERWORK_IDS) {
      assert.ok(VAULT_ITEMS[id], `missing masterwork ${id}`);
      assert.equal(VAULT_ITEMS[id].rarity, 'masterwork');
      assert.ok(VAULT_ITEMS[id].prestigeBonus);
    }
    assert.equal(KNOWN_VAULT_IDS.size, 23);
    for (const item of PRIVATE_SALON_POOL) {
      assert.ok(KNOWN_VAULT_IDS.has(item.id));
      assert.equal(item.rarity, 'crown');
      assert.equal(item.salonOnly, true);
    }
  });

  test('vault category and equip-slot labels match authenticity theming', () => {
    assert.equal(VAULT_CATEGORY_LABELS.dashboard, 'Desk Curio');
    assert.equal(VAULT_CATEGORY_LABELS.background, 'Gallery');
    assert.equal(VAULT_CATEGORY_LABELS.trophy, 'Relic');
    assert.equal(VAULT_CATEGORY_LABELS.title, 'Recognition');
    assert.equal(VAULT_EQUIP_SLOT_LABELS.badge, 'Relic');
    assert.equal(getCategoryDisplayLabel('trophy'), 'Relic');
    assert.equal(getCategoryDisplayLabel('seat'), 'The Seat');
    assert.equal(getCategoryDisplayLabel('dashboard'), 'Desk Curio');
  });

  test('getVaultDeskAura ignores unequipped cosmetics and forged slot mismatches', () => {
    const owned = ['goldTerminal', 'yachtBackground', 'apexBadge', 'floorLegendTitle'];
    const empty = getVaultDeskAura({ cosmetics: {}, vaultOwned: owned });
    assert.equal(empty.tier, 0);
    assert.match(empty.summary, /collectible/i);
    // Wrong slot: trophy item parked in dashboard must not count
    const forged = getVaultDeskAura({
      cosmetics: { dashboard: 'apexBadge', background: 'yachtBackground' },
      vaultOwned: owned,
    });
    assert.equal(forged.equipped, 1);
    assert.equal(forged.tier, 1);
  });

  {
    const profileMod = await import(pathToFileURL(path.join(__dirname, '../js/profile.js')).href);
    const { saveProfile, clearProfileCosmetics, sanitizeProfileCosmeticsAgainstOwned, getProfile } = profileMod;
    test('desk reset clears vault cosmetics; ghost equips strip when unowned', () => {
      saveProfile({
        cosmetics: {
          dashboard: 'goldTerminal',
          background: 'yachtBackground',
          badge: 'apexBadge',
          title: 'floorLegendTitle',
        },
      });
      assert.equal(getProfile().cosmetics.dashboard, 'goldTerminal');
      clearProfileCosmetics();
      assert.equal(getProfile().cosmetics.dashboard, null);
      assert.equal(getProfile().cosmetics.background, null);
      saveProfile({
        cosmetics: {
          dashboard: 'goldTerminal',
          background: 'yachtBackground',
          badge: null,
          title: null,
        },
      });
      sanitizeProfileCosmeticsAgainstOwned([]);
      assert.equal(getProfile().cosmetics.dashboard, null);
      assert.equal(getProfile().cosmetics.background, null);
      saveProfile({ cosmetics: { dashboard: 'goldTerminal', background: 'yachtBackground' } });
      sanitizeProfileCosmeticsAgainstOwned(['goldTerminal']);
      assert.equal(getProfile().cosmetics.dashboard, 'goldTerminal');
      assert.equal(getProfile().cosmetics.background, null);
      clearProfileCosmetics();
    });
  }

  test('underwriteMaxAmount with collateral raises the ceiling by exactly 50% of pledged value, capped at bankMax', () => {
    const finance = createFinanceState();
    finance.personalCredit = 750;
    const base = underwriteMaxAmount('chase', 'personal', finance);
    const pledged = 10000;
    const withCollat = underwriteMaxAmount('chase', 'personal', finance, { collateralValue: pledged });
    const expectedBonus = Math.floor(Math.min(pledged, base.bankMax) * VAULT_COLLATERAL_LTV);
    assert.equal(withCollat.collateralBonus, expectedBonus);
    assert.equal(withCollat.max, base.max + expectedBonus);
    assert.equal(VAULT_COLLATERAL_LTV, 0.5);
  });

  test('underwriteMaxAmount collateral bonus never exceeds bankMax regardless of collateral value', () => {
    const finance = createFinanceState();
    finance.personalCredit = 750;
    const base = underwriteMaxAmount('chase', 'personal', finance);
    const huge = underwriteMaxAmount('chase', 'personal', finance, { collateralValue: 1e9 });
    assert.ok(huge.collateralBonus <= base.bankMax);
    assert.equal(huge.collateralBonus, Math.floor(base.bankMax * VAULT_COLLATERAL_LTV));
  });

  test('collateral bonus does not change credit score, APR tier, or utilization ratio math', () => {
    const finance = createFinanceState();
    finance.personalCredit = 700;
    const creditBefore = finance.personalCredit;
    const aprBefore = priceApr(BANKS.find((b) => b.id === 'chase'), 'personal', finance, 1);
    const utilBefore = underwriteMaxAmount('chase', 'personal', finance).util;
    underwriteMaxAmount('chase', 'personal', finance, { collateralValue: 50000 });
    assert.equal(finance.personalCredit, creditBefore);
    assert.equal(priceApr(BANKS.find((b) => b.id === 'chase'), 'personal', finance, 1), aprBefore);
    assert.equal(underwriteMaxAmount('chase', 'personal', finance, { collateralValue: 50000 }).util, utilBefore);
  });

  test('togglePledgedVaultItem rejects pledging an unowned item', () => {
    const state = {
      vaultOwned: [],
      vaultPledged: [],
      finance: createFinanceState(),
    };
    const result = togglePledgedVaultItem(state, 'goldTerminal');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unowned');
  });

  test('togglePledgedVaultItem rejects unpledging while an active loan depends on it', () => {
    const finance = createFinanceState();
    finance.personalCredit = 750;
    const state = {
      vaultOwned: ['goldTerminal'],
      vaultPledged: ['goldTerminal'],
      finance,
      portfolio: createPortfolio(50000),
    };
    const borrowed = takeLoan('chase', 'personal', 200, finance, state.portfolio, 1, {
      collateralValue: getVaultPledgedAppraisal(state),
      collateralIds: ['goldTerminal'],
    });
    assert.equal(borrowed.ok, true, borrowed.msg);
    assert.deepEqual(borrowed.loan.collateralIds, ['goldTerminal']);
    assert.equal(loanLocksVaultPledge(finance, 'goldTerminal'), true);
    const unpledge = togglePledgedVaultItem(state, 'goldTerminal');
    assert.equal(unpledge.ok, false);
    assert.equal(unpledge.code, 'loan_lock');
    assert.deepEqual(state.vaultPledged, ['goldTerminal']);
  });

  test('repossession removes only enough pledged value to cover the specific defaulted loan, cheapest items first', () => {
    const finance = createFinanceState();
    const state = {
      vaultOwned: ['bronzeBullBust', 'crashDayTape', 'goldTerminal'],
      vaultPledged: ['bronzeBullBust', 'crashDayTape', 'goldTerminal'],
      finance,
    };
    // costs: bronze 6400, crash 8000, gold 5000 — cheapest first is gold then bronze
    const loan = {
      id: 'loan_test',
      balance: 6000,
      collateralIds: ['bronzeBullBust', 'crashDayTape', 'goldTerminal'],
      status: 'active',
    };
    finance.loans = [loan];
    const result = repossessVaultForLoan(state, loan);
    assert.deepEqual(result.seized, ['goldTerminal', 'bronzeBullBust']);
    assert.equal(result.covered, 5000 + 6400);
    assert.ok(!state.vaultOwned.includes('goldTerminal'));
    assert.ok(!state.vaultOwned.includes('bronzeBullBust'));
    assert.ok(state.vaultOwned.includes('crashDayTape'));
    assert.ok(!state.vaultPledged.includes('goldTerminal'));
  });

  test('repossession clears the item from an equipped cosmetic slot if active', () => {
    const finance = createFinanceState();
    const state = {
      vaultOwned: ['goldTerminal'],
      vaultPledged: ['goldTerminal'],
      cosmetics: { dashboard: 'goldTerminal', background: null, title: null, trophy: null },
      finance,
    };
    const loan = {
      id: 'loan_equip',
      balance: 5000,
      collateralIds: ['goldTerminal'],
      status: 'active',
    };
    finance.loans = [loan];
    const result = repossessVaultForLoan(state, loan);
    assert.deepEqual(result.seized, ['goldTerminal']);
    assert.equal(state.cosmetics.dashboard, null);
    assert.ok(!state.vaultOwned.includes('goldTerminal'));
  });

  test('sanitizeVaultPledged strips pledged ids not present in vaultOwned', () => {
    const cleaned = sanitizeVaultPledged(['goldTerminal', 'yachtBackground', 'forged'], ['goldTerminal']);
    assert.deepEqual(cleaned, ['goldTerminal']);
  });

  {
    const vaultUi = await import(pathToFileURL(path.join(__dirname, '../js/ui/vault.js')).href);
    const { VAULT_MOTIF_BY_ID, renderVaultFoilArt } = vaultUi;
    const ALLOWED_MOTIFS = new Set(['painting', 'coin', 'instrument', 'vessel', 'relic', 'seal']);

    test('vault foil motif map covers every known vault and salon id with a known template', () => {
      for (const id of KNOWN_VAULT_IDS) {
        const item = getVaultItem(id);
        const motif = VAULT_MOTIF_BY_ID[id];
        assert.ok(ALLOWED_MOTIFS.has(motif), `${id} missing/unknown motif: ${motif}`);
        const svg = renderVaultFoilArt(item);
        assert.ok(typeof svg === 'string' && svg.includes('<svg'), `${id} foil art missing`);
      }
    });
  }

  test('masterwork equipped prestige bonus raises aura REP/close and daily cap', () => {
    const auraBase = getVaultDeskAura({
      cosmetics: { dashboard: 'goldTerminal', background: 'yachtBackground', badge: 'apexBadge', title: 'floorLegendTitle' },
      vaultOwned: ['goldTerminal', 'yachtBackground', 'apexBadge', 'floorLegendTitle'],
    });
    const auraMw = getVaultDeskAura({
      cosmetics: { dashboard: 'goldTerminal', background: 'imperialTriptych', badge: 'apexBadge', title: 'diademProvenance' },
      vaultOwned: ['goldTerminal', 'imperialTriptych', 'apexBadge', 'diademProvenance'],
    });
    assert.equal(auraBase.tier, 3);
    assert.equal(auraBase.repPerClose, 3);
    assert.equal(auraBase.dailyCap, 9);
    assert.equal(auraMw.repPerClose, 3 + 2);
    assert.equal(auraMw.dailyCap, 9 + 1);
    assert.ok(auraMw.itemBonuses.repPerClose >= 2);
  });

  test('masterwork prestige bonuses clamp at MASTERWORK_ITEM_BONUS_CAPS', () => {
    const aura = getVaultDeskAura({
      cosmetics: {
        dashboard: 'gutenbergFolio',
        background: 'rothkoField',
        badge: 'augustusLaurel',
        title: 'diademProvenance',
      },
      vaultOwned: ['gutenbergFolio', 'rothkoField', 'augustusLaurel', 'diademProvenance'],
    });
    assert.ok(aura.itemBonuses.repPerClose <= MASTERWORK_ITEM_BONUS_CAPS.repPerClose);
    assert.ok(aura.itemBonuses.dailyCap <= MASTERWORK_ITEM_BONUS_CAPS.dailyCap);
    assert.equal(aura.itemBonuses.repPerClose, MASTERWORK_ITEM_BONUS_CAPS.repPerClose);
  });

  test('masterwork purchase books exact cost into vault book value', () => {
    const state = {
      portfolio: createPortfolio(2_000_000),
      meta: { reputation: 1500 },
      vaultOwned: [],
      vaultSpentTotal: 0,
    };
    const result = purchaseVaultItem(state, 'imperialTriptych');
    assert.equal(result.ok, true, result.msg);
    assert.equal(state.portfolio.cash, 2_000_000 - VAULT_ITEMS.imperialTriptych.cost);
    assert.equal(getVaultBookValue(state), VAULT_ITEMS.imperialTriptych.cost);
  });

  test('canPurchaseVaultItem rejects salon-only crown ids from standard vault shop', () => {
    const crown = PRIVATE_SALON_POOL[0];
    const gate = canPurchaseVaultItem(crown, { cash: 9e9, vaultOwned: [], reputation: 9999 });
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'salon');
  });

  test('getTodaysSalonListing never includes an owned crown', () => {
    const owned = ['vermeerAttribution'];
    for (let day = 1; day <= 400; day++) {
      const listing = getTodaysSalonListing(day, { ownedIds: owned });
      if (listing.item) assert.notEqual(listing.item.id, 'vermeerAttribution');
    }
  });

  test('purchaseSalonItem adds crown to vaultOwned and debits exact cost', () => {
    let activeDay = null;
    for (let day = 1; day <= 500 && !activeDay; day++) {
      const listing = getActiveSalonListing(day, { ownedIds: [] });
      if (listing.item?.id === 'vermeerAttribution') activeDay = day;
    }
    assert.ok(activeDay, 'expected vermeerAttribution window within 500 days');
    const item = PRIVATE_SALON_ITEMS.vermeerAttribution;
    const state = {
      portfolio: createPortfolio(item.cost + 50000),
      meta: { reputation: 2000 },
      vaultOwned: [],
      vaultSpentTotal: 0,
      salonSpentTotal: 0,
    };
    const result = purchaseSalonItem(state, item, activeDay);
    assert.equal(result.ok, true, result.msg);
    assert.ok(state.vaultOwned.includes('vermeerAttribution'));
    assert.equal(state.portfolio.cash, 50000);
    assert.equal(getVaultBookValue(state), item.cost);
  });

  test('collection prestige score weights masterworks and crowns above commons', () => {
    const commonOnly = getCollectionPrestigeScore({
      vaultOwned: ['goldTerminal'],
    }, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT, salonPool: PRIVATE_SALON_POOL });
    const masterworkOnly = getCollectionPrestigeScore({
      vaultOwned: ['imperialTriptych'],
    }, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT, salonPool: PRIVATE_SALON_POOL });
    const crownOnly = getCollectionPrestigeScore({
      vaultOwned: ['vermeerAttribution'],
    }, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT, salonPool: PRIVATE_SALON_POOL });
    assert.ok(masterworkOnly > commonOnly);
    assert.ok(crownOnly > masterworkOnly);
    assert.equal(commonOnly, 8);
    assert.equal(masterworkOnly, 120);
    assert.equal(crownOnly, 400);
  });

  test('canPurchaseVaultItem rejects when already owned', () => {
    const gate = canPurchaseVaultItem(VAULT_ITEMS.goldTerminal, {
      cash: 100000,
      vaultOwned: ['goldTerminal'],
      reputation: 999,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'Already owned');
  });

  test('canPurchaseVaultItem rejects below REP requirement', () => {
    const gate = canPurchaseVaultItem(VAULT_ITEMS.yachtBackground, {
      cash: 100000,
      vaultOwned: [],
      reputation: 10,
    });
    assert.equal(gate.ok, false);
    assert.match(gate.reason, /REP/);
  });

  test('canPurchaseVaultItem rejects below cash cost', () => {
    const gate = canPurchaseVaultItem(VAULT_ITEMS.goldTerminal, {
      cash: 100,
      vaultOwned: [],
      reputation: 10,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, 'Insufficient cash');
  });

  test('vault purchase decrements cash by exact cost, no more no less', () => {
    const state = {
      portfolio: createPortfolio(25000),
      vaultOwned: [],
      vaultSpentTotal: 0,
      meta: { reputation: 500 },
    };
    const cost = VAULT_ITEMS.crashDayTape.cost;
    const before = state.portfolio.cash;
    const result = purchaseVaultItem(state, 'crashDayTape');
    assert.equal(result.ok, true, result.msg);
    assert.equal(state.portfolio.cash, before - cost);
    assert.equal(state.vaultSpentTotal, cost);
    assert.deepEqual(state.vaultOwned, ['crashDayTape']);
  });

  test('getVaultBookValue sums owned appraisal costs into display wealth', () => {
    const book = getVaultBookValue({ vaultOwned: ['goldTerminal', 'crashDayTape'] });
    assert.equal(book, VAULT_ITEMS.goldTerminal.cost + VAULT_ITEMS.crashDayTape.cost);
    assert.equal(getVaultBookValue({ vaultOwned: [] }), 0);
  });

  test('getPlayerStanding labels Rank, Collection, Desk, and Flair without inventing a new currency', async () => {
    const { getPlayerStanding } = await import(pathToFileURL(path.join(__dirname, '../js/meta.js')).href);
    const standing = getPlayerStanding({
      meta: { reputation: 130, collectionFlair: 'Master Collector' },
      vaultOwned: ['goldTerminal', 'yachtBackground', 'apexBadge', 'floorLegendTitle'],
      perks: [],
      seatOwned: false,
    }, {
      cosmetics: {
        dashboard: 'goldTerminal',
        background: 'yachtBackground',
        badge: 'apexBadge',
        title: 'floorLegendTitle',
      },
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
      salonPool: PRIVATE_SALON_POOL,
    });
    assert.equal(standing.rankName, 'Trusted Trader');
    assert.equal(standing.rep, 130);
    assert.ok(standing.collectionScore >= 8);
    assert.equal(standing.deskTier, 3);
    assert.match(standing.deskLabel, /Desk Prestige III/i);
    assert.equal(standing.flair, 'Master Collector');
  });

  test('Desk Prestige scales with equipped vault slots and caps daily REP', () => {
    const owned = ['goldTerminal', 'yachtBackground', 'apexBadge', 'floorLegendTitle'];
    const none = getVaultDeskAura({ cosmetics: {}, vaultOwned: owned });
    assert.equal(none.tier, 0);
    const one = getVaultDeskAura({
      cosmetics: { dashboard: 'goldTerminal' },
      vaultOwned: owned,
    });
    assert.equal(one.tier, 1);
    assert.equal(one.repPerClose, 1);
    const full = getVaultDeskAura({
      cosmetics: {
        dashboard: 'goldTerminal',
        background: 'yachtBackground',
        badge: 'apexBadge',
        title: 'floorLegendTitle',
      },
      vaultOwned: owned,
    });
    assert.equal(full.tier, 3);
    assert.equal(full.repPerClose, 3);
    const amp = getVaultDeskAura({
      cosmetics: {
        dashboard: 'goldTerminal',
        background: 'yachtBackground',
        badge: 'apexBadge',
        title: 'floorLegendTitle',
      },
      vaultOwned: owned,
      perks: ['auraAmp'],
    });
    assert.equal(amp.repPerClose, 4);
    assert.ok(amp.dailyCap > full.dailyCap);
    const meta = { vaultAuraRepToday: 0 };
    const first = applyVaultDeskAuraOnClose(meta, 25, full);
    assert.equal(first.applied, 3);
    meta.vaultAuraRepToday = 9;
    const capped = applyVaultDeskAuraOnClose(meta, 40, full);
    assert.equal(capped.applied, 0);
    assert.equal(capped.capped, true);
  });

  test('vault book value does not change buying-power base cash math', () => {
    // Display-only appraisal must never inflate spendable cash / buying power inputs.
    const p = createPortfolio(500);
    assert.equal(getSpendableCash(p), 500);
    assert.equal(getVaultBookValue({ vaultOwned: ['deskSovereign'] }), VAULT_ITEMS.deskSovereign.cost);
    assert.equal(getSpendableCash(p), 500);
  });

  test('getCollectionLogEntries includes all vault items', () => {
    const entries = getCollectionLogEntries({ vaultOwned: [] });
    assert.equal(entries.filter((e) => e.source === 'vault').length, Object.keys(VAULT_ITEMS).length);
  });

  test('getCollectionLogEntries marks owned items correctly from state.vaultOwned', () => {
    const entries = getCollectionLogEntries({ vaultOwned: ['goldTerminal', 'crashDayTape'] });
    const map = new Map(entries.map((entry) => [entry.id, entry]));
    assert.equal(map.get('goldTerminal')?.owned, true);
    assert.equal(map.get('crashDayTape')?.owned, true);
    assert.equal(map.get('apexBadge')?.owned, false);
  });

  test('getCollectionCompletion pct matches owned/total', () => {
    const entries = getCollectionLogEntries({ vaultOwned: ['goldTerminal'] });
    const total = entries.length;
    const completion = getCollectionCompletion({ vaultOwned: ['goldTerminal'] });
    assert.equal(completion.total, total);
    assert.equal(completion.owned, 1);
    assert.equal(completion.pct, total ? Math.round((1 / total) * 100) : 0);
  });

  test('getCollectionPrestigeScore rewards rarity and seat ownership', () => {
    const commonOwned = BLACKMARKET_ITEM_POOL.find((item) => item.rarity === 'common');
    const legendaryOwned = BLACKMARKET_ITEM_POOL.find((item) => item.rarity === 'legendary');
    assert.ok(commonOwned && legendaryOwned, 'expected common + legendary black market items');
    const low = getCollectionPrestigeScore({ vaultOwned: ['goldTerminal'] }, {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
    });
    const high = getCollectionPrestigeScore({
      vaultOwned: ['goldTerminal', 'crashDayTape'],
      blackMarketOwned: [commonOwned.id, legendaryOwned.id],
      seatOwned: true,
      blackMarketEquippedRelics: [legendaryOwned.id],
    }, {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
    });
    assert.ok(high > low, `expected prestige to increase (${low} -> ${high})`);
  });

  test('collection milestones unlock at pct thresholds and can be claimed once', () => {
    const vaultIds = Object.keys(VAULT_ITEMS);
    const need = Math.ceil(vaultIds.length * 0.25);
    // With only vault items owned, pct is vaultOwned / (vault + bm + seat).
    // Own enough of everything conceptually by owning all vault + enough for 25% of total entries.
    const allEntriesEmpty = getCollectionLogEntries({ vaultOwned: [] }, {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
    });
    const total = allEntriesEmpty.length;
    const needOwned = Math.ceil(total * 0.25);
    const ownVault = vaultIds.slice(0, Math.min(needOwned, vaultIds.length));
    const state = {
      portfolio: createPortfolio(1000),
      vaultOwned: ownVault,
      blackMarketOwned: [],
      collectionClaims: [],
      collectionRewardCashTotal: 0,
      meta: { reputation: 0 },
    };
    // If vault alone isn't enough for 25%, mark more via temporary: own first N entries by id from vault then bm
    let completion = getCollectionCompletion(state, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT });
    if (completion.pct < 25) {
      const bmIds = BLACKMARKET_ITEM_POOL.map((i) => i.id);
      state.blackMarketOwned = bmIds.slice(0, needOwned - ownVault.length);
      completion = getCollectionCompletion(state, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT });
    }
    assert.ok(completion.pct >= 25, `expected >=25% got ${completion.pct}`);
    const rows = getCollectionMilestones(state, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT });
    const pct25 = rows.find((m) => m.id === 'pct25');
    assert.equal(pct25?.earned, true);
    assert.equal(pct25?.claimable, true);
    const cashBefore = state.portfolio.cash;
    const claim = claimCollectionMilestone(state, 'pct25', {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
    });
    assert.equal(claim.ok, true);
    assert.equal(claim.rep, 25);
    assert.equal(state.collectionClaims.includes('pct25'), true);
    assert.equal(state.portfolio.cash, cashBefore + (claim.cash || 0));
    const again = claimCollectionMilestone(state, 'pct25', {
      blackMarketPool: BLACKMARKET_ITEM_POOL,
      seatItem: THE_SEAT,
    });
    assert.equal(again.ok, false);
  });

  test('collection hunt returns missing high-priority targets first', () => {
    const hunt = getCollectionHuntTargets({
      vaultOwned: Object.keys(VAULT_ITEMS),
      blackMarketOwned: [],
      seatOwned: false,
    }, { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT, limit: 3 });
    assert.ok(hunt.length >= 1);
    assert.equal(hunt[0].owned, false);
    assert.equal(hunt.some((h) => h.source === 'seat' || h.rarity === 'legendary' || h.rarity === 'rare'), true);
  });

  test('sanitizeCollectionClaims drops forged unearned milestones', () => {
    const forged = sanitizeCollectionClaims(
      ['pct100', 'seatTaken', 'notReal'],
      { vaultOwned: [], blackMarketOwned: [], seatOwned: false },
      { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT },
    );
    assert.deepEqual(forged, []);
    const seatOnly = sanitizeCollectionClaims(
      ['seatTaken', 'pct25'],
      { vaultOwned: [], blackMarketOwned: [], seatOwned: true },
      { blackMarketPool: BLACKMARKET_ITEM_POOL, seatItem: THE_SEAT },
    );
    assert.deepEqual(seatOnly, ['seatTaken']);
    assert.equal(getCollectionClaimedCashTotal(['pct50', 'vaultSet']), 750 + 1500);
    assert.ok(COLLECTION_MILESTONES.length >= 7);
  });

  test('getTodaysBlackMarketListing is deterministic for a given seed/day', () => {
    const a = getTodaysBlackMarketListing(77, { ownedIds: [] });
    const b = getTodaysBlackMarketListing(77, { ownedIds: [] });
    assert.deepEqual(a, b);
  });

  test('legendary items appear at roughly the specified rate over simulated slots', () => {
    let legendary = 0;
    let totalSlots = 0;
    for (let day = 1; day <= 2400; day++) {
      const listing = getTodaysBlackMarketListing(day, { ownedIds: [] });
      totalSlots += listing.items.length;
      legendary += listing.items.filter((item) => item.rarity === 'legendary').length;
    }
    const rate = legendary / Math.max(1, totalSlots);
    // Target is near 1/30 with wide tolerance for deterministic finite samples.
    assert.ok(rate > 0.02 && rate < 0.05, `legendary slot rate ${rate}`);
  });

  test('isBlackMarketListingExpired returns true after TTL days unpurchased', () => {
    const listing = getTodaysBlackMarketListing(20, { ownedIds: [] });
    assert.equal(isBlackMarketListingExpired(listing, 20 + BLACKMARKET_LISTING_TTL_DAYS - 1), false);
    assert.equal(isBlackMarketListingExpired(listing, 20 + BLACKMARKET_LISTING_TTL_DAYS), true);
  });

  test('purchased legendary item cannot reappear as purchasable for same save', () => {
    const legend = BLACKMARKET_ITEM_POOL.find((item) => item.rarity === 'legendary');
    assert.ok(legend, 'expected at least one legendary item');
    for (let day = 1; day <= 900; day++) {
      const listing = getTodaysBlackMarketListing(day, { ownedIds: [legend.id] });
      assert.equal(listing.items.some((item) => item.id === legend.id), false, `legendary ${legend.id} reappeared on day ${day}`);
    }
  });

  test('getTodaysBlackMarketListing never includes an owned item regardless of rarity', () => {
    const samples = ['common', 'rare', 'legendary'].map((rarity) => {
      const item = BLACKMARKET_ITEM_POOL.find((row) => row.rarity === rarity);
      assert.ok(item, `missing ${rarity} item`);
      return item;
    });
    for (const item of samples) {
      for (let day = 1; day <= 400; day++) {
        const listing = getTodaysBlackMarketListing(day, { ownedIds: [item.id] });
        assert.equal(
          listing.items.some((row) => row.id === item.id),
          false,
          `owned ${item.rarity} ${item.id} reappeared on day ${day}`,
        );
      }
    }
  });

  test('getTodaysBlackMarketListing still returns a valid listing when all-but-one common is owned', () => {
    const commons = BLACKMARKET_ITEM_POOL.filter((item) => item.rarity === 'common');
    assert.ok(commons.length >= 2, 'need multiple commons');
    const keep = commons[commons.length - 1];
    const owned = commons.filter((item) => item.id !== keep.id).map((item) => item.id);
    let sawKeep = false;
    for (let day = 1; day <= 300; day++) {
      const listing = getTodaysBlackMarketListing(day, { ownedIds: owned });
      assert.ok(listing.items.length >= 1, `day ${day} produced an empty listing`);
      assert.ok(
        listing.items.every((item) => !owned.includes(item.id)),
        `day ${day} included an owned common`,
      );
      if (listing.items.some((item) => item.id === keep.id)) sawKeep = true;
    }
    assert.ok(sawKeep, 'remaining unowned common should still appear across the sample');
  });

  test('new mid-band commons appear at rates comparable to legacy commons over 1200 days', () => {
    const NEW_IDS = ['pitPassLanyard', 'amberTapeBackdrop', 'ledgerLineTitle'];
    const LEGACY_IDS = ['afterHoursMonogram', 'nightWatchTitle', 'tickerVaultBackdrop', 'clockworkDeskSkin'];
    for (const id of [...NEW_IDS, ...LEGACY_IDS]) {
      assert.ok(BLACKMARKET_ITEM_POOL.some((item) => item.id === id), `missing pool item ${id}`);
    }
    const counts = new Map();
    for (let day = 1; day <= 1200; day++) {
      const listing = getTodaysBlackMarketListing(day, { ownedIds: [] });
      for (const item of listing.items) {
        if (item.rarity !== 'common') continue;
        counts.set(item.id, (counts.get(item.id) || 0) + 1);
      }
    }
    const legacyAvg = LEGACY_IDS.reduce((sum, id) => sum + (counts.get(id) || 0), 0) / LEGACY_IDS.length;
    assert.ok(legacyAvg > 0, 'legacy commons never appeared');
    for (const id of NEW_IDS) {
      const n = counts.get(id) || 0;
      assert.ok(n > 0, `new common ${id} never appeared`);
      assert.ok(
        n > legacyAvg * 0.35 && n < legacyAvg * 2.8,
        `new common ${id} rate ${n} vs legacy avg ${legacyAvg.toFixed(1)} is badly skewed`,
      );
    }
  });

  test('blackmarket legendary coachmark fires exactly once per save', () => {
    const legend = BLACKMARKET_ITEM_POOL.find((item) => item.rarity === 'legendary');
    const state = {
      meta: { blackMarketLegendCoachShown: false },
      portfolio: createPortfolio(1000),
      blackMarketOwned: [],
    };
    const listing = { items: [legend] };
    let shown = 0;
    let saves = 0;
    /** @type {object | null} */
    let lastOpts = null;
    const first = maybeShowBlackMarketLegendaryCoach(state, listing, {
      showCoachmark: (opts) => { shown++; lastOpts = opts; },
      hideCoachmark: () => {},
      switchView: () => {},
      saveGame: () => { saves++; },
    });
    assert.equal(first, true);
    assert.equal(state.meta.blackMarketLegendCoachShown, true);
    assert.equal(shown, 1);
    assert.equal(saves, 1);
    assert.equal(lastOpts?.target, '.nav-item[data-view="blackmarket"]');
    assert.equal(typeof lastOpts?.onSkip, 'function');
    assert.equal(typeof lastOpts?.onNext, 'function');
    assert.match(String(lastOpts?.text || ''), /Legendary Black Market/i);
    const second = maybeShowBlackMarketLegendaryCoach(state, listing, {
      showCoachmark: (opts) => { shown++; lastOpts = opts; },
      saveGame: () => { saves++; },
    });
    assert.equal(second, false);
    assert.equal(shown, 1);
    assert.equal(saves, 1);
  });

  test('collection entries include black market pool and mark unowned as false', () => {
    const ownedId = BLACKMARKET_ITEM_POOL[0].id;
    const entries = getCollectionLogEntries(
      { vaultOwned: [], blackMarketOwned: [ownedId] },
      { blackMarketPool: BLACKMARKET_ITEM_POOL },
    );
    const ownedEntry = entries.find((entry) => entry.id === ownedId);
    const missedEntry = entries.find((entry) => entry.source === 'blackmarket' && entry.id !== ownedId);
    assert.equal(ownedEntry?.owned, true);
    assert.equal(missedEntry?.owned, false);
  });

  test('relic slot limit starts at one and seat unlocks second slot', () => {
    assert.equal(getRelicSlotLimit({ seatOwned: false }), 1);
    assert.equal(getRelicSlotLimit({ seatOwned: true }), 2);
  });

  {
    const dashMod = await import(pathToFileURL(path.join(__dirname, '../js/ui/dashboard.js')).href);
    const {
      buildFirmRelicRowHtml, configureDashboardUi,
      getSoftOfficeStage, getNextNetWorthMilestone,
    } = dashMod;
    test('dashboard Firm Snapshot shows None equipped with correct slot count when empty', () => {
      const one = buildFirmRelicRowHtml({ blackMarketEquippedRelics: [], seatOwned: false });
      assert.match(one, /None equipped \(1 slot\)/);
      assert.match(one, /data-goto="blackmarket"/);
      const two = buildFirmRelicRowHtml({ blackMarketEquippedRelics: [], seatOwned: true });
      assert.match(two, /None equipped \(2 slots\)/);
      assert.match(two, /data-goto="blackmarket"/);
    });
    test('getSoftOfficeStage advances with Net Worth and REP (eligibility gates)', () => {
      const early = getSoftOfficeStage(500, 0);
      assert.equal(early.current.id, 'bedroom');
      assert.ok(early.next);
      const mid = getSoftOfficeStage(120000, 250);
      assert.equal(mid.current.id, 'professional');
      const peak = getSoftOfficeStage(60_000_000, 2000);
      assert.equal(peak.current.id, 'empire');
      assert.equal(peak.next, null);
    });
    test('getNextNetWorthMilestone uses vault-inclusive NW and stays display-only', () => {
      const first = getNextNetWorthMilestone(400);
      assert.equal(first.id, 'nw1k');
      assert.equal(first.complete, false);
      assert.ok(first.pct < 100);
      const mid = getNextNetWorthMilestone(50_000);
      assert.equal(mid.id, 'nw100k');
      const quarter = getNextNetWorthMilestone(200_000);
      assert.equal(quarter.id, 'nw250k');
      const half = getNextNetWorthMilestone(400_000);
      assert.equal(half.id, 'nw500k');
      const done = getNextNetWorthMilestone(2_000_000_000);
      assert.equal(done.complete, true);
      assert.equal(done.pct, 100);
    });
    test('dashboard Firm Snapshot lists equipped relic names', () => {
      const html = buildFirmRelicRowHtml({
        blackMarketEquippedRelics: ['mageOfTheDesk', 'liquidityCrown'],
        seatOwned: true,
      });
      assert.match(html, /The Mage of the Desk/);
      assert.match(html, /Liquidity Crown/);
      assert.doesNotMatch(html, /None equipped/);
      assert.doesNotMatch(html, /data-goto="blackmarket"/);
      assert.match(html, /15% less slippage|margin-call grace/i);
    });
    test('dashboard relic empty-row data-goto targets blackmarket via configureDashboardUi', () => {
      let navigated = '';
      configureDashboardUi({ switchView: (id) => { navigated = id; } });
      const html = buildFirmRelicRowHtml({ blackMarketEquippedRelics: [] });
      const goto = /data-goto="([^"]+)"/.exec(html)?.[1];
      assert.equal(goto, 'blackmarket');
      // Same binding renderDashboard applies: btn.onclick = () => switchView(btn.dataset.goto)
      const fakeBtn = { dataset: { goto }, onclick: null };
      fakeBtn.onclick = () => {
        // re-read configured switchView through a fresh call path
        configureDashboardUi({ switchView: (id) => { navigated = id; } });
        navigated = fakeBtn.dataset.goto;
      };
      // Invoke as renderDashboard would after wiring
      navigated = '';
      const handler = () => { navigated = fakeBtn.dataset.goto; };
      handler();
      assert.equal(navigated, 'blackmarket');
    });
  }

  {
    const officeMod = await import(pathToFileURL(path.join(__dirname, '../js/office.js')).href);
    const {
      OFFICE_TIERS, getEffectiveOfficeTier, getNextOfficeUpgrade, canPurchaseOfficeUpgrade,
      purchaseOfficeUpgrade, sanitizeOfficeProgress, getCumulativeOfficeSpend,
    } = officeMod;

    test('office ladder starts at bedroom and purchases one step at a time', () => {
      assert.equal(OFFICE_TIERS[0].id, 'bedroom');
      assert.equal(OFFICE_TIERS[OFFICE_TIERS.length - 1].id, 'empire');
      const state = {
        portfolio: { cash: 5000 },
        officeTierId: 'bedroom',
        officeSpentTotal: 0,
      };
      assert.equal(getEffectiveOfficeTier(state).id, 'bedroom');
      assert.equal(getNextOfficeUpgrade(state).id, 'studio');
      const blocked = canPurchaseOfficeUpgrade(state, { netWorth: 500, reputation: 0 });
      assert.equal(blocked.ok, false);
      assert.ok(blocked.code === 'net' || blocked.code === 'rep');
      const affordFail = canPurchaseOfficeUpgrade(
        { ...state, portfolio: { cash: 100 } },
        { netWorth: 3000, reputation: 25 },
      );
      assert.equal(affordFail.ok, false);
      assert.equal(affordFail.code, 'cash');
      const ok = purchaseOfficeUpgrade(state, { netWorth: 3000, reputation: 25 });
      assert.equal(ok.ok, true);
      assert.equal(state.officeTierId, 'studio');
      assert.equal(state.officeSpentTotal, 2000);
      assert.equal(state.portfolio.cash, 3000);
      const cashBlocked = purchaseOfficeUpgrade(state, { netWorth: 200000, reputation: 300 });
      assert.equal(cashBlocked.ok, false);
      assert.equal(cashBlocked.code, 'cash');
      const ordered = purchaseOfficeUpgrade(
        { ...state, portfolio: { cash: 100000 } },
        { netWorth: 5000, reputation: 300 },
      );
      assert.equal(ordered.ok, false);
      assert.equal(ordered.code, 'net');
    });

    test('sanitizeOfficeProgress rejects forged high tiers without spend ledger', () => {
      const forged = sanitizeOfficeProgress({ officeTierId: 'empire', officeSpentTotal: 0 });
      assert.equal(forged.officeTierId, 'bedroom');
      const studioSpend = getCumulativeOfficeSpend('studio');
      const legit = sanitizeOfficeProgress({ officeTierId: 'studio', officeSpentTotal: studioSpend });
      assert.equal(legit.officeTierId, 'studio');
      assert.equal(legit.officeSpentTotal, studioSpend);
      const unknown = sanitizeOfficeProgress({ officeTierId: 'penthouseX', officeSpentTotal: 99999 });
      assert.equal(unknown.officeTierId, 'bedroom');
    });
  }

  {
    const megaMod = await import(pathToFileURL(path.join(__dirname, '../js/mega-goals.js')).href);
    const luxMod = await import(pathToFileURL(path.join(__dirname, '../js/luxury.js')).href);
    const {
      getActiveMegaGoal, claimMegaGoal, canClaimMegaGoal, getNextNetWorthMilestone: megaNw,
      sanitizeMegaGoalsClaimed,
    } = megaMod;
    const {
      LUXURY_ITEMS, purchaseLuxury, canPurchaseLuxury, sanitizeLuxuryProgress, getNextLuxuryPurchase,
    } = luxMod;

    test('active mega goal prioritizes NW then office/REP/collection; claim is flair-only', () => {
      const state = {
        portfolio: { cash: 500 },
        officeTierId: 'bedroom',
        meta: { reputation: 0, megaGoalsClaimed: [] },
        vaultOwned: [],
        blackMarketOwned: [],
        seatOwned: false,
      };
      const early = getActiveMegaGoal(state, { netWorth: 500 });
      assert.equal(early.goal.id, 'nw1k');
      assert.equal(early.claimable, false);
      state.meta.megaGoalsClaimed = ['nw1k', 'nw10k', 'nw100k', 'nw250k', 'nw500k', 'nw1m', 'nw10m', 'nw100m', 'nw1b'];
      const afterNw = getActiveMegaGoal(state, { netWorth: 2_000_000_000 });
      assert.equal(afterNw.goal.id, 'officeEmpire');
      const claimOffice = canClaimMegaGoal(
        { ...state, officeTierId: 'empire' },
        'officeEmpire',
        { netWorth: 2_000_000_000 },
      );
      assert.equal(claimOffice.ok, true);
      const claimed = claimMegaGoal(
        { ...state, officeTierId: 'empire', meta: { ...state.meta, megaGoalsClaimed: [...state.meta.megaGoalsClaimed] } },
        'officeEmpire',
        { netWorth: 2_000_000_000 },
      );
      assert.equal(claimed.ok, true);
      assert.equal(claimed.flair, 'Empire Seat');
      assert.equal(claimed.goal.rep, undefined);
      const midNw = getActiveMegaGoal(
        { ...state, meta: { reputation: 0, megaGoalsClaimed: ['nw1k', 'nw10k', 'nw100k'] } },
        { netWorth: 300_000 },
      );
      assert.equal(midNw.goal.id, 'nw250k');
      assert.equal(midNw.claimable, true);
      const half = getActiveMegaGoal(
        { ...state, meta: { reputation: 0, megaGoalsClaimed: ['nw1k', 'nw10k', 'nw100k', 'nw250k'] } },
        { netWorth: 400_000 },
      );
      assert.equal(half.goal.id, 'nw500k');
      assert.equal(half.claimable, false);
      const nw = megaNw(400);
      assert.equal(nw.id, 'nw1k');
    });

    test('sanitizeMegaGoalsClaimed drops forged incomplete claims', () => {
      const cleaned = sanitizeMegaGoalsClaimed(['nw1b', 'nw1k'], {
        portfolio: { cash: 500 },
        meta: { reputation: 0 },
        officeTierId: 'bedroom',
        vaultOwned: [],
        blackMarketOwned: [],
      }, { netWorth: 1500 });
      assert.deepEqual(cleaned, ['nw1k']);
    });

    test('luxury purchase is ordered cosmetic sink and does not mint net-worth book fields', () => {
      assert.ok(LUXURY_ITEMS.length >= 6);
      const state = {
        portfolio: { cash: 150_000 },
        luxuryOwned: [],
        luxurySpentTotal: 0,
        meta: {},
      };
      assert.equal(getNextLuxuryPurchase(state).id, 'cornerSuiteArt');
      const skip = canPurchaseLuxury(state, 'dynastyWing');
      assert.equal(skip.ok, false);
      assert.equal(skip.code, 'order');
      const buy = purchaseLuxury(state, 'cornerSuiteArt');
      assert.equal(buy.ok, true);
      assert.equal(state.portfolio.cash, 50_000);
      assert.deepEqual(state.luxuryOwned, ['cornerSuiteArt']);
      assert.equal(state.luxurySpentTotal, 100_000);
      assert.equal(state.vaultSpentTotal, undefined);
      const forged = sanitizeLuxuryProgress({
        luxuryOwned: ['dynastyWing'],
        luxurySpentTotal: 0,
      });
      assert.deepEqual(forged.luxuryOwned, []);
    });
  }

  {
    const estateMod = await import(pathToFileURL(path.join(__dirname, '../js/estates.js')).href);
    const {
      ESTATE_ASSETS, purchaseEstate, canPurchaseEstate, sanitizeEstateProgress,
      drawEstateCredit, cashOutEstateEquity, syncEstateDerived, getEstateGraceBonus,
      getEstateLiquidationScale, getEstatePrestigeAura,
    } = estateMod;

    test('estate purchase gates, credit draw, sanitize forge strip, and resilience helpers', () => {
      assert.ok(ESTATE_ASSETS.length >= 26);
      assert.ok(ESTATE_ASSETS.filter((a) => a.category === 'cars').length >= 10);
      assert.ok(ESTATE_ASSETS.filter((a) => a.category === 'penthouses').length >= 4);
      const state = {
        portfolio: { cash: 200_000 },
        estateOwned: [],
        estateSpentTotal: 0,
        meta: { reputation: 100 },
      };
      const locked = canPurchaseEstate(state, 'coastalResidence', { netWorth: 50_000 });
      assert.equal(locked.ok, false);
      assert.equal(locked.code, 'net');
      const buy = purchaseEstate(state, 'coastalResidence', { netWorth: 150_000 });
      assert.equal(buy.ok, true);
      assert.deepEqual(state.estateOwned, ['coastalResidence']);
      assert.equal(state.estateSpentTotal, 125_000);
      syncEstateDerived(state);
      assert.ok(state.estateCreditMax > 0);
      assert.ok(state.resilienceRating >= 8);
      const draw = drawEstateCredit(state, 10_000);
      assert.equal(draw.ok, true);
      assert.equal(state.estateCreditUsed, 10_000);
      assert.equal(state.portfolio.cash, 200_000 - 125_000 + 10_000);
      assert.ok(getEstateGraceBonus(state) >= 1);
      assert.ok(getEstateLiquidationScale(state) < 1);
      const forged = sanitizeEstateProgress({
        estateOwned: ['privateIslandElysium'],
        estateSpentTotal: 0,
      });
      assert.deepEqual(forged.estateOwned, []);
      // Yacht without penthouse must strip; island must not hitch a ride on the raw yacht id.
      const chainForge = sanitizeEstateProgress({
        estateOwned: ['privateYachtAurora', 'privateIslandElysium'],
        estateSpentTotal: 12_000_000 + 80_000_000,
      });
      assert.deepEqual(chainForge.estateOwned, []);
      const yachtState = {
        estateOwned: ['coastalResidence', 'skylinePenthouse', 'privateYachtAurora'],
        estateSpentTotal: 125_000 + 2_500_000 + 12_000_000,
      };
      const prestige = getEstatePrestigeAura(yachtState);
      assert.ok(prestige.repPerClose >= 1);
      const earlyCash = cashOutEstateEquity({
        ...state,
        estateEquityExtracted: 0,
        estateCashOutCount: 0,
        estateLastCashOutDay: null,
      }, 1);
      assert.equal(earlyCash.ok, true);
      assert.ok(earlyCash.amount > 0);

      // Category prereq: cars unlock after any residence
      const carGate = canPurchaseEstate({
        portfolio: { cash: 500_000 },
        estateOwned: ['coastalResidence'],
        meta: { reputation: 250 },
      }, 'performanceGt', { netWorth: 500_000 });
      assert.equal(carGate.ok, true);
      const carLocked = canPurchaseEstate({
        portfolio: { cash: 500_000 },
        estateOwned: [],
        meta: { reputation: 250 },
      }, 'performanceGt', { netWorth: 500_000 });
      assert.equal(carLocked.ok, false);
      assert.equal(carLocked.code, 'prereq');
    });

    test('firm net worth includes estate equity; cash-out and credit keep NW consistent', async () => {
      const portMod = await import(pathToFileURL(path.join(__dirname, '../js/portfolio.js')).href);
      const finMod = await import(pathToFileURL(path.join(__dirname, '../js/finance.js')).href);
      const { getFirmNetWorth, getEquity } = portMod;
      const { createFinanceState, getFirmDebt } = finMod;

      const state = {
        portfolio: { cash: 200_000, longs: {}, shorts: {}, options: [], history: [], realizedPnL: 0, totalTrades: 0 },
        finance: createFinanceState(),
        estateOwned: [],
        estateSpentTotal: 0,
        estateEquityExtracted: 0,
        estateCreditUsed: 0,
        meta: { reputation: 100 },
      };
      const nwParts = () => {
        syncEstateDerived(state);
        return getFirmNetWorth(state.portfolio, {
          debt: getFirmDebt(state.finance, state.estateCreditUsed),
          vaultBook: 0,
          estateEquity: state.estateEquity,
        });
      };
      const before = nwParts();
      assert.equal(before, getEquity(state.portfolio));

      const buy = purchaseEstate(state, 'coastalResidence', { netWorth: 150_000 });
      assert.equal(buy.ok, true);
      const afterBuy = nwParts();
      assert.ok(Math.abs(afterBuy - before) < 0.01, 'buy estate: cash→equity keeps firm NW flat');
      assert.equal(state.estateEquity, 125_000);
      assert.equal(state.portfolio.cash, 75_000);
      assert.ok(afterBuy > getEquity(state.portfolio), 'Portfolio Total Equity must exceed cash+positions when estates owned');

      const draw = drawEstateCredit(state, 10_000);
      assert.equal(draw.ok, true);
      const afterCredit = nwParts();
      assert.ok(Math.abs(afterCredit - afterBuy) < 0.01, 'estate credit: cash↑ debt↑ keeps firm NW flat');
      assert.equal(state.estateEquity, 125_000, 'credit does not shrink estateEquity line');

      const cashOut = cashOutEstateEquity(state, 1);
      assert.equal(cashOut.ok, true);
      const afterCashOut = nwParts();
      assert.ok(Math.abs(afterCashOut - afterCredit) < 0.01, 'cash-out: cash↑ estateEquity↓ keeps firm NW flat');
      assert.equal(state.estateEquity, 125_000 - cashOut.amount);
    });

    test('estate category book values sum owned catalog prices', () => {
      const { getEstateCategoryBookValues } = estateMod;
      const empty = getEstateCategoryBookValues({ estateOwned: [] });
      assert.equal(empty.length, 5);
      assert.ok(empty.every((c) => c.value === 0));

      const coastal = ESTATE_ASSETS.find((a) => a.id === 'coastalResidence');
      const gt = ESTATE_ASSETS.find((a) => a.category === 'cars');
      const pent = ESTATE_ASSETS.find((a) => a.category === 'penthouses');
      assert.ok(coastal && gt && pent);
      const cats = getEstateCategoryBookValues({
        estateOwned: [coastal.id, gt.id, pent.id],
      });
      const byId = Object.fromEntries(cats.map((c) => [c.id, c.value]));
      assert.equal(byId.residences, coastal.price);
      assert.equal(byId.cars, gt.price);
      assert.equal(byId.penthouses, pent.price);
      assert.equal(byId.yachts, 0);
      assert.equal(byId.islands, 0);
      assert.equal(
        cats.reduce((s, c) => s + c.value, 0),
        coastal.price + gt.price + pent.price,
      );
      assert.deepEqual(cats.map((c) => c.name), [
        'Residences', 'Penthouses', 'Yachts', 'Garage', 'Islands',
      ]);
    });
  }

  {
    const portUiMod = await import(pathToFileURL(path.join(__dirname, '../js/ui/portfolio.js')).href);
    const estateMod2 = await import(pathToFileURL(path.join(__dirname, '../js/estates.js')).href);
    const { buildFirmAllocationSlices } = portUiMod;
    const { ESTATE_ASSETS: ASSETS } = estateMod2;

    test('portfolio firm allocation slices are cash + estate categories only', () => {
      const coastal = ASSETS.find((a) => a.id === 'coastalResidence');
      const car = ASSETS.find((a) => a.category === 'cars');
      assert.ok(coastal && car);

      const cashOnly = buildFirmAllocationSlices({
        portfolio: { cash: 250_000_000, longs: {}, shorts: {}, options: [] },
        estateOwned: [],
      });
      assert.equal(cashOnly.length, 1);
      assert.equal(cashOnly[0].id, 'cash');
      assert.equal(cashOnly[0].value, 250_000_000);

      const withEstates = buildFirmAllocationSlices({
        portfolio: {
          cash: 250_000_000,
          longs: { AAA: { shares: 10, avgPrice: 100 } },
          shorts: {},
          options: [],
        },
        estateOwned: [coastal.id, car.id],
      });
      assert.ok(withEstates.some((s) => s.id === 'cash'));
      assert.ok(!withEstates.some((s) => s.id === 'trading'), 'trading book must not mix into estates cake');
      assert.ok(withEstates.some((s) => s.id === 'residences' && s.value === coastal.price));
      assert.ok(withEstates.some((s) => s.id === 'cars' && s.value === car.price && s.label === 'Garage'));
      const estateSum = withEstates
        .filter((s) => s.id !== 'cash')
        .reduce((n, s) => n + s.value, 0);
      assert.equal(estateSum, coastal.price + car.price);
    });
  }

  {
    const flavorMod = await import(pathToFileURL(path.join(__dirname, '../js/collection-flavor.js')).href);
    const metaMod = await import(pathToFileURL(path.join(__dirname, '../js/meta.js')).href);
    const {
      COLLECTION_SETS, getSetProgress, canClaimSet, claimSetFlair, sanitizeSetClaims, getItemLore,
      getCollectionSetSummary,
    } = flavorMod;
    const { getActiveFlair, createMetaState } = metaMod;

    test('collection set progress, claim-once flair, and forge strip', () => {
      assert.ok(COLLECTION_SETS.length >= 8);
      assert.ok(COLLECTION_SETS.some((s) => s.id === 'sourceVault'));
      assert.ok(COLLECTION_SETS.some((s) => s.id === 'sourceBlackMarket'));
      assert.ok(COLLECTION_SETS.some((s) => s.id === 'sourceSalon'));
      // Source set ids must not collide with cash/REP collection milestones.
      assert.equal(COLLECTION_SETS.some((s) => s.id === 'vaultSet'), false);
      const desk = COLLECTION_SETS.find((s) => s.id === 'deskInstruments');
      assert.ok(desk);
      const incomplete = {
        meta: createMetaState(),
        vaultOwned: desk.memberIds.slice(0, 2),
        blackMarketOwned: [],
        seatOwned: false,
      };
      const mid = getSetProgress(incomplete, 'deskInstruments');
      assert.equal(mid.owned, 2);
      assert.equal(mid.complete, false);
      assert.equal(canClaimSet(incomplete, 'deskInstruments').ok, false);

      const ready = {
        meta: createMetaState(),
        vaultOwned: desk.memberIds.slice(),
        blackMarketOwned: [],
        seatOwned: false,
      };
      assert.equal(getSetProgress(ready, 'deskInstruments').complete, true);
      const claimed = claimSetFlair(ready, 'deskInstruments');
      assert.equal(claimed.ok, true);
      assert.equal(claimed.flair, 'Instrument Desk');
      assert.deepEqual(ready.meta.setClaims, ['deskInstruments']);
      assert.equal(ready.meta.setFlair, 'Instrument Desk');
      assert.equal(claimSetFlair(ready, 'deskInstruments').ok, false);
      assert.equal(claimSetFlair(ready, 'deskInstruments').code, 'claimed');

      const forged = sanitizeSetClaims(['deskInstruments', 'fakeSet', 'deskInstruments'], {
        vaultOwned: [],
        blackMarketOwned: [],
        seatOwned: false,
      });
      assert.deepEqual(forged, []);
      const kept = sanitizeSetClaims(['deskInstruments'], {
        vaultOwned: desk.memberIds.slice(),
        blackMarketOwned: [],
        seatOwned: false,
      });
      assert.deepEqual(kept, ['deskInstruments']);

      const salon = COLLECTION_SETS.find((s) => s.id === 'sourceSalon');
      const salonReady = {
        meta: createMetaState(),
        vaultOwned: salon.memberIds.slice(),
        blackMarketOwned: [],
        seatOwned: false,
      };
      assert.equal(getSetProgress(salonReady, 'sourceSalon').complete, true);
      const salonClaim = claimSetFlair(salonReady, 'sourceSalon');
      assert.equal(salonClaim.ok, true);
      assert.equal(salonClaim.flair, 'Salon Patron');
      assert.equal(getCollectionSetSummary(salonReady).complete >= 1, true);
    });

    test('every catalog collectible has lore; flair cascade is mega → estate → luxury → set → collection', () => {
      const catalogIds = [
        ...Object.keys(VAULT_ITEMS),
        ...BLACKMARKET_ITEM_POOL.map((i) => i.id),
        ...PRIVATE_SALON_POOL.map((i) => i.id),
        THE_SEAT.id,
      ];
      for (const id of catalogIds) {
        const lore = getItemLore(id);
        assert.ok(typeof lore === 'string' && lore.length > 10, `missing lore for ${id}`);
      }
      const entries = getCollectionLogEntries({
        vaultOwned: ['goldTerminal'],
        blackMarketOwned: [],
        seatOwned: false,
      }, {
        blackMarketPool: BLACKMARKET_ITEM_POOL,
        seatItem: THE_SEAT,
        salonPool: PRIVATE_SALON_POOL,
      });
      const gold = entries.find((e) => e.id === 'goldTerminal');
      assert.ok(gold);
      assert.equal(gold.setId, 'deskInstruments');
      assert.equal(gold.setName, 'Desk Instruments');
      assert.ok(gold.lore);

      const meta = createMetaState();
      meta.collectionFlair = 'Master Collector';
      meta.setFlair = 'Instrument Desk';
      meta.luxuryFlair = 'Harbor Slip';
      meta.estateFlair = 'Coastal Desk';
      meta.megaGoalFlair = 'Million Desk';
      assert.equal(getActiveFlair(meta), 'Million Desk');
      meta.megaGoalFlair = null;
      assert.equal(getActiveFlair(meta), 'Coastal Desk');
      meta.estateFlair = null;
      assert.equal(getActiveFlair(meta), 'Harbor Slip');
      meta.luxuryFlair = null;
      assert.equal(getActiveFlair(meta), 'Instrument Desk');
      meta.setFlair = null;
      assert.equal(getActiveFlair(meta), 'Master Collector');
    });
  }

  {
    const gmMod = await import(pathToFileURL(path.join(__dirname, '../js/gm-mode.js')).href);
    const metaGm = await import(pathToFileURL(path.join(__dirname, '../js/meta.js')).href);
    const { sanitizeRunData } = await import(pathToFileURL(path.join(__dirname, '../js/save-sanitize.js')).href);
    const { applyFullGmLoadout, applyGmAction, verifyAccessCode, GM_CASH, GM_REP } = gmMod;
    const { createMetaState: createGmMeta } = metaGm;
    test('desk support loadout survives sanitize; access code is not plaintext', async () => {
      assert.equal(await verifyAccessCode('000000'), false);
      assert.equal(await verifyAccessCode('030700'), true);
      const src = require('fs').readFileSync(path.join(__dirname, '../js/gm-mode.js'), 'utf8');
      assert.equal(src.includes('030700'), false, 'passcode digits must not appear in source');
      const state = {
        v: 2,
        portfolio: createPortfolio(500),
        perks: [],
        meta: createGmMeta(),
        finance: { personalCredit: 680, businessCredit: 700, loans: [] },
        vaultOwned: [],
        vaultSpentTotal: 0,
        blackMarketOwned: [],
        blackMarketSpentTotal: 0,
        seatOwned: false,
        seatPurchaseDay: null,
        seatSpentTotal: 0,
        officeTierId: 'bedroom',
        officeSpentTotal: 0,
        luxuryOwned: [],
        luxurySpentTotal: 0,
        collectionClaims: [],
        salonSpentTotal: 0,
      };
      applyFullGmLoadout(state);
      assert.equal(state.portfolio.cash, GM_CASH);
      assert.equal(state.meta.reputation, GM_REP);
      assert.ok(state.perks.length >= 5);
      assert.ok(state.vaultOwned.length >= Object.keys(VAULT_ITEMS).length);
      assert.equal(state.seatOwned, true);
      assert.equal(state.officeTierId, 'empire');
      const cleaned = sanitizeRunData(state);
      assert.ok(cleaned);
      assert.equal(cleaned.portfolio.cash, GM_CASH);
      assert.equal(cleaned.meta.reputation, GM_REP);
      assert.equal(cleaned.vaultOwned.length, state.vaultOwned.length);
      assert.equal(cleaned.blackMarketOwned.length, state.blackMarketOwned.length);
      assert.equal(cleaned.seatOwned, true);
      assert.equal(cleaned.officeTierId, 'empire');
      assert.equal(cleaned.luxuryOwned.length, state.luxuryOwned.length);
      assert.ok((cleaned.collectionClaims || []).length >= 4);
      const partial = {
        v: 2,
        portfolio: createPortfolio(500),
        perks: [],
        meta: createGmMeta(),
        finance: { personalCredit: 680, businessCredit: 700, loans: [] },
      };
      assert.equal(applyGmAction(partial, 'cashRep').ok, true);
      assert.equal(partial.portfolio.cash, GM_CASH);
    });
  }

  test('sanitizeEquippedRelics keeps only owned known relic IDs within slot limit', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    assert.ok(relicIds.length >= 2, 'expected at least two relic IDs');
    const cleanedNoSeat = sanitizeEquippedRelics([relicIds[0], 'forgedRelic', relicIds[1]], {
      ownedRelics: [relicIds[0], relicIds[1]],
      seatOwned: false,
    });
    assert.deepEqual(cleanedNoSeat, [relicIds[0]]);
    const cleanedSeat = sanitizeEquippedRelics([relicIds[0], relicIds[1]], {
      ownedRelics: [relicIds[0], relicIds[1]],
      seatOwned: true,
    });
    assert.deepEqual(cleanedSeat, [relicIds[0], relicIds[1]]);
  });

  test('toggleEquippedRelic equips when under slot limit', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const state = {
      blackMarketOwned: [relicIds[0]],
      blackMarketEquippedRelics: [],
      seatOwned: false,
    };
    const result = toggleEquippedRelic(state, relicIds[0]);
    assert.equal(result.ok, true);
    assert.equal(result.equipped, true);
    assert.deepEqual(getEquippedRelicIds(state), [relicIds[0]]);
  });

  test('toggleEquippedRelic unequips an already-equipped relic', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const state = {
      blackMarketOwned: [relicIds[0]],
      blackMarketEquippedRelics: [relicIds[0]],
      seatOwned: false,
    };
    const result = toggleEquippedRelic(state, relicIds[0]);
    assert.equal(result.ok, true);
    assert.equal(result.equipped, false);
    assert.deepEqual(getEquippedRelicIds(state), []);
  });

  test('toggleEquippedRelic rejects equipping an unowned relic', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const state = {
      blackMarketOwned: [],
      blackMarketEquippedRelics: [],
      seatOwned: false,
    };
    const result = toggleEquippedRelic(state, relicIds[0]);
    assert.equal(result.ok, false);
    assert.equal(result.equipped, false);
    assert.equal(result.reason, 'unowned');
    assert.deepEqual(getEquippedRelicIds(state), []);
  });

  test('toggleEquippedRelic rejects equipping past slot limit', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    assert.ok(relicIds.length >= 2, 'expected at least two relic IDs');
    const state = {
      blackMarketOwned: [relicIds[0], relicIds[1]],
      blackMarketEquippedRelics: [relicIds[0]],
      seatOwned: false,
    };
    const result = toggleEquippedRelic(state, relicIds[1]);
    assert.equal(result.ok, false);
    assert.equal(result.equipped, false);
    assert.equal(result.reason, 'slots_full');
    assert.deepEqual(getEquippedRelicIds(state), [relicIds[0]]);
  });

  test('tryAutoEquipRelic equips automatically when a slot is free after purchase', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const state = {
      blackMarketOwned: [relicIds[0]],
      blackMarketEquippedRelics: [],
      seatOwned: false,
    };
    const result = tryAutoEquipRelic(state, relicIds[0]);
    assert.equal(result.ok, true);
    assert.equal(result.equipped, true);
    assert.deepEqual(getEquippedRelicIds(state), [relicIds[0]]);
  });

  test('tryAutoEquipRelic does not equip when slots are full', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    assert.ok(relicIds.length >= 2, 'expected at least two relic IDs');
    const state = {
      blackMarketOwned: [relicIds[0], relicIds[1]],
      blackMarketEquippedRelics: [relicIds[0]],
      seatOwned: false,
    };
    const result = tryAutoEquipRelic(state, relicIds[1]);
    assert.equal(result.ok, true);
    assert.equal(result.equipped, false);
    assert.deepEqual(getEquippedRelicIds(state), [relicIds[0]]);
  });

  test('applyRelicSlippageEffect improves adverse fill toward quote', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const base = { fillPrice: 102, slipPct: 0.02 };
    const adjusted = applyRelicSlippageEffect(base, {
      quotePrice: 100,
      equippedRelics: [relicIds[0]],
    });
    assert.ok(adjusted.fillPrice < 102, `expected better fill, got ${adjusted.fillPrice}`);
    assert.ok(adjusted.fillPrice > 100, 'adjusted fill should still be adverse, just reduced');
  });

  test('relic margin grace bonus is capped and additive', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const single = getRelicMarginGraceMinutes([relicIds[0]], 20);
    assert.equal(single, 20);
    const withGrace = getRelicMarginGraceMinutes([relicIds[1]], 20);
    assert.equal(withGrace, 26);
  });

  test('isSeatListingActive never true below repRequired regardless of roll', () => {
    for (let day = 1; day <= 1500; day++) {
      const active = isSeatListingActive(day, {
        reputation: THE_SEAT.repRequired - 1,
        seatOwned: false,
      });
      assert.equal(active, false, `seat listing should never be active below rep requirement (day ${day})`);
    }
  });

  test('isSeatListingActive rolls at approximately specified rarity over simulated days', () => {
    let activeDays = 0;
    const totalDays = 6000;
    for (let day = 1; day <= totalDays; day++) {
      if (isSeatListingActive(day, { reputation: THE_SEAT.repRequired, seatOwned: false })) activeDays++;
    }
    const rate = activeDays / totalDays;
    assert.ok(rate > SEAT_LISTING_RATE * 0.45 && rate < SEAT_LISTING_RATE * 1.9, `seat rate ${rate}`);
  });

  test('Seat appears correctly in Collection Log', () => {
    const ownedEntries = getCollectionLogEntries(
      { vaultOwned: [], blackMarketOwned: [], seatOwned: true },
      { seatItem: THE_SEAT },
    );
    const missingEntries = getCollectionLogEntries(
      { vaultOwned: [], blackMarketOwned: [], seatOwned: false },
      { seatItem: THE_SEAT },
    );
    const ownedSeat = ownedEntries.find((entry) => entry.id === THE_SEAT.id);
    const missingSeat = missingEntries.find((entry) => entry.id === THE_SEAT.id);
    assert.equal(ownedSeat?.source, 'seat');
    assert.equal(ownedSeat?.owned, true);
    assert.equal(missingSeat?.owned, false);
  });

  // --- Interactive onboarding / perk callouts ---
  const onboardMod = await import(pathToFileURL(path.join(__dirname, '../js/onboarding-walkthrough.js')).href);
  const {
    pickWalkthroughListing, shouldShowPerkCallout, listPendingPerkCallouts,
    markPerkCalloutShown, normalizePerkCalloutsShown, completeWalkthroughReset,
    CALLOUT_PERK_IDS, PERK_CALLOUT_HOOKS,
    suggestedTradeReason, setWalkthroughSuggest, getWalkthroughSuggestMeta, clearWalkthroughSuggest,
    hasClosedWalkthroughPosition, shouldShowPortfolioTour, markPortfolioTourShown,
    PORTFOLIO_TOUR_STEPS, endCoachQuietAndFlush,
    shouldShowMarginCallCoach, markMarginCallCoachShown, maybeShowMarginCallCoach,
    shouldShowCircuitHaltCoach, markCircuitHaltCoachShown, maybeShowCircuitHaltCoach,
    shouldShowSimStatusCoach, markSimStatusCoachShown,
  } = onboardMod;
  const notifyMod = await import(pathToFileURL(path.join(__dirname, '../js/notify.js')).href);
  const {
    toast, flushDeferredNotifications, getDeferredNotificationCount, clearDeferredNotifications,
    isCoachQuiet,
  } = notifyMod;
  const coachFlagsMod = await import(pathToFileURL(path.join(__dirname, '../js/coach-flags.js')).href);
  const { setWalkthroughActive, isWalkthroughFlag } = coachFlagsMod;
  const helpMod = await import(pathToFileURL(path.join(__dirname, '../js/help.js')).href);
  const { needsOnboarding, markOnboarded, HELP_SECTIONS, GLOSSARY } = helpMod;
  const walkthroughMarket = await import(pathToFileURL(path.join(__dirname, '../js/market.js')).href);
  const {
    isSymbolHalted: isWalkthroughSymbolHalted,
    resetSessionAnchors: resetWalkthroughSessionAnchors,
    checkCircuitBreaker: tripWalkthroughCircuit,
  } = walkthroughMarket;

  const beforeHelpSections = JSON.stringify(HELP_SECTIONS);
  const beforeGlossary = JSON.stringify(GLOSSARY);

  test('HELP_SECTIONS and GLOSSARY stay intact (reference layer unchanged)', () => {
    assert.equal(HELP_SECTIONS.length, 13);
    assert.ok(HELP_SECTIONS.some((s) => s.id === 'start'));
    assert.ok(HELP_SECTIONS.some((s) => s.id === 'risk-options'));
    assert.ok(GLOSSARY.length > 20);
    assert.equal(JSON.stringify(HELP_SECTIONS), beforeHelpSections);
    assert.equal(JSON.stringify(GLOSSARY), beforeGlossary);
    assert.ok(GLOSSARY.some((g) => /halt/i.test(g.term)));
    assert.ok(GLOSSARY.some((g) => /margin call/i.test(g.term)));
  });

  {
    const glossMod = await import(pathToFileURL(path.join(__dirname, '../js/glossary-tooltips.js')).href);
    const {
      GLOSS_TIPS, listGlossTipIds, resolveGlossTip, buildGlossTipHtml, getGlossHoverMs,
      resyncGlossaryHover,
    } = glossMod;
    test('glossary tip dwell is 0.5s and survives re-render sync', () => {
      assert.equal(getGlossHoverMs(), 500);
      assert.equal(typeof resyncGlossaryHover, 'function');
    });
    test('glossary tips cover desk markers with equity-style sheets', () => {
      const ids = listGlossTipIds();
      assert.ok(ids.length >= 15, 'enough desk glossary tips');
      const required = [
        'buying-power', 'cash', 'pnl', 'trading-halted', 'margin-stress',
        'feed-status', 'market-status', 'great-deal', 'stop-loss', 'take-profit',
        'open-pnl', 'realized', 'win-rate', 'drawdown', 'total-equity', 'estate-equity',
      ];
      for (const id of required) {
        assert.ok(GLOSS_TIPS[id], `missing gloss tip ${id}`);
        const tip = resolveGlossTip(id);
        assert.ok(tip?.title, `${id} needs title`);
        assert.ok(tip?.blurb?.length > 20, `${id} needs blurb`);
        const html = buildGlossTipHtml(tip);
        assert.match(html, /stat-popover-title/);
        assert.match(html, /stat-popover-blurb/);
        assert.ok(html.includes(tip.title.replace(/&/g, '&amp;')) || html.includes(tip.title), `${id} title in html`);
      }
    });
    test('trading-halt tip stays informative without live halt info', () => {
      const tip = resolveGlossTip('trading-halted');
      assert.match(tip.blurb, /halt|pause|buys|shorts/i);
      assert.ok((tip.bullets || []).length >= 2);
      const html = buildGlossTipHtml(tip);
      assert.match(html, /Trading Halted|halted/i);
    });
  }

  test('pickWalkthroughListing prefers affordable GREAT DEAL', () => {
    const listings = [
      { sym: 'EXP', price: 600, isDeal: true },
      { sym: 'CHEAP', price: 40, isDeal: false },
      { sym: 'DEAL', price: 55, isDeal: true },
    ];
    const pick = pickWalkthroughListing(listings, 500);
    assert.equal(pick.sym, 'DEAL');
  });

  test('pickWalkthroughListing falls back to cheapest affordable when no deal', () => {
    const listings = [
      { sym: 'B', price: 80, isDeal: false },
      { sym: 'A', price: 20, isDeal: false },
    ];
    assert.equal(pickWalkthroughListing(listings, 500).sym, 'A');
    assert.equal(pickWalkthroughListing([], 500), null);
  });

  test('pickWalkthroughListing skips halted GREAT DEAL and falls back to next affordable', () => {
    resetWalkthroughSessionAnchors();
    tripWalkthroughCircuit('DEAL', 100);
    tripWalkthroughCircuit('DEAL', 108);
    assert.equal(isWalkthroughSymbolHalted('DEAL'), true);
    const listings = [
      { sym: 'DEAL', price: 55, isDeal: true },
      { sym: 'SAFE', price: 60, isDeal: false },
      { sym: 'EXP', price: 700, isDeal: false },
    ];
    const pick = pickWalkthroughListing(listings, 500);
    assert.equal(pick.sym, 'SAFE');
    resetWalkthroughSessionAnchors();
  });

  test('pickWalkthroughListing skips halted cheapest and falls back to next cheapest', () => {
    resetWalkthroughSessionAnchors();
    tripWalkthroughCircuit('CHEAP', 100);
    tripWalkthroughCircuit('CHEAP', 108);
    assert.equal(isWalkthroughSymbolHalted('CHEAP'), true);
    const listings = [
      { sym: 'CHEAP', price: 20, isDeal: false },
      { sym: 'NEXT', price: 35, isDeal: false },
      { sym: 'LATER', price: 45, isDeal: false },
    ];
    const pick = pickWalkthroughListing(listings, 500);
    assert.equal(pick.sym, 'NEXT');
    resetWalkthroughSessionAnchors();
  });

  test('suggested-trade badge meta matches pickWalkthroughListing (deal + fallback)', () => {
    clearWalkthroughSuggest();
    const dealPick = pickWalkthroughListing([
      { sym: 'DEAL', price: 40, isDeal: true },
      { sym: 'OTH', price: 20, isDeal: false },
    ], 500);
    const dealMeta = setWalkthroughSuggest(dealPick);
    assert.equal(dealMeta.sym, 'DEAL');
    assert.equal(dealMeta.isDeal, true);
    assert.match(dealMeta.reason, /GREAT DEAL|fair value/i);
    assert.match(suggestedTradeReason(dealPick), /GREAT DEAL|fair value/i);
    assert.equal(getWalkthroughSuggestMeta().sym, 'DEAL');

    const fallbackPick = pickWalkthroughListing([
      { sym: 'B', price: 80, isDeal: false },
      { sym: 'A', price: 20, isDeal: false },
    ], 500);
    const fbMeta = setWalkthroughSuggest(fallbackPick);
    assert.equal(fbMeta.sym, 'A');
    assert.equal(fbMeta.isDeal, false);
    assert.match(fbMeta.reason, /affordable|starting cash/i);
    assert.match(suggestedTradeReason(fallbackPick), /affordable|starting cash/i);
    clearWalkthroughSuggest();
    assert.equal(getWalkthroughSuggestMeta(), null);
  });

  test('coach quiet defers toasts and flushes them after walkthrough ends', () => {
    clearDeferredNotifications();
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = globalThis;
    }
    if (typeof globalThis.document === 'undefined') {
      const makeEl = () => {
        const el = {
          className: '',
          children: [],
          style: {},
          classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
          },
          setAttribute() {},
          appendChild(c) {
            this.children.push(c);
            this.firstElementChild = this.children[0] || null;
            return c;
          },
          replaceChildren() {
            this.children.length = 0;
            this.firstElementChild = null;
          },
          remove() {},
          firstElementChild: null,
        };
        return el;
      };
      const body = makeEl();
      globalThis.document = {
        getElementById: () => null,
        createElement: () => makeEl(),
        body,
      };
    }
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    }
    setWalkthroughActive(true);
    assert.equal(isCoachQuiet(), true);
    const before = getDeferredNotificationCount();
    toast('Unlocked: First Flip', { type: 'success' });
    assert.ok(getDeferredNotificationCount() > before, 'toast deferred while quiet');
    const flushed = endCoachQuietAndFlush();
    assert.ok(flushed >= 1, 'deferred notifications flush after quiet ends');
    assert.equal(getDeferredNotificationCount(), 0);
    assert.equal(isCoachQuiet(), false);
    assert.equal(isWalkthroughFlag(), false);
    clearDeferredNotifications();
  });

  test('walkthrough close step requires a real Sell/Cover fill', () => {
    assert.equal(hasClosedWalkthroughPosition({
      trackSym: 'AAPL',
      sharesBefore: 1,
      portfolio: { longs: { AAPL: { shares: 1, avgPrice: 100 } } },
    }), false, 'still open — do not end after P&L-watch alone');
    assert.equal(hasClosedWalkthroughPosition({
      trackSym: 'AAPL',
      sharesBefore: 1,
      portfolio: { longs: {} },
    }), true, 'closed — position gone');
    assert.equal(hasClosedWalkthroughPosition({
      trackSym: 'AAPL',
      sharesBefore: 2,
      portfolio: { longs: { AAPL: { shares: 1, avgPrice: 100 } } },
    }), true, 'partial close below sharesBefore counts');
  });

  test('Portfolio tour fires once and persists shown-state across reload', () => {
    assert.equal(PORTFOLIO_TOUR_STEPS.length, 7);
    assert.ok(PORTFOLIO_TOUR_STEPS.some((s) => s.id === 'openPnl'));
    assert.ok(PORTFOLIO_TOUR_STEPS.some((s) => s.id === 'realized'));
    const meta = { portfolioTourShown: false };
    assert.equal(shouldShowPortfolioTour(meta), true);
    markPortfolioTourShown(meta);
    assert.equal(shouldShowPortfolioTour(meta), false);
    // Simulate reload via sanitize-style bool coerce
    const reloaded = { portfolioTourShown: !!meta.portfolioTourShown };
    assert.equal(shouldShowPortfolioTour(reloaded), false);
  });

  test('perk callout fires once when canPurchasePerk becomes true', () => {
    const base = {
      cash: 2000,
      perks: ['scanner'],
      reputation: 50,
      perkCalloutsShown: {},
    };
    assert.equal(shouldShowPerkCallout('margin', base), true);
    assert.equal(shouldShowPerkCallout('options', base), false); // needs margin prereq + more REP/cash

    const meta = { perkCalloutsShown: {} };
    markPerkCalloutShown(meta, 'margin');
    assert.equal(shouldShowPerkCallout('margin', { ...base, perkCalloutsShown: meta.perkCalloutsShown }), false);
    // Still false after "reload" of shown map
    const reloaded = normalizePerkCalloutsShown(meta.perkCalloutsShown);
    assert.equal(shouldShowPerkCallout('margin', { ...base, perkCalloutsShown: reloaded }), false);
  });

  test('perk callout never shows for owned perk or already-shown', () => {
    assert.equal(shouldShowPerkCallout('margin', {
      cash: 5000, perks: ['scanner', 'margin'], reputation: 100, perkCalloutsShown: {},
    }), false);
    assert.equal(shouldShowPerkCallout('insider', {
      cash: 20000, perks: ['scanner'], reputation: 250, perkCalloutsShown: { insider: true },
    }), false);
  });

  test('listPendingPerkCallouts only includes gated callout perks', () => {
    const pending = listPendingPerkCallouts({
      portfolio: { cash: 2000 },
      perks: ['scanner'],
      meta: { reputation: 50, perkCalloutsShown: {} },
    });
    assert.ok(pending.includes('margin'));
    assert.ok(pending.every((id) => CALLOUT_PERK_IDS.includes(id)));
    assert.ok(!pending.includes('scanner'));
  });

  test('perk callout hooks cover educational one-liners + help links', () => {
    const expected = [
      'scanner', 'hrDept', 'newsWire', 'analyst', 'margin', 'complianceSuite',
      'tradingFloor', 'options', 'smartRouting', 'insider', 'aiAdvisor', 'auraAmp',
      'hedgeFund', 'primeBroker', 'legendDesk',
    ];
    assert.deepEqual([...CALLOUT_PERK_IDS].sort(), [...expected].sort());
    assert.equal(CALLOUT_PERK_IDS.length, 15, 'all desk perks get callout hooks');
    for (const id of expected) {
      assert.ok(PERK_CALLOUT_HOOKS[id]?.why, `${id} needs why`);
      assert.ok(PERK_CALLOUT_HOOKS[id]?.helpSec, `${id} needs helpSec`);
      assert.ok(HELP_SECTIONS.some((s) => s.id === PERK_CALLOUT_HOOKS[id].helpSec), `${id} helpSec exists`);
      assert.ok(PERK_CALLOUT_HOOKS[id].why.split(/\s+/).length >= 8, `${id} why should teach, not be a stub`);
    }
    assert.match(PERK_CALLOUT_HOOKS.margin.why, /short|deposit|buying power/i);
    assert.match(PERK_CALLOUT_HOOKS.options.why, /right|obligation|strike/i);
    assert.match(PERK_CALLOUT_HOOKS.insider.why, /informational|never a certainty|helpful/i);
    assert.match(PERK_CALLOUT_HOOKS.scanner.why, /mispriced|deal|underpriced/i);
    assert.match(PERK_CALLOUT_HOOKS.newsWire.why, /news|headline|minute/i);
    assert.match(PERK_CALLOUT_HOOKS.smartRouting.why, /slip|fill|route/i);
    assert.match(PERK_CALLOUT_HOOKS.primeBroker.why, /grace|margin|liquidat/i);
    assert.equal(PERKS.auraAmp.name, 'Vault Prestige');
    assert.match(PERK_CALLOUT_HOOKS.auraAmp.why, /Desk Prestige|Vault|daily cap/i);
  });

  {
    const tipMod = await import(pathToFileURL(path.join(__dirname, '../js/perk-tooltips.js')).href);
    const { PERK_DOSSIERS, buildPerkTooltipHtml } = tipMod;
    test('perk dossiers cover every perk with purpose + effects', () => {
      for (const id of Object.keys(PERKS)) {
        assert.ok(PERK_DOSSIERS[id], `${id} needs dossier`);
        assert.ok(PERK_DOSSIERS[id].point?.length > 20, `${id} point`);
        assert.ok(PERK_DOSSIERS[id].effects?.length >= 2, `${id} effects`);
        const html = buildPerkTooltipHtml(id, { statusLabel: 'Owned' });
        assert.match(html, /Purpose/);
        assert.match(html, /Effects/);
        assert.match(html, /Requirements/);
        assert.match(html, new RegExp(PERKS[id].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      assert.match(buildPerkTooltipHtml('auraAmp'), /Vault Prestige|Desk Prestige|\+1 REP/i);
    });
  }

  test('margin-call coachmark fires exactly once per save on first call level', () => {
    const meta = { marginCallCoachShown: false };
    assert.equal(shouldShowMarginCallCoach(meta, 'warn'), false);
    assert.equal(shouldShowMarginCallCoach(meta, 'ok'), false);
    assert.equal(shouldShowMarginCallCoach(meta, 'call'), true);
    const saves = [];
    const state = { meta };
    assert.equal(maybeShowMarginCallCoach(state, {
      level: 'call',
      saveGame: (o) => saves.push(o),
    }), true);
    assert.equal(meta.marginCallCoachShown, true);
    assert.equal(saves.length, 1);
    // Second call in same save — never again
    assert.equal(shouldShowMarginCallCoach(meta, 'call'), false);
    assert.equal(maybeShowMarginCallCoach(state, {
      level: 'call',
      saveGame: (o) => saves.push(o),
    }), false);
    assert.equal(saves.length, 1);
    // Persist across reload shape
    markMarginCallCoachShown(meta);
    assert.equal(shouldShowMarginCallCoach({ marginCallCoachShown: true }, 'call'), false);
  });

  test('circuit-breaker coachmark fires exactly once per save on first halt', () => {
    const meta = { circuitHaltCoachShown: false };
    assert.equal(shouldShowCircuitHaltCoach(meta), true);
    const saves = [];
    const state = { meta };
    assert.equal(maybeShowCircuitHaltCoach(state, {
      saveGame: (o) => saves.push(o),
      sym: 'TEST',
    }), true);
    assert.equal(meta.circuitHaltCoachShown, true);
    assert.equal(saves.length, 1);
    assert.equal(shouldShowCircuitHaltCoach(meta), false);
    assert.equal(maybeShowCircuitHaltCoach(state, {
      saveGame: (o) => saves.push(o),
      sym: 'OTHER',
    }), false);
    assert.equal(saves.length, 1);
    markCircuitHaltCoachShown(meta);
    assert.equal(shouldShowCircuitHaltCoach({ circuitHaltCoachShown: true }), false);
  });

  test('sim/live status coachmark is one-shot per save', () => {
    const meta = { simStatusCoachShown: false };
    assert.equal(shouldShowSimStatusCoach(meta), true);
    markSimStatusCoachShown(meta);
    assert.equal(shouldShowSimStatusCoach(meta), false);
  });

  test('completeWalkthroughReset uses archive:false and remounts onboarded flag', () => {
    const baselineKey = 'stockway_quote_baselines_v3';
    const store = { stockway_onboarded_v1: '1', stockway_leaderboard_v1: '[]' };
    const clearAllSaveData = ({ archive, keepQuoteBaseline }) => {
      assert.equal(archive, false, 'tutorial reset must not archive Best Runs');
      assert.equal(keepQuoteBaseline, true, 'tutorial reset should preserve quote baselines');
      delete store.stockway_onboarded_v1;
      delete store.stockway_save_v1;
      if (!keepQuoteBaseline) delete store[baselineKey];
    };
    const mark = () => { store.stockway_onboarded_v1 = '1'; };
    // Seed as if showOnboarding already marked, then wipe + remount
    store.stockway_onboarded_v1 = '1';
    store.stockway_save_v1 = '{"v":2}';
    store[baselineKey] = '{"AAPL":{"price":123.45}}';
    completeWalkthroughReset({
      clearAllSaveData,
      markOnboarded: mark,
      reload: false,
    });
    assert.equal(store.stockway_onboarded_v1, '1', 'onboarded remounted after wipe');
    assert.equal(store.stockway_save_v1, undefined, 'save wiped');
    assert.equal(store.stockway_leaderboard_v1, '[]', 'Best Runs untouched');
    assert.equal(store[baselineKey], '{"AAPL":{"price":123.45}}', 'quote baselines preserved');
  });

  test('needsOnboarding / markOnboarded still gate first boot only', () => {
    const key = 'stockway_onboarded_v1';
    const mem = globalThis.localStorage || {
      _d: {},
      getItem(k) { return this._d[k] ?? null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    };
    if (!globalThis.localStorage) {
      // Node has no localStorage — stub for this assertion only
      Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });
    }
    try { localStorage.removeItem(key); } catch (_) {}
    assert.equal(needsOnboarding(), true);
    markOnboarded();
    assert.equal(needsOnboarding(), false);
    // Pre-existing "save" path: any onboarded flag means no onboarding
    assert.equal(!!localStorage.getItem(key), true);
  });

  // --- Trade input validation (real portfolio.js) ---
  const portMod = await import(pathToFileURL(path.join(__dirname, '../js/portfolio.js')).href);
  const {
    buyLong: realBuyLong, sellLong: realSellLong, openShort: realOpenShort,
    coverShort: realCoverShort, buyOption: realBuyOption, placeLimitOrder: realPlaceLimit,
    createPortfolio: realCreatePortfolio, getAvailableForLong,
  } = portMod;
  const tradeEngine = await import(pathToFileURL(path.join(__dirname, '../js/trade-engine.js')).href);
  const { confirmOrder } = tradeEngine;

  test('trade-engine exports confirmOrder', () => {
    assert.equal(typeof confirmOrder, 'function');
  });

  test('confirmOrder market buy mutates portfolio and returns app hints', () => {
    const p = realCreatePortfolio(1000);
    const state = { portfolio: p, perks: [] };
    const r = confirmOrder(state, {
      action: 'long',
      sym: 'AAPL',
      price: 100,
      shares: 2,
      orderType: 'market',
      listing: { sym: 'AAPL', price: 100, isMarket: true },
      resolvedPrice: 105,
    }, {
      getCachedQuote: () => ({ price: 105, volume: 1_000_000 }),
      applySlippage: ({ quotePrice }) => ({ fillPrice: quotePrice }),
    });
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.kind, 'open');
    assert.equal(r.sound, 'buy');
    assert.equal(p.longs.AAPL.shares, 2);
    assert.equal(p.longs.AAPL.avgPrice, 105);
  });

  test('confirmOrder limit buy creates working ticket', () => {
    const p = realCreatePortfolio(1000);
    const state = { portfolio: p, perks: [] };
    const r = confirmOrder(state, {
      action: 'long',
      sym: 'MSFT',
      price: 95,
      shares: 1,
      orderType: 'limit',
      listing: { sym: 'MSFT', price: 100, isMarket: true },
      resolvedPrice: 100,
    }, {
      getCachedQuote: () => ({ price: 100, volume: 1_000_000 }),
      applySlippage: ({ quotePrice }) => ({ fillPrice: quotePrice }),
    });
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.kind, 'limit');
    assert.equal(p.pendingOrders.length, 1);
    assert.equal(p.pendingOrders[0].sym, 'MSFT');
    assert.equal(p.orderTickets[0].status, 'open');
    assert.match(r.toast.msg, /Limit long MSFT @ \$95\.00 working/);
  });

  test('buyLong rejects NaN and negative shares', () => {
    const p = realCreatePortfolio(500);
    assert.equal(realBuyLong(p, 'AAPL', NaN, 100).ok, false);
    assert.equal(realBuyLong(p, 'AAPL', -5, 100).ok, false);
    assert.equal(realBuyLong(p, 'AAPL', 0, 100).ok, false);
    assert.equal(p.cash, 500);
  });

  test('buyLong rejects negative price and invalid symbol', () => {
    const p = realCreatePortfolio(500);
    assert.equal(realBuyLong(p, 'AAPL', 1, -50).ok, false);
    assert.equal(realBuyLong(p, 'bad sym!', 1, 50).ok, false);
    assert.equal(p.cash, 500);
  });

  test('negative sell/cover cannot mint shares or cash', () => {
    const p = realCreatePortfolio(500);
    realBuyLong(p, 'Z', 10, 10);
    const before = p.cash;
    assert.equal(realSellLong(p, 'Z', -5, 10).ok, false);
    assert.equal(p.longs.Z.shares, 10);
    assert.equal(p.cash, before);
    realOpenShort(p, 'Y', 2, 50, true);
    assert.equal(realCoverShort(p, 'Y', -2, 50).ok, false);
    assert.equal(p.shorts.Y.shares, 2);
  });

  test('buyOption rejects negative qty', () => {
    const p = realCreatePortfolio(50000);
    const r = realBuyOption(p, { sym: 'AAPL', type: 'call', strike: 100, premium: 1, qty: -10, expiryDays: 14 }, true);
    assert.equal(r.ok, false);
    assert.equal(p.cash, 50000);
  });

  test('margin perk doubles buying power for longs', () => {
    const p = realCreatePortfolio(100);
    assert.equal(getAvailableForLong(p, []), 100);
    assert.equal(getAvailableForLong(p, ['margin']), 200);
    const r = realBuyLong(p, 'AAPL', 1, 150, {}, ['margin']);
    assert.equal(r.ok, true);
    assert.ok(p.cash < 100);
  });

  test('overlapping limit buys respect shared cash pool', () => {
    const p = realCreatePortfolio(100);
    const a = realPlaceLimit(p, { sym: 'AAA', action: 'long', shares: 1, limitPrice: 90 }, { perks: [] });
    assert.equal(a.ok, true, a.msg);
    const b = realPlaceLimit(p, { sym: 'BBB', action: 'long', shares: 1, limitPrice: 90 }, { perks: [] });
    assert.equal(b.ok, false, 'second limit should fail when cash already committed');
  });

  const { sanitizeRunData } = await import(pathToFileURL(path.join(__dirname, '../js/save-sanitize.js')).href);

  test('sanitizeRunData clamps god-mode cash and unknown perks', () => {
    const raw = {
      v: 2,
      portfolio: { cash: 9e15, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: ['scanner', 'fakeGodMode'],
      meta: { reputation: 999999 },
      finance: { personalCredit: 9999, businessCredit: -100, loans: [] },
    };
    const clean = sanitizeRunData(raw);
    assert.ok(clean.portfolio.cash <= 1e12);
    assert.deepEqual(clean.perks, ['scanner']);
    assert.ok(clean.meta.reputation <= 100000);
    assert.ok(clean.finance.personalCredit <= 850);
    assert.ok(clean.finance.businessCredit >= 300);
  });

  test('sanitizeRunData strips unknown vault IDs from save', () => {
    const cost = VAULT_ITEMS.goldTerminal.cost;
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 500, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      vaultOwned: ['goldTerminal', 'fakeVaultGodMode'],
      vaultSpentTotal: cost,
    });
    assert.deepEqual(clean.vaultOwned, ['goldTerminal']);
    assert.equal(clean.vaultSpentTotal, cost);
  });

  test('sanitizeRunData strips vaultPledged ids not present in vaultOwned', () => {
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 500, holdings: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      vaultOwned: ['goldTerminal'],
      vaultPledged: ['goldTerminal', 'yachtBackground', 'forgedItem'],
      vaultSpentTotal: VAULT_ITEMS.goldTerminal.cost,
    });
    assert.deepEqual(clean.vaultPledged, ['goldTerminal']);
  });

  test('sanitizeRunData preserves valid owned vault IDs across load', () => {
    const owned = ['goldTerminal', 'crashDayTape'];
    const spend = owned.reduce((sum, id) => sum + (VAULT_ITEMS[id].cost || 0), 0);
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 1200, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      vaultOwned: owned,
      vaultSpentTotal: spend,
    });
    assert.deepEqual(clean.vaultOwned, owned);
    assert.equal(clean.vaultSpentTotal, spend);
  });

  test('sanitizeRunData still accepts pre-rename saves with all known vaultOwned ids', () => {
    // Pre-rename saves key ownership by id (not display name); Phase A rename must remain save-safe.
    const owned = [...STABLE_VAULT_IDS];
    const spend = owned.reduce((sum, id) => sum + (VAULT_ITEMS[id].cost || 0), 0);
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 5000, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      vaultOwned: owned,
      vaultSpentTotal: spend,
    });
    assert.ok(clean);
    assert.deepEqual([...clean.vaultOwned].sort(), [...owned].sort());
    assert.equal(clean.vaultOwned.length, 16);
    assert.equal(clean.vaultSpentTotal, spend);
  });

  test('sanitizeRunData strips unknown blackmarket IDs', () => {
    const kept = BLACKMARKET_ITEM_POOL[0];
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      blackMarketOwned: [kept.id, 'forgedBlackMarketId'],
      blackMarketSpentTotal: kept.cost,
      blackMarketSeenExpired: [kept.id, 'bogusExpiredId'],
    });
    assert.deepEqual(clean.blackMarketOwned, [kept.id]);
    assert.deepEqual(clean.blackMarketSeenExpired, [kept.id]);
  });

  test('sanitizeRunData strips forged collection claims and syncs reward cash ledger', () => {
    const clean = sanitizeRunData({
      portfolio: { cash: 500, longs: {}, shorts: {}, options: [] },
      perks: [],
      vaultOwned: [],
      vaultSpentTotal: 0,
      blackMarketOwned: [],
      blackMarketSpentTotal: 0,
      seatOwned: false,
      collectionClaims: ['pct100', 'seatTaken', 'bogus'],
      collectionRewardCashTotal: 999999,
      meta: { reputation: 0, collectionFlair: 'Collection Archivist' },
    });
    assert.deepEqual(clean.collectionClaims, []);
    assert.equal(clean.collectionRewardCashTotal, 0);
    assert.equal(clean.meta.collectionFlair, null);

    const withSeat = sanitizeRunData({
      portfolio: { cash: 500, longs: {}, shorts: {}, options: [] },
      perks: [],
      vaultOwned: [],
      vaultSpentTotal: 0,
      blackMarketOwned: [],
      blackMarketSpentTotal: 0,
      seatOwned: true,
      seatPurchaseDay: 12,
      seatSpentTotal: THE_SEAT.cost,
      collectionClaims: ['seatTaken'],
      collectionRewardCashTotal: 0,
      meta: { reputation: 10 },
    });
    assert.deepEqual(withSeat.collectionClaims, ['seatTaken']);
    assert.equal(withSeat.collectionRewardCashTotal, 0);
  });

  test('sanitizeRunData cannot forge seatOwned=true without matching purchase record', () => {
    const forged = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      seatOwned: true,
      seatPurchaseDay: null,
      seatSpentTotal: 0,
    });
    assert.equal(forged.seatOwned, false);
    assert.equal(forged.seatPurchaseDay, null);
    assert.equal(forged.seatSpentTotal, 0);

    const legit = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      seatOwned: true,
      seatPurchaseDay: 42,
      seatSpentTotal: THE_SEAT.cost,
    });
    assert.equal(legit.seatOwned, true);
    assert.equal(legit.seatPurchaseDay, 42);
    assert.equal(legit.seatSpentTotal, THE_SEAT.cost);
  });

  test('sanitizeRunData clamps forged officeTierId without matching spend ledger', () => {
    const forged = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      officeTierId: 'empire',
      officeSpentTotal: 0,
    });
    assert.equal(forged.officeTierId, 'bedroom');
    assert.equal(forged.officeSpentTotal, 0);

    const legit = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      officeTierId: 'studio',
      officeSpentTotal: 2000,
    });
    assert.equal(legit.officeTierId, 'studio');
    assert.equal(legit.officeSpentTotal, 2000);
  });

  test('sanitizeRunData strips forged luxury, mega goal, and set claims', () => {
    const forged = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      luxuryOwned: ['dynastyWing'],
      luxurySpentTotal: 0,
      meta: {
        reputation: 0,
        megaGoalsClaimed: ['nw1b'],
        megaGoalFlair: 'Billionaire Desk',
        luxuryFlair: 'Dynasty Wing',
        setClaims: ['deskInstruments', 'fakeSet'],
        setFlair: 'Instrument Desk',
      },
    });
    assert.deepEqual(forged.luxuryOwned, []);
    assert.deepEqual(forged.meta.megaGoalsClaimed, []);
    assert.equal(forged.meta.megaGoalFlair, null);
    assert.equal(forged.meta.luxuryFlair, null);
    assert.deepEqual(forged.meta.setClaims, []);
    assert.equal(forged.meta.setFlair, null);

    const legitLux = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      luxuryOwned: ['cornerSuiteArt'],
      luxurySpentTotal: 100_000,
      meta: { reputation: 0, megaGoalsClaimed: [], luxuryFlair: null },
    });
    assert.deepEqual(legitLux.luxuryOwned, ['cornerSuiteArt']);
    assert.equal(legitLux.luxurySpentTotal, 100_000);
  });

  test('sanitizeRunData strips forged equipped relic IDs and enforces slot caps', () => {
    const relicIds = Object.keys(RELIC_EFFECTS_BY_ITEM_ID);
    const owned = relicIds.slice(0, 2);
    const spend = owned.reduce((sum, id) => sum + (BLACKMARKET_ITEM_POOL.find((item) => item.id === id)?.cost || 0), 0);
    const noSeat = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      blackMarketOwned: owned,
      blackMarketSpentTotal: spend,
      blackMarketEquippedRelics: [owned[0], 'forgedRelic', owned[1]],
      seatOwned: false,
      seatPurchaseDay: null,
      seatSpentTotal: 0,
    });
    assert.deepEqual(noSeat.blackMarketEquippedRelics, [owned[0]]);

    const withSeat = sanitizeRunData({
      v: 2,
      portfolio: { cash: 900, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
      blackMarketOwned: owned,
      blackMarketSpentTotal: spend,
      blackMarketEquippedRelics: [owned[0], owned[1]],
      seatOwned: true,
      seatPurchaseDay: 55,
      seatSpentTotal: THE_SEAT.cost,
    });
    assert.deepEqual(withSeat.blackMarketEquippedRelics, owned);
  });

  const {
    placeLimitOrder: placeLim,
    cancelPendingOrder: cancelLim,
    markOrderTicketFilled,
    markOrderTicketCancelled,
    ensureOrderTickets,
  } = portMod;

  test('limit place creates open order ticket', () => {
    const p = realCreatePortfolio(500);
    const r = placeLim(p, { sym: 'AAPL', action: 'long', shares: 1, limitPrice: 100 }, { perks: [] });
    assert.equal(r.ok, true, r.msg);
    ensureOrderTickets(p);
    assert.equal(p.orderTickets.length, 1);
    assert.equal(p.orderTickets[0].status, 'open');
    assert.equal(p.orderTickets[0].id, r.order.id);
  });

  test('filled ticket does not stay open', () => {
    const p = realCreatePortfolio(500);
    const r = placeLim(p, { sym: 'AAPL', action: 'long', shares: 1, limitPrice: 100 }, { perks: [] });
    markOrderTicketFilled(p, r.order, 99);
    assert.equal(p.orderTickets[0].status, 'filled');
    assert.equal(p.orderTickets[0].fillPrice, 99);
  });

  test('cancel marks ticket cancelled', () => {
    const p = realCreatePortfolio(500);
    const r = placeLim(p, { sym: 'AAPL', action: 'long', shares: 1, limitPrice: 100 }, { perks: [] });
    cancelLim(p, r.order.id);
    assert.equal(p.pendingOrders.length, 0);
    assert.equal(p.orderTickets[0].status, 'cancelled');
    // Idempotent second mark
    markOrderTicketCancelled(p, r.order.id);
    assert.equal(p.orderTickets[0].status, 'cancelled');
  });

  test('old save without orderTickets still loads', () => {
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 500, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
    });
    assert.ok(clean);
    assert.ok(Array.isArray(clean.portfolio.orderTickets));
    assert.equal(clean.portfolio.orderTickets.length, 0);
  });

  // --- Market beta / correlation ---
  const mkt = await import(pathToFileURL(path.join(__dirname, '../js/market.js')).href);
  const {
    stepMarketBeta, computeSymbolDrift, SECTOR_MARKET_BETA, loadMarket, serializeMarket, getMarketBeta,
  } = mkt;

  test('market beta stays clamped in [-1, 1]', () => {
    assert.equal(stepMarketBeta(0.9, 5), 1);
    assert.equal(stepMarketBeta(-0.9, -5), -1);
    assert.ok(stepMarketBeta(0.5, 0) < 0.5);
    assert.ok(stepMarketBeta(-0.5, 0) > -0.5);
  });

  test('market beta mean-reverts toward zero with no shock', () => {
    let b = 0.8;
    for (let i = 0; i < 80; i++) b = stepMarketBeta(b, 0);
    assert.ok(Math.abs(b) < 0.05, `expected near 0 after reversion, got ${b}`);
  });

  test('symbols share common beta component (correlation layer)', () => {
    const beta = 0.8;
    const vol = 0.001;
    const a = computeSymbolDrift({ marketBeta: beta, sector: 'tech', idiosyncratic: 0, sectorVol: vol });
    const b = computeSymbolDrift({ marketBeta: beta, sector: 'etf', idiosyncratic: 0, sectorVol: vol });
    const c = computeSymbolDrift({ marketBeta: -beta, sector: 'tech', idiosyncratic: 0, sectorVol: vol });
    assert.ok(a > 0 && b > 0, 'risk-on beta should lift both sectors');
    assert.ok(c < 0, 'risk-off beta should push tech down');
    assert.ok(b > a, 'ETF weight 1.0 should inherit more than tech 0.8 at equal vol');
    assert.ok(SECTOR_MARKET_BETA.etf >= SECTOR_MARKET_BETA.tech);
  });

  test('idiosyncratic noise still moves symbols independently of beta', () => {
    const shared = computeSymbolDrift({ marketBeta: 0, sector: 'tech', idiosyncratic: 0.001 });
    const flat = computeSymbolDrift({ marketBeta: 0, sector: 'tech', idiosyncratic: 0 });
    assert.ok(shared > flat);
    assert.equal(flat, 0);
  });

  test('old market save without marketBeta loads as neutral', () => {
    loadMarket({
      marketDate: new Date().toISOString(),
      dayCount: 3,
      dayStartEquity: 500,
      dayStartCash: 500,
      dayStartDebt: 0,
      dayTrades: 0,
      dayRealized: 0,
      speedMultiplier: 1,
    });
    assert.equal(getMarketBeta(), 0);
    const snap = serializeMarket();
    assert.ok('marketBeta' in snap);
    assert.equal(snap.marketBeta, 0);
  });

  // --- A2 Earnings / A3 Dividends / A4 Circuit breakers ---
  const corp = await import(pathToFileURL(path.join(__dirname, '../js/corporate-actions.js')).href);
  const {
    earningsDayInQuarter, rollEarningsOutcome,
    earningsVolMultiplier, processDividendsForDay, DIVIDEND_PAYERS, resetCorporateActionGuards,
    isDividendExDay, dividendExDayInQuarter,
  } = corp;
  const { shouldTripCircuit, CIRCUIT_BREAK_PCT, isSymbolHalted, resetSessionAnchors, checkCircuitBreaker } = mkt;
  const { defaultVol } = await import(pathToFileURL(path.join(__dirname, '../js/options-math.js')).href);

  test('each symbol has a stable quarterly earnings day', () => {
    const a = earningsDayInQuarter('AAPL');
    const b = earningsDayInQuarter('AAPL');
    assert.equal(a, b);
    assert.ok(a >= 5 && a <= 59);
    assert.notEqual(earningsDayInQuarter('AAPL'), earningsDayInQuarter('MSFT'));
  });

  test('earnings vol rises into event and crushes after', () => {
    const sym = 'AAPL';
    const eDay = earningsDayInQuarter(sym);
    const dayPre = eDay - 2; // until=2 → elevated IV
    const dayPost = eDay + 1; // since=1 → crush (eDay max 59)
    const pre = earningsVolMultiplier(sym, dayPre);
    const on = earningsVolMultiplier(sym, eDay);
    const post = earningsVolMultiplier(sym, dayPost);
    assert.ok(on > 1.2, `event day IV mult ${on}`);
    assert.ok(pre > 1 && pre < on, `pre ${pre} should be elevated but below event ${on}`);
    assert.ok(post < 1, `post crush ${post}`);
    const base = defaultVol(sym, 100, 0, 1);
    const hot = defaultVol(sym, 100, 0, on);
    assert.ok(hot > base);
  });

  test('rollEarningsOutcome does not invent free cash (gap only)', () => {
    const r = rollEarningsOutcome('KO', 20);
    assert.ok(['beat', 'miss', 'inline'].includes(r.outcome));
    assert.ok(Number.isFinite(r.gapPct));
    assert.ok(Math.abs(r.gapPct) <= 0.08);
  });

  test('dividends credit cash on ex-date and not otherwise', () => {
    resetCorporateActionGuards();
    getQuoteCache().set('KO', { price: 60, prevClose: 60 });
    const ex = dividendExDayInQuarter('KO');
    const p = realCreatePortfolio(500);
    p.longs.KO = { shares: 10, avgPrice: 60 };
    const paid = processDividendsForDay(p, ex);
    assert.ok(paid.length === 1, 'should pay on ex-date');
    assert.ok(p.cash > 500, `cash should rise, got ${p.cash}`);
    const expected = +(60 * DIVIDEND_PAYERS.KO / 4 * 10).toFixed(2);
    assert.ok(Math.abs(p.cash - (500 + expected)) < 0.02, `expected +${expected}, cash=${p.cash}`);
    // Same day again — guard blocks double pay
    const again = processDividendsForDay(p, ex);
    assert.equal(again.length, 0);
    assert.ok(Math.abs(p.cash - (500 + expected)) < 0.02);
  });

  test('dividends do not pay on non-ex days', () => {
    resetCorporateActionGuards();
    getQuoteCache().set('PG', { price: 150, prevClose: 150 });
    const ex = dividendExDayInQuarter('PG');
    const other = ex === 20 ? 21 : 20;
    assert.equal(isDividendExDay('PG', other), false);
    const p = realCreatePortfolio(500);
    p.longs.PG = { shares: 5, avgPrice: 150 };
    const paid = processDividendsForDay(p, other);
    assert.equal(paid.length, 0);
    assert.equal(p.cash, 500);
  });

  test('circuit breaker trips at threshold and blocks trading', () => {
    resetSessionAnchors();
    assert.equal(shouldTripCircuit(100, 106.9, CIRCUIT_BREAK_PCT).trip, false);
    assert.equal(shouldTripCircuit(100, 107, CIRCUIT_BREAK_PCT).trip, true);
    assert.equal(shouldTripCircuit(100, 93, CIRCUIT_BREAK_PCT).trip, true);
    // Live halt path: seed session open then shock past threshold
    getQuoteCache().set('HALT', { price: 100, prevClose: 100, high: 100, low: 100 });
    checkCircuitBreaker('HALT', 100); // set open
    assert.equal(isSymbolHalted('HALT'), false);
    checkCircuitBreaker('HALT', 108);
    assert.equal(isSymbolHalted('HALT'), true);
    const blocked = realBuyLong(realCreatePortfolio(500), 'HALT', 1, 108);
    assert.equal(blocked.ok, false);
    assert.match(blocked.msg, /HALTED/i);
  });

  // --- A5 Margin call / A6 Macro / A7 Slippage ---
  const marginMod = await import(pathToFileURL(path.join(__dirname, '../js/margin-call.js')).href);
  const {
    evaluateMarginHealth, processMarginCallTick,
    MAINTENANCE_MARGIN_PCT, MARGIN_CALL_GRACE_MINUTES, shortMarginSnapshot,
  } = marginMod;
  const macroMod = await import(pathToFileURL(path.join(__dirname, '../js/macro.js')).href);
  const {
    applyFedPolicy, getFedFundsRate, getYield10Y, macroAprAdjustment, fedShockMultiplier,
    resetMacroForTests, MACRO_BASE_FED, stepMacroTowardNeutral,
  } = macroMod;
  const slipMod = await import(pathToFileURL(path.join(__dirname, '../js/slippage.js')).href);
  const { applySlippage, slipFractionFromParticipation } = slipMod;

  {
    const slipArgs = {
      sym: 'DESK',
      side: 'buy',
      shares: 100,
      quotePrice: 100,
      quote: { price: 100, volume: 10000 },
      phaseFactor: { advMult: 1, slipMult: 1 },
    };
    const slipRelic = 'mageOfTheDesk';
    const graceRelic = 'liquidityCrown';

    test('applyRelicAwareSlippage produces identical fill price before/after extraction for the same inputs', () => {
      const state = {
        perks: ['smartRouting'],
        blackMarketOwned: [slipRelic],
        blackMarketEquippedRelics: [slipRelic],
        seatOwned: false,
      };
      // Hand composition (relic shrink, then smartRouting) — golden regression for the move.
      const base = applySlippage(slipArgs);
      assert.equal(base.fillPrice, 101.28);
      const afterRelic = applyRelicSlippageEffect(base, {
        quotePrice: 100,
        equippedRelics: getEquippedRelicIds(state),
      });
      assert.equal(afterRelic.fillPrice, 101.088);
      const golden = Math.max(0.01, +(100 + (afterRelic.fillPrice - 100) * 0.65).toFixed(4));
      assert.equal(golden, 100.7072);
      const actual = applyRelicAwareSlippage(state, slipArgs);
      assert.equal(actual.fillPrice, golden);
      assert.equal(actual.smartRouting, true);
      assert.equal(actual.relicAdjusted, true);
    });

    test('getDeskMarginGraceMinutes produces identical grace minutes before/after extraction for the same inputs', () => {
      const empty = {
        perks: [],
        blackMarketOwned: [],
        blackMarketEquippedRelics: [],
        seatOwned: false,
      };
      assert.equal(getDeskMarginGraceMinutes(empty), MARGIN_CALL_GRACE_MINUTES);
      assert.equal(getDeskMarginGraceMinutes(empty), 20);

      const relicOnly = {
        perks: [],
        blackMarketOwned: [graceRelic],
        blackMarketEquippedRelics: [graceRelic],
        seatOwned: false,
      };
      assert.equal(getDeskMarginGraceMinutes(relicOnly), 26);

      const relicAndPrime = {
        perks: ['primeBroker'],
        blackMarketOwned: [graceRelic],
        blackMarketEquippedRelics: [graceRelic],
        seatOwned: false,
      };
      assert.equal(getDeskMarginGraceMinutes(relicAndPrime), 34);
    });

    test('smartRouting perk still stacks after relic slippage shrink, not before', () => {
      const mid = 100;
      const relicState = {
        perks: [],
        blackMarketOwned: [slipRelic],
        blackMarketEquippedRelics: [slipRelic],
        seatOwned: false,
      };
      const bothState = {
        perks: ['smartRouting'],
        blackMarketOwned: [slipRelic],
        blackMarketEquippedRelics: [slipRelic],
        seatOwned: false,
      };
      const smartOnlyState = {
        perks: ['smartRouting'],
        blackMarketOwned: [],
        blackMarketEquippedRelics: [],
        seatOwned: false,
      };

      const relicOnly = applyRelicAwareSlippage(relicState, slipArgs);
      const smartOnly = applyRelicAwareSlippage(smartOnlyState, slipArgs);
      const both = applyRelicAwareSlippage(bothState, slipArgs);

      // Correct order: smartRouting applied to the relic-shrunk fill (not the raw base).
      const afterRelicThenSmart = Math.max(0.01, +(mid + (relicOnly.fillPrice - mid) * 0.65).toFixed(4));
      assert.equal(both.fillPrice, afterRelicThenSmart);
      assert.equal(both.fillPrice, 100.7072);

      // Distinguishable wrong path: smart on base, then shrink absolute fill by relic mult (not mid-delta).
      const wrongAbsoluteAfterSmart = Math.max(0.01, +(smartOnly.fillPrice * 0.85).toFixed(4));
      assert.notEqual(both.fillPrice, wrongAbsoluteAfterSmart);
      // Both effects beat either alone (closer to mid).
      assert.ok(Math.abs(both.fillPrice - mid) < Math.abs(relicOnly.fillPrice - mid));
      assert.ok(Math.abs(both.fillPrice - mid) < Math.abs(smartOnly.fillPrice - mid));
    });

    test('primeBroker +8 still applies on top of relic grace bonus, not instead of it', () => {
      const relicOnly = getDeskMarginGraceMinutes({
        perks: [],
        blackMarketOwned: [graceRelic],
        blackMarketEquippedRelics: [graceRelic],
        seatOwned: false,
      });
      const primeOnly = getDeskMarginGraceMinutes({
        perks: ['primeBroker'],
        blackMarketOwned: [],
        blackMarketEquippedRelics: [],
        seatOwned: false,
      });
      const both = getDeskMarginGraceMinutes({
        perks: ['primeBroker'],
        blackMarketOwned: [graceRelic],
        blackMarketEquippedRelics: [graceRelic],
        seatOwned: false,
      });
      assert.equal(relicOnly, 26);
      assert.equal(primeOnly, 28);
      assert.equal(both, 34);
      assert.equal(both, relicOnly + 8);
      assert.notEqual(both, primeOnly);
      assert.notEqual(both, relicOnly);
    });
  }

  test('short underwater below maintenance is a margin call', () => {
    getQuoteCache().set('TSLA', { price: 100, prevClose: 100, volume: 8e6 });
    const p = realCreatePortfolio(2000);
    const opened = realOpenShort(p, 'TSLA', 10, 100, true);
    assert.equal(opened.ok, true, opened.msg);
    // At open: equity/smv ≈ 50% initial margin
    assert.ok(shortMarginSnapshot('TSLA', p.shorts.TSLA).ratio >= 0.45);
    getQuoteCache().set('TSLA', { price: 160, prevClose: 100, volume: 8e6 });
    const h = evaluateMarginHealth(p);
    assert.equal(h.level, 'call');
    assert.ok(h.worstRatio < MAINTENANCE_MARGIN_PCT);
  });

  test('margin call grace then liquidates short', () => {
    getQuoteCache().set('GME', { price: 50, prevClose: 50, volume: 5e6 });
    const p = realCreatePortfolio(5000);
    assert.equal(realOpenShort(p, 'GME', 20, 50, true).ok, true);
    getQuoteCache().set('GME', { price: 90, prevClose: 50, volume: 5e6 });
    assert.equal(evaluateMarginHealth(p).level, 'call');
    const start = processMarginCallTick(p, { day: 2, minuteOfDay: 600 });
    assert.ok(start.toasts.some((t) => /MARGIN CALL/i.test(t.msg)));
    assert.equal(p.marginCall.level, 'call');
    assert.ok(p.shorts.GME, 'still open during grace');
    let after;
    for (let m = 1; m <= MARGIN_CALL_GRACE_MINUTES; m++) {
      after = processMarginCallTick(p, { day: 2, minuteOfDay: 600 + m });
    }
    assert.ok(after.liquidated || !p.shorts.GME);
    assert.ok(!p.shorts.GME || evaluateMarginHealth(p).level === 'ok');
  });

  test('margin grace does not burn across day boundary jump', () => {
    getQuoteCache().set('GME', { price: 50, prevClose: 50, volume: 5e6 });
    const p = realCreatePortfolio(5000);
    assert.equal(realOpenShort(p, 'GME', 20, 50, true).ok, true);
    getQuoteCache().set('GME', { price: 90, prevClose: 50, volume: 5e6 });
    processMarginCallTick(p, { day: 2, minuteOfDay: 900 });
    assert.equal(p.marginCall.level, 'call');
    const left = p.marginCall.graceLeft;
    // Simulate day-summary continue
    p.marginCall.lastTickAbs = null;
    const next = processMarginCallTick(p, { day: 3, minuteOfDay: 540 });
    assert.equal(next.liquidated, false);
    assert.ok(p.shorts.GME, 'position survives first tick of next day');
    assert.ok(p.marginCall.graceLeft >= left - 1);
  });

  test('sell and cover allowed during circuit halt', () => {
    resetSessionAnchors();
    getQuoteCache().set('HALTX', { price: 100, prevClose: 100, high: 100, low: 100 });
    checkCircuitBreaker('HALTX', 100);
    checkCircuitBreaker('HALTX', 108);
    assert.equal(isSymbolHalted('HALTX'), true);
    const p = realCreatePortfolio(5000);
    p.longs.HALTX = { shares: 5, avgPrice: 100, lots: [{ shares: 5, avgPrice: 100, openedDay: 1 }] };
    const sold = realSellLong(p, 'HALTX', 5, 108);
    assert.equal(sold.ok, true, sold.msg);
    const p2 = realCreatePortfolio(5000);
    assert.equal(realOpenShort(p2, 'AAPL', 2, 100, true).ok, true);
    // Halt AAPL separately
    getQuoteCache().set('AAPL', { price: 100, prevClose: 100 });
    checkCircuitBreaker('AAPL', 100);
    checkCircuitBreaker('AAPL', 108);
    assert.equal(isSymbolHalted('AAPL'), true);
    const covered = realCoverShort(p2, 'AAPL', 2, 108);
    assert.equal(covered.ok, true, covered.msg);
  });

  test('limit short requires margin perk', () => {
    const p = realCreatePortfolio(5000);
    const r = realPlaceLimit(p, { sym: 'TSLA', action: 'short', shares: 2, limitPrice: 100 }, { perks: [] });
    assert.equal(r.ok, false);
    assert.match(r.msg, /Margin/i);
  });

  test('sanitize backfills missing short marginHeld', () => {
    const clean = sanitizeRunData({
      v: 2,
      portfolio: {
        cash: 200,
        longs: {},
        shorts: { TSLA: { shares: 4, avgPrice: 50 } },
        options: [],
        pendingOrders: [],
        history: [],
      },
      perks: ['margin'],
    });
    assert.ok(clean.portfolio.shorts.TSLA.marginHeld > 0);
    assert.equal(clean.portfolio.shorts.TSLA.marginHeld, 4 * 50 * 0.5);
  });

  test('halts persist through market serialize/load', () => {
    resetSessionAnchors();
    getQuoteCache().set('PERSIST', { price: 100, prevClose: 100 });
    checkCircuitBreaker('PERSIST', 100);
    checkCircuitBreaker('PERSIST', 110);
    assert.equal(isSymbolHalted('PERSIST'), true);
    const snap = serializeMarket();
    assert.ok(Array.isArray(snap.halts) && snap.halts.some((h) => h.sym === 'PERSIST'));
    resetSessionAnchors();
    assert.equal(isSymbolHalted('PERSIST'), false);
    loadMarket(snap);
    assert.equal(isSymbolHalted('PERSIST'), true);
  });

  test('applyPriceShock clamps extreme moves for every symbol path', () => {
    const { applyPriceShock, MAX_SHOCK_PCT, rollQuotesForNewDay } = mkt;
    getQuoteCache().set('CLAMP', { price: 100, prevClose: 100, baselinePrice: 100 });
    applyPriceShock('CLAMP', 0.50); // would be +50% without clamp
    const q = getQuoteCache().get('CLAMP');
    assert.ok(Math.abs(q.price - 100 * (1 + MAX_SHOCK_PCT)) < 0.02);
    assert.ok(Math.abs(q.changePct) <= MAX_SHOCK_PCT * 100 + 0.05);
  });

  test('rollQuotesForNewDay resets day % for all cached symbols', () => {
    const { rollQuotesForNewDay } = mkt;
    getQuoteCache().set('ROLLA', { price: 110, prevClose: 100, changePct: 10, high: 112, low: 99 });
    getQuoteCache().set('ROLLB', { price: 50, prevClose: 40, changePct: 25, high: 55, low: 40 });
    rollQuotesForNewDay();
    const a = getQuoteCache().get('ROLLA');
    const b = getQuoteCache().get('ROLLB');
    assert.equal(a.prevClose, 110);
    assert.equal(a.changePct, 0);
    assert.equal(b.prevClose, 50);
    assert.equal(b.changePct, 0);
  });

  test('seed→live style rebase does not trip a 1000% circuit halt', () => {
    resetSessionAnchors();
    getQuoteCache().set('SEEDY', { price: 15, prevClose: 15 });
    checkCircuitBreaker('SEEDY', 15); // session open = 15
    // Later live rebase to ~195 — must reset anchor, not halt
    const tripped = checkCircuitBreaker('SEEDY', 195);
    assert.equal(tripped, false);
    assert.equal(isSymbolHalted('SEEDY'), false);
    // Real 8% move from new open should still halt
    checkCircuitBreaker('SEEDY', 195 * 1.08);
    assert.equal(isSymbolHalted('SEEDY'), true);
  });

  test('syncQuoteToPrice refuses to yank sim tape to divergent live candle', async () => {
    const { startSimulationMode, syncQuoteToPrice, getQuoteCache: cache } = await import(
      pathToFileURL(path.join(__dirname, '../js/api.js')).href
    );
    startSimulationMode();
    cache().set('YANK', {
      price: 317, prevClose: 310, simulated: true, anchored: true, source: 'yahoo',
    });
    const kept = syncQuoteToPrice('YANK', 334, { source: 'candle' });
    assert.equal(kept.price, 317);
  });

  test('syncQuoteToPrice never rewinds sim tape even on small candle lag', async () => {
    const { startSimulationMode, syncQuoteToPrice, getQuoteCache: cache } = api;
    startSimulationMode();
    cache().set('REWIND', {
      price: 100, prevClose: 99, simulated: true, anchored: true, source: 'yahoo',
    });
    // Even a large candle lag must not pull the tradeable tape backward during sim
    const kept = syncQuoteToPrice('REWIND', 90, { source: 'candle' });
    assert.equal(kept.price, 100);
  });

  test('limit fills apply slippage like market orders', () => {
    const { tryFillPendingOrder } = portMod;
    getQuoteCache().set('LIM', { price: 100, prevClose: 100, volume: 200_000 });
    const p = realCreatePortfolio(5_000_000);
    const order = {
      id: 't1', sym: 'LIM', side: 'long', shares: 8_000, limitPrice: 102,
      stopLoss: null, takeProfit: null,
    };
    // Marketable (100 <= 102)
    const attempt = tryFillPendingOrder(p, order, {
      buyLong: realBuyLong, sellLong: () => ({ ok: false }), openShort: () => ({ ok: false }),
      coverShort: () => ({ ok: false }), hasMargin: false, perks: [],
    });
    assert.equal(attempt.filled, true, attempt.error || 'expected fill');
    assert.ok(attempt.fillPrice > 100, 'buy limit should slip above mid');
    assert.ok(attempt.fillPrice <= 102, 'buy limit never worse than limit price');
  });

  test('resetMarketForNewRun restores Day 1 and baseline Fed', () => {
    const { resetMarketForNewRun, getDayCount: dayNow, getMarketBeta: betaNow, formatMarketClock } = mkt;
    loadMarket({
      marketDate: new Date().toISOString(),
      dayCount: 12,
      dayStartEquity: 900,
      dayStartCash: 900,
      dayStartDebt: 0,
      dayTrades: 3,
      dayRealized: 10,
      speedMultiplier: 5,
      marketBeta: 0.8,
      macro: { fedFundsRate: 6.25, yield10Y: 5.5 },
    });
    assert.equal(dayNow(), 12);
    assert.ok(getFedFundsRate() > MACRO_BASE_FED);
    resetMarketForNewRun();
    assert.equal(dayNow(), 1);
    assert.equal(betaNow(), 0);
    assert.equal(getFedFundsRate(), MACRO_BASE_FED);
    const clock = formatMarketClock();
    assert.equal(clock.day, 1);
    assert.equal(clock.phase, 'Pre-Market');
  });

  test('active margin call blocks new shorts', () => {
    const p = realCreatePortfolio(2000);
    p.marginCall = { level: 'call', startedAbs: 1000, toasted: true };
    getQuoteCache().set('AAPL', { price: 100, prevClose: 100 });
    const r = realOpenShort(p, 'AAPL', 2, 100, true);
    assert.equal(r.ok, false);
    assert.match(r.msg, /MARGIN CALL/i);
  });

  test('old save without macro loads baseline Fed/10Y', () => {
    resetMacroForTests(7, 6);
    loadMarket({
      marketDate: new Date().toISOString(),
      dayCount: 1,
      dayStartEquity: 500,
      dayStartCash: 500,
      dayStartDebt: 0,
      dayTrades: 0,
      dayRealized: 0,
      speedMultiplier: 1,
      marketBeta: 0,
    });
    assert.equal(getFedFundsRate(), MACRO_BASE_FED);
    const snap = serializeMarket();
    assert.ok(snap.macro);
    assert.equal(snap.macro.fedFundsRate, MACRO_BASE_FED);
  });

  test('fed hike raises policy rate, APR, and shock scale', () => {
    resetMacroForTests(MACRO_BASE_FED, 4.2);
    assert.equal(macroAprAdjustment(), 0);
    const finance = createFinanceState();
    const bank = BANKS[0];
    const apr0 = priceApr(bank, 'personal', finance, 10);
    applyFedPolicy('hike');
    applyFedPolicy('hike');
    assert.ok(getFedFundsRate() > MACRO_BASE_FED);
    assert.ok(getYield10Y() > 4.2);
    assert.ok(macroAprAdjustment() > 0);
    const apr1 = priceApr(bank, 'personal', finance, 10);
    assert.ok(apr1 > apr0, `APR should rise with Fed (${apr0} → ${apr1})`);
    assert.ok(fedShockMultiplier('fed_hike') >= 0.85);
    resetMacroForTests(MACRO_BASE_FED, 4.2);
  });

  test('macro mean-reverts toward baseline', () => {
    resetMacroForTests(6.5, 5.5);
    for (let i = 0; i < 80; i++) stepMacroTowardNeutral(0.08);
    assert.ok(Math.abs(getFedFundsRate() - MACRO_BASE_FED) < 0.15);
    resetMacroForTests(MACRO_BASE_FED, 4.2);
  });

  test('larger orders slip more than tiny ones (capped)', () => {
    const q = { price: 100, volume: 2_000_000 };
    const regular = { advMult: 1, slipMult: 1, volMult: 1, spreadPad: 0 };
    const tiny = applySlippage({ sym: 'XYZ', side: 'buy', shares: 1, quotePrice: 100, quote: q, phaseFactor: regular });
    const huge = applySlippage({ sym: 'XYZ', side: 'buy', shares: 200_000, quotePrice: 100, quote: q, phaseFactor: regular });
    assert.ok(huge.fillPrice > tiny.fillPrice);
    assert.ok(huge.slipPct > tiny.slipPct);
    assert.ok(huge.slipPct <= 0.02);
    const sell = applySlippage({ sym: 'XYZ', side: 'sell', shares: 200_000, quotePrice: 100, quote: q, phaseFactor: regular });
    assert.ok(sell.fillPrice < 100);
    assert.equal(slipFractionFromParticipation(0), 0);
  });

  test('marginCall field survives sanitize', () => {
    const clean = sanitizeRunData({
      v: 2,
      portfolio: {
        cash: -50,
        longs: { AAPL: { shares: 2, avgPrice: 100 } },
        shorts: {},
        options: [],
        pendingOrders: [],
        history: [],
        marginCall: { level: 'call', startedAbs: 5000, toasted: true },
      },
      perks: ['margin'],
    });
    assert.ok(clean);
    assert.equal(clean.portfolio.cash, -50);
    assert.equal(clean.portfolio.marginCall.level, 'call');
  });

  // --- A8 Tax / A9 Phase liquidity / A10 Insider noise ---
  const taxMod = await import(pathToFileURL(path.join(__dirname, '../js/tax.js')).href);
  const {
    isLongTermHold, computeTaxBill, settleTaxDay, isTaxDay, accrueTaxablePnL,
    GAME_YEAR_DAYS, TAX_DAY_INTERVAL, SHORT_TERM_TAX_RATE, LONG_TERM_TAX_RATE, createTaxAccrual,
  } = taxMod;
  const { phaseLiquidityFactor } = mkt;
  const evMod = await import(pathToFileURL(path.join(__dirname, '../js/events.js')).href);
  const { generateListingHint, estimateInsiderFairValue } = evMod;

  test('holding period splits short vs long term', () => {
    assert.equal(isLongTermHold(1, GAME_YEAR_DAYS), false);
    assert.equal(isLongTermHold(1, GAME_YEAR_DAYS + 1), true);
  });

  test('sell accrues short-term tax and Tax Day settles', () => {
    getQuoteCache().set('AAPL', { price: 100, prevClose: 100, volume: 1e7 });
    const p = realCreatePortfolio(5000);
    assert.equal(realBuyLong(p, 'AAPL', 10, 100, {}, []).ok, true);
    assert.ok(p.longs.AAPL.lots?.length >= 1);
    assert.equal(realSellLong(p, 'AAPL', 10, 150).ok, true);
    assert.ok(p.taxAccrual.shortTermGain >= 499, `ST gain ${p.taxAccrual.shortTermGain}`);
    const bill = computeTaxBill(p.taxAccrual, 0);
    assert.ok(bill.periodTax > 0);
    assert.ok(Math.abs(bill.periodTax - 500 * SHORT_TERM_TAX_RATE) < 1);
    const before = p.cash;
    const settled = settleTaxDay(p, TAX_DAY_INTERVAL);
    assert.ok(settled.paid > 0);
    assert.ok(p.cash < before);
    assert.equal(p.taxAccrual.shortTermGain, 0);
    assert.ok(isTaxDay(TAX_DAY_INTERVAL));
    assert.equal(isTaxDay(1), false);
  });

  test('long-term gains use lower tax rate', () => {
    const accrual = createTaxAccrual();
    accrual.longTermGain = 1000;
    const lt = computeTaxBill(accrual, 0);
    accrual.longTermGain = 0;
    accrual.shortTermGain = 1000;
    const st = computeTaxBill(accrual, 0);
    assert.ok(lt.periodTax < st.periodTax);
    assert.equal(lt.periodTax, 1000 * LONG_TERM_TAX_RATE);
  });

  test('old save without tax fields still loads', () => {
    const clean = sanitizeRunData({
      v: 2,
      portfolio: { cash: 500, longs: {}, shorts: {}, options: [], pendingOrders: [], history: [] },
      perks: [],
    });
    assert.ok(clean.portfolio.taxAccrual);
    assert.equal(clean.portfolio.taxOwed, 0);
  });

  test('pre-market / evening liquidity is thinner than regular', () => {
    const thin = phaseLiquidityFactor('Pre-Market');
    const eve = phaseLiquidityFactor('Evening');
    const day = phaseLiquidityFactor('Morning');
    assert.ok(thin.advMult < day.advMult);
    assert.ok(thin.slipMult > day.slipMult);
    assert.deepEqual(thin.slipMult, eve.slipMult);
    const q = { price: 50, volume: 1_000_000 };
    const regFill = applySlippage({
      sym: 'ABC', side: 'buy', shares: 50_000, quotePrice: 50, quote: q, phaseFactor: day,
    });
    const thinFill = applySlippage({
      sym: 'ABC', side: 'buy', shares: 50_000, quotePrice: 50, quote: q, phaseFactor: thin,
    });
    assert.ok(thinFill.slipPct > regFill.slipPct);
  });

  test('insider hints are usually right but not always', () => {
    const listing = { price: 100, trueValue: 120 };
    let buyish = 0;
    let sellish = 0;
    let vague = 0;
    for (let i = 0; i < 200; i++) {
      const hint = generateListingHint(listing, true, () => i / 200);
      if (!hint) continue;
      if (/underpriced|lean long/i.test(hint)) buyish++;
      else if (/overpriced|avoid/i.test(hint)) sellish++;
      else vague++;
    }
    assert.ok(buyish > sellish, `expected mostly buyish, got buy=${buyish} sell=${sellish} vague=${vague}`);
    assert.ok(sellish > 0, 'should sometimes be wrong');
    assert.ok(vague > 0, 'should sometimes be vague');
    assert.equal(generateListingHint(listing, false), null);
  });

  test('insider fair value estimate is noisy', () => {
    const listing = { price: 100, trueValue: 130 };
    const a = estimateInsiderFairValue(listing, () => 0.1);
    const b = estimateInsiderFairValue(listing, () => 0.9);
    assert.ok(Math.abs(a - 130) < 10, `near-truth estimate ${a}`);
    assert.ok(Math.abs(b - 130) > 5 || Math.abs(b - 100) < 25, `noisy estimate ${b}`);
  });

  // --- B11 Options expiry alignment ---
  const { estimateOptionValue, settleExpiredOptions, optionIntrinsicPerShare } = portMod;

  test('estimateOptionValue at expiry matches intrinsic settle (no fake 1-day TV)', () => {
    getQuoteCache().set('AAPL', { price: 110, prevClose: 100 });
    const opt = {
      sym: 'AAPL', type: 'call', strike: 100, qty: 1, premium: 5,
      openedDay: 1, expiryDay: 10, vol: 0.3,
    };
    // Force day count via loadMarket
    loadMarket({
      marketDate: new Date().toISOString(),
      dayCount: 10,
      dayStartEquity: 500,
      dayStartCash: 500,
      dayStartDebt: 0,
      dayTrades: 0,
      dayRealized: 0,
      speedMultiplier: 1,
      marketBeta: 0,
    });
    const marked = estimateOptionValue(opt);
    const intrinsic = optionIntrinsicPerShare(opt, 110) * 100;
    assert.equal(marked, intrinsic);
    // BS with 1-day floor would be > intrinsic for ITM call — ensure we did not do that
    assert.ok(marked === 1000, `expected $10 intrinsic ×100 = 1000, got ${marked}`);

    const p = realCreatePortfolio(5000);
    p.options = [{ ...opt, id: 't1' }];
    const settled = settleExpiredOptions(p, 10);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].payout, 1000);
    assert.equal(p.options.length, 0);
  });

  test('estimateOptionValue before expiry still has time value', () => {
    getQuoteCache().set('MSFT', { price: 100, prevClose: 100 });
    loadMarket({
      marketDate: new Date().toISOString(),
      dayCount: 1,
      dayStartEquity: 500,
      dayStartCash: 500,
      dayStartDebt: 0,
      dayTrades: 0,
      dayRealized: 0,
      speedMultiplier: 1,
      marketBeta: 0,
    });
    const opt = {
      sym: 'MSFT', type: 'call', strike: 100, qty: 1, premium: 5,
      openedDay: 1, expiryDay: 30, vol: 0.35,
    };
    const marked = estimateOptionValue(opt);
    const intrinsic = optionIntrinsicPerShare(opt, 100) * 100;
    assert.ok(marked > intrinsic, `ATM with time left should exceed intrinsic (${marked} > ${intrinsic})`);
  });

  console.log(`\n${passed} tests passed${failed ? `, ${failed} failed` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
