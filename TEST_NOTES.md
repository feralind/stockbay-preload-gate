# StockWay feature notes



These notes describe the polish promoted into the main StockWay build.



## How to run



1. Double-click **`START HERE.bat`** (or `play.bat`)

2. Browser mode starts a hidden Yahoo proxy on port **8080**

3. Electron mode (if `node_modules` present) uses port **3847**

4. To stop background servers: **`Stop StockWay.bat`**



## Features in this preview (for approval before merge)



### Core UX & polish

- **Branding** — StockWay name, inline SVG logo mark, updated splash/onboarding

- **Scrollbars** — Thin dark seamless scrollbars globally

- **Trade UX** — Order confirm modal, hidden number spinners (wheel to adjust), SL/TP, position summary

- **Mobile nav** — Hamburger drawer below 768px with overlay

- **Cache bust** — `?v=test6` on CSS and app.js



### Market & listings

- **Expanded symbols** — Auto, apparel, space, penny, international sectors (~100+ tickers)

- **Listings** — Sort/search (deals, A–Z, price, % change, sector), pagination

- **Logos** — Local `assets/logos/{SYM}.png` first, then favicon fallbacks; bank logos on financing desk



### Options & risk

- **Black-Scholes** pricing chain with 3 expiries and more strikes

- **Greeks** — Shown when Analyst perk unlocked

- **Game-day expiry** — Options decay/settle at day end (not wall-clock)

- **Price alerts** — Watchlist above/below alerts with toast notifications

- **Short margin stress** banner in header when underwater



### Firm & progress

- **Staff performance** — Win rate, trades closed, efficiency multiplier in HR panel

- **Hedge Fund perk** — 50% payroll subsidy; Managing Partner requires hedge fund

- **Loan payoff calculator** — Minimum vs lump-sum cost on Financing tab

- **Leaderboard** — Local best-equity runs on dashboard

- **Achievements** — Green streak, profitable shorts, early loan payoff, $10k equity, watch alerts, first option

- **Day summary REP** — Matches actual reputation deltas



### API & security

- **Finnhub key off client** — Key in gitignored `finnhub.key`; news via `/api/news` proxy (browser + Electron)



## Save key



Game saves use `stockway_save_v1` in localStorage (separate from main StockWay saves).



## Finnhub news (optional)

Copy `finnhub.key.example` → `finnhub.key` and paste your free key from [finnhub.io/register](https://finnhub.io/register).

With a key, `/api/news` returns Finnhub market news including each item’s **article `url`**. World Events live titles open that exact story (CNBC/Reuters/etc.). Without a key, offline stubs show with **no link** (we do not invent Google News search URLs). If Finnhub omits `url` on a row, the title stays unlinked.

