# Section 5 — Collectibles flavor (lore / museum / set bonuses)

**Status:** Complete (Slices A–D shipped)  
**Scope:** Keep existing buy paths. Add lore + set ids, lightweight Museum mode in Collection Log, set bonuses as cosmetic/flair only. No margin/BP/slippage/APR. No unlock-then-claim rebuy.

---

## Exploration

| | |
|--|--|
| **Reuse** | `getCollectionLogEntries` / milestones / hunt; Collection Log filters + foil cards; Standing flair; S4 claim pattern (flair-only) |
| **Avoid** | New Collection page/tab; second prestige currency; Desk Prestige stacking (S4 already said no); changing vault/BM purchase economy |
| **Risk** | Card spam / wall of lore; set bonuses that feel like power; rewriting every item object vs external lore/set maps |

---

## Feature Discipline (7)

1. **Exists?** Collection Log + milestones + hunt yes. Lore / sets / museum mode **no**.
2. **Extend?** Yes — data maps + Collection Log UI mode; leave Vault/BM/Salon buy paths untouched.
3. **Smallest?** External `lore` + `setId` maps, 3–5 sets, Museum toggle (gallery of owned + lore), set complete → flair only.
4. **Second system?** No if sets are read-only groupings over existing owned ids (not a new shop).
5. **Rewrite?** No — additive fields on log entries + UI mode.
6. **Phase 1 conflict?** No (this is 2A). Still no fame/rivals/staff; no buy-path rework.
7. **One sentence?** Own pieces, read their lore in Museum mode, finish a set for a flair — nothing that changes how you trade.

---

## Minimal sub-plan

1. Thin **`js/collection-flavor.js`** (or extend `collection-log.js`) — `LORE_BY_ID`, `COLLECTION_SETS` (id, name, memberIds[], flair, blurb).
2. Enrich log entries with `lore` + `setId` / set name (display-only).
3. Collection Log: **Log | Museum** mode toggle — Museum = owned-first gallery, larger plate, lore blurb, set chip.
4. Sets strip: progress `owned/total` per set; complete → optional **Claim flair** (no REP, no cash) — same discipline as mega goals.
5. Wire Standing to prefer set flair only if claimed (fit into existing flair priority: mega → luxury → **set** → collection).
6. Tests: entry enrichment, set progress, claim once, forge sanitize; feature audit.

**Out:** Buy-path changes; Desk Prestige from sets (default off); Section 6 polish/BM cosmetic resolve.

---

## Reasoning

Collection already tracks ownership and milestones. Section 5 should make owned pieces **feel like a museum** without inventing a second economy.

**Lore** — short flavor strings keyed by item id (vault / salon / BM / seat). Prefer a parallel map so save keys stay stable and catalogs stay thin.

**Sets (sketch, ~4–5)**

| Set | Members (sketch) | Flair when claimed |
|-----|------------------|--------------------|
| Desk Instruments | goldTerminal, tungstenDial, obsidianTicker, … | Instrument Desk |
| Painted Horizons | yachtBackground, penthouseNight, bullMarble, … | Horizon Gallery |
| Floor Relics | BM legendaries subset | Relic Floor |
| Crown Provenance | salon crowns | Crown Wing |
| Seat of Power | theSeat + optional companion | (or skip if too thin) |

**Museum mode** — not a new nav item: toggle on existing Collection Log. Gallery emphasizes owned plates + lore; missing stays available via Log/filters.

**Set bonuses (recommended)** — **flair claim only** when set complete (aligns with S4: no REP from fantasy systems). Desk Prestige bump = **off** (review knob).

---

## Tradeoffs

| Choice | Why |
|--------|-----|
| Lore/set maps vs mutate every catalog object | Safer ids; less churn on vault/BM |
| Museum mode vs new page | Handoff: mode not new page |
| Flair-only set claim vs Desk Prestige +1 | Matches S4; avoids aura stacking |
| 4–5 sets vs many tiny sets | Readable progress, less UI noise |
| Keep milestone cash/REP as-is | Already shipped; don’t retune economy here |

---

## Affected files (planned)

- **New:** `js/collection-flavor.js` (lore + sets + claim/sanitize helpers)
- `js/collection-log.js` — enrich entries; optional set progress helpers
- `js/ui/collection-log.js` — Log/Museum toggle, lore, sets strip
- `js/meta.js` / Standing — `setFlair` in flair cascade
- `js/app.js` + `js/save-sanitize.js` — `meta.setClaims` / `setFlair`
- `css/styles.css` — museum gallery density (quiet)
- `scripts/quality-tests.cjs`, `scripts/feature-audit.cjs`

---

## Risks

- Lore walls → keep blurbs to ~1–2 sentences.
- Set member lists must use real save ids; sanitize forged set claims against owned members.
- Don’t break foil art / filters when switching modes.
- Flair cascade must stay deterministic (mega → luxury → set → collection).

---

## Exact edits

1. **`collection-flavor.js`** — `LORE_BY_ID`, `COLLECTION_SETS`, `getSetProgress`, `canClaimSet` / `claimSetFlair`, `sanitizeSetClaims`
2. **`collection-log.js`** — attach lore/set on entries (or UI joins maps)
3. **Collection Log UI** — mode toggle; museum card with lore; sets progress + Claim flair
4. **meta / Standing** — `setFlair` + sanitize
5. **Tests** — progress, claim once, forge strip, entry fields present

---

## Review knobs

1. Set claim payoff: **flair only** (proposal) vs tiny Desk Prestige bump  
2. Set count / membership lists  
3. Lore depth: short blurbs (proposal) vs longer dossiers  
4. Museum default: start on **Log** (proposal) vs Museum if any owned  

**Approve (or tweak knobs) to implement.**
