# Córdoba (INE 14021) — Raster-to-Parcel Zoning Reconstruction: Feasibility Validation, 2026-08-05

> **Task type: VALIDATION / PROTOTYPE ONLY.** No production code, rule pack, dispatcher, provider,
> or verification gate was modified or signed. Nothing was written into `packages/site-parcel-data/src/`
> or `apps/editor/src/`. All prototype code lives in a scratch directory (path in §0.3) and is
> reproduced inline below. Every number in this document was computed from real data fetched live
> this session — no figure is estimated, rounded from memory, or carried over from another doc
> unless explicitly cited.

---

## Executive summary

**The hypothesis largely holds, and two blockers recorded in the prior dossier turned out to be
wrong.** Measured on CUS41W (a sheet with both a corpus raster and live COACo vector ground truth):

| Question | Measured answer |
|---|---|
| **Phase 2** — zoning boundary within 1 m of a cadastral parcel boundary | **66.9 %** (chance: 14.8 %) |
| **Phase 2** — within 5 m | **86.1 %** (chance: 41.6 %) |
| **Phase 2** — explainable by parcel edge *or* road centreline @ 5 m | **94.8 %** |
| **Phase 2** — zone line cutting *through* a parcel @ 5 m (the damaging case) | **2.2 %** |
| **Phase 6** — parcel-level zone accuracy vs held-back COACo vector | **90.8 %** ungated; **95.8 %** at confidence ≥ 0.85 (79.8 % coverage) |
| **Phase 6** — area-weighted accuracy | **93.5 %** |
| **Phase 5** — micro-average IoU over parcel-covered area | **0.808** |

**Two prior findings are overturned by measurement:**

1. **The CUS sheets' printed UTM grid is ED50 / UTM30N (EPSG:23030), not ETRS89 (EPSG:25830).**
   Reading them as ETRS89 — which every prior Córdoba georeferencing note implicitly did — misplaces
   every feature by **≈ 234 m**. Measured offset (−113.7, −202.3) m against `pyproj`'s
   canonical ED50→ETRS89 shift at Córdoba of (−111.1, −206.0) m: agreement within ~4 m. §2.2.
2. **The 49-sheet series is a regular grid, so georeferencing is batch-automatable.**
   `CUS-CONTROL-POINTS-2026-08-04.md` concluded control-point picking is "per-sheet, not batch" and
   `GEOREFERENCING-FEASIBILITY-2026-08-04.md` concluded raster georeferencing is "not automatable
   today". Both are refuted: CUS34W was georeferenced **by arithmetic alone** from CUS41W's
   calibration plus automated frame detection, with a residual of **1–4 px**. §2.3.

**Recommendation: APPROVE WITH LIMITATIONS.** Justification in §9 / §11 — it rests on a
per-class precision failure, not on the aggregate accuracy, which passes the pre-declared bar.

---

## 0. Method, provenance and honesty statement

### 0.1 What is real ground truth here

| Item | Source | Status |
|---|---|---|
| Zoning ground truth | `coaco:ordenanzas`, `https://geoserver.pgou.coacordoba.org/geoserver/wfs` | **LIVE, fetched 2026-08-05.** 191 real polygons in the CUS41W extent, native EPSG:25830 |
| Cadastral parcels | Catastro INSPIRE CP WFS, `http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` | **LIVE, fetched 2026-08-05.** 3 461 real parcels, native EPSG:25830, tiled at 200 m |
| Raster | `corpus/cus/CUS41W.jpg`, 1882×1443 px | Held locally, real |
| Legend colours | Sampled from the sheet's own *ZONAS DE ORDENANZA* panel | Measured, §3.1 |

**No synthetic stand-in was used anywhere.** Both government services responded; nothing in this
report is a substitute for data that could not be obtained.

### 0.2 Independence of the georeference (matters for Phase 6 validity)

The pixel→UTM transform is derived **only** from (a) the sheet's own printed neat-line frame,
detected by dark row/column profiling, (b) the sheet's own printed corner UTM tick values, and
(c) the standard ED50→ETRS89 datum shift via `pyproj`. **It does not use the COACo vector.**
The COACo layer was used only to *discover* the datum error (§2.2) and then to *score* results —
after which the transform was rebuilt from first principles and re-validated. Phase 6 is therefore
a genuine held-out test of the zoning answer, not a circular fit.

