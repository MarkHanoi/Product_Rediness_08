/**
 * FloorToolConfigStore — §FIX-FLOOR-FINISH-CREATION-PARITY (L-255).
 *
 * THE SINGLE SOURCE OF TRUTH for the floor-finish configuration the architect chose
 * (the finish SYSTEM TYPE, the assembly THICKNESS, and the BASE OFFSET — the FFL height
 * above the level datum), resolved ONCE, BELOW the tools. It is the floor's counterpart
 * to `StairToolConfigStore` (L-243), `DoorToolConfigStore` (L-260 A) and
 * `WindowToolConfigStore` (L-266), and it is the same cure for the same disease.
 *
 * ── The disease this cures (C11 §3 — parity BY CONSTRUCTION) ──────────────────
 *
 * "ONE ELEMENT, TWO CREATION PATHS, AND THE PLAN PATH SILENTLY DROPS WHAT THE 3D PATH
 * RESOLVES." Diagnosed EIGHT times on this codebase: L-239 (wall layers), L-240 (floor
 * finish inner face — the SAME element), L-243 (stair config), L-246 (plan cut), L-251
 * (mitre), L-255 (this), L-260 A (door), L-266 (window).
 *
 * The founder: *"Floor finish creation in PLAN VIEW (auto) doesn't bring the UI modal
 * that is required and IS WORKING on 3D VIEW — which provides the ELEVATION LEVEL of the
 * floor finish."*
 *
 * The MODAL was the symptom. The RECORD was the defect, and it was worse than reported —
 * the two paths disagreed on THREE fields, not one:
 *
 *   • 3D  (`FloorTool` → legacy `CreateFloorCommand`) resolved
 *       `{ systemTypeId, layers, thickness, baseOffset }`
 *     from its own `_pending*` instance fields, seeded by
 *     `DEFAULT_FLOOR_FINISH_{THICKNESS,BASE_OFFSET}_M` and confirmed in the creation modal.
 *   • PLAN (`FloorPlanToolHandler` → bus `floor.create`) sent
 *       `{ floorId, ifcGuid, polygon, levelId, hostRoomId? }`
 *     and NOTHING ELSE. No modal, no type, no layers, no thickness, no base offset — even
 *     though the plan user had ALREADY picked a finish in the FloorModePicker dropdown
 *     (which writes `window.floorTool.setSystemTypeId()`, a 3D-tool instance field the plan
 *     handler never read).
 *
 * The dropped fields were then re-invented by THREE different downstream defaults:
 *     `resolveFinishSeating`  → thickness 0.015 / baseOffset 0.015  (the plugin FloorStore)
 *     the initTools bus→legacy mirror → thickness **0.075** / baseOffset **0**  (the store
 *     the mesh builder actually reads)
 *     the 3D tool             → thickness 0.015 / baseOffset 0.075
 * so a plan-drawn finish was MESHED 75 mm thick sitting ON the level datum, while the "same"
 * 3D-drawn finish was 15 mm thick sitting 75 mm above it. The record never reached the
 * renderer intact because the record was never complete.
 *
 * ── The cure ──────────────────────────────────────────────────────────────────
 *
 * NOT "teach the plan tool to imitate the 3D tool" — that leaves two paths to keep in step
 * BY HAND, and they never are. Instead:
 *
 *   WRITERS  — the FloorModePicker finish dropdown, the pre-draw property panel,
 *              `BimService.activateFloorTool()`, and BOTH creation modals — write HERE.
 *   READERS  — the 3D `FloorTool`, the plan `FloorPlanToolHandler` (via the injected
 *              `PlanToolDrawContext.floorConfig`, falling back to `getFloorToolConfig()`),
 *              batch generators and the AI — read the SAME resolved config and pass it
 *              through the SAME `resolveFloorFinish()` resolver.
 *
 * Both paths therefore commit a COMPLETE record — `{ systemTypeId, layers, thickness,
 * baseOffset }` — so no downstream default ever fires, and the two paths are identical BY
 * CONSTRUCTION rather than by convention.
 *
 * ── Why this lives in core-app-model, not geometry-slab ───────────────────────
 *
 * The seating rule is a property of the ELEMENT TYPE, not of a tool. Its neighbours are
 * already here: `FloorTypes.resolveFinishSeating()` (the command-side seating), the
 * `floorSystemTypeStore` catalogue, and `DEFAULT_FINISH_THICKNESS_M`. Placing it here means
 * the 3D tool (`@pryzm/geometry-slab`, which imports core-app-model), the plan handler
 * (`apps/editor`) and the command layer all reach ONE module with ZERO new package edges
 * and no THREE/DOM in the dependency path — the resolver stays importable in a pure node test.
 *
 * Pure: no DOM, no THREE, no I/O. P8 — the exported resolver and the exported writer each
 * emit one span.
 */

