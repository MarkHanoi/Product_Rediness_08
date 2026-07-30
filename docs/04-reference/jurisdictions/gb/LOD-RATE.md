# LOD-200 Context-Building Rate — United Kingdom (`gb`) national

**Headline: `LOD 1 (derivable)` · real-height coverage `unwired (EA DSM−DTM derivable, England)` · `ESTIMATED`**

> **LOD-200 context-building rate** — the fraction of existing buildings around a plot for which we can obtain a
> faithful **≥ LOD-150 physical model** (real footprint + real MEASURED per-building height + ≥1 attribute) from
> an authoritative source, WITHOUT a fabricated OSM flat-extrude. Binding sub-metric = real building-HEIGHT
> coverage. Definition IDENTICAL across jurisdictions. GB rows are ESTIMATED (desk) — the derive is not yet wired.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | Footprint + estimated/`assumed` 9 m default | the floor we render today for GB |
| **LOD 150 (LoD1)** | Footprint + REAL measured height (EA DSM−DTM nDSM) | achievable-but-unwired for England |
| **LOD 200 (LoD2)** | Footprint + real height + roof form | needs a reconstruction pipeline (no national GB CityGML) |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| **United Kingdom** | **LOD 1 (derivable)** | **unwired (EA 1 m DSM−DTM, England ~high)** | **ESTIMATED** | **ESTIMATED** |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | HM Land Registry INSPIRE Index Polygons (freehold **index**, not cadastral) / OS MasterMap (licensed) | ⚠ index only | ESTIMATED | no keyless legal-parcel cadastre — footprint-fallback in `registry.ts` |
| **(b) Real building HEIGHT** (THE BINDING METRIC) | EA **LIDAR Composite DSM 1 m** − **DTM 1 m** nDSM (derive) | England ~high (LiDAR composite) | ESTIMATED | OS Building Heights is a **commercial** attribute → deliberately skipped (`GEO-DATA-SOURCING-MASTER.md`); DTM already live in `terrain.mjs`, DSM route unprobed |
| **(c) Extra attributes** (roof / storeys) | none national (no GB CityGML LoD2) | LOW | ESTIMATED | LoD2 needs a LiDAR reconstruction pipeline |

**OSM height-tag floor (the universal fallback):** where nothing is tagged, `contextBuildings.ts`
`DEFAULT_BUILDING_HEIGHT_M = 9` renders — the honest LOD-100 carpet, never presented as measured.

---

## The structural finding

GB is a **type-(ii)** jurisdiction: a strong open **elevation** base (EA LiDAR 1 m DTM **and** DSM, OGL v3,
England) means a MEASURED LoD1 height is **derivable** via DSM−DTM, exactly as for Norway/Portugal/Italy — but it
is **not wired** in `heightSources.mjs` (which maps `london → no-source`) and not baked, so today GB renders the
9 m carpet. The gap is engineering (wire the DSM−DTM nDSM stamp onto OSM footprints), not a licence gate. The
national **surveyed** height product (OS Building Heights) is commercial and is deliberately skipped.

---

## Orthogonality with LEGISLATION-RATE.md

GB: rules `NOT YET ASSESSED` (discretionary — the numbers don't exist as data) but context/height LOD is
**derivable-high** (EA LiDAR is genuinely open). The physical model is reachable; the RULES are the gap — the
opposite emphasis from the low legislation rate. Do not conflate the two.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire EA DSM−DTM nDSM stamp onto London OSM footprints | LOD 100 → LOD 150 (measured height) | medium (reuse the DK/ES nDSM stamp shape) |
| Add OS Open Buildings footprints where OSM is sparse | footprint completeness | low |

---

*Last updated: 2026-07-30. ESTIMATED (desk) — DTM live-probed in `terrain.mjs`; DSM route + derive UNWIRED.
Maintainer: UNASSIGNED.*
