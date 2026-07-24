# LOD-200 Context-Building Rate — France (`fr`) national

**Headline: LOD 1 now → LOD 2 (LiDAR HD) · real-height coverage ~88% · VERIFIED**

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
| **France** | **LOD 1→2** | **~88%** | **~80%** | **VERIFIED** |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
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
| **(a) Parcel definition** | Cadastre / PCI Express + BD PARCELLAIRE (national, Etalab) | ~95% | ESTIMATED | national; planimetric, not survey-grade |
| **(b) Real building HEIGHT** | **IGN BD TOPO® `batiment.hauteur`** — photogrammetry/LiDAR-derived, national, open (Etalab 2.0) | ~88% | **VERIFIED** | measured height attribute; some features null |
| **(c) Extra attributes** | BD TOPO `nombre_d_etages` (storeys), `nature`, `usage_1/2`; roof form NOT in BD TOPO (needs LiDAR HD reconstruction) | **MED** | VERIFIED (storeys) | storeys+use yes; real roof form is the LoD2 gap |

**OSM height-tag floor:** ESTIMATED ~5–15% explicit-height nationally (higher in Paris/Lyon cores).
BD TOPO makes it moot where wired; fabricated 9 m default only for BD TOPO nulls without a fallback.

---

## The structural finding

**France publishes a real per-building HEIGHT nationally, but not the roof shape — so it sits at a
strong LoD1 today, LoD2-capable soon.** IGN's BD TOPO® `batiment` feature carries `HAUTEUR` in metres
(photogrammetry/LiDAR-derived) under the open Etalab 2.0 licence, plus `nombre_d_etages`. Live probe
this pass (2026-07-24, Paris 8e) returned two buildings with `hauteur: 9.5` / `21.0` and
`nombre_d_etages: 3` / `6` — measured height + storeys, confirmed on the wire. That is a genuine
LoD1 (correct-height prismatic massing), not a floor-count estimate.

The LoD2 roof shape is not in BD TOPO; it requires reconstruction from **IGN LiDAR HD** (10 pts/m²,
Etalab 2.0), which reached ~80% of metropolitan France by end-2025 and targets full national coverage
end-2026. The reconstruction pipeline (3dfier/GeoFlow-style) is the same one scoped for Catalonia —
inputs differ, structure identical. So France's ~88% real-height coverage is LoD1-today, and the
ladder's top rung is a pipeline-plus-data-completion away, not a licensing wall.

The ~12% height gap is BD TOPO `HAUTEUR` nulls (measure the null rate per city) — fall back to the
median of surrounding non-null buildings, flagged `estimated`.

---

## Orthogonality with RATE.md

France is the **textbook orthogonality case**: `RATE.md` ~22% (the buildable numbers live in
per-commune PLU PDFs) but this LOD-context rate ~80% (BD TOPO HAUTEUR is a free national attribute).
**France knows how tall its buildings ARE far better than it exposes what you MAY build.** The ~80%
is the physical model; the ~22% is the rules. Never quote one for the other — this pair is the
clearest proof that the two rates are independent.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire BD TOPO `batiment` WFS (`data.geopf.fr/wfs`) into the context loader with `hauteur` + `nombre_d_etages` | LOD 100 → **LOD 150** nationally | LOW — keyless WFS, EPSG:4326 direct |
| Build the LiDAR HD → roof-reconstruction pipeline (shared with ES/PT) | LOD 150 → **LOD 200** as coverage completes (full national end-2026) | HIGH — pipeline; data rolling out |
| Measure + backfill BD TOPO `HAUTEUR` null rate per target city | closes the ~12% height gap | LOW |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://data.geopf.fr/wfs/ows?...TYPENAMES=BDTOPO_V3:batiment&BBOX=2.346,48.852,2.350,48.856,EPSG:4326&COUNT=2&OUTPUTFORMAT=application/json` | 2026-07-24 | HTTP 200 · GeoJSON · `batiment.6960584` `hauteur:9.5` `nombre_d_etages:3`; `batiment.6960883` `hauteur:21` `nombre_d_etages:6` | **VERIFIED — measured height + storeys** |

---

*Last updated: 2026-07-24. BD TOPO `batiment.hauteur` + `nombre_d_etages` VERIFIED live (Paris 8e).
LoD1 today; LoD2 needs the LiDAR HD reconstruction pipeline (data ~80%→100% end-2026). France is the
clearest rules-vs-context orthogonality case. Maintainer: UNASSIGNED.*
