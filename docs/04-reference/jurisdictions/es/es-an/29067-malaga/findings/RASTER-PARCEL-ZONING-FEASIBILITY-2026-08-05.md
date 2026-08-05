# Málaga (INE 29067) — Raster-to-Parcel Zoning Reconstruction: Feasibility Validation, 2026-08-05

> **Task type: VALIDATION / MEASUREMENT ONLY.** No production code, rule pack, dispatcher, provider,
> data file or verification gate was modified or signed. Nothing was written into
> `packages/site-parcel-data/src/` or `apps/editor/src/`. All prototype code lives in a scratch
> directory (§0.4) and the load-bearing parts are reproduced inline. Every number in this document
> was computed live this session from real data — the Catastro INSPIRE CP WFS and the locally-held
> Documento B corpus. No figure is estimated, rounded from memory, or carried from another doc
> unless explicitly cited.
>
> Companion to [`MALAGA-ENGINE-PROGRESS-2026-08-05.md`](./MALAGA-ENGINE-PROGRESS-2026-08-05.md)
> §9, which identified P.2.1 / P.2.9 and called for exactly this study. **It corrects two of that
> section's load-bearing claims — see §5.**
> Methodology mirrors Córdoba's
> [`RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md`](../../14021-cordoba/findings/RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md).

---

## Executive summary

**Every step of the pipeline works, measurably and well — and the pipeline is still useless for
Málaga's envelope, for a reason that has nothing to do with accuracy.**

| Question | Measured answer |
|---|---|
| **Datum of the P.2.9 printed UTM grid** | **ED50 / EPSG:23030**, pinned empirically against real Catastro geometry to **0 m** (1 m grid floor); pyproj shift agrees to **0.1 m** (§2.2) |
| **P.2.1 sheet 24 georeferencing residual** | **≤ 1 m**, RMS **0.82 m E / 0.37 m N** over 15 independent 500 m blocks; no scale or rotation error detectable over a 3.5 km baseline (§2.5) |
| **Phase 2** — real vector ordinance boundary within 1 m of a cadastral parcel edge | **89.6 %** (chance 13.3 %) = **6.72× chance**, over 13.53 km (§3.1) |
| **Phase 2** — within 5 m | **95.9 %**; only **2.6 %** cuts through a parcel (§3.1) |
| **Phase 6** — parcel-level accuracy vs P.2.9's independently-drawn ordinance polygons | **98.7 %** on 386 decided parcels (MC precision 99.7 %, OA precision 100.0 %) (§6.2) |
| **Codes the P.2.1 colour legend determines uniquely** | **3 of 38** — `MC`, `H`, `CO`. **All three refuse in the rule pack.** (§7.1) |
| **Codes with a real computable footprint that colour can resolve** | **0 of 9** — every one of `UAS-1…5`, `UAD-1/2`, `CTP-1/2` needs a subzone digit the legend does not encode (§7.2) |
| **Is the subzone digit recoverable from P.2.1's vector text?** | **No.** The text layer is painted over by all 47 images and is **out of register with the raster**; measured agreement with the printed colour is **10.0 % (4/40)** (§5) |

**Recommendation: REJECT** — for the stated purpose (deriving per-parcel zone identity from P.2.1
that could bind a buildable envelope). Two capabilities proven here are carved out as **APPROVED
and reusable** — see §9. The rejection is **not** measurement-limited: the classifier passed every
test it could be given.

---

## 0. Method, provenance and honesty statement

### 0.1 The ground-truth problem, stated before any result

Córdoba's study rested on `coaco:ordenanzas` — a live vector layer, digitised by a third party
*from the very rasters under test*, which could be held back and used as an answer key.
**Málaga has no such layer.** `muralPGOU:POLCALIF_T` is Oracle-locked (three passes, §3 of the
progress doc), and no vector zoning exists anywhere in the published tree (§9.1 of that doc:
1,860 PDFs, zero vector downloads).

So Córdoba's decisive experiment — hide the answer, rebuild it, score it — **cannot be run on
Málaga in the same form.** That is a real methodological gap and it is not papered over here.

What *was* found, and what it is worth:

| Signal | What it is | Independence | Coverage |
|---|---|---|---|
| **P.2.9 filled ordinance polygons** (§6.1) | Real vector polygons in the *Alineaciones, Alturas y Rasantes* sheets, shaded `MANZANA CERRADA (MC)` / `ORDENACION ABIERTA (OA-2)` / `OTRAS ORDENANZAS` per that sheet's own legend | **Independent *drawing*, not an independent *authority*.** Different sheet series, different scale (1:2.000 vs 1:5.000), different production run, fully vector rather than raster — but the **same PGOU 2011 AD1 document set**. Agreement proves the colour classifier recovers what the plan draws; it does **not** prove the plan is right. | **2 of 38 codes**, over 2 000 × 1 000 m of one P.2.9 sheet; **388 parcels** |
| **Catastro parcel geometry** | National INSPIRE CP WFS | Fully independent of the plan | whole sheet, 6 674 parcels |
| **P.2.1's own vector text layer** | Zone-code tokens inside the PDF | Same document — would have been a weak internal-consistency check at best | **Tested and found unusable — §5** |

**Everything that follows is scoped to that table.** Where a number covers only MC and OA-2, it
says so. **No accuracy figure in this document covers the other 36 codes, and none is
extrapolated to them.** Nothing was synthesised, and no stand-in was substituted for data that
could not be obtained — both government services answered on every request (§0.3).

