# StockWay

**Paper Trading Desk Simulator**

Start with **$500**. Trade live-anchored prices on a sped-up market clock. Snipe listings, hire staff, unlock perks, borrow from banks, and climb equity — no real money.

---

## About This Game

StockWay is a single-player trading desk RPG. Build a firm from a bare desk into a legend operation: long/short equities, options, off-market deals, world events, staff automation, credit lines, and a collectibles chase across Vault, Private Salon, and The Seat.

**30 real minutes = 1 game day** at 1×. Grind slow or burn the clock at 10×.

---

## Features

### Trading Desk
- Buy & sell long positions (market / limit)
- Short selling (Margin perk)
- Stop loss & take profit
- Options desk — calls, puts, Black–Scholes pricing, Greeks
- Options expiry settlement at day-end
- Limit order queue & ticket history
- Volume-aware slippage
- FIFO tax lots & capital gains (ST / LT)
- Circuit breaker halts (±7%, 15-min halt)
- Margin call with grace period & forced liquidation
- Buying power (1× cash / 2× with Margin)
- Quick trade bar with scroll-to-adjust shares
- Symbol search with company aliases
- Order confirm for large trades

### Market & Simulation
- 500+ symbols across 21 sectors
- Live Yahoo quotes (embedded proxy)
- Offline / simulation mode with seed prices
- Feed status: Live · Offline · Cached · Seeds
- Accelerated market clock (1×–10×)
- Market hours, pre-market & evening liquidity
- Day phases: Pre-Market → Morning → Afternoon → Evening
- Market beta & sector correlation
- Macro regime — Fed funds + 10Y yield
- Earnings gaps, IV crush & quarterly dividends
- Price outlier guards (no ghost spikes)
- Optional Finnhub news wire

### Charts
- Candlesticks + volume (Lightweight Charts)
- Timeframes: 1D · 1W · 1M · 6M · YTD · 1Y · 5Y · MAX
- Zoom in / out / reset (sticky)
- Fit to view
- Live last-candle updates
- MA20 / MA50 overlays (Analyst perk)
- Support & resistance lines (Analyst perk)
- Chart · News · Stats tabs
- Halt chip when a symbol is frozen

### Deal Desk & Watchlist
- Off-market listings with GREAT DEAL tags
- Hot listings rail (rotating top deals)
- Search by symbol, company, or sector
- Sort: best deals · A→Z · price · % change · sector
- Watchlist with click-through to Trade
- Price alerts (above / below) + desktop notifications
- Triggered alert history
- Insider Network noisy fair-value hints
- Symbol logos (PNG → favicon → letter)

### World Events
- ~25 simulated desk briefs (Fed, oil, housing/rates, cyber, M&A, strikes, recession scare, dollar, SEC…)
- Game-day pacing + soft daily cap — events track the desk clock, not wall-clock spam
- Cooldown / Fed antiflip — no hike→cut whiplash the same afternoon
- Rate-sensitive prints (housing, dollar, Fed) scale with distance from baseline Fed funds
- Per-print 5% cap and shared ±10% daily shock budget; halted names are skipped (never deferred)
- Silent risk-off tape overlay on scare prints — beta/noise only; day’s trend/chop identity stays
- “Your book” cue when a print hits a held stock or option
- First Fed / first oil teach moments; day-end lesson line when a major template fired
- Live wire headlines with real article links (Finnhub) — separate from sim teaching copy
- News Wire perk — full stories + early headlines
- Event cards with bull / bear / mixed lean
- Compact events feed in the right rail

### Firm Progression
- REP reputation (0–99,999) with 6 ranks
- 15 desk perks gated by cash, REP & prerequisites
- Daily challenges (6 rotating goal types)
- Best Runs local leaderboard (top 10 equity)
- Collection flair titles from catalog milestones
- Vault Prestige aura — REP on profitable closes

**Perks**
| | | |
|---|---|---|
| Pro Scanner | HR Department | News Wire |
| Analyst Reports | Margin Account | Compliance Suite |
| Trading Floor | Options Desk | Smart Routing |
| Insider Network | AI Trading Advisor | Vault Prestige |
| Hedge Fund Status | Prime Broker | Legend Desk |

