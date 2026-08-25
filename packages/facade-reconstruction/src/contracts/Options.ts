// C108 §9.3 — every tunable threshold, NAMED, DEFAULTED and exposed.
//
// ⛔ THE RULE THAT MAKES THIS FILE HONEST (C108 §9, brief §22):
//
//     A threshold is permitted only if a CORPUS CASE justifies it. A threshold
//     whose only justification is "it made the photo work" is the defect the
//     anti-overfit rule exists to catch.
//
// Every default below therefore carries the case (A–J, K1–K4) or the geometric
// argument that fixes it. A future value change that cannot name one is a
// regression however much it improves one image.
//
// ⛔ AND THE HARDER RULE: no constant in this file may encode a property of ONE
// BUILDING. There is no floor count, no bay count, no arch threshold, no expected
// symmetry axis. Those are MEASURED (comb fit, superellipse fit, cross-correlation)
// or they are UNKNOWN.

import type { Quad } from './RasterImage.js';

export interface FacadeReconstructionOptions {
    // ── S1 crop (brief §1, C108 §3.1) ────────────────────────────────────────
    /** Run the screenshot-chrome crop at all. Off ⇒ the frame is used as given. */
    cropEnabled: boolean;
    /** Max per-row variance for a band to read as a solid UI bar. Case K2/K3. */
    chromeUniformityMax: number;
    /**
     * Max mean-absolute-difference between adjacent rows inside a chrome band.
     *
     * ⭐ THIS IS THE VALUE THAT SEPARATES SKY FROM A UI BAR (case K3). A solid bar's
     * rows are near-identical to each other; sky drifts. Without this criterion the
     * stage trims the top off every outdoor photograph — silently and plausibly.
     */
    chromeInterRowMax: number;
    /**
     * Max level DRIFT from the first line of a band to the last.
     *
     * A UI bar does not ramp; sky does. Case K3 draws a 120 px gradient sky whose
     * per-row delta sits well under `chromeInterRowMax` but whose end-to-end drift
     * is ~23 levels — invisible to the per-row test, obvious to this one.
     */
    chromeBandDriftMax: number;
    /**
     * Max mean CHROMA (`(max-min)/max` over RGB) for a band to read as chrome.
     *
     * ⭐ THE CRITERION THAT SAVES CASE K1, and the one that had to be added after
     * the corpus falsified the first design. A perfectly flat sky is
     * indistinguishable from a white UI bar by flatness, drift and inter-row delta
     * alike — all three are ZERO for both. What separates them is colour: UI chrome
     * is NEUTRAL and at an extreme level; sky is a SATURATED blue at a mid level.
     *
     * ⚠ Known limit (L-11010): a blown-out OVERCAST WHITE sky is neutral and
     * extreme, and would read as chrome. The caps bound the damage.
     */
    chromeSaturationMax: number;
    /** Min mean luma for a LIGHT chrome band (a white UI bar). Cases K2/K4. */
    chromeLightMin: number;
    /** Max mean luma for a DARK chrome band (a dark-mode status bar). */
    chromeDarkMax: number;
    /** Min full-width step-edge strength terminating a chrome band. Case K2. */
    chromeStepMin: number;
    /**
     * ⛔ HARD CAP: never trim more than this fraction from any one side (case K4).
     * A wrongly cropped building is not a degraded result, it is an UNRECOVERABLE
     * one — every downstream stage then measures the wrong rectangle confidently.
     */
    maxTrimFraction: number;
    /** ⛔ HARD CAP: never reduce area below this fraction of the frame (case K4). */
    minAreaFraction: number;

