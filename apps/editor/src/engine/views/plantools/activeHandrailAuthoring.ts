/**
 * activeHandrailAuthoring — §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18).
 *
 * THE ONE surface-independent answer to the two questions a handrail-authoring
 * gesture asks: **which MODE** and **which TYPE**.
 *
 * This is `activeWallSystemType.ts` (L-98) and `activeSlabDrawMode.ts` applied to
 * handrail, and it is written as a store for the reason both of those record: the
 * selection must outlive whichever panel instance offered it. There is not ONE
 * handrail picker — `CreateRailPanel` builds a `HandrailModePicker`, the property
 * panel builds a pre-draw widget, and `ToolsAreaLayout` builds a `DrawingModeBar`
 * — so a choice made in one would be invisible to a handler reading another's
 * instance. That is exactly L-98, and it cost a lane once already.
 *
 * ⛔ IT ALSO CLOSES C95 §10.1, WHICH IS A REAL USER LOSS, NOT TIDINESS.
 * Measured before this lane: `RailingPlanToolHandler` hard-coded
 * `DEFAULT_HEIGHT = 1.1` and `DEFAULT_THICK = 0.05`, imported no
 * `handrailTypeStore` and had no `_selectedTypeId` — *"the plan tool cannot
 * express any catalogue type"* — while `HandrailTool` (3-D) resolved everything
 * from the selected type and defaulted `height` to **1.0**. One question ("what
 * handrail did the user ask for?"), two answers, selected by which VIEW they
 * happened to be in (C84 EI-9). Both tools now resolve from here, and the two
 * literals are DELETED rather than re-synchronised — a comment is not a
 * synchronisation mechanism (C84 §8.d).
 *
 * MODE IS LIVE, NOT LATCHED AT ACTIVATION: the plan handler re-reads it on every
 * click, so switching mode mid-run applies to the very next segment and the
 * vertices already placed survive (`DrawingModeBar`'s whole reason to exist).
 */

import { trace } from '@opentelemetry/api';
import type { HandrailRunMode } from '@pryzm/geometry-handrail';

const _tracer = trace.getTracer('@pryzm/editor.active-handrail-authoring', '0.1.0');

/**
 * The modes handrail offers, as ids. Declared in ONE place —
 * `elementCreationMatrix`'s `railing` row is its UI face and imports this union's
 * meaning from `@pryzm/geometry-stair`, so the bar and the generators cannot
 * offer different sets (the `STAIR_SHAPES` lesson, §FIX-STAIR-SHAPE-DESYNC).
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
 * Writes here AND to `window.handrailTool.setTypeId`, exactly as the wall picker
 * writes both `activeWallSystemType` and `window.wallTool`: the 3-D tool still
 * reads its own instance field, and until it does not, writing only one of the two
 * is how a type silently fails to apply on one surface.
 */
export function setActiveHandrailTypeId(id: string | undefined): void {
    _tracer.startActiveSpan('pryzm.handrail.set_active_type', (span) => {
        try {
            _typeId = id || undefined;
            const tool = (window as { handrailTool?: { setTypeId?: (i: string | undefined) => void } }).handrailTool;
            tool?.setTypeId?.(_typeId);
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

/** Test seam — one spec must not leak its mode/type into the next. */
export function __resetActiveHandrailAuthoringForTests(): void {
    _mode = 'linear';
    _typeId = undefined;
}