### Staff & Automation
- Hire up to 6 / 8 / 10 staff (perk upgrades)
- 9 roles: Intern · Listing Scout · Compliance Officer · Research Analyst · Junior Trader · Risk Manager · Short Specialist · Quant Analyst · Managing Partner
- Training: Newbie → Veteran → Expert
- Daily payroll at day-end
- Automation tick — sniping, AI buys, stops, momentum
- Mistake system (reduced by Compliance)
- Rename, fire & per-employee history
- Floor activity log

### Financing
- 18 banks with live APR quotes (national / online / credit unions)
- Soft house-lender loyalty — Known → Preferred → House from aged on-time cycles
- House bank: modest APR + limit edge at that lender only (others stay open)
- Checking & savings ATM (Finance → Accounts) — parked cash leaves Available Buying Power; savings earns game-scaled APY by bank category + loyalty (capped); interest taxed on Tax Day
- Personal & company loans
- Credit scores (personal + business, 300–850)
- Interest-hold rule (no same-day credit farm)
- Loan confirm modal & payoff calculator
- Partial / full payoff with payment history
- Vault collateral at 50% LTV
- Late payment credit hit, loyalty demote & vault repossession
- Property HELOC: Fair+ business credit to buy or draw; interest settles before rental net; unpaid interest → foreclosure after a short miss streak (distressed recovery toward the line)
- Poor personal credit open-risk scale (0.70× deployable desk cash on longs/shorts)

### Collectibles
- Trophy Vault (~21 cosmetics) — dashboard, background, trophy, title slots
- Foil SVG art & masterworks tier
- Private Salon — ultra-rare crown jewels ($2.5M–$5M) in scarce windows
- The Seat — $500K once-in-a-career prestige listing (rare window; claim from Collection when active)
- Legacy floor relics (Mage of the Desk · Liquidity Crown) — effects if owned from older saves; shop removed
- Collection Log with completion % & 8 milestones
- Museum mode — owned gallery with short lore + immersion sets
- Set completion claims cosmetic flair only (no REP / cash / Desk Prestige)
- Standing flair cascade: mega → luxury → set → collection
- Profile cosmetics applied across the desk

### Achievements
- 47 achievements across 6 tiers
- Bronze → Silver → Gold → Platinum → Diamond → Master
- Claim / Claim All with cash rewards
- Master of the Desk meta-achievement
- Prestige sheen on high tiers

### AI Advisor
- Daily AI picks (RSI, MA, momentum, news)
- Ask StockWay chat (full page + sidebar)
- Suggestion chips
- Chat history persistence
- Junior Trader auto-buys AI BUY signals

---

## Quality of Life

### Save & Progress
- Autosave (debounced + 30s heartbeat)
- Flush on quit, tab hide & window close
- Rotating day checkpoints (last 3)
- Export / import full save bundle
- Reset desk — archives to Best Runs, keeps profile
- Save sanitization on load

### Onboarding & Help
- Welcome modal — New vs Skip
- First-trade walkthrough with coachmarks
- Portfolio tour (6 steps)
- Perk unlock callouts
- Margin call & circuit halt coaches
- Live vs Offline status coach
- In-game Help guide (10 sections)
- Glossary (40+ terms) + hover tooltips

### Interface
- 14 main views + resizable sidebars
- Top stat bar with Equity / REP hover breakdowns
- Market clock, OPEN badge & Fed funds display
- Scrolling ticker tape
- Margin stress banner
- Footer pending orders + trade log
- Mobile nav drawer
- Overlay stack with Esc & focus trap
- Toast notifications
- Themes — 5 presets + custom color pickers
- Profile name & avatar
- UI sounds (buy / sell / success / error / click)
- Thin scrollbars & blur overlays

### Hotkeys
| Key | Action |
|-----|--------|
| `B` / `S` | Buy / Sell |
| `W` / `Shift+W` | Watchlist |
| `Space` | Pause |
| `R` | Refresh |
| `Ctrl+S` | Save |
| `1`–`8` | Chart timeframes |
| `[` / `]` | Cycle views |
| `/` | Search |
| `Esc` | Close overlay |

