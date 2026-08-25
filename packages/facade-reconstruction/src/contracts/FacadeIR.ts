// C108 §1 — the Facade Intermediate Representation.
//
// ⛔ THE SHAPE BELOW IS THE FOUNDER'S, FROM HIS BRIEF §17, AND IT IS BINDING:
//
//   { "version":"0.1","units":"normalized",
//     "scale":{"status":"unknown","metersPerUnit":null,"confidence":0},
//     "facade":{ "width":1,"height":1,"confidence":0,
//       "zones":[{"y":0,"height":0,"confidence":0,
//         "cells":[{"x":0,"y":0,"width":0,"height":0,"confidence":0,
//           "opening":{"a":0,"b":0,"n":0,"archness":0},
//           "protrusion":{"depth":0,"profile":[]}}]}],
//       "features":[], "outliers":[] } }
//
// §17 permits extension "only when necessary" and forbids building-type-specific
// schemas outright. C108 §1.2 is therefore a CLOSED TABLE: every extension below
// carries the brief clause that forces it, as a comment, at its declaration. A
// field without such a comment is a contract breach.
//
// ⛔ NO SEMANTIC LABELS (brief §3, §8; C108 §1.3). There is no `window`, `door`,
// `arcade`, `entrance` or `balcony` in this file, and no style label of any kind.
// Every detected aperture is an `opening`. A later semantic pass READS this; it
// does not get to edit those words into it.
//
// ⛔ DIAGNOSTICS ARE NOT IR (C108 §1.3). `reconstructFacade` returns
// `{ ir, diagnostics }` so a consumer serialising the IR never ships intermediate
// rasters into a project file.
//
// LAYERING — L1: zod + @pryzm/schemas (L0). No THREE (P2), no DOM, no I/O.

import { z } from 'zod';
import { FacadeConfidenceSchema } from './FacadeConfidence.js';

/** A normalized scalar in [0,1] — the facade coordinate system's unit (brief §5). */
const Normalized = z.number().min(0).max(1);

/**
 * The confidence pair every node carries.
 *
 * `confidence` is the brief §17 scalar and `evidence` is the C62
 * `DomainConfidence` — **the same number**, with `evidence` able to say
 * `score: null` + `unknownReason`, which a bare scalar cannot (C108 §4.2).
 */
export const ConfidencePairShape = {
    /** brief §17 — `null` means UNKNOWN, never "zero confidence" (C108 §2.3). */
    confidence: z.number().min(0).max(1).nullable(),
    /** C62 §1.2 extension — the typed record behind the scalar. */
    evidence: FacadeConfidenceSchema,
};

/**
 * A superellipse opening: `|x/a|^n + |y/b|^n = 1` (brief §8, §9).
 *
 * `a`/`b` are the SEMI-axes and are the founder's field names. `width`/`height`
 * are the C108 §1.2 extension forced by brief §9's `{ width, height, n, archness,
 * confidence }`, and are exactly `2a` / `2b` — kept so a consumer never has to
 * know which convention a given field follows.
 *
 * ⛔ `archness` is CONTINUOUS and there is no threshold at which an opening
 * "becomes an arch" (brief §9: *"Do not create a special 'Mediterranean arcade'
 * rule — fit their geometry."*). A consumer wanting a boolean computes one
 * downstream and owns the threshold.
 */
export const OpeningSchema = z.object({
    /** Semi-width, normalized against the facade width. */
    a: Normalized,
    /** Semi-height, normalized against the facade height. */
    b: Normalized,
    /** Superellipse exponent. ~2 is an ellipse/arch; large approaches a rectangle. */
    n: z.number().min(1),
    /** 0 = flat top, 1 = fully semicircular. Continuous, never bucketed. */
    archness: Normalized,
    /** C108 §1.2 (brief §9) — `2a`, restated in the brief's own vocabulary. */
    width: Normalized,
    /** C108 §1.2 (brief §9) — `2b`, restated in the brief's own vocabulary. */
    height: Normalized,
    ...ConfidencePairShape,
});
export type Opening = z.infer<typeof OpeningSchema>;