### 0.2 Independence of the georeference (matters for §6.2 validity)

The P.2.1 sheet-24 transform is derived by cross-correlating the sheet's own printed ink against
**(a) real Catastro parcel boundaries and (b) P.2.9's vector base cartography**. It does **not**
use P.2.9's *ordinance* polygons (the grey fills). Both templates were run separately and agreed
exactly (§2.4), so the ordinance fills used for scoring in §6.2 were never part of the fit.

One caveat stated plainly, as in Córdoba: the ED50 datum was *discovered* by cross-correlating
against real Catastro geometry. On a document with no such counterpart nobody would have noticed
it. It is independently confirmed by `pyproj` to 0.1 m and by the epoch (the plan predates nothing —
but Spanish municipal CAD of this lineage was still ED50-native), so the correction is a general,
citable fact about the P.2.9 series.

### 0.3 Live-fetch record

```
Catastro INSPIRE CP WFS  http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx  (WFS 2.0.0, plain bbox=)
  P.2.9 sheet 11.H extent   84 / 84  tiles OK, 0 failures ->  3 977 parcels
  P.2.1 sheet 24 body      231 / 231 tiles OK, 0 failures ->  6 674 parcels
  srsName=EPSG::25830 honoured; gml:posList axis order verified X Y before parsing
```

Rasters/vectors were read from the locally-held corpus added by the progress-doc pass:
`findings/corpus/planos/P.2.1_Calificacion/P_2_1_24.pdf` and
`findings/corpus/planos/P.2.9_Alineaciones_Alturas_Rasantes/{09.F,10.G,11.H}.pdf`.

### 0.4 Prototype code (scratch, session-scoped, **not** in the repo)

```
…\scratchpad\malaga\
  p29_ticks.py / p29_affine.py   — P.2.9 UTM tick extraction + affine fit (§2.1)
  fetch_parcels.py               — Catastro INSPIRE tiled fetch (§0.3)
  common.py                      — affine, segment extraction, 1 m grid, rasteriser, FFT xcorr
  datum_test.py / peak_detail.py — ED50 vs ETRS89 discrimination (§2.2)
  p21_probe.py / p21_images.py / p21_render.py — P.2.1 structure census + 300 dpi composite
  register{2,3,4,5}.py           — sheet-24 registration + residual/scale analysis (§2.3–§2.5)
  swatch*.py / palette*.py       — legend palette sampling (§4.1)
  classify.py / pipeline.py      — pixel classification + per-parcel vote (§4.2, §4.3)
  p29_fills.py / p29_legend.py / p29_gt.py — P.2.9 ordinance-polygon ground truth (§6.1)
  phase2.py / phase2b.py         — boundary coincidence (§3)
  validate.py / iou.py           — validation against P.2.9 (§6.2, §6.3)
  codes.py / textcheck.py / textreg.py — the vector-text investigation (§5)
```

### 0.5 Tooling

Present: Python 3.14, PIL 12.3.0, numpy 2.5.1, `pdftotext` (poppler). Installed this session via
`pip`, all succeeded: `pymupdf 1.28.0` (MuPDF 1.29.0), `shapely 2.1.2`, `pyproj 3.7.2`,
`scipy 1.18.0`, `scikit-image 0.26.0`, `matplotlib`. No GDAL/rasterio/cv2 needed.
**No OCR engine is installed** (`tesseract` absent) — relevant to §9.3.

---

## 1. Phase 1 — Current assets

| Asset | State |
|---|---|
| **P.2.1 Calificación, Usos y Sistemas** | **35/35 sheets present locally**, 219 KB – 3.5 MB, all real PDFs. Sheet 24 used here. |
| **P.2.9 Alineaciones, Alturas y Rasantes** | 3 of 114 sheets present (`09.F`, `10.G`, `11.H`) + index. All three used. |
| **Vector zoning** | **None exists.** `muralPGOU:POLCALIF_T` Oracle-locked; no vector download in the 1,860-PDF tree. |
| **Cadastral parcels** | Catastro INSPIRE CP WFS — live, 100 % tile success (§0.3). The repo's existing Spain-wide pattern is `packages/site-parcel-data/src/providers/*Bbox.ts` (`catastro.hacienda.gob.es/INSPIRE/CadastralParcels/**` ATOM) plus `server/parcelZoningProxy.js` (OVC coordinate service); this experiment used the INSPIRE **WFS** directly, exactly as the Córdoba study did. |

### 1.1 P.2.1 sheet 24 — measured composition

Not assumed from the progress doc; re-measured:

```
page                 2381 x 1683 pt
images                  47
  xref 51   9664 x 6768 px, bpc 1 (ImageMask)  bbox 42.2,49.3 -> 2361.6,1673.7   <- the linework plate
  xref 38   4528 x  680  |  xref 42  3560 x 832  |  xref 34  3432 x 832  | ... 43 more, DeviceRGB
vector text          5 361 words, Times-Roman 1.3–5.8 pt
```

The published graphic is therefore **one 1-bit linework plate at exactly 300 dpi over the whole
map frame, plus 46 DeviceRGB colour tiles beneath it**. Composited at native resolution the map is
9 664 × 6 769 px. At 1:5.000 and 300 dpi the ground resolution is

```
25.4 mm/in / 300 dpi / 1000 x 5000  =  0.4233333 m per pixel
```

