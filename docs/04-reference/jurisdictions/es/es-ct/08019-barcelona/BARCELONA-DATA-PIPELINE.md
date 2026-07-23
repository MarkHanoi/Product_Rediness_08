# Barcelona — how the data is actually built (the map before you touch any of it)

**Date:** 2026-07-22 · **Cross-refs:** ADR-0271 (Art. 242.2), C58 (zoning/envelope), C19 (site frame),
C12/C55 (context), L-513b, L-537, L-576→L-583.

---

## ⚠ THE HEADLINE: THERE IS ALMOST NO "BARCELONA DATASET"

Exactly **one** of the seven layers below is a dataset we own and publish. The rest are a **live
national API**, a **regional GIS**, or **hand-encoded law**. Anyone who arrives expecting to "load
the Barcelona zoning data" will look for a file that does not exist, and cannot exist.

**The buildable envelope is not looked up. It is CONSTRUCTED, per parcel, on every selection.**

```
Catastro ring  +  MUC clau  +  dissolved block  +  measured street width  +  encoded rules
        ─►  depth (Art. 242)  ─►  height (Art. 327)  ─►  inset polygon  ─►  3D volume
```

That is ADR-0271's thesis: **the ordinance does not state a depth — it states how to DERIVE one**,
and the answer differs block to block. Every "20 m" or "24 m" *profunditat edificable* quoted online
is someone's answer for one particular block, which is exactly why those figures contradict each
other, and why hard-coding any of them produces a confidently wrong envelope (C58 §1.4).

---

## THE SEVEN LAYERS

### 1 · Parcel geometry — **live national API**
**Spanish Catastro INSPIRE WFS** — `ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`.
Two calls: `GetParcel` by *referencia catastral* → one ring; a **BBOX** query → every parcel
intersecting a box. Both proxied same-origin via `server/parcelZoningProxy.js`, with a block cache
(a rejected block is deliberately never cached).

Yields: ring in lat/lon, refcat, address, area.
⇒ **NATIONAL.** This is why Madrid and Córdoba already resolve parcels with zero new work.

### 2 · Zone — **regional GIS**
**MUC** (*Mapa Urbanístic de Catalunya*, Generalitat) → the **clau** (`13a`, `12b`, `18`, `22a`, …)
plus the MUC taxonomy code (`R2`, `SV`, `SE`, …). Surfaced on the card as
*"Planning source: Generalitat de Catalunya MUC + Catastro"*.

⚠ Catalonia-specific. Another autonomous community means a different GIS and a different taxonomy.

### 3 · The block (*manzana*) — **DERIVED, not fetched**
There is no published block-outline dataset. We construct it:

1. take the refcat's **first 5 characters** as the manzana prefix (`manzanaPrefix`);
2. BBOX query around the parcel centroid (`BLOCK_BBOX_HALF_DEG = 0.002`, ≈ ±222 m lat / ±167 m lon);
3. keep parcels whose prefix matches; **refuse below 3** (a 1–2 parcel "block" is far likelier to be a
   broken prefix assumption than a real *manzana*, and a partial ring yields a wrong depth);
4. `dissolveParcelsToBlockRing` merges them into one outline.

⚠ **This is where 17% of parcels fail today** (L-576, live n=100): 7% `block-dissolve-refused`,
7% prefix matched only ONE parcel of ~300 in the bbox (a **grouping** bug, not a dissolve bug),
3% upstream error.

### 4 · Street width (*amplada de vial*) — **MEASURED, because no dataset exists**
Art. 327 keys the height on the **ample oficial** — the officially declared width. **Barcelona
publishes no machine-readable width layer**: a probe of the city's open-data CKAN found four `vial`
datasets, the only relevant one being a **WMS raster** with no queryable width attribute.

So `measureStreetWidths` **casts rays** from each block-ring edge outward to the opposing frontages,
and `resolveAmpladaDeVial` tiers the result:

| tier | meaning | band-edge guard |
|---|---|---|
| `declared-municipal-gis` / `curated-cerda-nominal` | an official figure | disarmed (exact by definition) |
| `snapped-to-declared-quantum` | a measurement within tolerance of a grid quantum (e.g. 19,74 → 20 m) | disarmed |
| `measured-cadastral` | raw ray measurement | **ARMED** |

