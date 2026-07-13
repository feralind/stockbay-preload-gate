# StockWay Phase 1 Handoff — Office / Dashboard / Mega Goals / Collectible Flavor

**Date:** 2026-07-12  
**Scope decision:** **1A + 2A only**  
**Status:** Exploration complete. Implementation not started (awaiting section-by-section confirmation).

Use this document for design/architecture review (e.g. Grok). It captures project rules, audit findings, reuse map, risks, and the ordered implementation plan.

---

## 0. Confirmed constraints (do not violate)

### Core fantasy
Start with **$500** → profitable trader → respected firm → Wall Street legend.  
Trading is primary; empire progression is the long game. Every feature must make the player feel **richer, smarter, or more respected**.

### Scope this pass
| Code | Meaning |
|------|---------|
| **1A** | Office progression + Dashboard evolution + Mega goals + late-game luxury/office sinks |
| **2A** | Keep all collectible **buy** paths; add lore / museum view / set bonuses / flavor (save-safe) |

**Out of scope this pass:** staff role expansion, rivals, Fame currency, full unlock-then-claim collectible rework, deep museum animations beyond lightweight gallery + set bonuses.

### Hard “do not casually change”
- Starting cash **$500**
- Staff caps **6 / 8 / 10**
- Margin / buying power / slippage / APR / credit formulas
- Save schema **`v: 2`** — migrate with defaults; never silently delete progress

### Feature discipline (7 questions — every feature)
1. Does this already exist somewhere else?  
2. Can this extend an existing system instead of creating a new one?  
3. Will this increase UI clutter?  
4. Will this make the economy harder to balance?  
5. Is there a simpler solution?  
6. Will a new player immediately understand it?  
7. Does this support the core fantasy of becoming a legendary trader?  
→ If #7 is **no**, do not implement.

### UI philosophy
Bloomberg Terminal × Apple: professional, minimal, premium, dark, elegant. Prefer hover / tooltips / drawers over modal spam. **Dashboard is the heart** and must visually evolve. Office improves over time without visual noise.

### Code process
- Search before creating; reuse modules/state  
- Prefer editing `meta.js`, `ui/dashboard.js`, `collection-log.js`, `css/styles.css` over brand-new engines  
- Required change format when proposing: Reasoning → Tradeoffs → Affected files → Risks → Edits  
- Verify: no TS/console/lint errors, no duplicate logic, save/load OK, no clutter, performance OK

---

## 1. Architecture snapshot (what exists)

| Layer | Path | Role |
|-------|------|------|
| Electron | `electron/main.cjs` | Local server + window |
| Shell | `index.html` | Views, CSP, nav |
| Boot / state | `js/app.js` | Mutable `state`, save/load, day handlers |
| Render | `js/ui.js` + `js/ui/*.js` | `renderAll`, per-view renderers |
| Clock / market | `js/market.js` | Game day phases |
| Portfolio | `js/portfolio.js` | Cash, positions, BP |
| Day end | `js/day-end.js` | Settlement DTO |
| Meta | `js/meta.js` | REP, challenges, flair, aura daily counter |
| Config | `js/config.js` | REP ranks, perks, starting cash |
| Vault / salon | `js/vault.js`, `js/private-salon.js` | Collectibles + Desk Prestige |
| BM / Seat | `js/blackmarket.js`, `js/the-seat.js` | Scarcity listings |
| Collection | `js/collection-log.js` | Prestige score, milestones |
| Profile cosmetics | `js/profile.js` | Slots: dashboard / background / badge / title |
| Styles | `css/styles.css` | Single stylesheet; desk tints via `data-vault-*` |

### Run state (relevant fields)
`portfolio`, `perks`, `staff`, `finance`, `meta`, `vaultOwned`, `vaultSpentTotal`, `vaultPledged`, `salonSpentTotal`, `salonSeenExpired`, `blackMarketOwned`, `blackMarketEquippedRelics`, `seatOwned`, `collectionClaims`, etc.

### Profile (persists across resets)
`name`, `avatar`, `cosmetics` — separate key `stockway_profile_v1`.

---

