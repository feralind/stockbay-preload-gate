# StockWay — Licensing Framework Agent Prompt Pack

Ready-to-run prompts, one per workstream, for follow-up agent sessions on the
license system that replaced REP. Paste a prompt into a fresh agent chat (or
route to the named subagent). Each prompt carries the shared hard rules.

## Shared hard rules (include with every prompt)

- **No tick-thrash remounts.** `renderAll` runs on every market tick. Never rewrite a
  panel's full `innerHTML` per tick; fingerprint structure (owned ids, selection, tab)
  and patch live numbers with `textContent`. Never put live cash/NW/quotes in a
  structure key. See `.cursor/rules/stockway-ui-no-tick-thrash.mdc`,
  `js/ui/estates.js`, `js/ui/staff.js`, `js/ui/perks.js` (license board snap),
  `js/ui/finance.js` (bank list structure key).
- **Day-1 path intact.** $500 start → Scanner $250 → HR Dept $400 → Intern $550 must
  stay reachable. All tier-1 perks are `licenseRequired: 'retail'` (the free default
  license). Never gate `scanner`, `hrDept`, `analyst`, or `complianceSuite` behind a
  paid license, and never raise Intern hire/salary casually.
- **Quiet mechanics over loud HUD.** Denial reasons and one-shot teach moments, not
  toast spam or per-tick nags.
- **REP stays dead.** `meta.reputation` is a legacy inert field kept only for save
  migration (`licensesFromLegacyRep`). Never reintroduce REP earn, display, or gates.
- **Coordinate on `scripts/quality-tests.cjs`.** Any gate/economy change needs its
  assertions updated in the same session; run `npm test` (254 quality tests + quotes +
  security + feature audit) and `npm run test:ui` before declaring done.

---

## Prompt 1 — License engine + config gate swap (maintenance)

