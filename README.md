# StockWay — Paper Trade Simulator

Single-player paper trading desk sim. Start with **$500**, trade live-anchored prices on a sped-up market clock, snipe listings, hire staff, unlock perks, and climb equity — no real money.

## Play (recommended)

Double-click **`START HERE.bat`** (or **`play.bat`**).

That opens the **desktop game window**. The Yahoo data server runs **inside** the app — you should **not** see a PowerShell “KEEP THIS WINDOW OPEN” console.

| Launch path | What happens |
|-------------|--------------|
| Built exe (`dist\win-unpacked\StockWay.exe`) | Best — fully self-contained |
| Electron (`npm install` once) | Desktop window + embedded server |
| Browser fallback | Hidden background server + browser tab |

Stop leftovers with **`Stop StockWay.bat`** if needed.

### One-time desktop setup
1. Install [Node.js LTS](https://nodejs.org) (add to PATH)
2. Double-click **`START HERE.bat`** — it installs Electron if missing
3. Optional: **`build-exe.bat`** then play from `dist\win-unpacked\StockWay.exe`

## Autosave

- Progressive saves while you play (debounced + 30s heartbeat)
- Flushes on quit, tab hide, and window close
- Rotating day checkpoints (last 3) for recovery

## Features

| Feature | Description |
|---------|-------------|
| **500+ symbols** | Tech, finance, energy, ETFs, growth |
| **Live prices** | Yahoo proxy (+ Finnhub news if keyed) |
| **Charts** | Candlesticks + MA overlays |
| **Long / Short / Options** | Margin & options via perks |
| **Hot listings** | Clean watchlist-style deal feed |
| **AI Advisor** | Shared chat (sidebar + full page) |
| **Staff & loans** | Hire desk help, finance growth |
| **World events** | Live wire vs simulated shocks |

## API key (optional)

Finnhub key in `finnhub.key` or `js/config.js` for news. Quotes work via Yahoo without it.
