// @ts-check
/** Help / tutorial / glossary — StockWay preview */

export const HELP_SECTIONS = [
  {
    id: 'start',
    title: 'Where to Start',
    body: `You begin with <strong>$500</strong> paper cash on a home trading desk. The market clock runs in accelerated game time — at <strong>1x</strong>, one full trading day is about <strong>30 real minutes</strong>.
<br><br>
<strong>First-session loop:</strong>
<ol>
<li>Open <strong>Trade</strong> — buy a few shares of a familiar name (AAPL, NVDA). Start small.</li>
<li>Check <strong>Listings</strong> for off-market asks; sniping a <strong>GREAT DEAL</strong> stretches your cash.</li>
<li>Unlock <strong>Pro Scanner</strong> ($250 · Retail) in Perks — better listings and the gateway to everything else.</li>
<li>Watch Morning → Afternoon → Evening, then the day summary (P&amp;L, payroll, trades).</li>
<li>When you have ~$400 spare, unlock <strong>HR Department</strong> and hire an Intern or Scout.</li>
</ol>
Use the <strong>?</strong> button anytime. Autosave runs in the background.`,
  },
  {
    id: 'trading',
    title: 'Long, Short &amp; Positions',
    body: `<strong>Buy long</strong> — you pay cash for shares hoping price goes <strong>up</strong>. Profit = (sell − buy) × shares. Loss if it drops.
<br><br>
Example: Buy 1 AAPL @ $180 → sell @ $200 = <strong>+$20</strong>.
<br><br>
<strong>Short sell</strong> — bet price goes <strong>down</strong>. You borrow shares, sell now, buy back later (cover). Requires the <strong>Margin Account</strong> perk. Losses grow if price rises — shorts can lose more than the cash you posted.
<br><br>
Example: Short 1 TSLA @ $250 → cover @ $220 = <strong>+$30</strong>.
<br><br>
<strong>Sell / Cover</strong> on the trade bar closes your long or short in the selected symbol. Equity = cash + open position value (shorts include margin held ± unrealized).
<br><br>
<strong>Position size &amp; risk:</strong> start with <strong>1 share</strong> until the loop feels natural. Size decides how hard a wrong trade hits equity — not just whether you were right. Optional <strong>Stop Loss (SL)</strong> and <strong>Take Profit (TP)</strong> write your risk/reward before the click. Hover labels marked with Desk Lore tips for deeper “why.”`,
  },
  {
    id: 'listings',
    title: 'Listings, Watchlist &amp; Alerts',
    body: `<strong>Listings</strong> are seller asks that can sit above or below the live market.
<br><br>
• <strong>GREAT DEAL</strong> — ask is meaningfully under true value (snipers and Listing Scouts hunt these)<br>
• <strong>Insider Network</strong> perk reveals true-value hints<br>
• Search any of 500+ symbols for a market-price buy<br>
• Sort / Show more on the Listings page
<br><br>
<strong>Watchlist</strong> (right rail) tracks symbols. Click <strong>⌁</strong> or the bell on Trade to set <strong>price alerts</strong> (notify above / below). Alerts toast when crossed; they do not auto-trade.`,
  },
  {
    id: 'trade-ticket',
    title: 'Chart, Ticket &amp; Limit Orders',
    body: `Chart ranges: <strong>1D · 5D · 1M · 6M · 1Y · MAX</strong> (hotkeys 1–6). Tabs: Chart, News, Stats. With <strong>Analyst Reports</strong>, overlays and support/resistance hints appear.
<br><br>
<strong>Trade bar:</strong> shares · Market or Limit · optional Stop Loss (SL) / Take Profit (TP) · Buy Long · Short · Sell/Cover.
<br><br>
• <strong>Market</strong> — fills at the current quote<br>
• <strong>Limit</strong> — rests until price is marketable (buy/cover ≤ limit; sell/short ≥ limit)<br>
• Working limits show in the portfolio / orders area until filled or cancelled
<br><br>
Large notional trades may ask for confirmation. Thin sessions and larger size add <strong>slippage</strong> — the quiet tax of liquidity.`,
  },
  {
    id: 'news-events',
    title: 'World Events &amp; News Wire',
    body: `<strong>World Events</strong> mixes <em>simulated</em> desk briefs (blue) with <em>live</em> wire headlines (green). Cards show a headline, short teaser, and a bullish / bearish / mixed lean. Click <strong>Full brief</strong> to expand.
<br><br>
<strong>Simulated stories</strong> include a desk write-up, why it matters (sectors / tickers), and what the desk might do. Without <strong>News Wire</strong> you still see headlines and teasers; the full story stays locked with an unlock CTA.
<br><br>
<strong>News Wire</strong> ($650 · Series 86/87) unlocks those in-depth sim briefs and also surfaces live headlines ~2 minutes before they hit prices. Live items keep a source link — we don’t invent long copy for real headlines.
<br><br>
The Trade chart <strong>News</strong> tab lists live API headlines when a Finnhub key is configured.`,
  },
  {
    id: 'clock',
    title: 'Day Clock &amp; Speed',
    body: `Game day: <strong>9:30 AM–4:00 PM</strong> open, then Evening wrap, then day roll.
<br><br>
• <strong>Morning</strong> — open to noon<br>
• <strong>Afternoon</strong> — noon to close<br>
• <strong>Evening</strong> — after close; day summary, then next day
<br><br>
Speed: <strong>1x / 2x / 5x / 10x</strong>. At 1x, ~<strong>30 IRL minutes = 1 game day</strong>. Faster speeds compress the same phases.
<br><br>
End-of-day: interest on loans, payroll for staff, day summary with P&amp;L and actions.`,
  },
  {
    id: 'finance',
    title: 'Banks, Credit &amp; Loans',
    body: `Open <strong>Finance</strong> to borrow from banks. Two score tracks: <strong>personal</strong> and <strong>business</strong> (300–850).
<br><br>
• <strong>Personal loan</strong> — usually higher APR, smaller limits<br>
• <strong>Company loan</strong> — often lower APR / larger limits<br>
• <strong>APR</strong> = bank base ± credit tier, relationship, utilization, recent inquiries. Cards show your live quote.<br>
• Interest accrues daily (APR/365) at day-end
<br><br>
<strong>Hold rule:</strong> a loan must pass at least one game day-end (interest accrued) before voluntary repay builds credit. Same-morning borrow→repay does <em>not</em> farm score.
<br><br>
<strong>Utilization</strong> (open debt ÷ available limits) raises APR and can pressure scores when very high. Late payments hurt hard; rebuilds are slower (daily caps). Partial credit payments need ≥10% of balance, once per loan per day.
<br><br>
Offline note: credit math still runs on the sim clock; only live quote refreshes need network.`,
  },
  {
    id: 'perks',
    title: 'Perks &amp; Licenses',
    body: `Perks are permanent desk upgrades. Each sits on a <strong>license tier</strong> — you qualify for a license, pay its exam fee, and that tier of perks opens up. Owned perks from older saves keep working even if new gates would block a rebuy.
<br><br>
<strong>License ladder</strong>
<ol>
<li><strong>Retail Trading Account</strong> — everyone starts here. No exam.</li>
<li><strong>Series 7</strong> — ~$1,500 exam · ~25 closed trades · personal credit ≥ 620. Unlocks margin, shorts, the trading floor.</li>
<li><strong>Series 86/87 Research</strong> — ~$8,000 exam · ~15 green days · ~60 days on the desk. Unlocks research, news, AI advisor.</li>
<li><strong>Reg D Institutional</strong> — ~$35,000 exam · business credit ≥ 700 · net worth floor · no late payments in 30 days. Unlocks hedge fund, prime broker, Legend Desk.</li>
</ol>
Licenses are earned by <em>doing the work</em> — closing trades, keeping credit clean, staying patient. There is no grind meter; the requirements read like the real thing.
<br><br>
<strong>Tier board</strong>
<ul>
<li><strong>Retail</strong> — Pro Scanner ($250), HR Department ($400), Analyst Reports ($700), Compliance Suite</li>
<li><strong>Series 7</strong> — Margin Trading, Trading Floor, Smart Routing, Options Desk</li>
<li><strong>Series 86/87</strong> — News Wire, Insider Network, AI Advisor, Vault Prestige</li>
<li><strong>Reg D</strong> — Prime Broker, Hedge Fund Status, Legend Desk (10 seats + extra payroll cover)</li>
</ul>
Start with Scanner, then HR. Save Insider / AI / Legend for late game — they are expensive edges, not impulse buys.`,
  },
  {
    id: 'staff',
    title: 'Staff &amp; HR',
    body: `Requires <strong>HR Department</strong>. Cap: <strong>6</strong> seats (<strong>8</strong> with Trading Floor, <strong>10</strong> with Legend Desk). Salaries deduct each new day (Hedge Fund covers 50%; Legend Desk adds another 10%). Click ✎ to rename; Fire removes them.
<br><br>
<strong>Training:</strong> Newbie → Veteran ($450) → Expert ($1200). Higher tiers act more often and make fewer mistakes. Win rate also nudges efficiency.
<br><br>
<strong>Roles</strong> (hire · $/day · job):
<ul>
<li><strong>Intern</strong> — $120 · $8 — refreshes listings</li>
<li><strong>Listing Scout</strong> — $350 · $18 — snipes GREAT DEAL asks (needs Scanner)</li>
<li><strong>Compliance Officer</strong> — $450 · $22 — cuts firm mistake rate ~45%; flags losing longs</li>
<li><strong>Research Analyst</strong> — $600 · $32 — promotes near-deals; boosts Scout &amp; AI Trader (needs Analyst Reports)</li>
<li><strong>Junior Trader</strong> — $550 · $28 — buys AI BUY picks (needs AI Advisor)</li>
<li><strong>Risk Manager</strong> — $700 · $35 — sells longs at +12% / −7% (needs Margin)</li>
<li><strong>Short Specialist</strong> — $850 · $40 — shorts overbought names (needs Margin)</li>
<li><strong>Quant Analyst</strong> — $1,200 · $55 — momentum buys + covers bad shorts (Analyst + Margin)</li>
<li><strong>Managing Partner</strong> — $2,500 · $90 — +40% staff efficiency + cash bonuses (HR + Hedge Fund)</li>
</ul>
Mistakes cost small cash blunders. Compliance + training keep the desk clean. Activity log is on the Staff page.`,
  },
  {
    id: 'offline',
    title: 'Offline / Online Status',
    body: `The desk always simulates prices from baselines — it is not tick-by-tick streaming.
<br><br>
• <strong>Online</strong> — can fetch base quotes and news when you Refresh or on the re-anchor timer<br>
• <strong>Offline / Cached</strong> — uses last successful baselines (or built-in seeds). Trading, staff, loans, and the clock keep running<br>
<br><br>
Brand status in the header shows Online, Cached, Seeds, etc. The chart pill says <strong>Simulated tape</strong> because the desk clock drives prices after those baselines load. Hit <strong>Refresh</strong> when online to re-anchor.`,
  },
  {
    id: 'compressed-realism',
    title: 'Compressed realism',
    body: `StockWay runs on a fast clock so you can practice in hours what would take months on a real calendar — at 1×, about <strong>30 real minutes</strong> equals one game day.
<br><br>
The tape is <strong>simulated</strong> after live (or seed) baselines load. That is intentional: you are here to learn sizing, risk, patience, and credit — the same habits that matter in real trading — not to chase a live brokerage stream.
<br><br>
Some sessions will feel great when a clean decision pays. Some will feel flat or rough even when you did the process right. That mix is the point. Treat paper money like real risk so the lessons transfer when you leave the desk.`,
  },
  {
    id: 'saves',
    title: 'Saves, Reset &amp; Settings',
    body: `Autosave runs while you play (debounced + periodic). <strong>Settings → Save</strong> lets you export / import a full backup (portfolio, perks, staff, loans, achievements, profile, theme, sidebar).
<br><br>
<strong>Reset desk</strong> wipes cash, positions, staff, loans, and progress but keeps profile name/photo.
<br><br>
Theme, sound, sidebar width, and hotkeys live under Settings.`,
  },
  {
    id: 'achievements',
    title: 'Achievements &amp; Licenses',
    body: `<strong>Achievements</strong> unlock as you trade, hire, grow equity, and clear challenges. Claim cash rewards on the Achievements tab (Claim / Claim All). Tiers run Bronze → Master.
<br><br>
<strong>Licenses</strong> replace an abstract reputation meter: Retail → Series 7 → Series 86/87 Research → Reg D Institutional. Each has real requirements (closed trades, credit score, green days, clean payment history) plus an exam fee. Daily challenges pay cash when completed. Higher licenses gate stronger Perks.`,
  },
  {
    id: 'risk-options',
    title: 'Risk, Psychology &amp; Options',
    body: `<strong>Desk lore:</strong> legends survive first, then compound. Ask “how much can I lose?” before “how much can I make?”
<br><br>
<strong>Core risk habits</strong>
<ul>
<li><strong>Position size</strong> — smaller tickets teach the loop; concentration raises path risk.</li>
<li><strong>Risk / reward</strong> — stops and targets make the downside explicit. A high win rate with terrible payoff ratios can still shrink equity.</li>
<li><strong>Diversification</strong> — names in the same sector often crash together; cash left free is dry powder.</li>
<li><strong>Drawdown</strong> — the scar chart. Size so one scar never ends the career.</li>
<li><strong>Psychology</strong> — FOMO chases heat; revenge sizing after a loss is how books die. Wait for the next clean idea.</li>
</ul>
<strong>Options (Options Desk perk)</strong> — a <em>call</em> is the right (not obligation) to buy at a strike; a <em>put</em> is the right to sell. You pay <strong>premium</strong> for that choice.
<br><br>
• <strong>Delta</strong> — how much of a $1 underlying move the option tends to feel<br>
• <strong>Implied volatility (IV)</strong> — how expensive uncertainty is today; after events, IV can “crush” even if you were directionally right<br>
<br><br>
Hover Desk Lore tips on the floor for short definitions (beta, liquidity, IV, delta). Paper money is the safe gym — treat it like real risk so the habits transfer.`,
  },
];

