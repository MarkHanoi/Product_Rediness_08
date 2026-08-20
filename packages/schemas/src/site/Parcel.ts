// A.7.a (Phase A · Sprint 1) — Parcel schema (C19 §2.3).
//
// The legal lot outline + setbacks + zoning attributes. The polygon
// itself is immutable post-create per C19 §1.4; setbacks/FAR/zoning
// are MUTABLE via `site.updateZoning` per C19 §4.

import { z } from 'zod';
import { PtSchema } from './types.js';
import { ParcelProvenanceSchema } from './ParcelProvenance.js';

/**
 * The edge classification array MUST have exactly one entry per edge of
 * the polygon (`edgeClassifications.length === polygon.length`) per
 * [C19 §2.7 cross-schema validation 3]. Front / side / rear is needed
 * for the per-edge setback compliance check (C19 §1.6).
 */
export const ParcelEdgeClassificationSchema = z.enum([
    'front',
    'side',
    'rear',
    'unclassified',
]);
export type ParcelEdgeClassification = z.infer<
    typeof ParcelEdgeClassificationSchema
>;

/**
 * The parcel boundary — closed polygon in scene-XZ metres + per-edge
 * classifications. Per [C19 §1.4] this is immutable post-create.
 */
export const ParcelBoundarySchema = z.object({
    polygon: z.array(PtSchema).default([]),
    edgeClassifications: z.array(ParcelEdgeClassificationSchema).default([]),
});
export type ParcelBoundary = z.infer<typeof ParcelBoundarySchema>;

/**
 * ADR-0270 option A / C58 §1.7a — front/side/rear are NULLABLE.
 *
 * §1.7a: "For any non-`setback` rule those fields MUST be `null`. An engine or adapter MUST NOT
 * synthesise 'equivalent effective setbacks'." Before this, the three fields were plain numbers,
 * so an alignment-governed zone (*alineación a vial* + *profundidad edificable*) had **nowhere to
 * put the honest answer** — it could only store a fabricated triple, or leave stale numbers from a
 * previous solve, both of which look perfectly well-formed and are undetectably wrong downstream.
 * That is the "fact of the wrong SHAPE" hole §1.7a exists to close, and the reason the tripwire
 * forbade emitting an `alignment` result into `site.updateZoning` until this landed.
 *
 * `null` = "this zone is not setback-governed; the answer is not a number." It is NOT `0`, which
 * means "setback-governed, and the requirement is zero". Distinguishing those two is the whole
 * point — collapsing them re-creates the defect in a quieter disguise.
 *
 * The L0 helper `displaySetbacks()` (GeometricRule.ts) is the ONLY sanctioned way to derive the
 * triple from a rule; it already returns `null` for every non-`setback` kind.
 *
 * DEFAULT STAYS `0`, deliberately: it preserves the documented C19 behaviour for parcels created
 * without zoning, and this amendment is about what a SOLVE may write, not about redefining an
 * unzoned parcel. `null` is only ever written explicitly.
 */
export const ParcelSetbacksSchema = z.object({
    front: z.number().min(0).nullable().default(0),
    side: z.number().min(0).nullable().default(0),
    rear: z.number().min(0).nullable().default(0),
});
export type ParcelSetbacks = z.infer<typeof ParcelSetbacksSchema>;

export const ParcelZoningSchema = z.object({
    /** Jurisdiction-specific zone code (e.g. `'R-2'`, `'C-1'`). */
    category: z.string().min(1).nullable().default(null),
    /** Overlay codes (conservation area, flood zone, heritage). */
    overlays: z.array(z.string().min(1)).default([]),
    /** Future link to a Jurisdiction registry — out of scope C19. */
    jurisdictionRef: z.string().min(3).max(64).nullable().default(null),
});
export type ParcelZoning = z.infer<typeof ParcelZoningSchema>;

