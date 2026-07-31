# Murcia (INE 30030) — Terrain & Building Heights

> **What this is.** The elevation + building-height half of the Murcia site-feasibility stack, probed
> live against a single concrete parcel. Every figure below was read from a live response by
> `tools/murcia-terrain-probe/` on the date stamped in each section; nothing here is copied from a
> catalogue or a vendor claim. Companion work (parcel / planning / envelope) is owned by a sibling
> agent — this file does **not** speak to zoning.
>
> **Session:** 2026-07-31 · **Status:** VERIFIED against live services · **Maintainer:** UNASSIGNED
>
> **Confidence vocabulary — used strictly.**
> **VERIFIED** = read from a live response this session. **ASSERTED-UNVERIFIED** = stated somewhere
> credible but not re-hit here. **UNKNOWN** = not established. A 403, a timeout, an auth wall, an
> empty-but-well-formed payload and a truncated-but-200 are **five different results** and are never
> collapsed into "failed". **Unknown ≠ 0.**

---

## The target

| Field | Value |
|---|---|
| Referencia catastral | `3481104XH6038S` |
| Coordinates (WGS84) | 38.006100, −1.138028 |
| EPSG:25830 (ETRS89/UTM30N) | E 663469.65, N 4208127.68 |
| Municipality | Murcia (INE 30030), Región de Murcia |
| Official parcel area (founder-stated) | 935 m² |
| **Catastro `areaValue` (VERIFIED live)** | **935 m²** — exact match |
| **Geometric area of the returned ring (VERIFIED)** | **935.4 m²** from 6 vertices — 0.04 % from declared |

Two independent confirmations of the parcel area (the declared attribute and the polygon's own
geometry) agree to within 0.4 m². The parcel is real, and we are measuring the right thing.

---

## 1. HEADLINE — the posting spacing, and what it can resolve

**This governs whether any other number on this page means anything, so it comes first.**

| | Horizontal posting | Vertical encoding | Cells across the ~30 m parcel | Can it resolve the parcel? |
|---|---|---|---|---|
| **IGN MDT05** (`Elevacion25830_5`) | **5.000 m** VERIFIED | **float** (mm decimals) via `ArcGrid` | **~6 × 6** | **Yes — marginally.** Enough for a Horn 3×3 kernel (n=36 interior cells over a 40 m window) |
| IGN MDT25 (`Elevacion25830_25`) | 25.0 m VERIFIED | integer metres | **~1.2 × 1.2** | **No.** |
| Competitor's EU-DEM 25 m | 25 m (their stated figure) | — | ~1.2 × 1.2 | **No.** |

### How the 5 m posting was VERIFIED (not inferred from the name)

A coverage *named* `_5` is not evidence of a 5 m posting. Two independent derivations from the
service's own `DescribeCoverage` were required to agree:

| Derivation | Result |
|---|---|
| `gml:offsetVector` pair | `[5,0]`, `[0,−5]` → **5.000000 m × 5.000000 m** |
| (domain envelope span) ÷ (grid-envelope cell count) | **5.000000 m × 5.000000 m** |
| `srsName` | `http://www.opengis.net/def/crs/EPSG/0/25830` — **EPSG:25830 confirmed**, `axisLabels="x y"`, `uomLabels="m m"` |

They agree exactly. **VERIFIED: 5.000 m posting in ETRS89 / UTM 30N.**

> ⚠ **Use the projected coverage, not the geographic one.** For `Elevacion4258_5` the same two
> derivations **disagree** (offsetVector 0.000045°; envelope÷grid 0.000032° × 0.000064°) because its
> grid-envelope and domain-envelope axes are transposed. The projected `Elevacion25830_*` coverages
> are internally consistent and give a pixel step that is already a known ground distance in metres.

### The second fidelity axis nobody states: VERTICAL quantisation

Posting spacing is only half of resolvability. The **same coverage** returns different vertical
fidelity depending on the requested format:

