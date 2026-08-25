# REALPHOTO73 — measured fix plan for the founder's real-photograph defects (2026-08-25)

Read-only diagnostic lane; nothing tracked was modified. Contract: `docs/02-decisions/contracts/C108-FACADE-RECONSTRUCTION-FROM-IMAGE.md`.
Line anchors are HEAD `10821b85`; CONF72 (`5cd124af`) shifts them by ~10 lines — cite the anchor TEXT.
Probes (untracked, gitignored `*.local.mts`): `packages/facade-reconstruction/probe-rp73-main.local.mts` (`{M|H1|H2|H3|H4|H2DBG|corpus[:A,B,…]}`), `probe-rp73-h5.local.mts`, `probe-rp73-corpus-head.local.mts`.
The probe re-implements S7–S9b, the lattice, S13 and S15 locally and asserts agreement with the shipped pipeline on every run (`drawM({})` byte-identical to `caseM()`; replica blobs identical to `diagnostics.blobs`).

**Founder's symptoms (real photo, panel):** horizontals correct; verticals worse than before; many openings missing; arches 2 of 5; projection regions wrong. Case M as drawn reproduces NONE of them; every symptom below was reproduced with a drawn variant.
Baseline M: 7×5, matched 35, features 1, outliers 0, soffits 11 (5 drawn + 6 railing rows, L-11182), arcade 5/5 at 0.87–1.00.

## H1 — phantom edge bay from the extension step: CONFIRMED; the brief's rule is wrong in both directions

| variant | current | A: any detection in band | B: detection inside the 2-D band | **C: detection with ortho size ≥ median/2.5** |
|---|---|---|---|---|
| M-edge L+80 (blank pitch left) | **6 bays**, `extended 1` | 5 | 5 | **5** |
| M-edge L+80 R+80 | 7 | 5 | 5 | **5** |
| M-edge L+48 (0.6 pitch) | 6 (45-px phantom) | 5 | 5 | **5** |
| M-corner-separate L+48 R+48 (window-wide ⅓-tall corner railings, 6-px pier) | 7, matched 47/35 | **7** | 5 | **5**, railings → 12 outliers |
| case B zones (ground zone reached only by extension) | 4 | 4 | **3** (lost) | **4** |

