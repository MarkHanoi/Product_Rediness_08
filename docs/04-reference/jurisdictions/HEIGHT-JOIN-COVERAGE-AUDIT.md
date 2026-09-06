# Height-join coverage audit — which ground a wired height source can actually reach

**Row:** L-12947 · **Lane:** HEIGHT-JOIN-COVERAGE-AUDIT · **Measured:** 2026-09-06 · **Method:** static read of
`tools/context-bake/bake.mjs` + `heightSources.mjs` + `heights/*.mjs` at HEAD `e8ba3a7b`, plus the
specs quoted in §6. **No network probe was run by this lane** — every HTTP figure quoted below is
attributed to the source note that measured it, by file and date.

---

## 0 · The question, and why it is not the question the other docs answer

The founder dropped a site on **Ciudad Real** and got the fabricated 9 m carpet. Spain is not missing a
height source: the `spain` bake row has declared `heightJoin: 'mds'` for weeks, the CNIG **MDS
Edificación** raster (`mdsn_e025`) is keyless and **national**, and heightSources.mjs says so in its own
words — *"The raster (mdsn_e025) DOES cover the whole country"*. What stopped Ciudad Real is one line:

```js
// tools/context-bake/bake.mjs:832 — stampBboxesFor()
if (r.heightJoin === 'mds') return MDS_CITY_BBOXES.map((c) => c.bbox);
```

`MDS_CITY_BBOXES` is **nine hand-typed metro boxes**. A footprint outside all nine is not
de-prioritised — it *streams through the join with its original OSM tags* and can **never** be stamped,
however many times the bake runs. Ciudad Real is 40 km from the nearest box edge.

**This is not a Spanish defect. It is the shape of every wired height join in the repo.** Sixteen more
regions declare a `heightJoin`; **fifteen** of them resolve it to a hard-coded city list, and those lists
cover between **0.007 %** and **0.54 %** of the region area actually baked and shipped.

> **`HEIGHTS-COVERAGE-AND-BLOCKED.md` answers a different question** — *does a country have a source at
> all* — and its 2026-07-25 reading is now **stale in the optimistic-for-sourcing / pessimistic-for-wiring
> direction** (it describes 3DBAG, Catastro and LoD2-DE as "documented next ingest step"; all three are
> wired and stamping today). This doc answers the question that survives a "yes" there: **given the
> source is wired, which ground can it reach?** Where the two differ on wiring state, read the code.

---

## 1 · The measured reachability table

`ws deg²` is the summed area of the working-set bboxes; `region deg²` is the bake row's own bbox — the
ground the tileset actually ships. Computed from the real exported constants (see §6 for the command).

| region | join key | stamp module | region deg² | ws boxes | ws deg² | **ws % of region** |
|---|---|---|---|---|---|---|
| `norway` | `ndh_no` | `heights/noHeightsStamp.mjs` | 355.11 | 3 | 0.0239 | **0.007 %** |
| `victoria` | `au_open` | `heightSources.mjs` (pinned chain) | 48.50 | 1 | 0.0099 | **0.020 %** |
| `greatbritain` | `ealidar_gb` | `heights/ealidarGbStamp.mjs` | 110.00 | 5 | 0.0375 | **0.034 %** |
| `germany` | `lod2de` | `heights/deLod2LaenderStamp.mjs` | 72.22 | 12 | 0.0657 | **0.091 %** |
| `france` | `mnh_fr` | `heightSources.mjs` (pinned chain) | 144.55 | 13 | 0.1539 | **0.106 %** |
| `austria` | `bev_at` | `heights/atHeightsStamp.mjs` | 21.17 | 5 | 0.0356 | **0.168 %** |
| `spain` | `mds` | `heightSources.mjs` (pinned chain) | 113.20 | 9 | 0.1932 | **0.171 %** |
| `czechia` | `cuzk_cz` | `heights/czHeightsStamp.mjs` | 17.81 | 5 | 0.0399 | **0.224 %** |
| `estonia` | `ee_etak` | `heights/eeHeightsStamp.mjs` | 15.41 | 4 | 0.0444 | **0.288 %** |
| `denmark` | `dhm` | `heightSources.mjs` (pinned chain) | 26.60 | 4 | 0.0870 | **0.327 %** |
| `belgium` | `be_dhmv` | `heights/beHeightsStamp.mjs` | 8.19 | 5 | 0.0288 | **0.352 %** |
| `netherlands` | `3dbag` | `heights/nl3dbagStamp.mjs` | 11.80 | 6 | 0.0456 | **0.386 %** |
| `slovenia` | `gurs_si` | `heights/siHeightsStamp.mjs` | 4.95 | 5 | 0.0195 | **0.394 %** |
| `switzerland` | `swiss` | `heightSources.mjs` (pinned chain) | 9.43 | 9 | 0.0506 | **0.537 %** |
| `abudhabi` | `ad_ndsm` | `heights/abudhabiNdsmStamp.mjs` | 0.14 | 1 | 0.0063 | **4.622 %** |
| `newyork` | `us_open` | `heights/usOpenHeightsStamp.mjs` | 0.0144 | 1 | 0.0144 | **100 %** |
| `sanfrancisco` | `us_open` | `heights/usOpenHeightsStamp.mjs` | 0.0208 | 1 | 0.0208 | **100 %** |
| `boston` | `us_open` | `heights/usOpenHeightsStamp.mjs` | 0.0396 | 1 | 0.0396 | **100 %** |
| `koln` | `lod2nrw` | `heightSources.mjs` (chain tail) | 0.0187 | — | whole region | **100 %** |

