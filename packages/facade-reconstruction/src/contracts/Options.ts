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

    combMatchTolerance: 0.5,
    combMatchMaxSizeRatio: 1.3,

    curvatureCentralFraction: 0.6,
    curvatureEdgeFraction: 0.15,
    curvatureMinDeviation: 0.01,

    soffitSearchFraction: 0.25,
    soffitMinDrop: 12,
    soffitMinCoverage: 0.75,

    surfaceMinPeak: 0.35,
});

export function resolveOptions(
    partial?: Partial<FacadeReconstructionOptions>,
): FacadeReconstructionOptions {
    return { ...DEFAULT_OPTIONS, ...(partial ?? {}) };
}
