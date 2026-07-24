# LOD-200 Context-Building Rate — Sweden (`se`) national

**Headline: LOD 1 · real-height coverage ~80% · ESTIMATED (LoD2 is fee-based municipal)**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / `levels`×3.2 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| **Sweden** | **LOD 1** | **~80%** | **~68%** | **ESTIMATED** |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | Lantmäteriet property/building register (INSPIRE BU), CC0 | ~95% | ESTIMATED | national, CC0; account+scope to download |
| **(b) Real building HEIGHT** | **Lantmäteriet national LiDAR** (2009–2019, 0.5–1 pts/m²) → DSM−DTM nDSM per building. LoD2 volumes are a **fee-based municipal** product (Stockholm confirmed) | ~80% | ESTIMATED | free national height via nDSM; no free national LoD2 |
| **(c) Extra attributes** | Building register attributes; no free national roof form | **LOW–MED** | ESTIMATED | Gothenburg/Malmö LoD2 status unverified |

**OSM height-tag floor:** ESTIMATED ~5–15% explicit-height. Free national substitute = CC0 footprints
+ national LiDAR nDSM → LoD1.

---

## The structural finding

**Sweden has the best terrain LiDAR in Europe and CC0 national footprints — but finished LoD2 volumes
are a per-municipality PAID product.** The free, national path is footprint (Lantmäteriet, CC0) +
per-building height from the national LiDAR point cloud (DSM−DTM nDSM) → a genuine LoD1. That is the
safe starting point and the same fallback used for Spain and Switzerland's non-LoD2 gaps.

The LoD2 ceiling is blocked at the source: **Stockholm's 3D LoD2 model is fee-based** (city planning
fee schedule); Gothenburg (first city to deliver a building record to the national NGP) and Malmö are
**unverified** — possibly free, needs a direct portal check. There is no national CityGML LoD2 building
model (unlike Denmark's Danmark i 3D or Germany's LoD2-DE). So Sweden is a strong LoD1 nationally, with
LoD2 only per-city and mostly paid — hence the ~68% headline sitting below the ~80% nDSM height coverage.

---

## Orthogonality with RATE.md

Sweden's buildable-rule digitisation (detaljplaner via the national planing infrastructure) is a
separate axis from this physical-model rate. ~68% here says we can rebuild the existing Swedish
streetscape at LoD1; it says nothing about zoning answerability. Keep the two numbers apart.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire CC0 footprints + national LiDAR nDSM | LOD 100 → **LOD 150** nationally, free | MED — nDSM processing (shared module) |
| Check Gothenburg NGP / portal for free LoD2 (likely most open) | LOD 200 for Gothenburg if free | LOW — one portal check |
| Do NOT pay Stockholm's LoD2 fee for demo/prototype — LoD1 nDSM is enough | — | — (cost avoidance) |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| Lantmäteriet building register / LiDAR; Gothenburg/Malmö portals | — | NOT probed this pass; RESEARCH COMPLETE in `topics/buildings-lod-height.md` | ESTIMATED |

---

*Last updated: 2026-07-24. National CC0 footprints + national LiDAR (free) support LoD1 via nDSM.
LoD2 is fee-based municipal (Stockholm confirmed; Gothenburg/Malmö unverified). No live probe.
Maintainer: UNASSIGNED.*