**Area is not population**, and the boxes are metro cores where population is dense — so the population
figure is far better than 0.1 %. It is still nowhere near 100 %, and §3 ranks by population, not area.

---

## 2 · Per-region rows

Each row answers the brief's five questions: **(a)** dispatch, **(b)** working set, **(c)** covered vs
uncoverable, **(d)** silent or loud, **(e)** verdict + fix.

### 2.1 `spain` — `mds` — **NEEDS TILING** *(the reported defect)*

- **(a)** Not the `NATIONAL_STAMP_TABLE`: `mds` is one of the six keys on the **pinned dispatch chain**
  (`bake.mjs:1209`), dispatching to `stampMdsHeightsOnGeojsonseq` in `heightSources.mjs`. Same
  bookkeeping either way (`recordNationalStampOutcome`).
- **(b)** **Hard-coded city list.** `MDS_CITY_BBOXES` (`heightSources.mjs:771`), **9 rows**, used as
  BOTH `priorityBboxes` and `retainBboxes`. Spain deliberately reuses it as the Catastro footprint
  working set too, so footprints and heights cover the same ground.
- **(c)** Covered: barcelona · madrid · valencia · sevilla · malaga · zaragoza · bilbao · murcia ·
  cordoba. **Uncoverable, forever, at any re-bake:** **Ciudad Real** (−3.927, 38.986) · **Valladolid**
  (−4.724, 41.652) · **Vigo** (−8.720, 42.240) — and A Coruña, Alicante, Granada, Palma, Santander,
  Salamanca, Toledo, all tested in `heightJoinCoverage.spec.ts`.
- **(d)** **Silent at the pixel, half-loud in the log.** The bake prints
  `measuredCount/footprintCount` and `[held N, passed through M]`, so the ratio is visible to whoever
  reads the run — but `assertMeasuredHeights()` fails only at **measuredCount === 0**, so 50 k measured
  out of 6 M is a green gate. In the tiles an unstamped footprint carries no `pryzm:height_src`, and
  `resolveContextHeight()` returns provenance **`assumed`** — the *same value* it returns for a
  footprint inside a stamped box where the raster genuinely had no data. **Unreachable-by-design and
  no-data-here are the same value.** `tools/context-height-probe/probe.mjs` has a five-valued verdict
  built for exactly this distinction (`unreachable · not-baked · empty · unmeasured · measured`) and
  **none of the five is "outside the working set"**.
- **(e) Fix.** The raster is national and keyless, so nothing external blocks this. Two steps: (1)
  immediately, widen `MDS_CITY_BBOXES` to the ~60 Spanish municipalities above 50 k inhabitants — pure
  list work, each box costing ≈ (span/0.02°)² raster tile pairs, and it reaches Ciudad Real this week;
  (2) structurally, stop hand-typing the list. The join **already** buckets footprints into populated
  cells and visits only populated ones, so the only reason a country list exists is the **V8 heap**
  (~1.26 kB/footprint, §HEIGHT-STAMP-BUDGET). Process the country in **K latitude bands**, retaining one
  band per pass and streaming the rest through — K passes of file I/O, the network cost unchanged
  because it was always bounded by populated cells. That converts the working set from a *policy* into a
  *consequence of where the buildings are*, which is what it should have been.

### 2.2 `france` — `mnh_fr` — **NEEDS TILING** *(the cheapest large win in this audit)*

- **(a)** Pinned dispatch chain → `stampMnhFrHeightsOnGeojsonseq` (`heightSources.mjs`), pure half in
  `heights/mnhFr.mjs`. IGN Géoplateforme MNH LiDAR HD; the **pixel already is height above ground** —
  this stamp never differences two rasters.
- **(b)** **Hard-coded city list**, 13 rows (`MNH_FR_CITY_BBOXES`), priority *and* retained.
- **(c)** Covered: paris · lyon · marseille · toulouse · nice · nantes · strasbourg · montpellier ·
  bordeaux · rennes · grenoble · sète · lille. **Uncoverable — and this is the important part, because
  the file itself measured that IGN PUBLISHES THE DATA for them:** re-measured 2026-09-05 by hits query,
  **reims 56 · le havre 61 · clermont 56 · rouen 50 · tours 51 · orléans 56 · metz 54 · nancy 55 · caen
  53 · angers 58 · saint-étienne 56 · le mans 54 · amiens 56 · limoges 63 · besançon 52 · mulhouse 56 ·
  toulon 63 · perpignan 81 · nîmes 74 · avignon 56 · aix 59 · ajaccio 38 · bastia 24 · biarritz 47 · la
  rochelle 50** published dalles each — **27 towns whose measured heights exist and cannot be
  requested.** The module states the conclusion itself: *"the binding limit on SOLID French context is
  THIS FILE'S CITY LIST … not IGN's publication"*. ⚠ **Dijon (0 dalles) and Lille (0 on 2026-09-04) are
  a SOURCE gap, not a working-set gap** — do not conflate them; Lille is deliberately listed anyway so
  the next re-bake picks it up the day IGN publishes.