/**
 * A parametric projection or recess (brief §11).
 *
 * ⛔ `depth` is `null` in Milestone 1 and that is the CORRECT value (C108 §3.10,
 * L-11005). A single uncalibrated image with no sun vector and no scale does not
 * carry depth. What it does carry is a soffit/shadow band beneath a projecting
 * slab, and that band's height is measurable — so the CUE is reported and the
 * DEPTH is unknown-with-a-reason. Brief §11 closes: *"Never hallucinate exact
 * dimensions."*
 */
export const ProtrusionSchema = z.object({
    /** Positive = projecting toward the viewer. `null` = NOT KNOWN from this image. */
    depth: z.number().nullable(),
    /** brief §11's optional depth profile across the element. Empty when unknown. */
    profile: z.array(z.number()),
    /** C108 §1.2 (C62 §1.1) — why `depth` is null. Omitted when it is not. */
    unknownReason: z.string().optional(),
    /** C108 §1.2 (brief §11) — the measurable cue, kept separate from the claim. */
    soffitBandHeight: z.number().nullable(),
    ...ConfidencePairShape,
});
export type Protrusion = z.infer<typeof ProtrusionSchema>;

/** One cell of the zone x bay lattice (brief §17). */
export const CellSchema = z.object({
    x: Normalized,
    y: Normalized,
    width: Normalized,
    height: Normalized,
    /** `null` when the cell shows no aperture — an absence, not a zero-size opening. */
    opening: OpeningSchema.nullable(),
    protrusion: ProtrusionSchema.nullable(),
    ...ConfidencePairShape,
});
export type Cell = z.infer<typeof CellSchema>;

/**
 * A horizontal band of the facade (brief §7).
 *
 * ⛔ GEOMETRIC, NOT SEMANTIC: `zone 0: y = 0.00 -> 0.20`, never "ground floor".
 * Brief §7 is explicit, and the ground zone is DISCOVERED as a break in the
 * vertical comb fit rather than assumed (C108 §3.5).
 */
export const ZoneSchema = z.object({
    y: Normalized,
    height: Normalized,
    cells: z.array(CellSchema),
    ...ConfidencePairShape,
});
export type Zone = z.infer<typeof ZoneSchema>;

/**
 * A facade element that does NOT fit the dominant grid but is structured enough
 * to be named as geometry (brief §10, §15).
 *
 * ⛔ Nothing in this engine knows what a lightwell is. A `feature` is *any*
 * unmatched detection that is vertically continuous across two or more zones —
 * which is the signature brief §10 describes, expressed as a measurement.
 */
export const FeatureSchema = z.object({
    x: Normalized,
    y: Normalized,
    width: Normalized,
    height: Normalized,
    /** How many zones it spans — the evidence for calling it a feature at all. */
    zoneSpan: z.number().int().min(1),
    note: z.string(),
    ...ConfidencePairShape,
});
export type Feature = z.infer<typeof FeatureSchema>;

/** brief §15 — *"Do not force these into the dominant pattern."* */
export const OutlierSchema = z.object({
    x: Normalized,
    y: Normalized,
    width: Normalized,
    height: Normalized,
    note: z.literal('unclassified'),
    ...ConfidencePairShape,
});
export type Outlier = z.infer<typeof OutlierSchema>;

/**
 * C108 §1.2 (brief §7) — the MEASURED symmetry.
 *
 * ⛔ A low score is REPORTED as low. The brief's hypothesis (a facade
 * approximately symmetrical about a central element) is a hypothesis to be
 * TESTED, and the test is allowed to fail. `axisX` is never defaulted to 0.5 and
 * `score` is never floored.
 */
export const SymmetrySchema = z.object({
    axisX: Normalized.nullable(),
    score: Normalized.nullable(),
    ...ConfidencePairShape,
});
export type Symmetry = z.infer<typeof SymmetrySchema>;