---

## Launch Options

| Path | Notes |
|------|--------|
| **StockWay.exe** | Best — fully self-contained |
| **START HERE.bat** | Desktop window + embedded server |
| **Browser fallback** | Hidden server + browser tab |

Optional Finnhub key for live news. Quotes work via Yahoo without it.

---

## Checklist

Use for playtesting — mark **Works** · **Broken** · **Polish** · **Untested**.

### Launch & Boot
- [ ] Desktop app (Electron)
- [ ] Browser fallback
- [ ] Built exe
- [ ] Launch / stop scripts
- [ ] Single-instance lock
- [ ] file:// guard
- [ ] Quit clean shutdown
- [ ] Quote preload gate (50 tickers)
- [ ] Background preload (500)
- [ ] Timeout + Continue anyway
- [ ] Gate before onboarding
- [ ] Warm-cache skip on continue
- [ ] Persisted quote baselines

### Core Loop
- [ ] Starting cash $500
- [ ] Market clock & phases
- [ ] Speed 1×–10×
- [ ] Pause / resume (+ Space)
- [ ] Visibility auto-pause
- [ ] Day-end settlement
- [ ] Day summary modal
- [ ] Daily challenge

### Views
- [ ] Dashboard
- [ ] Trade
- [ ] Portfolio
- [ ] Listings
- [ ] World Events
- [ ] Perks
- [ ] Staff
- [ ] Financing
- [ ] Achievements
- [ ] Trophy Vault
- [ ] Collection Log
- [ ] AI Advisor
- [ ] Settings

### Trading
- [ ] Buy / sell long
- [ ] Short / cover
- [ ] Limit orders
- [ ] Stop loss / take profit
- [ ] Options (calls / puts / expiry)
- [ ] Slippage
- [ ] Circuit halts
- [ ] Margin call
- [ ] Capital gains tax
- [ ] Dividends & earnings
- [ ] Trade log

### Market Data
- [ ] Live quotes
- [ ] Offline mode
- [ ] Feed status pill
- [ ] Manual refresh
- [ ] Macro Fed / 10Y
- [ ] Finnhub news (optional)

### Charts
- [ ] Candles + volume
- [ ] All timeframes
- [ ] Zoom / fit
- [ ] Live candle
- [ ] MA overlays
- [ ] News / Stats tabs

### Deal Desk
- [ ] Listings board
- [ ] Hot listings
- [ ] Search / sort / pagination
- [ ] Watchlist → Trade
- [ ] Price alerts + history
- [ ] Logos

### Progression
- [ ] REP ranks
- [ ] All 15 perks
- [ ] Daily challenges
- [ ] Best Runs
- [ ] Achievements claim flow

### Staff
- [ ] Hire / train / fire
- [ ] All 9 roles
- [ ] Payroll
- [ ] Automation tick
- [ ] Floor log

### Finance
- [ ] Banks & APR
- [ ] Personal / company loans
- [ ] Credit scores
- [ ] Payoff calculator
- [ ] Vault collateral
- [ ] Repossession

### Collectibles
- [ ] Vault equip slots
- [ ] Private Salon windows
- [ ] The Seat listing (Collection claim when active)
- [ ] Legacy relics (owned saves)
- [ ] Private Salon
- [ ] Collection Log milestones

### AI
- [ ] Daily picks
- [ ] Chat (page + sidebar)
- [ ] Locked state until perk

### QoL
- [ ] Autosave / checkpoints
- [ ] Export / import
- [ ] Reset desk
- [ ] Onboarding walkthrough
- [ ] Help + glossary
- [ ] Themes
- [ ] Hotkeys
- [ ] Sounds
- [ ] Desktop notifications
- [ ] Mobile drawer
- [ ] Sidebar resize

### Polish Candidates
- [ ] Alert history clear button
- [ ] Market beta HUD readout
- [ ] Real-world earnings / dividend dates
- [ ] Market-wide circuit cascade
- [ ] Bid / ask slippage
- [ ] Wash-sale / tax voucher UI
- [ ] Pre-market order-type gates
- [ ] Insider accuracy scales with REP

---

*StockWay — paper desk. No real money. Build the firm.*
