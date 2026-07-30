# Spain — Context-Data Deep-Dive (L-512)

> **What this file is.** The narrative source-analysis behind
> [`../ES-GEOSPATIAL-DATA-INVENTORY.md`](../ES-GEOSPATIAL-DATA-INVENTORY.md): the per-layer source
> **hierarchies** (best → fallback), the **3-tier REAL / DERIVED / ESTIMATED** provenance-badging
> matrix that is Spain's reusable honesty model, the **shared reconstruction modules** built once and
> reused nationwide (and by FR/PT), and the live-probe checklist. Folded from the founder-supplied
> *Spain Geospatial + Context Deep-Dive* (2026-07-30), umbrella **L-511**, deep-dive **L-512**.
>
> **Confidence (§CONTEXT-DATA-HONESTY).** Spain is the **reference country** — Barcelona ships on this
> stack and the hero endpoints (Catastro, MDS Edificación, PNOA) were live-verified in the zoning +
> context spikes. So this is a **`VERIFIED-PRIMARY`** deep-dive, not aspirational. **But** the specific
> endpoints were captured, not re-hit this session: treat every row as **"VERIFIED-PRIMARY · captured,
> re-probe before prod."** This file changes **no RATE % cell** (C63 §1.1). Ship the probe before the fix.
>
> **Session date:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** captured, pending re-probe.

---

## 0 — Reframing: Spain's edge is the COMBINATION, not any one hero layer

Spain's geospatial strength is the **interlocking of national programmes** — Catastro geometry + IGN
mapping + PNOA ortho/LiDAR + CNIG services + CartoCiudad + SIOSE + BTN + MITECO + IGME — into a
complete base. No other country in the benchmark set has all of: national parcels **and** national
footprints **and** a national building-height raster **and** national LiDAR **and** national ortho,
all open and all CC BY 4.0 / ETRS89. The consequence for planning: **the remaining work is
INTEGRATION, not discovery.** Contrast PT (one aspirational DGT platform, all `CONVERGENT-SECONDARY`)
and DE/IT/US (aspirational). This is why Spain is the country the badging model is *derived from* and
every other country *inherits*.

---

## 1 — Per-layer source hierarchies (best → fallback)

Each layer resolves down a hierarchy: use the highest tier available for the site, fall back only when
absent, and **badge which tier produced the value** (§2). The 3D-reconstruction *method* for each
layer lives in [`../topics/*.md`](../topics/) — this section is the **source order**, not the recipe.

### Parcels — Spain is a Tier-A parcel country
`Catastro (national geometry + refcat id + area + use/floors/year attrs)` → `municipal GIS` →
`Overture` → `OSM`. Footprints are **in the cadastral model** — no OSM reconstruction needed.
País Vasco (`CatastroEus`) + Navarra (`CatastroNav`) run **separate foral cadastres** (distinct
INSPIRE services) — 16 SEED municipalities need the foral adapter (see
[`../regions/pais-vasco-separate-cadastre/`](../regions/), [`../regions/navarra-separate-cadastre/`](../regions/)).

