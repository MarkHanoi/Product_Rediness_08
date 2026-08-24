# SPEC — Facade Reconstruction Pipeline (photo → facade IR → BIM)

- **Status:** NORMATIVE for Milestone 1 · Milestone 2 is PLANNED, not built
- **Stamp:** 2026-08-24 · **Lane:** FACADE53
- **Contract:** [C108 — Facade Reconstruction From Image](../../02-decisions/contracts/C108-FACADE-RECONSTRUCTION-FROM-IMAGE.md)
- **ADR:** [ADR-0371](../../02-decisions/adrs/ADR-0371-a-facade-reconstruction-is-a-measurement-not-a-likeness.md)
- **Issues:** [L-11000..L-11011](../../04-reference/ISSUE-LOG.md)
- **Requirement source:** the founder's brief §1–§24, 2026-08-24. Section references below of the
  form *(brief §N)* point at it. **The brief wins over this spec.**

> ⛔ **Read [C108 §0.2](../../02-decisions/contracts/C108-FACADE-RECONSTRUCTION-FROM-IMAGE.md) first.**
> The founder's photograph is not in this repository. Everything specified here is proven against
> **synthetic inputs with known ground truth** and against nothing else.

---

## 1. Module layout — brief §21 mapped onto the monorepo

Brief §21 is explicit: *"Keep the reconstruction engine independent from the UI … The UI is only a
client of this engine."*

```
packages/facade-reconstruction/            # @pryzm/facade-reconstruction — L1, leaf
  src/
    index.ts                               # reconstructFacade(image, options)  (brief §21)
    contracts/
      RasterImage.ts                       # { width, height, data: Uint8ClampedArray }  — DOM-free
      FacadeIR.ts                          # the brief §17 shape (Zod) + C108 §1.2 extensions
      FacadeConfidence.ts                  # alias of C62 DomainConfidence — NOT a rival scale
      Diagnostics.ts                       # the brief §18 overlay layers
      Options.ts                           # every tunable threshold, named + defaulted
    reconstruction/
      preprocess/  luma.ts  blur.ts  sobel.ts  histogram.ts
      crop/        detectChrome.ts                       (brief §1)
      facadePlane/ hough.ts  vanishingPoints.ts  quad.ts (brief §6)
      rectification/ homography.ts  warp.ts              (brief §6)
      scale/       referenceDimension.ts                 (brief §5, §16)
      openings/    threshold.ts  components.ts  superellipse.ts (brief §8, §9)
      periodicity/ autocorrelation.ts  comb.ts  breaks.ts  symmetry.ts (brief §7, §14)
      geometry/    zones.ts  bays.ts  cells.ts           (brief §7)
      projections/ soffit.ts                             (brief §11)
      curvature/   residual.ts                           (brief §12)
      surface/     tiling.ts                             (brief §13)
      confidence/  combine.ts                            (C62)
      outliers/    match.ts                              (brief §10, §15)
    bim/           facadeToBim.ts          # ⛔ MILESTONE 2 — not built (L-11006)
    testing/       syntheticFacades.ts     # A–J + K1–K4, each with ground truth (brief §19)
                   png.ts                  # PNG encode/decode on node:zlib — zero deps
  __tests__/                               # every assertion is a number vs known truth

tools/facade-reconstruct/run.ts            # CLI: PNG in → IR JSON + overlay PNGs out
apps/editor/src/ui/facade/                 # the §18 diagnostic surface (browser decode)
```

**Layering.** `packages/facade-reconstruction` is registered **L1** `[floor] leaf` in
`eslint.config.js`'s `layerElements` — it imports `zod` and nothing from `@pryzm/*` above L0, and
has no consumers below L7. A package absent from that table counts as *unclassified* against
`check-layer-boundaries.ts`'s shrink-only baseline, so the row lands in the same commit as the
package.

**P2 / purity.** No `import * as THREE`, no DOM, no `fs`, no network in `packages/**`. The CLI does
I/O; the engine does not.

---

## 2. The engine entry point

```ts
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, length === width * height * 4. */
  readonly data: Uint8ClampedArray;
}

export async function reconstructFacade(
  image: RasterImage,
  options?: Partial<FacadeReconstructionOptions>,
): Promise<FacadeReconstructionResult>;

export interface FacadeReconstructionResult {
  readonly ir: FacadeIR;                  // the brief §17 contract
  readonly diagnostics: FacadeDiagnostics; // the brief §18 overlay layers
}
```

