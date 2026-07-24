# LOD-200 Context-Building Rate — Belgium (`be`) national (blended)

**Headline: LOD 1 · real-height coverage ~55% · ESTIMATED (Flanders strong; Wallonia/Brussels unknown)**

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
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| **Belgium** | **LOD 1** | **~55%** | **~48%** | **ESTIMATED** |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

⚠ **A blended national number hides a three-region split.** Flanders (3D GRB LoD1 + DHMV) is a solid
LoD1; Wallonia (PICC) and Brussels (UrbIS) are footprint-confirmed but height-unknown. The ~48% is a
population-weighted blend, not a uniform national capability.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | **CADMAP** federal building/parcel sublayer (AGDP), national WFS — endpoint LIVE | ~90% | ESTIMATED (endpoint live) | one national footprint layer across all three regions |
| **(b) Real building HEIGHT** | **Flanders: 3D GRB Gebouw LoD1 DHMV II** (block model + ridge height, free). Wallonia/Brussels: height UNKNOWN. Fallback: DHMV/Wallonia LiDAR nDSM | ~55% | ESTIMATED | Flanders good; other two regions unprobed |
| **(c) Extra attributes** | flat-topped block model only; **no LoD2 anywhere in Belgium** | **LOW** | ESTIMATED | no roof geometry product confirmed |

**OSM height-tag floor:** ESTIMATED ~5–15% explicit-height. CADMAP federal footprints give national
LOD 100 base; height only structured in Flanders.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Binding
metric = the 3D number. Belgium is a three-region blend, not a uniform national capability.

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | CADMAP federal (national) + Overture/MS | **~90%** | ESTIMATED (endpoint live) |
| **Height (3D)** | conf tier **1** Flanders 3D GRB LoD1 DHMV II; conf tier **4** Wallonia (PICC) + Brussels (UrbIS) — height UNKNOWN | **~55%** | ESTIMATED (three-region blend) |

**Building-TYPE:** Belgian fabric ★★★. The 3D drag is the three-region schema split (GRB/PICC/UrbIS),
not type accuracy. No LoD2 anywhere. Probe Brussels/Wallonia height fields to close the blend.

## The structural finding

**Belgium is three separate systems with no shared schema and no LoD2 anywhere.** Building footprints
are national via the federal CADMAP sublayer (endpoint confirmed live; height attribute not yet probed).
Real height exists only in **Flanders**: the `3D GRB — Gebouw LoD1 DHMV II` block model carries an
approximate ridge height derived from the DHMV II LiDAR terrain model — a genuine LoD1, free
("kosteloos"). **Wallonia (PICC)** and **Brussels (UrbIS)** have footprint layers whose height/schema
are unconfirmed, and Brussels has no confirmed standing LiDAR programme.

Integration effort is HIGH precisely because it is three adapters, not one: unlike Germany (one CityGML
schema, 16 addresses) or France (one IGN schema, one address), Belgium needs GRB + PICC + UrbIS as
distinct schemas. No LoD2 building model is confirmed anywhere in Belgium — Flanders' product is a
flat-topped block, not roof geometry. Hence a strong LoD1 in the north, footprint-only-until-probed
elsewhere, and the ~48% national blend.

---

## Orthogonality with RATE.md

Belgium's `RATE.md` is ~10–14% (blended; buildable rules per-region). Its context ~48% is higher but
equally region-fragmented. Both rates are dragged by the three-region structure — but they remain
independent axes. ~48% is the physical model, not zoning answerability.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Probe CADMAP building sublayer for a height attribute (lowest-effort, national) | may lift height coverage nationally | LOW — one GetFeature |
| Wire Flanders 3D GRB LoD1 DHMV II | LOD 100 → **LOD 150** in Flanders | MED |
| Probe PICC (Wallonia) + UrbIS (Brussels) for height fields | closes the two unknown regions | MED — two adapters |
| Wallonia/Brussels LiDAR nDSM fallback where no height attribute | LOD 150 in the south | HIGH |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| CADMAP federal WFS (`ccff02.minfin.fgov.be/geoservices/.../CP/MapServer`) | prior (endpoint LIVE per topic doc) | endpoint live; height attribute NOT probed | ESTIMATED |
| 3D GRB / PICC / UrbIS | — | NOT probed this pass | ESTIMATED |

---

*Last updated: 2026-07-24. CADMAP national footprint endpoint live (height attr unprobed). Flanders 3D
GRB LoD1 + DHMV = real LoD1; Wallonia/Brussels height unknown. No LoD2 anywhere. ~48% is a three-region
blend, not uniform. Maintainer: UNASSIGNED.*
