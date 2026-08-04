# End-to-end proof: CUS sheet → computed buildable envelope (2026-08-04)

Bounded proof-of-concept, ONE sheet / ONE area / ONE traced polygon. Not a commitment to digitize
further sheets — see verdict at the bottom.

## Stage 1 — Sheet selection

Sampled CUS10W, CUS20W, CUS30W, CUS45W (Read tool, full-page) to spread across the unknown
sheet-number→location mapping:

- CUS10W — rural/`SNU` (suelo no urbanizable) hillside, no legible zone-code parcels. Rejected.
- **CUS20W — dense urban grid, large `Manzana Cerrada` (salmon) blocks plus visible red
  (`Ordenación Abierta`) and gold-orange (`Plurifamiliar Aislada`) parcels with printed subzone
  digits ("1", "2", "3"). Selected.**
- CUS30W — river/floodplain edge (`Las Quemadas`), almost no urban parcels. Rejected.
- CUS45W — mostly `SG.EQ` (dotacional) + a large gray industrial/`3` estate, little residential
  PAS/OA/UAD content. Rejected.

## Stage 2 — Georeferencing CUS20W

Corner and interior 200 m grid-tick coordinates were read directly (Read tool, Python/PIL crops at
4–12x zoom — corner *label* text on this sheet was more blurred than CUS41W's, but the interior
bottom-edge grid ticks were crisp and gave the load-bearing readings):

| Point | Pixel (x,y), 1879×1436 px image | UTM (EPSG:25830) | Confidence |
|---|---|---|---|
| Bottom-left corner | (0, 1167) | E 344641, N 4195651 | High (corner label + confirmed by 2 interior ticks) |
| Bottom-right corner | (1879, 1167) | E 346441, N 4195651 | High (corner label + confirmed by 2 interior ticks) |
| Interior bottom ticks | — | 344800 / 345000 / 345200 / 345600 / 345800 / 346000 / 346200 / 346400 (200 m spacing, all legible) | High |
| Top-left corner | (0, 14) | E 344641, N ≈ 4196768 (computed, not read) | Medium — corner label illegible at this zoom; N derived by holding the same 0.958 m/px scale established on the (highly legible) bottom edge |
| Top-right corner | (1879, 14) | E 346441, N ≈ 4196768 (computed) | Medium, same caveat |

