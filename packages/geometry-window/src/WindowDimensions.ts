/**
 * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — Window dimension resolver.
 *
 * THE SINGLE SOURCE OF TRUTH for a window's real dimensions (frame thickness,
 * frame depth, glazing thickness, jamb rebate, sill board). Exactly the role
 * `DoorDimensions.resolveDoorDimensions()` plays for the door (§FIX-DOOR-PREVIEW-EXACT,
 * L-127) — doors and windows are ONE hosted-element family (C15) and must be
 * dimensioned, and drawn, to ONE standard.
 *
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * L-127 (non-negotiable): every dimension a symbol draws must come from the
 * element's REAL record — NEVER a magic literal inside the symbol builder. The
 * window record (`WindowOpeningSchema`) already carries `frameThickness`,
 * `frameDepth`, `sill`, `sillDepth` and `sillThickness`; it did NOT carry the two
 * dimensions an LOD-300 plan symbol needs — the GLAZING THICKNESS (the sealed unit
 * drawn as a thin double line) and the JAMB REBATE / check depth (the pocket the
 * glazing is captured in). Both are now optional record fields, and this resolver
 * is the one place that answers "what are this window's real dimensions?".
 *
 * RESOLUTION ORDER (identical in spirit to the door):
 *   1. the WINDOW RECORD's own field   — the instance is the strongest authority,
 *   2. the selected `WindowSystemType.dimensions` block — the type's standard,
 *   3. `DEFAULT_WINDOW_DIMENSIONS` — the canonical residential fallbacks, which
 *      match `WindowOpeningSchema`'s own defaults, so a typeless legacy window is
 *      dimensioned exactly as it always was.
 *
 * The fallbacks live HERE, next to the type they describe — not scattered through
 * the geometry builders. A builder that needs a number asks this function.
 *
 * Architecture: pure read of `windowSystemTypeStore` (a side-system store, not in
 * undo history). No THREE, no DOM. P8 — the exported resolver emits one span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { windowSystemTypeStore } from './WindowSystemTypeStore';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/** Fully-resolved real dimensions of a window instance (metres). */
export interface ResolvedWindowDimensions {
    /** Frame member FACE WIDTH — how far the frame reaches into the opening at each jamb. */
    frameThickness: number;
    /** Frame member DEPTH across the wall reveal (the 3D builder widens this to the wall). */
    frameDepth: number;
    /** Glazing unit thickness — what the plan double-line glazing is drawn at. */
    glazingThickness: number;
    /** Jamb rebate / check depth — the pocket in the frame that captures the glazing. */
    rebateDepth: number;
    /** Whether this window carries a sill board at all. */
    sill: boolean;
    /** Sill board projection beyond the wall face. */
    sillDepth: number;
    /** Sill board thickness (vertical) — used by the 3D builder. */
    sillThickness: number;
    /** Sill board overhang past each jamb (the board is wider than the opening). */
    sillOverhang: number;
}

/**
 * Canonical residential fallbacks.
 *
 * `frameThickness` (50 mm), `frameDepth` (70 mm), `sillDepth` (80 mm) and
 * `sillThickness` (30 mm) are exactly the `WindowOpeningSchema` defaults, so a
 * window with no type and no explicit fields is byte-for-byte unchanged.
 *
 * `glazingThickness` — 24 mm: the standard 4-16-4 double-glazed sealed unit. This
 * is what the plan symbol draws as a thin double line, and what the 3D builder now
 * extrudes its panes at (it previously hard-coded a 6 mm single pane — itself a
 * magic literal, and a second truth).
 *
 * `rebateDepth` — 15 mm: the standard glazing check in the frame. Clamped to the
 * frame face width by every consumer, so a slim frame can never grow a rebate
 * deeper than the frame member that contains it.
 *
 * `sillOverhang` — 20 mm each side: the 3D sill board is built `width + 40 mm`
 * wide; that 40 mm was likewise a literal, and is now this dimension × 2.
 */
export const DEFAULT_WINDOW_DIMENSIONS = Object.freeze({
    frameThickness:   0.05,
    frameDepth:       0.07,
    glazingThickness: 0.024,
    rebateDepth:      0.015,
    sill:             true,
    sillDepth:        0.08,
    sillThickness:    0.03,
    sillOverhang:     0.02,
});

/**
 * The subset of a `WindowOpening` this resolver reads. Declared structurally (not
 * as `WindowOpening`) so the plan-symbol builder — which receives records from
 * `wallStore.getAllWindows()` after a project reload — can call it too.
 */
export interface WindowDimensionSource {
    systemTypeId?: string;
    frameThickness?: number;
    frameDepth?: number;
    glazingThickness?: number;
    rebateDepth?: number;
    sill?: boolean;
    sillDepth?: number;
    sillThickness?: number;
    sillOverhang?: number;
}

/** Accept a record value only when it is a real, non-negative, finite number. */
function _num(value: unknown): number | undefined {
    return (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? value : undefined;
}

/**
 * Resolve the real dimensions of a window instance.
 *
 * Single source of truth — the 3D builder (`WindowBuilder`) and the plan-symbol
 * builder (`WindowPlanSymbolBuilder`) MUST both call this so the plan symbol is
 * dimensionally identical to the placed window (L-127).
 *
 * @param win  The window record (or any object carrying its dimension fields).
 */
export function resolveWindowDimensions(win: WindowDimensionSource): ResolvedWindowDimensions {
    return _tracer().startActiveSpan('pryzm.window.resolveDimensions', (span) => {
        try {
            const type = win.systemTypeId ? windowSystemTypeStore.getById(win.systemTypeId) : undefined;
            const d = type?.dimensions;

            const resolved: ResolvedWindowDimensions = {
                frameThickness:   _num(win.frameThickness)   ?? _num(d?.frameThickness)   ?? DEFAULT_WINDOW_DIMENSIONS.frameThickness,
                frameDepth:       _num(win.frameDepth)       ?? _num(d?.frameDepth)       ?? DEFAULT_WINDOW_DIMENSIONS.frameDepth,
                glazingThickness: _num(win.glazingThickness) ?? _num(d?.glazingThickness) ?? DEFAULT_WINDOW_DIMENSIONS.glazingThickness,
                rebateDepth:      _num(win.rebateDepth)      ?? _num(d?.rebateDepth)      ?? DEFAULT_WINDOW_DIMENSIONS.rebateDepth,
                sill:             win.sill ?? DEFAULT_WINDOW_DIMENSIONS.sill,
                sillDepth:        _num(win.sillDepth)        ?? _num(d?.sillDepth)        ?? DEFAULT_WINDOW_DIMENSIONS.sillDepth,
                sillThickness:    _num(win.sillThickness)    ?? _num(d?.sillThickness)    ?? DEFAULT_WINDOW_DIMENSIONS.sillThickness,
                sillOverhang:     _num(win.sillOverhang)     ?? _num(d?.sillOverhang)     ?? DEFAULT_WINDOW_DIMENSIONS.sillOverhang,
            };

            span.setAttribute('pryzm.window.systemTypeId', win.systemTypeId ?? '<default>');
            span.setAttribute('pryzm.window.frameThickness', resolved.frameThickness);
            span.setAttribute('pryzm.window.glazingThickness', resolved.glazingThickness);
            span.setAttribute('pryzm.window.resolvedFromType', d !== undefined);
            span.end();
            return resolved;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