**Map neat-line frame**, detected from the achromatic ink profile (the automatable step):

```python
mx = rgb.max(2); mn = rgb.min(2)
ink = (mx < 130) & ((mx - mn) < 45)          # dark AND near-neutral = printed black linework
rs = ink.sum(1); cs = ink.sum(0)
# -> rows 15 .. 4929 ; cols 12 .. 9647   (9 636 x 4 915 px = 4 079.2 x 2 080.7 m)
```

Whole-image ink fraction **15.9 %**.

---

## 2. Phase 2a — Georeferencing

### 2.1 P.2.9 is self-georeferencing — verified, not assumed

All three held sheets carry 17 UTM tick labels as real extractable text. Fitting E against the
label x-centre and N against the label y-centre by least squares:

| sheet | m/pt (E) | E at x = 0 | m/pt (N) | N at y = 0 | max residual |
|---|---:|---:|---:|---:|---:|
| 09.F | 0.7056567 | 367 775.190 | −0.7056567 | 4 065 050.570 | **0.000 m** |
| 10.G | 0.7056567 | 369 775.190 | −0.7056567 | 4 066 050.570 | **0.000 m** |
| 11.H | 0.7056567 | 371 775.190 | −0.7056567 | 4 067 050.570 | **0.000 m** |

Two things are proven and one is not:

* **Proven — the scale is exact.** 0.7056567 m/pt = **2.0003 m per mm on paper**, i.e. 1:2.000 to
  0.015 %. Ticks are 283.42 pt apart for 200 m, dead regular.
* **Proven — the sheet grid is exact.** Column letter ⇒ **+2 000.000 m** easting, row number ⇒
  **+1 000.000 m** northing, to the last decimal, across all three sheets. §9.5 of the progress
  doc predicted this; it is now measured.
* **NOT proven by this table — that the label centre *is* the tick.** A zero residual here only
  proves the labels are machine-placed on a regular lattice. The absolute anchoring is settled
  independently in §2.2, which returns a **0-metre** offset against real-world geometry.

### 2.2 ⭐ The datum, pinned empirically — P.2.9 is **ED50 / EPSG:23030**

The progress doc flagged the datum as unresolved and ~100 m consequential. Measured:

**Method.** Extract all stroked path geometry from 11.H inside the neat line (**507 171 segments**),
project it under each datum hypothesis, rasterise onto a 1 m grid over ETRS89
E 371 800–374 050 / N 4 065 750–4 067 050, and FFT-cross-correlate against the rasterised
boundaries of the **3 977 real Catastro parcels** in that extent.

```
printed grid read as ETRS89 (EPSG:25830):  peak at dE = -112 m, dN = -206 m   ratio 2.45
printed grid read as ED50   (EPSG:23030):  peak at dE =    0 m, dN =    0 m   ratio 1.00
```

pyproj's canonical ED50→ETRS89 shift at Málaga:

```
EPSG:23030 -> EPSG:25830 at (373000, 4066500):  dE = -112.12 m,  dN = -205.88 m
measured by cross-correlation:                  dE = -112    m,  dN = -206    m
agreement:                                      0.1 m E,  0.1 m N
```

The peak is one pixel wide and unambiguous:

```
correlation surface around zero shift (rows dy, cols dx, metres)
dy=-1    49219   51294   55548   70590   57030   53760   54182
dy=+0    55022   60316   73067  111196   79757   63586   58124
dy=+1    56318   57087   61058   81516   60955   53409   51229
background mean over a +-260 m window: 45 478      peak/background = 2.44x
```

**P.2.9 is ED50 / UTM 30N (EPSG:23030). Residual 0 m at the 1 m grid floor.** Reading it as
ETRS89 misplaces every feature by **234 m** — the same trap, at the same magnitude, that Córdoba's
CUS series set. This is now confirmed for two independent Andalucían municipal plan series and
should be treated as the **default hypothesis for any pre-2007-lineage Spanish municipal CAD
plate**, to be falsified rather than assumed away.

*(Honest note: this also retroactively validates §2.1's assumption that the label centre is the
tick. If it were offset, the peak here would not have landed on exactly (0, 0).)*

### 2.3 P.2.1 has no coordinate grid — re-confirmed

Independently re-checked on sheet 24: **zero** UTM-magnitude tokens anywhere in the extractable
text; the neat-line corners carry no ticks, crosses or callouts. P.2.1 **must** be registered by
control points. The registration method below is the substantive contribution of this section.

### 2.4 ⭐ Registering P.2.1 — two independent templates, exact agreement

**Sheet selection was measured, not assumed.** Distinct ≥4-letter tokens were extracted from
11.H and from each of the 35 P.2.1 sheets and intersected:

```
P_2_1_24: 290 shared / 507   <- the sheet covering 11.H
P_2_1_11: 180        P_2_1_16: 173        P_2_1_18: 155        P_2_1_17: 153
```

**Method.** Downsample sheet 24's ink mask to a 2 m grid in sheet-local metres (0.4233333 m/px,
§1.1). FFT-correlate against a zero-padded template. Run twice with two unrelated templates:

| template | source | template pixels | peak offset → body top-left (ETRS89) |
|---|---|---:|---|
| Catastro parcel boundaries | national INSPIRE WFS, 3 977 parcels | 102 144 | E **371 848.0**, N **4 067 834.0** |
| P.2.9 vector base cartography | 11.H, all strokes inside the neat line | 277 805 | E **371 848.0**, N **4 067 834.0** |