- **(d)** Same as Spain — silent at the pixel. **One thing France does better and everyone else should
  copy:** the stamp runs a per-area `RESULTTYPE=hits` **coverage precheck** (~100 ms) and *reports a
  zero-dalle area by name as a skip*. That is the failure/empty split done correctly at the AREA level.
  It still says nothing about areas that were never in the list.
- **(e) Fix.** Add the 27 measured-covered towns to `MNH_FR_CITY_BBOXES` — ~27 lines, and the precheck
  makes it self-limiting (a town IGN has not published costs one 100 ms hits request and is skipped by
  name, exactly as Lille is today). Cost per town ≈ its populated 0.01° cells × ~4.6 MB × ~4 s (Marseille
  proof: 6 cells / 28 MB / 29 s). Then the same K-band structural fix as Spain. France should go first
  on the arithmetic; see the founder-priority note in §3.

### 2.3 `germany` — `lod2de` — **NEEDS TILING** *(+ KEY-GATED `he`, NONE `hb`/`sl`/`by`)*

- **(a)** `NATIONAL_STAMP_TABLE.lod2de` → `stampDeLod2LaenderHeightsOnGeojsonseq`; a **per-Land router**
  (`heights/deLod2Laender.mjs`) behind one NRW-shaped stamp.
- **(b)** **Index lookup *inside* a hard-coded city list** — the only hybrid in the repo. Each Land door
  reads its own tile index (S3 listing for `ni`, a 2×2 km MVT grid for `bw`, a WFS for `st`, …), but
  `DE_LOD2_CITY_BBOXES` is `DE_LOD2_CITIES.filter(status === 'wired')` — **one city per Land**, 12 rows.
- **(c)** Covered: berlin · hamburg · potsdam · kiel · erfurt · mainz · schwerin · magdeburg · köln ·
  hannover · dresden · stuttgart. **Uncoverable although their Land's door is WIRED:** **Düsseldorf**
  (6.773, 51.227) · **Dortmund** (7.466, 51.514) · **Essen** (7.013, 51.458) — the entire Ruhr, ~5 M
  people, in `nw`, the *first* Land ever wired. Separately **blocked at the source**: `he`
  (Frankfurt — gds.hessen.de requires registration), `hb`/`sl` (Bremen, Saarbrücken — door not located /
  bot shield), `by` (**Munich — probed OPEN, CC BY 4.0, and deliberately UNARMED**).
- **(d)** Silent at the pixel; **loudest in-repo at the Land level** — a Land whose index is down is
  named BLOCKED for the run while the others still stamp, and `routerSummary()` prints every Land's
  status. Nothing distinguishes "Dortmund is in a wired Land but not in the list".
- **(e) Fix.** Two different jobs, do not merge them. (i) **List work, no new sourcing:** add the major
  cities of the twelve wired Länder — the Ruhr first (Düsseldorf/Dortmund/Essen/Duisburg/Bochum, all
  `nw`, the door already proven at Köln's 182 Kacheln). (ii) **Arm `by`** — it is probed open and CC BY
  4.0 and Munich is a founder city; the only thing between it and heights is that the brief did not name
  it. Whole-Land tiling is genuinely expensive here (CityGML tiles at 10–50 MB), so Germany is the one
  region where a *bounded, ranked* list stays the right answer for longer — but the list must be ranked
  by population, not by "one per Land".

### 2.4 `greatbritain` — `ealidar_gb` — **NEEDS TILING (England) / NONE (Scotland, Wales)**

- **(a)** `NATIONAL_STAMP_TABLE.ealidar_gb` → `stampEaLidarGbHeightsOnGeojsonseq`; EA First-Return
  DSM − DTM per OS 1 km square.
- **(b)** **Hard-coded city list**, 5 rows, England only.
- **(c)** Covered: london · manchester · birmingham · leeds · bristol. **Uncoverable inside the EA
  envelope:** **Liverpool** (−2.991, 53.408) · **Sheffield** (−1.470, 53.383) · **Newcastle upon Tyne**
  (−1.618, 54.978). **Uncoverable because the SOURCE stops:** Glasgow/Edinburgh (Scotland — DSM
  GetCoverage at N 673500 → HTTP 500, above the 657601 envelope) and Cardiff/Swansea (Wales — HTTP 200
  **zero-fill**, 300×300 cells all 0.0, classified `void-zero`).
- **(d)** **This is the repo's best failure-vs-empty implementation and the model for the fix in §4.**
  `eaRasterVerdict()` splits `ok` / `void-nodata` / `void-zero` / `empty`, so Welsh zero-fill is counted
  as VOID and never as ground; `EA_LIDAR_GB_ASSESSED` records Edinburgh and Cardiff as machine-readable
  probed refusals with the exact HTTP answer. At the pixel it is still silent for Liverpool.
- **(e) Fix.** England: list work — add the ~20 largest English urban areas (each ≈ populated 1 km
  squares × 2 GetCoverage × ~4.2 MB). Scotland and Wales are **not** this module with a wider bbox and
  must not be added to this list: they need their own adapter, and the two named negatives (SRSP
  catalogue host timing out; DataMapWales listing 18 coverages, none LiDAR) are the starting point.

### 2.5 `netherlands` — `3dbag` — **NEEDS TILING** *(best cost-per-capita in the audit)*

- **(a)** `NATIONAL_STAMP_TABLE['3dbag']` → `stampNl3dbagHeightsOnGeojsonseq`.
- **(b)** **Hard-coded city list**, 6 rows.
- **(c)** Covered: amsterdam · rotterdam · utrecht · thehague · eindhoven · groningen. **Uncoverable:**
  **Tilburg** (5.091, 51.560) · **Breda** (4.776, 51.586) · **Nijmegen** (5.853, 51.842) — plus
  Maastricht, Arnhem, Haarlem, Leiden, Almere, Enschede.
- **(d)** Silent at the pixel. Loud where it counts at the cell level: `parseNl3dbagCollection()` returns
  **null** for a non-collection body and the caller must treat null as a **tile ERROR, never as "no
  buildings here"** — the axis-order trap (lat,lon `BBOX` → `numberMatched 0`, HTTP 200, over the densest
  cell in the country) is pinned by a URL test.