import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import type { FloorLayer } from './FloorTypes.js';
import { DEFAULT_FINISH_THICKNESS_M } from './FloorTypes.js';
import { floorSystemTypeStore } from './FloorSystemTypeStore.js';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/core-app-model', '0.1.0');
    return _cachedTracer;
}

/**
 * Default Finished-Floor-Level (FFL) offset above the level datum (metres).
 *
 * 75 mm — the typical screed / services build-up between the structural slab top and the
 * walking surface. `FFL = level.elevation + baseOffset` (the value `resolveFflOffset`
 * reads — L-87).
 *
 * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255): this constant used to live in
 * `@pryzm/geometry-slab/floor/floorFinishDefaults` — a package the plan handler cannot
 * reach without pulling THREE — which is precisely why the plan path had no default to
 * inherit and silently fell through to a DIFFERENT one. A default that lives in two places
 * is two defaults. It lives HERE now; geometry-slab re-exports it.
 */
export const DEFAULT_FLOOR_FINISH_BASE_OFFSET_M = 0.075;

/**
 * Default applied-finish assembly thickness (metres). 15 mm — a realistic tile / engineered-
 * timber finish layer, INDEPENDENT of the FFL build-up height (§FIX-FLOOR-FINISH-DEFAULT-
 * THICKNESS, L-14). Aliases `DEFAULT_FINISH_THICKNESS_M`, the value the command-side
 * `resolveFinishSeating()` already uses, so the interactive tools and the command path
 * cannot drift.
 */
export const DEFAULT_FLOOR_FINISH_THICKNESS_M = DEFAULT_FINISH_THICKNESS_M;

/**
 * The architect's floor-finish choice.
 *
 * Every field is OPTIONAL because "not chosen" is a real state that must be distinguishable
 * from "chosen to be X": an unset `thicknessM` resolves from the finish TYPE, whereas a set
 * one is the user's explicit override and outranks the type. `resolveFloorFinish()` is the
 * one place that collapses this into concrete numbers.
 */
export interface FloorToolConfig {
    /**
     * The chosen `FloorSystemType.id`, or `undefined` for a plain (unlayered) finish —
     * the modal's "— Plain Floor —" option. Unlike the door/window stores, `undefined` is a
     * LEGITIMATE choice here (a bare screed finish has no assembly), so it is preserved.
     */
    readonly systemTypeId?: string;
    /** Explicit assembly thickness (m) typed by the architect. Unset → resolve from the type. */
    readonly thicknessM?: number;
    /** Explicit FFL base offset (m) typed by the architect. Unset → the documented default. */
    readonly baseOffsetM?: number;
}

/**
 * The canonical starting point: nothing explicitly chosen, so every value resolves from the
 * type or the documented default. Deliberately EMPTY rather than pre-seeded with numbers —
 * pre-seeding is how a "default" silently becomes an unremovable override.
 */
export const DEFAULT_FLOOR_TOOL_CONFIG: FloorToolConfig = Object.freeze({});

/** The concrete floor-finish record every creation path commits. Nothing is optional. */
export interface ResolvedFloorFinish {
    /** `undefined` ⇒ plain floor (no assembly). Carried verbatim into the record. */
    readonly systemTypeId?: string;
    /** Metres. Always finite and > 0. */
    readonly thicknessM: number;
    /** Metres. Always finite and >= 0. This is the ELEVATION the founder's modal asks for. */
    readonly baseOffsetM: number;
    /** Immutable snapshot of the chosen type's layers — `undefined` for a plain floor. */
    readonly layers?: FloorLayer[];
}

/** Minimal read surface of the floor system-type catalogue (injectable for tests). */
export interface FloorSystemTypeLookup {
    getById(id: string): { totalThickness?: number; layers?: FloorLayer[] } | undefined;
}

let _current: FloorToolConfig = DEFAULT_FLOOR_TOOL_CONFIG;

/**
 * Read the architect's current floor-finish choice.
 *
 * Plan tools should prefer the DI'd `PlanToolDrawContext.floorConfig`; this direct read is
 * the fallback for a handler constructed without a context, and for the 3D tool. Never a
 * `window.*` read (P4).
 */
export function getFloorToolConfig(): FloorToolConfig {
    return _current;
}

/**
 * Merge a partial choice into the resolved config. Called by EVERY writer.
 *
 * `undefined` patch values are IGNORED, never an erase — this is load-bearing and is exactly
 * the trap L-260 A fell into: `activateFloorTool()` is routinely called with no system type,
 * and letting that wipe the architect's chosen finish on ONE path only is how the two paths
 * drifted apart. To deliberately clear the finish type (the modal's "— Plain Floor —"), pass
 * the empty string `''`.
 */
