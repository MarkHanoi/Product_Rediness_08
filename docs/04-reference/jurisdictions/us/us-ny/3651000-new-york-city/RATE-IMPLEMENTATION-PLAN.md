# Rate Implementation Plan — New York City (`us-ny-3651000`) city

**Current rate:** `NOT YET ASSESSED` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling (free, MapPLUTO populated):** `~55–60%` ·
**Realistic ceiling (free, MapPLUTO null):** `~28%` ·
**Realistic ceiling (commercial):** `~65–70%` ·
**Gap to Denmark (~96%):** `~36–68 pts depending on MapPLUTO outcome` ·
**Last updated:** `2026-07-24` · **Owner:** `UNASSIGNED`

---

## 1 — The ceiling: what "maximum" means here

**The single biggest swing factor for the entire US corpus:** MapPLUTO `MaxAllwFAR`.

If `MaxAllwFAR` is populated (the optimistic scenario), NYC has a free structured FAR source
at the parcel level — unique among the three pilot cities. Combined with MapPLUTO zone codes,
Microsoft footprints, NYC 3D building model, and NRHP + NYC Landmarks heritage, the free
ceiling rises to ~55–60% — comparable to the US commercial ceiling for the national average.

If `MaxAllwFAR` is null or unreliable, NYC falls back to the same pattern as Chicago and LA:
zone code free, FAR requires Zoning Resolution table reads or Zoneomics.

**Commercial ceiling: ~65–70%.** The Special Purpose District fraction (especially in Manhattan)
and the air-rights/TDR complexity are the structural limiters. These require individual-lot
legal sourcing that no commercial API resolves.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Probe MapPLUTO `MaxAllwFAR` null rate + ZOLA API + SPDist1 fraction; write RATE.md baseline | The single most important US probe | — → TBD | 0.5 dev-days | NOT STARTED | UNASSIGNED |
| **1a (if MapPLUTO populated)** | Ingest MapPLUTO (zone + FAR + SPD flag) + Microsoft footprints + NYC 3D building model + NRHP + NYC Landmarks | Full free-source pipeline for non-SPD lots | → ~50% | 3–4 dev-days | NOT STARTED | UNASSIGNED |
| **1b (if MapPLUTO null)** | Ingest MapPLUTO zone codes only + Microsoft footprints + NRHP; build Zoning Resolution height district static table | Partial free pipeline | → ~25% | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Map SPD-governed lots; write cited refusals per SPD type | Correct SPD handling — no fabricated FAR for SPD lots | → +2–3% (ceiling clarity) | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Zoneomics for NYC | Height limits + SPD normalisation + bonus FAR handling | → ~65% | 2–3 dev-days + cost | NOT STARTED | UNASSIGNED |
| **4** | Handle TDR / air rights lots — flag and refuse per lot | Correct TDR handling | → ~67–70% (ceiling) | 3–4 dev-days | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) Special Purpose Districts (80+).** Each SPD has individually adopted rules that modify or
supersede the base Zoning Resolution. Even with Zoneomics, SPD parcels may not be correctly
resolved without SPD-specific logic.

**(b) Floor area bonuses and TDR.** NYC's bonus FAR system (inclusionary housing, POPS, subway
improvements) and air rights transfers mean the actual developable FAR for a specific lot is
not deterministic from the zone code alone. A parcel that has purchased air rights from an
adjacent landmark may have substantially more FAR than MapPLUTO shows.

**(c) No national digitisation mandate.** Same as Chicago and LA.

**NYC's unique advantage over Chicago and LA:** if MapPLUTO `MaxAllwFAR` is populated, NYC
approaches the Danish model in concept (structured numeric fields at the parcel level, freely
queryable) even if not in completeness. The quality of NYC's open data is structurally superior
to any other US city studied.

---

## 4 — Dependencies and blockers

- Phase 0 (MapPLUTO probe) is the prerequisite for everything — costs 0.5 dev-days and
  resolves the ~30 pt range in the ceiling estimate.
- Do Chicago and LA Phase 0 first, in sequence — the methodology transfers directly.
- NYC 3D building model confirmation (free + current) enables Phase 1a LOD2 context at no
  additional cost.

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona** `../../../es/es-ct/08019-barcelona/` (pilot climb).*
