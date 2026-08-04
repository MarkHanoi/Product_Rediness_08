# Córdoba (INE 14021) — AR Vector Extraction + Georeferencing Prototype, 2026-08-04

> **Scope.** A single-sheet (`ar26.pdf`) engineering prototype, following on from
> [`GEOREFERENCING-FEASIBILITY-2026-08-04.md`](./GEOREFERENCING-FEASIBILITY-2026-08-04.md). Goal: prove
> the full path from raw AR PDF → real UTM-coordinate alignment-line geometry, or find and name the
> exact remaining obstacle. **No code in `packages/site-parcel-data` was touched. Nothing was wired
> into `ZoningRulesEngine` or `esCordobaPGOU2001.ts`.** All new code lives under
> `tools/cordoba-ar-georef/`, mirroring the existing `tools/aragon-plan-georef/` pattern (an established
> "offline Python extraction → static artefact" precedent already in this repo — see
> `docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md` §1.1 for why this shape, not a runtime
> Python dependency, is architecturally correct here).

## Bottom line

**Extraction: works. Georeferencing: FAILED the acceptance test at every scale and orientation tried.**
This is a real, diagnosed negative result, not an unfinished run — see §4 for exactly what was tried and
why it is being reported as a stop rather than pushed to a lower-confidence "success."

| Stage | Outcome |
|---|---|
| 1. Architecture check (Python-runtime vs offline-batch) | **Offline-batch confirmed correct** — `tools/aragon-plan-georef/` is the established precedent |
| 2. Independent verification source (Catastro INSPIRE) | **Fetched successfully** — 48 556 building polygons in the search window |
| 3. Vector extraction from `ar26.pdf` (PyMuPDF) | **Works** — 8 777 closed black rings + 586 red polylines, reproducing the feasibility pass's style-bucket counts exactly |
| 4. Coordinate transform (vote + holdout + decoy discrimination) | **REFUSED at all 10 candidate scales**, and REFUSED at all 4 extra orientations tried at the 3 most promising scales |
| 5. GeoJSON emission | **Not run** — `emit_alignment_geojson.py` is written and correctly refuses (checked: it reads the `GEOREFERENCED` gate and would not emit under an unproven transform), but there is no accepted transform for it to apply |

## 1 — Architecture: offline batch script, matching an existing precedent

`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md` describes a *different* (ordinance-text)
extraction pipeline, but its §1.1 boundary argument ("offline, produces a reviewed static artefact; the
runtime engine reads that artefact deterministically") is exactly right here too, and — more directly —
`tools/aragon-plan-georef/` is a **live, working example of precisely this task already solved once**:
a Python/PyMuPDF script under `tools/`, run offline, that georeferences a municipal plan sheet by voting
building centroids against an independent Catastro INSPIRE download, verified on a HELD-OUT set, never
trusting a fitted-and-scored-on-the-same-set number. `tools/cordoba-ar-georef/` follows that shape
file-for-file (`fetch_catastro_*.py` → `*_extracted.json` → `georeference_fit.py` → holdout report).
There is no `child_process`/Python-at-runtime pattern anywhere in `server/`; this confirms (b) from the
task brief was the wrong branch and (a) is correct.

## 2 — Independent verification source: Catastro INSPIRE Buildings for Córdoba

`tools/cordoba-ar-georef/fetch_catastro_cordoba.py` resolves Córdoba's DGC code (**14900**, distinct
from its INE code **14021** — the exact same provincial-capital numbering trap
`fetch_catastro_huesca.py` already documents) by matching the province-14 ATOM feed's entry **title**
(`" 14900-CORDOBA buildings"`), not by guessing the code. Fetched and extracted:

- `A.ES.SDGC.BU.14900.building.gml` (184 MB) — `srsName="urn:ogc:def:crs:EPSG::25830"`
- `A.ES.SDGC.BU.14900.buildingpart.gml`, `otherconstruction.gml`, and the CadastralParcels equivalents