### Buildings / LOD — LOD1+ nationally, no native LOD2
`Catastro footprint` + `PNOA/ICGC LiDAR` + `MDT terrain` + `MDS Edificación height raster` = a
national **LOD1-real-height** model (flat extrusion at measured height, no roof planes). **No
nationwide LOD2/LOD3.** Municipal exceptions are richer (BCN / Madrid / Bilbao / Zaragoza / Valencia
publish CityGML / mesh — still LOD1 for ICGC Catalonia's 18k-volume model). Roof reconstruction path:
`footprint (Catastro)` → `height (MDS Edif)` → `roof refine (LiDAR)` → `RANSAC roof-planes` →
`procedural roof` — **badge "reconstructed", never "official"** (distinct from NL/DK/CH native LOD2).

### Building height — Spain's edge (three independent cross-validating sources)
1. **MDS Edificación** (national building-height raster `mdsn_e025`, 2.5 m) — **preferred**; the pixel
   IS building height above ground, already isolated to the building class (**no per-site DSM−DTM**).
2. **PNOA LiDAR nDSM** = `DSM − DTM`, **90th-percentile** under the footprint (not `max` — antennas/
   HVAC inflate it) — the shared module; cycle-tag every value (2009–2025, RMSE varies 40→10 cm).
3. **Municipal LiDAR** (ICGC Catalonia — denser/newer) — prefer over PNOA for Barcelona.
4. **Catastro floor-count** (`ALTURAS` × ~3–3.2 m) — **VALIDATION only** (plausibility / anomaly flag);
   Catastro's own 3D viewer admits it flat-extrudes at 3 m — the *same category of estimate as OSM
   levels*, just authoritative. **Never the primary measured height.**

   Store `measured_height_m` + `max` + `point_count` + `height_confidence` — three fields, never one
   REAL/ESTIMATED toggle (see [`../SPAIN-HEIGHT-MEASUREMENT.md`](../SPAIN-HEIGHT-MEASUREMENT.md) §3).

### Trees
`municipal tree inventories (BCN Arbrat / Madrid / Valencia / Zaragoza / Bilbao / Sevilla / Málaga —
species / DBH / crown / coords)` → `PNOA LiDAR CHM (local-maxima + watershed)` → `SIOSE / Forest
Inventory / CORINE (extent only)` → `procedural placement`. **Trees are derived independently — never
from land-cover polygons.**

### Roads
`BTN25 / BTN100 / CartoCiudad national centrelines` → `width-by-class buffer` → `terrain drape (never
float)`. Widths: motorway 25–35 · primary 14–20 · secondary 10–14 · residential 6–9 · service 3–6 m.
**Bridges get independent elevation.** No ES surface-polygon (paved-area) dataset exists — centreline
+ inferred width is the ceiling.

### Pedestrian
**No national sidewalk dataset** → `municipal engineering GIS (1:1,000 curb polygons where published)`
→ `orthophoto segmentation` → `procedural gap-inference`.

### Water
`BTN25 / BTN100 / MITECO / Hydrographic Confederations` — **never inherit raw LiDAR**; assign a
constant / centreline / flat-plane / MSL elevation.

### Parks
`municipal parks datasets` → `municipal land-use` → `SIOSE` → `orthophoto` → `OSM`. Trees inside a park
are derived **independently** (tree hierarchy above), never from the park polygon.

---

## 2 — The 3-tier badging matrix (Spain's reusable honesty model)

**The core structure: every layer exposes its OWN provenance — there is NO scene-wide REAL/ESTIMATED
badge.** Each rendered feature carries one of three tiers, and different layers in the same scene sit
at different tiers simultaneously. This is the honesty model **every country inherits** (the
`context-data-honesty-family` spine); Spain is where it is defined because Spain has enough real
sources to populate all three tiers meaningfully.

- **REAL** — measured / authoritative (a primary source measured this exact feature).
- **DERIVED** — computed from a measured source (a transform, badged as such).
- **ESTIMATED** — no authoritative source; a default/inference, **labelled** as unverified.

| Layer | REAL (measured/authoritative) | DERIVED (from measured) | ESTIMATED (no authoritative source) |
|---|---|---|---|
| **Buildings / height** | MDS Edificación raster · Catastro footprint | PNOA LiDAR nDSM P90 · RANSAC roof-planes | Catastro `ALTURAS` × 3 m · OSM `building:levels` |
| **Trees** | municipal tree inventory (BCN Arbrat) | LiDAR CHM (local-maxima + watershed) | procedural placement, no detection |
| **Roads** | BTN25 · municipal centreline | buffered centreline + class width, DTM-draped | OSM · class-default width |
| **Pedestrian** | municipal curb polygons | orthophoto-segmented sidewalks | inferred gap-fill / omitted |
| **Water** | BTN25 / BTN100 shape + DTM-sampled flat elevation | — | raw OSM polygon, no elevation correction |
| **Parks** | municipal parks polygon | — | SIOSE composite @ site-scale · OSM |

**Rolled up to the country's three provenance tiers:**
- **Tier-A (measured):** Catastro · IGN · CNIG · CartoCiudad · BTN25 · PNOA · MDS Edificación ·
  municipal GIS · municipal tree inventories.
- **Tier-B (derived):** LiDAR roofs · nDSM heights · CHM trees · buffered roads · ortho sidewalks.
- **Tier-C (estimated):** OSM levels · procedural trees · default road widths · sidewalk inference ·
  OSM parks.

> This matrix is the same graded model as building height
> ([`../SPAIN-HEIGHT-MEASUREMENT.md`](../SPAIN-HEIGHT-MEASUREMENT.md) §3) and the one already recorded in
> [`../CONTEXT-DATA-SPIKE.md`](../CONTEXT-DATA-SPIKE.md) §"Per-layer three-tier badging matrix". It
> drives the **C23 provenance extension** (the coverage gap logged in
> `../../../02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md`): PRYZM's current provenance model is a
> **binary** REAL/ESTIMATED toggle, and this three-tier, per-layer, cycle-tagged model is richer —
> extend C23, do **not** silently collapse to one flat REAL.

---

## 3 — Shared reconstruction modules (build ONCE, reuse nationwide + FR/PT)

Per L-511 / L-512, these are **country-agnostic** modules — build once, feed different national inputs.
Do **NOT** one-off any of them per country.

| Module | Pipeline | Shared with | ES input |
|---|---|---|---|
| **Height (nDSM)** | `DSM − DTM → nDSM → P90 per footprint` | ES · FR · PT | MDS Edificación (preferred) / PNOA LiDAR |
| **Road** | `centreline → class → width → buffer → drape` | ES · FR · PT | BTN25 / BTN100 / CartoCiudad |
| **Tree** | `LiDAR → CHM → local-maxima → watershed` | ES · FR · PT | PNOA LiDAR + municipal inventories |
| **Pedestrian** | `ortho + road + buildings → segmentation` | ES · FR · PT | PNOA ortho + BTN25 + Catastro |

Spain is the **first-mover** on the height + road modules (Barcelona proved them); PT (L-512b) and FR
(L-512b) feed their own national inputs into the same code. The MDS Edificación shortcut (pixel = height,
no subtraction) is an ES-only *input* optimisation on the *same* module interface.

---

## 4 — Live-probe checklist

The exact live re-probes that keep each `VERIFIED-PRIMARY · captured` row honest before it gates a
production decision (mirrors [`../ES-GEOSPATIAL-DATA-INVENTORY.md` §Probe steps](../ES-GEOSPATIAL-DATA-INVENTORY.md)):

- **CNIG OGC API** — landing / `/collections` / advertised CRS.
- **Catastro INSPIRE WFS** — parcel + building + `BuildingPart` (`ALTURAS`) schema; native
  `EPSG::25830/25831` query (dodges the 4326 axis-order exception).
- **PNOA LiDAR** — campaign / density / dates per tile (cycle tag → height confidence).
- **MDS Edificación** — publication / update cadence; validate-vs-LiDAR; re-sample ready-bbox cities.
- **CartoCiudad REST** — geocode + reverse-geocode round-trip.
- **BTN25 / BTN100** — roads / hydro / rail / coast / bridges FeatureTypes + widths.
- **SIOSE** — release + classification schema.
- **MITECO** — Natura 2000 / parks / flood (SNCZI).
- **IGME** — GEODE geology.
- **Municipal** (BCN / Madrid / Valencia / Bilbao / Zaragoza / Málaga / Sevilla) — licensing +
  CityGML / tree-cadastre / curb-polygon.

**Honesty gate:** until re-hit, each row stays `VERIFIED-PRIMARY · captured` and raises no RATE /
LOD-RATE cell. Spain rows document what Spain HAS (mostly real) — unlike PT/DE/IT/US aspirational
inventories — but "already wired for BCN" is not "re-probed for the next city." Ship the probe first.

---

## Cross-references

- [`../ES-GEOSPATIAL-DATA-INVENTORY.md`](../ES-GEOSPATIAL-DATA-INVENTORY.md) — the 21-row source catalogue.
- [`../CONTEXT-DATA-SPIKE.md`](../CONTEXT-DATA-SPIKE.md) — the live endpoint verification + Phase-1 gate + the same matrix.
- [`../SPAIN-HEIGHT-MEASUREMENT.md`](../SPAIN-HEIGHT-MEASUREMENT.md) — nDSM method + PNOA cycle accuracy + three-field height badge.
- [`../topics/buildings-lod-height.md`](../topics/buildings-lod-height.md) · [`../topics/roads-pedestrian.md`](../topics/roads-pedestrian.md) · [`../topics/water.md`](../topics/water.md) · [`../topics/parks-trees.md`](../topics/parks-trees.md) — per-layer 3D-modelling recipes.
- [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md) — the Phase-3 roadmap that turns this study into sequenced work.
- [`../SOURCE-founder-deep-dives-raw.md`](../SOURCE-founder-deep-dives-raw.md) — the raw founder source, preserved.

---

*Last updated: 2026-07-30. `VERIFIED-PRIMARY` (Spain = reference country) but captured, not re-hit
this session — re-probe before any row gates production or raises a RATE / LOD-RATE cell.
Maintainer: UNASSIGNED. §CONTEXT-DATA-HONESTY.*
