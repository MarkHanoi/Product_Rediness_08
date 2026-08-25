// C108 §6.3 (brief §18) — VISUAL DEBUGGING IS MANDATORY, so the diagnostic layers
// are a DELIVERABLE, not debugging leftovers.
//
//     "I should be able to look at the result and immediately see whether the
//      algorithm understood the facade."  — brief §18
//
// ⭐ THIS IS THE ONLY DEFENCE THAT SCALES TO THE REAL PHOTOGRAPH. Against the
// synthetic corpus there is ground truth to assert on. Against the founder's
// building there is none — his eye is the oracle, and §18 is what gives it
// something to look at. A stage that emits no diagnostic layer is INCOMPLETE.
//
// ⛔ Diagnostics are NOT part of the IR (C108 §1.3). They live here so a consumer
// serialising the IR never ships intermediate rasters into a project file.

import type { Point2, Quad, Rect, RasterImage } from './RasterImage.js';

/** A detected straight line in the source image, in normal form. */
export interface DetectedLine {
    /** Distance from the origin to the line. */
    readonly rho: number;
    /** Normal angle in radians. */
    readonly theta: number;
    /** Accumulator votes — the line's supporting edge mass. */
    readonly votes: number;
    /** Which family the line was sorted into. */
    readonly family: 'horizontal' | 'vertical' | 'other';
}

/** A vanishing point in homogeneous coordinates: `w ~ 0` is a point at infinity. */
export interface VanishingPoint {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    /** Fraction of line pairs supporting this cluster, in [0,1]. */
    readonly support: number;
    /** True when `|w|` is below the degeneracy epsilon — the parallel-lines case. */
    readonly atInfinity: boolean;
}

/** A 1-D signal plus the periodicity that was fitted to it (brief §14, §18). */
export interface ProfileDiagnostic {
    /** The raw projection profile. */
    readonly profile: readonly number[];
    /** Normalised autocorrelation of `profile`. */
    readonly autocorrelation: readonly number[];
    /** Indices of the accepted peaks. */
    readonly peaks: readonly number[];
    /** Fitted period in samples; `null` when none was supported. */
    readonly period: number | null;
    /** Fitted comb phase in samples. */
    readonly phase: number | null;
    /** Comb fit score in [0,1] — the confidence this stage reports. */
    readonly fit: number | null;
    /** Sample indices where the comb fit collapses — brief §14's periodicity breaks. */
    readonly breaks: readonly number[];
}

/**
 * One axis of the lattice, and WHICH OF TWO RIVAL MEASUREMENTS produced it.
 *
 * ⭐ C108 §3.4 keeps both sources alive: the openings are primary and the wall's
 * projection profile is the fallback AND the cross-check. This record is what makes
 * that visible rather than merely true — a consumer can see which signal was
 * believed, what the other one said, and whether they agreed.
 *
 * ⛔ A disagreement is INFORMATION, not an error. It is the pipeline saying "the
 * wall says one thing and the windows say another", which is the single most useful
 * sentence it can offer a human looking at a facade it got wrong.
 */
export interface LatticeAxisDiagnostic {
    /** Which measurement the boundaries below actually came from. */
    readonly source: 'openings' | 'projection-profile';
    /** Band edges in RECTIFIED samples, ascending, tiling `[0, extent]`. */
    readonly boundaries: readonly number[];
    /** Bands produced by the source that was USED. */
    readonly bands: number;
    /** Bands the OPENING clustering produced, or `null` when it refused. */
    readonly fromOpenings: number | null;
    /** Bands the PROJECTION PROFILE produced. Always computed, always reported. */
    readonly fromProfile: number;
    /** Set when the opening derivation refused, naming why (C62 §1.1). */
    readonly refusedReason: string | null;
    /** Measured line pitch in samples, from whichever source was used. */
    readonly pitch: number | null;
    /** Openings voting for a typical line — the evidence behind the lattice. */
    readonly medianSupport: number | null;
    /** Lines interpolated into integer-multiple gaps (a bay with no openings). */
    readonly interpolated: number;
    /** Lines added beyond the outermost cluster because a whole pitch still fitted. */
    readonly extended: number;
    /** Clusters rejected for insufficient support — aperiodic clutter. */
    readonly rejected: number;
}