- **(e) Fix — and note the brief's premise is wrong here, which matters.** The brief asked whether NL is
  *"refused per-tile at whole-country scale"*. **It is not.** What is refused at whole-country scale is
  the *OGC API Features* channel (`limit`/`offset` count CityObjects, not features; ~28 kB/building) —
  and the stamp does not use it. It uses the **GeoServer WFS**, whose `pand` collection extent is **all
  of NL** (RD 10000,306250 → 287760,623690), whose `CountDefault` is 1,000,000, and which answers the
  densest 0.01° cell in the country **whole, in one response, 1.9 MB in 0.61 s**. The Netherlands is
  therefore the one region where a **true whole-country working set is affordable today**: ~17 k
  populated cells at ~0.6 s is a single-digit-hours sweep with no key, no raster decode and no heap
  pressure beyond the K-band bound. Do this one first as the proof of the K-band design, then port it.

### 2.6 `belgium` — `be_dhmv` — **NEEDS TILING (Flanders) / NONE (Wallonia)**

- **(a)** `NATIONAL_STAMP_TABLE.be_dhmv` → `stampBeDhmvHeightsOnGeojsonseq`; DHMV II DSM−DTM 1 m per
  500 m Lambert-72 tile, keyless.
- **(b)** **Hard-coded city list**, 5 rows.
- **(c)** Covered: antwerp · ghent · brussels · leuven · bruges. **Uncoverable but INSIDE the source's
  own envelope:** **Hasselt** (5.338, 50.930) · **Mechelen** (4.478, 51.028) · **Kortrijk** (3.265,
  50.828). **Outside the source entirely:** Liège, Charleroi, Namur — *"DHMV II stops at the regional
  border and the Walloon MNT/MNS (geoportail.wallonie.be) was not probed by this lane — an honest gap,
  said by name."*
- **(d)** Silent at the pixel. The Walloon gap is named in prose but is **not machine-readable** — unlike
  GB, Belgium has no `BE_ASSESSED` array, so nothing in code distinguishes "Liège: no source" from
  "Hasselt: source exists, list does not reach it". Two very different fixes, one indistinguishable
  rendering.
- **(e) Fix.** Flanders is list work (Hasselt, Mechelen, Kortrijk, Aalst, Sint-Niklaas, Ostend). Wallonia
  needs one probe of `geoportail.wallonie.be`'s MNT/MNS WCS and, if it answers, a second adapter —
  never a wider bbox on this one. Add a `BE_DHMV_ASSESSED` array in the `EA_LIDAR_GB_ASSESSED` shape so
  the Walloon refusal is a value rather than a sentence.

### 2.7 `switzerland` — `swiss` — **NEEDS TILING**

- **(a)** Pinned dispatch chain → `stampSwissHeightsOnGeojsonseq`; swisstopo swissSURFACE3D nDSM, two
  STAC lookups per populated LV95 km² tile.
- **(b)** **Hard-coded city list**, 9 rows. **(c)** Covered: zurich · geneva · bern · basel · lausanne ·
  winterthur · luzern · stgallen · lugano. **Uncoverable:** **Sion** (7.360, 46.233) · **Chur** (9.532,
  46.851) · **Neuchâtel** (6.931, 46.992) — plus Fribourg, Thun, Biel/Bienne.
- **(d)** Silent at the pixel; no capped-priority ambiguity (its retained set *is* the city list, stamped
  uncapped).
- **(e) Fix.** Switzerland is **9.4 deg²** and the source is national and keyless. This is the second
  cheapest true whole-country sweep after NL — the STAC lookup per tile is the only per-tile overhead and
  it is cacheable per collection. Widen to the 30 largest communes now; K-band whole-country next.

### 2.8 `austria` — `bev_at` — **NEEDS TILING**

- **(a)** `NATIONAL_STAMP_TABLE.bev_at` → `stampAtHeightsOnGeojsonseq`; BEV ALS DSM−DTM 1 m COG windows,
  keyless, *"coverage is the whole country (55 tiles)"*.
- **(b)** **Hard-coded city list**, 5 rows. **(c)** Covered: vienna · graz · linz · salzburg · innsbruck.
  **Uncoverable:** **Klagenfurt** (14.308, 46.624) · **Wels** (14.024, 48.163) · **St. Pölten** (15.625,
  48.204) — plus Villach, Dornbirn, Bregenz.