| `FORMAT=` | Encoding delivered | Vertical quantum | Verdict |
|---|---|---|---|
| `image/tiff` | **Int16** (`BitsPerSample 16`, `SampleFormat 2`), `ModelPixelScale [5,5,0]` | **1 m** | ✖ degrades slope |
| `ArcGrid` / `application/asc` | ESRI ASCII, **float** (e.g. `42.255 42.524 42.701`) | mm | ✔ **use this** |

At 5 m posting the Horn kernel spans 8 × 5 = 40 m, so a 1 m vertical quantum makes the **smallest
non-zero representable slope 1 m / 40 m = 2.5 %**. On the Int16 path the plot's slope distribution
collapses to a median of exactly 0.00 % with a p90 of 10.61 % — a bimodal quantisation artefact, not
terrain. **A "2.6 % slope" is literally one quantisation step on that encoding.**

> **The trap, stated plainly.** The competitor reports **2.6 %** from EU-DEM 25 m. Over a 30 m-wide
> plot that is one to two samples. Our own MDT25 reproduction over a 120 m window gives **2.41 %
> from n=9 cells** — statistically the same number. But over a window the size of the actual parcel
> (40 m), **MDT25 yields n=0 slope cells**: a 2×2 grid cannot even form a 3×3 kernel. **The 25 m
> product cannot produce a slope for this parcel at all.** Any 25 m-derived "plot slope" is
> necessarily borrowed from 100–150 m of surrounding ground.
>
> **PRYZM is currently in the same trap.** `tools/context-bake/terrain.mjs` `DTM_FETCH.es` requests
> `COVERAGEID=Elevacion4258_25` with `FORMAT=image/tiff` — i.e. **25 m posting AND Int16 vertical**,
> on the geographic coverage with the inconsistent grid metadata. All three are fixable today; see
> §7.

---

## 2. Terrain source of record

| Property | Value | State |
|---|---|---|
| Service | `https://servicios.idee.es/wcs-inspire/mdt` — OGC **WCS 2.0.1** | VERIFIED |
| Title | *"Modelos Digitales del Terreno de España"* | VERIFIED |
| Provider | Instituto Geográfico Nacional (IGN) / CNIG | VERIFIED |
| Provenance | *"procedentes de sensores LiDAR aerotransportados del proyecto **PNOA-LiDAR** del Sistema Cartográfico Nacional"* | VERIFIED (quoted) |
| Keyless? | **Yes** — no key, token or session used in any request on this page | VERIFIED |
| CRS | EPSG:25830 (ETRS89/UTM30N) native; also 4258 / 4326 / 4083 variants | VERIFIED |
| **Licence — `ows:Fees`** | *"No se aplican condiciones"* | VERIFIED (quoted verbatim) |
| **Licence — `ows:AccessConstraints`** | *"CC BY 4.0 scne.es"* | VERIFIED (quoted verbatim) |
| Vertical datum | **UNKNOWN** — not stated in the capabilities or DescribeCoverage. Spanish MDT is normally EVRS/Alicante orthometric, but that is **ASSERTED-UNVERIFIED** here. Resolve before any absolute-datum use. | UNKNOWN |
| Vertical accuracy | **UNKNOWN for this tile.** Not published per-coverage on the WCS. PNOA-LiDAR cycle specs are catalogued in `../../../SPAIN-HEIGHT-MEASUREMENT.md` but the *cycle covering Murcia* was not established. | UNKNOWN |

Coverages advertised (VERIFIED, full list): `Elevacion{4258,4326,25830,4083}_{1000,500,200,25,5}`.
**The finest is `_5`.**

### Finer products — what was and was not found

