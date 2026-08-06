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
import {
    resolveFflOffsetAt,
    resolveCflOffsetAt,
    type FloorData,
    type CeilingData,
} from '@pryzm/core-app-model';
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

/**
 * Minimal shape this module needs from a level.
 *
 * Structural, not nominal, so the CONTEXT-FREE entry points below can be called from
 * a layer that cannot import `BimManager`'s `Level` type (see the note on
 * `resolveFloorSeatingDatumFrom`).
 */
export interface SeatingLevelLike {
    readonly elevation?: number;
    readonly height?: number;
}

type LevelLike = SeatingLevelLike;

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

// ── The datum authority (CONTEXT-FREE core) ────────────────────────────────────
//
// §FIX-SEATING-ONE-AUTHORITY. The `CommandContext` entry points below are ADAPTERS.
// The arithmetic lives here, once, in a form that takes plain data — because not
// every caller that must seat an element holds a `CommandContext`.
//
// Concretely: the LIVE plan-tool / carousel / kitchen / wardrobe / D-FLE furnish
// path does NOT run `CreateFurnitureCommand`. It dispatches `furniture.create` on
// the bus and a bridge in `apps/editor/src/engine/initTools.ts` mirrors the result
// into the legacy `FurnitureStore`. That bridge had its own `level.elevation`
// arithmetic and so re-broke exactly the founder-reported kitchen/wardrobe/lighting
// defect the resolver was written to close. Handing that bridge a *second copy* of
// the rule would be C11 §5.4's "convergence by coincidence" all over again; giving
// it a context-shaped API it cannot satisfy would leave it broken. So the rule is
// expressed once, context-free, and every layer adapts INTO it.

/**
 * The FLOOR seating datum, computed from plain data — **the single datum authority**.
 *
 * Returns the finish top face when a visible floor finish covers `point`, otherwise
 * the structural slab top. `point` is required — the whole defect is that this answer
 * is POSITION-DEPENDENT: one level routinely carries several finishes of different
 * thickness (tile in the bathroom, timber in the bedroom) plus unfinished regions.
 *
 * @param level  the level the element sits on. `undefined` → elevation 0.
 * @param floors the floor finishes on that level (`floorStore.getByLevel(levelId)`).
 * @param point  XZ plan position of the element.
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
 * The CEILING seating datum, computed from plain data — **the single datum authority**
 * for ceiling-hosted elements. Mirror of `resolveFloorSeatingDatumFrom`.
 *
 * @param level    the level the element hangs in. `undefined` → elevation 0.
 * @param ceilings the ceilings on that level (`ceilingStore.getByLevel(levelId)`).
 * @param point    XZ plan position of the element.
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

// ── CommandContext adapters ────────────────────────────────────────────────────

/**
 * The FLOOR seating datum for a command holding a `CommandContext`.
 *
 * Thin adapter: pulls the level and the level's floor finishes out of the context
 * and delegates to `resolveFloorSeatingDatumFrom`. Carries NO arithmetic of its own.
 */
export function resolveFloorSeatingDatum(
    context: CommandContext,
    levelId: string,
    point: { x: number; z: number },
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveFloorDatum', (span) => {
        try {
            span.setAttribute('pryzm.seating.levelId', levelId);
            const level = _level(context, levelId);
            const floors = _store<FloorData>(context, 'floorStore')?.getByLevel?.(levelId);
            const datum = resolveFloorSeatingDatumFrom(level, floors, point);
            span.setAttribute('pryzm.seating.source', datum.source);
            span.setAttribute('pryzm.seating.offset', datum.offsetAboveLevel);
            return datum;
        } finally {
            span.end();
        }
    });
}

/**
 * The CEILING seating datum for a command holding a `CommandContext`.
 *
 * Thin adapter: pulls the level and the level's ceilings out of the context and
 * delegates to `resolveCeilingSeatingDatumFrom`. Carries NO arithmetic of its own.
 */
export function resolveCeilingSeatingDatum(
    context: CommandContext,
    levelId: string,
    point: { x: number; z: number },
    defaultHeadHeightM = 2.7,
): SeatingDatum {
    return _tracer().startActiveSpan('pryzm.seating.resolveCeilingDatum', (span) => {
        try {
            span.setAttribute('pryzm.seating.levelId', levelId);
            const level = _level(context, levelId);
            const ceilings = _store<CeilingData>(context, 'ceilingStore')?.getByLevel?.(levelId);
            const datum = resolveCeilingSeatingDatumFrom(level, ceilings, point, defaultHeadHeightM);
            span.setAttribute('pryzm.seating.source', datum.source);
            span.setAttribute('pryzm.seating.offset', datum.offsetAboveLevel);
            return datum;
        } finally {
            span.end();
        }
    });
}