- **(d)** Silent at the pixel; a window that is all −9999 is correctly a VOID, not a ground height.
- **(e) Fix.** **55 national COG tiles** is the whole product — this is the closest any region is to
  "already whole-country", because the source is not tiled per city at all, it is 55 files. Replace the
  city list with the 55-tile index and let the K-band bound the heap. Small country, keyless, no excuse.

### 2.9 `czechia` — `cuzk_cz` — **NEEDS TILING**

- **(a)** `NATIONAL_STAMP_TABLE.cuzk_cz` → `stampCzHeightsOnGeojsonseq`; ČÚZK DMP 1G − DMR 5G
  `exportImage`, keyless, national.
- **(b)** **Hard-coded city list**, 5 rows. **(c)** Covered: prague · brno · ostrava · plzen · olomouc.
  **Uncoverable:** **Liberec** (15.056, 50.767) · **České Budějovice** (14.474, 48.975) · **Hradec
  Králové** (15.833, 50.209) — plus Ústí nad Labem, Pardubice, Zlín.
- **(d)** Silent at the pixel; outside-coverage returns the `-9999` sentinel and is honestly a void.
- **(e) Fix.** `exportImage` is a per-window service with no index to enumerate, so the K-band populated-
  cell sweep is exactly right here and needs no new sourcing. 17.8 deg², keyless. Widen to the 20
  statutory cities immediately as the interim.

### 2.10 `slovenia` — `gurs_si` — **NEEDS TILING** *(cheapest absolute fix in the audit)*

- **(a)** `NATIONAL_STAMP_TABLE.gurs_si` → `stampSiHeightsOnGeojsonseq`; GURS **KN STAVBE register**
  H2 − H3, keyless WFS. **This is a register attribute, not a raster** — no GeoTIFF decode, no DSM/DTM
  pair, no tile budget in the raster sense.
- **(b)** **Hard-coded city list**, 5 rows. **(c)** Covered: ljubljana · maribor · celje · kranj · koper.
  **Uncoverable:** **Novo Mesto** (15.168, 45.803) · **Velenje** (15.111, 46.359) · **Nova Gorica**
  (13.649, 45.955) — plus Ptuj, Murska Sobota.
- **(d)** Silent at the pixel. Correctly written as `tagged`, **not** `measured-lidar` — a register metre
  is not a LiDAR metre, and the module keeps them apart. That is C57 §1.5 done right.
- **(e) Fix.** **Delete the list.** Slovenia is 4.95 deg² and the source is a national register served
  over a keyless WFS; the whole country is a bounded number of WFS pages. There is no cost argument for a
  five-city working set here, only inertia. Do this one first as the *smallest* proof that a working set
  can be a country.

### 2.11 `estonia` — `ee_etak` — **NEEDS TILING**

- **(a)** `NATIONAL_STAMP_TABLE.ee_etak` → `stampEeEtakHeightsOnGeojsonseq`; ETAK `e_401_hoone_ka`
  `korgus_m` per footprint, keyless WFS — again a **register attribute**, not a raster.
- **(b)** **Hard-coded city list**, 4 rows. **(c)** Covered: tallinn · tartu · parnu · narva.
  **Uncoverable:** **Viljandi** (25.590, 58.363) · **Rakvere** (26.356, 59.346) · **Kuressaare**
  (22.489, 58.253) — plus Haapsalu, Kohtla-Järve.
- **(d)** Silent at the pixel. **(e) Fix.** Same as Slovenia: 15.4 deg², 1.4 M people, a national
  register over a keyless WFS. Delete the list; the whole country is affordable in one sweep.

### 2.12 `denmark` — `dhm` — **KEY-GATED + NEEDS TILING**

- **(a)** Pinned dispatch chain → `stampDhmHeightsOnGeojsonseq`. **`DATAFORDELER_API_KEY` gated** — no
  key → `status: 'blocked'`, loud, footprints keep the honest OSM default. The key **is** wired into
  `.github/workflows/context-bake.yml:208`.
- **(b)** **Hard-coded city list**, 4 rows — *"the four largest Danish urban areas … TO WIDEN COVERAGE:
  add a row. Each bbox costs ~(span/0.02°)² DHM raster tile pairs."*
- **(c)** Covered: copenhagen · aarhus · odense · aalborg. **Uncoverable:** **Esbjerg** (8.452, 55.467) ·
  **Randers** (10.036, 56.461) · **Kolding** (9.472, 55.491) — plus Vejle, Horsens, Roskilde.
- **(d)** Silent at the pixel; **the key gate itself is loud and correctly classified** — `blocked` is an
  external gate that warns and passes, distinguished from a pipeline defect, and from a source outage
  (`tilesProcessed === 0 && tileErrors > 0`), which is the best status taxonomy in the bake.
- **(e) Fix — and correct the brief's premise here too.** The brief said Denmark is *"refused per-tile at
  whole-country scale"*. What is refused is the **GeoDanmark `Bygning` WFS**, count-capped at ≤6000
  features — i.e. the *footprint enumeration*, which is precisely why the OSM-footprint join exists. The
  **DHM raster is national and per-tile fine**; the bound is the V8 heap, stated as such in the module.
  So: widen to Denmark's ~15 urban areas now, K-band whole-country next. 26.6 deg², one key already
  provisioned.

### 2.13 `norway` — `ndh_no` — **NEEDS TILING**