CRS confirmation: **EPSG:25830**, three independent declarations (province ATOM entry naming, GML's own
`srsName` on two separate layer types), matching the earlier CUS-sheet visual UTM zone-30N tick reads.
This is the whole-municipality file; `georeference_fit.py` filters to a generous
easting 330 000–352 000 / northing 4 188 000–4 206 000 window (a performance filter only, derived from
this session's general Córdoba UTM recon, not from the transform being fitted) — **48 556 buildings**
survive that filter.

## 3 — Vector extraction from `ar26.pdf`: reproduces the feasibility pass exactly

`tools/cordoba-ar-georef/extract_ar_geometry.py` re-implements the feasibility pass's chaining logic
(borrowed line-for-line in spirit from `aragon-plan-georef/georeference_fit.py`'s `plan_polygons()`,
because the same CAD-subpath-concatenation trap applies): a single `get_drawings()` entry on this sheet
holds thousands of independent `m…l l l` runs, and naively joining every segment fabricates one absurd
mega-polygon. Segments are chained only where one starts where the previous ended.

Raw style-bucket counts on `ar26.pdf` matched the feasibility pass's numbers **exactly**: 47 222 black
0.72pt, 960 black 1.44pt, 522 red 0.84pt, 62 red 0.72pt, 22 unstyled. After chaining and closing:

- **8 777 closed black rings** (candidate buildings/parcels/block outlines — the CONTROL set for the
  vote)
- **586 red polylines** (candidate `ALINEACIÓN DEL VIAL` / `ALINEACIÓN DE EDIFICACIÓN` — the TARGET
  geometry, deliberately not forced closed, since alignment lines run open along street edges)

This stage is solid and reusable across all 49 sheets unchanged.

## 4 — Coordinate transform: REFUSED, and here is exactly why that is being reported honestly

### 4.1 — No fixed scale exists to read off the sheet

Unlike Aragon's H-13 sheet (`ESCALA 1/1.000` in a readable title-block string), `ar26.pdf` has **zero
embedded text** (`page.get_text("words")` → 0 words, confirmed independently of the feasibility pass).
So `georeference_fit.py` does not assume a scale — it **searches** 10 round-number candidates
(1:500 … 1:5000) and independently runs the full vote → refine → holdout → decoy-discrimination
procedure for each, exactly mirroring Aragon's acceptance bar (≥25 holdout matches within 3 m, ≥3×
best-decoy signal, median residual ≤2 m).

### 4.2 — Result: every candidate scale refused, and the vote itself found almost no signal

```
scale   plan_rings   peak_vote_support   holdout_matched   best_decoy   signal:decoy
1:500          338            13/169              8/169            4        2.0
1:750          459            13/230              8/229            7        1.1
1:1000         586            12/293              5/293           10        0.5
1:1250         753            17/377              6/376            5        1.2
1:1500         971            17/486              1/485           12       0.08
1:2000        1656            20/828              7/828           15       0.47
1:2500        2543            22/1272             11/1271         14       0.79
1:3000        3578            27/1789             7/1789          15       0.47
1:4000        4370            31/2185            14/2185          18       0.78
1:5000        4869            29/2435            10/2434          14       0.71
```

None cleared the ≥3.0 signal-to-decoy bar (best was 2.0, at 1:500). Peak vote support is **1–2 % of the
fit-set size at every scale** — a real correspondence should produce a peak bin dramatically taller than
its neighbours (Aragon's H-13 run, for comparison, is not reproduced numerically here but the
qualitative shape — one dominant bin vs a flat noise floor — is exactly what is absent here).

### 4.3 — Ruled out: wrong orientation

Because a flat noise floor across every scale is also consistent with a wrong axis convention (not just
a wrong scale), `try_rotations.py` re-ran the 3 most promising scales (1:500, 1:1000, 1:2000) against
4 extra orientations (90°/180°/270° rotation and an x-mirror) on top of the already-applied
`page.rotation_matrix`. **No orientation improved on the identity case** — best remained
`(s2d=2.0, scale=1:500, mode=identity)`, still below acceptance. Orientation is not the blocker.

### 4.4 — The actual, named obstacle: the black-ring population is probably not predominantly buildings

The diagnosis that best fits the evidence: **the 8 777 "closed black rings" extracted from the 0.72pt/
1.44pt buckets are a mix of real building/parcel outlines with a much larger population of other closed
CAD shapes** — dimension-callout boxes, hatch-pattern cells, small symbol glyphs, calzada/kerb
delimitation fragments that happen to close, title-block furniture — and only a minority are true
1:1 building footprints. Two pieces of supporting evidence:

- The ring-area distribution in raw pt² is very wide and low-median (median 29.2 pt², p90 186.3 pt²,
  max 5.8M pt²) with no visible clustering around one plausible building-footprint mode once converted
  at any candidate scale — a real building population should show a tighter, recognisable mode.
- The peak vote bin barely exceeds runner-up bins at every scale (`top5_support` values differ by
  1–2 votes out of hundreds of rings) — the signature of noise, not of a true correspondence buried in
  a small amount of noise.