⚠ `BAND_EDGE_GUARD_M = 0.5` **refuses** when a measured width sits within 0.5 m of a band boundary —
because there the *noise*, not the measurement, would pick the storey band, and one band is 3,05 m of
building. Measured live (n=83): **55% snapped · 43% raw · 0% unmeasurable · 20.5% band-edge refusal.**

⚠ **"No measurable width" is 0.0%.** The long-standing assumption that width AVAILABILITY was the
blocker is **refuted** — the blocker is band-edge ambiguity, which needs a declared source, not
better geometry.

### 5 · The rules — **HAND-ENCODED LEGAL TEXT**
`packages/site-parcel-data/src/rulepacks/`. Not an API, not a feed. Someone read the ordinance and
typed the table — e.g. `bcnAlcadaReguladora.ts` is PGM Art. 327's six width→height bands.

⇒ **THIS LAYER IS THE ENTIRE COVERAGE NUMBER.** 13a encoded = **24.2%** of private buildable land;
13b now unblocked = **33.0%**. See the per-clau roadmap in `V1-LAUNCH-IMPLEMENTATION-PLAN.md`.

### 6 · Context buildings — **the ONE dataset we own**
```
Geofabrik Cataluña .osm.pbf  →  osmium extract (bbox clip)  →  osmium tags-filter
   →  osmium export (GeoJSONSeq)  →  tippecanoe  →  <layer>.pmtiles  →  Cloudflare R2
   →  client reads BYTE RANGES per tile at z16
```
Four layers: `buildings` (~13 MB), `roads`, `water`, `parks`. Baked by `tools/context-bake/bake.mjs`,
published by `.github/workflows/context-bake.yml`.

⚠ **Heights are NOT surveyed.** Measured over 23,251 footprints (L-582): **0,9% tagged `height`** ·
**79,3% `building:levels` × OUR assumed 3,2 m** · **19,8% the fabricated 9 m default**, the last
rendered translucent rather than solid. Any consumer treating context height as a measurement must
read `heightProvenance` first.

### 7 · Basemap — Cesium photoreal tileset (3D) + OpenFreeMap (2D plan).

---

## WHAT TRANSFERS TO ANOTHER CITY

| # | Layer | Transfers? |
|---|---|---|
| 1 | Catastro parcels | ✅ **free** — national |
| 3 | block dissolve | ✅ **free** — pure geometry |
| 4 | width measurement | ✅ **free** — pure geometry |
| 6 | context tiles | ✅ **~free** — change a bbox, re-run the bake |
| 7 | basemap | ✅ free |
| 2 | zone source | ⚠ Catalonia = MUC; another region = a different GIS + taxonomy |
| **5** | **rule packs** | ❌ **HAND-ENCODED PER MUNICIPALITY** |

⇒ **Six of seven layers are free. The seventh is the whole cost.**

⚠ And it cannot be shared even within one metropolitan plan: the AMB serves per-municipality *refós*
pages keyed by INE code, and **`08015` (Badalona) and `08245` state DIFFERENT NUMBERS for the same
PGM article**, because each municipality layers its own *modificacions* onto shared article numbers
(L-583 §1). "Encode the PGM once, get 36 municipalities free" is false.

⚠ **The rule-pack cost is SOURCING, not typing** — and sourcing is human-gated: AMB 403s to scripted
fetch, Barcelona's own book page is robots-disallowed, the authoritative viewers are interactive.
Two capable research agents hit that wall from different angles, twice each, in one day. It does not
parallelise with engineers.

---

## THE HONESTY MACHINERY THAT WRAPS ALL OF IT

Every layer can fail, and each failure has a **distinct, cited** outcome rather than a silent
fallback — this is the part that took longest to build and it is fully jurisdiction-independent:

- **no clau** → refuse, cite the MUC taxonomy;
- **clau with no rule pack** → *"Zone rules coming"* — never a generic setback triple, because that
  is the wrong geometric OPERATION for an alignment zone, not merely an imprecise number (C58 §1.11);
- **ordinance grants no private envelope** (parks, motorways, clau 18) → *"No envelope applies"*,
  cited. **This is a CORRECT answer, not a gap** — it is 24,2% of private buildable land, and it is
  why 100% constructed is neither achievable nor desirable;
- **rules exist but an input is missing** → *"Couldn't complete"*, naming which input;
- **height cannot be decided** → no fabricated prism; a 0,5 m footprint slab and the reason;
- **context tiles unreadable ≠ empty** → `ok` / `aborted` / `unavailable` / `disabled`, never a bare
  empty array (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
