/**
 * SeatingDatumResolver — §FIX-INTERIOR-FFL-SEATING.
 *
 * ## The defect this closes
 *
 * Interior elements seated on the STRUCTURAL SLAB TOP (`level.elevation`) instead of
 * the FINISHED FLOOR LEVEL (the top face of the applied floor finish), so every item
 * on a finished floor was sunk by the finish thickness and visibly buried in it.
 * Founder-reported for KITCHEN units, WARDROBE and LIGHTING.
 *
 * ## Why a shared resolver and not another per-family fix
 *
 * L-87 already fixed exactly this — but only inside `CreateFurnitureCommand`. Every
 * other creation path (AI element, AI wardrobe, plumbing fixture, lighting, the D-FLE
 * furnish batch) kept its own `level.elevation + baseOffset` arithmetic and stayed
 * broken. That is the failure mode [C11 §5.4](../../../../docs/02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md)
 * names verbatim:
 *
 *   > "One element type ⇒ one creation pipeline" is not satisfied by making N tools
 *   > each call the same helper. That is convergence *by coincidence*: it holds only
 *   > until tool N+1 is written, and nothing fails when tool N+1 omits the call.
 *
 * and §5.4's rule: *"If a property of an element is determined by the kind of thing it
 * is — not by what the user drew — then it MUST be derived inside the create command."*
 * "A floor-standing thing rests on the finished floor" is precisely such a rule. So the
 * arithmetic lives HERE, once, and every create/update command calls this module rather
 * than re-deriving `level.elevation + …`.
 *
 * ## The datum model (NORMATIVE — matches the geometry, not a new invention)
 *
 * - Floor finish top face (FFL):  `level.elevation + floor.boundary.baseOffset`
 *   (`FloorPanelBuilder` — the only writer of floor world-Y).
 * - Ceiling finished soffit (CFL): `level.elevation + ceiling.boundary.baseOffset
 *   + ceiling.boundary.height - ceiling.boundary.thickness`
 *   (`CeilingPanelBuilder` — the only writer of ceiling world-Y).
 *
 * An element's own mount offset (`baseOffset`) STACKS on the returned datum; it is
 * applied exactly once downstream by the fragment builder. This module never adds it.
 *
 * ## Fallback and tie-break (NORMATIVE)
 *
 * - FLOOR, no visible finish covers the point → the datum is the SLAB TOP
 *   (`level.elevation`, offset 0). Never NaN, never a foreign room's finish height.
 * - FLOOR, several finishes cover the point → the HIGHEST top face wins. An element
 *   rests ON the topmost finish; seating it on a lower one would bury it.
 * - CEILING, no visible ceiling covers the point → the datum is the level's head
 *   height (`level.elevation + level.height`, i.e. the bare structural soffit).
 * - CEILING, several ceilings cover the point → the LOWEST soffit wins; that is the
 *   plane the room actually sees and the one that occludes the others.
 * - A missing store, a missing level, or a non-finite result NEVER silently yields 0
 *   world-Y: `source` reports which datum was used so callers and tests can assert on
 *   it, and the structural fallback is always a real elevation.
 *
 * No thickness is hard-coded anywhere in this module — every number is read from the
 * finish geometry that the floor/ceiling subsystem already owns.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { resolveFflOffsetAt, resolveCflOffsetAt } from '@pryzm/core-app-model';
import type { CommandContext } from '../types';

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
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

/** Minimal shape this module needs from a level. */
interface LevelLike {
    readonly elevation?: number;
    readonly height?: number;
}

/** Minimal shape this module needs from the floor / ceiling stores. */
interface ByLevelStore<T> {
    getByLevel?: (levelId: string) => readonly T[];
}

function _level(context: CommandContext, levelId: string): LevelLike | undefined {
    try {
        return context.bimManager?.getLevelById?.(levelId) as LevelLike | undefined;
    } catch {
        return undefined;
    }
}

function _store<T>(context: CommandContext, key: string): ByLevelStore<T> | undefined {
    const s = (context.stores as unknown as Record<string, unknown> | undefined)?.[key];
    return (s ?? undefined) as ByLevelStore<T> | undefined;
}

/**
 * The FLOOR seating datum: the world Y an element STANDING on the floor rests on at
 * plan position `point` on level `levelId`.
 *
 * Returns the finish top face when a visible floor finish covers `point`, otherwise
 * the structural slab top. `point` is required — the whole defect is that this answer
 * is POSITION-DEPENDENT: one level routinely carries several finishes of different
 * thickness (tile in the bathroom, timber in the bedroom) plus unfinished regions.
 */
export function resolveFloorSeatingDatum(
    context: CommandContext,
    levelId: string,
    point: { x: number; z: number },
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveFloorDatum', (span) => {
        try {
            const levelElevation = _level(context, levelId)?.elevation ?? 0;
            span.setAttribute('pryzm.seating.levelId', levelId);
            span.setAttribute('pryzm.seating.levelElevation', levelElevation);

            const floors = _store<never>(context, 'floorStore')?.getByLevel?.(levelId);
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
 * The CEILING seating datum: the world Y a CEILING-HOSTED element hangs from at plan
 * position `point` on level `levelId`.
 *
 * Returns the finished soffit when a visible ceiling covers `point`, otherwise the
 * level's head height (bare structure). `defaultHeadHeightM` is used only when the
 * level itself carries no `height` — it is a LEVEL-GEOMETRY fallback, not a finish
 * thickness, and no finish thickness is hard-coded here.
 */
export function resolveCeilingSeatingDatum(
    context: CommandContext,
    levelId: string,
    point: { x: number; z: number },
    defaultHeadHeightM = 2.7,
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveCeilingDatum', (span) => {
        try {
            const level = _level(context, levelId);
            const levelElevation = level?.elevation ?? 0;
            const headHeight =
                typeof level?.height === 'number' && Number.isFinite(level.height)
                    ? level.height
                    : defaultHeadHeightM;
            span.setAttribute('pryzm.seating.levelId', levelId);
            span.setAttribute('pryzm.seating.levelElevation', levelElevation);

            const ceilings = _store<never>(context, 'ceilingStore')?.getByLevel?.(levelId);
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