export const GLOSSARY = [
  { cat: 'TRADING', term: 'Long', def: 'Own shares betting price goes up.', glossId: 'long' },
  { cat: 'TRADING', term: 'Short', def: 'Bet price goes down; buy back later to close.', glossId: 'short' },
  { cat: 'TRADING', term: 'Cover', def: 'Buy back shares to close a short position.', glossId: 'cover' },
  { cat: 'TRADING', term: 'Market order', def: 'Buy/sell immediately at current price.', glossId: 'market-order' },
  { cat: 'TRADING', term: 'Limit order', def: 'Rests until price is at your limit or better; then fills.', glossId: 'limit-order' },
  { cat: 'TRADING', term: 'Stop loss (SL)', def: 'Auto-exit level if price moves against you.', glossId: 'stop-loss' },
  { cat: 'TRADING', term: 'Take profit (TP)', def: 'Auto-exit level when price hits your target.', glossId: 'take-profit' },
  { cat: 'TRADING', term: 'Equity', def: 'Cash + value of all open positions (net of debt on Finance views).', glossId: 'total-equity' },
  { cat: 'TRADING', term: 'Buying power', def: 'How much you can still deploy (2× with Margin perk). Vault appraisal is not buying power.', glossId: 'buying-power' },
  { cat: 'TRADING', term: 'P&L', def: 'Profit and loss — unrealized until you close.', glossId: 'pnl' },
  { cat: 'TRADING', term: 'Position size', def: 'How much capital sits in one idea — decides how hard a miss hits equity.', glossId: 'position-size' },
  { cat: 'TRADING', term: 'Risk / reward', def: 'Downside if wrong vs upside if right; stops and targets make it explicit.', glossId: 'risk-reward' },
  { cat: 'TRADING', term: 'Diversification', def: 'Spreading capital so one bad print cannot end the book.', glossId: 'diversification' },
  { cat: 'TRADING', term: 'Delta', def: 'Option sensitivity to a $1 move in the underlying.', glossId: 'delta' },
  { cat: 'MARKET', term: 'World Events', def: 'Feed of simulated desk briefs and live headlines that can shock prices. Expand a card for the full write-up.' },
  { cat: 'MARKET', term: 'News Wire', def: 'Perk that unlocks in-depth simulated stories and shows live headlines ~2 min before price impact.' },
  { cat: 'MARKET', term: 'Desk lean', def: 'Bullish / bearish / mixed chip on an event card — quick read on how the desk might position.' },
  { cat: 'MARKET', term: 'Listing', def: 'A seller offer that may be above/below market.' },
  { cat: 'MARKET', term: 'GREAT DEAL', def: 'Listing priced meaningfully under true value.', glossId: 'great-deal' },
  { cat: 'MARKET', term: 'Watchlist', def: 'Pinned symbols in the right rail for quick charts.' },
  { cat: 'MARKET', term: 'Price alert', def: 'Toast when a watchlist symbol crosses your above/below level.' },
  { cat: 'MARKET', term: 'Trading halt', def: 'Symbol paused for new buys/shorts after a ~7% move from session open (~15 game minutes). Sell/cover still allowed.', glossId: 'trading-halted' },
  { cat: 'MARKET', term: 'Simulation', def: 'Live Yahoo prices seed the open and charts; once the accelerated clock runs, drift, sector betas, events, and circuit breakers drive the tape — not the real market.' },
  { cat: 'MARKET', term: 'Compressed realism', def: 'Fast game clock (~30 real minutes per day at 1×) with the same lessons as real trading: size, risk, patience, credit — not tick-by-tick brokerage streaming.' },
  { cat: 'MARKET', term: 'Offline', def: 'Desk keeps running from last fetched baselines (or seeds). No quote/news API calls until you Refresh or reconnect. Paper money only — nothing leaves the browser except quote lookups.' },
  { cat: 'MARKET', term: 'Online', def: 'Online means the desk can fetch base quotes through the StockWay proxy — not tick-by-tick streaming, and not a brokerage.' },
  { cat: 'MARKET', term: 'Slippage', def: 'Fill can differ from mid — larger size and thin sessions slip more. Smart Routing reduces it.', glossId: 'slippage' },
  { cat: 'MARKET', term: 'Liquidity', def: 'How easily you enter/exit near a fair price; thin tape widens fills.', glossId: 'liquidity' },
  { cat: 'MARKET', term: 'Beta', def: 'How loudly a name tends to move with the broader market.', glossId: 'beta' },
  { cat: 'MARKET', term: 'Implied volatility', def: 'Priced-in expectation of how wild moves might be; higher IV usually means richer option premiums.', glossId: 'implied-volatility' },
  { cat: 'MARKET', term: 'Margin call', def: 'Equity cushion below maintenance. Cover or sell to restore it, or the desk liquidates after grace.', glossId: 'margin-stress' },
  { cat: 'MARKET', term: 'Fed funds (sim)', def: 'Simulated policy rate — nudges loan APRs and Fed hike/cut event impact. Not a live Fed quote.', glossId: 'fed-rate' },
  { cat: 'STAFF', term: 'HR Department', def: 'Perk required before any hire ($400 · Retail, needs Scanner).' },
  { cat: 'STAFF', term: 'Newbie', def: 'Entry tier — more mistakes, slower actions.' },
  { cat: 'STAFF', term: 'Veteran', def: 'Trained staff — fewer mistakes ($450 upgrade).' },
  { cat: 'STAFF', term: 'Expert', def: 'Top tier — rare mistakes ($1200 upgrade).' },
  { cat: 'STAFF', term: 'Payroll', def: 'Daily salary deducted at the start of each new day (Hedge Fund pays half).', glossId: 'payroll' },
  { cat: 'STAFF', term: 'Size cap', def: 'Most buy automation respects max ~5% of total portfolio equity per name.' },
  { cat: 'STAFF', term: 'Compliance', def: 'Officer role that suppresses firm-wide mistake rate and flags risk — never trades.' },
  { cat: 'STAFF', term: 'Research Analyst', def: 'Promotes near-deals and boosts Scout / Junior Trader hit quality — never executes.' },
  { cat: 'STAFF', term: 'Exit Specialist', def: 'Seller role — trims winners (+8%) and cuts early losers (−5%); never opens risk.' },
  { cat: 'STAFF', term: 'Risk Manager', def: 'Hard exit desk — flats longs at +12% take-profit or −7% stop; never buys.' },
  { cat: 'STAFF', term: 'Managing Partner', def: 'Late-game lead hire — efficiency boost + firm cash bonuses; no personal snipes.' },
  { cat: 'FINANCE', term: 'Personal loan', def: 'Borrow against personal credit; usually higher APR.' },
  { cat: 'FINANCE', term: 'Company loan', def: 'Business credit line — often lower APR, larger limits.' },
  { cat: 'FINANCE', term: 'APR', def: 'Annual percentage rate. Accrues daily (APR/365). Quote = bank base ± credit tier, relationship, utilization, inquiries.' },
  { cat: 'FINANCE', term: 'Credit score', def: '300–850. Hold rule: need one day-end of interest before voluntary repay builds credit. Lates hurt hard; rebuilds are capped daily.' },
  { cat: 'FINANCE', term: 'Credit utilization', def: 'Open debt ÷ available bank limits. High util raises APR and can pressure the score.' },
  { cat: 'PROGRESS', term: 'License', def: 'Retail → Series 7 → Series 86/87 → Reg D. Each needs real qualifications (trades, credit, patience) plus an exam fee. Gates perk tiers.' },
  { cat: 'PROGRESS', term: 'Exam fee', def: 'One-time cash cost to sit a license exam once you qualify. Paid on the Perks view.' },
  { cat: 'PROGRESS', term: 'Challenge', def: 'Daily goal with a cash reward if completed.', glossId: 'challenge' },
  { cat: 'PROGRESS', term: 'Perk', def: 'Permanent unlock bought with cash + the right license (Scanner, Margin, HR, AI, etc.).' },
  { cat: 'PROGRESS', term: 'Speed', def: '1x/2x/5x/10x — at 1x, ~30 real minutes = one game day.', glossId: 'game-speed' },
];

