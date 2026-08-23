// @pryzm/geometry-boundary-line — the shared vocabulary.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900) · C105 · ADR-0348.
//
// ⛔ NOT `Parcel.boundary` (C19 §1.4 — a legal, surveyed, ONE-SHOT IMMUTABLE polygon
// owned by the site subsystem; there is deliberately no `site.editParcelBoundary`).
// ⛔ NOT `RoomBoundingLine` (`@pryzm/core-app-model` — an invisible 2-point splitter
// consumed by room DETECTION, which hosts nothing and has no volume).
// C105 §0.2 tabulates all three.

import type { BoundaryLine as BoundaryLineSchema, BoundaryLineAttachment } from '@pryzm/schemas';

/** The record, inferred from the canonical L0 Zod schema — never re-typed here. */
export type BoundaryLineData = BoundaryLineSchema;

/** One dependent's parametric anchor. Re-exported so consumers need one import. */
export type { BoundaryLineAttachment };

/** A plain point in the world XZ plane. */
export interface Vec2XZ {
    readonly x: number;
    readonly z: number;
}

/** A plain 3-D point (world metres). */
export interface Vec3XYZ {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * Every drawing mode a boundary line offers — the founder's list, verbatim:
 * *"like the wall, with the same modes for creation — line, ortho, rectangle,
 * ellipse, curve, circle"*.
 *
 * ⚠ THE ORDER AND THE SPELLING ARE LOAD-BEARING, AND NEITHER IS INVENTED HERE.
 * The first three are `@pryzm/geometry-slab`'s `BoundaryDrawMode`
 * (`'linear' | 'ortho' | 'curved'`) and the last three are its `BoundaryLoopMode`
 * (`'rectangular' | 'circular' | 'elliptical'`) — the SAME two unions the slab,
 * floor-finish, ceiling and pool tools resolve their modes from, and the same ones
 * `boundaryLoopVertices()` generates. So the boundary line's mode strip cannot offer
 * a shape the generator does not implement.
 *
 * ⛔ This module deliberately does NOT import `@pryzm/geometry-slab` to get them.
 * That import would be L2→L2 and legal, but it would make this package depend on the
 * slab family for a list of six strings, and the L0 schema's `drawMode` enum cannot
 * import it at all (L0 imports nothing). Instead the three lists are asserted EQUAL
 * by `boundaryLineDrawModeVocabulary.test.ts`, which imports all three and compares
 * them as SETS. ⭐ A test that compares is stronger here than an import that couples,
 * because it also catches the L0 enum drifting — which an import could not.
 *
 * ⭐ `rectangular`, NOT `rectangle`. The slab family carries both spellings for
 * historic reasons and pays for it in a mapping ladder (L-1322). This family starts
 * on the canonical side and so has nothing to reconcile later (C84 EI-8).
 */
export const BOUNDARY_LINE_DRAW_MODES = [
    'linear',
    'ortho',
    'curved',
    'rectangular',
    'circular',
    'elliptical',
] as const;

export type BoundaryLineDrawMode = (typeof BOUNDARY_LINE_DRAW_MODES)[number];

/** The three modes that produce a CLOSED ring in one two-click gesture. */
export const BOUNDARY_LINE_LOOP_MODES = ['rectangular', 'circular', 'elliptical'] as const;
export type BoundaryLineLoopMode = (typeof BOUNDARY_LINE_LOOP_MODES)[number];

export function isBoundaryLineDrawMode(v: unknown): v is BoundaryLineDrawMode {
    return typeof v === 'string' && (BOUNDARY_LINE_DRAW_MODES as readonly string[]).includes(v);
}

export function isBoundaryLineLoopMode(v: unknown): v is BoundaryLineLoopMode {
    return typeof v === 'string' && (BOUNDARY_LINE_LOOP_MODES as readonly string[]).includes(v);
}

/**
 * The narrowest read/write surface `MoveBoundaryLineCommand` needs from whatever
 * object happens to hold boundary lines.
 *
 * ⭐ A PORT, NOT AN IMPORT. `packages/command-registry` sits at L2 and the store that
 * holds boundary lines is built by `PluginRegistry` at L7 — the command may not import
 * it. Declaring the shape here (L2) and having the L6 store satisfy it STRUCTURALLY is
 * what lets the authoritative command reach the authoritative store without inverting
 * a layer. It is the same move `CommandContext.stores` already makes for a dozen
 * families, narrowed to the two methods this one actually calls.
 *
 * ⚠ It is deliberately NOT `{ get, set }` over `unknown`: an `any`-shaped seam is a
 * defect factory ([[fake-more-capable-than-real]]), and the point of the port is that
 * a store which cannot answer `get` is a COMPILE error rather than a runtime silence.
 */
export interface BoundaryLineStorePort {
    /** The record, or `undefined` when the id is unknown. MUST NOT throw. */
    getBoundaryLine(id: string): BoundaryLineData | undefined;
    /**
     * Replace the record. MUST be observable through a subsequent `getBoundaryLine`
     * — the command RE-READS every write back rather than trusting it (L-2401).
     */
    setBoundaryLine(id: string, next: BoundaryLineData): void;
}

/** Which physical shape a dependent family has, and therefore how it is re-seated. */
export type DependentShape =
    /** One position. Translated. (column, furniture, plumbing, lighting, stair, roof) */
    | 'point'
    /** Two endpoints. Both re-seated from `attachment` + `attachment.end`. (wall, beam, handrail, curtain wall) */
    | 'line'
    /** A polygon. Every vertex rides the whole line's transform. (slab, floor, ceiling, room) */
    | 'area';