/**
 * The canonical Parcel. Per C19 §2.3 fields.
 *
 * `area` is computed (square metres of polygon) and recomputed only on
 * `site.create` per §1.4. The schema does not validate this — the L3
 * SiteModelStore enforces it.
 */
export const ParcelSchema = z.object({
    boundary: ParcelBoundarySchema.default({
        polygon: [],
        edgeClassifications: [],
    }),
    setbacks: ParcelSetbacksSchema.default({ front: 0, side: 0, rear: 0 }),
    maxFAR: z.number().min(0).nullable().default(null),
    maxHeight: z.number().min(0).nullable().default(null),
    zoning: ParcelZoningSchema.default({
        category: null,
        overlays: [],
        jurisdictionRef: null,
    }),
    /**
     * ADR-0270 option A / C58 §1.7a (L-451) — THE PERSISTED BUILDABLE TRUTH.
     *
     * The buildable-envelope INSET ring in the same scene-XZ frame as `boundary.polygon`.
     * `null` when no envelope has been solved.
     *
     * WHY THIS FIELD EXISTS. C58 §1.7 used to claim the envelope maps 1:1 onto
     * `setbacks.{front,side,rear}`. That holds ONLY for setback-governed zones. An
     * alignment-governed zone (*alineación a vial* + *profundidad edificable* + party walls —
     * Madrid publishes `Fondo de la Edificación` as a POLYLINE, verified live in L-438) has NO
     * front/side/rear triple that encodes it. Writing one would be a lossy coercion that is
     * INVISIBLE, because the stored numbers look perfectly well-formed.
     *
     * So the POLYGON is the truth and the three numbers are a derived, lossy summary. This is
     * barely a change in substance: C58 §2.4 already computed this ring and §1.8 already
     * threaded THE POLYGON — not the numbers — into generation. The contract had simply not
     * caught up with what the code already relied on.
     *
     * CONSUMER RULE (C58 §1.7a): anything asking "what may I build here" MUST read THIS.
     * Reading `setbacks` and re-insetting is valid only for `setback` zones and MUST NOT be a
     * general path — it silently reproduces the pre-ADR-0270 defect.
     *
     * NOT a second parcel outline: `boundary.polygon` remains immutable per C19 §1.4. This is a
     * DERIVED ring stored alongside the mutable zoning fields, and is recomputed by the engine.
     */
    buildableRing: z.array(PtSchema).nullable().default(null),

    /**
     * §L-1580 (C57 §1.4 / §2.2) — WHO PUBLISHED THIS RING, UNDER WHAT IDENTIFIER.
     *
     * C57 §1.4 is normative — "Provenance is not optional" — and until this field existed
     * it was structurally impossible to honour: `dispatchParcelBoundary` took only
     * `{ polygon, edgeClassifications }`, so `refcat` / `address` / `source` / `sourceCrs`
     * / `confidence` were all dropped at the commit seam and no schema in
     * `packages/schemas/src` had anywhere to put them (`grep -rn refcat packages/schemas/src`
     * → 0 hits, measured 2026-08-20).
     *
     * ⚠ `null` MEANS **NOT RECORDED**, NOT "no source". Every project committed before
     * §L-1580 has `null` here, and so does every hand-drawn boundary whose author did not
     * stamp `kind: 'user-drawn'`. A reader MUST NOT render that as a blank row, a dash, or
     * a zero — it must say the provenance was not recorded and why (C84 EI-1b: failure and
     * emptiness must never be the same value). `parcelCard.ts` is the one producer that
     * does this, and both the map overlay and the GIS rail panel mount it.
     *
     * NOT part of the C19 §1.4 one-shot polygon immutability: the RING is immutable, its
     * attribution is a recordable fact about where the ring came from. It is written by
     * `site.setParcelBoundary` alongside the polygon, and never by a direct store write (P6).
     */
    provenance: ParcelProvenanceSchema.nullable().default(null),

    /** Computed square metres of polygon; the L3 store fills this. */
    area: z.number().min(0).default(0),
});
export type Parcel = z.infer<typeof ParcelSchema>;