| Candidate | Result | State |
|---|---|---|
| **MDT02** on this WCS | `DescribeCoverage` for `Elevacion25830_2` and `Elevacion4258_2` → **HTTP 404 `ows:ExceptionReport`** | VERIFIED ABSENT **from this service**. Says nothing about MDT02 existing elsewhere. |
| **PNOA LiDAR point cloud** (LAZ) | CNIG Centro de Descargas reachable (HTTP 200 HTML) but it is a **session/JS download portal, not a keyless bbox API** | VERIFIED reachable; **not wireable as a live API**. A tile-index + file-download build. |
| **CARTOMUR** (`www.cartomur.com`) | HTTP 200, but a static JS portal shell — no OGC endpoint discovered from it | reachable; capability **UNKNOWN** |
| **IDERM** (`iderm.imida.es`) | **DNS/connection failure** from this machine | **UNKNOWN — not "absent".** Could be network-side. Re-probe from another network before concluding. |
| IGN elevation **WMS** | Serves `EL.ElevationGridCoverage`, `EL.ContourLine` (*curvasnivel*), `EL.SpotElevation` (*puntosacotados*) | VERIFIED — rendering service; **no finer grid than the WCS**. Contours/spot heights are a possible future vector refinement. |

**Conclusion: MDT05 at 5 m is the best keyless raster terrain available for Murcia today** — 5×
finer horizontally than the competitor's EU-DEM, and float rather than integer in the vertical.

---

## 3. Terrain figures — with method and `n`

**Method (identical for every row):** WCS 2.0.1 `GetCoverage`, `COVERAGEID` as stated,
`FORMAT=ArcGrid` (**float**), `SUBSETTINGCRS`=`OUTPUTCRS`=EPSG:25830 so a pixel step is a known
ground metre. Slope by the **Horn (1981) 3×3** kernel per interior cell. Aspect = **slope-weighted
circular mean** of downslope azimuth (unweighted azimuths on near-flat cells are noise). Every
payload validated against the ASCII header's own `ncols × nrows` before use.

### 3.1 MDT05 — 5 m posting, float vertical (**the figures to use**)

| Window | `n` slope cells | Elev min–max (m) | Elev range | Slope mean | median | p90 | max | Aspect |
|---|---|---|---|---|---|---|---|---|
| 1 km context | **39 204** | 32.30 – 51.98 | 19.68 m | **3.37 %** | 2.04 % | 7.95 % | 68.17 % | 132.9° (SE) |
| 120 m | **484** | 39.00 – 42.44 | 3.44 m | **3.84 %** | 2.94 % | 8.95 % | 19.67 % | 84.2° (E) |
| **40 m ≈ the parcel** | **36** | 40.00 – 41.65 | **1.65 m** | **5.55 %** | 6.24 % | 11.27 % | 14.78 % | 43.0° (NE) |

### 3.2 MDT25 — the same windows, for comparison only

| Window | `n` slope cells | Slope mean | Note |
|---|---|---|---|
| 1 km context | 1 444 | 1.68 % | integer vertical |
| 120 m | **9** | **2.41 %** | ← reproduces the competitor's 2.6 % |
| **40 m ≈ the parcel** | **0** | **—** | **2×2 grid; a 3×3 kernel cannot be formed** |

**Read the two tables together.** At the parcel's own scale MDT05 says **5.55 %** and MDT25 says
*nothing at all*. The 25 m answer that looks like "2.6 % — gentle" is a 120 m neighbourhood average,
and it understates the parcel's actual gradient by roughly **2×**.

### 3.3 Aspect honesty

Aspect is **scale-dependent here and should always be quoted with its window**: SE at 1 km, E at
120 m, NE at 40 m. The parcel sits on a locally NE-falling face inside a broadly SE-falling block.
Reporting a single aspect without its window would be misleading. *(The aspect formula was
unit-tested against five synthetic gradients — N/S/E/W/NE — after an initial implementation was
found to be mirrored about the E–W axis.)*

### 3.4 Rasant / datum at the façade — per-edge, not per-centroid

Spanish height ordinances measure from the **rasante at the façade**, not the mean plot level.
Sampling one centroid point answers a different question from the one the ordinance asks (the L-584
defect). MDT05 float, bilinear, boundary densified at 2 m:

