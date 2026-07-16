# StockWay — Patch Notes

## Update — July 15, 2026 · Patch 1.0 / Firm & Career

Four days on the desk. The firm got real estate, real licenses, and charts that finally remember *your* career — not last week’s Yahoo tape.

---

### New

- **Estates** — Buy property. Build firm net worth. Portfolio shows cash + estate allocation like a real book.
- **Institutional licenses** — **REP is out.** Climb **Retail → Series 7 → Research → Reg D** with exams, fees, and gates that teach the desk instead of minting a score.
- **Office & mega goals** — Soft office stages, luxury sinks, and big career targets that feel like a climb — not a checklist dump.
- **Collection prestige** — Museum energy. Milestones, flair, desk support unlocks. Vault photos back in the Collection Log.
- **Staff dossiers** — HR that looks like HR. Cleaner roster, dossiers, and overview that don’t thrash when the tape ticks.
- **Credit-scaled Buying Power** — Better personal credit → more room to work. Blow up a trade and take a short **revenge cool-down** before you revenge-buy the same mistake.
- **Career charts (every ticker)** — Long timeframes start on real market history, then **slide into your sim days** as you play. Open NVDA on day 10 and it still lines up — not Apple-only magic.
- **1W timeframe** — Replaces **5D**. One week of tape: 7 live → peel into sim, day by day.

---

### Gameplay

- **Licenses gate power** — Perks, vault, and late-game toys check license + cash + prereqs. No more REP ladder cosplay.
- **Buying Power** — Scales with personal credit band. Margin still stacks; cool-downs stop tilt spam.
- **Estates & firm NW** — Property equity counts. Firm snapshot and portfolio allocation stay honest.
- **Finance credit lessons** — The bank side teaches utilization, APR, and aging — not same-day farm loops.

---

### Quality of Life

- **Glass desk polish** — Split canvas / card depth, clearer metrics, quieter Wave underfill.
- **Cursor tips** — Glossary / Cash / Net Worth tips match Achievements: gold sheet, instant retarget, gone on navigate.
- **Chart calm** — Y-axis floors, less breathing on live ticks, highs stay on screen for 1W / MAX.
- **Estates / Staff / HUD** — No more flash-remount stutter when cash ticks (structure fingerprint + live patches).

---

### Fixes

- **Charts on every symbol** — Late-opened tickers catch up career days instead of looking frozen on pure Yahoo.
- **1D session seed** — Thin morning stubs no longer block a real session chart on names you haven’t babysat.
- **Vault / Collection media** — Photos and art refresh; Collection Log shows what you own.
- **Firm equity HUD** — Stutter cleaned up when NW moves.
- **Black Market retired** — Shop, nav, legendary coach, and daily listings removed. Owned relics/cosmetics still load from saves; empty relic row goes to Collection. The Seat rare window claims from Collection when active (GM all-collectibles still grants it).

---

### Backend / Tech

- Sim candle ledger: hybrid launchpad + career daily per symbol; save/load with the market.
- Day roll folds candles for the whole quote book; chart open backfills late symbols.
- License framework replaces REP progression plumbing.
- Credit BP multipliers + revenge cool-down matrix under test.

---

### How to play this build

1. Launch with `START HERE.bat` or `StockWay.exe`.
2. Check **Live** / **Offline**. Trade the tape.
3. Earn licenses, hire staff, buy an estate, watch **1W → 1M → 1Y** become *your* history.

Welcome back to the desk.

---

## Update — July 10, 2026 · Patch 0.9 / Desk Update

The desk got sharper. Offline mode, a real firm roster, deeper news, and a chart that behaves like it means it.

---

### New

- **Offline play** — Run the desk without a live feed. Status shows **Live** or **Offline** so you always know which world you're in.
- **Perk tiers by REP** — Perks unlock in ranks. Earn the reputation, unlock the edge. Fresh **SVG perk icons** so the board looks like a real progression tree.
- **Staff firm redesign** — Your firm feels like a firm. Meet the **Compliance Officer** and **Research Analyst** — new roles, new leverage.
- **World Events & sim news** — Briefs run deeper. The **News Wire** gates full stories; live headlines open the real article when you're connected.
- **Equity & REP hover breakdowns** — Hover your numbers. See what actually moved them.
- **Deal desk Refresh** — One clean refresh when the book needs a reset.
- **Chart upgrade** — Fit to view, zoom that sticks, wave refresh, and a live last candle that keeps pace with the tape.

---

### Gameplay

- **Time** — **30 real minutes = 1 game day.** Speeds from **1x to 10x** — grind slow or burn the clock.
- **Credit** — No same-day farm. You need an **interest day** before the next pull. **APR** scales with credit score and utilization. **Net equity** math is fairer.
- **OP perks** — Cost more. Need higher **REP**. Power isn't free.

---

### Quality of Life

- **Loans** — Scroll works again. Confirm modal before you sign.
- **Watchlist → Trade** — Click through and land on the chart, ready to act.
- **Achievements** — Cleaner **Claim** flow. High tiers get a prestige sheen.
- **Narrow windows** — Top bar no longer eats your UI.
- **Help guide** — Expanded. More answers, less guessing.

---

### Fixes

- **Electron** — Equity / REP popovers no longer fight the window drag region.
- **Chart zoom** — No more thrash when you scroll in and out.
- **Price spikes & bad tape** — Seeds, baselines, and ticker refresh cleaned up (NFLX 889 ghosts, DOCU/SEDG 400s, identical spark lines).
- **Listing vs Trade** — Prices match between the list and the trade screen.

---

### Backend / Tech

- Offline / Live status plumbing.
- Perk gating tied to REP ranks; icon assets.
- News Wire story gates and live headline links.
- Chart fit, zoom, and live candle refresh.
- Price seed / baseline / ticker consistency pass.

---

### How to play this build

1. Launch with `START HERE.bat` or `StockWay.exe`.
2. Check the status pill — **Live** or **Offline**.
3. Build **REP**, unlock perk tiers, hire staff, watch the wire, and trade the chart.

Welcome back to the desk.