- **(a)** `NATIONAL_STAMP_TABLE.ndh_no` → `stampNoNdhHeightsOnGeojsonseq`; Kartverket NHM DOM − DTM,
  keyless, `<accessConstraints>None</accessConstraints>`, *"a NATIONAL 1 m grid"* (1250529 × 1600549).
- **(b)** **Hard-coded city list**, 3 rows — the **worst ratio in the repo, 0.007 %**.
- **(c)** Covered: oslo · bergen · trondheim. **Uncoverable:** **Stavanger** (5.733, 58.970) ·
  **Kristiansand** (7.995, 58.147) · **Tromsø** (18.956, 69.649) — plus Drammen, Ålesund, Bodø. Norway's
  fourth-largest city is not in the list.
- **(d)** Silent at the pixel; a no-data box returns the sentinel and is reported as a VOID.
- **(e) Fix.** The ratio is alarming but the *denominator* is misleading — 355 deg² of Norway is mostly
  sea, mountain and Svalbard-adjacent emptiness, and a populated-cell sweep would visit a small fraction
  of it. That is the argument **for** the K-band design, not against it: a hand-typed list must guess
  where people are, a populated-cell sweep already knows. Interim: add Stavanger, Kristiansand,
  Drammen, Tromsø, Fredrikstad, Ålesund.

### 2.14 `victoria` — `au_open` — **NONE** *(not a list problem)*

- **(a)** Pinned dispatch chain (listed FIRST, and pinned there by `auOpenHeightsWiring.spec.ts`) →
  `stampAuOpenHeightsOnGeojsonseq`.
- **(b)** **Hard-coded list of ONE** — `AU_OPEN_CITY_BBOXES` = `melbourne_cc`, the **City of Melbourne
  LGA's own open-data portal**. The bake region is the **whole state of Victoria**, 48.5 deg².
- **(c)** Covered: the Melbourne CBD LGA. **Uncoverable:** **Geelong** (144.360, −38.149) · **Ballarat**
  (143.850, −37.562) · **Dandenong** (145.215, −37.981) — and every Melbourne suburb outside the central
  LGA. **Widening the bbox would achieve nothing**: the source is one council's building dataset and it
  has no rows for Geelong.
- **(d)** Silent at the pixel — but **`AU_OPEN_HEIGHTS_ASSESSED` is the right pattern applied**: five
  machine-readable probed refusals with the exact evidence (ACT footprints have no height field; NSW
  portal has no matching service; Vicmap statewide has no height field; GA national → HTTP 403; ELVIS is
  a bulk portal, not a raster API).
- **(e) Fix.** **Not list work.** Either (i) contract the `victoria` bake region to the Melbourne
  metropolitan area so the shipped tileset stops implying statewide context it cannot height, or (ii)
  derive nDSM from ELVIS/Vicmap 1 m DEM footprints — the assessed record says no keyless WCS/COG was
  found, so that is a sourcing task, not a bake task. Until one of those, Victoria outside the CBD is
  honestly a 9 m carpet and the region's scope should say so.

### 2.15 `abudhabi` — `ad_ndsm` — **NEEDS TILING** *(server-bound, genuinely expensive)*

- **(a)** `NATIONAL_STAMP_TABLE.ad_ndsm` → `stampAdNdsmHeightsOnGeojsonseq`; DGE 50 cm DSM3 − DTM
  `exportImage`, keyless, catalogued Open Data sid 2012.
- **(b)** **Hard-coded list of ONE**: `abudhabi-core` [54.33, 24.43, 54.42, 24.50], **4.6 %** of the
  `abudhabi` region bbox. The **mosaic extent covers the emirate** (≈ lon 54.23–56.06, lat 23.37–25.00).
- **(c)** Covered: Al Markaziyah / Corniche / Al Zahiyah. **Uncoverable:** **Khalifa City** (54.580,
  24.420) · **Yas Island** (54.607, 24.499) · **Musaffah** (54.500, 24.350) — plus Saadiyat and Masdar.
- **(d)** Silent at the pixel; `hollowTiffVerdict` correctly separates an EMPTY (no coverage) from a
  partial and from a failure *before* `readRasters`.
- **(e) Fix.** This is the one row where the working set is **cost-justified and documented as such**:
  ~55 s per populated 0.01° cell (the server resamples 50 cm regardless of requested resolution, so
  asking for 2 m saves bandwidth, not time), 63 cells ≈ 1 h for the island core; the full region is
  ~1,363 cells ≈ 21 h, over any sane job ceiling. Fix = ask DGE for a tiled/COG distribution or a coarser
  pre-derived nDSM; meanwhile extend to Yas/Saadiyat/Khalifa/Musaffah as separate boxes with the hour
  cost written into the commit message, as `AD_CITY_BBOXES`' own header demands.

### 2.16 `newyork` / `sanfrancisco` / `boston` — `us_open` — **WHOLE-REGION ALREADY**

- **(a)** `NATIONAL_STAMP_TABLE.us_open` → `stampUsOpenHeightsOnGeojsonseq`; NYC `height_roof` (ft) ·
  SF `hgt_maxcm` · Boston `BLDG_HGT_2010` (ft), each from the city's own portal.
- **(b)** `stampBboxesFor` **filters `US_OPEN_CITY_BBOXES` to the row's OWN bbox** — working set ==
  region, **100 %**. There is no hole inside these regions and none is asserted.