This is an **extraction-classification problem**, not a coordinate-transform problem: the area/style
filter (`MIN_AREA_M2`/`MAX_AREA_M2` window plus black-color/width bucket) is not sufficient to isolate
"real building footprint" rings from the rest of the black bulk-detail linework. Fixing it needs either
(a) a much tighter geometric filter (e.g. rectangularity/aspect-ratio tests, or requiring a ring to sit
adjacent to but not overlap several others in a block-like arrangement) or (b) abandoning the black-ring
vote entirely in favour of a different control signal — e.g. matching the **parcel** layer
(`CadastralParcels`, already fetched) instead of buildings, since AR sheets are alignment/grading plans
whose densest content may track parcel/block boundaries more than individual building footprints.
Neither was attempted in this pass (time-boxed to the one-sheet prototype); this is the concrete next
experiment.

## 5 — 🔴 A much cheaper alternative surfaced while reading the target-shape file

While reading `resolveMurciaStreetWidth.ts` (per the task brief, to understand the target resolver
shape), its own header notes: *"under ADR-0290 the dissolve is now the FALLBACK, not the goal:
`idecordoba:manzana` publishes 20 730 block polygons covering 92.9 % of Córdoba's ordenanza
polygons, and published geometry outranks geometry we derive ourselves (ADR-0283)."* This is a
**published block-polygon WFS layer for Córdoba, already known to this codebase, not yet consumed by
any resolver** (grep confirms it appears only in that one comment). If `idecordoba:manzana` genuinely
covers 92.9% of Córdoba's ordenanza polygons with real block geometry, it would let
`measureStreetWidths`/`blockEdgesFacingParcel`/`governingStreetWidth` (the SAME pure geometry module
Murcia already uses, per `streetWidth.ts`) run directly off published WFS polygons — **no PDF
vectorisation, no georeferencing, no scale-search at all** — for the vast majority of MC parcels. This
was not investigated further (out of this prototype's scope and the constraint against wiring anything
live), but it should be probed **before** sinking more effort into the AR-PDF path across 49 sheets: if
it holds up, it is very plausibly the much higher-leverage route to unblocking MC height, and the AR
extraction becomes a fallback for the ~7% `idecordoba:manzana` does not cover rather than the primary
path.

## 6 — Path to scaling (once the §4.4 blocker is resolved)

1. Resolve §4.4 — either tighten the ring-shape filter or switch the vote's control geometry to
   cadastral parcels. Re-run `georeference_fit.py ar26` until one scale clears the acceptance bar with
   a real, dominant vote peak (not just a marginal signal-to-decoy pass).
2. Once one sheet passes, `extract_ar_geometry.py` + `georeference_fit.py` are already parameterised by
   sheet name — running all 49 is a loop, not new code. Expect scale to be **constant across the
   series** (municipal sheet sets are almost always plotted at one scale) — if sheet 1's accepted scale
   is confirmed, later sheets can skip the scale search and only fit dx/dy, cutting compute ~10×.
3. `emit_alignment_geojson.py` is already written and gates correctly on `OUTCOME == "GEOREFERENCED"` —
   it needs no changes once step 1 lands.
4. Accuracy budget: Aragon's own acceptance bar (median residual ≤2 m) is the target; `ADR-0287`'s
   `CORDOBA_MC_ADR0287_GUARD_M` (≈0.566 m) is tighter than that residual, meaning **even a transform
   that clears the Aragon bar will still refuse width measurements sitting within ~0.57 m of a
   Art. 13.5.3.1 table boundary** — exactly the intended behaviour (a low-confidence measurement must
   not be allowed to pick a storey band), not a defect to work around.

## Files added (all offline, none wired into production code)

- `tools/cordoba-ar-georef/fetch_catastro_cordoba.py` — Catastro INSPIRE Buildings fetch
- `tools/cordoba-ar-georef/extract_ar_geometry.py` — PyMuPDF vector extraction, black rings + red
  polylines
- `tools/cordoba-ar-georef/georeference_fit.py` — scale-search vote/refine/holdout/decoy pipeline
- `tools/cordoba-ar-georef/try_rotations.py` — orientation diagnostic (ruled out rotation as the cause)
- `tools/cordoba-ar-georef/emit_alignment_geojson.py` — gated GeoJSON emitter, written but not
  triggered (no accepted transform yet)
- `tools/cordoba-ar-georef/out/*.json` — run artefacts (not committed as data, reproducible by re-run)

**Related:** `GEOREFERENCING-FEASIBILITY-2026-08-04.md` (the prior feasibility pass this builds on) ·
`tools/aragon-plan-georef/` (the pattern this follows) · `esCordobaPGOU2001.ts`
`CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE` / `resolveCordobaMcHeightForWidth` (the untouched consumer this
was working toward) · `CLOSURE-REGISTER.md` row 8/25 (MC street-width blocker tracking) ·
`resolveMurciaStreetWidth.ts` (target resolver shape; also the source of the `idecordoba:manzana` lead
in §5).
