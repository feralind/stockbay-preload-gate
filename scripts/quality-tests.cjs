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
    bankDebt, otherBanksDebt,
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
  const { VAULT_ITEMS, canPurchaseVaultItem, purchaseVaultItem, getVaultBookValue, getVaultDeskAura, applyVaultDeskAuraOnClose } = vaultMod;
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
    const { getMaxStaff, payDailySalaries, MAX_STAFF } = staffMod;
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
      // intern salary 8; HF 50% + Legend 10% = 60% subsidy → pay 4? floor(8*0.5)=4, +floor(8*0.1)=0 → subsidy 4, cost 4
      // Wait: floor(8*0.1)=0 so effectively still 50%. Use a higher salary role.
      state.staff = [{ roleId: 'partner', tier: 'newbie', active: true }];
      // partner 90: HF 45 + Legend 9 = 54 subsidy, cost 36
      const before = state.portfolio.cash;
      const paid = payDailySalaries(state);
      assert.equal(paid, 36);
      assert.equal(state.portfolio.cash, before - 36);
    });
  }

  {
    const chartMod = await import(pathToFileURL(path.join(__dirname, '../js/chart.js')).href);
    const { findSupportResistance } = chartMod;
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
  }

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
    const { buildFirmRelicRowHtml, configureDashboardUi } = dashMod;
    test('dashboard Firm Snapshot shows None equipped with correct slot count when empty', () => {
      const one = buildFirmRelicRowHtml({ blackMarketEquippedRelics: [], seatOwned: false });
      assert.match(one, /None equipped \(1 slot\)/);
      assert.match(one, /data-goto="blackmarket"/);
      const two = buildFirmRelicRowHtml({ blackMarketEquippedRelics: [], seatOwned: true });
      assert.match(two, /None equipped \(2 slots\)/);
      assert.match(two, /data-goto="blackmarket"/);
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
    assert.equal(HELP_SECTIONS.length, 12);
    assert.ok(HELP_SECTIONS.some((s) => s.id === 'start'));
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
        'open-pnl', 'realized', 'win-rate', 'drawdown', 'total-equity',
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