## 2. Prestige systems overlap (must consolidate in UI)

| Signal | Source | What it means |
|--------|--------|----------------|
| **REP / Rank** | `meta.reputation` + `REP_RANKS` / `repTitle` | Professional respect; gates perks |
| **Collection Prestige** | `getCollectionPrestigeScore()` | Collectible ownership score (numbers in sidebar) |
| **Desk Prestige I–III** | `getVaultDeskAura()` | Equipped vault slots → capped REP on profitable closes |
| **collectionFlair** | Milestone claim | Display title string |
| **Cosmetic title/badge** | Profile cosmetics | Equipped recognition items |
| **Flagship** | `getFlagshipEquippedVaultItem` | Highest-appraisal equipped piece |

**Problem:** Sidebar shows `REP · Prestige N` without clarifying Prestige ≠ Desk Prestige ≠ flair. New players can’t tell systems apart.

**Phase 1 approach:** Do **not** invent Fame or a 4th currency. Consolidate into one labeled **Standing** strip (Rank / Collection score / Desk Prestige / Flair).

---

## 3. Economy context (why Phase 1 sinks matter)

| Band | Approx wealth | Money feeling |
|------|---------------|---------------|
| Early | $500 – ~$5k | Every dollar matters |
| Mid | ~$20k – $160k | Perks + core vault |
| Late | ~$300k – $3M+ | Masterworks / Seat / BM |
| Post-catalog | After ~$12M one-time sinks | Cash piles; payroll/tax can’t drain millions |

**Existing sinks:** perks (~$162k), staff hire/salary, vault ($5k–$1.2M), crowns ($2.5M / $5M), BM (~$1.45M), Seat ($500k), tax, loan interest.  
**Gap:** No recurring late-game optional sink scaled to millions; no office upgrade ladder; no mega-goal UI.

**Note:** Vault books into Net Worth; Seat + BM spend do **not**. Buying power never includes vault (by design).

---

## 4. Dashboard / office visuals today

### Dashboard (`#view-dashboard`)
- Static welcome + 3 goto buttons  
- Challenge rendered **twice** (`#dash-challenge` + `#dash-challenge-detail`) — clutter/duplication  
- 4 KPIs (Cash, Net Worth, Debt, REP)  
- Bare equity canvas + Recent Flips / Firm Snapshot / Best Runs  
- No office tier, no mega goals strip, no standing consolidation  

### Cosmetics application (`applyProfileCosmetics` in `js/ui.js`)
Sets:
- `body[data-vault-bg="…"]`
- `body[data-vault-dashboard="…"]`
- Badge text in `#user-cosmetic-badge`

### CSS skins today (only 8)
Gallery backgrounds: `yachtBackground`, `penthouseNight`, `bullMarble`, `auroraDeck`  
Desk curios: `goldTerminal`, `tungstenDial`, `obsidianTicker`, `glassTickerWall`  

Masterworks / salon crowns / most BM cosmetics have **no** CSS desk effect. BM ids often fail visual resolve because `getProfileCosmeticItem` only looks up vault items.

---

## 5. What Phase 1 should extend (reuse map)

| Feature | Prefer extending | Avoid |
|---------|------------------|-------|
| Prestige clarity | `js/ui.js` sidebar, `js/ui/dashboard.js` | New Fame currency |
| Dashboard hub | `index.html` dashboard markup + `js/ui/dashboard.js` | New nav tab |
| Office tiers | New thin `js/office.js` (data + getters) + `data-office-tier` on body + CSS | Heavy furniture DOM / 3D |
| Mega goals | Data in `js/mega-goals.js` or under `meta.js`; render on dashboard | Separate progression save that can desync |
| Luxury sinks | Catalog + purchase into existing spend ledgers / optional `luxuryOwned[]` | Power that changes BP/margin |
| Collectible lore / sets / museum | Fields on vault/BM items + `collection-log.js` + Collection Log UI mode | Unlock-gated rebuy of owned items |
| Day-end | Light hooks in `day-end.js` (upkeep toast / goal progress) | Parallel settlement engine |

---

## 6. Ordered implementation plan (execute in this order)

