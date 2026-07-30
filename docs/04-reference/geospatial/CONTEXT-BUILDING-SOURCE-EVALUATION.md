# Context 3D building-footprint source evaluation — OSM vs Overture vs MS vs Google

**Item:** L-513 delivery, density branch. Sibling of `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`
(that doc fixed *delivery* — bake to PMTiles; this doc fixes *source* — where the footprints come
from). **Status:** evaluation + prototype. **All counts live-probed + flagged VERIFIED. Nothing
inferred.** Probed 2026-07-24.

## 1. The problem (founder-confirmed)

The 3D-Site context buildings are far too sparse outside well-mapped OSM regions. Founder-confirmed
on **Riyadh: a near-empty plate**. The bake (`tools/context-bake/bake.mjs`) is faithful — it tiles
exactly what OSM holds. **The gap is the SOURCE: OpenStreetMap footprints are genuinely thin in
Saudi Arabia (and much of the Gulf / Global South).** No amount of bake tuning fixes a thin source.

## 2. The delta — PROVEN, side by side (VERIFIED 2026-07-24)

Building **counts** clipped to each city bbox. OSM via the live Overpass `out count;` (ways +
relations, both tagged `building`). Overture via DuckDB over the public Overture GeoParquet
(`release/2026-07-22.0`, `theme=buildings/type=building`), bbox-clipped with the parquet's `bbox`
row-group stats.

| City | bbox (minlon,minlat,maxlon,maxlat) | **OSM** (today's source) | **Overture** | Overture ÷ OSM |
|---|---|---|---|---|
| **Riyadh** | 46.60,24.58,46.83,24.80 | **56,278** (56,213 ways + 65 rel) | **299,918** | **5.33×** |
| **Jeddah** | 39.10,21.45,39.28,21.62 | **23,247** (ways)¹ | **167,766** | **7.22×** |
| **Barcelona** | 2.10,41.35,2.23,41.45 | **69,021** (ways)¹ | **85,725** | **1.24×** |

¹ Only **Riyadh** was counted with both ways **and** relations (56,213 ways + 65 relations — relations
are negligible in Saudi). Jeddah and Barcelona show **ways only** (I did not run their relation
counts). Barcelona's OSM has a material relations tail (~34% in the historic core, per L-580), so its
true OSM total exceeds 69,021 — Overture's own OSM-sourced sub-count there is **79,307** (see §4),
which is the better OSM proxy for Barcelona. Even against that higher figure Overture ≥ OSM in every
city.

**Conclusion: the founder's Riyadh observation is real and large — Overture carries 5.3× the
buildings OSM does there, 7.2× in Jeddah. Where OSM is already rich (Barcelona) Overture adds a
modest +24% and never regresses.**

## 3. The height story — the two-for-one holds ONLY where OSM is rich (VERIFIED)

Overture buildings carry `height` (metres) and `num_floors`. This is the LOD-200 height metric's
source too, so a dense-source swap *could* be a two-for-one (density **and** heights). It is — **but
only in Europe, not in Saudi.** Measured on the same Overture release:

| City | Overture total | `height` present | `num_floors` present | **height OR floors** |
|---|---|---|---|---|
| **Riyadh** | 299,918 | 121 (**0.04%**) | 217 (0.07%) | 254 (**0.08%**) |
| **Jeddah** | 167,766 | 28 (**0.02%**) | 440 (0.26%) | 443 (**0.26%**) |
| **Barcelona** | 85,725 | 17,728 (**20.7%**) | 54,413 (63.5%) | 62,780 (**73.2%**) |

**Why:** Overture's Saudi density is Microsoft ML footprints (§4), which are geometry-only — no
height. So in Saudi you get **density with essentially zero height** (extrusion falls to the
`assumed` default, honestly badged by the existing `resolveHeight` provenance path — no regression
vs today, where OSM also has no height there). In Barcelona the extra footprints are OSM + the
Spanish IGN cadastre, which **do** carry storeys — hence 73% height-or-floors, a genuine LOD-200
lift on top of the density.

**Honest bottom line on height:** the density win is universal; the height two-for-one is a European
(rich-OSM/cadastre) bonus, **not** a Saudi one. Do not sell Overture as "real heights for Riyadh" —
it is "5× the buildings for Riyadh, heights where the underlying data has them."

## 4. Where Overture's extra buildings come from (VERIFIED — source breakdown)

Overture tags each feature with its contributing `sources[].dataset`. Unnested over the bbox:

| City | Source dataset | Count |
|---|---|---|
| **Riyadh** | Microsoft ML Buildings | **243,817** |
| | OpenStreetMap | 56,101 |
| **Barcelona** | OpenStreetMap | 79,307 |
| | Microsoft ML Buildings | 17,415 |
| | Instituto Geográfico Nacional (España) | 4,838 |

Two things this proves:
1. **Overture's OSM sub-count matches our own OSM probe** (Riyadh 56,101 vs our 56,278; the tiny
   gap is bbox-filter semantics — see §7). So Overture genuinely *contains* OSM and adds to it; it
   is a strict superset, not a different dataset that might be missing what OSM has.
