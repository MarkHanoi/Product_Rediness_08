# LANE CONTEXT-INTL — US metros + AU states + Dubai/Abu Dhabi context-bake rows (2026-09-03)

> Executes the founder directive "extend the LoD200 context bake to US metros + Australian states +
> Dubai/Abu Dhabi, mirroring the 25 EU national rows (5faa71ba)". Binding sources read first:
> `tools/context-bake/bake.mjs` (§BAKE-EUROPE-NATIONAL template · §WATER-TILE-CAP · §MEASURED-HEIGHT-GATE
> · §HEIGHT-STAMP-BUDGET), `heightSources.mjs`, `terrain.mjs`, and
> `audit/geo-expansion/2026-09-02/{au-sweep,me-sweep}.md`. Model: the lane-REGIONS national-rows lane
> (`audit/europe-site-intel/2026-08-31/impl/lane-regions-national-rows.md`).
> ⛔ Nothing published, nothing committed. Scope: `tools/context-bake/**` + findings only.

## 1 · What is in the working tree (uncommitted, on `main`)

**14 new `bake.mjs` region rows** (was 35 → **49** regions), each citing its sweep source. **NO new
row declares a `heightJoin`** — no wired stamp exists for any of these jurisdictions (the dispatch
supports mds/dhm/lod2nrw only), and a declared join that produces nothing is a non-zero exit by
design. This is the shipped `netherlands`/§BAKE-EUROPE-NATIONAL precedent: honest OSM `assumed`
defaults, the height CLASS + owed build recorded in `heightSources.mjs` REGION_SOURCE.

- **US metros (4 new + 2 existing) — §BAKE-US-METROS.** `chicago` (illinois), `austin` + `houston`
  (share the texas extract → ONE download, two clips), `boston` (massachusetts), alongside the
  existing `newyork` / `sanfrancisco`. **METROS, not whole states** (a US whole-state/national bake is
  deferred behind the §5 R2-budget decision; the national footprint BACKBONE is Overture per
  §BAKE-OVERTURE). Buildings = **OSM** (major-US-metro OSM carries dense government footprint imports;
  a per-metro OSM-vs-Overture count probe — the Riyadh rule — is the owed calibration before any
  `--buildings-source overture` flip; no probe forces one today). Per-metro OPEN channels the owed
  3DEP-nDSM stamp draws on: NYC open building heights, Chicago open footprints, Boston MassGIS
  (recorded on the row + REGION_SOURCE `overture_us`).
- **AU states (8) — §BAKE-AU-STATES.** `newsouthwales · victoria · queensland · westernaustralia ·
  southaustralia · tasmania · act · northernterritory`, WHOLE-STATE bboxes (the AU analogue of a
  whole-country row — cadastre + planning are STATE competencies, there is no national scheme). Each
  uses the per-state Geofabrik extract under `australia-oceania/australia/` (all 8 range-GET-verified
  2026-09-03; 0.96 GB pbf for the continent, ~1/5 of Germany). Buildings = OSM everywhere (ACT ships
  64,674 OPEN footprints, Melbourne serves REAL extrusions — both ride the OSM/derive path; MS
  GlobalML EXCLUDED). ⚠ **NT included deliberately:** its PARCELS are viewer/Cloudflare-gated
  (au-sweep §8) but context bakes fine on OSM — the **Saudi precedent** (geo-fenced parcels ≠ no
  context row; omitting it recreates the exact L-607 "no surrounding building data" defect). If the
  founder's "6 states + ACT" scope is strict, drop the `northernterritory` row — it is the only one
  outside that phrasing.
