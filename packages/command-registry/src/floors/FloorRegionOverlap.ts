/**
 * FloorRegionOverlap — §C83-S5, the IMPOSSIBLE-class predicate for
 * **two floor finishes claiming the same floor area**.
 *
 * ── THE FOUNDER'S REPORT, and why it is IMPOSSIBLE and not INADVISABLE ───────
 *
 *   "in an area with a floor finish already in place the user creates two
 *    internal partitions … then the user tries to create a different floor
 *    finish in the room - and creates an overlapping one - wrong!"
 *
 * C83 §1.1's boundary is not "severe vs mild", it is **"can context reverse
 * it?"**. Two finishes over one patch of floor are two mutually exclusive
 * claims about one surface: oak here, and tile here, at the same FFL, in the
 * same square metre. There is no site, no typology, no client brief under which
 * that becomes correct — the model cannot represent it, the meshes z-fight, the
 * quantity take-off double-counts the area, and the IFC export publishes two
 * `IfcCovering`s over one `IfcSpace`. **A rule that can never be wrong may
 * refuse** (C83 §1.2), so this one refuses.
 *
 * ── WHY THIS UNION AND NOT `CanPlaceRefusalCode` ─────────────────────────────
 * C83 §1.4.1 puts **wall-side occupancy** codes into `CanPlaceRefusalCode`
 * itself, on the argument that they are *"the same question about the same
 * volume asked from the other side"*. That argument does not reach here, and
 * borrowing the union on its strength would be the drift §1.4 exists to stop:
 * every `OCC_*` member is about a **1-D span on ONE wall** (`canPlace(wall,
 * offsetM, widthM)`), and a floor region is a **2-D ring on a level**. The
 * signature cannot express it and the members would not read as siblings.
 *
 * So this is a SIBLING union, structurally identical by construction — closed
 * union · value roster · `Exclude<>` completeness assertion · `Record<>` default
 * sentence per member · one renderer that CARRIES the code into the user-facing
 * string · an `*_UNIDENTIFIED` name for a refusal that arrives without one.
 * **NEVER widen it to `string`.** (Proposed C83 §1.4 amendment, clause 1a, is
 * recorded in this lane's report rather than edited into the contract.)
 *
 * ── WHERE THE GEOMETRY COMES FROM (nothing new is authored here) ─────────────
 * `intersectPolygons2D` (`@pryzm/geometry-kernel/pure/polygonBoolean`, GE-05) is
 * the repo's ONE oracle-pinned 2-D boolean. It is used rather than a hand-rolled
 * overlap test for three reasons that are all C83/C73 requirements:
 *
 *   • it REFUSES (`ok: false`) on self-intersecting or degenerate input instead
 *     of returning a plausible wrong ring — which is what lets this predicate
 *     honour C83 §5.3 (**silence on UNDETERMINED**) rather than guess;
 *   • an overlap thinner than `COINCIDENT_M` (1 mm) reads as NO overlap **by
 *     declaration**, oracle-pinned as case J. That is exactly the silence this
 *     rule needs: two finishes that merely SHARE AN EDGE — the normal result of
 *     the L-240 inner-face inset on two rooms either side of one partition —
 *     produce an empty intersection, not a refusal;
 *   • it is deterministic (C73), so the same two rings always yield the same
 *     area and the refusal sentence is stable.
 *
 * ── WHAT THIS FILE MAY NOT DO ────────────────────────────────────────────────
 * It does not mutate, it does not read a store, it does not touch `window`, and
 * it does not know what a "surface" is. It is a pure function at the lowest
 * layer its inputs permit (C83 §8.0: *"a C83 rule PREDICATE is authored as a
 * pure function at the LOWEST layer all its inputs permit, and the editor calls
 * it — never the reverse, and never a copy"*). The seam that shows a person the
 * answer is `apps/editor/src/engine/consequence/floorFinishGate.ts`.
 *
 * @file packages/command-registry/src/floors/FloorRegionOverlap.ts
 */

import { intersectPolygons2D, type Pt2 } from '@pryzm/geometry-kernel';