`async` although Milestone 1 is synchronous: the brief specifies it, and it is the seam a worker
slides behind without touching a call site.

⭐ **`RasterImage` is the whole decoding strategy.** The browser decodes anything it supports into a
canvas and hands over `getImageData()`; the CLI decodes PNG with `node:zlib`; tests synthesise
buffers directly. **No image-codec dependency exists anywhere in the subsystem** (C108 §7).

---

## 3. Stages — inputs, outputs, refusals, and the diagnostic each emits

Each stage is a pure function. Each emits exactly one named diagnostic layer (brief §18). Each may
answer *"not from this image"*, and that answer propagates as a typed `unknownReason`, never as a
number.

### S1 — Crop (brief §1) · diagnostic `crop`

| | |
|---|---|
| **In** | `RasterImage` |
| **Out** | `{ rect, applied: boolean, refusedReason?, confidence }` + the cropped image |

Method — per border band, three measurements, all required:
1. **row/column uniformity** — variance below `chromeUniformityMax`;
2. **inter-row similarity** — mean absolute difference between adjacent rows below
   `chromeInterRowMax` *(this is what separates a solid UI bar from a gradient sky)*;
3. **terminating step edge** — a full-width horizontal (or full-height vertical) gradient ridge
   above `chromeStepMin`.

⛔ **Refusals (C108 §3.1):** no-op when nothing qualifies; **cap** at `maxTrimFraction = 0.35` per
side and `minAreaFraction = 0.25` overall, else return the full frame with `applied: false`.

### S2 — Preprocess · diagnostic `edges`

Rec.709 luma → separable Gaussian (σ from `blurSigma`) → Sobel `gx, gy` → magnitude + orientation →
non-maximum suppression → hysteresis with thresholds taken from **percentiles of the magnitude
histogram** (`edgeHighPercentile`, `edgeLowRatio`).

⭐ Percentile-derived thresholds, not absolute ones, are what makes corpus case **J**
(noisy/low-contrast) answer the same as case **A** at a *lower reported confidence* rather than
answering nothing.

### S3 — Lines (brief §6) · diagnostic `lines`

Hough over `(θ, ρ)`, `θ` step `0.5°`, `ρ` step 1 px, accumulator peaks with NMS. Split into
near-horizontal and near-vertical families (±`familyAngleTolerance`, default 30°).

### S4 — Vanishing points (brief §6) · diagnostic `vanishingPoints`

Per family: intersect all line pairs in **homogeneous** coordinates (so parallel lines land at
`w ≈ 0` — a point at infinity is the *answer* for an undistorted facade, not a failure), accumulate
support in a fixed bounded grid, take the strongest cluster.

⛔ Deterministic and exhaustive — **no RANSAC** (C108 §5.2). Confidence = support fraction × cluster
tightness.

### S5 — Facade quad (brief §6) · diagnostic `facadeQuad`

For each family, order lines by perpendicular intercept and take the outermost pair whose supporting
edge mass exceeds `quadSupportFraction` of the maximum; intersect → four corners.

⛔ **"Do not force automatic detection."** Below `quadMinConfidence` the stage emits
`status: 'needs-user'` **and no quad**. `options.facadeQuad` always wins (brief §6, §23 step 5).

### S6 — Rectification (brief §6) · diagnostic `rectified`

4-point DLT homography (normalised; the 4-point case solves exactly by Gaussian elimination on an
8×8 — no SVD required), inverse-mapped bilinear resample.

**Target aspect** from the two vanishing points where non-degenerate; else the source quad's mean
edge-length ratio. ⚠ **Aspect carries its own confidence** — a correct quad with a wrong aspect looks
right and measures wrong, and one merged confidence hides exactly that (C108 §3.3).

### S7 — Structure lines (brief §7) · diagnostic `structureLines`

On the rectified image: row profile of `|gy|`, column profile of `|gx|`; peaks by prominence with a
minimum separation of `minPeakSeparationFraction`.

### S8 — Periodicity (brief §14) · diagnostic `periodicity`

Normalised autocorrelation of each profile → candidate period → **phase-locked comb fit**
(grid-search phase over `combPhaseSteps`, parabolic refinement of the period) → fit score →
**sliding-window break detection** (`breakWindowFraction`, `breakDropRatio`).