| Edge | Length | Bearing | z min–max (m) | Fall along edge |
|---|---|---|---|---|
| 0 | 29.37 m | 50.3° | 40.25 – 41.00 | 0.75 m |
| 1 | 23.00 m | 140.3° | 40.00 – 40.37 | 0.37 m |
| 2 | 7.00 m | 140.3° | 40.00 – 40.00 | 0.00 m |
| **3** | **33.00 m** | **230.3°** | **40.00 – 41.56** | **1.56 m** ← steepest |
| 4 | 30.22 m | 327.2° | 40.91 – 41.21 | 0.31 m |

- **Boundary elevation range: 40.00 – 41.21 m; total fall across the parcel boundary 1.21 m.**
- **Centroid sample: 40.00 m — which is the boundary *minimum*.**

A naive single-point centroid datum would sit **1.21 m below the highest boundary point** and 1.56 m
below the top of edge 3. On a permitted-height calculation that is a real, one-directional error.
**Carry the per-edge profile, not a scalar.**

> **Interpolation ≠ resolution.** The 2 m densification interpolates *between* 5 m postings. It does
> not resolve sub-5 m relief, and kerb/pavement steps at the façade are invisible at 5 m. For a
> legally-defensible rasante, the 5 m grid is an **approximation of the façade datum**, not a survey.

---

## 4. Building heights

### 4.1 Catastro — the DECLARED layer

`https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` — WFS 2.0.0, **keyless** (VERIFIED).