// ─── Public types ─────────────────────────────────────────────────────────────

/** The minimum a caller must supply per vertex. Plan coordinates, metres. */
export interface FloorRegionVertex {
    readonly x: number;
    readonly z: number;
}

/** The finish being proposed. `id` is OPTIONAL — a not-yet-created finish has none. */
export interface CandidateFloorRegion {
    /** Present only when re-checking an EXISTING finish (a boundary edit). Excludes self. */
    readonly id?: string;
    readonly levelId: string;
    readonly polygon: readonly FloorRegionVertex[];
    /** Optional, for the sentence only — never used in the decision. */
    readonly label?: string;
}

/** A finish already in the model. */
export interface ExistingFloorRegion {
    readonly id: string;
    readonly levelId: string;
    readonly polygon: readonly FloorRegionVertex[];
    readonly label?: string;
    readonly systemTypeId?: string;
    readonly hostRoomId?: string;
}

/**
 * §REFUSAL-IDENTITY (C58 §1.13, C83 §1.4) — the CLOSED set of reasons
 * `evaluateFloorFinishPlacement` can refuse. One member per refusal arm.
 * Do NOT widen to `string`.
 */
export type FloorRegionRefusalCode =
    /** The proposed ring overlaps an existing finish's ring by a reportable area. */
    | 'FIN_REGION_ALREADY_FINISHED';

/**
 * The CLOSED union as a VALUE, so the set can be iterated (tests, exhaustiveness)
 * as well as type-checked. A second member added to the union without a roster
 * entry is a COMPILE error, not a silently short roster.
 */
export const FLOOR_REGION_REFUSAL_CODES = [
    'FIN_REGION_ALREADY_FINISHED',
] as const satisfies readonly FloorRegionRefusalCode[];

/** Compile-time completeness: resolves to `never` only when the roster is exact. */
type _FloorRegionRosterIsComplete =
    Exclude<FloorRegionRefusalCode, (typeof FLOOR_REGION_REFUSAL_CODES)[number]> extends never
        ? true
        : ['MISSING FROM FLOOR_REGION_REFUSAL_CODES',
           Exclude<FloorRegionRefusalCode, (typeof FLOOR_REGION_REFUSAL_CODES)[number]>];
const _floorRegionRosterIsComplete: _FloorRegionRosterIsComplete = true;
void _floorRegionRosterIsComplete;

/**
 * The sentence used when a refusal carries its code but no computed prose.
 * `Record<FloorRegionRefusalCode, string>` makes a missing arm a compile error.
 */
const FLOOR_REGION_DEFAULT_SENTENCE: Record<FloorRegionRefusalCode, string> = {
    FIN_REGION_ALREADY_FINISHED:
        'this floor area already carries a finish, and two finishes cannot cover the same floor',
};

/** One overlap, with BOTH numbers — the area claimed twice and the area asked for. */
export interface FloorRegionOverlapViolation {
    readonly code: FloorRegionRefusalCode;
    readonly existingFloorId: string;
    readonly existingLabel?: string;
    readonly existingSystemTypeId?: string;
    readonly existingHostRoomId?: string;
    /** m² claimed by BOTH rings. */
    readonly overlapAreaM2: number;
    /** m² the user is asking for. */
    readonly candidateAreaM2: number;
    /** `overlapAreaM2 / candidateAreaM2`, clamped to [0, 1]. 1 ⇒ fully covered already. */
    readonly overlapFraction: number;
}

/**
 * Why a comparison could not be settled. C83 §5.3: an unanswerable question
 * produces **no finding**, and the unanswerability is reported as itself — never
 * as a clean pass and never as a violation.
 */
export type FloorRegionUndeterminedReason =
    /** The proposed ring has < 3 distinct vertices or no area. */
    | 'CANDIDATE_REGION_DEGENERATE'
    /** An existing finish's ring has < 3 distinct vertices or no area. */
    | 'EXISTING_REGION_DEGENERATE'
    /** `intersectPolygons2D` refused (self-intersecting input / unresolved topology). */
    | 'REGION_BOOLEAN_REFUSED';