> The license engine lives in `js/licenses.js`: four tiers `retail → series7 →
> research → regd` (`LICENSE_ORDER`, `LICENSES`), qualification snapshot
> (`licenseSnapshot` reads cash, `stats.tradesClosed`, `stats.greenDays`, personal /
> business credit, day count, NW, `finance.lastLateDay`), exam gate
> (`canTakeLicenseExam`) and purchase (`purchaseLicense`). Perk gating goes through
> `canPurchasePerk` in `js/config.js` (`licenseRequired` per perk, checked with
> `hasLicense`). Save migration is in `js/save-sanitize.js`
> (`licensesFromLegacyRep`: old REP ≥120 → series7, ≥250 → research, ≥500 → regd;
> `sanitizeLicenses` always injects `retail` and fills the prerequisite chain).
> Task: [describe change — e.g. tune fees/requirements, add a tier]. Keep the exam UI
> in `js/ui/perks.js` (license board with per-requirement checklist) in sync, keep
> `state.onTakeLicenseExam` in `js/app.js` working, and update the license tests in
> `scripts/quality-tests.cjs` ("license ladder", "legacy REP migrates", "license exam
> gates"). [Shared hard rules apply.]

## Prompt 2 — Gate remap across vault / seat / salon / office / black market

> Legacy catalogs (vault, black market, salon, office tiers, estates, The Seat) still
> carry numeric `repRequired` / `minRep` data keys; they are interpreted through
> `requiredLicenseForRep(repNeed)` in `js/licenses.js` (0 → retail, ≤120 → series7,
> ≤400 → research, else regd) and checked with `hasLicense` in `js/vault.js`,
> `js/blackmarket.js`, `js/private-salon.js`, `js/office.js`, `js/estates.js`,
> `js/the-seat.js`. Desk aura / prestige is cosmetic-only (no REP minting; `auraAmp`
> is a display multiplier). Task: [describe change — e.g. rebalance an item's tier,
> add a catalog entry]. If you change a threshold band in `requiredLicenseForRep`,
> audit every catalog it feeds and the gate tests in `scripts/quality-tests.cjs`
> ("canPurchaseVaultItem rejects below license requirement", "isSeatListingActive
> never true without the Reg D license", office/estate gate tests).
> [Shared hard rules apply.]

## Prompt 3 — Finance teaching patches (reserve, split minimums, locked cards)

> Route to `stockway-balance` for anything that moves economy numbers. Current
> mechanics in `js/finance.js`: (a) reserve pressure — once per day inside
> `processDailyLoans`, if company debt > cash apply `applyCreditHit('business', 2)`
> and log a `reserve` loan event (guarded by `finance.reserveAdjDay`); (b) split bank
> minimums — each entry in `BANKS` has `minPersonalCredit` / `minCompanyCredit`,
> resolved by `bankMinCredit(bank, type)` and wired into `quoteLoan`,
> `underwriteMaxAmount`, `quoteBankOffers`; (c) `finance.lastLateDay` records the
> last late game-day (feeds the Reg D clean-30-days requirement). The locked-bank
> teaching card is `bankTeachHtml` in `js/ui/finance.js` — requirement vs current
> score plus one strategy hint, patched in place under `bankListStructureKey` (no
> remounts). Task: [describe change — e.g. tune a bank floor, add a teaching line].
> Keep hits small and once-per-day, keep copy plain-English and emoji-free, update
> finance tests in `scripts/quality-tests.cjs`. [Shared hard rules apply.]

## Prompt 4 — Teach-moment shell + recovery hints

> One-shot teach moments live in `js/teach-moments.js`: `TEACH_MOMENTS` (firstLoss,
> firstInterest, firstLate, firstOversized), `teachIdForLicense` for license-earned
> moments, shown-flags persisted in `meta.teachMomentsShown` (sanitized in
> `js/save-sanitize.js`). Trigger sites are in `js/app.js` (`fireTeachMoment`,
> `maybeShowFirstLossTeach`, `maybeShowOversizedTeach`, queued loan teach moments
> flushed on day continue) and day-end recap comes from `lessonLineForDay` +
> `updateRecoveryHint` (NW < 0 for 5+ days lists levers: cut payroll, pay debt, size
> down) wired through the day summary DTO in `js/day-end.js` and rendered in
> `daySummaryHtml` in `js/ui.js`. Task: [describe change — e.g. add a teach moment
> for X]. Rules: 1–2 plain sentences per moment, one-shot save-flagged, fired from
> game events (never per tick), quiet text over modal interruptions. Update the
> teach-moment and recovery-hint tests in `scripts/quality-tests.cjs`.
> [Shared hard rules apply.]

## Prompt 5 — Harness re-run + balance verdict (route to `stockway-balance`)

> Run the long-run balance harness and give a verdict:
> `BALANCE_DAYS=1000 node scripts/balance-500-day.cjs` (Windows PowerShell:
> `$env:BALANCE_DAYS='1000'; node scripts/balance-500-day.cjs`). The harness buys
> licenses via `maybeBuyLicense` (careful reserves cash, aggressive buys at the gate,
> AFK rarely qualifies) and reports `licenseDay` / `licenseSpendTotal` per style plus
> checkpoints in `.tmp-balance/500h-report.json`. Baseline from the 2026-07-15 run:
> careful earns all four licenses (Series 7 D66, Research D523, Reg D D728) and ends
> ~$663k NW with 0 late pays; aggressive tops NW (~$2.13M) but 1259 late pays pin
> credit at 300, permanently blocking Reg D (owned licenses persist) so
> hedgeFund/primeBroker/legendDesk stay locked; AFK never qualifies for any exam and
> ends slightly negative. Success criteria: careful must beat AFK, ruined credit must
> cost late-game access (not just money), day-1 hire path unaffected. Lead the report
> with a 1–2 sentence verdict, short careful/aggressive/AFK table, then what
> changed / what's still wrong / recommended next. [Shared hard rules apply.]
