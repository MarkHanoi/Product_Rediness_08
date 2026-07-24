# LOD-200 Context-Building Rate — Portugal (`pt`) national

**Headline: LOD 1 · real-height coverage ~75% · ESTIMATED — PARCEL is the weak metric**

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
| **LOD 150 (LoD1)** | footprint + **real measured** height (LiDAR nDSM) | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| **Portugal** | **LOD 1** | **~75%** | **~42%** | **ESTIMATED** |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

⚠ **Portugal inverts Spain: real HEIGHT is good (~75%, national LiDAR) but PARCEL is the weak metric.**
The Carta Cadastral covers only ~134 municipalities — and **NOT the Lisbon/Porto city cores**. The
headline (~42%) is dragged down by parcel, not height — the opposite drag from Spain.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | **Carta Cadastral** (NIC, DL 72/2023, SNIC/DGT) — but only **~134 munis**, converted from CGPR (rural) + SiNErGIC pilots; **NOT city cores** | **~35%** | ESTIMATED | THE weak metric; check per-municipality; fallback OSM/Overture (approximation) |
| **(b) Real building HEIGHT** | **DGT national LiDAR** — Apr 2024–Mar 2025, 10 pts/m², DTM 50 cm / DSM 2 m, open, ~90% continental. nDSM = DSM−DTM, 90th-pctile per footprint | **~75%** | ESTIMATED | single-source (no floor-count cross-check); no published RMSE-Z |
| **(c) Extra attributes** | **Lisbon CML 3D model** (LoD2/3-ish: balconies, setback faces) — municipal exception. Elsewhere none; **no national floor-count** | **LOW** (HIGH in Lisbon) | ESTIMATED | Lisbon licence UNVERIFIED |

**OSM height-tag floor:** ESTIMATED ~5–12% explicit-height; OSM/Overture footprints are the national
footprint baseline (Portugal has no national footprint dataset).

---

## The structural finding

**Portugal has a genuinely good national building HEIGHT source but a weak PARCEL base and no national
footprint layer — the reverse of Spain.** DGT's national LiDAR (flown 2024–25, 10 pts/m², open "sem
qualquer tipo de restrição", ~90% continental) supports a real measured height via nDSM (DSM−DTM,
90th-percentile) — the same method as Spain, sharing the same nDSM module. That gives ~75% real-height
coverage, a genuine LoD1.

But two things drag the headline to ~42%. First, **parcels**: the Carta Cadastral (new under DL 72/2023)
covers only ~134 municipalities, built from rural CGPR + 7 SiNErGIC pilots — and explicitly **not the
Lisbon/Porto urban cores**, which fall back to municipal PDM cartography or an OSM/Overture footprint
proxy (badged approximation). Second, height is **single-source**: unlike Spain there is no Catastro
floor-count to cross-check against, so the LiDAR height stands alone with a lower confidence ceiling,
and DGT has not published an RMSE-Z figure (do not quote parity with PNOA's ~10 cm). The one bright
spot is **Lisbon's CML 3D model** (LoD2/3-ish, with balconies and setback faces) — a municipal
exception, licence unverified.

Everything here is per founder deep-dive and **NOT live-probed this pass** — all ESTIMATED.

---

## Orthogonality with RATE.md

Portugal is a *separate jurisdiction* (PDM ≠ PGOU; DGT/SNIG infrastructure) with its own rule-rate
question. This context ~42% is the physical model; it is independent of buildable-rule answerability.
Note the parcel weakness would also constrain a rule pack (no parcel-select in city cores) — but the
two rates remain distinct axes.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire DGT LiDAR nDSM (shared module with ES/FR) | LOD 100 → **LOD 150** for the ~75% covered | MED — shared nDSM |
| Resolve parcel coverage per-municipality; adopt Lisbon PDM cartography for the core | raises (a) in cities | MED — per-muni check |
| Ingest Lisbon CML 3D model (licence TBV) | **LoD2/3** in Lisbon | MED — licence |
| Request DGT's formal accuracy spec (RMSE-Z) | confidence, not coverage | LOW |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| DGT CDD LiDAR · Carta Cadastral · Lisbon CML | — | NOT probed this pass (all per founder deep-dive) | ESTIMATED |

---

*Last updated: 2026-07-24. All ESTIMATED (no live probe). DGT national LiDAR gives good LoD1 height
(~75%, single-source, no RMSE-Z); Carta Cadastral parcels cover ~134 munis, NOT city cores — the weak
metric. Lisbon CML LoD2/3 exception. Maintainer: UNASSIGNED.*
