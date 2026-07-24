# Rate Implementation Plan — Los Angeles (`us-ca-0644000`) city

**Current rate:** `NOT YET ASSESSED` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling (free):** `~35%` · **Realistic ceiling (commercial):** `~60–65%` ·
**Gap to Denmark (~96%):** `~61–96 pts depending on source basis` ·
**Last updated:** `2026-07-24` · **Owner:** `UNASSIGNED`

---

## 1 — The ceiling: what "maximum" means here

**Free ceiling: ~35%.** Slightly higher than the national US free average because LA's
height-district suffix system allows FAR/height derivation from a static lookup table
(once LAMC §12.21.1 tables are read), partially bypassing the ordinance-PDF dependency.
Building footprints (Microsoft), modelled height (LARIAC if confirmed free), NRHP heritage.
Specific Plans and Coastal Zone parcels cannot be automated from free sources.

**Commercial ceiling: ~60–65%.** Lower than Chicago's commercial ceiling because:
(1) Specific Plans cover a larger fraction of LA parcels than Chicago PDs;
(2) Coastal Commission overlay adds a non-automatable second authority layer;
(3) Q-conditions (parcel-specific zoning modifications) are not captured in any commercial API.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Live probe: `geohub.lacity.org` zoning layer + LAMC §12.21.1 height district table read; write RATE.md baseline | Honest rate | — → TBD | 0.5–1 dev-day | NOT STARTED | UNASSIGNED |
| **1** | Build static height-district lookup (zone × height-district → FAR + max height) from LAMC §12.21.1 | FAR + height without Zoneomics for base zones | → ~30% | 1 dev-day | NOT STARTED | UNASSIGNED |
| **2** | Ingest Microsoft footprints + LARIAC/Overture heights + NRHP | Building context + heritage | → ~35% (free ceiling) | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Zoneomics for LA | FAR + height confirmation for non-SP zones; Q-condition flagging | → ~55% | 2–3 dev-days + cost | NOT STARTED | UNASSIGNED |
| **4** | Map Specific Plan areas + Coastal Zone boundary; write cited refusals | Correct SP/CCC handling | → ~60–65% (ceiling) | 2–3 dev-days | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) Specific Plans and Q-conditions.** Non-standard development parameters not derivable from
zone code or commercial APIs. Correct answer: cited refusal.

**(b) California Coastal Commission.** A second legal authority layer for Coastal Zone parcels —
no commercial API resolves CCC development standards.

**(c) No national digitisation mandate.** Same as Chicago and the US national ceiling.

---

## 4 — Dependencies and blockers

- Do Chicago Phase 0 first — the probe methodology transfers directly to LA.
- LAMC §12.21.1 static table is a pre-requisite for Phase 1 and is independent of Chicago.
- LARIAC confirmation (free vs. paid) determines whether Phase 2 height coverage is stronger
  than the national Overture estimate.

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona** `../../../es/es-ct/08019-barcelona/` (pilot climb).*