**Two templates with nothing in common — a national cadastral service and a municipal CAD plate
at a different scale — put the sheet origin in the same 2 m cell.** This is the control that
substitutes for Córdoba's published `coaco:hojas_cus` sheet footprints, which Málaga does not have.

### 2.5 ⭐ Residual, scale and rotation — measured, with no manual input

Refined to a 1 m grid and re-run block-by-block. Eight blocks over the 11.H frame (four per
template) and, separately, fifteen 500 × 500 m blocks of Catastro parcels spanning the **entire**
4 079 × 2 081 m sheet body:

```
8 quadrant blocks (P.2.9 + Catastro, 2 x 1 km):        dx in {0,+1}   dy = +1
15 blocks across the full body (3.5 km baseline):      dx in {-1,0,+1}  dy in {0,+1}
                                                       RMS 0.82 m E, 0.37 m N
```

The offsets show **no trend with easting or northing**, so scale and rotation error are below the
1 m quantisation over a 3.5 km baseline — **< 0.03 %**. Adopted transform:

```python
MPP = 25.4/300/1000*5000            # 0.4233333 m/px  (1:5.000 at exactly 300 dpi)
X0, Y0 = 12, 15                     # neat-line frame, auto-detected (§1.1)
EB, NB = 371847.0, 4067835.0        # sheet-24 body top-left, ETRS89 / EPSG:25830

E = EB + (px - X0) * MPP
N = NB - (py - Y0) * MPP
```

**Georeferencing residual for P.2.1 sheet 24: ≤ 1 m (RMS 0.82 m E / 0.37 m N), fully automated.**
That is *better* than Córdoba's 1–5 px, and it is achieved on a sheet with **no printed grid at
all** — because P.2.9 supplies a registered municipal frame and Catastro supplies an independent
check. §9.11 of the progress doc predicted this would work; it does.

### 2.6 CRS inventory

| Thing | CRS |
|---|---|
| P.2.9 printed UTM grid | **ED50 / UTM 30N — EPSG:23030** ⭐ (§2.2) |
| P.2.1 | **none printed**; registered here into ETRS89 / UTM 30N — EPSG:25830 (§2.5) |
| Catastro INSPIRE CP | ETRS89 / UTM 30N — EPSG:25830 |

---

## 3. Phase 2b — Boundary coincidence

All measurements on a **1 m grid** over the sheet body (4 079 × 2 080 cells), EPSG:25830.
6 671 valid parcel polygons (median area 126 m², total **8.311 km²** of the **8.488 km²** body).
Parcel interiors cover **69.8 %** of the sheet; street/open space **30.2 %**.

Categories follow Córdoba exactly: **A** = within `tol` of a parcel edge; **B** = further, and not
inside any parcel (street/open space); **C** = further, and *inside* a parcel — the damaging case
that breaks parcel-based assignment.

### 3.1 ⭐ Real vector ordinance boundaries vs cadastral parcel edges

Sampled at 1 m along the boundaries of the P.2.9 ordinance polygons (§6.1) — **13.53 km**:

| tol | A follows parcel | B street/open | C cuts a parcel | chance | ratio |
|---:|---:|---:|---:|---:|---:|
| 1 m | **89.6 %** | 3.6 % | 6.8 % | 13.3 % | **6.72×** |
| 2 m | **92.3 %** | 2.6 % | 5.1 % | 20.8 % | 4.44× |
| 3 m | 94.0 % | 2.1 % | 4.0 % | 28.0 % | 3.36× |
| 5 m | **95.9 %** | 1.5 % | **2.6 %** | 39.0 % | 2.46× |
| 10 m | 98.6 % | 0.8 % | 0.6 % | 56.0 % | 1.76× |
| 15 m | 99.8 % | 0.2 % | 0.0 % | 66.1 % | 1.51× |

Deviation from a zone boundary to the nearest parcel boundary:

```
p50 0.00   p75 0.00   p90 1.41   p95 4.12   p99 11.37     mean 0.69 m
```

**The Phase 2 premise is confirmed for Málaga, more strongly than on any Córdoba sheet.**
89.6 % at 1 m against 13.3 % chance is **6.72×**; Córdoba's five validated sheets ranged 4.2×–7.2×
and its anchor sheet managed 65.5 %. Málaga's zone boundaries genuinely are cadastral boundaries.
Chance was measured, not assumed: 400 000 uniformly random points against the same distance
transform.

*(Scope: this is measured on the MC + OA-2 boundaries P.2.9 draws — a real vector ordinance
boundary, but 13.53 km of it, not the whole sheet.)*

### 3.2 Raster-derived colour-field boundaries vs parcel edges — the honest counterpart

§3.1 measures the *plan's* boundary. This measures what the **pipeline would actually produce**
before parcel-snapping. Per-pixel classes (§4.2) resampled to 1 m, smoothed by a 9 m per-class
vote with components < 300 m² dropped, then the class-change boundary sampled — **59.73 km**:

| tol | A follows parcel | B street/open | **C cuts a parcel** | chance | ratio |
|---:|---:|---:|---:|---:|---:|
| 1 m | 34.0 % | 15.2 % | **50.8 %** | 13.3 % | 2.55× |
| 5 m | 61.6 % | 5.6 % | 32.8 % | 39.0 % | 1.58× |
| 15 m | 81.8 % | 1.7 % | 16.5 % | 66.1 % | 1.24× |