Rule A fails because corner railings ARE detections in the band (§L-11125). Rule B breaks case B (ground opening 7.3× median). **Rule C is derived, not tuned** — reuses `loO` (same factor, same median, `openingLattice.ts` lines ~171–178), no new constant (C108 §9). Change: guard each `unshift/push` in step 5 with `bandHasOpeningClassDetection(candidate ± pitch/2)`; add `extensionRefused` to the diagnostic; print `extended` PER AXIS in the notes (the founder's "1 extended" is a sum).
Second mechanism: a window merged with a corner railing shifts its cluster centre (M-corner-merged L+48: pitch 89.9 vs 71 drawn). Voting with the head span (H2c) restores 71.0.
Third, real-photo-only: bay median support 2 ⇒ `minSupport` 0.8 ⇒ ANY single in-band stray blob mints a line (this is the `wingJitter 0.25 / seed 0xc0ff72` todo in `conf72.perturbedM.test.ts`: 11 bays at 0.77).

## H2 — railing-merged boxes fail the cell fit: CONFIRMED as a class; the cited clause is the wrong one

- Head plateau is exact: the §L-11123 step model wins on 30/52 blobs on M (all 30 windows), plateau/bbox width 0.65–0.68 = 48/72; on 0/20 of case C, 0/16 of B — safe to expose as `headSpan`.
- The S13 width clause CANNOT fail for one window+railing on a uniform lattice; it fails when the blob crosses a cell edge (M-wing20: row blobs 2–3 windows wide → x-lattice collapses to 2 bays). `combMatchTolerance` is dead code by construction (`cellOf` assigns by centre).
- **The clause that loses windows is upstream: `detect.ts` `openingMinRectangularity` (0.55) on the MERGED bbox.** M-corner-merged L+80: 12 outer blobs read 0.54 and are never emitted → matched 23/35, struct 0.57. No S13 change recovers a blob that does not exist; the edge source (H5) recovered 12/12.
- Derived rule (no new constant): compute the plateau in `findBlobs` (topProfile exists there), expose `headSpan`, evaluate rectangularity AND the S13 width fit/centre on the head span, report `opening.width` from it, vote the lattice with head-span centres. At risk: C and the L/M arcade (step model must keep losing on arches — measured it does), D/L/M shadow segments (unchanged).

## H3 — arcade arches depend on H2: PARTIALLY CONFIRMED; the size band is exonerated

Arcade blobs on M: h/medH 1.85–1.91 (band 2.5) — 5/5 as long as the blob EXISTS. "2 of 5" reproduces with M-lit (bright shop interior, 4-px dark jambs): rectangularity 0.41 → 0/5 detected. `fitArch` only runs on assigned cells, so unmatched = no arch by construction. The fix for lit arcades is the H5 edge source (jamb pairs recovered 3/5 at IoU ≥ 0.5).

## H4 — soffit rows come from the failed profile comb: mechanism CONFIRMED, proposed form REFUTED, per-cell form measured

- H4a: `slabRows = rowsDiag.peaks` depends on `findPeaks` prominence ≥ 0.15 + 2 % NMS; a dominant parapet/arcade-head edge (his comb period 253 ≈ half the height) demotes storey lines: simulated 0/6.
- The brief's "nearest/strongest peak within ± a band height" lands on the railing-bottom edge → 0/6. **Do not implement that form.**
- P3 (all raw local maxima within ± half a zone of each interior boundary; no prominence, no NMS): identical to current on A–M and peak-independent (5/6 under the simulated failure).
- H4b: coverage is full-width (`soffit.ts` 0.75). Per-bay balconies narrower than 75 % are invisible (M-perbay-48: 0/6, while 6 railing rows still qualify → mapper prints "balconies at 6 of 6 — APPLIED" from six railings). Derived form: measure per CELL over the matched opening's head span, median over bays, the opening's own rows excluded. Measured: M → 5 = drawn truth (L-11182's 6 railing bands vanish); M-perbay 72/48/40 → 5/5; D 3/3, L 5/5, rest 0. `caseM.probe.test.ts` `toHaveLength(11)` turns red BY DESIGN.
- Mapper: count zones with `cell.protrusion !== null`, not `diagnostics.soffits.length` ("11 of 6" / his "2 of 6" = parapet + arcade head).

## H5 — the floor-plan importer's edge primitive as a second opening source (founder's idea): CONFIRMED for recall; needs the agreement rule for precision

- Primitive: `apps/ai-worker/src/pdf-to-bim/raster-cv.ts` — `extractBoundary`, `houghSegments` (pure TS, zero deps, no DOM/THREE) but **L7**. Facade-reconstruction cannot import upward: extract the ~380-line stage 1–2 (`rgbaToGray…houghSegments`, `LineSegmentPx`) into a new L1 `@pryzm/raster-cv`, re-export from ai-worker unchanged. The wall classifier it feeds (`stage2-walls.ts`, thickness 50–600 mm, overlap ≥ 500 mm) is floor-plan semantics — M's 48×44 windows satisfy it at no calibration, which is why the founder's plan import "traced every window".
- Recall on the rectified frame: both jambs found on **35/35** drawn openings in EVERY M variant, including where fill lost 12 (merged corner), 5 (lit arcade), 21 (wing20). Parallel-pair closure: 35/35 at IoU ≥ 0.5 but **580–720 false boxes** — a candidate GENERATOR, not a detector.
- Agreement selector (per cell: in-band pair box with max IoU to the fill blob's head-span box; else size-nearest to the median matched opening): M 35/35 false 0; L 35/35; C 20/20; M-corner-merged recovered 12/12; M-lit 3/5 arches; **B: 5 false in the empty ground zone** — corroborate edge-only candidates by fill darkness inside the box (unmeasured).
- Integration: S12b after S11, merged per cell by agreement; note `openings: N by fill, M by edge-pair, K disagree`; edge-only openings carry archness UNKNOWN (never 0). Plane, rectification, lattice, confidence stay the engine's.

## Defect outside the brief — S13 double count (C108 §3.8 "one rule")
`index.ts` S13 pushes the loser of a cell contest as an outlier, then the `matched === null && !isAssigned` branch re-enters it: case H reports 2 features + 2 outliers; M-wing20 30 outliers from 20 blobs. Fix: `continue` after the loser branch; the displaced `existing` also keeps a stale `matchedCell`.

## Sequence
CONF72 landed (`5cd124af`) → **H2** (head span: detection, S13, lattice vote) → **H1 rule C** → **H4** (P3 + per-cell) → double-count fix (any time) → **H5** last, behind the `@pryzm/raster-cv` extraction.

## Corpus case N (draws all five)
M's class, 7 × 5 + strip, plus: blank wall 0.6 pitch beyond the outer bay on the LEFT and a separate corner railing on the RIGHT (H1: truth 5 bays); railing wings on two rows large enough that the merged outer blob's rectangularity < 0.55, asymmetric elsewhere (H2: matched 35, pitch within 3 %); per-bay soffits 0.5 of the slot under the 5 interior lines, none under the parapet, plus a 6-px cornice out-gradienting every storey line (H4: 5 of 6 lines, 25 non-null `cell.protrusion`); arcade with 2 dark and 3 lit-interior arches with 4-px jambs (H3/H5: 5 openings, archness ≥ 0.8; fill-only reads 2). Outliers = 6 corner railings, features = 1 strip. At risk per change: B (H1), C + L arcade (H2), D/L (H4), H (double count), K4 (fallback).