⭐ `repeatY = round(extent / periodY)`. **The ground-floor zone is a BREAK the comb finds**, which is
why no stage ever needs to know that ground floors differ (brief §22).

### S9 — Zones, bays, cells (brief §7) · diagnostic `zones`, `bays`

Zone boundaries from horizontal breaks + strong horizontal peaks; bays from the vertical comb.
Cells = zone × bay. ⛔ Geometric only — `zone 0: y = 0.00 → 0.20`, never `"ground floor"`.

### S10 — Symmetry (brief §7) · diagnostic `symmetry`

Normalised cross-correlation of the column profile against its mirror over candidate axes.
⛔ A low score is **reported** as low; `axisX` is never defaulted to `0.5` (C108 §3.7).

### S11 — Openings (brief §8) · diagnostic `openings`

Per cell: local Otsu threshold on the rectified luma → connected components (4-connectivity, union
find) → keep components with `areaFraction ∈ [openingMinArea, openingMaxArea]` and
`rectangularity ≥ openingMinRectangularity`. Every aperture is an `opening` — **no semantic label**
(brief §8, C108 §1.3).

### S12 — Archness (brief §9) · part of `openings`

Extract the mask's top boundary `yTop(x)`; fit `|x/a|^n + |y/b|^n = 1` by a deterministic 1-D search
over `n ∈ [1, 8]` on a log grid with parabolic refinement.

- `archness = rise / halfWidth`, clamped to `[0, 1]` — continuous, `0` flat, `~1` semicircular.
- ⛔ **No arch classifier, no arcade rule, no threshold at which an opening "becomes an arch"**
  (brief §9). A consumer wanting a boolean computes one downstream and owns the threshold.

### S13 — Features and outliers (brief §10, §15) · diagnostic `outliers`