export interface FloorRegionUndetermined {
    /** The existing finish the question was about; `null` when the CANDIDATE is the problem. */
    readonly existingFloorId: string | null;
    readonly reason: FloorRegionUndeterminedReason;
    readonly detail: string;
}

/**
 * The alternative the founder asked for, in their words: *"it should not allow
 * it - but rather change the existing"*.
 *
 * It is DATA, not an action. C83 §4.3 forbids any auto-apply: the offer is
 * rendered as text and the user performs the change themselves, so the mutation
 * travels the bus as an ordinary undoable command (P6) rather than firing from a
 * notification. It is also defensible without computation — the target exists,
 * it is named, and "change its type" is a capability the product already has
 * (`UpdateFloorLayersCommand` / `floor.setMaterial`). C83 §4.2's MUST NOT —
 * *never offer a candidate you cannot defend* — is satisfied by construction
 * here, because nothing is being guessed.
 */
export interface FloorRegionOffer {
    readonly kind: 'change-existing-finish';
    readonly targetFloorId: string;
    readonly label: string;
}

export interface FloorRegionVerdict {
    /** false ⇒ the caller MUST NOT create. */
    readonly valid: boolean;
    readonly violations: readonly FloorRegionOverlapViolation[];
    /** Non-empty ⇒ some comparison could not be made. Never a pass, never a refusal. */
    readonly undetermined: readonly FloorRegionUndetermined[];
    /** Empty when nothing can be defended (C83 §4.2) — never a nearest-fit guess. */
    readonly offers: readonly FloorRegionOffer[];
}

// ─── The declared tolerance ───────────────────────────────────────────────────

/**
 * §FIN-OVERLAP-FLOOR — the DECLARED reportable-overlap floor, in m².
 *
 * This is a TOLERANCE, not a severity. C83 §1.3 forbids inferring a verdict
 * class from magnitude, and this constant does not: every overlap at or above it
 * is IMPOSSIBLE, and the class never changes with the number. What it decides is
 * whether the model can tell an overlap from two boundaries meeting.
 *
 * 0.01 m² is a 100 mm × 100 mm patch. Below it the claim is not one a user
 * authored — `intersectPolygons2D` already reads anything thinner than
 * `COINCIDENT_M` (1 mm) as no overlap at all, and this second floor covers the
 * corner case where two rings cross at a shallow angle and produce a real but
 * sub-visible triangle. A genuinely drawn overlap — the founder's case is a
 * whole room, and even a careless 10 mm lip along a 4 m edge is 0.04 m² —
 * clears it by a wide margin.
 *
 * ⚠ It is deliberately NOT a fraction of the candidate. A 0.5 m² overlap is the
 * same physical contradiction whether the finish being drawn is 2 m² or 200 m².
 */
export const MIN_REPORTABLE_FLOOR_OVERLAP_M2 = 0.01;

// ─── Geometry helpers (pure, local, no store, no window) ──────────────────────

function toRing(polygon: readonly FloorRegionVertex[]): Pt2[] | null {
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const ring: Pt2[] = [];
    for (const v of polygon) {
        if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.z)) return null;
        ring.push([v.x, v.z]);
    }
    return ring;
}

/** |signed area| of a closed ring, m². The ring is open (no repeated last vertex). */
function ringAreaM2(ring: readonly Pt2[]): number {
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(twice) / 2;
}

/**
 * Cheap disjointness. A bounding-box miss is a POSITIVE answer ("these two do
 * not overlap"), not an undetermined one — which is why it may short-circuit.
 * The 1 mm pad keeps it consistent with `COINCIDENT_M`: two boxes touching
 * exactly are not overlapping.
 */
