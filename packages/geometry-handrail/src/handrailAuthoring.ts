/**
 * handrailAuthoring — THE ONE surface-independent answer to the three questions a
 * handrail-authoring gesture asks: **which MODE**, **which TYPE**, **which SLAB**.
 *
 * ─── WHY IT LIVES IN `@pryzm/geometry-handrail` AND NOT IN `apps/editor` ─────
 *
 * It used to be `apps/editor/src/engine/views/plantools/activeHandrailAuthoring.ts`.
 * That address made it unreadable from the ONE place that needed it most: the 3-D
 * `HandrailTool` lives in this package, and an L2 geometry package cannot import
 * an L7 app. So the 3-D tool could not read the armed MODE, and L-1106 followed
 * mechanically — the bar offered seven modes in 3-D and the pipeline implemented
 * one, because the answer was filed somewhere the 3-D surface could not reach.
 *
 * ⭐ THIS IS `stair-path`'s SHAPE, WHICH C95 §15.13 NAMES AS THE REFERENCE.
 * `getStairToolConfig()` lives in `@pryzm/geometry-stair` — the geometry package —
 * precisely so `StairPathPlanToolHandler` (plan) and `StairPath3DToolHandler` (3-D)
 * read ONE config. Handrail now does the same. The move is not tidying: a config
 * store one of your two surfaces cannot import is a config store you have two of.
 *
 * ⛔ THERE IS NO COMPATIBILITY RE-EXPORT AT THE OLD PATH. C84 §3.5 / this
 * package's own index header: a family that leaves a second address for its
 * authority acquires a second authority. Importers were repointed.
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION: every surface re-reads it on every
 * click, so switching mode mid-run applies to the very next segment and the
 * vertices already placed survive (`DrawingModeBar`'s whole reason to exist).
 *
 * CONTRACTS: C95 §15.13 (L-1106) · C84 EI-3 / EI-9 · L-98 (a picker instance is
 * not a store).
 */

import { trace } from '@opentelemetry/api';
import type { HandrailRunMode } from './handrailRunGenerators';

const _tracer = trace.getTracer('@pryzm/geometry-handrail.authoring', '0.1.0');

/**
 * The modes handrail offers, as ids. Declared ONCE as `HandrailRunMode` beside the
 * generators that implement them, so the bar and the generators cannot offer
 * different sets (the `STAIR_SHAPES` lesson, §FIX-STAIR-SHAPE-DESYNC).
 */
export type HandrailDrawMode = HandrailRunMode;

const VALID: readonly string[] = [
    'linear', 'ortho', 'curved', 'byslab', 'square', 'circular', 'ellipse',
];

export function isHandrailDrawMode(m: unknown): m is HandrailDrawMode {
    return typeof m === 'string' && VALID.includes(m);
}

/**
 * LINEAR is the default — the freeform two-click line the railing tool has always
 * drawn. A user who never opens the bar gets exactly the previous gesture rather
 * than silently acquiring a constraint they did not choose.
 */
let _mode: HandrailDrawMode = 'linear';
let _typeId: string | undefined;

/** Record the selected handrail drawing mode (from ANY picker instance). */
export function setActiveHandrailDrawMode(mode: unknown): void {
    _tracer.startActiveSpan('pryzm.handrail.set_active_draw_mode', (span) => {
        try {
            const applied = isHandrailDrawMode(mode);
            if (applied) _mode = mode;
            span.setAttribute('pryzm.handrail.draw_mode', _mode);
            span.setAttribute('pryzm.handrail.applied', applied);
        } finally {
            span.end();
        }
    });
}

/** Resolve the active handrail drawing mode. Read fresh on every interaction. */
export function resolveActiveHandrailDrawMode(): HandrailDrawMode {
    return _tracer.startActiveSpan('pryzm.handrail.resolve_active_draw_mode', (span) => {
        try {
            span.setAttribute('pryzm.handrail.draw_mode', _mode);
            return _mode;
        } finally {
            span.end();
        }
    });
}

/**
 * Record the ARMED handrail type id (undefined ⇒ the tool's own defaults).
 *
 * ⛔ IT NO LONGER MIRRORS INTO `window.handrailTool.setTypeId`, AND THAT DELETION
 * IS THE POINT. The mirror existed because `HandrailTool` held its OWN
 * `_selectedTypeId` field, so a type armed here was invisible in 3-D unless it was
 * written twice. `HandrailTool` now reads {@link resolveActiveHandrailTypeId}, so
 * the second write has nothing left to keep in sync — and `HandrailTool.setTypeId`
 * forwards HERE, which is why keeping the mirror would now be an infinite
 * recursion as well as a duplicate authority (C84 EI-9).
 */
