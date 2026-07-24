# Rate Implementation Plan — Chicago (`us-il-1714000`) city

**Current rate:** `NOT YET ASSESSED` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling (free):** `~30%` · **Realistic ceiling (commercial):** `~65–70%` ·
**Gap to Denmark (~96%):** `~66–96 pts depending on source basis` ·
**Last updated:** `2026-07-24` · **Owner:** `UNASSIGNED`

---

## 1 — The ceiling: what "maximum" means here

**Free ceiling: ~30%.** Building footprint (Microsoft, near-complete), modelled height
(Overture/USGS pilot confirmed), NRHP heritage (~75%), Chicago landmarks layer, and zone codes
from the city open-data portal — but FAR/height limits are in ordinance text/PDF unless the
city portal includes numeric attributes (unconfirmed). PD-governed parcels have no automated
answer and must refuse.

**Commercial ceiling: ~65–70%.** Zoneomics resolves zone + FAR + height for non-PD zones.
Regrid provides parcel routing. The Planned Development fraction (unknown, possibly 20–30% of
downtown parcels by area) is the primary ceiling limiter — PD parcels require individual
ordinance reads. This is the Chicago equivalent of Germany's §34 fraction.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Live probe: Chicago zoning open-data dataset + Overture height + NRHP; write RATE.md baseline | Honest rate | — → TBD | 0.5 dev-days | NOT STARTED | UNASSIGNED |
| **1** | Ingest Microsoft footprints + Overture/USGS heights for Chicago bbox | Building context LOD1 + partial height | → ~20% | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Ingest Chicago open zoning layer (zone codes; numeric if present) + NRHP + city landmarks | Free zoning context + heritage | → ~28–30% (ceiling if no numeric) | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Zoneomics for Chicago | FAR + height for non-PD zones | → ~60% | 2–3 dev-days + cost | NOT STARTED | UNASSIGNED |
| **4** | Map and flag PD-governed parcels; write cited refusals per PD | Correct PD handling; no fabricated envelope | → ~65% (ceiling) | 2–3 dev-days | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) No structured national mandate.** Chicago's FAR/height rules live in Title 17 ordinance
tables — PDF/HTML text, not a structured API field.

**(b) Planned Developments.** PDs are Chicago's structural analogue to Germany's §34 — parcels
with no simple numeric rule. The correct answer is a cited refusal, not a gap.

**(c) Commercial dependency.** Zoneomics is required for numeric attributes (FAR, height) in
the non-PD zones. A government-provided equivalent does not exist.

---

## 4 — Dependencies and blockers

- Phase 0 probe unblocks everything — do this first.
- Phase 3 (Zoneomics) requires a contract; evaluate trial API before committing.
- Phase 4 (PD mapping) requires finding the Chicago PD boundary layer on `data.cityofchicago.org`.

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona** `../../../es/es-ct/08019-barcelona/` (pilot climb).*
