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
    type FloorData,
    type CeilingData,
    // §OUTDOOR112 (2026-08-26) — the CONTEXT-FREE core MOVED to
    // `@pryzm/core-app-model/seating` so the lighting placement TOOL can preview
    // on the same datum this module's commands commit to (command-registry
    // imports geometry-lighting, so the tool could not import from here without
    // completing an import cycle). Re-exported below VERBATIM — this module's
    // public surface is unchanged (C84 §1.3), and the `CommandContext` adapters
    // stay here, where the context type lives.
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
    type SeatingDatum,
    type SeatingDatumSource,
    type SeatingLevelLike,
} from '@pryzm/core-app-model';
import type { CommandContext } from '../types';

export {
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
};
export type { SeatingDatum, SeatingDatumSource, SeatingLevelLike };

function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
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

// ── The datum authority (CONTEXT-FREE core) — MOVED, not gone ─────────────────
//
// §FIX-SEATING-ONE-AUTHORITY / §OUTDOOR112. The `CommandContext` entry points
// below are ADAPTERS; the arithmetic lives ONCE, context-free, in
// `@pryzm/core-app-model/seating` (SeatingDatumCore.ts) and is re-exported above
// verbatim. It moved down a layer because the lighting placement TOOL must
// preview on the same datum these commands commit to, and this package imports
// `@pryzm/geometry-lighting` — the tool importing from here would have completed
// an import cycle. Every prior importer of this module is unchanged.

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
