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
<li>Unlock <strong>Pro Scanner</strong> ($250 · Newcomer) in Perks — better listings and the gateway to everything else.</li>
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
<strong>Short sell</strong> — bet price goes <strong>down</strong>. You borrow shares, sell now, buy back later (cover). Requires the <strong>Margin Account</strong> perk. Losses grow if price rises.
<br><br>
Example: Short 1 TSLA @ $250 → cover @ $220 = <strong>+$30</strong>.
<br><br>
<strong>Sell / Cover</strong> on the trade bar closes your long or short in the selected symbol. Equity = cash + open position value (shorts include margin held ± unrealized).`,
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
    body: `Chart ranges: <strong>1D · 5D · 1M · 6M · YTD · 1Y · 5Y · MAX</strong> (hotkeys 1–8). Tabs: Chart, News, Stats. With <strong>Analyst Reports</strong>, overlays and support/resistance hints appear.
<br><br>
<strong>Trade bar:</strong> shares · Market or Limit · optional Stop Loss (SL) / Take Profit (TP) · Buy Long · Short · Sell/Cover.
<br><br>
• <strong>Market</strong> — fills at the current quote<br>
• <strong>Limit</strong> — rests until price is marketable (buy/cover ≤ limit; sell/short ≥ limit)<br>
• Working limits show in the portfolio / orders area until filled or cancelled
<br><br>
Large notional trades may ask for confirmation.`,
  },
  {
    id: 'news-events',
    title: 'World Events &amp; News Wire',
    body: `<strong>World Events</strong> mixes <em>simulated</em> desk briefs (blue) with <em>live</em> wire headlines (green). Cards show a headline, short teaser, and a bullish / bearish / mixed lean. Click <strong>Full brief</strong> to expand.