    // ── S2 preprocess ────────────────────────────────────────────────────────
    /** Gaussian sigma before gradients. Larger = fewer, cleaner lines. */
    blurSigma: number;
    /**
     * Canny high threshold as a PERCENTILE of the gradient-magnitude histogram,
     * not an absolute level.
     *
     * ⭐ Percentile-derived thresholds are why case J (noisy/low-contrast) answers
     * the SAME as case A at a LOWER reported confidence, instead of answering
     * nothing. An absolute threshold makes contrast a cliff.
     */
    edgeHighPercentile: number;
    /** Low threshold as a ratio of the high one (standard hysteresis). */
    edgeLowRatio: number;

    // ── S3 lines / S4 vanishing points / S5 quad (brief §6) ──────────────────
    /** Hough theta step, degrees. */
    houghThetaStepDeg: number;
    /** Min accumulator votes for a line, as a fraction of the strongest peak. */
    houghPeakFraction: number;
    /** Max lines kept per family. Bounds the O(n^2) vanishing-point accumulator. */
    maxLinesPerFamily: number;
    /** Half-angle around each axis defining the horizontal/vertical families. */
    familyAngleToleranceDeg: number;
    /** Min supporting edge mass for a quad boundary line, vs the strongest. */
    quadSupportFraction: number;
    /**
     * ⛔ Below this, the stage emits `status: 'needs-user'` and NO QUAD.
     * Brief §6: *"Do not force automatic detection."* A guessed facade plane is
     * the most expensive wrong answer in the pipeline.
     */
    quadMinConfidence: number;
    /** A user-supplied facade quad. ⭐ ALWAYS WINS over detection (brief §6, §23). */
    facadeQuad?: Quad;
    /**
     * Run automatic facade-plane detection when no `facadeQuad` was supplied.
     *
     * ⭐ THE FOUNDER ASKED FOR "SET FACADE CORNERS" TO BE MANDATORY (2026-08-25),
     * after his own four clicks scored 1.00 against detection's 0.64 on the same
     * photograph and produced a visibly better rectification. Brief §6 already says
     * "do not force automatic detection"; C108 §4.3 says an uncertain plane CAPS
     * every downstream confidence. A 0.64 plane therefore poisons the whole reading
     * while still looking like an answer.
     *
     * ⛔ The honest form of "mandatory" is ASKED FOR EVERY TIME, NEVER ASSUMED — so
     * the engine default stays `true` (a CLI or a test that wants a preliminary
     * reading gets one) and the UI passes `false` on first load, shows the
     * photograph, and asks. Detection is then a LABELLED SHORTCUT the user chooses,
     * not something that happened to them.
     *
     * With `false` and no quad the stage emits `needs-user`, no quad and no
     * rectification, every derived confidence is UNKNOWN by propagation, and the
     * downstream stages still run so there is something to look at (brief §18).
     */
    autoDetectFacadePlane: boolean;
    /** Output size of the rectified facade, longest side, pixels. */
    rectifiedLongSide: number;

    // ── S7/S8 structure + periodicity (brief §7, §14) ────────────────────────
    /** Min separation between profile peaks, as a fraction of the profile length. */
    minPeakSeparationFraction: number;
    /** Min prominence for a profile peak, vs the profile's own range. */
    minPeakProminence: number;
    /** Phase grid resolution for the comb fit. Deterministic; no random restarts. */
    combPhaseSteps: number;
    /** Shortest period considered, as a fraction of the profile length. */
    minPeriodFraction: number;
    /** Longest period considered, as a fraction of the profile length. */
    maxPeriodFraction: number;
    /** A comb tooth whose support falls below this ratio of the MEDIAN tooth is a BREAK. */
    breakDropRatio: number;