- **AE metros (2) — §BAKE-AE-METROS.** `dubai` + `abudhabi`, the founder-named UAE metros. SAME
  gcc-states extract as riyadh/jeddah (Geofabrik serves no per-country Gulf file → ONE download for
  all four). Buildings = **OVERTURE**, exactly the riyadh/jeddah precedent: the Gulf is an OSM
  building desert (me-sweep §12; riyadh 5.3× / jeddah 7.2× Overture-vs-OSM, VERIFIED 2026-07-24) and
  the founder directed Overture here. **MS GlobalML stays EXCLUDED** — Overture is the sanctioned
  conflation that folds ML footprints in (licensed), raw GlobalML is not. Heights: **NONE** — both
  emirates' data hosts are vantage/WAF-blocked (me-sweep §2/§3), so no heightJoin and honest assumed
  defaults (Overture height ~0% in the Gulf, like Saudi). Owed: a Dubai/AbuDhabi-specific
  OSM-vs-Overture count probe.

**`heightSources.mjs`** — 1 new documented SOURCE (`elvis_au` — ELVIS national LiDAR nDSM derive,
CC BY 4.0) + 14 REGION_SOURCE mappings (4 US metros → `overture_us`; 8 AU states → `elvis_au`; 2 AE
metros → honest `no-source` with the exact per-emirate gate). AU custom `documented` reasons were
deliberately NOT used (resolveHeights re-derives a documented reason from the SOURCES note, so a
per-region reason would be DEAD metadata — §BAKED-FLAG-IS-NOT-EVIDENCE); the ACT-open-footprints and
Melbourne-extrusions nuance lives in the `elvis_au` note where it is actually surfaced.

**`terrain.mjs`** — **untouched, deliberately** (see §3): the datum-lift ledger is delivered as data
below with ready-to-paste rows, because the terrain model's per-source single-constant assumption
cannot express AU honestly and that is a terrain-model decision the orchestrator should own.

## 2 · Verification of the config (foreground, RC read immediately)

| Probe | Result |
|---|---|
| `bake.mjs --check` (NODE_OPTIONS=--max-old-space-size=12288) | **RC=0** — **49** regions planned; buildings: 4 via Overture (riyadh, jeddah, dubai, abudhabi), rest OSM; height-stamp budget "✔ every height join has a bounded working set and enough heap" (heap 13086 MB) |
| `--regions-json` (the §SYNC-SWITCH the merge/publish job reads) | **49** allRegions; all 14 new names present; **0 heightJoin on any new row** (correct — mass-only) |
| `--region act --dry-run` (OSM, small state) | **RC=0** — full **7-layer** chain generated (buildings→roads→water→parks→landuse→rail→trees), each clip→filter→export→tile, buildings + resolveHeights(act) |
| `--region dubai --dry-run` (Overture variant) | **RC=0** — buildings via DuckDB→Overture (`read_parquet` SQL emitted), roads/water/parks/landuse/rail/trees via OSM; 7 layers |
| `resolveHeights` on all 14 new regions (node import, no network) | 12 `documented` (overture_us / elvis_au), 2 `no-source` (dubai/abudhabi) — **0 live joins armed, all keep OSM honestly** |
| all 11 new Geofabrik URLs | range-GET **206** with `Content-Range` sizes matching the sweeps (au-sweep §9.1 exact; US: illinois 358,148,729 · texas 717,401,617 · massachusetts 309,784,351) |
| `npx eslint bake.mjs heightSources.mjs` | **RC=0** |

## 3 · Falsification (fired, then restored byte-identically — sha256-verified)

Temporarily declared `heightJoin:'elvis'` on the mass-only whole-state `newsouthwales` row →
`bake.mjs --check --region newsouthwales` → **RC=5**, by name:

```
✖ HEIGHT-STAMP BUDGET FAILED — this bake would crash or hang partway through:
  ✖ newsouthwales: whole-country region (120.6 deg²) declares heightJoin 'elvis' but NO stamp bboxes.
    Its join would hold every footprint in the country in the V8 heap and abort the bake ...
  Refusing to start.
```

