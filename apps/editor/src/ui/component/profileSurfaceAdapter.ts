/**
 * profileSurfaceAdapter — the join that makes `ElevationOutlineSurface`'s subject a
 * **`Profile` on a `ReferencePlane`** instead of a wall elevation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * §ONE-PROFILE-EVALUATOR — the drawing and the solid read the profile through ONE function
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ **C86 §10.1 PR-1 generalises verbatim: ONE outline producer, and no consumer may
 * re-derive an arc.** *"A component sketch surface that tessellates its own arc is the second
 * producer"*, and `CurtainWallTool`'s rival `ARC_SEGMENTS = 10` beside `boundaryArc.ts`'s 16
 * is the live cautionary case. This adapter therefore samples **nothing**: it calls
 * `profileToPolygon` from `@pryzm/family-instance` — lane 4D's evaluator, the same one
 * `bakeFamilyInstance` feeds to the kernel — so **what the author sees drawn is what the bake
 * extrudes, because it is the same flattening**. Any second sampler here would be a drawing
 * that disagrees with its own solid.
 *
 * ⚠ **There ARE two arc flatteners in this repository and they are not interchangeable** —
 * `outlineArcSegment` (16 chords, `OUTLINE_ARC_SEGMENTS = BOUNDARY_ARC_SEGMENTS`, used by the
 * surface's own 3-click arc GESTURE) and `profileToPolygon`'s closed-form trig with
 * `segmentsForSweep` (tolerance-driven, used for a DOCUMENT's arcs). The split is by SUBJECT,
 * not by taste: the gesture authors a wall/opening outline in `geometry-wall`'s world, the
 * document carries a component profile in the family format's. This adapter never crosses
 * them, and the day a component profile gains a 3-click arc gesture, that gesture must write
 * an `arc` ENTITY and let `profileToPolygon` flatten it — not append the gesture's chords.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * §NO-SILENT-DEPARAMETRISATION — why most profiles are read-only on this surface
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The surface edits a **ring of vertices**. A profile that carries an `arc`, a `circle` or an
 * expression-valued coordinate carries INTENT that a ring cannot hold. Committing an edited
 * ring back over it would replace a parametric curve with sixteen chords and a formula with a
 * frozen number — silently, and with a save button attached. That is spec §75's prohibition
 * (*"no visual-only state, no hardcoded fake behaviour"*) and C81's sentence (*the model
 * retains WHY the geometry has its shape*) lost in one gesture, so `profileWriteBackDisposition`
 * REFUSES it by name and the caller shows the refusal (C16 CA-18). ⛔ Do not "fix" this by
 * writing the chords: a lossy commit that reports success is the forbidden outcome.
 *
 * ⚠ **OWED, to `packages/family-instance` (lane 4D's file, not this lane's).**
 * `profileToPolygon` already computes a per-vertex `sourceId` internally (`EmittedPoint`) and
 * DISCARDS it at the return. Exposing it would let a consumer join `constraints[].entityIds`
 * to polygon vertices exactly, and would delete `§ANCHOR-BY-CONTAINMENT`'s restriction below.
 * Until then this adapter anchors only what it can anchor EXACTLY, and says how many it could
 * not — it never picks the nearest vertex.
 */

import type { Profile, ReferencePlane } from '@pryzm/file-format';
import { profileToPolygon, ProfileEvalError } from '@pryzm/family-instance';
import type { EvalScope } from '@pryzm/family-runtime';
import type { WallProfileVertex } from '@pryzm/geometry-wall/profile';
import type {
    OutlineConstraintGlyph,
    OutlineSurfacePlane,
} from '../ElevationOutlineSurface';
import {
    constraintGlyphLabel,
    constraintGlyphTitle,
    constraintStatus,
} from './profileConstraints';

/** A refusal that names itself, its cause and the live alternative (C16 CA-18). */
export interface ProfileSurfaceRefusal {
    readonly code:
        | 'profile-eval-failed'
        | 'profile-degenerate-extent'
        | 'profile-not-a-ring-source'
        | 'profile-vertex-count-changed';
    readonly reason: string;
    readonly alternative: string;
}