<br><br>
<strong>Simulated stories</strong> include a desk write-up, why it matters (sectors / tickers), and what the desk might do. Without <strong>News Wire</strong> you still see headlines and teasers; the full story stays locked with an unlock CTA.
<br><br>
<strong>News Wire</strong> ($650 · Desk Hand) unlocks those in-depth sim briefs and also surfaces live headlines ~2 minutes before they hit prices. Live items keep a source link — we don’t invent long copy for real headlines.
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
    title: 'Perks &amp; REP Ranks',
    body: `Perks are permanent desk upgrades. Each sits on a <strong>tier band</strong> gated by cash and <strong>REP rank</strong>. Owned perks from older saves keep working even if new gates would block a rebuy.
<br><br>
<strong>REP rank ladder</strong>
<ol>
<li><strong>Newcomer</strong> — 0+ REP</li>
<li><strong>Desk Hand</strong> — 40+ REP</li>
<li><strong>Trusted Trader</strong> — 120+ REP</li>
<li><strong>Market Veteran</strong> — 250+ REP</li>
<li><strong>Elite Desk</strong> — 500+ REP</li>
<li><strong>Market Legend</strong> — 1,800+ REP (Legend Desk unlock)</li>
</ol>
REP rises mainly from profitable closes, challenges, green days (and 3-day streaks), on-time loans, and achievements. Open trades grant a small bump; loan auto-pays taper at high REP so grinding stays paced.
<br><br>
<strong>Tier board</strong>
<ul>
<li><strong>Tier 1 · Newcomer</strong> — Pro Scanner ($250), HR Department ($400)</li>
<li><strong>Tier 2 · Desk Hand</strong> — News Wire ($650 · 40), Analyst Reports ($700 · 40; MA + S/R), Margin ($950 · 40), Compliance Suite ($900 · 45)</li>
<li><strong>Tier 3 · Trusted Trader</strong> — Trading Floor ($2,800 · 120), Smart Routing ($3,600 · 130), Options Desk ($4,800 · 150)</li>
<li><strong>Tier 4 · Market Veteran</strong> — Vault Prestige ($12,500 · 300), Insider Network ($16,500 · 250), AI Advisor ($18,500 · 280)</li>
<li><strong>Tier 5 · Elite Desk</strong> — Prime Broker ($22,000 · 550), Hedge Fund Status ($28,000 · 500)</li>
<li><strong>Tier 6 · Market Legend</strong> — Legend Desk ($50,000 · 1,800; 10 seats + extra payroll cover)</li>
</ul>
Start with Scanner, then HR. Save Insider / AI / Legend for late game — they are expensive edges, not impulse buys.`,
  },
  {
    id: 'staff',
    title: 'Staff &amp; HR',
    body: `Requires <strong>HR Department</strong>. Cap: <strong>6</strong> seats (<strong>8</strong> with Trading Floor, <strong>10</strong> with Legend Desk). Salaries deduct each new day (Hedge Fund covers 50%; Legend Desk adds another 10%). Click ✎ to rename; Fire removes them.
<br><br>
<strong>Training:</strong> Newbie → Veteran ($150) → Expert ($400). Higher tiers act more often and make fewer mistakes. Win rate also nudges efficiency.
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
    title: 'Offline / Live Status',
    body: `The desk always simulates prices from baselines — it is not tick-by-tick streaming.
<br><br>
• <strong>Live / Connected</strong> — can fetch base quotes and news when you Refresh or on the online re-anchor timer<br>
• <strong>Offline / Cached</strong> — uses last successful baselines (or built-in seeds). Trading, staff, loans, and the clock keep running<br>
<br><br>
Brand status in the header shows Connected, Cached, Seeds, etc. Hit <strong>Refresh</strong> when online to re-anchor.`,
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
    title: 'Achievements &amp; REP',
    body: `<strong>Achievements</strong> unlock as you trade, hire, grow equity, and clear challenges. Claim cash rewards on the Achievements tab (Claim / Claim All). Tiers run Bronze → Master.
<br><br>
<strong>REP</strong> starts at 0 and unlocks named ranks (Newcomer → Desk Hand → Trusted Trader → Market Veteran → Elite Desk → Market Legend). It rises with profits, on-time loan payments, and challenges; it falls on losses, late debt, and firings. Daily challenges pay cash + REP when completed. Higher ranks gate stronger Perks.`,
  },
];

export const GLOSSARY = [
  { cat: 'TRADING', term: 'Long', def: 'Own shares betting price goes up.' },
  { cat: 'TRADING', term: 'Short', def: 'Bet price goes down; buy back later to close.' },
  { cat: 'TRADING', term: 'Cover', def: 'Buy back shares to close a short position.' },
  { cat: 'TRADING', term: 'Market order', def: 'Buy/sell immediately at current price.' },
  { cat: 'TRADING', term: 'Limit order', def: 'Rests until price is at your limit or better; then fills.' },
  { cat: 'TRADING', term: 'Stop loss (SL)', def: 'Auto-exit level if price moves against you.' },
  { cat: 'TRADING', term: 'Take profit (TP)', def: 'Auto-exit level when price hits your target.' },
  { cat: 'TRADING', term: 'Equity', def: 'Cash + value of all open positions (net of debt on Finance views).' },
  { cat: 'TRADING', term: 'Buying power', def: 'How much you can still deploy (2× with Margin perk). Vault appraisal is not buying power.' },
  { cat: 'TRADING', term: 'P&L', def: 'Profit and loss — unrealized until you close.' },
  { cat: 'MARKET', term: 'World Events', def: 'Feed of simulated desk briefs and live headlines that can shock prices. Expand a card for the full write-up.' },
  { cat: 'MARKET', term: 'News Wire', def: 'Perk that unlocks in-depth simulated stories and shows live headlines ~2 min before price impact.' },
  { cat: 'MARKET', term: 'Desk lean', def: 'Bullish / bearish / mixed chip on an event card — quick read on how the desk might position.' },
  { cat: 'MARKET', term: 'Listing', def: 'A seller offer that may be above/below market.' },
  { cat: 'MARKET', term: 'GREAT DEAL', def: 'Listing priced meaningfully under true value.' },
  { cat: 'MARKET', term: 'Watchlist', def: 'Pinned symbols in the right rail for quick charts.' },
  { cat: 'MARKET', term: 'Price alert', def: 'Toast when a watchlist symbol crosses your above/below level.' },
  { cat: 'MARKET', term: 'Trading halt', def: 'Symbol paused for new buys/shorts after a ~7% move from session open (~15 game minutes). Sell/cover still allowed.' },
  { cat: 'MARKET', term: 'Simulation', def: 'Live Yahoo prices seed the open and charts; once the accelerated clock runs, drift, sector betas, events, and circuit breakers drive the tape — not the real market.' },
  { cat: 'MARKET', term: 'Offline', def: 'Desk keeps running from last fetched baselines (or seeds). No quote/news API calls until you Refresh or reconnect. Paper money only — nothing leaves the browser except quote lookups.' },
  { cat: 'MARKET', term: 'Live / Connected', def: 'Online means the desk can fetch base quotes through the StockWay proxy — not tick-by-tick streaming, and not a brokerage.' },
  { cat: 'MARKET', term: 'Slippage', def: 'Fill can differ from mid — larger size and thin sessions slip more. Smart Routing reduces it.' },
  { cat: 'MARKET', term: 'Margin call', def: 'Equity cushion below maintenance. Cover or sell to restore it, or the desk liquidates after grace.' },
  { cat: 'MARKET', term: 'Fed funds (sim)', def: 'Simulated policy rate — nudges loan APRs and Fed hike/cut event impact. Not a live Fed quote.' },
  { cat: 'STAFF', term: 'HR Department', def: 'Perk required before any hire ($400 · Newcomer, needs Scanner).' },
  { cat: 'STAFF', term: 'Newbie', def: 'Entry tier — more mistakes, slower actions.' },
  { cat: 'STAFF', term: 'Veteran', def: 'Trained staff — fewer mistakes ($150 upgrade).' },
  { cat: 'STAFF', term: 'Expert', def: 'Top tier — rare mistakes ($400 upgrade).' },
  { cat: 'STAFF', term: 'Payroll', def: 'Daily salary deducted at the start of each new day (Hedge Fund pays half).' },
  { cat: 'STAFF', term: 'Compliance', def: 'Officer role that suppresses firm-wide mistake rate and flags risk.' },
  { cat: 'STAFF', term: 'Research Analyst', def: 'Promotes near-deals and boosts Scout / Junior Trader hit rate.' },
  { cat: 'STAFF', term: 'Managing Partner', def: 'Late-game lead hire — efficiency boost + firm cash bonuses.' },
  { cat: 'FINANCE', term: 'Personal loan', def: 'Borrow against personal credit; usually higher APR.' },
  { cat: 'FINANCE', term: 'Company loan', def: 'Business credit line — often lower APR, larger limits.' },
  { cat: 'FINANCE', term: 'APR', def: 'Annual percentage rate. Accrues daily (APR/365). Quote = bank base ± credit tier, relationship, utilization, inquiries.' },
  { cat: 'FINANCE', term: 'Credit score', def: '300–850. Hold rule: need one day-end of interest before voluntary repay builds credit. Lates hurt hard; rebuilds are capped daily.' },
  { cat: 'FINANCE', term: 'Credit utilization', def: 'Open debt ÷ available bank limits. High util raises APR and can pressure the score.' },
  { cat: 'PROGRESS', term: 'REP', def: 'Reputation starts at 0. Named ranks gate perk tiers. Rises with profits, on-time payments, challenges. Falls on losses, late debt, firings.' },
  { cat: 'PROGRESS', term: 'REP rank', def: 'Newcomer (0) → Desk Hand (40) → Trusted Trader (120) → Market Veteran (250) → Elite Desk (500) → Market Legend (1800).' },
  { cat: 'PROGRESS', term: 'Challenge', def: 'Daily goal with cash + REP reward if completed.' },
  { cat: 'PROGRESS', term: 'Perk', def: 'Permanent unlock bought with cash + REP rank (Scanner, Margin, HR, AI, etc.).' },
  { cat: 'PROGRESS', term: 'Speed', def: '1x/2x/5x/10x — at 1x, ~30 real minutes = one game day.' },
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
      <p class="help-sub">Quick definitions for trading & firm terms.</p>
      ${cats.map(cat => `
        <div class="gloss-cat">
          <div class="gloss-cat-title">${cat}</div>
          ${GLOSSARY.filter(g => g.cat === cat).map(g => `
            <div class="gloss-row"><span class="gloss-term">${g.term}</span><span class="gloss-def">${g.def}</span></div>
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