    // ── S11/S12 openings (brief §8, §9) ──────────────────────────────────────
    /** Min component area as a fraction of its cell. Rejects speckle. */
    openingMinArea: number;
    /**
     * Max component area as a fraction of ITS CELL, applied when MATCHING a
     * detection to a cell — never at detection time.
     */
    openingMaxArea: number;
    /**
     * Max component area as a fraction of THE WHOLE FACADE, applied at detection.
     *
     * ⛔ A different denominator from `openingMaxArea`, and deliberately. Case F's
     * central element is 1.4 cells and must SURVIVE detection to be classified as a
     * feature; only a component approaching the size of the facade itself is a
     * segmentation failure rather than an object.
     */
    blobMaxAreaFraction: number;
    /** Min area/bbox-area for a component to be an opening rather than clutter. */
    openingMinRectangularity: number;
    /** Superellipse exponent search bounds. */
    superellipseNMin: number;
    superellipseNMax: number;
    superellipseNSteps: number;

    // ── S9 lattice from openings (brief §7, C108 §3.4) ───────────────────────
    /**
     * ⭐ WHERE THE ZONE/BAY LATTICE COMES FROM.
     *
     * `openings` — cluster the DETECTED OPENING CENTRES; the projection profile is
     * kept as the fallback when they support no lattice, and as a cross-check that
     * is reported in the notes when the two disagree. This is the default because
     * the openings are the STRONGER signal: on corpus case L the profile comb
     * period-doubles under ±6 levels of noise and the lattice collapses from 8
     * zones to 4, while all 40 detections survive unchanged.
     *
     * `projection-profile` — the pre-2026-08-25 behaviour, unchanged and not
     * deleted. It is the right answer for a facade with no detectable openings at
     * all, and it is the A/B control that makes the claim above measurable.
     */
    latticeSource: 'openings' | 'projection-profile';
    /**
     * Re-run opening DETECTION once against the corrected mean cell area.
     *
     * `openingMinArea` is a floor relative to a CELL, and the cell is not known
     * until the lattice is. Pass 1 detects against the profile lattice's cells;
     * when the opening-derived lattice disagrees materially, the floor it implies
     * is a different number and pass 2 applies it. ⛔ EXACTLY ONE refinement pass,
     * never a loop to convergence: two passes are bounded and deterministic, and an
     * iteration whose stopping point depends on the image is neither.
     */
    openingLatticeRefine: boolean;
    /**
     * Cluster-splitting gap, as a fraction of the MEDIAN OPENING SIZE on the axis.
     *
     * Geometric rather than tuned: an opening fits inside its cell, so half an
     * opening is always less than half a pitch. Below the gap between two adjacent
     * lines, above the jitter within one.
     */
    openingLatticeGapFactor: number;
    /**
     * Detections outside `[median/f, median*f]` on an axis do not vote for that
     * axis's lines. Case B's ground opening spans 4.4 bays and case F's central
     * element spans every storey: a multi-cell object contributes one centre at its
     * own middle, and that middle is not a line.
     */
    openingLatticeSizeBandFactor: number;
    /**
     * A cluster is kept only if its support reaches this fraction of the MEDIAN
     * cluster support. Case H's two aperiodic foreground objects are one vote each
     * where a real line carries four.
     */
    openingLatticeMinSupportRatio: number;
    /**
     * How close a gap must be to a whole number of pitches before missing lines are
     * interpolated into it. Case F's central bay has no windows at all and must
     * still be a bay.
     */
    openingLatticeGapIntegerTolerance: number;
    /** Below this many supported lines the derivation REFUSES and the profile runs. */
    openingLatticeMinLines: number;
    /**
     * §L-11121 — a supported line whose members' (median orthogonal gap / median
     * member size) falls below this fraction of the MEDIAN such ratio across the
     * image's other lines is one CONTINUOUS OBJECT sliced by slab shadows (a
     * glass-block strip, a full-height stair window), not a line of repeating
     * openings. It is removed from the lattice and reunited as one feature.
     * Relative to the image, like `openingLatticeMinSupportRatio`; never a count.
     */
    openingLatticeContinuityRatio: number;
    /**
     * Cluster spread, as a fraction of the pitch, at which `tightness` reaches 0.
     * A quarter of a pitch of scatter is a lattice carrying no information about
     * where its own lines are.
     */
    openingLatticeTightnessScale: number;