export interface ProfileOnPlane {
    /** The ring in SURFACE coordinates — `u ∈ [0, length]`, `v ∈ [0, height]`. */
    readonly ring: readonly WallProfileVertex[];
    /** ⛔ PR-8: ONE size vocabulary. These are the profile's own bounds on its plane. */
    readonly extents: { readonly length: number; readonly height: number };
    /** Plane-local coordinates of surface `(0, 0)`. `planeToSurface`'s exact inverse. */
    readonly origin: { readonly u: number; readonly v: number };
    /** The plane declaration to hand the surface — never inferred (C86 §10.6.1c). */
    readonly plane: OutlineSurfacePlane;
}

export type ProfileToRingResult =
    | { readonly ok: true; readonly value: ProfileOnPlane }
    | { readonly ok: false; readonly refusal: ProfileSurfaceRefusal };

/**
 * Flatten a document `Profile` into the ring the surface draws, on its declared plane.
 *
 * ⭐ The IN-PLANE BASIS is declared, not guessed: `profileToPolygon` returns the profile in the
 * plane's own 2-D frame as `{ x, z }` (that is the frame `produceExtrude` consumes), so
 * `u = x` and `v = z`. No rotation, no projection, no camera. The only transform applied is a
 * TRANSLATION to the profile's minimum corner, because the surface's dimensional contract
 * places the drawing at `pad + u * scale` and a negative `u` would draw outside the box.
 */
export function profileToSurfaceRing(
    profile: Profile,
    plane: ReferencePlane,
    scope: EvalScope = {},
): ProfileToRingResult {
    let polygon;
    try {
        polygon = profileToPolygon(profile, scope);
    } catch (err) {
        // ⛔ The refusal is carried by NAME. `ProfileEvalError.code` already distinguishes
        // "under-determined" from "non-finite" from "too few points"; collapsing them into
        // one string here would throw away the only thing that tells an author what to fix.
        const detail = err instanceof ProfileEvalError
            ? `${err.code}: ${err.message}`
            : err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            refusal: {
                code: 'profile-eval-failed',
                reason: `profile '${profile.name}' did not evaluate — ${detail}`,
                alternative:
                    'fix the entity the message names, or open a profile whose coordinates are ' +
                    'numeric literals or expressions resolvable in the current parameter scope',
            },
        };
    }

    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const p of polygon) {
        if (p.x < minU) minU = p.x;
        if (p.x > maxU) maxU = p.x;
        if (p.z < minV) minV = p.z;
        if (p.z > maxV) maxV = p.z;
    }
    const length = maxU - minU;
    const height = maxV - minV;
    if (!(length > 0) || !(height > 0)) {
        // ⛔ NO INVENTED FLOOR. A zero-extent profile is collinear; giving it a made-up
        // 1 mm extent so the drawing "works" would render a shape the document does not
        // contain (spec §75). The refusal states which axis collapsed.
        return {
            ok: false,
            refusal: {
                code: 'profile-degenerate-extent',
                reason:
                    `profile '${profile.name}' has a zero extent on ` +
                    `${length > 0 ? 'v' : 'u'}${length > 0 || height > 0 ? '' : ' and both axes'}` +
                    ` (bounds ${minU}..${maxU} × ${minV}..${maxV}); its points are collinear, so it bounds no area`,
                alternative: 'move a vertex off the line, or open a profile that encloses an area',
            },
        };
    }

    return {
        ok: true,
        value: {
            ring: polygon.map((p) => ({ u: p.x - minU, v: p.z - minV })),
            extents: { length, height },
            origin: { u: minU, v: minV },
            plane: { id: plane.id, name: plane.name, uLabel: 'u', vLabel: 'v' },
        },
    };
}