- **(c)/(d)** The gap is one level up: only three US metros have a bake region at all, and each region
  bbox is a metro core (the Bronx at 40.845 and Staten Island are outside the `newyork` row, so they are
  `not-baked`, not `unmeasured` — a **different** and correctly-distinguished verdict).
- **(e)** **NONE at national scale** — the sources are three municipal portals; there is no US national
  building-height product wired. Widening is a region-list decision (add metros, each needing its own
  portal adapter), not a working-set decision.

### 2.17 `koln` — `lod2nrw` — **WHOLE-REGION ALREADY** *(fold candidate)*

City-sized region (0.019 deg²), `stampBboxesFor` returns `null` → the whole region is the working set.
It is fully duplicated by `germany`/`lod2de`'s `koln` row (byte-identical bbox) and heightSources.mjs
already says *"The koln city row stays until the orchestrator folds it."* No coverage gap; a tidy-up.

---

## 3 · Ranked by (population unreachable × how cheap the fix is)

> ⚠ **The population column is an ESTIMATE from general knowledge, not a measured figure from this repo
> or any probed dataset.** It exists only to ORDER the rows and must not be quoted as data. Everything in
> §1 and §2 is read from code; this table alone is judgement. Cost class: **A** = add rows / delete the
> list, source national + keyless + per-cell proven, whole-country affordable today (×1.0); **B** = same
> but the country is large enough that a true sweep needs the K-band design (×0.4–0.6); **C** =
> server-bound or key-gated (×0.2–0.7); **D** = no source — not a list problem at all (×0.1).

| # | region | ~pop unreachable | cost | score | verdict | the one thing to do |
|---|---|---|---|---|---|---|
| 1 | **france** | ~62 M | B (0.6) | **37** | NEEDS TILING | add the **27 towns IGN already publishes dalles for** — measured, listed in §2.2 |
| 2 | **germany** | ~79 M | B (0.4) | **32** | NEEDS TILING | add the Ruhr (`nw` door already proven) + **arm `by`/Munich**, probed open |
| 3 | **greatbritain** | ~53 M (England) | B (0.4) | **21** | NEEDS TILING | add the 20 largest English urban areas; Scotland/Wales are a separate adapter |
| 4 | **spain** | ~40 M | B (0.5) | **20** | NEEDS TILING | ⭐ **founder-reported** — widen to the ~60 municipalities >50 k, Ciudad Real first |
| 5 | **netherlands** | ~15 M | A (1.0) | **15** | NEEDS TILING | **do the whole country** — the WFS is national and answers a dense cell in 0.6 s |
| 6 | **czechia** | ~8.7 M | A (1.0) | **8.7** | NEEDS TILING | populated-cell sweep; `exportImage` needs no index |
| 7 | **switzerland** | ~7.5 M | A (0.8) | **6.0** | NEEDS TILING | 9.4 deg², keyless — widen to 30 communes, then whole-country |
| 8 | **belgium** (Flanders) | ~6.0 M | A (1.0) | **6.0** | NEEDS TILING | Hasselt/Mechelen/Kortrijk/Aalst/Ostend — inside DHMV's own envelope |
| 9 | **austria** | ~6.4 M | A (0.9) | **5.8** | NEEDS TILING | the source is **55 national COG tiles** — index them instead of listing cities |
| 10 | **denmark** | ~4.0 M | C (0.7) | **2.8** | KEY-GATED + NEEDS TILING | key is already in the workflow; widen to ~15 urban areas |
| 11 | **norway** | ~4.4 M | B (0.6) | **2.6** | NEEDS TILING | Stavanger + Kristiansand + Tromsø now; populated-cell sweep next |
| 12 | **slovenia** | ~1.6 M | A (1.0) | **1.6** | NEEDS TILING | **delete the list** — register WFS, 4.95 deg². The smallest possible proof |
| 13 | **greatbritain** (Sc + Wa) | ~8.6 M | D (0.1) | **0.86** | NONE | own adapter; SRSP + DataMapWales negatives already recorded |
| 14 | **estonia** | ~0.7 M | A (1.0) | **0.7** | NEEDS TILING | delete the list — register WFS, 1.4 M people |
| 15 | **victoria** | ~6.7 M | D (0.1) | **0.67** | NONE | contract the region's scope, or source a Victorian DSM — not a wider bbox |
| 16 | **belgium** (Wallonia) | ~3.7 M | D (0.1) | **0.37** | NONE | probe `geoportail.wallonie.be` MNT/MNS; second adapter if it answers |
| 17 | **abudhabi** | ~0.9 M | C (0.2) | **0.18** | NEEDS TILING | ask DGE for tiled/COG; 55 s/cell makes the full region a 21 h job |
| — | **us_open** ×3 | — | — | — | WHOLE-REGION ALREADY | no hole in-region; the gap is the region list |
| — | **koln** | — | — | — | WHOLE-REGION ALREADY | fold into `germany`/`lod2de` |

> ⭐ **Founder-priority override.** The arithmetic puts France first. **Spain should ship first anyway** —
> it is where the defect was reported, where the per-city dossiers and close-out already exist
> (`docs/04-reference/jurisdictions/es/**/HEIGHT.md`), and where a fix is verifiable against a named
> site the founder will re-test. Rank 1–4 are all the same edit repeated; do Spain, then France.