Match each detection to the nearest comb node within `combMatchTolerance`. Unmatched →
**feature** if vertically continuous across ≥ 2 zones (brief §10's signature), else **outlier**
`{ bbox, confidence, note: "unclassified" }`.

⭐ One measured rule serves §10 and §15. Nothing in the code knows what a lightwell is.

### S14 — Curvature (brief §12) · diagnostic `curvature`

Fit each floor line straight across the central `curvatureCentralFraction`; measure systematic,
same-signed deviation in the outer `curvatureEdgeFraction` on each side.

⚠ **Output is `normalizedDeviation` + confidence. `normalizedRadius` is `null`** in Milestone 1 —
one uncalibrated image does not determine a radius (C108 §3.9, L-11004).

### S15 — Projections (brief §11) · diagnostic `projections`

Detect a **soffit/shadow band** immediately beneath each strong horizontal slab line; measure its
height.

⛔ `protrusion.depth = null`, `unknownReason: 'geometry-incomplete'`, with
`evidence: { soffitBandHeight, confidence }` (C108 §3.10, L-11005). *"Never hallucinate exact
dimensions."*

### S16 — Surface (brief §13) · diagnostic `surface`

High-pass residual over wall regions (cell interior minus openings) → 2-D autocorrelation → pitch
peaks → `{ pattern: 'grid' | 'none', scaleX, scaleY, confidence }`.
⛔ **No per-tile geometry, ever.**

### S17 — Scale (brief §5, §16) · diagnostic `scale`

Default `{ status:'unknown', metersPerUnit:null, unknownReason:'not-queried' }`.
`applyReferenceDimension(ir, p0, p1, meters)` → new IR with `status:'user-supplied'`,
`validationState:'human-reviewed'`, `authorityRank:'user'`.
⛔ No other stage may write `metersPerUnit` (C108 §2.2, L-11009).

### S18 — Confidence roll-up (C62) · diagnostic `confidenceHeatmap`

Each stage's own support, **capped by a `min` over its inputs' confidences** — never a product,
never an average. ⛔ **If an input is unknown, the output is unknown** (C108 §4.3).

---

## 4. Milestone 1 — brief §23, in order, with its exit condition

| # | Brief §23 step | Where |
|---|---|---|
| 1 | Load the image | UI (`createImageBitmap` → canvas → `getImageData`) · CLI (`node:zlib` PNG) |
| 2 | Crop the screenshot to the actual photograph | **S1** |
| 3 | Display the crop | UI layer `crop` |
| 4 | Detect / propose the facade quadrilateral | **S3 → S5** |
| 5 | Allow manual correction | `options.facadeQuad`; UI four-corner click |
| 6 | Rectify the facade | **S6** |
| 7 | Detect horizontal and vertical structural lines | **S7 → S9** |
| 8 | Overlay the result | UI diagnostic layers (brief §18) |
| 9 | Output a preliminary JSON representation | `ir` (brief §17) |

> **"Then STOP. Do not build a huge ML system before this works."** — brief §23.
> S10–S18 are built because they are cheap, deterministic and corpus-provable; **nothing beyond
> them is started**, and the BIM leg (brief §24) is explicitly not begun (L-11006).

**Exit condition for Milestone 1:** the A–J and K1–K4 corpus passes, every assertion comparing a
computed number to a known one; the CLI produces JSON + overlay PNGs from a PNG input; the UI
mounts and runs end to end on an uploaded image. **Then report and stop.**

---

## 5. The synthetic corpus (brief §19) — the ONLY thing proven today

Each case is a generator producing a `RasterImage` **plus its ground truth as data**. Generators
live in `src/testing/syntheticFacades.ts` so the UI and CLI can render them too (brief §18: a run
must be *lookable*).

| Case | Input | Asserted against known truth |
|---|---|---|
| **A** | rectangular window grid | `repeatX`, `repeatY`, cell centres within tolerance |
| **B** | grid + horizontal floor break | the break's y-position; zone count |
| **C** | grid + arched openings | `archness` high on arched rows, ~0 on flat rows; `n` bracketed |
| **D** | grid + projecting balconies | soffit band height (⛔ *not* a depth) |
| **E** | grid + curved corner | outer-band residual deviation > flat-A's, and A's ≈ 0 |
| **F** | grid + central vertical feature | the feature is in `features[]`, absent from every cell |
| **G** | grid with missing windows | `repeatX/repeatY` unchanged vs A; the gaps are not cells |
| **H** | grid + foreground outliers | outliers in `outliers[]`; cell geometry unperturbed vs A |
| **I** | perspective-distorted A | recovered quad corners within tolerance of the known quad; rectified grid ≈ A |
| **J** | noisy / low-contrast A | same `repeatX/repeatY` as A; **confidence strictly lower** than A |
| **K1** | clean photo, no chrome | crop trims **0** pixels |
| **K2** | photo inside chrome | crop equals the known inner rect |
| **K3** | clean photo + large uniform sky | sky **survives**; 0 pixels trimmed |
| **K4** | over-trim trap | crop **REFUSED**; `applied === false` |

⛔ **Rule, from C108 §6.2:** *"no error thrown"*, *"array is non-empty"* and *"a facade was
produced"* are **not** assertions and may not be added. Every case declares its truth as data.

⭐ **Case J's assertion is the subtle one and it is deliberate**: the pipeline must give the *same
answer* at a *lower reported confidence*. A pipeline that silently keeps its confidence high on a
degraded image is the failure this whole subsystem is shaped to avoid.

---

## 6. Milestone 2 — PLANNED, NOT BUILT (brief §24, L-11006)

`FacadeIR → PRYZM BIM elements`. Bound by **C11** (creation pipeline), **C16** (command authoring),
**C84** + the **C85–C99** per-element block, and **C15** (hosted elements — an opening in a wall).

Sketch only, and deliberately not decided:
- facade plane + zones → level bands and a wall run;
- cells with openings → hosted openings (C15/C86);
- `features[]` → curtain-wall or a named outlier for the architect to resolve;
- `protrusion` → balcony (C-block) **only once depth stops being `null`**;
- ⛔ **nothing is created while `scale.status === 'unknown'`** — metric geometry from normalized
  coordinates would be fabrication.

**Not started deliberately.** Deciding the mapping without one validated IR, and without a real
photograph, is the confident-register-row defect at contract scale.

---

## 7. Gates and commands

```bash
# Engine suite (the corpus)
pnpm --filter @pryzm/facade-reconstruction test
pnpm --filter @pryzm/facade-reconstruction typecheck

# Both gates, before every commit (lane standing order)
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p tsconfig.json
npm run check:isolation

# CLI — drop a PNG in the repo and look at the result
npx tsx tools/facade-reconstruct/run.ts <image.png> --out <dir>
```

⚠ **L-11008 is OPEN:** no GA gate asserts the corpus runs in CI. Deleting it today fails no build.