```
deviation p50 2.83   p90 27.66   p99 82.02     mean 9.54 m
```

Without the smoothing, the raw class-change boundary is **322 km** long and sits at **1.02×
chance** — i.e. pure speckle.

**Read this honestly: the colour field is a good *area* label and a poor *boundary* localiser.**
The plan draws its zone boundaries as a heavy black `DELIMITACIÓN DE CALIFICACIONES` line, which
the classifier rejects as ink, so the derived boundary floats somewhere inside a rejected band.
This does not damage the method — Phase 5 paints whole parcels, so every emitted boundary is a
cadastral boundary by construction, and §3.1 shows that is the right thing to snap to. It does
mean **the raster's own edges must never be used as geometry**.

---

## 4. Phases 3–4 — Colour classification and per-parcel voting

### 4.1 Legend palette, sampled from the sheet's own panels

Sheet 24 carries its full legend, so the palette is measured per sheet rather than guessed —
the same advantage Córdoba's CUS sheets gave. **16 `CALIFICACIONES` fills** and **9 `DOTACIONES`
fills** were sampled from the swatch columns:

| Class | RGB | Nearest other swatch | Chebyshev sep |
|---|---|---|---:|
| `MC` Manzana Cerrada | (164, 81, 2) | UAS | **75** ✅ |
| `OA` Ordenación Abierta | (244, 2, 1) | MC | **80** ✅ |
| `CTP` Colonia Trad. Popular | (124, 100, 92) | MC | **90** ✅ |
| `H` Hotelero | (243, 2, 244) | CO | **150** ✅ |
| `CJ` Ciudad Jardín | (245, 126, 1) | UAS | **30** ⚠ |
| `UAS` Unifamiliar Aislada | (228, 156, 1) | CJ | **30** ⚠ |
| `CO` Comercial | (173, 152, 228) | PROD-4 | **36** ⚠ |
| `PROD-4` | (140, 188, 204) | CO | **36** ⚠ |
| `PROD` (1/2/3) | (173, 210, 245) | PROD-4 | **41** ⚠ |
| `UAD` Unifamiliar Adosada | (243, 197, 99) | Equipamiento | **41** ⚠ |
| `CTP-1` en DMPT | (245, 170, 169) | CTP-1 serv. DPMT | **42** ⚠ |
| `PROD-5` | (2, 140, 189) | C2 | 63 |
| `CTP-1` servidumbre DPMT | (246, 212, 172) | *Zona afectada DPMT* | **13** ⛔ |
| `PEPRI` / `C2` / `C3` | (3,116,125) / (2,109,126) / (2,109,124) | each other | **2 – 7** ⛔ |
| `EspacioLibre` | (211, 228, 155) | SupLibreEdif | 35 |
| `Equipamiento` / `E` / `S` / `D` | (244,238,88) / (246,247,68) / (240,238,103) / (241,246,45) | each other | **15 – 43** ⛔ |

Two collisions are **designed into the legend and cannot be fixed by any classifier**:

* **`PEPRI`, `C2`, `C3` are printed in the same teal** (separation 2–7, i.e. inside scan noise).
  Ciudad Histórica is one colour for three codes.
* **`CTP-1 afectada por servidumbre DPMT` and the `Zona afectada por servidumbre DPMT` overlay are
  13 apart** — a *calificación* and a *non-calificación overlay* that are the same peach.

### 4.2 Pixel classification

Nearest-legend-colour in Chebyshev RGB, with rejects for dark achromatic ink (linework, text,
hatching), near-white paper, and distance > 45.

```
map body 9 636 x 4 915 px = 4 079 x 2 081 m = 47 360 940 px
rejected: 63.0 %
```

Classified area (of the whole sheet): EspacioLibre 10.40 %, Equipamiento 6.35 %, UAS 4.72 %,
MC 4.46 %, OA 2.92 %, CJ 2.09 %, CTP 1.75 %, PROD-4 1.67 %, UAD 0.87 %, CO 0.86 %,
CTP-DPMT-peach 0.32 %, PROD-5 0.20 %, CTP-DPMT-pink 0.18 %, PROD 0.14 %, CH 0.07 %, H 0.04 %.

The 63 % rejection is high but structurally identical to Córdoba's 47.8–76.1 % and is survivable
for the same reason: **Phase 4 aggregates by per-parcel majority vote**, so rejection shrinks the
sample without biasing the vote. Much of the rejected mass is genuine white hillside (the eastern
half of sheet 24 is contoured open land) and the heavy black linework of the dense historic fabric.

### 4.3 Per-parcel majority vote

Rasterise each parcel, erode 2 m (5×5 at 2.36 px/m), majority-vote the non-rejected pixels;
`classification_confidence` = the winner's vote share; **abstain** if no classifiable pixel.

```
scored parcels                            6 670
abstained (no classifiable pixel)           908   (13.6 %)
```

| derived class | parcels | | derived class | parcels |
|---|---:|---|---|---:|
| CTP | 3 017 | | Equipamiento | 157 |
| UAS | 548 | | CJ | 100 |
| UAD | 523 | | CTP-DPMT (peach+pink) | 63 |
| OA | 466 | | PROD-4 | 42 |
| MC | 464 | | CH (PEPRI/C2/C3) | 19 |
| EspacioLibre | 341 | | CO / PROD-5 / PROD | 16 / 5 / 1 |