function bboxesDisjoint(a: readonly Pt2[], b: readonly Pt2[]): boolean {
    let aX0 = Infinity, aX1 = -Infinity, aZ0 = Infinity, aZ1 = -Infinity;
    for (const p of a) {
        if (p[0] < aX0) aX0 = p[0];
        if (p[0] > aX1) aX1 = p[0];
        if (p[1] < aZ0) aZ0 = p[1];
        if (p[1] > aZ1) aZ1 = p[1];
    }
    let bX0 = Infinity, bX1 = -Infinity, bZ0 = Infinity, bZ1 = -Infinity;
    for (const p of b) {
        if (p[0] < bX0) bX0 = p[0];
        if (p[0] > bX1) bX1 = p[0];
        if (p[1] < bZ0) bZ0 = p[1];
        if (p[1] > bZ1) bZ1 = p[1];
    }
    const PAD = 0.001; // COINCIDENT_M
    return aX1 < bX0 + PAD || bX1 < aX0 + PAD || aZ1 < bZ0 + PAD || bZ1 < aZ0 + PAD;
}

/** How a finish names itself to a person. Never an empty string. */
function nameOf(id: string, label?: string, systemTypeId?: string): string {
    const human = (label ?? '').trim() || (systemTypeId ?? '').trim();
    return human.length > 0 ? `"${human}" (${id})` : id;
}

// ─── The predicate ────────────────────────────────────────────────────────────

/**
 * THE predicate. Does the proposed finish claim floor area an existing finish
 * already claims, on the same level?
 *
 * Scoping, and each exclusion is load-bearing:
 *
 *   • **level** — two finishes at the same x/z on DIFFERENT levels are the
 *     normal case for every building ever drawn. Comparing across levels would
 *     fire on every storey of a tower.
 *   • **self** — `candidate.id`, when present, is excluded, so re-checking a
 *     finish whose boundary is being edited cannot refuse it against ITSELF.
 *     This is the floor-side form of `canPlace`'s `excludeId`, and it has a
 *     silence test of its own.
 *
 * Determinism (C73): violations are sorted by overlap area DESCENDING, ties
 * broken by id ascending, so the same model always produces the same sentence.
 */
export function evaluateFloorFinishPlacement(
    candidate: CandidateFloorRegion,
    existing: readonly ExistingFloorRegion[],
): FloorRegionVerdict {
    const undetermined: FloorRegionUndetermined[] = [];

    const candRing = toRing(candidate.polygon);
    if (candRing === null) {
        return {
            valid: true,
            violations: [],
            offers: [],
            undetermined: [{
                existingFloorId: null,
                reason: 'CANDIDATE_REGION_DEGENERATE',
                detail: `the proposed boundary has ${candidate.polygon?.length ?? 0} usable vertices`,
            }],
        };
    }
    const candidateAreaM2 = ringAreaM2(candRing);
    if (!(candidateAreaM2 > 0)) {
        return {
            valid: true,
            violations: [],
            offers: [],
            undetermined: [{
                existingFloorId: null,
                reason: 'CANDIDATE_REGION_DEGENERATE',
                detail: 'the proposed boundary encloses no area',
            }],
        };
    }

    const violations: FloorRegionOverlapViolation[] = [];

    for (const e of existing) {
        if (!e || typeof e.id !== 'string') continue;
        if (candidate.id !== undefined && e.id === candidate.id) continue;
        if (e.levelId !== candidate.levelId) continue;

        const otherRing = toRing(e.polygon);
        if (otherRing === null) {
            undetermined.push({
                existingFloorId: e.id,
                reason: 'EXISTING_REGION_DEGENERATE',
                detail: `finish ${e.id} has ${e.polygon?.length ?? 0} usable vertices, so it cannot be compared`,
            });
            continue;
        }
        if (bboxesDisjoint(candRing, otherRing)) continue;

        const r = intersectPolygons2D(candRing, otherRing);
        if (r.ok !== true) {
            // C83 §5.3 — the boolean refused, so this pair is UNANSWERED. It is
            // NOT reported as clear and it is NOT reported as a violation.
            //
            // ⚠ The refused arm is read through an explicit alias rather than by
            // discriminant narrowing. This package compiles WITHOUT
            // `strictNullChecks`, under which a `readonly ok: true | false`
            // discriminant does not narrow — the identical failure is already
            // sitting on `AiPlane.ts:169` and `CommandBus.ts:430`. Relying on the
            // narrowing here would compile in this file's own vitest run and fail
            // the package typecheck, so the shape is stated instead of inferred.
            const refused = r as { readonly reason: string; readonly detail?: string };
            undetermined.push({
                existingFloorId: e.id,
                reason: 'REGION_BOOLEAN_REFUSED',
                detail: `${refused.reason}${refused.detail !== undefined ? `: ${refused.detail}` : ''}`,
            });
            continue;
        }

        let overlapAreaM2 = 0;
        for (const loop of r.loops) overlapAreaM2 += ringAreaM2(loop);
        if (overlapAreaM2 < MIN_REPORTABLE_FLOOR_OVERLAP_M2) continue;

        violations.push({
            code: 'FIN_REGION_ALREADY_FINISHED',
            existingFloorId: e.id,
            ...(e.label !== undefined ? { existingLabel: e.label } : {}),
            ...(e.systemTypeId !== undefined ? { existingSystemTypeId: e.systemTypeId } : {}),
            ...(e.hostRoomId !== undefined ? { existingHostRoomId: e.hostRoomId } : {}),
            overlapAreaM2,
            candidateAreaM2,
            overlapFraction: Math.min(1, overlapAreaM2 / candidateAreaM2),
        });
    }

    violations.sort((a, b) =>
        b.overlapAreaM2 - a.overlapAreaM2 || a.existingFloorId.localeCompare(b.existingFloorId));

    const offers: FloorRegionOffer[] = violations.map((v) => ({
        kind: 'change-existing-finish' as const,
        targetFloorId: v.existingFloorId,
        label:
            `change the finish already there — ${nameOf(v.existingFloorId, v.existingLabel, v.existingSystemTypeId)}` +
            ' — to the type you want, instead of laying a second one over it',
    }));

    return { valid: violations.length === 0, violations, undetermined, offers };
}

