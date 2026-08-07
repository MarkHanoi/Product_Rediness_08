/**
 * activeRoofDrawMode — §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699).
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for the roof creation mode
 * the user selected, mirroring `activeSlabDrawMode` exactly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY — this defect was PREDICTED IN WRITING AND THEN SHIPPED
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit row **L-693** closed this bug for floor and ceiling and left roof as an
 * explicit open residual, verbatim:
 *
 *   *"`roof` holds its mode on the 3D tool instance — the precise shape of the
 *    bug just fixed for floor/ceiling; adopt `activeSlabDrawMode`'s
 *    surface-independent store BEFORE it reproduces the founder's report."*
 *
 * `elementCreationMatrix.ts` even declares it as `modeSource: 'tool-instance'`
 * with a `gap` string naming this cure. It then reproduced the founder's report
 * on 2026-08-07.
 *
 * The mechanism was worse than "desync". `RoofPlanToolHandler.activate()` read
 * `window.roofTool.activeTool` and narrowed it with a TWO-BRANCH ternary:
 *
 *     this._mode = (at === 'POLYLINE') ? 'POLYLINE' : 'RECTANGLE';
 *
 * so `REGION` — and `single_slope` and `hip_roof`, which the 3D tool also carries
 * as `REGION` — collapsed to `RECTANGLE`. The plan surface could not create a
 * region roof AT ALL, while `elementCreationMatrix` declared all five modes
 * available in `['plan','3d']`. That is L-693's own lesson restated: *"cannot
 * create it here" and "the mode is inert here" are indistinguishable to a user
 * and are different defects.*
 *
 * ⚠ THE CURE IS "MODE IS AN ACTIVATION ARGUMENT", NOT "READ THE OTHER SURFACE'S
 * TOOL". Both surfaces read the value recorded HERE at activation, so neither
 * can be authoritative over the other and neither can silently narrow it.
 */

import { trace } from '@opentelemetry/api';

/**
 * The roof creation modes, spelled exactly as `elementCreationMatrix.ts` declares
 * them and as `BimService.activateRoofTool` / `ToolManager.activateRoof` accept
 * them. One vocabulary, so a mode cannot be lost in translation between layers.
 */
export type RoofDrawMode = '2point' | 'polyline' | 'region' | 'single_slope' | 'hip_roof';

const ROOF_DRAW_MODES: readonly RoofDrawMode[] = [
    '2point', 'polyline', 'region', 'single_slope', 'hip_roof',
];

const _roofDrawModeTracer = trace.getTracer('@pryzm/editor.active-roof-draw-mode', '0.1.0');

/** `2point` is the historic default — a user who never picks a mode gets it. */
let _activeRoofDrawMode: RoofDrawMode = '2point';

export function isRoofDrawMode(v: unknown): v is RoofDrawMode {
    return typeof v === 'string' && (ROOF_DRAW_MODES as readonly string[]).includes(v);
}

/**
 * The roof FORM each creation mode implies, in the `geometry-roof` `RoofType`
 * vocabulary.
 *
 * ⚠ `region` deliberately maps to `gable`, NOT to `by_region`. `by_region` is a
 * category error in the type union: it describes HOW the footprint was picked,
 * not what the roof IS, and `RoofGeometryBuilder.generateByRegion` consequently
 * emits a flat (or at best mono-pitch) plane. The founder chose "By Region",
 * which is a way of selecting a footprint, and was shown a flat plane — the type
 * and the mode had been conflated. The staged engine plan retires `by_region`
 * from the type union entirely; until then, region-mode resolves to a real form.
 */
export function roofTypeForMode(mode: RoofDrawMode): string {
    switch (mode) {
        case 'single_slope': return 'shed';
        case 'hip_roof':     return 'hip';
        default:             return 'gable';
    }
}

/**
 * Record the roof creation mode at activation. Called from the ONE editor-side
 * chokepoint (`BimService.activateRoofTool`) through which every UI entry point
 * — Create panel, Create rail, the tools rail, and the `R` shortcut — passes.
 *
 * P8: emits `pryzm.roof.set_active_draw_mode`.
 */
export function setActiveRoofDrawMode(mode: unknown): void {
    _roofDrawModeTracer.startActiveSpan('pryzm.roof.set_active_draw_mode', (span) => {
        try {
            const applied = isRoofDrawMode(mode);
            if (applied) _activeRoofDrawMode = mode;
            span.setAttribute('pryzm.roof.draw_mode', _activeRoofDrawMode);
            span.setAttribute('pryzm.roof.applied', applied);
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve the active roof creation mode. Read fresh by every surface on
 * activation so the two can never disagree.
 *
 * P8: emits `pryzm.roof.resolve_active_draw_mode`.
 */
export function resolveActiveRoofDrawMode(): RoofDrawMode {
    return _roofDrawModeTracer.startActiveSpan('pryzm.roof.resolve_active_draw_mode', (span) => {
        try {
            span.setAttribute('pryzm.roof.draw_mode', _activeRoofDrawMode);
            return _activeRoofDrawMode;
        } finally {
            span.end();
        }
    });
}

/** Test seam — restore the default so one spec cannot leak its mode into the next. */
export function __resetActiveRoofDrawModeForTests(): void {
    _activeRoofDrawMode = '2point';
}
