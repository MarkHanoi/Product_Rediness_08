/**
 * activeSlabFamilyMode — §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956).
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for WHICH SLAB GESTURE the
 * user selected — 2-Point / Polyline / By Region / Hollow / Pick Walls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO ORTHOGONAL AXES SHARED ONE WORD, AND THAT IS THE WHOLE BUG (C84 §4B / EI-3)
 * ─────────────────────────────────────────────────────────────────────────────
 * `SlabPlanToolHandler` carries two independent concepts both called "mode":
 *
 *   • FAMILY     — which gesture:    2point | polyline | region | hollow | pickWalls
 *   • CONSTRAINT — how a click lands: linear | ortho | curved   (`activeSlabDrawMode`)
 *
 * The CONSTRAINT axis got a surface-independent store in §FEAT-SLAB-DRAW-MODES.
 * The FAMILY axis never did: the plan handler read it off the 3D tool INSTANCE
 * (`window.slabTool.toolMode`) and mapped anything it did not recognise — including
 * `'NONE'` and `undefined` — to `'polyline'`.
 *
 * `'NONE'` is not an exotic state. `ToolManager` registers the slab's deactivation as
 * `deactivate: () => slabTool.exitSketchMode()` (`ToolManager.ts:153`), and
 * `deactivateAllInternal()` (`:1110-1120`) runs it at the head of EVERY `activateTool`
 * call. `SlabTool.exitSketchMode()` sets `activeTool = 'NONE'` — and, unlike
 * `exitRegionMode()`, does NOT remove `#sketch-hud`. So the HUD goes on prompting
 * *"By Region Slab: Click an enclosed region"* while the plan handler has silently
 * become a polyline tool. That is exactly the founder's L-956 report: the log reads
 * `[SlabTool] … tool=REGION_SLAB` in one line and `[SlabPlanToolHandler] vertex
 * (mode=linear)` in the next, and the click lays a polyline vertex instead of
 * creating the garden slab.
 *
 * The same defect was already diagnosed, cured and written up for ROOF as L-699
 * (`activeRoofDrawMode.ts`), whose header states the rule this file obeys:
 *
 * ⚠ THE CURE IS "MODE IS AN ACTIVATION ARGUMENT", NOT "READ THE OTHER SURFACE'S
 * TOOL". Both surfaces read the value recorded HERE at activation, so neither can be
 * authoritative over the other and neither can silently narrow it.
 *
 * The 3D `SlabTool` needs no change: it is the tool whose own `activeTool` field was
 * always right. What changes is that the PLAN surface stops reading its transient
 * private state across a surface boundary.
 */

import { trace } from '@opentelemetry/api';

/**
 * The slab GESTURE vocabulary, spelled exactly as `elementCreationMatrix.ts` declares
 * it and as `BimService.activateSlabTool` / `ToolManager.activateSlab` accept it. One
 * vocabulary, so a mode cannot be lost in translation between layers.
 */
// §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19) — 'circular' and 'elliptical'
// are GESTURES, exactly as '2point' is: one drag produces one whole boundary.
// They belong on THIS axis and never on `BoundaryDrawMode` (C92 SL-Voc-3).
export type SlabFamilyMode =
    | '2point' | 'polyline' | 'region' | 'hollow' | 'pickWalls'
    | 'circular' | 'elliptical';

const SLAB_FAMILY_MODES: readonly SlabFamilyMode[] = [
    '2point', 'polyline', 'region', 'hollow', 'pickWalls',
    'circular', 'elliptical',
];

const _slabFamilyModeTracer = trace.getTracer('@pryzm/editor.active-slab-family-mode', '0.1.0');

/**
 * `polyline` is the historic default — it is precisely what `_getMode()`'s final
 * `return 'polyline'` gave a user who had never activated the 3D tool, so a user who
 * never picks a gesture sees no change at all.
 */
let _activeSlabFamilyMode: SlabFamilyMode = 'polyline';

export function isSlabFamilyMode(v: unknown): v is SlabFamilyMode {
    return typeof v === 'string' && (SLAB_FAMILY_MODES as readonly string[]).includes(v);
}

/**
 * Normalise any value `activateSlabTool` / `activateSlab` accepts onto the FAMILY
 * axis, or `null` if it names no gesture.
 *
 * `linear` / `ortho` / `curved` are CONSTRAINTS on the polyline gesture, not gestures
 * of their own — they all mean "polyline". `sketch` is `ToolManager.activateSlab`'s
 * own spelling of `2point`. Collapsing both here is the point: it is the ONE place
 * the two vocabularies meet, so no caller has to remember which axis it is holding.
 */
export function toSlabFamilyMode(v: unknown): SlabFamilyMode | null {
    if (isSlabFamilyMode(v)) return v;
    if (v === 'linear' || v === 'ortho' || v === 'curved') return 'polyline';
    if (v === 'sketch') return '2point';
    return null;
}

/**
 * Record the slab gesture at activation. Called from the ONE editor-side chokepoint
 * (`BimService.activateSlabTool`) through which every UI entry point passes — the
 * Create panel, the Create rail, the persistent slab mode bar, and the bottom
 * action menu (`ToolsAreaLayout` wraps this method and its `onSelect` calls the
 * bound original, so both halves of that wrapper land here).
 *
 * A value naming no gesture is IGNORED, keeping the last real one, so a caller that
 * passes only a constraint cannot erase the user's chosen gesture.
 *
 * P8: emits `pryzm.slab.set_active_family_mode`.
 */
export function setActiveSlabFamilyMode(mode: unknown): void {
    _slabFamilyModeTracer.startActiveSpan('pryzm.slab.set_active_family_mode', (span) => {
        try {
            const resolved = toSlabFamilyMode(mode);
            if (resolved) _activeSlabFamilyMode = resolved;
            span.setAttribute('pryzm.slab.family_mode', _activeSlabFamilyMode);
            span.setAttribute('pryzm.slab.applied', resolved !== null);
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve the active slab gesture. Read fresh by every surface on every interaction,
 * so the plan overlay and the 3D tool can never disagree about which gesture is
 * running.
 *
 * P8: emits `pryzm.slab.resolve_active_family_mode`.
 */
export function resolveActiveSlabFamilyMode(): SlabFamilyMode {
    return _slabFamilyModeTracer.startActiveSpan('pryzm.slab.resolve_active_family_mode', (span) => {
        try {
            span.setAttribute('pryzm.slab.family_mode', _activeSlabFamilyMode);
            return _activeSlabFamilyMode;
        } finally {
            span.end();
        }
    });
}

/**
 * The argument that re-enters the slab tool "in the mode last chosen".
 *
 * `BottomActionMenu` promised exactly that in a comment — *"Activate straight away in
 * the mode last chosen — every mode, including 2-Point / By Region / Hollow / Pick
 * Walls, stays reachable"* — while passing `resolveActiveSlabDrawMode()`, whose return
 * type is `BoundaryDrawMode` and therefore CANNOT express any of the four gestures it
 * names. Re-entering the tool after choosing By Region silently gave a polyline slab.
 *
 * Restoring both axes needs both stores: the gesture from here, and — only when the
 * gesture IS the polyline family — the constraint the user last set. Exported as a
 * function rather than inlined at the call site so the promise is testable.
 */
export function resolveSlabReentryMode(constraint: 'linear' | 'ortho' | 'curved'): string {
    const family = resolveActiveSlabFamilyMode();
    return family === 'polyline' ? constraint : family;
}

/** Test seam — restore the default so one spec cannot leak its gesture into the next. */
export function __resetActiveSlabFamilyModeForTests(): void {
    _activeSlabFamilyMode = 'polyline';
}