One caveat stated plainly: the datum error was *found* by cross-correlating against the ground
truth. On a sheet with no vector counterpart nobody would have noticed it that way. It is,
however, independently confirmed by `pyproj` to within 4 m and by the epoch of the document
(Texto Refundido, October 2002 — five years before Spain's ETRS89 mandate), so the correction is
now a general, citable fact about the whole series, not a per-sheet fit.

### 0.3 Where the prototype code lives

Scratch directory (session-scoped, **not** in the repo):

```
C:\Users\LENOVO\AppData\Local\Temp\claude\c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08\
  cf456fb9-1de3-436b-bc9e-6d65531496a9\scratchpad\cus41w\
    geo.py                    — georeferencing + loaders + legend palette (reproduced §2.4)
    fetch_parcels.py / fetch_parcels2.py — Catastro INSPIRE tiled fetch
    validate_affine.py / validate_affine2.py — failed grayscale + ink registration attempts (§2.1)
    xcorr.py / xcorr2.py      — FFT cross-correlation datum discovery (§2.2)
    grid_test.py              — 49-sheet grid hypothesis test (§2.3)
    phase2_coincidence.py     — boundary coincidence (§2.5)
    phase2b_centreline.py     — road-centreline split + Phase 7 timing (§2.6, §7)
    phase3_colour.py          — colour classification + confusion matrix (§3)
    phase3b_chroma.py         — chroma-aware classifier (§3.4)
    phase456_parcels.py       — parcel classification + validation (§4, §5, §6)
    phase578_analysis.py      — IoU ceiling, confidence gating, failure modes (§5, §8)
```

Being scratch, this will not survive the session. Key scripts are reproduced inline below; §9
states what would have to be rebuilt if the pipeline is ever approved for production.

### 0.4 Tooling

Present: Python 3.14, PIL 12.3.0, numpy 2.5.1. Installed this session via `pip` (all succeeded):
`shapely 2.1.2`, `scipy 1.18.0`, `pyproj`, `scikit-image`. No GDAL/rasterio/cv2 needed — PIL +
numpy + scipy covered every raster operation. `pyproj` is the one genuinely load-bearing addition
(the datum shift).

---

## 1. Phase 1 — Current assets

### 1.1 Raster sheets

All **49/49** CUS sheets are present in `corpus/cus/` and all are **real files**, not stubs:
sizes 136 617 – 515 743 bytes, dimensions ~1880×1440.

This is worth stating explicitly because `CLOSURE-REGISTER.md` row 22 records that, probed
2026-08-02 against the publisher, **41 of 49 returned a 69-byte "Server under construction" page**
and concluded "the marginal raster gain available today is 2 sheets, not 69." The corpus was
subsequently filled by another route (2026-08-04, per `README.md` and `corpus/MANIFEST.md`).
**That row's sizing is now stale in PRYZM's favour** — the material to run this pipeline on exists
locally for the whole city. (This report does not edit that register; flagging it for whoever owns it.)

Measured detail relevant to scaling: the 49 sheets have **41 distinct pixel dimensions**, so each
sheet needs its own frame detection. §2.3 shows that step is automatable.

### 1.2 Vector zoning

`coaco:ordenanzas` — live, EPSG:25830, attributes `ordenanza`, `et`, `sup_m2`, `link`. Only the
**6** sheets named by `coaco:hojas_cus` (`CUS25W, CUS26W, CUS34W, CUS41W, CUS45W, CUS46W`) are
vectorised; those are the 2-district pilot. Families observed in the CUS41W extent:

| `ordenanza` | polygons |
|---|---:|
| Colonia Tradicional Popular | 82 |
| Manzana Cerrada | 63 |
| Ordenacion Abierta | 35 |
| Elemento protegido | 4 |
| Uso Comercial | 5 |
| Plurifamiliar aislada | 1 |
| Uso Industrial | 1 |

### 1.3 Parcel data

The repo already carries a Spain-wide Catastro pattern (`packages/site-parcel-data/src/providers/*Bbox.ts`
reference the `catastro.hacienda.gob.es/INSPIRE/CadastralParcels/**` ATOM feeds; `server/parcelZoningProxy.js`
uses the OVC coordinate service). For this experiment the INSPIRE **WFS** was used directly.
Verified behaviour worth recording:

- Endpoint: `http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`, WFS 2.0.0, `typeNames=cp:CadastralParcel`.
- `STOREDQUERIE_ID=GetParcelsByBBOX` → `Unknown STOREDQUERIE_ID`; a **plain `bbox=` GetFeature works**.
  (Another instance of the [[bulk-vs-query-endpoint-false-refusals]] pattern — the documented
  stored-query name is wrong, the plain query serves it.)
- `srsName=EPSG::25830` honoured; **`gml:posList` axis order is X Y (easting northing)** — verified
  against the raw XML before parsing, not assumed. Getting this backwards silently produces garbage.
- bbox must be tiled; 200 m tiles returned 22–~300 features each. 3 461 parcels over the sheet.

### 1.4 CRS inventory

| Thing | CRS |
|---|---|
| CUS raster printed grid | **ED50 / UTM 30N — EPSG:23030** ⭐ (this report's finding, §2.2) |
| `coaco:ordenanzas` | ETRS89 / UTM 30N — EPSG:25830 |
| Catastro INSPIRE CP | ETRS89 / UTM 30N — EPSG:25830 |
| `resolveCordobaSubzone.ts` query frame | WGS84 lon/lat, reprojected server-side by the C57 proxy |

---

## 2. Phase 2 — Georeferencing and boundary coincidence (the core empirical test)

### 2.1 Two registration attempts that FAILED (recorded, not hidden)

**Attempt 1 — grayscale darkness.** Rasterise parcel boundaries, score mean grayscale under them,
scan ±12 px. Result: a **completely flat surface**, 133.6–136.8 mean gray across the whole search.
Cause: the sheet is a saturated colour map, so grayscale is dominated by *which colour field* a
point lands in, not by linework. Bad metric.

**Attempt 2 — achromatic ink mask.** Better metric (`max(RGB) < 130 AND (max−min) < 45`, i.e. dark
and near-neutral = printed black linework; 12.44 % of the map frame). Score = % of parcel-boundary
sample points landing on ink:

```
at (0,0):        15.08 %
best in ±10 px:  16.24 % at (+10,+10)
control +30 px:  15.82 %      <-- HIGHER than the "correct" alignment
control +60 px:  15.13 %      <-- identical to the "correct" alignment
random baseline: 12.44 %
```

**There is no registration peak.** Shifting parcels 30–60 m gives the same or better score. At this
point the honest reading was either "the affine is badly wrong" or "the sheet's linework simply is
not cadastral". Attempt 3 settled it.

### 2.2 ⭐ The decisive finding — the sheets are in ED50, not ETRS89

Control experiment: COACo digitised `coaco:ordenanzas` **from these very sheets**, so its polygons
must align if the affine is right. FFT cross-correlation between (a) raster pixels near each
legend swatch colour and (b) that family's COACo polygons rasterised under the frame affine:

| family | polygons | dx (px) | dy (px) |
|---|---:|---:|---:|
| Elemento protegido | 6 | +114 | −203 |
| Colonia Tradicional Popular | 79 | +115 | −202 |
| Manzana Cerrada | 65 | +113 | −203 |
| Ordenacion Abierta | 31 | +113 | −203 |
| Plurifamiliar aislada | 1 | +105 | −219 |
| Uso Comercial | 4 | +113 | −204 |

**Five independent zone families agree to within 2 px on a single, large, constant offset** — and
the offsets do not diverge across the sheet, so the *scale* was already correct and this is a pure
translation. Converting to metres: COACo's ETRS89 coordinates are smaller than the sheet's printed
grid by **(113.7, 202.3) m**.

That is the ED50→ETRS89 datum shift. Confirmed with `pyproj`:

```
EPSG:23030 -> EPSG:25830 at Córdoba:  dE = -111.1 m,  dN = -206.0 m   (constant across the sheet)
measured by cross-correlation:        dE = -113.7 m,  dN = -202.3 m
agreement:                            2.6 m E, 3.7 m N
```

The residual is within the ±2 px frame-detection precision and the ±1 px correlation quantisation.
The sheet is *Texto Refundido, Octubre 2002* — ED50 was Spain's official datum until Royal Decree
1071/2007. **This is a property of the entire 49-sheet series, and of every other pre-2007 Spanish
municipal plan raster PRYZM may try to georeference.**

Rebuilt transform, and the residual after correction (same cross-correlation, refetched over the
corrected extent):

| family | polygons | dx | dy |
|---|---:|---:|---:|
| Elemento protegido | 4 | +3 | +3 |
| Colonia Tradicional Popular | 82 | +3 | +5 |
| Manzana Cerrada | 63 | +2 | +3 |
| Ordenacion Abierta | 35 | +1 | +3 |
| Plurifamiliar aislada | 1 | +5 | −5 |
| Uso Comercial | 5 | +2 | +2 |

**Residual 1–5 px ≈ 1–5 m.** A visual overlay after correction traces the colour fields exactly,
including an intricate star-shaped `E*` equipment polygon. *(`Uso Industrial` reports a wild
residual; its legend swatch is near-white so its raster mask is meaningless — see §8.)*

### 2.3 ⭐ The 49-sheet series is a regular grid — georeferencing is batch-automatable

`CUS34W`'s bottom-edge easting labels end at 344641 — the same right-edge easting as CUS41W — and
the sheet-index grid places 34 one row north of 41 in the same column. Prediction: CUS34W extent
(ED50) = E 342841…344641, N 4193351…**4194501** (= CUS41W + 1150 m northing).

Tested by fully automated frame detection on CUS34W.jpg + that predicted extent + the ED50 shift,
scored by cross-correlation against COACo:

```
CUS34W.jpg 1849 x 1441
frame detected automatically: x 24..1829 (1805 px), y 54..1172 (1118 px)
COACo features in predicted extent: 59

family                          polygons    dx    dy
Elemento protegido                     5    +1    -2
Colonia Tradicional Popular           14    +3     0
Manzana Cerrada                       24    +3    -4
```

**Residual 1–4 px, from zero manual input on this sheet.** The frame width came out 1805 px —
*identical* to CUS41W's — confirming a consistent plate. This refutes the "budget ~8 small crops
per sheet, no automated batch shortcut" conclusion of `CUS-CONTROL-POINTS-2026-08-04.md`. One
calibrated anchor sheet + the published sheet-index grid + automated frame detection + the datum
shift georeferences the series.

(Honest caveat: CUS34W's implied northing scale is 1.0286 m/px vs CUS41W's 0.9965 — the scans are
cropped differently. The method absorbs this because the frame is detected per sheet and the extent
is known per sheet; but it means a *fixed* m/px constant must never be assumed.)

### 2.4 The transform (`geo.py`, the load-bearing part)

```python
# Map neat-line frame, detected from near-full-length dark row/col profiles.
X0, X1 = 36, 1841
Y0, Y1 = 16, 1170
# Printed UTM corner tick values, read off the sheet — ED50 / UTM 30N.
E0, E1 = 342841.0, 344641.0
N1, N0 = 4193351.0, 4192201.0
MX = (E1 - E0) / (X1 - X0)     # 0.99723 m/px
MY = (N1 - N0) / (Y1 - Y0)     # 0.99653 m/px

_to25830 = Transformer.from_crs('EPSG:23030', 'EPSG:25830', always_xy=True)
_to23030 = Transformer.from_crs('EPSG:25830', 'EPSG:23030', always_xy=True)

def px_to_utm(x, y):                      # pixel -> ETRS89 via the sheet's ED50 grid
    e = E0 + (np.asarray(x, float) - X0) * MX
    n = N1 - (np.asarray(y, float) - Y0) * MY
    return _to25830.transform(e, n)

def utm_to_px(e, n):
    e50, n50 = _to23030.transform(np.asarray(e, float), np.asarray(n, float))
    return X0 + (e50 - E0) / MX, Y0 + (N1 - n50) / MY
```

Frame detection (the automatable part) is a dark-pixel row/column profile maximum:

```python
dark = grayscale < 160
rs = dark.sum(1)
top   = max(range(5, 60),        key=lambda i: rs[i])
bot   = max(range(H-380, H-180), key=lambda i: rs[i])
cs    = dark[top+4:bot-4].sum(0)
left  = max(range(5, 90),        key=lambda j: cs[j])
right = max(range(W-90, W-5),    key=lambda j: cs[j])
```

### 2.5 ⭐ Boundary coincidence — the measurement

**Methodology.** All in EPSG:25830 metres on a **1 m raster grid** over the sheet extent
(1800 × 1150 cells). (1) Rasterise all 3 461 Catastro parcel boundaries → line mask. (2) Rasterise
parcel interiors → area mask; its complement inside the sheet is "street/open space" (roads,
plazas, river, unbuilt). (3) Euclidean distance transform of the line mask → `D_line`, metres to
the nearest parcel edge. (4) Sample every COACo zoning-polygon boundary at **1 m** — **50 387
points = 50.39 km of zone edge** — and classify each:

- **A "follows parcel"** — `D_line ≤ tol`
- **B "street/open space"** — `D_line > tol` and the point is *not* inside any parcel
- **C "independent"** — `D_line > tol` and the point *is* inside a parcel (the zone line cuts
  through a parcel — the case that breaks parcel-based assignment)

**Result (length-weighted, % of 50.39 km):**

| tolerance | A follows parcel | B street/open space | C cuts through a parcel |
|---:|---:|---:|---:|
| 1 m | **66.9 %** | 24.8 % | 8.3 % |
| 2 m | **74.5 %** | 20.5 % | 5.0 % |
| 3 m | **80.7 %** | 16.2 % | 3.1 % |
| 5 m | **86.1 %** | 11.6 % | 2.2 % |
| 10 m | **93.0 %** | 5.6 % | 1.4 % |
| 15 m | **97.3 %** | 2.1 % | 0.6 % |

Distance from zoning boundary to nearest parcel boundary — **this is the "mean boundary deviation"
the brief asks for**:

```
p10 0.00   p25 0.00   p50 1.00   p75 2.24   p90 7.62   p95 12.00   p99 24.70
mean 2.45 m   median 1.00 m
```

**Control against chance** — the same distance transform sampled at 200 000 uniformly random points
in the sheet:

| within | random points | zoning boundary |
|---:|---:|---:|
| 1 m | 14.8 % | **66.9 %** |
| 2 m | 23.0 % | **74.5 %** |
| 5 m | 41.6 % | **86.1 %** |
| 10 m | 55.3 % | **93.0 %** |

The signal is large and unambiguous: **4.5× chance at 1 m**. Zoning boundaries genuinely follow
cadastral parcel boundaries.

### 2.6 Splitting the street component — road centrelines

The brief asks specifically for the road-centreline share. Category B was subdivided using a
**medial axis of the open (non-parcel) space**, computed as `skimage.morphology.skeletonize` of the
street mask — this is a derived centreline, *not* a fetched road-network vector, and is labelled as
such. Street/open space is **50.7 % of the sheet**.

| tolerance | A parcel edge | B1 road centreline | B2 other open space | C cuts parcel |
|---:|---:|---:|---:|---:|
| 1 m | 66.9 % | 8.7 % | 16.1 % | 8.3 % |
| 2 m | 74.5 % | 10.0 % | 10.5 % | 5.0 % |
| 3 m | 80.7 % | 10.5 % | 5.7 % | 3.1 % |
| 5 m | 86.1 % | 8.7 % | 3.0 % | 2.2 % |
| 10 m | 93.0 % | 4.8 % | 0.8 % | 1.4 % |

**Share explainable by geometry PRYZM can obtain free, citywide (A + B1): 84.5 % @ 2 m, 94.8 % @ 5 m.**

**Phase 2 verdict: the hypothesis's premise is CONFIRMED.** Only 2.2 % of zone-boundary length at
5 m tolerance is geometry that cuts through a parcel and cannot be recovered by snapping.

---

## 3. Phase 3 — Colour classification

### 3.1 Legend colours, sampled from the sheet's own legend panel

Run-length segmentation down the *ZONAS DE ORDENANZA* swatch column (x 50–92, y 1210–1430) gave
**10 clean swatches**, each 16–19 px tall:

| # | Class | RGB |
|---:|---|---|
| 1 | Elemento Protegido | (188, 93, 29) |
| 2 | Prot. Tipológica / Campo Verdad | (249, 216, 139) |
| 3 | Unifamiliar Aislada | (121, 204, 251) |
| 4 | Unifamiliar Adosada | (44, 153, 226) |
| 5 | Colonia Trad. Popular | (128, 139, 211) |
| 6 | Manzana Cerrada | (246, 158, 122) |
| 7 | Ordenación Abierta | (219, 51, 36) |
| 8 | Plurifamiliar Aislada | (248, 172, 39) |
| 9 | Comercial | (187, 184, 192) |
| 10 | Industrial | (234, 233, 241) |

This is a real advantage of the source: **the sheet carries its own colour key**, so the palette
never has to be guessed, and it can be re-sampled per sheet to absorb scan-to-scan colour drift.

### 3.2 Labelled test set

Pixels strictly inside a COACo polygon, **eroded 3 m** (7×7 structuring element) to remove edge
bleed, labelled with that polygon's `ordenanza`. **449 011 labelled pixels.**

Note the label set is what the pilot happens to contain: classes 2, 3, 4 have **zero** labelled
pixels on this sheet, so no accuracy can be reported for them — an honest gap, not a pass.

### 3.3 Confusion matrix — nearest-legend-colour classifier

Chebyshev RGB distance to nearest swatch, with a reject for dark achromatic pixels (linework/text),
near-white pixels, and distance > 45.

| truth | classified accuracy | rejected | labelled px |
|---|---:|---:|---:|
| Elemento protegido | 99.5 % | 60.4 % | 2 038 |
| Colonia Tradicional Popular | 95.4 % | 67.6 % | 144 688 |
| Manzana Cerrada | 83.7 % | 34.3 % | 87 326 |
| Ordenacion Abierta | 89.0 % | 41.1 % | 184 893 |
| Plurifamiliar aislada | 62.5 % | 30.6 % | 23 946 |
| Uso Comercial | 99.9 % | 28.4 % | 4 818 |
| **Uso Industrial** | **0.0 %** | 78.0 % | 1 302 |
| Prot. Tipologica / Unifamiliar Aislada / Adosada | n/a — no labelled pixels on this sheet | | 0 |

**OVERALL: 47.8 % of labelled pixels rejected; 87.2 % accuracy among the 52.2 % classified.**

The high rejection rate is *by design and is not a defect at pixel level* — Phase 4 aggregates by
majority vote per parcel, so rejection only reduces the sample, it does not bias the vote. The
2 classes that genuinely fail are called out in §8.

### 3.4 Chroma-aware refinement

Diagnosis (§8d): 86–89 % of parcel-level errors were a single confusion, Colonia Tradicional
Popular → Uso Comercial. CTP is printed as periwinkle **overprinted with dense black hatching**;
blurred/JPEG-averaged pixels lose chroma and land nearer the neutral Comercial grey (swatch
separation only 59). Fix tested: a chromatic class may only be voted for by pixels with chroma
≥ 30; the two neutral classes only by pixels with chroma ≤ 22.

Effect: whole-sheet rejection rises to 76.1 %, parcel accuracy improves **89.7 % → 90.8 %**. A real
but modest gain — **the confusion is textural, not colorimetric, so a colour-space fix cannot fully
solve it.** Separating it properly needs hatch-pattern detection. Stated as an open limitation, not
a solved problem.

---

## 4. Phase 4 — Parcel classification

For each parcel: rasterise its geometry, **erode 2 m** (5×5) to drop boundary linework, take the
**majority vote** over non-rejected pixels. `classification_confidence` = the winning class's share
of votes. A parcel with zero classifiable pixels **abstains** rather than guessing.

```
scored parcels: 3 331 (of 3 461 fetched; 130 fall outside any COACo polygon so cannot be scored)
abstained (no classifiable pixel): 45  (1.4 %)
```

### Real worked examples (real refcats, real Catastro geometry)

| refcat | truth (COACo) | derived | confidence | px |
|---|---|---|---:|---:|
| `3325701UG4932N` | Ordenacion Abierta | Ordenacion Abierta | 1.000 | 302 |
| `3425101UG4932N` | Ordenacion Abierta | Ordenacion Abierta | 1.000 | 298 |
| `3527814UG4932N` | Ordenacion Abierta | Ordenacion Abierta | 0.748 | 408 |
| `3632807UG4933S` | Manzana Cerrada | Manzana Cerrada | 0.747 | 503 |
| `3225524UG4932N` | **Uso Industrial** | **Uso Comercial** ✗ | **1.000** | 1 430 |
| `3524301UG4932S` | **Colonia Trad. Popular** | **Uso Comercial** ✗ | **1.000** | 46 |
| `3524302UG4932S` | **Colonia Trad. Popular** | **Uso Comercial** ✗ | **1.000** | 48 |

⚠ **The last three matter more than the first four.** They are wrong **at confidence 1.000**.
Mean confidence is 0.941 on correct parcels and **0.784 on incorrect ones** — some separation, but
the dominant failure mode produces *confidently wrong* answers. **The confidence score does not
reliably catch the main error.** This is the single most important caveat in this report and it
directly constrains §9 and §10.

---

## 5. Phase 5 — Boundary refinement (parcel snapping)

The refinement under test is parcel-snapping itself: the derived zone map is built by painting each
whole parcel with its majority-vote class, so every derived boundary is exactly a cadastral
boundary. Scored against COACo:

**Per-class IoU, whole sheet:**

| class | IoU | truth px |
|---|---:|---:|
| Colonia Tradicional Popular | 0.860 | 232 267 |
| Plurifamiliar aislada | 0.789 | 27 542 |
| Manzana Cerrada | 0.727 | 130 769 |
| Elemento protegido | 0.436 | 5 041 |
| Ordenacion Abierta | 0.352 | 236 624 |
| Uso Comercial | 0.214 | 8 941 |
| Uso Industrial | 0.000 | 1 969 |
| **area-weighted mean** | **0.628** | |

**Why Ordenación Abierta scores 0.352 despite 100 % precision / 90.1 % recall at parcel level:**
IoU over the whole sheet penalises area the method structurally cannot fill.

```
COACo zoned area on sheet              : 643 153 px
  ...inside a cadastral parcel         : 474 350 px (73.8 %)
  ...NOT in any parcel (street/open)   : 168 803 px (26.2 %)
```

Ordenación Abierta is precisely the zone type with large open space *between* blocks — the zone
polygon covers the gaps, the parcels do not. **26.2 % of zoned area has no parcel to snap to.**
That is a hard ceiling on whole-area IoU and it is a property of the approach, not a bug.

**IoU restricted to parcel-covered area** — the domain the method actually addresses:

| class | IoU |
|---|---:|
| Ordenacion Abierta | 0.907 |
| Colonia Tradicional Popular | 0.878 |
| Plurifamiliar aislada | 0.864 |
| Manzana Cerrada | 0.801 |
| Elemento protegido | 0.438 |
| Uso Comercial | 0.224 |
| Uso Industrial | 0.000 |
| **micro-average** | **0.808** |

**Pixel agreement where both are defined: 93.0 %** (464 354 px).

**Metrics I did not compute, and why.** *Hausdorff distance* was not computed as a polygon-pair
statistic: the derived output is a per-parcel label field, not a set of polygons in correspondence
with COACo's, so there is no canonical polygon pairing to take a Hausdorff over. The honest
substitute is the full boundary-deviation distribution in §2.5 (median 1.00 m, mean 2.45 m,
p95 12.00 m, p99 24.70 m); the p99 is the closest defensible analogue of a Hausdorff-style tail,
and I have reported it rather than a max, which on this data is dominated by a handful of outliers.

---

## 6. Phase 6 — Validation against held-back ground truth (the decisive proof)

The COACo vector was held back and the zoning reconstructed from raster + parcels alone.

```
PARCEL ACCURACY (chroma-aware classifier, 3 290 decided parcels):   90.8 %
  including abstentions, as share of all scorable parcels:          89.7 %
  area-weighted accuracy:                                           93.5 %
  pixel agreement where both defined:                               93.0 %
```

**Confidence gating — the operating curve:**

| threshold | parcels kept | coverage | accuracy |
|---:|---:|---:|---:|
| 0.00 | 3 290 | 98.8 % | 90.8 % |
| 0.70 | 2 976 | 89.3 % | 93.4 % |
| 0.80 | 2 794 | 83.9 % | 95.0 % |
| **0.85** | **2 659** | **79.8 %** | **95.8 %** |
| 0.90 | 2 474 | 74.3 % | 96.2 % |
| 0.95 | 2 227 | 66.9 % | 96.5 % |

**Per-class precision / recall at parcel level (ungated):**

| class | n truth | n predicted | precision | recall |
|---|---:|---:|---:|---:|
| Colonia Tradicional Popular | 2 632 | 2 371 | **100.0 %** | 90.1 % |
| Manzana Cerrada | 171 | 165 | **100.0 %** | 96.5 % |
| Ordenacion Abierta | 334 | 301 | **100.0 %** | 90.1 % |
| Plurifamiliar aislada | 8 | 9 | 88.9 % | 100.0 % |
| Elemento protegido | 53 | 83 | **61.4 %** | 96.2 % |
| **Uso Comercial** | 91 | 359 | **25.3 %** ⛔ | 100.0 % |
| Uso Industrial | 1 | 0 | n/a | **0.0 %** ⛔ |
| Prot. Tipologica | 0 | 2 | 0.0 % (false positives) | n/a |

**False positive / negative reading.** The three high-volume residential families — which are the
ones that actually bind an envelope — have **100 % precision**: when the pipeline says CTP, MC or
OA, it is never wrong on this sheet. Their misses are *abstentions and confusions out*, i.e. false
negatives (recall 90–96 %), which is the safe direction. **The unsafe direction is concentrated
entirely in the low-volume neutral/grey classes**: `Uso Comercial` is predicted 359 times against 91
true — **three out of four "Comercial" answers are false positives**, and `Uso Industrial` is never
recovered at all.

---

## 7. Phase 7 — Performance

Measured on this machine, windowed per-parcel classification + vote (bounding-box crop, not
full-sheet mask — the production shape):

```
per-parcel cost:                     0.23 ms   (measured over 400 real parcels, 0.09 s total)
whole-sheet pixel classification:    1.63 s    (2 715 726 px)
raster memory:                       8.1 MB per sheet (RGB)
1 m grid mask:                       2.1 MB per mask
```

Extrapolated from the measured per-parcel cost:

| parcels | classify + vote |
|---:|---:|
| 100 | 0.02 s |
| 1 000 | 0.23 s |
| 10 000 | 2.33 s |

**Whole-municipality extrapolation.** `CLOSURE-REGISTER.md` line 139 gives Córdoba's
**SUELO URBANO = 33 341 928 m² = 33.342 km²** (national SIU, in force). Measured parcel density on
CUS41W: **1 672 parcels/km²** (3 461 parcels over 2.07 km²).

```
estimated parcels over SUELO URBANO:   ~55 750
classify + vote CPU:                   ~13 s   (0.2 min)
sheet-equivalents of SUELO URBANO:     16.1    (49 sheets held, so ample coverage)
```

**Compute is not the constraint — it is trivial.** The real per-sheet costs are the Catastro WFS
fetch (54–60 tiled requests per sheet, network-bound, minutes not seconds) and any human review.
CUS41W is a dense central sheet, so 1 672 parcels/km² is likely an over-estimate of the citywide
mean; the parcel-count figure should be treated as an upper bound.

---

## 8. Phase 8 — Failure analysis (frequencies measured, not listed)

### (a) Parcels straddling a zone boundary — **1.2 %, and nearly harmless**

```
parcels whose area is <90 % one zone:   41 / 3 331  (1.2 %)
   ...of those, misclassified:           2 / 41     (4.9 %)
share of ALL errors that are straddling parcels: 0.6 %
```

The single most-cited theoretical objection to parcel-snapping is **empirically negligible here**.
Majority voting handles it. *Fallback: none needed; optionally emit `boundary_confidence` = the
dominant zone's area share so a consumer can see it.*

### (b) Blur, anti-aliasing, JPEG artefacts, hatching, overprinted text

Measured inside the zoned area:

```
dark achromatic ink (linework, text, hatching):   9.7 %
near-white pixels:                                4.3 %
TOTAL rejected by the classifier:                51.3 %
```

Half of all pixels are unusable. This is survivable *only* because of per-parcel majority voting —
at pixel level it would be fatal. *Fallback: abstain (already implemented); 1.4 % of parcels have
no classifiable pixel at all and correctly return no answer.*

### (c) Legend colours that are not separable — **the real ceiling**

Chebyshev separation between legend swatches; pairs below 60 are collision-prone:

| pair | distance |
|---|---:|
| Elemento protegido ↔ Ordenacion Abierta | **42** |
| Uso Comercial ↔ Uso Industrial | **49** |
| Prot. Tipologica ↔ Manzana Cerrada | **58** |
| Colonia Trad. Popular ↔ Uso Comercial | **59** |

Four colliding pairs out of 45. `Uso Industrial` (234,233,241) is additionally within 22 of plain
white paper — it is **not recoverable by colour at all** (0 % recall, §6), which is exactly what the
`Uso Industrial` cross-correlation anomaly in §2.2 was telling us.
*Fallback: **flag for manual trace**. These classes must be excluded from any automated answer.*

### (d) Error budget — where the errors actually are

| confusion | count | share of all errors |
|---|---:|---:|
| Colonia Trad. Popular → Uso Comercial | 261 | **86.1 %** |
| Ordenacion Abierta → Elemento protegido | 28 | 9.2 % |
| Manzana Cerrada → Elemento protegido | 4 | 1.3 % |
| Ordenacion Abierta → Uso Comercial | 3 | 1.0 % |
| Ordenacion Abierta → Prot. Tipologica | 2 | 0.7 % |
| Elemento protegido → Uso Comercial | 2 | 0.7 % |

**Over 95 % of all errors are two colour collisions**, both involving classes with a neutral or
dark-warm swatch. The dominant one is CTP's black hatching desaturating periwinkle toward grey
(§3.4). *Fallback: suppress the neutral classes entirely from automated output and route
CTP-vs-Comercial to hatch-texture detection or manual review.*

### (e) Water, parks, no-legend cases

`Ordenación Abierta` open space, the Guadalquivir, and *Sistemas Generales* carry colours (green
`Espacios Libres`, etc.) that are **not in the ZONAS DE ORDENANZA legend** — they belong to other
legend blocks (`USOS DOTACIONALES`, `SISTEMAS GENERALES`). They land in the **26.2 % of zoned area
with no cadastral parcel** (§5), so parcel-snapping never assigns them. *Fallback: this is
self-handling — no parcel, no answer. It caps IoU (§5), it does not create wrong answers.*

### (f) Georeferencing failure — the one that nearly sank this study

The ED50/ETRS89 datum error (§2.2) is a **234 m systematic misplacement** that produces a
plausible-looking, internally-consistent, entirely wrong result — and would have been invisible on
any of the 43 sheets with no vector counterpart to check against. Frequency: **would have affected
100 % of sheets.** *Fallback: assert the datum explicitly in code; and validate every new sheet's
transform against an independent signal (parcel-boundary coincidence, §2.5, is a usable
self-check — its 66.9 %-at-1 m signal collapses to ~15 % under a bad transform).*

---

## 9. Phase 9 — Production architecture

### 9.1 The bar, declared before the result

> **A derived zoning record may be considered for production only if, on a held-out COACo sheet, it
> achieves ≥ 90 % parcel-level accuracy at ≥ 75 % coverage, AND ≥ 90 % per-class precision for every
> class that would bind a numeric envelope parameter.**

The per-class clause is the one that matters. Aggregate accuracy is the wrong sole criterion for a
system whose output authorises a buildable-envelope number: per §CONTEXT-DATA-HONESTY and
[[envelope-solid-overstates-partial-data]], a confidently-wrong zone is worse than a refusal,
because it silently produces a wrong envelope on real land.

### 9.2 Result against the bar

| criterion | required | achieved | verdict |
|---|---|---|---|
| Parcel accuracy | ≥ 90 % | **95.8 %** @ conf ≥ 0.85 | ✅ |
| Coverage | ≥ 75 % | **79.8 %** | ✅ |
| Per-class precision, CTP / MC / OA | ≥ 90 % | **100 % / 100 % / 100 %** | ✅ |
| Per-class precision, Uso Comercial | ≥ 90 % | **25.3 %** | ⛔ |
| Per-class precision, Elemento protegido | ≥ 90 % | **61.4 %** | ⛔ |
| Per-class recall, Uso Industrial | — | **0 %** | ⛔ |

**Passes on the three high-volume residential families that carry essentially all the land; fails
on three low-volume classes.** Hence APPROVE **WITH LIMITATIONS**, and the limitation is specific
and enforceable: **restrict the automated pipeline to an allow-list of classes whose measured
precision clears the bar, and refuse everything else.**

### 9.3 Sketched pipeline (architecture notes only — nothing wired)

```
 per sheet:
   1. frame detect (dark row/col profile)                        automated, §2.4
   2. extent from sheet-index grid + one calibrated anchor       automated, §2.3
   3. ED50 (EPSG:23030) -> ETRS89 (EPSG:25830)                   pyproj, §2.2
   4. SELF-CHECK: parcel-boundary coincidence >= 60 % @ 1 m      §8f — HARD GATE, abort if not met
   5. re-sample the legend swatch column on THIS sheet           §3.1 (absorbs scan colour drift)
   6. per-pixel chroma-aware classify + reject                   §3.4
 per parcel (Catastro INSPIRE WFS, tiled):
   7. erode 2 m, majority vote, classification_confidence        §4
   8. abstain if no classifiable pixel                           §4
   9. DROP any parcel whose class is not on the precision allow-list   §9.2
  10. emit derived record with the §10 provenance envelope
```

**What would need building** (none of it exists today, and none of it should be built before the
governance question in §9.4 is answered): a `pyproj`-equivalent datum step in TS or a batch
offline job in Python; a sheet-index grid table for all 49 sheets; the per-sheet self-check gate;
a class allow-list bound to measured per-class precision; and an offline data artefact analogous to
`cordobaTracedZones.json`, plus its own independently-owned verification gate.

### 9.4 ⚠ Where this ranks in the source hierarchy — read before approving anything

`resolveCordobaTracedZone.ts` (lines 11–18) is explicit that PRYZM's own hand-traced polygons are
"a materially WEAKER source than a WFS answer — no municipal service stands behind a single vertex",
and it carries a **separate, independently-owned gate** (`CORDOBA_TRACED_ZONES_VERIFIED`, default
`false`) precisely so a signature on one claim cannot authorise a different one.

**A machine-derived parcel label is weaker still, and must rank below the hand-trace.** A hand-trace
has a human reading the sheet; this pipeline has no human in the loop at all. The one thing it has
that a hand-trace does not is a **measured error rate** — but §4 shows that error rate includes
*confidently wrong* answers, so the confidence score cannot substitute for human review. Proposed
hierarchy:

```
coaco:ordenanzas WFS  >  PRYZM hand-trace  >  THIS pipeline  >  refusal
       (published)         (human-read,        (machine-derived,
                            unmeasured)         measured, unreviewed)
```

Any production use needs its **own** third gate. It must not inherit `CORDOBA_ENVELOPE_VERIFIED`
(signed for OCR transcription of numeric tables) or `CORDOBA_TRACED_ZONES_VERIFIED` (for hand-traced
geometry). Both would be scope-creeping gates of exactly the kind that file's header warns against.

---

## 10. Phase 10 — Provenance schema

The brief's proposed shape is **confirmed as necessary but insufficient** against what was actually
produced. Refinements, each justified by a measurement above:

```jsonc
{
  "source_sheet": "CUS41W",              // sheet id — required
  "method": "raster-colour-classification+parcel-majority-vote@v1",
  "classification_confidence": 0.87,     // vote share, §4.
                                         // ⚠ NOT calibrated: §4 shows errors at conf 1.000.
                                         // Never gate an envelope on this alone.
  "boundary_confidence": 0.96,           // dominant zone's area share (straddle purity, §8a)
  "derived": true,
  "official": false,

  // --- additions this experiment shows are load-bearing ---
  "source_crs": "EPSG:23030",            // ⭐ ED50. Without this the record is unreproducible
                                         //    and silently 234 m wrong (§2.2)
  "georef_method": "frame-detect+sheet-grid+datum-shift",
  "georef_residual_m": 3.0,              // measured per sheet, §2.2/§2.3
  "georef_selfcheck_parcel_coincidence_1m": 0.669,  // §8f hard gate
  "refcat": "3325701UG4932N",            // the parcel this label is snapped to
  "class_precision_measured": 1.00,      // ⭐ measured precision for THIS class on a held-out
                                         //    sheet — the allow-list key (§9.2)
  "validated_against": "coaco:ordenanzas@2026-08-05",  // or null for the 43 unvectorised sheets
  "abstained": false                     // §4 — distinguish "no answer" from "no data"
}
```

**Three changes are not optional:**

1. **`source_crs` must be recorded.** It is the difference between a correct record and a
   confidently wrong one, and no consumer can detect the error downstream.
2. **`class_precision_measured` must be per-class, not per-record.** Aggregate 95.8 % accuracy
   conceals a class at 25.3 % precision (§6). A single record-level confidence cannot express this.
3. **`classification_confidence` must be documented as uncalibrated.** §4 shows errors at 1.000.
   Labelling it "confidence" without that warning invites exactly the overstatement
   §CONTEXT-DATA-HONESTY exists to prevent.

Per the brief's rule: **no record produced by this method may ever be labelled "official"**, and
nothing in this experiment was written to any production data file.

---

## 11. Recommendation

# APPROVE WITH LIMITATIONS

**Justified by the Phase 6 numbers specifically:**

**What earns approval.** Against a held-back COACo vector on CUS41W, reconstruction from raster +
cadastral parcels alone achieved **90.8 % parcel accuracy ungated, 95.8 % at confidence ≥ 0.85 with
79.8 % coverage, 93.5 % area-weighted, and micro-IoU 0.808 over parcel-covered area** — clearing the
pre-declared 90 %/75 % bar. The premise holds empirically: **66.9 % of zoning-boundary length lies
within 1 m of a cadastral parcel boundary against a 14.8 % chance rate, 94.8 % is explained by
parcel edges or road centrelines at 5 m, and only 2.2 % cuts through a parcel.** Crucially, the
three high-volume residential families that carry essentially all the buildable land —
**Colonia Tradicional Popular, Manzana Cerrada, Ordenación Abierta — each scored 100 % precision**,
with their errors falling in the safe direction (recall 90–96 %, i.e. abstentions, not wrong
answers). And two prior blockers are refuted: georeferencing is **batch-automatable across the
49-sheet grid** (§2.3), and compute is a non-issue (**~13 s CPU for ~55 750 citywide parcels**, §7).

**What forces the limitations.** Three specific, non-negotiable constraints:

1. **Class allow-list, enforced.** `Uso Comercial` precision is **25.3 %** — three of four such
   answers are false positives. `Uso Industrial` recall is **0 %** (its legend swatch is within 22
   of white paper). `Elemento protegido` precision is **61.4 %**. These must be **refused, not
   emitted**. Over 95 % of all errors are two colour collisions (§8d), so this is a targeted
   exclusion, not a general distrust.
2. **The confidence score must not be the safety mechanism.** §4 documents errors at
   `classification_confidence = 1.000`; mean confidence on wrong answers is 0.784. Gating helps in
   aggregate but does **not** catch the dominant failure mode. Safety must come from the class
   allow-list and the §8f georeferencing self-check, not from the confidence number.
3. **Its own verification gate, ranked below the hand-trace.** Per §9.4, a machine-derived label is
   weaker than PRYZM's hand-traced polygons, which are themselves explicitly weaker than a WFS
   answer. It needs a third, independently-owned gate and must never inherit
   `CORDOBA_ENVELOPE_VERIFIED` or `CORDOBA_TRACED_ZONES_VERIFIED`.

**Why not REJECT:** the core empirical claim was tested against real held-back ground truth and
passed, on the classes that matter, by a clear margin over chance.
**Why not unqualified APPROVE:** the method produces confidently-wrong answers on identifiable
classes, and the only thing standing between that and a fabricated envelope on real land is an
allow-list that does not exist yet.

**Suggested next step, in this order:** (1) re-run this exact validation on the other five
COACo-vectorised sheets (CUS25W, CUS26W, CUS34W, CUS45W, CUS46W) to confirm the per-class precision
figures are stable and not a CUS41W artefact — this is the cheapest, highest-value follow-up and it
is what the allow-list must be built from; (2) only then consider the hatch-texture classifier that
would recover the CTP/Comercial confusion. Do **not** build production wiring before (1).

---

*Method: all figures computed live 2026-08-05 from `coaco:ordenanzas` (COACo GeoServer) and the
Catastro INSPIRE CP WFS, against `corpus/cus/CUS41W.jpg` and `CUS34W.jpg`. Prototype scripts listed
in §0.3. No production code, rule pack, dispatcher, provider, data file, or verification gate was
modified. No derived parcel record was written to any production location.*
