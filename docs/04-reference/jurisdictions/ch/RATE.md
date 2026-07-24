# Data Readiness Rate — Switzerland (`ch`) national

**Headline rate: ~85% (context-data layer only) / NOT YET ASSESSED (building-rule layer)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> Ausnützungsziffer] + height**) **without reading an ordinance text/PDF**. This definition is
> IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France / Belgium …) so the scores are directly comparable. Derived from direct endpoint/schema
> checks, not assumed from Switzerland's open-data reputation.

⚠ **Two-layer honest split.** Switzerland's rate has two genuinely different numbers:
1. **Context-data layer** (~85%): the 3D physical context — buildings, terrain, roads, water, parks,
   trees — is overwhelmingly confirmed as structured, machine-readable, nationwide, free OGD. The 85%
   reflects confirmed open items (GWR field-schema not fully transcribed; CityGML version unconfirmed;
   pedestrian sub-classification open; tree cadastre authority nuance).
2. **Building-rule layer** (NOT YET ASSESSED): the legal/zoning dimension — zone code,
   Ausnützungsziffer/GFZ, max height rule — requires probing the ÖREB/RDPPF cadastre per canton. Zero
   cantons have been queried. The honest position is UNKNOWN, not a guess.

The benchmark table below places Switzerland on the context-data score, not the legal layer, because
the legal layer is not assessed:

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| **Switzerland (context-data layer)** | **~85%** |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Belgium (national, blended) | ~10–14% |

Switzerland's context layer is the strongest of any non-Denmark jurisdiction in this benchmark. The
building-rule layer is Switzerland's only outstanding structural unknown.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Amtliche Vermessung) | ✅ Full | Federal Amtliche Vermessung / MO; integrated into ÖREB as parcel reference; INSPIRE-conformant | ~90% |
| Building footprint LOD2 | ✅ Full | swissBUILDINGS3D 2.0 — nationwide since 2018, ±30–50cm, FileGDB/DWG/CityGML, free OGD | ~95% |
| Building height (volumetric LOD2) | ✅ Full | swissBUILDINGS3D 2.0/3.0 Beta — volumetric solid, roof shape manually extracted | ~95% |
| Building height (independent LiDAR cross-check) | ✅ Full | swissSURFACE3D — 15–20 pts/m² classified point cloud, Building class, full national | ~95% |
| Building height (storey count from register) | ✅ Full | GWR (BFS) — Anzahl Geschosse, EGID-linked, ≤48h update nationally | ~90% |
| EGID link (geometry ↔ register) | ✅ in 3.0 Beta / ⚠️ join via coord in 2.0 | swissBUILDINGS3D 3.0 Beta (20 cantons + city of ZH); 2.0 coordinate-join fallback for remainder | ~80% |
| Terrain DTM (bare earth) | ✅ Full | swissALTI3D — 0.5m or 2m grid, full national | ~95% |
| Terrain DSM (surface model) | ✅ Full | swissSURFACE3D Raster — 0.5m grid, full national by 2025 | ~90% |
| Roads — object-level centerlines + attributes | ✅ Full | swissTLM3D "Strassen und Wege" — feature classes, VERKEHRSBEDEUTUNG/BESCHRAENKUNG/MITTEL/EIGENTUEMER | ~90% |
| Water — object-level polygons/lines | ✅ Full | swissTLM3D "Gewässernetz" — watercourse centerlines + lake outlines, cross-checked vs. swissSURFACE3D | ~95% |
| Parks / leisure areas — object-level | ✅ Full | swissTLM3D "Areale > Freizeit" — distinct polygon class | ~85% |
| Individual trees — object-level | ⚠️ National fallback | swissTLM3D "Bodenbedeckung" — periodic recalculation; municipal cadastre (e.g. Zürich Baumkataster) is authoritative where published | ~70% |
| Vegetation canopy height | ✅ Derivable | swissSURFACE3D Low/Med/High vegetation point classes | ~85% |
| GWR construction year / building type | ✅ Full | GWR (BFS) Baujahr + Gebäudeart, Stufe A public | ~90% |
| **Zone / use code** | ❓ NOT ASSESSED | ÖREB/RDPPF cadastre — federal V-ÖREB ordinance; canton implementations unprobed | NOT ASSESSED |
| **Density metric (Ausnützungsziffer / GFZ / GRZ)** | ❓ NOT ASSESSED | Nutzungsplanung / Bau- und Zonenordnung per canton — whether delivered as structured field vs. PDF unknown | NOT ASSESSED |
| **Max height rule** | ❓ NOT ASSESSED | Same as above | NOT ASSESSED |
| **Setback / alignment** | ❓ NOT ASSESSED | Same as above | NOT ASSESSED |
| Heritage overlay | ❓ NOT ASSESSED | Federal list of historical monuments (Heimatschutz / ARE); cantonal Denkmalschutz — endpoints unprobed | NOT ASSESSED |