/** Surface coordinates → plane-local. The exact inverse of the translation above. */
export function surfaceToPlane(
    p: WallProfileVertex,
    origin: { readonly u: number; readonly v: number },
): { readonly x: number; readonly z: number } {
    return { x: p.u + origin.u, z: p.v + origin.v };
}

/* ------------------------------------------------------------------ */
/* §ANCHOR-BY-CONTAINMENT — glyphs, and the ones that cannot be placed  */
/* ------------------------------------------------------------------ */

export interface ProfileGlyphResult {
    readonly glyphs: readonly OutlineConstraintGlyph[];
    /** Constraints that could not be anchored EXACTLY, with the reason each was skipped. */
    readonly unanchored: readonly { readonly id: string; readonly kind: string; readonly reason: string }[];
}

/**
 * Build the surface's constraint glyphs from the profile's persisted constraints.
 *
 * ⛔ **`§ANCHOR-BY-CONTAINMENT`.** A glyph is placed only where the constraint's entities
 * resolve to `point` entities whose numeric coordinates are **exactly** a vertex of the ring.
 * Nothing here picks the nearest vertex: C15 §2.2.2 axis 3 is normative that a subject is
 * *resolved by containment, never by proximity*, and a glyph that drifts onto the wrong edge
 * asserts a constraint the document does not carry. A constraint that cannot be placed is
 * RETURNED in `unanchored` with its reason — it is never silently absent, because "this
 * profile has no such constraint" and "I could not place its glyph" are different facts.
 */
export function profileConstraintGlyphs(
    profile: Profile,
    ring: readonly WallProfileVertex[],
    origin: { readonly u: number; readonly v: number },
): ProfileGlyphResult {
    const byId = new Map(profile.entities.map((e) => [e.id, e]));
    const glyphs: OutlineConstraintGlyph[] = [];
    const unanchored: { id: string; kind: string; reason: string }[] = [];

    for (const c of profile.constraints) {
        const indices: number[] = [];
        let skip: string | null = null;
        for (const eid of c.entityIds) {
            const e = byId.get(eid);
            if (!e) { skip = `entity '${eid}' is not in this profile`; break; }
            if (e.kind !== 'point') {
                skip = `entity '${eid}' is a '${e.kind}'; only 'point' entities can be located ` +
                    'exactly on the flattened ring (profileToPolygon does not return per-vertex provenance)';
                break;
            }
            const x = e.data['x'], z = e.data['z'];
            if (typeof x !== 'number' || typeof z !== 'number') {
                skip = `entity '${eid}' has expression-valued coordinates; the flattened ring cannot ` +
                    'be joined back to it without per-vertex provenance';
                break;
            }
            const matches: number[] = [];
            for (let i = 0; i < ring.length; i++) {
                const r = ring[i]!;
                if (r.u + origin.u === x && r.v + origin.v === z) matches.push(i);
            }
            if (matches.length === 0) { skip = `entity '${eid}' is not a vertex of the flattened ring`; break; }
            if (matches.length > 1) {
                // ⛔ AMBIGUOUS IS NOT RESOLVED BY PICKING ONE. Two entities at one coordinate
                // is a real document state; choosing between them would be a guess.
                skip = `entity '${eid}' matches ${matches.length} ring vertices at the same coordinate`;
                break;
            }
            indices.push(matches[0]!);
        }
        if (skip !== null || indices.length === 0) {
            unanchored.push({
                id: c.id,
                kind: c.kind,
                reason: skip ?? 'the constraint names no entities',
            });
            continue;
        }
        glyphs.push({
            id: c.id,
            kind: c.kind,
            status: constraintStatus(c.kind),
            vertexIndices: indices,
            label: constraintGlyphLabel(c.kind),
            title: constraintGlyphTitle(c.kind),
        });
    }
    return { glyphs, unanchored };
}

/* ------------------------------------------------------------------ */
/* §NO-SILENT-DEPARAMETRISATION — may an edited ring be written back?   */
/* ------------------------------------------------------------------ */