const ONBOARD_KEY = 'stockway_onboarded_v1';

export function needsOnboarding() {
  return !localStorage.getItem(ONBOARD_KEY);
}

export function markOnboarded() {
  localStorage.setItem(ONBOARD_KEY, '1');
}

export function showOnboarding(onTutorial, onSkip) {
  const overlay = document.getElementById('onboard-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.getElementById('onboard-new')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    markOnboarded();
    onTutorial?.();
  }, { once: true });
  document.getElementById('onboard-skip')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    markOnboarded();
    onSkip?.();
  }, { once: true });
}

export function openHelp(tab = 'guide') {
  const overlay = document.getElementById('help-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  setHelpTab(tab);
}

export function closeHelp() {
  document.getElementById('help-overlay')?.classList.add('hidden');
}

export function setHelpTab(tab) {
  document.querySelectorAll('.help-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  const guide = document.getElementById('help-guide');
  const gloss = document.getElementById('help-glossary');
  if (guide) guide.classList.toggle('hidden', tab !== 'guide');
  if (gloss) gloss.classList.toggle('hidden', tab !== 'glossary');
}

export function renderHelpContent() {
  const guide = document.getElementById('help-guide');
  if (guide) {
    guide.innerHTML = HELP_SECTIONS.map(s => `
      <div class="help-section" id="help-sec-${s.id}">
        <div class="help-section-label">HOW THIS WORKS</div>
        <h3>${s.title}</h3>
        <div class="help-body">${s.body}</div>
      </div>`).join('');
  }
  const gloss = document.getElementById('help-glossary');
  if (gloss) {
    const cats = [...new Set(GLOSSARY.map(g => g.cat))];
    gloss.innerHTML = `
      <div class="help-section-label">WORDS YOU'LL SEE A LOT</div>
      <p class="help-sub">Quick definitions for trading & firm terms. Hover linked terms for Desk Lore tips.</p>
      ${cats.map(cat => `
        <div class="gloss-cat">
          <div class="gloss-cat-title">${cat}</div>
          ${GLOSSARY.filter(g => g.cat === cat).map(g => `
            <div class="gloss-row"><span class="gloss-term"${g.glossId ? ` data-gloss="${g.glossId}"` : ''}>${g.term}</span><span class="gloss-def">${g.def}</span></div>
          `).join('')}
        </div>`).join('')}`;
  }
}

export function bindHelpUI() {
  renderHelpContent();
  document.getElementById('btn-help')?.addEventListener('click', () => openHelp('guide'));
  document.getElementById('help-close')?.addEventListener('click', closeHelp);
  document.getElementById('help-got-it')?.addEventListener('click', closeHelp);
  document.getElementById('help-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'help-overlay') closeHelp();
  });
  document.querySelectorAll('.help-tab').forEach(tab => {
    tab.onclick = () => setHelpTab(tab.dataset.tab);
  });
}
