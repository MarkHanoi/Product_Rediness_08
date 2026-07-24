# LOD-200 Context-Building Rate — Denmark (`dk`) national

**Headline: LOD 2 · real-height coverage ~95% · ESTIMATED**

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
| **Denmark** | **LOD 2** | **~95%** | **~93%** | **ESTIMATED** |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

⚠ **Denmark is the CEILING for `RATE.md` (rules, ~96%) but NOT the ceiling for this rate.** The
Netherlands and Switzerland edge ahead on the physical model because their LoD2 products were
confirmed live this pass; Denmark's context spike is `NOT STARTED` in-tree, so its ~93% is a
desk-ESTIMATE from a known-national source, not a live probe. High confidence, not measured.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | Matriklen / Datafordeler (national cadastre, EPSG:25832 metric) | ~97% | ESTIMATED | one national product; already used by the DK rule pack |
| **(b) Real building HEIGHT** | **Danmark i 3D / GeoDanmark** (LoD2, real roofs) + **DHM** national LiDAR terrain | ~95% | ESTIMATED | national LiDAR-derived; not yet in-tree live-probed |
| **(c) Extra attributes** | **BBR** (Bygnings- og Boligregistret) — build year, floor count, use, roof material; GeoDanmark roof geometry | **HIGH** | ESTIMATED | BBR is one of Europe's richest per-building registers |

**OSM height-tag floor:** ESTIMATED ~15–25% explicit-height in Danish cities; the fabricated 9 m
default is never reached once Danmark i 3D + BBR are wired.

---

## The structural finding

**Denmark has a native national LoD2 building model (Danmark i 3D / GeoDanmark) with real roofs,
plus the BBR register** — arguably the richest building-attribute register in the benchmark (build
year, exact floor count, use category, roof-cladding material, per-building). Height is LiDAR-derived
via the national DHM. The reason Denmark scores ~93% here rather than ~97% is **process, not data**:
the in-tree context spike (`topics/buildings-lod-height.md`) is a stub marked `NOT STARTED`, so no
endpoint was live-probed this pass — unlike NL (3DBAG) and CH (GWR), which were. The sources are
national and open; the number is a confident desk read awaiting a live spike.

---

## Orthogonality with RATE.md

Denmark is the rare jurisdiction that is **high on BOTH rates** — ~96% buildable-rule (Plandata.dk
structured FAR/height) and ~93% context (Danmark i 3D LoD2 + BBR). It is the proof that the two are
independent axes that *can* both be maxed, not that they are the same axis. Keep the numbers
separate even here: ~96% is "we know the rules"; ~93% is "we can rebuild the existing city".

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Run the in-tree DK context spike: live-probe Danmark i 3D / GeoDanmark + DHM, promote ~93% ESTIMATED → VERIFIED | flips the flag; may nudge % up | LOW–MED — endpoints known, integration rated LOW |
| Join BBR floor count + use + year to the footprints | LOD 200 attribute richness → full | LOW — BBR is open, keyed to the building |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| Danmark i 3D / GeoDanmark buildings | — | NOT probed this pass (`topics` spike NOT STARTED) | ESTIMATED (national source known) |
| DHM (Danmarks Højdemodel) | — | NOT probed this pass | ESTIMATED (national, free) |

---

*Last updated: 2026-07-24. Sources national + open (Danmark i 3D LoD2, BBR, DHM) but NOT live-probed
in-tree — headline is a desk ESTIMATE pending the context spike. Denmark is the ceiling for RATE.md,
not for this rate. Maintainer: UNASSIGNED.*