Affine used: `E(x) = 344641 + x·0.958`; `N(y) = 4196768 − y·0.9576`. The x-axis scale
(0.958 m/px) is well corroborated (corner-to-corner distance cross-checked against eight 200 m
interior ticks along the bottom edge). The y-axis scale is assumed equal to the x-axis scale
(consistent with CUS41W's finding that both axes were ~0.99 m/px on that sheet) rather than
independently read from a legible top-edge label — this is the weakest link in the georeferencing
and would need a second read pass before being treated as verified.

**Confirmed outside the pilot bbox**: CUS20W spans E 344641–346441, N 4195651–~4196768. The
existing pilot (`cordobaBbox.ts`) is E 340970–344460 / N 4191360–4196040. CUS20W's entire easting
range sits east of the pilot's east edge (344641 > 344460) — no overlap on that axis alone, so the
sheet is confirmed new coverage regardless of the top-edge northing uncertainty.

## Stage 3 — Traced sample

Cluster: a group of ~15+ residential parcels centred near pixel (1280–1600, 420–720) on the sheet,
adjacent to a road fork. Legend swatch colors were sampled by pixel (not eyeballed) to disambiguate
the two visually-similar orange tones on this sheet:

- `Manzana Cerrada` (avoid family) legend swatch: RGB (238, 161, 133) — pale salmon.
- `Plurifamiliar Aislada` legend swatch: RGB (253, 169, 37) — saturated gold-orange.

Most of the initially-picked cluster turned out to be Manzana Cerrada salmon on direct pixel
sampling (a real near-miss, corrected before tracing). A second scan for the (253,169,37) gold
color located one clean, undeveloped (no interior building lines) pentagon-shaped parcel carrying
a printed **"2"** subzone digit, i.e. **PAS-2** (`subzoneCodeFromLink`: `O_PAS2` → `PAS-2`).

Traced vertices (5, pixel → UTM via the Stage 2 affine):

| Vertex | Pixel (approx, orig image) | UTM E, N (EPSG:25830) |
|---|---|---|
| P5 (road-facing corner) | (1416, 669) | 345998, 4196128 |
| P1 | (1416, 603) | 345998, 4196191 |
| P2 | (1439, 594) | 346019, 4196199 |
| P3 | (1495, 596) | 346073, 4196197 |
| P4 (road-facing corner) | (1496, 666) | 346074, 4196130 |

Shoelace area ≈ 4,470 m² in UTM (a plausible detached-block "Plurifamiliar Aislada" plot size —
this family permits larger, non-party-wall plots, unlike the packed UAD rowhouse zones).

## Stage 4 — Rule-pack match + compute

`PAS-2` is registered in `ES_CORDOBA_PGOU2001_PACK` (`packages/site-parcel-data/src/rulepacks/
esCordobaPGOU2001.ts` line 656) — an exact code match, no suffix-convention translation needed.

New test: `packages/site-parcel-data/__tests__/cordobaProofOfConcept.test.ts`. It builds a
synthetic parcel ring from the traced pentagon (translated to a local origin at P5, front edge =
the road-facing P4→P5 edge) and calls `computeBuildableEnvelope({ parcelRing, edgeClassifications,
zoning: { zoneCode: 'PAS-2', ... }, rulePack: ES_CORDOBA_PGOU2001_PACK })`.

`cd packages/site-parcel-data && npx vitest run` → **146 test files, 2766 tests, all passed**
(includes the 3 new proof-of-concept tests alongside every pre-existing suite; no production file
was touched — only the new test file and this doc were added).

### Computed envelope (from the test run)

For the traced-shape synthetic parcel (~4,470 m², PAS-2):

| Field | Value |
|---|---|
| `status` | `ok` |
| `zoneCode` | `PAS-2` |
| `insetAreaM2` (buildable footprint) | 3,686.13 m² |
| `maxHeight_m` | 12.75 m (PB+3, Art. 13.7.3.3) |
| `farLimitedHeight_m` | 7.39 m (FAR 1.66 caps usable floorspace below the legal 12.75 m shell) |
| `maxFloors` | 4 |
| `maxFAR` | 1.66 |
| `maxCoverage` | 0.5 |
| `maxVolumeM3` | 46,998.21 m³ |
| setbacks applied | front 3 m, side 6.375 m, rear 6.375 m (Art. 13.7.3.1 — lateral = ½·altura) |
| `confidence` | `pipeline-extracted-unverified` |
| caveats | machine-extracted/not-human-verified disclosure; FAR-caps-floorspace disclosure |

This is a real, less-than-parcel, internally-consistent envelope — not a full-parcel fallback and
not a refusal — computed entirely from a hand-traced polygon read off a scanned zoning sheet.

## Stage 5 — Verdict

**Partially proven.** The individual links all worked on this one example:

1. Visual (non-OCR) reading of CUS sheet corner/grid-tick coordinates produces a usable
   pixel→UTM affine (Stage 2) — confirmed a second time, on a different sheet than CUS41W,
   with the same manual technique.
2. Pixel-level color sampling of the legend swatches — not eyeballing — was necessary to tell
   `Plurifamiliar Aislada` (packed, useful) apart from the visually-similar `Manzana Cerrada`
   (avoid, structurally refuses) at this zoom level; the first cluster picked by eye was wrong,
   caught only by sampling actual RGB values. This is a real failure mode a batch/scaled process
   would need to solve rigorously, not simply "try harder to look."
3. A traced polygon converts cleanly into a `computeBuildableEnvelope` call and produces a
   coherent, real (non-degenerate, less-than-parcel) numeric envelope for a zone family the pack
   already carries real ordinance numbers for.

What this does **NOT** prove:

- **Scale.** This was one sheet, one hand-picked legible cluster, ~30 minutes of interactive
  crop/zoom/read iteration, plus a color-disambiguation correction mid-stream. The CUS-CONTROL-
  POINTS-2026-08-04 finding already noted OCR does not work on this font; this session adds that
  even human/agent visual reading has a real error mode (color confusion) requiring an extra
  verification step, not just repetition, across 48 more sheets and thousands of parcels.
- **Northing precision.** The top-edge northing on CUS20W was computed, not independently read
  (Stage 2) — good enough to confirm "outside the pilot bbox," not good enough to certify as a
  verified control point the way CUS41W's four corners were.
- **This is still `pipeline-extracted-unverified`.** The computed numbers above ride on the SAME
  `CORDOBA_ENVELOPE_VERIFIED` gate already documented as closed pending human sign-off
  (`resolveCordobaSubzone.ts` header) — this proof shows the pipeline CAN produce a real number
  end-to-end, not that any Córdoba number is cleared to render today.

**Bottom line**: digitizing a CUS sheet into a computed envelope is technically achievable with
the existing engine and rule pack for zone families PRYZM has already ordinance-sourced (PAS/OA/
UAD/CTP-1) — the geometry, georeferencing, and compute paths all work on real sheet content. It is
NOT a low-cost or low-risk path to scale: each sheet needs its own manual crop/read/verify pass,
color-vs-family confusion is a real and demonstrated failure mode, and every output stays behind
the unverified-confidence gate until a human signs off per the existing Córdoba honesty contract.
