# Córdoba (INE 14021) — Georeferencing Feasibility Prototype, 2026-08-04

> **Scope.** This is a feasibility prototype on a **single sample sheet per check**, not a
> commitment to digitise all 49 CUS or 49 AR sheets. Goal: an honest, evidence-based answer to
> "can raw corpus documents become usable geometry, and how hard is it," before committing real
> effort. No code in `packages/site-parcel-data` was touched; nothing was wired into the rule
> pack. Follows on from
> [`CORPUS-REVIEW-2026-08-04-PM.md`](./CORPUS-REVIEW-2026-08-04-PM.md), which established the CUS
> sheets are real legible rasters and the AR sheets are real vector-CAD PDFs with ~zero
> `pdftotext`-extractable text.

---

## Environment tooling inventory

| Tool | Available? | Notes |
|---|---|---|
| `python3` / PIL (Pillow) | **Yes** — Pillow 12.3.0 | Raster open/crop/analyse works fine |
| `numpy` | No | Not installed |
| `cv2` (OpenCV) | No | Not installed |
| `fitz` (PyMuPDF) | **Yes** — PyMuPDF 1.28.0 / MuPDF 1.29.0 | Already importable, no install needed — this is the single biggest positive finding of this pass |
| `pdfplumber` | No | Re-confirmed not installed, matching the prior session's finding |
| `pip install <pkg>` | **Works** | `pip3` alias missing but `python3 -m pip` works and can install pure-Python packages (tested with `pytesseract`, dry-run) |
| ImageMagick (`magick`/`convert`) | No | The `convert` found on PATH is `C:\Windows\system32\convert.exe` (disk-format converter), **not** ImageMagick |
| `exiftool` | No | Not installed |
| `tesseract` (OCR engine binary) | No | `pytesseract` (the Python wrapper) is pip-installable, but the actual OCR **binary** is a separate system install this session did not attempt/have |
| Node `sharp`, `pdfjs-dist` | Present in `node_modules/.pnpm/` | Transitive deps (via other packages, e.g. `sharp@0.34.5`, `pdfjs-dist@5.7.284` under `astro`/`@napi-rs/canvas`), not something this repo's own `package.json` files list as direct raster/PDF-processing dependencies for this purpose |

---

## Check 1 — CUS raster georeferencing (`CUS41W.jpg`)

**Sheet inspected:** `corpus/Calificacion, usos y sistemas/CUS41W.jpg` — 1882×1443 px, JPEG JFIF
metadata claims 300 dpi, "1:5000, Octubre 2002" per its own printed legend (dense central-Córdoba
sheet, as expected).

**What worked:**
- Directly viewing the image (multimodal read, not OCR) clearly shows a printed UTM coordinate
  grid with tick labels at all four sheet edges/corners — e.g. top-left **"342841" / "4193351"**,
  top-right **"344041" / "4193351"**, and a run of x-axis ticks along the bottom
  (343000…344400) and y-axis ticks down the left edge (4192200…4193200 in 200 m steps). These
  values land squarely in Córdoba's real UTM zone 30N footprint (easting ~330,000–350,000,
  northing ~4,190,000–4,205,000) — this is a genuine, correctly-scaled coordinate grid, not
  placeholder text.
- A `fitz`-rendered high-zoom crop of the equivalent grid label on the AR vector sheet (see Check
  2) confirms the same labelling *convention* is crisp and unambiguous when rendered at
  sufficient resolution — the concept transfers.

**What did NOT work:**
- An automated PIL-only approach (column-darkness clustering to locate tick-label pixel centres,
  no OCR) was attempted and **failed** — the signal is swamped by dense map content (streets,
  hatching, thin grid lines) around the label row, producing dozens of spurious clusters instead
  of ~8 clean ones. This is a real negative result, not a shortcut-taken: pure pixel-heuristics
  without an OCR engine are not reliable here.
- Cross-checking two independent scale estimates surfaced a genuine discrepancy worth flagging
  loudly: the nominal-scale-from-DPI calculation (1:5000 at 300 dpi ⇒ ≈0.42 m/px) and a
  corner-to-corner eyeballed pixel-distance estimate from the two top corner labels
  (`342841`→`344041` over ≈1807 px ⇒ ≈0.66 m/px) disagree by **>50%**. This means the JPEG's DPI
  metadata cannot be trusted as a shortcut for scale (it is very likely a generic JFIF default,
  not a true scan-resolution record), **and** that hand-eyeballed pixel positions (± tens of px)
  are nowhere near tight enough for a defensible transform. A real transform needs precisely
  located tick marks, which needs either OCR or a human clicking exact pixel positions.

**Verdict: tractable in principle, NOT automatable today in this environment.**
The raw material is good (real, correctly-scaled, legible UTM grid on every sheet, confirmed
consistent format across the 49-sheet set per the prior corpus review). But turning that into a
trustworthy pixel→UTM affine transform needs one of:
1. **An OCR engine binary** (Tesseract or equivalent) — not present, and installing a system
   binary (not just the `pytesseract` Python wrapper) was not attempted in this sandboxed
   environment and may not be viable here at all.
