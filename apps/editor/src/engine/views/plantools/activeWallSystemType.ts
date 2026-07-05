/**
 * activeWallSystemType — §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — C16 wall authoring, ADR-0055.
 *
 * A stable, SURFACE-INDEPENDENT single source of truth for the wall system type the user
 * has selected for the NEXT wall (the layered composition, e.g. "Interior – Partition
 * 100 mm"). Both plan surfaces (main `PlanViewToolOverlay` and split `SvpPlanToolOverlay`,
 * via the shared `WallPlanToolHandler`) resolve it at `wall.create` dispatch, so a wall
 * drawn in the split-view plan pane carries the SAME systemTypeId as one drawn in the main
 * plan view — not `none`.
 *
 * ROOT (L-98): the selected type was stored ONLY on the transient `window.wallTool`
 * instance (`setSystemTypeId`). As the pre-draw picker itself notes, that reference "can be
 * a null/stale reference in some layout paths" — notably the split-view plan flow — so the
 * handler read `window.wallTool?.getSystemTypeId?.()` → `undefined` → the dispatched
 * `wall.create` carried `systemTypeId=none` and `CreateWallCommand` built a PLAIN wall
 * (thickness only), dropping the layered composition. Persisting the selection here, in a
 * module-level store that outlives any single tool instance and is shared by every plan
 * surface, closes that parity gap. The picker writes here AND to `window.wallTool` (which
 * the 3-D builder still reads); the handler reads here first, falling back to
 * `window.wallTool` for backward-compatibility.
 */

import { trace } from '@opentelemetry/api';

const _activeWallTypeTracer = trace.getTracer('@pryzm/editor.active-wall-system-type', '0.1.0');

/** The user's currently selected wall system type id (undefined ⇒ Plain Wall). */
let _activeWallSystemTypeId: string | undefined;

/**
 * Record the selected wall system type — the single source of truth read by BOTH plan
 * surfaces at `wall.create`. Called by the wall-type pre-draw picker (alongside
 * `window.wallTool.setSystemTypeId`, which the 3-D builder still consumes).
 *
 * P8: emits `pryzm.wall.set_active_system_type`.
 */
export function setActiveWallSystemTypeId(id: string | undefined): void {
    _activeWallTypeTracer.startActiveSpan('pryzm.wall.set_active_system_type', (span) => {
        try {
            _activeWallSystemTypeId = id || undefined;
            span.setAttribute('pryzm.wall.system_type', _activeWallSystemTypeId ?? 'plain');
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve the active wall system type id, surface-independently. Prefers the stable store
 * (set by the picker); falls back to the transient `window.wallTool` selection so the
 * MAIN-view path is byte-identical to before when the store was never written. Returns
 * undefined for a Plain Wall.
 *
 * P8: emits `pryzm.wall.resolve_active_system_type`.
 */
export function resolveActiveWallSystemTypeId(): string | undefined {
    return _activeWallTypeTracer.startActiveSpan('pryzm.wall.resolve_active_system_type', (span) => {
        try {
            const fromTool = (window as { wallTool?: { getSystemTypeId?: () => string | undefined } }).wallTool?.getSystemTypeId?.();
            const resolved = _activeWallSystemTypeId ?? fromTool ?? undefined;
            span.setAttribute('pryzm.wall.system_type', resolved ?? 'plain');
            span.setAttribute('pryzm.wall.source', _activeWallSystemTypeId ? 'store' : (fromTool ? 'wallTool' : 'none'));
            return resolved;
        } finally {
            span.end();
        }
    });
}
