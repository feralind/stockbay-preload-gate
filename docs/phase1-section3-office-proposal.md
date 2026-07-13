# Section 3 — Office progression + visual desk

**Status:** Implemented (Section 3)  
**Scope:** Purchasable office ladder + `data-office-tier` CSS ambient. No margin/BP/slippage/APR changes.

---

## Exploration

| | |
|--|--|
| **Reuse** | Section 2 `SOFT_OFFICE_STAGES` → real catalog; vault cosmetics pattern (`data-vault-*`); Dashboard `#dash-office-stage`; vault/salon spend+sanitize pattern |
| **Avoid** | Two ladders (soft + purchased); second prestige currency; new office view |
| **Risk** | Auto-tier only skips money sink; loud CSS; save sanitize gaps |

---

## Feature Discipline (7)

1. **Exists?** Soft Preview yes; purchase + visuals no.
2. **Extend?** Yes — promote stages into `js/office.js`, upgrade existing dash card.
3. **Smallest?** Ordered buy + NW/REP gates + body attr + quiet CSS.
4. **Second system?** No if purchased tier alone drives visuals.
5. **Rewrite?** No — additive.
6. **Phase 1 conflict?** No (this is 1A). Still no fame/rivals/staff expansion.
7. **One sentence?** Hit NW+REP gates, pay cash, desk looks richer.

---

## Minimal sub-plan

1. Thin `js/office.js` — catalog, eligibility, purchase, effective tier.
2. Save `officeTierId` + `officeSpentTotal` (sanitize like vault spend).
3. `body[data-office-tier="…"]` beside vault cosmetics.
4. Replace Dashboard Preview with current tier + Upgrade CTA.
5. Quiet CSS ambient per tier.
6. Quality tests (gates, order, afford, save).

**Out:** mega-goal claims (S4), luxury catalog (S4), lore/museum (S5).

---

## Reasoning

Section 2 taught the ladder; Section 3 makes it **earned and paid**. Eligibility (NW+REP) keeps story alignment; cash purchase is the sink without power creep. Visuals stay CSS-only on `data-office-tier`.

**Rules:** start `bedroom` → buy one step at a time → next needs `minNet`+`minRep`+cash → visual = highest purchased → cosmetic only.

**Prices (tunable)**

| Tier | Price |
|------|------:|
| bedroom | $0 |
| studio | $2,000 |
| apartment | $8,000 |
| smallOffice | $25,000 |
| professional | $75,000 |
| tradingFloor | $200,000 |
| executive | $600,000 |
| wallStreet | $2,000,000 |
| hedgeHq | $8,000,000 |
| empire | $25,000,000 |

---

## Tradeoffs

| Choice | Why |
|--------|-----|
| Purchase + gates vs auto-tier | Handoff money sink |
| `data-office-tier` vs canvas | Thin, CSS-first |
| Catalog in `office.js` | Single source of truth |
| Cosmetic-only | No power creep |
| Ordered ladder | Clear progress + sanitize |

---

## Affected files

- **New:** `js/office.js`, `tests/quality/office-progression.test.js`
- `js/ui/dashboard.js`, `js/app.js`, `js/ui.js`, `index.html`, `css/styles.css`

---

## Risks

- Sanitize impossible tier/spend.
- CSS quieter than vault foil.
- No double-bound dash click handlers.
- Cash check only — no finance rule changes.

---

## Exact edits

1. **`js/office.js`** — `OFFICE_TIERS`, getters, `canPurchase` / `purchaseOfficeUpgrade`
2. **`js/app.js`** — defaults, save/load/sanitize, wire purchase
3. **`js/ui/dashboard.js`** — drop Preview; upgrade UX from office helpers
4. **`js/ui.js`** — set `data-office-tier`
5. **`css/styles.css`** — per-tier ambient (lighting/depth; no animation spam)
6. **Tests** — gate/afford/success/order/round-trip

---

## Review knobs

- Prices
- Auto-tier vs purchase (proposal = purchase)
- Tiny Desk Prestige bump vs cosmetic-only (proposal = cosmetic-only)

**Approve to implement.**
