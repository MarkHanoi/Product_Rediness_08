# NEXT — L'Hospitalet de Llobregat (INE 08101, Catalonia, Spain)

> **What this file is.** The single place that records **where PRYZM stopped on L'Hospitalet, exactly
> why, and precisely what to do to go further.** Mirrors the Barcelona `NEXT.md` template
> (`../08019-barcelona/NEXT.md` §0).
>
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED. **Status of the city:** ROUTED + WIRED
> (Phase 2), envelope gate CLOSED (`LHOSPITALET_ENVELOPE_VERIFIED = false`) → cited refusal for every
> parcel; heights ESTIMATED (measured MDS join not confirmed for 08101).

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

We WIRED L'Hospitalet as the second Catalan municipality to prove the "add-a-city = data at five
slots" claim (`ENVELOPE-IMPLEMENTATION-PLAN.md` §1 Phase 2). Its parcels route (S2 predicate
`isInLHospitalet`, tested BEFORE `isInBarcelona`), its clau resolves from the same MUC as Barcelona
(S3), and the pack is registered (S5). But we **deliberately stopped at the honesty gate**:
`LHOSPITALET_ENVELOPE_VERIFIED` is `false`, so the dispatcher renders `lhospitaletUnverifiedRefusal`
for every parcel — a cited statement about PRYZM's verification status, never a borrowed Barcelona
number. Flipping the gate is a **legal act, not a code change** (§3.1). Heights are estimated (OSM),
not measured (§3.2).

## 2 — THE NUMBER (what % of clicks get a full envelope, and why exactly that)

**0% full envelope by design, 100% honest.** Every L'Hospitalet click today returns a cited refusal,
not an envelope — because the envelope gate is closed. There is **no measured structured-fill rate**
(no clau audit has been run); stating one would be fabrication (§CONTEXT-DATA-HONESTY). See
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).

## 3 — BLOCKERS (each: what it is · why it blocks · what would unblock it · the exact resume step)

### 3.1 — 🔴 THE HONESTY GATE: `LHOSPITALET_ENVELOPE_VERIFIED = false`
- **What it is.** The pack refuses every parcel until a human verifies L'Hospitalet's parameters.
- **Why it blocks.** "Same instrument (PGM-1976)" is not "same numbers." Each AMB municipality layers
  its own *modificacions puntuals*; the *alçada reguladora* + *ample oficial* tables are Barcelona's
  own. Reusing them here would be a confident mis-citation.
- **What would unblock it** (the rulepack's own checklist, `esLHospitalet.ts`):
  (a) confirm WHICH claus appear in 08101 and each one's rule shape (MUC + the municipal *text refós*
  from Ajuntament de L'Hospitalet); (b) source L'Hospitalet's OWN height / street-width tables —
  Barcelona's do NOT transfer; (c) author an `es-08101-hospitalet` pack (or an explicit per-clau
  equivalence ruling) so any reused geometry is cited to L'Hospitalet; (d) sign
  `sources/VERIFICATION.md` (the L-449 gate).
- **THE EXACT RESUME STEP.** Query the MUC over the L'Hospitalet extent, enumerate the distinct claus,
  and for each decide: does the PGM article state the same construction Barcelona uses, or a municipal
  *modificació*? Record per-clau in a new `sources/VERIFICATION.md`. Do NOT flip the flag to make a
  demo work.

### 3.2 — 🔴 HEIGHTS ARE ESTIMATED, NOT MEASURED
- **What it is.** Context buildings render at an OSM-derived or fabricated 9 m height, not their true
  measured height. See [`HEIGHT.md`](./HEIGHT.md).
- **Why it blocks.** The measured CNIG MDS Edificación (`mdsn_e025`) join is declared for the whole
  `spain` bake region (`heightJoin:'mds'`), but L'Hospitalet is **not** in the `heightSources.mjs`
  per-city ready-bbox list, and per-08101 MDS coverage is **not-queried**.
- **What would unblock it.** Run the H1 coverage probe for 08101; add/confirm a per-08101 MDS bbox in
  the height-join; re-bake. See [`HEIGHT.md`](./HEIGHT.md) §3.
- **Resume step.** [`HEIGHT.md`](./HEIGHT.md) H1→H5.

## 4 — TRIP-WIRES (a finding elsewhere that should send you back here)
- **A per-clau L'Hospitalet *modificació* table** (from the Ajuntament) → unblocks §3.1 for that clau.
- **A verified per-08101 MDS coverage number** (from an H1 probe run anywhere in the ES pipeline) →
  unblocks §3.2.
- **The Barcelona → Spain instrument-equivalence chain** built for any other AMB city → adopt it here;
  L'Hospitalet shares the identical PGM-1976 / MUC / Catastro structure.

## 5 — WHAT IS ALREADY BUILT AND MUST NOT BE REDONE
- **S2 router** `providers/lhospitaletBbox.ts` (`isInLHospitalet`, `LHOSPITALET_BBOX`, tested before
  `isInBarcelona`). ⚠ CONSERVATIVE core box (2.085–2.125 E / 41.335–41.385 N) — it deliberately
  under-covers; it is a proximity gate, NOT full-municipality coverage.
- **S4/S5 pack + registration** `rulepacks/esLHospitalet.ts`, registered in `registry.ts` + `index.ts`.
- **The refusal copy** `lhospitaletUnverifiedRefusal` + `LHOSPITALET_ROADMAP_LINE` (kept beside its
  citation, C60 §3).

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)
| Source | Answers | Tier | Note |
|---|---|---|---|
| Catastro INSPIRE WFS (national) | parcel geometry | VERIFIED (as a PROVIDER; per-08101 dissolve success **not-queried**) | same S1 as Barcelona |
| Generalitat MUC (`sig.gencat.cat/ows/MUC`) | clau at a point | VERIFIED-LIVE (existing provider) | same S3 as Barcelona; per-08101 clau inventory **not-yet-enumerated** |
| CNIG MDS Edificación (`https://wcs-mds.idee.es/mds`, `mdsn_e025`) | measured building height (nDSM) | keyless CC-BY, LIVE (source EXISTS) | per-08101 coverage **not-queried** — see HEIGHT.md |

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
- *(none recorded — no measurement has been run against 08101 yet. Do not infer Barcelona's dead ends
  apply here.)*

## 8 — THE SMALLEST NEXT STEP that moves the number
Enumerate the distinct claus over the L'Hospitalet extent from the MUC (one WFS pass), and for the
most common clau decide whether the PGM article states the same construction Barcelona uses or a local
*modificació*. That one clau, verified and signed, is the first non-refusal answer L'Hospitalet can
give — and the first honest data point for a measured rate.

---

**See also:** [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) · [`ENVELOPE.md`](./ENVELOPE.md) · [`HEIGHT.md`](./HEIGHT.md) ·
[`RISK-REGISTER.md`](./RISK-REGISTER.md) · `../08019-barcelona/NEXT.md` (the pilot template) ·
`packages/site-parcel-data/src/rulepacks/esLHospitalet.ts` (the honesty gate).
