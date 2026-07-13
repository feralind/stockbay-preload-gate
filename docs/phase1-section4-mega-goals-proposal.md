# Section 4 — Late-game money sinks + Mega Goals

**Status:** Implemented (Section 4)  
**Scope:** Full mega-goal catalog on Dashboard + optional luxury cash sinks. No margin/BP/slippage/APR. Office ladder already owns progression sinks (S3).

**Approved refinements applied:** claims = flair only (no REP); Desk Prestige bump off; luxury not in Net Worth; active order NW → Office → REP → Collection.

---

## Exploration

| | |
|--|--|
| **Reuse** | `#dash-mega-goal` + `getNextNetWorthMilestone` preview; Standing / Collection milestones claim pattern; office spend ledger; vault Desk Prestige (do not restack power) |
| **Avoid** | Second goal UI page; cash mega-rewards that print money; luxury that changes BP/margin; duplicating Vault cosmetics as a second equip system |
| **Risk** | Goal spam on Dashboard; claim economy inflation; luxury overlapping Salon/Vault fantasy |

---

## Feature Discipline (7)

1. **Exists?** NW dream progress bar yes (preview). Full mega catalog, claims, luxury sinks **no**.
2. **Extend?** Yes — replace preview catalog with `js/mega-goals.js`; add thin `js/luxury.js`; wire existing dash cards.
3. **Smallest?** One active mega goal on dash + optional claim; ~6 luxury buys with spend ledger; no new view.
4. **Second system?** No if mega goals are progress/claim only and luxury is cosmetic ownership (not a parallel vault).
5. **Rewrite?** No — swap preview helpers; additive state fields.
6. **Phase 1 conflict?** No (this is 1A). Museum lore stays Section 5.
7. **One sentence?** Chase the next dream goal on the Dashboard, and optionally burn late cash on luxury that only looks rich.

---

## Minimal sub-plan

1. **`js/mega-goals.js`** — catalog (NW + REP + office + collection checks); `getActiveMegaGoal(state, ctx)`; optional claim.
2. Replace dashboard `NW_MILESTONES` / preview copy with mega-goal resolver + Claim CTA when complete.
3. **`js/luxury.js`** — small catalog; `purchaseLuxury`; `luxuryOwned[]` + `luxurySpentTotal` sanitize.
4. Surface next luxury on Dashboard (under Office or slim row) — one Upgrade-style CTA, not a shop page.
5. Quiet cosmetic only (flair / optional `data-luxury`); **no** Desk Prestige bump in default plan.
6. Tests: progress, claim once, forge sanitize, luxury afford/order.

**Out:** Collection lore/museum/set bonuses (S5); fame/rivals/staff; finance rule changes.

---

## Reasoning

Section 2–3 already give the desk a ladder and a NW preview. Section 4 should make **money always have a next dream** (mega goals) and a **voluntary late-game burn** (luxury) without printing cash or stacking combat power.

**Mega goals (recommended)**
- Single **active** goal on `#dash-mega-goal` (next incomplete by priority) — progress bar stays.
- Catalog mix (vault-inclusive NW where relevant):

| id | Label | Kind | Target (sketch) |
|----|-------|------|-----------------|
| nw1k … nw1b | First $1k → Billion | `netWorth` | same thresholds as S2 |
| legendDesk | Legend Trader | `reputation` | 2000 REP (or Elite Desk gate) |
| officeEmpire | Empire Desk | `office` | `officeTierId === 'empire'` |
| collectionHalf | Half the Museum | `collectionPct` | 50% |
| collectionFull | Complete Museum | `collectionPct` | 100% |
| everyLegendary | Own Every Legendary | `legendaryOwned` | all BM+vault legendaries |

- **Claims:** optional — tiny **REP only** (e.g. 5–25) + optional flair string; **no cash**. Sanitize like collection claims. Display-only is the safer alternate (review knob).

**Luxury sinks (recommended)**
- ~6 optional one-shot buys (examples): Corner Suite Art · Private Screening · Harbor Slip · Skyline Lease · Founders’ Gallery · Dynasty Wing.
- Prices ~$100k → ~$25M (tunable); cash only; spend ledger.
- Rewards: ownership + Standing/flair chip and/or quiet `data-luxury` ambient — **cosmetic-only** (default). Tiny Desk Prestige (+1 daily cap, hard global) is an opt-in review knob, off by default to avoid aura stacking.

---

## Tradeoffs

| Choice | Why |
|--------|-----|
| One active mega goal vs full list UI | Keeps dash clean (Bloomberg×Apple density) |
| REP/flair claim vs display-only | Light payoff without cash inflation |
| Luxury ≠ Vault equip slots | Avoid second cosmetics system |
| Cosmetic luxury vs Desk Prestige bump | Safer; Prestige already exists via vault |
| Collection-tied mega goals now vs wait for S5 | Progress metrics exist today; museum *flavor* still S5 |

---

## Affected files (planned)

- **New:** `js/mega-goals.js`, `js/luxury.js`, quality tests
- `js/ui/dashboard.js` — mega card + luxury CTA
- `js/app.js` — state, save/load, claim/purchase handlers
- `js/save-sanitize.js` — luxury ledger + mega claim flags
- `js/meta.js` — `megaGoalsClaimed[]` (or under state root)
- `js/ui.js` — optional `data-luxury` attribute
- `css/styles.css` — quiet luxury ambient (if used)
- `scripts/feature-audit.cjs`

---

## Risks

- Goal kinds that need collection/BM data must stay read-only and cheap on render.
- Claim forge → sanitize against earned progress only.
- Luxury spend forge → strip owned ids like vault.
- Don’t let luxury book into Net Worth unless we explicitly decide (proposal: **prestige sink only**, like Seat — not vault book).
- UI: one CTA each — no widget spam.

---

## Exact edits

1. **`js/mega-goals.js`** — `MEGA_GOALS`, progress helpers, `getActiveMegaGoal`, `canClaimMegaGoal` / `claimMegaGoal`
2. **`js/luxury.js`** — `LUXURY_ITEMS`, purchase + sanitize
3. **Dashboard** — drop “preview ladder” copy; show active mega goal + Claim; show next luxury buy when relevant
4. **`app.js` / sanitize** — `luxuryOwned`, `luxurySpentTotal`, `megaGoalsClaimed`
5. **Tests** — active goal selection, claim once, luxury buy, sanitize forgeries

---

## Review knobs

1. Mega claims: **REP+flair** (proposal) vs **display-only**
2. Luxury Desk Prestige bump: **off** (proposal) vs **+1 daily cap hard-capped**
3. Luxury books into Net Worth: **no** (proposal) vs yes
4. Catalog size / prices

**Approve (or tweak knobs) to implement.**