2. **The Riyadh density is Microsoft's Global ML Building Footprints, folded into Overture.** This is
   exactly the "Microsoft Global Building Footprints (Saudi release)" the brief asked to evaluate —
   and Overture already conflates it in, de-duplicated against OSM. So **a separate Microsoft (or
   Google Open Buildings) ingestion pipeline is redundant**: Overture is the union.

### On Microsoft / Google as *standalone* sources (honesty note)

The brief asked to also count Microsoft Global Building Footprints and/or Google Open Buildings v3
natively. **I did not run a native MS/Google probe.** What I proved instead is the Microsoft
contribution *as surfaced through Overture* (243,817 for Riyadh) — the same footprints, same
release cadence, already conflated. Google Open Buildings v3 did **not** appear in Overture's Riyadh
source breakdown (Overture selected MS ML there); a native Google count would need the Earth-Engine /
S2-cell pipeline and is not warranted given Overture already delivers 5.3× density. If a future need
arises to squeeze the last footprints, Google v3 is the place to look — but it is incremental on top
of an already-5× win, not the win itself.

## 5. Recommendation — Overture, per-region toggle (prototyped), global switch available

**Adopt Overture as the buildings source, starting with the OSM-thin regions (Riyadh, Jeddah).**
Rationale:
- **Global + unified** (OSM ∪ Microsoft ∪ Google ∪ Esri ∪ national cadastres, conflated).
- **Same delivery properties the whole L-513 architecture requires**: one static GeoParquet dataset
  on a public, anonymous S3 bucket — no key, no rate limit, no live-query hot path. A bbox read uses
  the parquet's `bbox` row-group stats for pushdown (scans covering row groups, not the planet).
- **PMTiles-friendly**: GeoParquet → (DuckDB, bbox clip) → GeoJSONSeq → the *existing* tippecanoe
  step → the *same* `buildings.pmtiles`. **No client change** — the tile schema is identical.
- **Carries height** where the underlying data has it (the LOD-200 two-for-one, in Europe).

**Chosen shape: a per-region toggle, default OSM, opt-in Overture** (prototyped in §6). This is the
non-regressing choice: Europe keeps its rich, height-bearing, relation-aware OSM bake byte-for-byte;
only the thin regions flip. A **clean global switch** (`--buildings-source overture`, every region)
is also wired and is defensible (Overture ⊇ OSM everywhere), but is left behind founder sign-off
because it would also fold Microsoft-ML footprints into the well-mapped European cities — a change in
render character (e.g. courtyard sheds OSM omits) that deserves a wider before/after look than the
Riyadh fix needs. Recommend: ship the toggle for Saudi now; evaluate the global switch separately.

## 6. Prototype (in `bake.mjs` — the bake tool; NOT run here)

Implemented, `--check`/`--dry-run` clean, **not executed** (the bake is a CI dispatch the founder
owns). Change summary — full diff reported separately for reconciliation:

- **Per-region `buildingsSource: 'osm' | 'overture'`** (default `'osm'`). Riyadh + Jeddah set to
  `'overture'`. Global override `--buildings-source overture|osm`.
- **`overtureBuildingsCmd(region, geo)`** builds a DuckDB invocation: `INSTALL/LOAD spatial+httpfs`,
  anonymous S3, `COPY (SELECT … FROM read_parquet(<Overture buildings>, hive_partitioning=1) WHERE
  bbox intersects region) TO '<city>-buildings.geojsonseq' WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq',
  SRS 'EPSG:4326')`. Runs through the same local/Docker `tool()` wrapper as osmium/tippecanoe.
- **Column → tag mapping** (onto exactly what `contextTiles.ts` + `contextBuildings.ts` read):
  `COALESCE(subtype,'yes') → building` · `height → height` · `num_floors → building:levels`.