---

## 5. ⛔ The vector text layer is unusable — this corrects the progress doc

`MALAGA-ENGINE-PROGRESS-2026-08-05.md` §9.3 states: *"Zone labels = vector text. The subzone codes
are live text at known page coordinates — `CTP-1`, `OA-1`, `UAS-3`, `CJ-2` extract directly with no
OCR"*, and §9.11 makes that the basis of *"colour-fill raster classification for the family, plus
zero-OCR text extraction for the subzone digit."* **The text extracts. It is not usable.** Four
independent measurements:

**1 — The text is painted over.** Content-stream operator order on sheet 24:

```
stream length 389 031 bytes
first image draw (Do) at byte 265 083 ; last at 389 025 (end of stream)
```

**All 47 images are drawn after all text.** The vector text is completely covered by the raster
and is invisible in the published rendering.

**2 — It is out of register with the raster.** Rendering a tight clip at the coordinates of the
first `CJ-3` token shows a large **CTP-brown** historic barrio with no `CJ-3` anywhere in it.
Rendering at the coordinates of a spot-height token `77.15` shows no such number printed.

**3 — Registration cannot be recovered.** All 4 988 word bounding boxes were rasterised and
FFT-correlated against the sheet's ink mask:

```
best shift within +-203 m :  peak / window mean = 1.128   (value at zero shift = 0.987)
global argmax             :  1.705 at (963 m, 1 221 m)  -- spurious, lands on the legend panel
```

**No registration peak exists.** Contrast §2.2, where the correct hypothesis produced a
one-pixel-wide 2.44× peak.

**4 — Agreement with the printed colour is at chance.** Of 77 zone-code tokens on sheet 24, 40
resolve to a colour class within 12 m. Agreement between the token's code family and that class:

```
overall            4 / 40  =  10.0 %
CTP 1/10 · OA 1/8 · CJ 0/8 · UAS 2/7 · MC 0/3 · UAD 0/2 · CO 0/1 · PROD 0/1
```

Sample disagreements: `CJ-2 -> EspacioLibre` (conf 1.00), `CTP-1 -> OA` (1.00),
`MC -> Equipamiento` (0.76), `UAS -> MC` (1.00), `PROD-4 -> EspacioLibre` (1.00).

**Conclusion: the visible subzone labels on P.2.1 are baked into the raster.** The extractable
vector text is a separate, hidden, unregistered layer — plausibly an earlier CAD state that the
MicroStation export left underneath the final plate. **Any subzone digit must come from OCR of
the raster, not from text extraction.** No OCR engine is installed in this environment (§0.5) and
none was run.

---

## 6. Phase 6 — Validation against the one real independent signal

### 6.1 What P.2.9 actually carries

P.2.9's `ORDENANZA PARTICULAR DE LA EDIFICACIÓN` legend was read from the sheet: three grey
tones, paired to labels by position:

```
fill 0.914 grey  ->  MANZANA CERRADA ( MC )
fill 0.498 grey  ->  ORDENACION ABIERTA ( OA-2 )
fill 0.698 grey  ->  OTRAS ORDENANZAS
```

Extracting every filled path of those tones inside 11.H's neat line, converting ED50 → ETRS89:

```
MC     :  55 polygons,  109 498 m2
OA-2   :  19 polygons,   29 871 m2
OTRAS  :   0 polygons              (drawn only in the legend key)
```

⚠ **The shading is NOT exhaustive, and this bounds every metric below.** Of the derived MC/OA
area on parcels inside the 11.H frame, **118 270 m² of 250 013 m² lies outside any grey polygon**.
P.2.9 shades only the manzanas it annotates with per-street storey counts. **Absence of grey does
not mean "not MC".** Therefore:

* precision/recall on parcels **contained** in a grey polygon is valid — the truth is defined there;
* **whole-frame IoU is not a valid accuracy metric here** and is not reported as one. (It computes
  to 0.512 micro; that number measures the shading's incompleteness, not the classifier, and would
  be misleading. It is recorded here only so nobody recomputes it and mistakes it for a result.)

### 6.2 ⭐ Parcel-level accuracy

Test set: every Catastro parcel at least **80 % contained** in a P.2.9 ordinance polygon.

```
parcels in the test set                   388     (328 MC, 60 OA-2)
abstained                                   2     (0.5 %)
PARCEL ACCURACY (decided)             381/386  =  98.7 %
area-weighted accuracy                            99.7 %
```

| class | precision | recall | tp | fp | fn |
|---|---:|---:|---:|---:|---:|
| `MC` | **99.7 %** | 98.8 % | 322 | 1 | 4 |
| `OA` | **100.0 %** | 98.3 % | 59 | 0 | 1 |

Full confusion: `MC → CTP` ×4, `OA → MC` ×1. That is every error.

**Area recall inside the truth domain:** MC **98.8 %** of 107 407 m²; OA-2 **99.9 %** of 25 558 m².
Pixel agreement where both the truth and the derived map are defined: **100.0 %** (131 743 m²).

### 6.3 Confidence gating — no useful signal, and Córdoba's warning replicates

| threshold | kept | coverage | accuracy |
|---:|---:|---:|---:|
| 0.00 | 386 | 100.0 % | 98.7 % |
| 0.70 | 384 | 99.5 % | 99.0 % |
| 0.85 | 376 | 97.4 % | 98.9 % |
| 0.95 | 340 | 88.1 % | 98.8 % |