export function setFloorToolConfig(patch: {
    systemTypeId?: string;
    thicknessM?: number;
    baseOffsetM?: number;
}): FloorToolConfig {
    return _tracer().startActiveSpan('pryzm.floor.setToolConfig', (span) => {
        try {
            const nextType =
                patch.systemTypeId === undefined
                    ? _current.systemTypeId              // not stated → keep
                    : patch.systemTypeId === ''
                        ? undefined                      // explicitly plain
                        : patch.systemTypeId;

            _current = Object.freeze({
                systemTypeId: nextType,
                thicknessM:
                    Number.isFinite(patch.thicknessM) && (patch.thicknessM as number) > 0
                        ? patch.thicknessM
                        : _current.thicknessM,
                baseOffsetM:
                    Number.isFinite(patch.baseOffsetM) && (patch.baseOffsetM as number) >= 0
                        ? patch.baseOffsetM
                        : _current.baseOffsetM,
            });

            span.setAttribute('pryzm.floor.systemTypeId', _current.systemTypeId ?? '');
            span.setAttribute('pryzm.floor.thicknessM', _current.thicknessM ?? -1);
            span.setAttribute('pryzm.floor.baseOffsetM', _current.baseOffsetM ?? -1);
            span.setStatus({ code: SpanStatusCode.OK });
            return _current;
        } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
        } finally {
            span.end();
        }
    });
}

/** Restore the canonical (nothing-chosen) config. Test-support + project-close. */
export function resetFloorToolConfig(): FloorToolConfig {
    _current = DEFAULT_FLOOR_TOOL_CONFIG;
    return _current;
}

/**
 * THE FLOOR-FINISH RESOLVER — the one function that answers "what floor finish does this
 * creation gesture produce?". Both the 3D tool and the plan handler call it and NOTHING else.
 *
 * RESOLUTION ORDER (the same shape as `resolveWindowDimensions` / `resolveDoorDimensions`):
 *   1. the RECORD / the architect's explicit value — the instance is the strongest authority,
 *   2. the selected `FloorSystemType` — the type's standard (`totalThickness`, `layers`),
 *   3. the documented default — `DEFAULT_FLOOR_FINISH_{THICKNESS,BASE_OFFSET}_M`.
 *
 * The base offset has no per-type value in the catalogue today (a `FloorSystemType` describes
 * the ASSEMBLY, not where it is seated), so it resolves 1 → 3. When the catalogue grows an
 * FFL rule, it belongs in step 2 of THIS function and both paths inherit it for free — which
 * is the entire point of having one resolver.
 *
 * P8: emits `pryzm.floor.resolveFinish`.
 */
export function resolveFloorFinish(
    config: FloorToolConfig = getFloorToolConfig(),
    lookup: FloorSystemTypeLookup = floorSystemTypeStore,
): ResolvedFloorFinish {
    return _tracer().startActiveSpan('pryzm.floor.resolveFinish', (span) => {
        try {
            const sysType = config.systemTypeId
                ? lookup.getById(config.systemTypeId)
                : undefined;

            // 1 → 2 → 3. `structuredClone` so the element owns an IMMUTABLE snapshot:
            // a later edit of the TYPE must not retroactively rewrite placed floors.
            const layers =
                sysType?.layers && sysType.layers.length > 0
                    ? (structuredClone(sysType.layers) as FloorLayer[])
                    : undefined;

            const typeThickness =
                Number.isFinite(sysType?.totalThickness) && (sysType?.totalThickness as number) > 0
                    ? (sysType?.totalThickness as number)
                    : undefined;

            const thicknessM =
                Number.isFinite(config.thicknessM) && (config.thicknessM as number) > 0
                    ? (config.thicknessM as number)
                    : typeThickness ?? DEFAULT_FLOOR_FINISH_THICKNESS_M;

            const baseOffsetM =
                Number.isFinite(config.baseOffsetM) && (config.baseOffsetM as number) >= 0
                    ? (config.baseOffsetM as number)
                    : DEFAULT_FLOOR_FINISH_BASE_OFFSET_M;

            const resolved: ResolvedFloorFinish = {
                systemTypeId: config.systemTypeId,
                thicknessM,
                baseOffsetM,
                layers,
            };

            span.setAttribute('pryzm.floor.systemTypeId', resolved.systemTypeId ?? '');
            span.setAttribute('pryzm.floor.thicknessM', resolved.thicknessM);
            span.setAttribute('pryzm.floor.baseOffsetM', resolved.baseOffsetM);
            span.setAttribute('pryzm.floor.layerCount', resolved.layers?.length ?? 0);
            span.setStatus({ code: SpanStatusCode.OK });
            return resolved;
        } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
        } finally {
            span.end();
        }
    });
}