    // ── S13 matching (brief §10, §15) ────────────────────────────────────────
    /** Max distance from a comb node for a detection to MATCH, in cell widths. */
    combMatchTolerance: number;
    /**
     * Max size of a matched detection relative to its cell, per axis.
     *
     * ⭐ THE GUARD THAT MAKES BRIEF §10 WORK. Without it the central vertical element
     * of corpus case F — which spans every storey — is CENTRED inside a middle cell,
     * passes the distance test and is recorded as that cell's window. An object half
     * again bigger than the cell it sits in is not that cell's opening, whatever its
     * centre says, and this is measured against the cell rather than against any
     * knowledge of what the object might be.
     */
    combMatchMaxSizeRatio: number;

    // ── S14 curvature (brief §12) ────────────────────────────────────────────
    /** Central fraction of the width used to fit each floor line straight. */
    curvatureCentralFraction: number;
    /** Outer fraction per side measured for systematic deviation. */
    curvatureEdgeFraction: number;
    /** Min normalized deviation before curvature is reported at all. */
    curvatureMinDeviation: number;

    // ── S15 projections (brief §11) ──────────────────────────────────────────
    /** Search band beneath a slab line for a soffit shadow, as a height fraction. */
    soffitSearchFraction: number;
    /** Min luminance drop for a band to read as a soffit shadow. */
    soffitMinDrop: number;
    /**
     * Min fraction of the row that must be dark for a band to be a soffit.
     *
     * ⭐ A soffit runs the WIDTH of the slab; a row of windows is dark in patches.
     * Both depress the row mean similarly, so without this the flat case-A grid
     * reports three balconies it does not have.
     */
    soffitMinCoverage: number;
    /**
     * Percentile of the reference band taken as THE WALL LEVEL.
     *
     * ⛔ Not the mean. The reference band is the facade in daylight and a real
     * facade has WINDOWS in it: on case L the openings fill 60% of every bay, so the
     * band's mean reads ~104 where the wall reads ~200 and the soffit drop vanishes
     * below `soffitMinDrop`. 0.75 is the standard robust choice — it survives a
     * reference band that is up to three-quarters dark.
     */
    soffitReferencePercentile: number;

    // ── S16 surface (brief §13) ──────────────────────────────────────────────
    /** Min autocorrelation peak for a tiling pattern to be reported as `grid`. */
    surfaceMinPeak: number;
}

/**
 * The defaults. Each is justified by a corpus case or by geometry — never by an
 * image (C108 §9.3).
 */