export function setActiveHandrailTypeId(id: string | undefined): void {
    _tracer.startActiveSpan('pryzm.handrail.set_active_type', (span) => {
        try {
            _typeId = id || undefined;
            span.setAttribute('pryzm.handrail.type_id', _typeId ?? 'default');
        } finally {
            span.end();
        }
    });
}

/** Resolve the armed handrail type id, surface-independently. */
export function resolveActiveHandrailTypeId(): string | undefined {
    return _tracer.startActiveSpan('pryzm.handrail.resolve_active_type', (span) => {
        try {
            span.setAttribute('pryzm.handrail.type_id', _typeId ?? 'default');
            return _typeId;
        } finally {
            span.end();
        }
    });
}

/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — THE SLAB THE USER HAD SELECTED **BEFORE** THE
 * TOOL WAS ACTIVATED.
 *
 * ⛔ THIS EXISTS BECAUSE THE LIVE SELECTION IS ALREADY GONE BY THE TIME BY SLAB
 * RUNS. `ToolManager.activateTool()` calls `selectionManager.setEnabled(false)`
 * for EVERY tool (`packages/input-host/src/ToolManager.ts:550`), which clears
 * `selectedObject`. The railing's By Slab read the live selection at CLICK time,
 * i.e. strictly after that clear, so its guard could never be satisfied — not
 * "usually failed", *never succeeded*, for any user, in any order of operations.
 * The wall has carried the snapshot cure since it was written
 * (`ToolsAreaLayout._bySlabCapture`); the railing mirrored the FEATURE without
 * mirroring the MECHANISM, which is how a By Slab that reads correct in review
 * refuses 100% of the time in the editor.
 *
 * It lives HERE, beside mode and type, rather than as another local in
 * `ToolsAreaLayout`, because the same three questions are asked by the plan
 * handler, the 3-D tool and the RAC path, and a local in one panel is invisible
 * to the other two — the L-98 lesson this whole module records.
 */
let _pendingBySlabId: string | undefined;

/**
 * Snapshot the selected SLAB id, if the current selection is a slab.
 *
 * Pass the `selectedObject` itself; the element-type test is done here so every
 * caller applies the same one. `elementType` is compared case-insensitively:
 * `SlabFragmentBuilder` writes `'Slab'` and callers historically compared against
 * `'slab'` (C15 §12) — a mismatch that silently makes every slab "not a slab".
 */
export function captureHandrailBySlabSelection(
    sel: { userData?: { id?: string; elementType?: string } } | null | undefined,
): void {
    const elType = sel?.userData?.elementType?.toLowerCase();
    _pendingBySlabId = elType === 'slab' ? sel?.userData?.id : undefined;
}

/** Record a slab id chosen explicitly (the pick-a-slab flow, or RAC). */
export function setHandrailBySlabTarget(slabId: string | undefined): void {
    _pendingBySlabId = slabId || undefined;
}

/** The shape a live selection has to have for the By-Slab fallback to read it. */
interface SelectionManagerLike {
    selectedObject?: { userData?: { id?: string; elementType?: string } };
}

/**
 * The slab By Slab should guard: the pre-activation snapshot, else the LIVE
 * selection if one somehow survives (a surface that never disabled selection).
 * Never assumes; returns `undefined` so the caller can offer the pick flow.
 *
 * ⚠ `globalThis`, not `window` — this module is now imported by a NODE-environment
 * vitest suite as well as by the browser, and `window` is a ReferenceError there
 * while `globalThis.selectionManager` is simply `undefined`. Same answer in the
 * browser (`window === globalThis`), no crash in the harness.
 */
export function resolveHandrailBySlabTarget(): string | undefined {
    if (_pendingBySlabId) return _pendingBySlabId;
    const sel = (globalThis as { selectionManager?: SelectionManagerLike })
        .selectionManager?.selectedObject;
    const elType = sel?.userData?.elementType?.toLowerCase();
    return elType === 'slab' ? sel?.userData?.id : undefined;
}

/** Test seam — one spec must not leak its mode/type into the next. */
export function __resetActiveHandrailAuthoringForTests(): void {
    _mode = 'linear';
    _typeId = undefined;
    _pendingBySlabId = undefined;
}
