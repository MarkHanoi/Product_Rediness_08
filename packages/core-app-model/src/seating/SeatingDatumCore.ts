/**
 * SeatingDatumCore — the CONTEXT-FREE seating-datum authority (C11 §5.4).
 *
 * §OUTDOOR112 (2026-08-26) — MOVED HERE from
 * `packages/command-registry/src/seating/SeatingDatumResolver.ts`, verbatim, so
 * that a PLACEMENT PREVIEW can stand on the SAME datum the create command will
 * commit to.
 *
 * ## Why the move, stated as the defect it closes
 *
 * The founder: *"check the placement of the lightings — some of them go off —
 * their base point might not be correct … on placement. After placement they
 * behave better."* The 3-D lighting tool previewed a fixture at the RAW RAYCAST
 * HIT (any 'slab' mesh — including the FLOOR slab for a ceiling pendant; a
 * tabletop for a floor-seated lamp), while `CreateLightingCommand` re-derived Y
 * through the seating authority. Preview and commit therefore disagreed by up
 * to a full storey, and the fixture visibly JUMPED at the click.
 *
 * The one-convention fix is that BOTH consume this module. But the authority
 * lived in `@pryzm/command-registry`, which itself imports
 * `@pryzm/geometry-lighting` (for `LightingData`) — so the lighting TOOL could
 * not import the authority without completing an import cycle. The arithmetic
 * is pure and context-free; the lowest layer that needs it is the one that owns
 * `resolveFflOffsetAt` / `resolveCflOffsetAt` already — here.
 *
 * `SeatingDatumResolver` RE-EXPORTS everything in this file, so the
 * command-registry public surface is unchanged (C84 §1.3: a projection maps the
 * master; every existing importer keeps working).
 *
 * ## The datum model (NORMATIVE — matches the geometry, not a new invention)
 *
 * - Floor finish top face (FFL):  `level.elevation + floor.boundary.baseOffset`
 * - Ceiling finished soffit (CFL): `level.elevation + ceiling.boundary.baseOffset
 *   + ceiling.boundary.height - ceiling.boundary.thickness`
 * - FLOOR, no finish covers the point → the SLAB TOP (`level.elevation`).
 * - CEILING, no ceiling covers the point → the level head
 *   (`level.elevation + level.height` — LEVEL-DERIVED, so a 5 m storey hangs
 *   its pendants at 5 m; the `defaultHeadHeightM` constant is reached ONLY when
 *   the level itself declares no height).
 * - `source` reports which datum was used, so "no finish" is never mistaken
 *   for "zero".
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { resolveFflOffsetAt, type FloorData } from '../stores/FloorTypes.js';
import { resolveCflOffsetAt, type CeilingData } from '../stores/CeilingTypes.js';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/core-app-model');
}

/** Which surface the returned datum represents. */
export type SeatingDatumSource =
    /** Top face of a floor finish covering the probe point. */
    | 'floor-finish'
    /** Structural slab top — the level datum. No finish covers the probe point. */
    | 'slab-top'
    /** Finished soffit of a ceiling covering the probe point. */
    | 'ceiling-finish'
    /** Bare structural soffit — `level.elevation + level.height`. */
    | 'level-head';

export interface SeatingDatum {
    /** World Y (metres) of the surface the element seats against. */
    readonly y: number;
    /** Offset (metres) of that surface above the LEVEL DATUM. Signed. */
    readonly offsetAboveLevel: number;
    /** Which surface `y` came from — assertable, so "no finish" ≠ "zero". */
    readonly source: SeatingDatumSource;
}

/**
 * Minimal shape this module needs from a level. Structural, not nominal, so it
 * can be consumed by layers that cannot import `BimManager`'s `Level` type.
 */
export interface SeatingLevelLike {
    readonly elevation?: number;
    readonly height?: number;
}

/**
 * The FLOOR seating datum, computed from plain data — **the single datum
 * authority** for floor-standing elements.
 *
 * Returns the finish top face when a visible floor finish covers `point`,
 * otherwise the structural slab top. `point` is required — the answer is
 * POSITION-DEPENDENT (tile in the bathroom, timber in the bedroom, unfinished
 * regions on the same level).
 */
export function resolveFloorSeatingDatumFrom(
    level: SeatingLevelLike | undefined,
    floors: readonly FloorData[] | undefined | null,
    point: { x: number; z: number },
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveFloorDatumFrom', (span) => {
        try {
            const levelElevation = level?.elevation ?? 0;
            span.setAttribute('pryzm.seating.levelElevation', levelElevation);

            const offset = floors ? resolveFflOffsetAt(floors, point) : null;

            const source: SeatingDatumSource = offset === null ? 'slab-top' : 'floor-finish';
            const off = offset === null || !Number.isFinite(offset) ? 0 : offset;
            span.setAttribute('pryzm.seating.source', source);
            span.setAttribute('pryzm.seating.offset', off);

            return { y: levelElevation + off, offsetAboveLevel: off, source };
        } finally {
            span.end();
        }
    });
}

/**
 * The CEILING seating datum, computed from plain data — **the single datum
 * authority** for ceiling-hosted elements. Mirror of
 * `resolveFloorSeatingDatumFrom`.
 *
 * @param defaultHeadHeightM used ONLY when the level carries no `height`. A
 *   LEVEL-GEOMETRY fallback, never a finish thickness.
 */
export function resolveCeilingSeatingDatumFrom(
    level: SeatingLevelLike | undefined,
    ceilings: readonly CeilingData[] | undefined | null,
    point: { x: number; z: number },
    defaultHeadHeightM = 2.7,
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveCeilingDatumFrom', (span) => {
        try {
            const levelElevation = level?.elevation ?? 0;
            const headHeight =
                typeof level?.height === 'number' && Number.isFinite(level.height)
                    ? level.height
                    : defaultHeadHeightM;
            span.setAttribute('pryzm.seating.levelElevation', levelElevation);

            const soffit = ceilings ? resolveCflOffsetAt(ceilings, point) : null;

            const useFinish = soffit !== null && Number.isFinite(soffit);
            const source: SeatingDatumSource = useFinish ? 'ceiling-finish' : 'level-head';
            const off = useFinish ? (soffit as number) : headHeight;
            span.setAttribute('pryzm.seating.source', source);
            span.setAttribute('pryzm.seating.offset', off);

            return { y: levelElevation + off, offsetAboveLevel: off, source };
        } finally {
            span.end();
        }
    });
}