---

## 4 · The cross-cutting defect: *unreachable* and *no data* are the same value

Everything above shares one root, and it is not any country's list.

| stage | can it tell them apart? | evidence |
|---|---|---|
| the raster/WFS call | **YES, well** | `eaRasterVerdict` (`ok`/`void-nodata`/`void-zero`/`empty`); `parseNl3dbagCollection` → `null` is a tile ERROR, never an empty; `hollowTiffVerdict`; the FR `hits` precheck skips a zero-dalle area **by name** |
| the bake's outcome record | **PARTLY** | `recordNationalStampOutcome` keeps `status` / `measuredCount` / `tilesProcessed` / `tileErrors` / `sweepAborted` / `retainedFootprints` / `passedThroughFootprints` apart; `assertMeasuredHeights` separates `blocked` (external) from a source outage from a pipeline defect — **but it fails only at ZERO**, so 0.17 % coverage is green |
| the shipped tile | **NO** | an unstamped footprint has no `pryzm:height_src`, exactly like a footprint the source could not measure |
| the client | **NO** | `resolveContextHeight()` returns `assumed` for both; `summariseHeightProvenance` prints *"N ASSUMED 9 m default (X % fabricated)"* — true, and unable to say **why** |
| the probe | **NO** | `probe.mjs` has five verdicts — `unreachable · not-baked · empty · unmeasured · measured` — and **not one of them is "outside the working set"**. Ciudad Real probes as `unmeasured`, the same word Córdoba gets |

**Three concrete additions, in order of value:**

1. **A sixth probe verdict, `out-of-working-set`.** `probe.mjs` already reads `bake.mjs`-shaped config;
   given the point it can answer *"this location is outside every stamp bbox — no re-bake will change
   this"*, which is a **different sentence** from *"the source had nothing here"*. This is the smallest
   change that makes the founder's next report self-diagnosing.
2. **A coverage line in the measured-height gate.** `assertMeasuredHeights()` should print, per region,
   `stampAreas` and `passedThroughFootprints` as a **percentage**, and warn (not fail) below a declared
   floor. It already has both numbers in `heightJoinOutcomes`; it just does not divide them.
3. **A `*_ASSESSED` array wherever a source stops**, in the `EA_LIDAR_GB_ASSESSED` /
   `AU_OPEN_HEIGHTS_ASSESSED` shape. Belgium's Walloon gap and Germany's `hb`/`sl` are currently prose;
   prose cannot be rendered, counted, or asserted.

And the structural fix that retires this document: **make the working set a consequence of where the
buildings are, not a policy.** The joins already bucket footprints into populated cells and visit only
populated ones; the *only* reason a hand-typed country list exists is the V8 heap (~1.26 kB/footprint).
Process each country in **K latitude bands** — retain one band, stream the rest through, K passes of file
I/O — and the network cost is unchanged because it was always bounded by populated cells. Prove it on
**Slovenia** (smallest) and **the Netherlands** (cheapest per capita), then port it.

---

## 5 · What this audit did NOT establish

- **No live probe was run.** Every HTTP figure is attributed to the source note that measured it. If you
  need a current answer for a specific door, re-probe it and cite the exact status.
- **Population figures in §3 are estimates** (§3's own warning), used only for ordering.
- **Area % is not coverage %.** Metro boxes are where people are; the true population-reachability
  figure is much better than 0.1 % and is not measured anywhere. Measuring it — count footprints inside
  vs outside the working set, per region, from the bake's own clip — is a one-line addition to the gate
  (§4.2) and would replace this document's weakest column.
- **The `baked` flags in `MDS_CITY_BBOXES` are inert metadata** and were false once already
  (§BAKED-FLAG-IS-NOT-EVIDENCE). Nothing here reads them, and neither should anything else.

## 6 · How to re-measure — run these, do not re-read this file

```bash
# the three coverage specs (all green at HEAD e8ba3a7b, 2026-09-06)
npx vitest run tools/context-bake/__tests__/heightJoinCoverage.spec.ts
#  → Tests  4 passed | 1 expected fail (5)      ← the "expected fail" is THE STANDARD arm, by design
npx vitest run tools/context-bake/__tests__/mdsBboxCoversTerrainRegion.spec.ts
#  → Test Files  1 passed (1) · Tests  3 passed (3)
npx vitest run tools/context-bake/__tests__/ealidarGb.spec.ts tools/context-bake/__tests__/nl3dbag.spec.ts \
              tools/context-bake/__tests__/deLod2Laender.spec.ts tools/context-bake/__tests__/auOpenHeights.spec.ts \
              tools/context-bake/__tests__/esCatastro.spec.ts
#  → Test Files  5 passed (5) · Tests  145 passed (145)

# the working sets themselves, as the bake sees them (no bake, no network)
node -e "import('./tools/context-bake/heights/mnhFr.mjs').then(m=>console.log(m.MNH_FR_CITY_BBOXES.length))"

# the coverage table in §1 is reproducible from the exported constants + the bake region bboxes;
# heightJoinCoverage.spec.ts parses BOTH from source text and asserts the counts, so a drift fails there.
```

`heightJoinCoverage.spec.ts` is the enforcement half of this document. Its **THE HOLE** arm fails the day
a working set grows — which is the point: **the row and the range move in the same commit.**