/**
 * §REFUSAL-IDENTITY — THE renderer. The rendered text CARRIES the code, so the
 * identity survives the trip to a DOM sink that takes only a string.
 *
 * There is deliberately no `?? '<fallback>'` anywhere below. A manufactured
 * sentence fires exactly when the producer refused AND said nothing, and then
 * reads identically to a real reason — which HIDES the under-reporting arm
 * instead of exposing it. A violation list that arrives empty is reported as
 * `FIN_UNIDENTIFIED`, which is **not** a union member precisely because "the
 * producer refused without saying why" is a different fact from any real code.
 */
export function floorRegionRefusalText(
    violations: readonly FloorRegionOverlapViolation[],
    offers: readonly FloorRegionOffer[],
): string {
    if (violations.length === 0) {
        return '[FIN_UNIDENTIFIED] the floor-region check refused this placement without ' +
            'naming a conflicting finish — that omission is the defect';
    }

    const first = violations[0]!;
    const code = first.code;

    const head = violations.length === 1
        ? `${nameOf(first.existingFloorId, first.existingLabel, first.existingSystemTypeId)}` +
          ` already covers ${first.overlapAreaM2.toFixed(3)} m² of the ${first.candidateAreaM2.toFixed(3)} m²` +
          ` you are drawing (${Math.round(first.overlapFraction * 100)} %).`
        : `${violations.length} finishes already cover part of the ${first.candidateAreaM2.toFixed(3)} m²` +
          ` you are drawing: ` +
          violations
              .map((v) => `${nameOf(v.existingFloorId, v.existingLabel, v.existingSystemTypeId)}` +
                  ` (${v.overlapAreaM2.toFixed(3)} m²)`)
              .join(', ') + '.';

    const invariant = FLOOR_REGION_DEFAULT_SENTENCE[code];

    const tail = offers.length > 0
        ? ` You can instead ${offers.map((o) => o.label).join('; or ')}.`
        : '';

    return `[${code}] ${head} — ${invariant}.${tail}`;
}
