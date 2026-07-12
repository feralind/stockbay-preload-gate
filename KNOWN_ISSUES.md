# StockWay — Known Issues

Living log of audit findings and backlog progress.

## Baseline gate (2026-07-10)

- [x] `quality-tests.cjs` — green
- [x] `security-check.cjs` — green
- [x] `feature-audit.cjs` — was failing 7 checks; restored missing features:
  - Order ticket history (`orderTickets` / fill / cancel)
  - Alert trigger history + UI + save/load
  - Enter confirms order overlay
- [x] `package.json` `test` script now chains quality + security + feature-audit

## Backlog A

1. [x] Market beta / correlation layer — mean-reverting `marketBeta` in `market.js`; symbols inherit sector-weighted common drift + idiosyncratic noise. Persisted in market save (missing → 0).
2. [x] Earnings calendar + overnight gaps + IV crush — `corporate-actions.js` deterministic quarterly calendar; gaps via `applyPriceShock` (skip circuit); options IV via `earningsVolMultiplier`.
3. [x] Dividends — quarterly ex-date cash credit for `DIVIDEND_PAYERS` longs; history `DIVIDEND`; once-per-day guard.
4. [x] Circuit breakers / halts — ±7% from session open → 15 sim-minute halt; blocks ticks + **new** risk; sells/covers still allowed; toast + chart chip; halts persist in save.
5. [x] Margin call mechanic — maintenance 25% / warn 32%; grace 20 game minutes (`graceLeft`, survives day wrap); then forced cover. Blocks new shorts/margin buys while in call. Banner + toasts.
6. [x] Persistent macro regime — Fed funds + 10Y in `macro.js`; fed_hike/cut update rates and scale equity shocks; `priceApr` adds macro APR adj. Persisted in market save (`macro`). Phase tag shows Fed %.
7. [x] Volume-aware slippage — `slippage.js` participation vs ADV (quote.volume or estimated); market fills adverse up to 2%. Limits unchanged. Wired in app + staff.
8. [x] Capital gains tax — lot FIFO holding period (252 game days = LT); ST 15% / LT 5%; quarterly Tax Day every 63 days; accrual + taxOwed carry; history `TAX`.
9. [x] Pre-market/Evening liquidity — day starts `PREMARKET_MINUTES` before open; thin tape + wider slip (`phaseLiquidityFactor`); evening still simulates at reduced vol.
10. [x] Insider Network probabilistic edge — hints ~70% correct / 20% wrong / 10% vague; modal fair value is noisy estimate; perk copy updated.

## Backlog B

11. [x] Options daysLeft vs settle intrinsic — `estimateOptionValue` uses pure intrinsic when `daysLeft <= 0` (shared `optionIntrinsicPerShare`); no fake 1-day BS time value at expiry.
12. [x] UI smoke test — `scripts/ui-smoke.cjs` (Playwright): boot → buy → watch → hire → force day advance → no console errors. `npm run test:ui` / `npm run test:all`.
13. [x] Unified `npm test` chain — done

## Follow-ons spotted while fixing baseline

- Cancel path calls `markOrderTicketCancelled` from both `cancelPendingOrder` and `app.js` (idempotent; could dedupe later).
- Alert history is capped at 30 entries; no UI clear button yet.

## Follow-ons from A1

- Sector beta weights are static; could later tie to macro regime (A6).
- No HUD readout of current market beta yet (optional polish).

## Follow-ons from A2–A4

- Earnings/dividend calendars are hash-stable, not real-world dates.
- Dividend yield table is static; no special dividends / cuts.
- Circuit is per-symbol only (no market-wide Level 1/2/3 cascade).
- Halt duration is fixed 15 sim minutes; no reopen auction.

## Follow-ons from A5–A7

- Margin call does not yet model Reg-T house call vs exchange call separately.
- Macro stance is Fed/10Y only — no credit-spread or VIX layer.
- Slippage ignores explicit bid/ask quote; phase pad approximates spread in thin hours.
- Sector beta weights still static (A1 follow-on); could weight by macro stance next.

## Follow-ons from A8–A10

- Tax has no wash-sale / cross-term loss offset / estimated quarterly vouchers UI.
- Pre-market does not yet gate order types (all marketables still allowed).
- Insider accuracy is fixed 70% — could scale with REP later.

## Play-hardening pass (2026-07-10)

- [x] Don't reset day P&L baselines on mid-day reload (`snapshotDayStart` only on fresh run).
- [x] Margin-call grace uses `graceLeft` countdown (survives day-summary / day wrap).
- [x] Circuit halts block new risk only — sells/covers still work (stops + margin raise).
- [x] Option day backfill runs after `loadMarket` (correct `dayCount`).
- [x] Order confirm guards invalid price; close overlays after successful sell/cover.
- [x] Sanitize backfills missing short `marginHeld`; limit shorts require margin perk.
- [x] Active circuit halts + session opens persist in market save.
