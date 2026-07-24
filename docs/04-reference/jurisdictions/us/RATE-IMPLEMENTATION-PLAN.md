# Rate Implementation Plan — USA (`us`) national

**Current rate:** `~12% (free sources)` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling (free only):** `~28–30%` ·
**Realistic ceiling (commercial):** `~75–80%` ·
**Gap to Denmark (~96%):** `~84 pts (free) / ~41 pts (commercial)` ·
**Last updated:** `2026-07-24` · **Owner:** `UNASSIGNED`

---

## 1 — The ceiling: what "maximum" means here

**Free-only ceiling: ~28–30%.** Achievable by combining Microsoft building footprints (~90%
coverage), USGS 3DEP-derived modelled heights (~50% with processing effort), NRHP heritage
(~75%), and city-by-city zoning layer harvesting for major metro areas (zone codes, but numeric
FAR/height absent from most free portals). The zoning ceiling is capped by the ~33,000-
jurisdiction fragmentation — no free national numeric zoning API exists and is not expected
from government sources. Even with aggressive city-portal harvesting, the ~30% ceiling holds
because only zone codes (not FAR/height/setbacks) are typically available free.

**Commercial ceiling: ~75–80%.** Achievable with Zoneomics (zone + FAR + height for 20,000+
cities) + Regrid (parcel routing for 99% of Americans) + Microsoft footprints + Overture/USGS
heights, assuming Zoneomics numeric fields (FAR, height) are populated for covered cities.
The remaining ~20–25% gap to Denmark (~96%) is structurally hard: ~13,000 jurisdictions
outside Zoneomics coverage, non-conforming uses with no numeric rule, unzoned rural territory,
and no national digitisation mandate to close those gaps.

**Denmark (~96%) for the US:** not achievable without either a government-mandated national
digitisation programme (does not exist) or a fully automated ordinance-reading pipeline across
~33,000 jurisdictions (NZA says is not yet reliable). The structural fragmentation is the
hard ceiling.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — probe Chicago open zoning portal + Overture height for Chicago bbox + NRHP endpoint; write RATE.md | The honest free-source baseline | — → `~12%` | 1–2 dev-days | VERIFIED (research; no live probes) | UNASSIGNED |
| **1a** | Ingest Microsoft Building Footprints for three pilot cities + join Overture/USGS heights | Building context LOD1 with height for Chicago/LA/NYC | `~12%` → `~20%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1b** | Harvest city open-data zoning layers (Chicago, LA, NYC) — zone codes + any free numeric attributes | Free zoning coverage for the three pilot cities | `~20%` → `~22%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1c** | Ingest NRHP ArcGIS feature service + NRIS join | Heritage overlay for all US parcels | `~22%` → `~25%` | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Contract + integrate Zoneomics API for Chicago, LA, NYC (then expand) | Numeric FAR + height + use code for covered cities | `~25%` → `~55%` | 3–5 dev-days (integration); cost TBD | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Regrid parcel API — jurisdiction routing + parcel context | Parcel-level routing for all US queries; parcel geometry for counties without free portal | `~55%` → `~65%` | 3–4 dev-days; cost TBD | NOT STARTED | UNASSIGNED |
| **4** | 3DEP nDSM pipeline — derive building heights from USGS LiDAR for footprints Overture does not cover | Height coverage climbs from 15% toward 50% | `~65%` → `~70%` | 5–7 dev-days (point-cloud pipeline) | NOT STARTED | UNASSIGNED |
| **5** | Expand Zoneomics + Regrid to full national coverage; harvest Mercatus/NZA partner states | Raises coverage toward commercial ceiling | `~70%` → `~75%` (ceiling) | Ongoing | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Three structural factors separate the US from the 96% ceiling model:

**(a) No national zoning digitisation mandate.** Denmark's Plandata.dk delivers structured
zone + numeric density + height as machine-readable fields for all Danish municipalities —
there is no US equivalent and no federal legislation to create one. ~33,000 jurisdictions,
each with its own ordinance, means a Plandata-equivalent would require 33,000 separate
ingestion agreements or one commercial aggregator (Zoneomics) that still covers only 60% of
jurisdictions.

**(b) Commercial dependency.** The US path to 55–65% runs entirely through paid commercial
APIs (Zoneomics, Regrid). This is a different kind of risk than Denmark's government-mandate
risk — it is a vendor risk. If Zoneomics pricing changes, coverage updates, or the company is
acquired, the rate can change without any code change. A government-mandated free source does
not carry this risk.

**(c) ~13,000 uncovered jurisdictions.** Even with Zoneomics at its current 20,000-city
coverage, ~13,000 small municipalities, unincorporated counties, and rural jurisdictions
remain outside any commercial aggregator's coverage. Serving these requires either per-
ordinance reading (high cost, low scalability) or structured refusal (honest but lowers the
ceiling). This is the equivalent of Germany's §34 floor — structurally no numeric answer,
not a data gap.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Zoneomics contract:** Phase 2 is blocked until a Zoneomics trial/contract is in place.
  Probe the trial API before committing to the integration — verify FAR/height null rates.
- **Regrid contract or MCP evaluation:** Phase 3 is blocked on the same. Evaluate the Regrid
  MCP server (AI-native parcel access) — if it works, it may replace a custom API integration.
- **3DEP pipeline (Phase 4):** the nDSM pipeline built here reuses for any other jurisdiction
  using USGS LiDAR (none in the current corpus; but France's LiDAR HD pipeline is structurally
  identical — reuse the nDSM adapter, swap the tile source).
- **Microsoft footprints ingestion (Phase 1a):** the ODbL footprint ingestion pattern reuses
  directly for Overture Maps integration (same licence, similar format). Build once, parameterise
  tile source.
- **City-portal harvesting (Phase 1b):** no cross-jurisdiction reuse — each city's open-data
  portal has a different schema. Document schema per city in the city-level SOURCES.md. Do not
  assume field name portability.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb). Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve),
**L-449** (human-verification gate).*