Gating buys 0.3 pp and then flattens. More importantly:

```
errors at classification_confidence = 1.000 :  4 of 5
mean confidence:  correct 0.974   wrong 0.910
```

**Córdoba's single most important caveat replicates on Málaga: the dominant failure mode produces
confidently-wrong answers.** `classification_confidence` is not a safety mechanism here either.

### 6.4 What §6 does and does **not** establish

**Does:** on 386 real parcels, colour classification of a 300 dpi P.2.1 raster, registered by the
§2.5 transform and snapped to real Catastro geometry, recovers what an independently-drawn
municipal plan sheet says about `MC` vs `OA-2` at **98.7 %**, with 100 % precision on OA and
99.7 % on MC. The raster pipeline is technically sound.

**Does not:**

* cover **36 of the 38 codes**. `CJ`, `UAS`, `UAD`, `CTP`, `PROD*`, `CO`, `H`, `C-*`, `EP`, `GSM`,
  `SC` and every dotación are **entirely unvalidated**. In particular the largest derived class,
  **`CTP` with 3 017 parcels, has no ground-truth check of any kind.**
* generalise beyond **1 of 35 P.2.1 sheets** and **1 of 114 P.2.9 sheets**;
* constitute an independent *authority*. P.2.9 is the same PGOU. Agreement shows internal
  consistency between two drawings of one plan, not that either matches the legal instrument;
* say anything about the 13 modificaciones (2012–2014) that sit on top of the 2011 sheets
  (progress doc §9.8) — none was applied here.

---

## 7. ⛔ The structural finding — why accuracy is not the binding constraint

### 7.1 The legend is family-level. Only 3 of 38 codes are colour-unique.

Measured from the legend itself (§4.1), not inferred:

| Legend fill | Codes it covers | Colour-unique? |
|---|---|---|
| teal (one colour) | `C-1` `C-2` `C-3` (+ `C-4`, absent from the plan) | ⛔ 3–4 codes, separation 2–7 |
| brown (164,81,2) | **`MC`** | ✅ **unique**, sep 75 |
| red (244,2,1) | `OA-1` `OA-2` | ⛔ 2 codes, one colour |
| orange (245,126,1) | `CJ-1` `CJ-1A` `CJ-2` `CJ-2A` `CJ-3` `CJ-4` | ⛔ 6 codes, one colour |
| grey-brown + peach + pink | `CTP-1` `CTP-2` (3 fills, all CTP-1 variants) | ⛔ digit not encoded |
| amber (228,156,1) | `UAS-1` … `UAS-5` | ⛔ 5 codes, one colour |
| tan (243,197,99) | `UAD-1` `UAD-2` | ⛔ 2 codes, one colour |
| magenta (243,2,244) | **`H`** | ✅ **unique**, sep 150 |
| 3 blues/greys | `PROD-1A` `1B` `2` `3A` `3B` `4` `4B` `5` | ⛔ 8 codes, 3 fills |
| violet (173,152,228) | **`CO`** | ⚠ unique but sep only **36** (collides with PROD-4) |

**Exactly three of the 38 codes are determined uniquely by colour: `MC`, `H`, `CO`.**

And all three **refuse in the shipped rule pack**:

* `MC` → `MALAGA_MC_FONDO_UNRESOLVED_RING` (depth expressly *libre*)
* `H` → `MALAGA_HOTEL_SIN_TIPIFICACION_RING` (the ordinance itself declines)
* `CO` → `MALAGA_TERCIARIO_CLASE_SUELO_UNRESOLVED_RING` (land-class-branched)

The two classes measured at 98.7 % in §6.2 are `MC` and `OA` — **both of which refuse.** The
pipeline's single validated capability delivers, precisely, a better-sourced refusal.

### 7.2 All 9 real-footprint codes need a digit the map does not encode

| Code | FAR | Colour family | Same colour as |
|---|---:|---|---|
| `UAS-1` | 0.60 | amber | `UAS-2…5` |
| `UAS-2` | 0.37 | amber | ” |
| `UAS-3` | 0.30 | amber | ” |
| `UAS-4` | 0.25 | amber | ” |
| `UAS-5` | 0.20 | amber | ” |
| `UAD-1` | 1.16 | tan | `UAD-2` |
| `UAD-2` | 0.52 | tan | ” |
| `CTP-1` | 1.80, PB+1 | brown-family | `CTP-2` |
| `CTP-2` | 2.60, PB+2 | brown-family | ” |

**A `UAS` colour hit spans FAR 0.20 – 0.60 (3.0×). A `UAD` hit spans 0.52 – 1.16 (2.2×). A `CTP`
hit spans 1.80 – 2.60 and PB+1 vs PB+2.** Emitting a family without the digit would be the
[[envelope-solid-overstates-partial-data]] / L-616 failure exactly: an UNKNOWN constraint rendered
as a number on real land. Emitting the *lowest* member is a fabricated refusal-shaped answer, not
a legal one.

The digit exists only in the raster-baked map-body labels (§5), which would need OCR — and OCR
output would then itself need validating, against a ground truth that **does not exist for those
codes**.

---

## 8. Phase 7 — Performance

Measured on this machine (unoptimised numpy prototype; Córdoba's optimised windowed version is not
reproduced here, so these are not comparable to its 0.23 ms/parcel):