2. **A human with a GIS georeferencer** (e.g. QGIS's built-in Georeferencer plugin) manually
   clicking 3–4 known tick-mark control points per sheet and entering their printed UTM values —
   this is the industry-standard, low-tech, high-reliability path for exactly this kind of
   scanned-sheet series, and is very plausibly a **5–10 minute/sheet** task, not a research
   problem. Worth testing whether the 49-sheet index grid (visible in every sheet's legend,
   bottom-right) means all sheets share a consistent frame offset, which could let a human
   georeference 2–3 sheets and have a script infer the rest — **not verified in this pass**, flagged
   as the natural next experiment if this path is pursued.
**Do not overclaim**: no working, verified pixel→UTM transform was produced for CUS41W in this
pass. The corner values were read correctly by eye, but "read correctly by eye" is not the same
bar as "precise enough to place a parcel boundary."

---

## Check 2 — AR vector-path extraction (`ar26.pdf`)

**Sheet inspected:** `corpus/alineaciones-rasantes/ar26.pdf` (also present under
`Cordoba - Planos Alineaminetos y rasantes/`). Single page, `MediaBox` 2384×3370 pt, rotated 270°
for display (effective landscape 3370×2384 pt).

**PyMuPDF (`fitz`) works, and works well:**
- `page.get_drawings()` returns **48,788 real, non-degenerate vector path objects**, with genuine
  PDF-space coordinates spanning x≈36–2351, y≈47–3155 — a full-page spread, not a collapsed or
  placeholder set.
- These group into **5 distinct style buckets** by `(color, width)`:

  | Style | Count | Likely role |
  |---|---|---|
  | Black, 0.72 pt | 47,222 | Bulk detail — building outlines, parcels, "delimitación de calzada" |
  | Black, 1.44 pt | 960 | Heavier black linework (major roads / block outlines?) |
  | Red, 0.84 pt | 522 | Alignment-line candidate |
  | Red, 0.72 pt | 62 | Alignment-line candidate (finer/minority) |
  | Unstyled (fill only) | 22 | Likely small filled glyphs/symbols |

- **This was corroborated visually**: `fitz` can rasterise the vector PDF directly (no
  `pdftoppm` needed — `page.get_pixmap()` works standalone), and the rendered legend explicitly
  shows **"ALINEACIÓN DEL VIAL"** and **"ALINEACIÓN DE EDIFICACIÓN"** both drawn in **red**,
  distinct from the black **"DELIMITACIÓN DE CALZADA"** — matching the two red style-buckets found
  programmatically. Color is therefore a real, usable classifier signal for isolating alignment
  geometry from the rest of the drawing. (Line-by-line proof that the 0.84pt vs 0.72pt red split
  maps exactly onto vial-vs-edificación specifically, as opposed to some other distinction, was
  **not** established this pass — that needs a targeted spot-check against the legend's exact
  stroke samples, dash patterns, or segment-length statistics.)
- No PDF layer/OCG structure exists (`doc.get_ocgs()` is empty) — classification has to ride on
  style attributes (color/width), not named layers, but that is sufficient given the finding
  above.
- **No embedded text** — `page.get_text("words")` returns **0 words**, confirming the prior
  session's `pdftotext` finding independently via a different library: even the UTM tick-mark
  labels are vector-drawn glyph outlines, not real text objects, so they cannot be read
  programmatically as strings either. **However**, because the source is vector, it can be
  rendered at arbitrary zoom with no quality loss — a 4× render of `ar26.pdf`'s top-left corner
  produced a crisp, completely unambiguous **"342841" / "4195651"** label, decisively better than
  the fixed-resolution CUS JPEG for the same visual-reading task.

**Verdict: tractable NOW.** PyMuPDF, already present in this environment with no install step,
successfully extracts real, richly detailed, style-classifiable vector geometry from the AR
sheets — this closes the "is there a usable vector library" question definitively **yes**. The
one caveat carried over from Check 1 is that AR sheets still need the *same* corner-tick-to-UTM
control-point step to go from PDF-internal coordinates to real-world UTM (since the tick labels
aren't real text) — but the vector-render trick makes that step meaningfully easier and more
precise than on the raster CUS sheets.

**Concrete next step if this is pursued:** write a small batch script (`fitz` + a handful of
per-sheet control points) that: (1) calls `get_drawings()` per AR sheet, (2) filters to red
strokes as the alignment candidate set, (3) sub-splits by width/dash/segment-length heuristics to
separate "alineación del vial" from "alineación de edificación," and (4) applies a per-sheet
affine transform from PDF space to UTM, anchored on the same 2–4 corner control points a human
would identify once per sheet (or, if the 49-sheet index grid has a consistent per-cell offset,
potentially derivable from a small calibration subset — unverified, flagged as the natural
follow-on experiment).

---

## Bottom line

| Check | Verdict | Blocking factor |
|---|---|---|
| **1 — CUS raster → UTM transform** | Tractable *in principle* (real, correctly-scaled, legible grid confirmed by eye); **not automatable today** in this environment | Missing OCR engine binary, or accept manual human control-point picking per sheet in a GIS tool (QGIS Georeferencer) — a tooling gap, not a data gap |
| **2 — AR vector path extraction** | **Tractable now** — PyMuPDF already works, real classifiable geometry extracted (48,788 objects, 5 style buckets, red = alignment lines per legend cross-check) | None for path extraction itself; the residual georeferencing step shares Check 1's control-point bottleneck, mitigated by vector re-rendering at higher zoom |

Neither check required OCR to *confirm the data is real and usable* — both did, decisively. Only
turning pixel/PDF coordinates into a **precise, defensible** UTM transform is the open item, and
it is an environment-tooling gap (no OCR binary here) plus a genuinely-expected manual step
(control-point picking), not a sign that the underlying documents are unusable. This is a more
optimistic finding for the AR/vector path than for the CUS/raster path, and the next concrete
step differs accordingly: for AR, write the batch `fitz` extractor described above; for CUS, the
next step is either sourcing an OCR binary for this environment, or scoping a human-in-a-GIS-tool
control-point pass (do NOT attempt to fake precision from eyeballed pixel positions — the >50%
scale discrepancy found in Check 1 shows that shortcut is unsafe).