Restored → `sha256sum -c` **bake.mjs: OK** (byte-identical). The §HEIGHT-STAMP-BUDGET preflight
refuses a declared-but-unproducible national join before any download, naming the region; the runtime
§MEASURED-HEIGHT-GATE (`assertMeasuredHeights`) is the second tier and fires on the CI bake if a
declared join stamps nothing. Together they are why declaring no heightJoin on a mass-only row is the
only honest choice.

## 4 · DATUM-LIFT LEDGER (probe-computed, GeographicLib GeoidEval EGM2008, 2026-09-03)

Recipe (identical to the EU ee/lu rows): `curl 'https://geographiclib.sourceforge.io/cgi-bin/GeoidEval?input=<lat>+<lon>'`
→ the EGM2008 row. For a `--dtm-source mapterhorn` bake (Mapterhorn is EGM2008-referenced,
`geoidSepM: 0.0`), the datum lift IS the EGM2008 undulation at the representative city — this is the
value that lifts the visual terrain to the right sea level. Sydney re-derived to **22.3574** (matches
the lane-context hint exactly — probe confirmed, not trusted).

| Region (bake row) | Representative capital/metro | lat, lon | **geoidSepM (EGM2008, m)** | Local survey datum |
|---|---|---|---|---|
| newsouthwales | Sydney | -33.8688, 151.2093 | **22.3574** | AHD (EPSG:5711) |
| victoria | Melbourne | -37.8136, 144.9631 | **4.6281** | AHD |
| queensland | Brisbane | -27.4705, 153.0260 | **41.3551** | AHD |
| westernaustralia | Perth | -31.9505, 115.8575 | **-32.9150** | AHD |
| southaustralia | Adelaide | -34.9285, 138.6007 | **-0.3354** | AHD |
| tasmania | Hobart | -42.8821, 147.3272 | **-3.8089** | AHD-TAS (separate tide-gauge origin) |
| act | Canberra | -35.2809, 149.1300 | **19.2335** | AHD |
| northernterritory | Darwin | -12.4634, 130.8456 | **51.0618** | AHD |
| dubai | Dubai | 25.2048, 55.2708 | **-34.1289** | UAE local (UNVERIFIED-DOC, me-sweep §13) |
| abudhabi | Abu Dhabi | 24.4539, 54.3773 | **-33.2007** | UAE local (UNVERIFIED-DOC) |
| newyork (existing) | New York | 40.7128, -74.0060 | **-32.7222** | NAVD88/GEOID18 |
| sanfrancisco (existing) | San Francisco | 37.7749, -122.4194 | **-32.1597** | NAVD88/GEOID18 |
| chicago | Chicago | 41.8781, -87.6298 | **-33.9306** | NAVD88/GEOID18 |
| austin | Austin | 30.2672, -97.7431 | **-26.9013** | NAVD88/GEOID18 |
| houston | Houston | 29.7604, -95.3698 | **-28.4065** | NAVD88/GEOID18 |
| boston | Boston | 42.3601, -71.0589 | **-28.5769** | NAVD88/GEOID18 |

### 4.1 Why terrain.mjs was NOT wired here — the model finding

`geoidSepM` is consumed strictly PER SOURCE (`TERRAIN_SOURCES[region.source].geoidSepM`, terrain.mjs
1961/1970/1982/2003) — one constant per country-code source; there is no per-region override, and the
sibling test `mdsBboxCoversTerrainRegion.spec.ts` hard-codes a **2-letter** source-key convention
(`source:\s*'[a-z]{2}'`). Two consequences:

1. **AU cannot ride one `au` constant.** The undulation swings **−32.9 (Perth) to +51.1 (Darwin) =
   84 m** across the states (au-sweep §9.2 predicted exactly this). A single national AU constant
   would be wrong by up to ~40 m. The honest options are (a) **8 per-state sources** (`au_nsw`…`au_nt`,
   which break the 2-letter convention) or (b) a small terrain-model enhancement: a **per-region
   `geoidSepM` override** (`region.geoidSepM ?? src.geoidSepM` at the 4 call sites) so each capital
   REGIONS row carries its own probe value. **(b) is the recommended owed build** — it unblocks AU,
   AE, and US-metro refinement at once. This is an architectural call for the terrain owner, not a
   context-bake row-add, so it is left as a NAMED owed build rather than hacked in under this lane.