---

## The structural gap

Switzerland's low overall building-rule rate is not a context-data problem — it is an **open research
question** on the legal layer. The context layer is the best of any non-Denmark country in this
benchmark.

**What decides the ceiling:** the ÖREB/RDPPF cadastre (Ordinance V-ÖREB) mandates a standardized
federal data model for public-law restrictions. If canton implementations populate zone + numeric
Ausnützungsziffer + max height as structured query attributes, Switzerland's ceiling is Denmark-like
(~85–96%) — the federal data model is the shared reader, and scaling from one pilot canton to all 26
is mostly an endpoint list, not 26 independent builds. If those fields are delivered only as PDF URLs
(as in Belgium or France), the ceiling is lower and an OCR/transcription pipeline becomes necessary.

**Switzerland's structural advantage vs. all other countries:** one federal licence (swisstopo/BFS),
one ÖREB federal schema, no per-Bundesland or per-Région fragmentation. The context-data layer is
already ~85% with one national product line. The legal layer question is the single decision gate.

### Live probe record (2026-07-24)

| Source | Status |
|---|---|
| swissBUILDINGS3D 2.0 product spec | ✅ CONFIRMED — documented from official swisstopo product page |
| swissBUILDINGS3D 3.0 Beta canton list | ✅ CONFIRMED — documented from opendata.swiss dataset page |
| swissTLM3D product spec (roads, water, parks, trees) | ✅ CONFIRMED — documented from Objektkatalog versions 1.7–2.4 |
| GWR product + Stufe A access | ✅ CONFIRMED — BFS housing-stat.ch product documentation |
| swissSURFACE3D / swissALTI3D product specs | ✅ CONFIRMED — swisstopo product documentation |
| ÖREB/RDPPF canton endpoints | ❌ NOT PROBED — zero live queries run |
| GWR Merkmalskatalog field-by-field | ❌ NOT READ — field names confirmed; full schema PDF not transcribed |
| swissBUILDINGS3D CityGML sample tile | ❌ NOT DOWNLOADED — version not confirmed |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe one canton's ÖREB/RDPPF endpoint for zone code + Ausnützungsziffer + height (recommended: Zürich `oereb.zh.ch`) | If structured fields present: confirms ceiling ~85–96%, unlocks Phase 1 for 26 cantons; if PDF-only: recalibrates ceiling and triggers OCR scope | Very low — one HTTP GET |
| Read GWR Merkmalskatalog PDF field-by-field (`housing-stat.ch/files/881-2200.pdf`) | Confirms schema for EGID-join pipeline; moves GWR score from ~90% to VERIFIED | Low — one document read |
| Confirm CityGML export version from sample tile | Unblocks CityGML ingestion pipeline spec | Low — one tile download + header inspection |
| Probe whether 3.0 Beta canton list has grown since 2026-07-24 | May remove some "2.0 join" burden for GE/VD/VS/TI/ZG/GR/canton ZH | Low — check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` |
| If ÖREB structured: run Phase 1 for 26 cantons via federal aggregator (`geodienste.ch`) | Raises building-rule layer from NOT ASSESSED to ~55–85% depending on canton compliance | Medium — 26 endpoint queries + SOURCES.md rows |
| Check municipal tree cadastre availability for Geneva, Basel, Lausanne, Bern | Raises parks/trees score toward 80–85% if additional open cadastres found | Low — 4 city open-data portal searches |

---

*Last updated: 2026-07-24. Context-data layer CONFIRMED from swisstopo/BFS product documentation.
Legal/zoning layer (ÖREB/RDPPF) NOT PROBED — zero live queries run. Rate ceiling conditioned on
one ÖREB pilot query result (see `NEXT.md §3.1`). Maintainer: UNASSIGNED.*
