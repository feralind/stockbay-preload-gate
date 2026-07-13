# Section 5 — Implementation plan

**Status:** Complete (Slices A–D shipped)  
**Proposal:** [`phase1-section5-collectibles-proposal.md`](./phase1-section5-collectibles-proposal.md)

---

## Locked knobs (approved)

1. Set claim = **flair only** (no REP, no cash, no Desk Prestige)
2. Short lore blurbs (1–2 sentences)
3. Museum starts on **Log** mode
4. ~4–5 sets with real save ids

---

## Shipped

| Slice | What |
|-------|------|
| A | `js/collection-flavor.js` — lore, 5 sets, progress / claim / sanitize |
| B | `meta.setClaims` / `setFlair`, `getActiveFlair` cascade, sanitize, `onClaimCollectionSet` |
| C | Collection Log **Log \| Museum** toggle, sets strip, owned gallery + lore |
| D | Museum CSS, quality tests, feature audit |

**Flair priority:** mega → luxury → set → collection

**Sets:** Desk Instruments · Painted Horizons · Floor Relics · Crown Wing · Seat of Power

---

## Explicit non-goals (this section)

- Changing vault/BM/salon/seat purchase gates or costs
- Desk Prestige bump from sets
- New nav tab / museum page
- Long dossier lore
- Retuning milestone cash/REP

---

## Verification

- `npm run test:all` — quality + audit + UI smoke green
- Buy paths untouched; save defaults via `createMetaState`; forged set claims stripped on load

---

*Section 5 closed. Wait for Section 6.*