/** A detected connected component before it is classified (brief §18). */
export interface DetectedBlob {
    readonly bbox: Rect;
    readonly area: number;
    readonly rectangularity: number;
    /** Which comb node it matched, or `null` — the S13 match (brief §10, §15). */
    readonly matchedCell: { readonly row: number; readonly col: number } | null;
}

/**
 * Every overlay layer brief §18 asks for, in its own order.
 *
 * Fields are nullable rather than optional so that a stage which REFUSED is
 * distinguishable from a stage that was never reached — the same
 * failure-vs-empty distinction C62 §1.1 makes for values.
 */
export interface FacadeDiagnostics {
    /** brief §18 — "cropped photograph". */
    readonly crop: {
        readonly rect: Rect;
        readonly applied: boolean;
        /** Set when the crop was REFUSED by a C108 §3.1 cap rather than not needed. */
        readonly refusedReason: string | null;
        readonly image: RasterImage;
    };
    /** brief §18 — the edge map the line stage consumed. */
    readonly edges: { readonly image: RasterImage; readonly highThreshold: number };
    /** brief §18 — "detected facade quadrilateral". */
    readonly lines: readonly DetectedLine[];
    readonly vanishingPoints: {
        readonly horizontal: VanishingPoint | null;
        readonly vertical: VanishingPoint | null;
    };
    readonly facadeQuad: {
        readonly quad: Quad | null;
        readonly status: 'detected' | 'user-supplied' | 'needs-user';
        readonly confidence: number | null;
    };
    /** brief §18 — "rectified facade". */
    readonly rectified: { readonly image: RasterImage | null; readonly aspect: number | null };
    /** brief §18 — "horizontal floor/zone lines" + "vertical bay lines". */
    readonly rows: ProfileDiagnostic | null;
    readonly cols: ProfileDiagnostic | null;
    /**
     * brief §18 — the lattice actually used, per axis, and the rival reading.
     *
     * ⚠ `rows`/`cols` above are the PROFILE COMB's own diagnostic and are NOT the
     * lattice. They were the lattice until 2026-08-25 (C108 §3.4, L-10971), and an
     * overlay that draws `rows.period` is drawing the comb, not the zones.
     */
    readonly lattice: { readonly zones: LatticeAxisDiagnostic; readonly bays: LatticeAxisDiagnostic };
    /** brief §18 — "opening masks". */
    readonly blobs: readonly DetectedBlob[];
    /** brief §18 — "symmetry axis". */
    readonly symmetry: { readonly axisX: number | null; readonly score: number | null };
    /** brief §18 — "balcony/projection regions". */
    readonly soffits: readonly { readonly y: number; readonly bandHeight: number; readonly drop: number }[];
    /** brief §18 — "confidence heatmap", one value per cell, row-major. */
    readonly confidenceHeatmap: readonly (number | null)[];
    /**
     * §L-11128 — measured colour (S17). REPORTING only: the wall's and the matched
     * openings' median RGB with a uniformity `share`; `confidence` is the wall
     * share when a facade plane exists and `null` (UNKNOWN) otherwise. The mapper's
     * own floor decides whether it reaches a building; nothing here does.
     */
    readonly colour: {
        readonly wall: { readonly hex: string; readonly share: number; readonly samples: number } | null;
        readonly openings: { readonly hex: string; readonly share: number; readonly samples: number } | null;
        readonly confidence: number | null;
    };
    /** Human-readable trace: what each stage did, and what it REFUSED to do. */
    readonly notes: readonly string[];
}

/** The two points of a brief §16 reference dimension, for the UI overlay. */
export interface ReferenceDimension {
    readonly p0: Point2;
    readonly p1: Point2;
    readonly meters: number;
}