export type ProfileWriteBackDisposition =
    | { readonly writable: true; readonly pointIds: readonly string[] }
    | { readonly writable: false; readonly refusal: ProfileSurfaceRefusal };

/**
 * May the surface's ring be committed back onto this profile?
 *
 * ⭐ **YES only for a profile that IS a ring**: every entity a `point` with numeric `x`/`z`.
 * Then the commit is a coordinate update, entity for entity, and nothing is lost.
 *
 * ⛔ **NO for everything else, by name:**
 *   • an `arc` / `circle` / `spline` would become chords — a curve replaced by its flattening;
 *   • an expression-valued coordinate would become a frozen number — spec §64's *"the glass
 *     width is always the opening width minus twice the frame width"* silently demoted to a
 *     literal, which is exactly the D4 defect one layer over;
 *   • a `line` entity would need its referenced points rewritten and, on insert, NEW entity
 *     ids minted — and id minting is **uncontracted** (L-666, OPEN; C11 §7.6's own clause is
 *     still "Proposed"). ⛔ Minting ids here would add a fourth measured violation to that
 *     ledger to make an editor gesture work.
 */
export function profileWriteBackDisposition(profile: Profile): ProfileWriteBackDisposition {
    const pointIds: string[] = [];
    for (const e of profile.entities) {
        if (e.kind !== 'point') {
            return {
                writable: false,
                refusal: {
                    code: 'profile-not-a-ring-source',
                    reason:
                        `profile '${profile.name}' carries a '${e.kind}' entity (${e.id}); committing an ` +
                        'edited ring over it would replace authored geometry with its flattening and lose ' +
                        'the parametric intent',
                    alternative:
                        'edit the entity through its own parameters, or work on a profile whose entities ' +
                        'are all points',
                },
            };
        }
        if (typeof e.data['x'] !== 'number' || typeof e.data['z'] !== 'number') {
            return {
                writable: false,
                refusal: {
                    code: 'profile-not-a-ring-source',
                    reason:
                        `profile '${profile.name}' point ${e.id} has an expression-valued coordinate; ` +
                        'committing a dragged vertex over it would freeze the formula into a literal',
                    alternative: 'change the parameter the expression reads, or clear the expression first',
                },
            };
        }
        pointIds.push(e.id);
    }
    return { writable: true, pointIds };
}

export type ProfileCommitResult =
    | { readonly ok: true; readonly profile: Profile }
    | { readonly ok: false; readonly refusal: ProfileSurfaceRefusal };

/**
 * Produce the updated `Profile` for an edited ring. Pure — it returns a new document object
 * and dispatches nothing (P6: the CALLER owns what a commit means, exactly as the wall modal
 * and the two opening callers already do).
 *
 * ⛔ A vertex INSERT or DELETE is refused, not absorbed: the ring would no longer correspond
 * one-to-one with the profile's points, and closing the gap means minting entity ids under an
 * uncontracted policy (L-666).
 */
export function commitRingToProfile(
    profile: Profile,
    ring: readonly WallProfileVertex[],
    origin: { readonly u: number; readonly v: number },
): ProfileCommitResult {
    const disposition = profileWriteBackDisposition(profile);
    if (!disposition.writable) return { ok: false, refusal: disposition.refusal };
    if (ring.length !== disposition.pointIds.length) {
        return {
            ok: false,
            refusal: {
                code: 'profile-vertex-count-changed',
                reason:
                    `the ring now has ${ring.length} vertices and profile '${profile.name}' has ` +
                    `${disposition.pointIds.length} points; a commit would have to mint or delete entity ids, ` +
                    'and id minting is uncontracted here (L-666, C11 §7.6 still "Proposed")',
                alternative:
                    'move vertices without inserting or deleting, or add the point through a command that ' +
                    'owns id minting',
            },
        };
    }
    const updated = profile.entities.map((e, i) => {
        const p = surfaceToPlane(ring[i]!, origin);
        return { ...e, data: { ...e.data, x: p.x, z: p.z } };
    });
    return { ok: true, profile: { ...profile, entities: updated } };
}
