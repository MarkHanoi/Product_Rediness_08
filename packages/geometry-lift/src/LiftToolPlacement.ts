/**
 * LiftToolPlacement — the PURE (no THREE, no DOM) placement → command-input
 * mapping for the manual lift tool. §LIFT-CREATE-TOOL.
 *
 * Split out of `LiftTool.ts` so the level-span resolution and the command-input
 * builder are unit-testable in a plain node environment (the tool module itself
 * pulls in THREE + @thatopen/components and so cannot load under node/vitest).
 *
 * P8: `buildLiftCommandInput` emits one OpenTelemetry span (the new exported
 * behaviour — the placement-to-command mapping that drives one-command/one-undo).
 */

import { trace } from '@opentelemetry/api';
import { LiftKind, Vec3 } from './LiftTypes.js';

const _tracer = trace.getTracer('@pryzm/geometry-lift', '0.1.0');

/** Minimal level record the tool needs to resolve the base→top span. */
export interface LiftToolLevel {
    id: string;
    elevation: number;
}

/**
 * The create-command input shape, mirrored from
 * `CreateVerticalCirculationInput` (command-registry). Duplicated here as a
 * structural type so geometry-lift need not depend on command-registry — the
 * injected `createCommand` consumes exactly this shape.
 */
export interface LiftCommandInput {
    baseLevelId: string;
    topLevelId: string;
    kind?: LiftKind;
    origin: Vec3;
    rotation?: number;
    shaftWidth?: number;
    shaftDepth?: number;
    carCapacityPersons?: number;
    doorWidth?: number;
    typeId?: string;
    id?: string;
}

/** Default ids/kinds for a hand-placed passenger lift. */
export const DEFAULT_TYPE_ID = 'passenger-8';
export const DEFAULT_KIND: LiftKind = 'passenger';

/**
 * Resolve the base→top level span for a lift placed on `activeLevelId`.
 *
 * Mirrors how the stair tool spans adjacent levels: base = the active level, top
 * = the next level UP by elevation. A single-level project (or the topmost
 * level) yields a degenerate `base === top` span — the create command + mesh
 * builder both accept that (a one-storey cab), so the tool never dead-ends.
 *
 * Pure helper (no I/O, no THREE) — unit-testable in isolation.
 */
export function resolveLiftSpan(
    activeLevelId: string,
    levels: ReadonlyArray<LiftToolLevel>,
): { baseLevelId: string; topLevelId: string; baseElevation: number } {
    const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
    const baseIdx = sorted.findIndex((l) => l.id === activeLevelId);
    if (baseIdx === -1) {
        // Active level not in the table — degenerate single-floor span.
        return { baseLevelId: activeLevelId, topLevelId: activeLevelId, baseElevation: 0 };
    }
    const base = sorted[baseIdx];
    const above = sorted[baseIdx + 1];
    return {
        baseLevelId: base.id,
        topLevelId: above?.id ?? base.id,
        baseElevation: base.elevation,
    };
}

/**
 * Assemble the `CreateVerticalCirculationCommand` input from a placement point +
 * the active level. The single mutation-payload builder; wrapped in a P8 span
 * because it is the new exported behaviour this tool introduces (the placement →
 * command mapping that drives the one-command/one-undo create).
 *
 * @param point  placement point in world coords (shaft footprint origin).
 * @param activeLevelId  the level the shaft starts on (base level).
 * @param levels  all project levels (for base→top span resolution).
 * @param opts  optional kind / rotation / typeId / id overrides.
 */
export function buildLiftCommandInput(
    point: Vec3,
    activeLevelId: string,
    levels: ReadonlyArray<LiftToolLevel>,
    opts: {
        kind?: LiftKind;
        rotation?: number;
        typeId?: string;
        id?: string;
        shaftWidth?: number;
        shaftDepth?: number;
    } = {},
): LiftCommandInput {
    return _tracer.startActiveSpan('pryzm.lift_tool.build_command_input', (span) => {
        try {
            const { baseLevelId, topLevelId, baseElevation } = resolveLiftSpan(
                activeLevelId,
                levels,
            );
            const input: LiftCommandInput = {
                baseLevelId,
                topLevelId,
                kind: opts.kind ?? DEFAULT_KIND,
                // Origin Y anchored to the base level datum so the cab sits on the floor.
                origin: { x: point.x, y: baseElevation, z: point.z },
                rotation: opts.rotation ?? 0,
                typeId: opts.typeId ?? DEFAULT_TYPE_ID,
                ...(opts.id !== undefined ? { id: opts.id } : {}),
                ...(opts.shaftWidth !== undefined ? { shaftWidth: opts.shaftWidth } : {}),
                ...(opts.shaftDepth !== undefined ? { shaftDepth: opts.shaftDepth } : {}),
            };
            span.setAttribute('pryzm.lift.base_level', baseLevelId);
            span.setAttribute('pryzm.lift.top_level', topLevelId);
            span.setAttribute('pryzm.lift.degenerate_span', baseLevelId === topLevelId);
            span.end();
            return input;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