> ⚠ **`numberOfFloorsAboveGround` (the INSPIRE encoding of Catastro's `ALTURAS`) is an
> administrative declaration recorded for fiscal/registry purposes — not a survey measurement.**
> It is never converted to metres by multiplication anywhere in this probe.

**Schema fact (VERIFIED, and it bites):** on the `bu-ext2d:Building` element the floor count came
back **`xsi:nil="true" nilReason="other:unpopulated"`**. Floor counts live on **`BuildingPart`**,
not on `Building`. A pipeline that reads floors off `Building` will silently get nothing.

### 4.2 The target parcel is VACANT — established two independent ways

| Evidence | Result | State |
|---|---|---|
| **Declared** — `GetBuildingByParcel(3481104XH6038S)` | HTTP 200, **well-formed `<gml:FeatureCollection>` with zero members**, closing tag present, no exception, `Content-Length` consistent | VERIFIED empty — **not** truncated, **not** an error |
| **Control** — same stored query on neighbour `3482901XH6038S` | HTTP 200, **1 `bu-ext2d:Building`**: `currentUse=1_residential`, 30 dwellings, 67 units, `grossFloorArea` 4999 m² | VERIFIED — **the stored query works**, so the target's emptiness is real vacancy, not a broken call |
| **Corroboration** — 200 m bbox scan | 12 distinct buildings returned; **none of them is `3481104XH6038S`** | VERIFIED |
| **Measured** — `mdsn_e025` nDSM inside the parcel ring | **n = 149 cells @ 2.5 m; min 0, max 0, mean 0; cells > 0.5 m: 0** | VERIFIED — no structure detected |

149 cells × 6.25 m² = 931 m² ≈ the 935 m² parcel, so the sampling geometry is confirmed correct.
**Declared vacancy and measured vacancy agree.** This is the four-way split's cleanest case.

> ⚠ **Vintage caveat on the measured half.** See §4.4 — the nDSM is 2009–2015 vintage, so on its own
> it could only prove "vacant as of the 1st LiDAR coverage". Catastro supplies the current-date
> evidence. The two together are what make this solid; neither alone would be.

### 4.3 Surrounding buildings — the MEASURED layer

`mdsn_e025` (CNIG *MDS normalizado Edificación*) — a **building-class nDSM**: the pixel value **is**
metres of building above ground, so no per-site DSM−DTM subtraction is needed.

| Property | Value | State |
|---|---|---|
| Service | `https://wcs-mds.idee.es/mds`, WCS 2.0.1, **keyless** | VERIFIED |
| Native CRS | **EPSG:3042** (`axisLabels="y x"` — northing first). Empirically the **same projection as 25830**: identical `xllcorner`/`yllcorner` returned for both `SUBSETTINGCRS` values, differing only in axis order | VERIFIED |
| Native posting | `offsetVector` **2.502229 m**; delivered resampled to a clean **2.500 m** grid | VERIFIED |
| Licence | `Fees:` *"No se aplican condiciones"* · `AccessConstraints:` *"CC BY 4.0 scne.es"* | VERIFIED (quoted) |

**Per-building statistic = P90 of interior cells.** Not `max` (inflated by lift overruns, antennae,
HVAC) and not `mean` (dragged down by sloped roofs and edge cells).

Over a 300 m box around the target (raster fetched with 120 m of padding so edge footprints are not
silently starved of samples):

| Outcome | Count | Meaning |
|---|---|---|
| **measured** (≥4 cells) | **188** | a defensible P90 |
| unmeasurable — footprint smaller than 4 cells (25 m²) | 289 | balconies, stairwells, small annexes. **Not "height unknown due to failure"** — genuinely below the raster's resolving power |
| in raster but too few cell centres | 4 | thin slivers |
| **Total `BuildingPart`s returned** | **481** | payload well-formed; `count` cap of 800 not hit, so **not truncated** |

### 4.4 Declared vs measured — the cross-check, and why `levels × 3.2` is not good enough

For the 99 parts carrying **both** a measured P90 and a declared floor count:

| Observed metres per floor | Value |
|---|---|
| n | **99** |
| median | **3.51 m** |
| p10 – p90 | **3.08 – 4.55 m** |
| min – max | 0.65 – 5.05 m |

*Method: measured nDSM P90 ÷ declared `numberOfFloorsAboveGround`; parts with P90 ≤ 1 m or 0 declared floors excluded.*

The median lands near the usual 3.2–3.5 m rule of thumb — **but the spread does not.** The p10–p90
band is 3.08–4.55 m, i.e. a 7-storey building could be anywhere from ~21.6 m to ~31.9 m on a
constant-multiplier estimate: **a ±5 m, ~1.5-storey error band.** That is exactly the blur that
ruins massing and shadow studies. Use the nDSM where it exists; treat `levels × k` as a
**plausibility check**, never a height.

> **Methodological caveat, stated because it inflates the spread.** `BuildingPart`s are *2D
> subdivisions* of one building, so a small part nested inside a taller building's envelope samples
> the taller roof (visible above: parts declaring 6, 7 and 8 floors all returning P90 ≈ 24.6 m).
> Per-part metres-per-floor is therefore noisier than per-*building* would be. The honest reading is
> "a constant multiplier is unreliable", not "the true spread is exactly 3.08–4.55".

> ⚠ **VINTAGE — the most important caveat on every measured height here.** The MDS abstract states
> the product is *"generados a partir del **MDT-LIDAR 1ª cobertura**"* (VERIFIED, quoted). Per the
> PNOA cycle table in `../../../SPAIN-HEIGHT-MEASUREMENT.md`, the **1st coverage is 2009–2015** at
> 0.5 pt/m². So `mdsn_e025` heights are **~10–16 years old**: anything built or raised after ~2015
> reads **0 or too low**. A 0 in this raster means *"no building in 2009–2015"*, **never** "no
> building today" — that question is Catastro's to answer. Newer PNOA coverages (2nd, 3rd) exist as
> **point clouds** but are **not** reflected in this derived raster.

---

## 5. TASK 3 — the honest LOD statement for `3481104XH6038S`

The four-way split, not a single number:

### MEASURED (an instrument observed it)
- **Terrain elevation** across the parcel: **40.00 – 41.65 m** (MDT05, 5 m posting, float vertical, PNOA-LiDAR derived). n=64 elevation samples over the 40 m window.
- **Parcel boundary rasant profile**: 40.00 – 41.21 m, fall 1.21 m, per-edge (§3.4).
- **Slope at parcel scale**: mean **5.55 %**, median 6.24 %, p90 11.27 % — n=36 Horn cells at 5 m posting.
- **Absence of any structure on the parcel** as of the 1st PNOA-LiDAR coverage: nDSM = 0 across all 149 cells.
- **Neighbouring building heights**: 188 footprints with an nDSM P90 (2.5 m posting, 2009–2015 vintage).

### DECLARED (an authority recorded it; nobody surveyed it for us)
- **Parcel area 935 m²** and its 6-vertex geometry — Catastro `areaValue` + `cp:CadastralParcel`.
- **No building registered on the parcel** — Catastro BU returns a well-formed empty collection.
- **Neighbour floor counts** (`numberOfFloorsAboveGround`), uses, dwelling counts, gross floor areas — administrative records, not measurements.

### ESTIMATED (derived by us, with a method and an error band)
- **Observed metres-per-floor for this neighbourhood**: median 3.51 m, p10–p90 3.08–4.55 m (n=99) — a *diagnostic*, explicitly not used to synthesise any height.
- **Boundary elevations at vertex precision** — bilinear interpolation *between* 5 m postings; the underlying grid does not resolve sub-5 m relief.

### UNKNOWN (say so; do not default to zero)
- **Vertical datum** of the MDT — not stated by the service. Blocks absolute-datum work.
- **Vertical accuracy for the Murcia tile** — not published per-coverage; the covering PNOA-LiDAR cycle was not established, so no RMSE can be attached to any elevation above.
- **Sub-5 m terrain detail** — kerb lines, pavement steps, the actual façade-line rasante. Not resolvable from MDT05.
- **Any building height on the parcel** — there is no building. Not 0 m: **not applicable**.
- **Post-2015 built form anywhere in the surround** — invisible to this nDSM.
- **Regional IDERM holdings** — host unreachable from this machine; genuinely unknown, not absent.
- **Whether MDT02 exists for Murcia by another route** — only its absence from the national INSPIRE WCS is established.

---

## 6. Municipality-wide feasibility — **YES, bake it**

Request-cap escalation on MDT05, each payload validated cell-by-cell against its own header:

| Box | Grid | Cells (got/expected) | ASCII bytes | Wall time | Verdict |
|---|---|---|---|---|---|
| 0.5 km | 100×100 | 10 000 / 10 000 | 0.07 MB | 379 ms | grid-ok |
| 2 km | 400×400 | 160 000 / 160 000 | 1.12 MB | 640 ms | grid-ok |
| 4 km | 800×800 | 640 000 / 640 000 | 4.48 MB | 1.2 s | grid-ok |
| 8 km | 1600×1600 | 2 560 000 / 2 560 000 | 18.25 MB | 4.5 s | grid-ok |
| **16 km** | **3200×3200** | **10 240 000 / 10 240 000** | **74.61 MB** | **13.7 s** | **grid-ok — no truncation** |

**A single request returns a 16 km × 16 km MDT05 tile — 10.24 M cells — intact.** Measured ASCII
cost 7.29 bytes/cell.

Scaling to the municipality (area **881.86 km² — ASSERTED-UNVERIFIED**, see caveat):

| Product | Cells | float32 | Int16 | 16 km tiles |
|---|---|---|---|---|
| **MDT05** | 35.3 M | **141 MB** | 71 MB | **4** |
| MDT25 | 1.4 M | 5.6 MB | 2.8 MB | 4 |

**Verdict: municipality-wide MDT05 is comfortably feasible — roughly 4 requests and ~141 MB float32.**
Bake it once per city, exactly as the existing `tools/context-bake` terrain pipeline already does for
other countries; per-site retrieval is *not* required and would be slower and ruder to IGN. Licence
permits redistribution with attribution (`CC BY 4.0 scne.es`).

> ⚠ **The 881.86 km² figure is ASSERTED-UNVERIFIED.** The IGN administrative-unit WFS returned a
> well-formed envelope for `nationalCode='30030'`, but a containment gate caught that the envelope
> (lat 42.35–43.06) **does not contain the target site at 38.006** — the `CQL_FILTER` was silently
> ignored and a different municipality was returned. Rejected rather than believed. The feasibility
> conclusion is robust to this: even at 4× the assumed area it is ~16 tiles / ~560 MB.

---

## 7. Integration points (no `packages/**` was touched)

The probe is standalone in `tools/murcia-terrain-probe/`. To land these findings in the product:

1. **`tools/context-bake/terrain.mjs` → `DTM_FETCH.es` — three defects, all one-line fixes.**
   Currently `{ kind:'wcs2-geo', coverageId:'Elevacion4258_25', FORMAT=image/tiff }`.
   - `Elevacion4258_25` → **`Elevacion25830_5`** (25 m → 5 m posting).
   - `FORMAT=image/tiff` → **`ArcGrid`** (Int16 → float; needs an ESRI-ASCII reader — ~30 lines, see `parseAsc` in `probe-04`).
   - `kind:'wcs2-geo'` (EPSG:4326) → **projected `wcs2` on EPSG:25830**, avoiding the geographic coverage's transposed grid metadata.
   ⚠ Spain spans UTM 28–31N; 25830 is zone 30 and correct for Murcia, but the adapter must select the zone per city (Barcelona is 25831). The **MDS** service sidesteps this with its single all-Spain zone-30 frame.
2. **`tools/context-bake/heightSources.mjs`** already wires `mdsn_e025` correctly and can request it in native EPSG:25830 (VERIFIED) rather than 4326, removing a reprojection.
3. **Height provenance** must carry the **vintage** (PNOA-LiDAR 1st coverage, 2009–2015) alongside the value. This is the graded, source-tagged provenance flagged as a C23 coverage gap in `../../../SPAIN-HEIGHT-MEASUREMENT.md` §3 — do not collapse it to a binary REAL/ESTIMATED badge.
4. **Rasant**: whatever consumes a site datum must accept a **per-edge profile**, not a scalar centroid (§3.4, L-584).
5. **`../HEIGHT.md`** (Axis 6 currently `not-assessed` / `not-queried`) can be updated from §4 — the MDS coverage probe it asks for is now done.

---

## 8. Reproducing

```bash
node tools/murcia-terrain-probe/probe-01-sources.mjs      # enumerate IGN coverages
node tools/murcia-terrain-probe/probe-02-posting.mjs      # VERIFY posting spacing (the gate)
node tools/murcia-terrain-probe/probe-03-terrain.mjs      # int16 path — kept as encoding evidence
node tools/murcia-terrain-probe/probe-04-terrain-float.mjs # DEFINITIVE slope/aspect (float)
node tools/murcia-terrain-probe/probe-05-buildings.mjs    # Catastro parcel + buildings
node tools/murcia-terrain-probe/probe-06-ndsm.mjs         # measured heights + vacancy control
node tools/murcia-terrain-probe/probe-07-finer.mjs        # MDT02 / LiDAR / CARTOMUR / IDERM
node tools/murcia-terrain-probe/probe-08-rasant.mjs       # per-edge boundary datum profile
node tools/murcia-terrain-probe/probe-09-scale.mjs        # request cap + municipality budget
```

All responses cache to `tools/murcia-terrain-probe/cache/` (sha1 of URL) — re-runs never re-hit
IGN or Catastro. Requests are serialised per host with a 900 ms minimum gap. Outputs are the
`out-0N-*.json` files beside the probes.

---

## 9. Cross-references

- `../../../SPAIN-HEIGHT-MEASUREMENT.md` — nDSM method, PNOA accuracy by cycle, the three-field height badge.
- `../../../ES-GEOSPATIAL-DATA-INVENTORY.md` — rows 6/7/9 (MDS Edificación, MDT, PNOA LiDAR). **This file re-probes and tightens rows 6 and 7**, and adds the posting/encoding facts they lacked.
- `../HEIGHT.md` — Murcia Axis 6 status (updatable from §4).
- `../../../../GEO-DATA-SOURCING-MASTER.md` — per-country terrain + heights map.

*All figures VERIFIED live 2026-07-31 by `tools/murcia-terrain-probe/`. §CONTEXT-DATA-HONESTY.*