export const DEFAULT_OPTIONS: Readonly<FacadeReconstructionOptions> = Object.freeze({
    cropEnabled: true,
    // A solid UI bar is flat to within a couple of levels; a photograph's flattest
    // regions (sky, rendered wall) still carry film/sensor noise well above this.
    chromeUniformityMax: 12,
    // Case K3: sky's vertical gradient across one row-step is small but NOT zero.
    // A UI bar's is ~0. 1.2 levels sits between the two with room either side.
    chromeInterRowMax: 1.2,
    // Case K3: sky ramps ~23 levels across its band; a UI bar ramps 0.
    chromeBandDriftMax: 3,
    // Case K1: the corpus sky is (150,185,225) -> chroma 0.33. White chrome is 0.
    chromeSaturationMax: 0.12,
    chromeLightMin: 232,
    chromeDarkMax: 24,
    chromeStepMin: 18,
    // Case K4: a screenshot's chrome is real but bounded. Beyond a third of a side
    // the stage is no longer cropping chrome, it is cropping the subject.
    maxTrimFraction: 0.35,
    minAreaFraction: 0.25,

    blurSigma: 1.2,
    // ⭐ 0.85, NOT 0.9, and the corpus is why. The FACADE SILHOUETTE is routinely
    // the weakest strong edge in the frame — a rendered wall against a clear sky
    // differs by ~20 luma levels, while a window against that same wall differs by
    // ~160 — and it is the single most important line in the image, because losing
    // it loses the plane. Measured on case A: the silhouette's gradient magnitude
    // is 45; the 90th percentile threshold is 62.5 and DISCARDS it, the 85th is 25
    // and keeps it. Noise admitted at the lower threshold is rejected downstream by
    // the Hough vote floor, because noise is not collinear.
    edgeHighPercentile: 0.85,
    edgeLowRatio: 0.4,

    houghThetaStepDeg: 0.5,
    houghPeakFraction: 0.35,
    maxLinesPerFamily: 64,
    familyAngleToleranceDeg: 30,
    quadSupportFraction: 0.25,
    quadMinConfidence: 0.25,
    // ⭐ TRUE here and FALSE in the editor panel — see the field comment. A default
    // of false would make the CLI and every corpus case refuse to measure anything.
    autoDetectFacadePlane: true,
    rectifiedLongSide: 512,

    minPeakSeparationFraction: 0.02,
    minPeakProminence: 0.15,
    combPhaseSteps: 64,
    // A period shorter than 4% of the extent implies >25 repeats, which at typical
    // photograph resolution is below the line-detection floor anyway.
    minPeriodFraction: 0.04,
    // A period longer than half the extent cannot repeat twice, so it is not a
    // period — it is a single feature, and S13 is where those belong.
    maxPeriodFraction: 0.5,
    breakDropRatio: 0.55,

    openingMinArea: 0.02,
    openingMaxArea: 0.85,
    blobMaxAreaFraction: 0.5,
    openingMinRectangularity: 0.55,
    superellipseNMin: 1,
    superellipseNMax: 8,
    superellipseNSteps: 36,

    // ⭐ The openings, not the wall. See the field comment and C108 §3.4.
    latticeSource: 'openings',
    openingLatticeRefine: true,
    // Case L: median opening 48 px in a 76 px bay. 0.5 -> 24 px, which is above the
    // few-pixel jitter within a bay and well below the 76 px between two of them.
    openingLatticeGapFactor: 0.5,
    // Case B: the wide ground opening is 7.3x the median window width and must not
    // vote for a bay line. Case H: the smaller clutter object is 0.46x and must not
    // vote for a zone line. 2.5 sits between the two, with the SUPPORT filter as the
    // primary guard behind it.
    openingLatticeSizeBandFactor: 2.5,
    // Case H: clutter support 1 against a median of 4 -> 0.25. Case G: the sparsest
    // real bay is 3 against a median of 3 -> 1.0. 0.4 separates them with margin at
    // both ends, and it is a RATIO so it does not move with the facade's size.
    openingLatticeMinSupportRatio: 0.4,
    openingLatticeGapIntegerTolerance: 0.25,
    openingLatticeMinLines: 2,
    // Case M: window columns measure ~0.8 (wall between windows ≈ window height),
    // the strip column ~0.05 (only the slab shadow separates its slices). Any factor
    // in 0.1–0.9 separates them; 0.4 sits mid-margin and mirrors the support ratio.
    // NOT chosen to make case M pass (C108 §9) — the 16x margin is the evidence.
    openingLatticeContinuityRatio: 0.4,
    openingLatticeTightnessScale: 0.25,

    combMatchTolerance: 0.5,
    combMatchMaxSizeRatio: 1.3,

    curvatureCentralFraction: 0.6,
    curvatureEdgeFraction: 0.15,
    curvatureMinDeviation: 0.01,

    soffitSearchFraction: 0.25,
    soffitMinDrop: 12,
    soffitMinCoverage: 0.75,
    soffitReferencePercentile: 0.75,

    surfaceMinPeak: 0.35,
});

export function resolveOptions(
    partial?: Partial<FacadeReconstructionOptions>,
): FacadeReconstructionOptions {
    return { ...DEFAULT_OPTIONS, ...(partial ?? {}) };
}