/**
 * C108 §1.2 (brief §14) — the repeated structure, as a reusable procedural rule.
 *
 * ⛔ `repeatX` / `repeatY` are `round(extent / period)` from a phase-locked comb
 * fit. They are NEVER a constant, and this is the field that makes
 * `if (fiveFloors)` structurally impossible (brief §22).
 */
export const PeriodicitySchema = z.object({
    repeatX: z.number().int().min(0).nullable(),
    repeatY: z.number().int().min(0).nullable(),
    /** Period in normalized facade units. `null` when no period was supported. */
    periodX: Normalized.nullable(),
    periodY: Normalized.nullable(),
    ...ConfidencePairShape,
});
export type Periodicity = z.infer<typeof PeriodicitySchema>;

/**
 * C108 §1.2 (brief §13) — the facade surface as a PARAMETER.
 * ⛔ *"Do NOT model every tile individually."*
 */
export const SurfaceSchema = z.object({
    pattern: z.enum(['grid', 'none']),
    scaleX: Normalized.nullable(),
    scaleY: Normalized.nullable(),
    ...ConfidencePairShape,
});
export type Surface = z.infer<typeof SurfaceSchema>;

/**
 * C108 §1.2 (brief §12) — one curved edge region.
 *
 * ⚠ `normalizedRadius` is `null` in Milestone 1 and that is the HONEST value
 * (C108 §3.9, L-11004). One uncalibrated image determines that the edges bend and
 * roughly by how much; it does not determine a radius. Reporting one would be an
 * UNKNOWN constraint drawn as a number.
 */
export const CurvedEdgeSchema = z.object({
    /** Systematic outer-band deviation from straight, normalized. 0 = flat. */
    normalizedDeviation: z.number().nullable(),
    /** ⛔ `null` in M1 — see the note above. */
    normalizedRadius: z.number().nullable(),
    ...ConfidencePairShape,
});
export type CurvedEdge = z.infer<typeof CurvedEdgeSchema>;

export const CurvatureSchema = z.object({
    left: CurvedEdgeSchema,
    right: CurvedEdgeSchema,
});
export type Curvature = z.infer<typeof CurvatureSchema>;

/**
 * Scale (brief §5, §16).
 *
 * ⛔ TWO STATES, and there is no third (C108 §2.2, L-11009). Scale is either
 * UNKNOWN or USER-SUPPLIED. No stage may write `metersPerUnit` from a storey-height
 * prior, a door-height prior, EXIF or a lookup — each of those is a guess dressed
 * as a measurement. An automatic estimator, if ever wanted, is a NEW status value,
 * a new C108 §1.2 row and its own authority rank; never a silent write here.
 */
export const ScaleSchema = z.object({
    status: z.enum(['unknown', 'user-supplied']),
    metersPerUnit: z.number().positive().nullable(),
    /** C108 §1.2 (C62 §1.1) — an unknown MUST carry a typed reason. */
    unknownReason: z.string().optional(),
    ...ConfidencePairShape,
});
export type Scale = z.infer<typeof ScaleSchema>;

/** The facade plane (brief §6, §17). */
export const FacadeSchema = z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    zones: z.array(ZoneSchema),
    features: z.array(FeatureSchema),
    outliers: z.array(OutlierSchema),
    // ── C108 §1.2 extensions, each with its forcing brief clause ──────────────
    /** brief §7 */ symmetry: SymmetrySchema,
    /** brief §14 */ periodicity: PeriodicitySchema,
    /** brief §13 */ surface: SurfaceSchema,
    /** brief §12 */ curvature: CurvatureSchema,
    ...ConfidencePairShape,
});
export type Facade = z.infer<typeof FacadeSchema>;

/** The brief §17 root. */
export const FacadeIRSchema = z.object({
    version: z.literal('0.1'),
    units: z.enum(['normalized', 'meters']),
    scale: ScaleSchema,
    facade: FacadeSchema,
});
export type FacadeIR = z.infer<typeof FacadeIRSchema>;

/** Runtime validation of a hand-authored or round-tripped IR. */
export function parseFacadeIR(value: unknown): FacadeIR {
    return FacadeIRSchema.parse(value);
}