### Section 1 — Prestige consolidation
- Single Standing presentation: Rank (REP), Collection Prestige score, Desk Prestige tier, Flair  
- Remove ambiguous “Prestige N” alone in sidebar where possible  
- Fix duplicate challenge on Dashboard (one challenge surface)

### Section 2 — Dashboard evolution
- Make Dashboard the living hub: Standing, active Mega Goal, Office stage name, Firm Snapshot, equity chart  
- Empty states graceful (Day 1 bedroom desk → late empire)  
- Keep Bloomberg×Apple density — no widget spam

### Section 3 — Office progression + visual desk
- Tiers driven by **earned state** (e.g. Net Worth + REP + owned collectibles / office purchases), applied as `data-office-tier="bedroom|studio|…|empire"`  
- CSS-only ambient upgrades (lighting, depth, subtle floor activity) — never noisy  
- Integrate purchase of office upgrades into Dashboard (minimal clicks)  
- Do **not** change margin/BP/slippage/APR

### Section 4 — Late-game money sinks + Mega Goals
- Mega Goals: First Million / Ten Million / Hundred Million / Billion / Legend Trader / Complete Museum / Own Every Legendary / etc. — progress bars on Dashboard  
- Luxury / office upgrades as **optional** cash sinks (prestige + cosmetics + maybe tiny Desk Prestige flavor, hard-capped)  
- Money always has a next goal after crowns

### Section 5 — Collectibles flavor (2A)
- Keep buy paths  
- Add `lore` / set ids / set bonus copy  
- Lightweight museum mode in Collection Log (filter or gallery layout)  
- Set bonuses: cosmetic / flair / tiny capped Desk Prestige only — no mandatory power creep

### Section 6 — Integration & polish
- Wire day-end, Net Worth labeling, empty states, BM cosmetic resolve if cheap  
- Remove dead UI (duplicate challenge; unused glyphs if still dead)

### Section 7 — Full verification
- `npm run test:all`  
- Save/load with old saves  
- No console errors, no clutter, no balance breakage

---

## 7. Immediate risks & mitigations

| Risk | Mitigation |
|------|------------|
| Save `v:2` break | New fields default on load; sanitize clamps; never require new ownership |
| Power creep | Office/luxury = cosmetic + optional tiny capped aura; **no** BP/margin/slippage/APR |
| UI clutter | Deduplicate challenge; fold goals into dashboard; museum = mode not new page |
| Performance | CSS attributes + in-place KPI updates; avoid per-tick full dashboard rebuild |
| Equity vs Net Worth mismatch | Label mega goals / chart using vault-inclusive NW consistently |
| Scope creep into Fame/rivals/staff | Explicitly rejected this pass |

---

## 8. Suggested new state (save-safe sketch — not yet implemented)

```text
state.officeTierId          // string, derived or purchased max tier
state.officeSpentTotal      // number, spend ledger for office upgrades
state.luxuryOwned[]         // string ids
state.luxurySpentTotal      // number
state.meta.megaGoalsClaimed[] // optional claim flags if rewards exist
```

All optional; missing fields = Day-1 defaults. Justify spend ledgers like vault/BM to resist save-edit god mode.

---

## 9. Questions for external analysis (Grok)

1. Is deriving office tier from Net Worth + REP + purchases better than pure purchase ladder for immersion vs balance?  
2. Should mega goals grant cash/REP rewards, or be display-only dreams (safer for economy)?  
3. Set bonuses: pure flair vs +1 Desk Prestige daily cap — which keeps fantasy without power creep?  
4. Should Seat/BM spend eventually book into Net Worth for consistency, or stay prestige-only sinks?  
5. Any missing late-game sink types that fit 1A without new currencies?

---

## 10. Process note for implementer

- Work **section-by-section**; wait for user “continue” between sections unless told otherwise.  
- Before each section: answer 7 questions → minimal sub-plan → Reasoning / Tradeoffs / Files / Risks / Edits → then code.  
- Do **not** edit the original Ultra Collectibles plan file; this handoff is the Phase 1 source of truth for 1A+2A.

---

*End of handoff. Exploration complete; implementation pending confirmation.*