```
composited 300 dpi raster in memory                196.2 MB RGB  (9 664 x 6 769)
whole-sheet pixel classification (25 refs)          66.9 s for 47 360 940 px
per-parcel rasterise + erode + vote                144 ms  (400 real parcels, 57.8 s)
Catastro WFS fetch, sheet body                     231 tiles -> the dominant wall-clock cost
```

Compute is not the binding constraint (nothing here is), but neither is it free at this
implementation quality; the per-parcel cost is dominated by bounding-box rasterisation of a few
very large rural parcels and would drop by orders of magnitude with Córdoba's windowed approach.

---

## 9. Recommendation

# REJECT

**Scope of the rejection:** deriving per-parcel *zone identity* from P.2.1 for use in Málaga's
buildable-envelope dispatch. It is **not** a rejection of the georeferencing work, which is
carved out below.

**Why not APPROVE, and why not APPROVE WITH LIMITATIONS.** Not because the pipeline is
inaccurate — it is accurate on everything that could be tested (98.7 % parcel accuracy, 100 % OA
precision, 99.7 % MC precision, boundary premise at 6.72× chance). It fails on a **structural**
ground that no amount of further measurement will move:

1. **Exactly 3 of 38 codes are colour-unique (`MC`, `H`, `CO`) and all 3 refuse in the rule pack.**
   The pipeline's validated output is a refusal that PRYZM already emits without it.
2. **All 9 codes with real computable footprints require a subzone digit the legend does not
   encode** — a 3.0× FAR span inside `UAS` alone. Family identity is not an envelope input.
3. **The digit is not recoverable from the PDF text layer.** §5 refutes the progress doc's stated
   plan on four independent measurements: the text is drawn under all 47 images, has no
   recoverable registration (1.13× against a 2.44× control), and agrees with the printed colour at
   **10.0 %**.

**Why not INSUFFICIENT GROUND TRUTH TO ASSESS.** That verdict was available and is rejected
deliberately. The ground-truth gap is real and severe (§0.1, §6.4) — but it is not what decides
this. §7 is a measurement of the *legend*, made without any ground truth at all, and it is
sufficient on its own. Had a perfect answer key existed for all 38 codes, the verdict would be the
same.

### 9.1 What is nonetheless APPROVED and should be kept

Two results here are reusable capabilities, independent of the rejected pipeline:

* **The ED50 finding for P.2.9 (§2.2).** Pinned to 0 m against real Catastro geometry, agreeing
  with `pyproj` to 0.1 m. It is a precondition for *any* use of P.2.9 — including the two §7
  blockers P.2.9 answers directly (MC per-street-width height; OA alignment geometry). It is now
  confirmed for two independent Andalucían plan series and should be the default hypothesis,
  to be falsified rather than assumed, for any pre-2007-lineage Spanish municipal CAD plate.
* **The two-template registration method (§2.4–§2.5).** A gridless 1:5.000 plan sheet was
  registered to **≤ 1 m** with **zero manual control points**, by correlating its ink against
  (a) national Catastro geometry and (b) a self-georeferencing sister sheet — and the two agreed
  exactly. This is the general recipe for any Spanish municipal raster plan with no printed grid,
  and it is cheaper and more accurate than the manual GCP budget the prior Córdoba notes assumed.

### 9.2 What must **not** be built

* No `resolveMalagaZone.ts` backed by this pipeline. Per §9.4 of Córdoba's study the source
  hierarchy is `WFS > PRYZM hand-trace > machine-derived > refusal`; a machine-derived **family**
  label that cannot reach a subzone ranks *below refusal* for the 9 packed codes, because it can
  only produce a number the plan does not authorise.
* Nothing here may flip or inherit `MALAGA_ENVELOPE_VERIFIED` (founder-only, L-449), and no record
  produced by this method may ever be labelled `official`.

### 9.3 The only route that could change this verdict, ranked

1. **Unlock `muralPGOU:POLCALIF_T`.** Still the whole ballgame, and still not engineering-solvable.
   This study does not reduce that blocker; it measures a detour around it and finds the detour
   blocked ~85 % of the way along.
2. **Request the MicroStation `.dgn` masters.** §9.3 of the progress doc established these exist
   inside the Gerencia — the PDFs are exports. A `.dgn` would carry the subzone labels as
   addressable geometry and moot this entire study. **This is the highest-value ask and it is a
   human/administrative action, not engineering.**
3. **OCR of the raster-baked subzone labels.** Technically plausible — the labels are clean
   300 dpi vector-origin type, not a scan. But it would produce ~100 labels per sheet against
   6 670 parcels, so it needs a region-propagation step; and it would then need validating against
   a ground truth that **exists for 2 of 38 codes**. Do not start this before (2) has been asked
   and refused.
4. Anything else — more sheets, better classifiers, hatch-texture separation — is measuring a
   pipeline whose ceiling §7 has already fixed. **Do not spend on it.**

---

*Method: all figures computed live 2026-08-05 from the Catastro INSPIRE CP WFS (315/315 tiles OK
across two extents, zero failures) and the locally-held Documento B corpus
(`P_2_1_24.pdf`, `09.F.pdf`, `10.G.pdf`, `11.H.pdf`). Prototype scripts listed in §0.4. No
production code, rule pack, dispatcher, provider, data file or verification gate was modified.
No derived parcel record was written to any production location.*