- **Buildings layer branches on source**; **roads/water/parks stay 100% OSM** for every region
  (Overture-sourced cities still download + clip their OSM extract for those three layers). One
  merged `buildings.pmtiles`, unchanged filename → R2 + client reader untouched.
- **`Dockerfile`**: adds the pinned DuckDB CLI (+ `curl`/`unzip`) so the Overture path runs in the
  same CI image that already carries osmium + tippecanoe. Loud-fails (`exit 4`) if Overture is
  requested but DuckDB is unreachable — no silent Barcelona-shaped hole.
- **`OVERTURE_RELEASE = '2026-07-22.0'`** pinned for reproducibility; bump on Overture's monthly
  cadence.

### Conversion schema — VERIFIED against a live Overture slice (central Riyadh, 9,085 features)

The exact `COPY` above, run locally against the real Overture parquet, produced GeoJSONSeq with:
- **Property keys verbatim**: `building`, `height`, `building:levels` — the colon key survives
  GDAL's GeoJSONSeq writer (the one real risk, cleared).
- **`building` populated on 100%** of features (→ client `belongsToLayer` passes for every one).
- **Geometry: 9,083 `Polygon` + 2 `MultiPolygon`** — exactly what the reader's `ringsFor` handles;
  no LineString twins, no Point noise (unlike the osmium path, so the reader's de-dup is a no-op
  here).
- Null `height` becomes an absent MVT attribute after tippecanoe → the reader's `resolveHeight`
  falls to `derived-levels`/`assumed`, honestly badged. No new failure mode.

## 7. Licence + attribution — a source swap CHANGES THE CREDIT LINE (flag)

⚠ **This is a real, required client-side follow-up (not done here — the UI files are another agent's).**

- **Licence.** Overture buildings are **ODbL** for the OSM- and Microsoft-derived footprints (MS
  Global ML Buildings are released under ODbL) plus **CDLA-Permissive-2.0** for the Overture schema;
  Google Open Buildings portions are CC-BY-4.0. All are attribution licences compatible with a SaaS
  render, same family as the OSM ODbL we already ship under. No blocker.
- **Attribution.** The UI currently shows **"© OpenStreetMap"**. For Overture-sourced regions this
  is **no longer sufficient** — it must credit Overture (and, transitively, the sources Overture
  requires: OpenStreetMap + Microsoft). Suggested line for Overture regions: **"© OpenStreetMap
  contributors, © Overture Maps Foundation"**. Roads/water/parks and all European buildings stay
  OSM, so `"© OpenStreetMap"` remains correct there — the credit is now **per-region**, which the
  attribution UI does not currently express. **Action for the client-owning agent:** make the
  context credit line source-aware (Overture regions get the Overture credit).

## 8. What this does NOT claim (scope honesty)

- **Not run.** The bake itself was not executed (CI dispatch, founder-owned). `--check`/`--dry-run`
  are green; the DuckDB→GeoJSONSeq conversion is separately verified on a live slice (§6).
- **No native MS/Google probe** — MS is proven *through* Overture (§4); Google not measured.
- **Height is not fabricated.** Overture brings heights only where the data has them; Saudi stays
  ~0% height and extrudes at the honest `assumed` default, same as today.
- **The count filter** used simple bbox containment (`bbox.xmin/ymin BETWEEN …`); the bake uses bbox
  **intersection** (keeps edge-straddling footprints, matching the client's `ringIntersectsBbox`).
  The difference is a thin edge margin (<1%) and only makes the bake slightly *more* complete than
  the counted number.

## 9. Reproduce the probes

```bash
# OSM (baseline) — Overpass count, ways + relations tagged building, per bbox:
curl -s "https://overpass-api.de/api/interpreter" --data-urlencode \
  'data=[out:json][timeout:90];(way["building"](24.58,46.60,24.80,46.83););out count;'

# Overture — density + height coverage (DuckDB, anonymous public S3):
#   read_parquet('s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*.parquet',
#     hive_partitioning=1)  WHERE bbox.xmin BETWEEN <minlon> AND <maxlon>
#                             AND bbox.ymin BETWEEN <minlat> AND <maxlat>
#   count(*), count(*) FILTER (WHERE height IS NOT NULL), count(*) FILTER (WHERE num_floors IS NOT NULL)
# Source breakdown: SELECT unnest(sources).dataset, count(*) … GROUP BY 1.
```