2. **US metros already ride the existing `us` source** (`geoidSepM: -32.0`, the CONUS representative —
   newyork/sanfrancisco terrain rows exist). The per-metro EGM2008 values above are the refinement the
   override in (b) would apply (austin/houston deviate ~4-5 m from −32, larger than ES's Madrid-vs-
   Barcelona 2 m, so refinement matters more here). Adding metro terrain rows at −32 would extend the
   existing imperfection knowingly — deferred to the override.
3. **AE is a clean drop-in when wanted** (both ~−33.5, <1 m apart, fits the 2-letter model): add
   `ae: { ... vertDatum: 'UAE local (UNVERIFIED-DOC)', geoidSepM: -34.1, /* Dubai; -33.2 Abu Dhabi */
   license: 'UNWIRED — visual context via --dtm-source mapterhorn only' }` to TERRAIN_SOURCES, then
   `{ name: 'dubai', source: 'ae', bbox: [54.95,24.85,55.45,25.35] }` and
   `{ name: 'abudhabi', source: 'ae', bbox: [54.28,24.33,54.75,24.62] }` to REGIONS. Left to the
   terrain owner for symmetry with the AU decision above.

## 5 · WHAT CI MUST BAKE (owed operational bakes — see context-intl-full-bake-plan.json)

Same two hard prerequisites as the EU lane (`regions-full-bake-plan.json`), now with +14 regions:

- **R2 budget + workflow-switch prerequisite still binds.** ALL_REGIONS is now **49** rows. An
  unscoped full bake CANNOT finish (the EU-only set already raced the 180-min buildings timeout);
  `context-bake.yml` must go per-region + merged-artifact/incremental `aws s3 sync` (bake.mjs:57
  design; the §SYNC-SWITCH `--regions-json` + merge-tiles.mjs are the machine-readable half). Until
  then the §BAKE-BY-REGION warning binds: a region-scoped publish REPLACES the whole tileset.
- **New-region tile cost is SMALL.** AU whole-continent ≈ 0.96 GB pbf → ~0.8-1.9 GB tiles (7 layers,
  lean upper). US rows are METRO clips (download a state extract, tile a metro bbox → tiles tiny;
  Austin+Houston share one texas download). AE = 2 metro clips on the already-downloaded gcc-states +
  a DuckDB→Overture buildings read (needs `duckdb`/the Docker image — the §BAKE-OVERTURE gate fails
  loud if absent).
- **Calibration pick: `act`** (18.9 MB pbf, the smallest whole-state row) is the AU pilot bake, exactly
  as `luxembourg`/`estonia` were the EU calibration.
- **Owed height builds (per region, no join armed until it lands):** US metros → USGS 3DEP nDSM stamp
  (mirroring `mds`) drawing on NYC open heights / Chicago open footprints / Boston MassGIS. AU →
  ELVIS national LiDAR nDSM stamp per capital + the per-capital AUSGeoid2020 datum constant; ACT +
  Melbourne joins land earliest (open footprints / served extrusions). AE → none until a gated source
  is unlocked (Dubai/AbuDhabi hosts vantage-blocked).
- **Owed probes (named):** per-metro US OSM-vs-Overture count · Dubai/AbuDhabi OSM-vs-Overture count ·
  ELVIS per-capital LiDAR coverage fraction · per-city AUSGeoid2020 constants for the ELVIS stamp
  (the EGM2008 ledger above is the mapterhorn-visual lift; the AHD stamp needs the AUSGeoid2020 grid
  value, ~0.5-1 m offset from EGM2008) · UAE local vertical datum verification (me-sweep §13).
