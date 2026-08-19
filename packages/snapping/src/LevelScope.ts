/**
 * §SNAP-LEVEL-SCOPE (L-1108) — THE level-scoping policy for snapping, in ONE place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Before this module, level-awareness in the snap pipeline was ACCIDENTAL. Eleven
 * of twelve providers had no notion of a storey at all; whether a Level-0 wall
 * showed up while drawing on Level 1 depended on three unrelated accidents:
 *
 *   1. whether the provider's fine test used a 3-D `distanceTo` (which happens to
 *      include the elevation gap) or `pointToLineDistance2D` (which does not);
 *   2. whether the provider's SpatialGrid broad phase used a bounded radius
 *      (`radius * 2`, capped at 1 m by `MAX_WORLD_TOLERANCE_M`) or an UNBOUNDED
 *      one — `WallJoinSnapProvider` uses `distance-to-cursor × 1.2`, so every
 *      wall in the building enters its broad phase once the drawn segment is
 *      longer than the storey height;
 *   3. whether the provider then overwrote the candidate's Y with the cursor's
 *      (`hitPoint.y = queryPoint.y`), which LAUNDERS a ground-floor reference
 *      into one that looks like it belongs to the active level.
 *
 * A storey height of 3 m and a 1 m tolerance made (1) look like a level filter.
 * It never was one. `SlabSnapProvider` (ADR-0112 / L-31) was the single provider
 * that actually read a level id, and it hard-filtered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL — three scopes, not two
 * ─────────────────────────────────────────────────────────────────────────────
 * "Level-scoped" is NOT "filter to the active level". Real BIM authoring aligns a
 * Level-1 wall to the Level-0 wall below it constantly, and a hard filter would
 * delete that. Equally, a structural GRID is a project-wide datum — grid A is grid
 * A on every storey — so filtering grids by level would be a regression, not a fix.
 * Three scopes, therefore:
 *
 *   DATUM    — project-wide BY DESIGN. Present on every level, never demoted,
 *              never suppressed. Structural grids (`GRID_LINE`,
 *              `GRID_INTERSECTION`), the uniform maths grid (`GRID`), the parcel
 *              boundary and the buildable-envelope setback line (§L-432).
 *              A parcel boundary constrains a third-floor balcony exactly as it
 *              constrains the ground floor; a setback that vanished above Level 0
 *              would make compliance-by-construction a ground-floor-only claim.
 *
 *   ACTIVE   — an element on the storey being drawn on. Full priority. Primary.
 *
 *   OTHER    — an element on a DIFFERENT storey. Offered, but SUBORDINATE: its
 *              priority is demoted by {@link OTHER_LEVEL_DEMOTION}, which is wider
 *              than the entire priority band, so it can never outrank an
 *              active-level candidate or a datum however close the cursor is. It
 *              wins only when nothing on the active level and no datum is in
 *              range — which is precisely the "align to the wall below" gesture.
 *              It is also TAGGED (`metadata.crossLevel`) so the visualiser can say
 *              so, because the defect the founder reported was not that the
 *              reference existed, it was that it won SILENTLY and unlabelled.
 *
 *   UNKNOWN  — a candidate whose provider does not yet declare a level. Treated as
 *              ACTIVE (i.e. left alone). This is deliberate: a provider that has
 *              not been taught about levels must not have its behaviour silently
 *              changed by this module. Adding `levelId` to a provider is what opts
 *              it in. See C06 §9.4 for the register of which providers declare it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY DEMOTION AND NOT A FILTER
 * ─────────────────────────────────────────────────────────────────────────────
 * A filter answers "should this reference exist?" — and the answer is yes.
 * Demotion answers the question that was actually broken: "when a Level-0 endpoint
 * and a Level-1 endpoint are both under the cursor, which one wins?" Filtering
 * would close the founder's bug by destroying a capability ADR-0112 was written to
 * create. `setCrossLevelReferences(false)` exists for callers that genuinely want
 * the hard filter (and for the test that proves the difference), but it is OFF by
 * default.
 *
 * Layer: L1/L3 — pure functions, no THREE, no DOM, no store reads.
 */

import type { SnapCandidate, SnapType } from './types';

/** The three scopes a snap candidate can occupy. */
export type SnapLevelScope = 'element' | 'datum';

/** How a candidate relates to the storey currently being drawn on. */
export type SnapLevelRelation = 'active' | 'other' | 'datum' | 'unknown';

/**
 * Priority penalty applied to an OTHER-level element candidate.
 *
 * MUST exceed the whole priority band. `DEFAULT_SNAP_PRIORITIES` tops out at 200
 * (`GRID_INTERSECTION`) and `SnapManager.rankCandidates()` adds up to +10 for
 * proximity, so the widest possible legitimate spread is 210. 1000 leaves an order
 * of magnitude of headroom: no future priority tweak can accidentally let an
 * other-level candidate outrank an active-level one, which is the entire point.
 */
export const OTHER_LEVEL_DEMOTION = 1000;

/**
 * The snap types that are PROJECT-WIDE DATUMS — see the DATUM paragraph above.
 * This is the normative list; C06 §9.2 restates it and the two must agree.
 */
const DATUM_TYPES: ReadonlySet<string> = new Set<string>([
    'grid',                 // SnapType.GRID              — uniform maths grid
    'grid_line',            // SnapType.GRID_LINE         — BIM structural datum
    'grid_intersection',    // SnapType.GRID_INTERSECTION — datum × datum
]);

/**
 * Default scope for a snap type when the provider did not declare one.
 *
 * String-compares rather than importing the enum values so this module stays free
 * of a cycle with `types.ts` (which imports THREE). The values are the enum's own
 * string literals.
 */
export function defaultLevelScopeFor(type: SnapType | string): SnapLevelScope {
    return DATUM_TYPES.has(String(type)) ? 'datum' : 'element';
}

/**
 * Classify one candidate against the active storey.
 *
 * @param candidate      the candidate under test
 * @param activeLevelId  the storey being drawn on; `null`/`undefined` when unknown
 */
export function classifyCandidateLevel(
    candidate: Pick<SnapCandidate, 'type' | 'levelId' | 'levelScope'>,
    activeLevelId: string | null | undefined,
): SnapLevelRelation {
    const scope = candidate.levelScope ?? defaultLevelScopeFor(candidate.type);
    if (scope === 'datum') return 'datum';

    // No declared level on the candidate, or no known active level → we cannot
    // tell, and MUST NOT guess. Guessing from elevation was the original sin here:
    // a column TOP at y=3.0 on Level 0 is not a Level-1 reference.
    if (candidate.levelId == null || activeLevelId == null) return 'unknown';

    return candidate.levelId === activeLevelId ? 'active' : 'other';
}
