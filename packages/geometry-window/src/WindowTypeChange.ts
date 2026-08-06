/**
 * WindowTypeChange — §FIX-HOSTED-TYPE-CHANGE (L-620). The WINDOW half.
 *
 * The exact mirror of `DoorTypeChange`, for the reason C15 gives: doors and windows are
 * ONE hosted-element family and must be resolved, stored and drawn to ONE standard. Read
 * that module's header for the full argument; only the window-specific deltas are noted
 * here.
 *
 *   • PARITY BY CONSTRUCTION (C11 §3) — the patch is derived by re-running the record
 *     through `buildWindowStoreRecord()`, the ONE chokepoint both creation paths call,
 *     with the target type supplied.
 *
 *   • THE VOID IS INVIOLATE (C15) — `offset` / `width` / `height` / `sillHeight` are the
 *     structural opening mirrored on `WallData.openings[]`, which this operation does not
 *     touch. They pass through verbatim; identity (`id` / `openingId` / `wallId`) too.
 *
 * ── THE WINDOW DELTA: `columnRatios` IS TYPE-DERIVED ON A TYPE CHANGE ─────────
 *
 * `columnRatios` says WHETHER THE WINDOW HAS A MULLION AT ALL, and it is stamped from
 * `WindowSystemType.defaultColumnRatios`. The BACKFILL protects it (an architect who set
 * a 3-pane window must not have a migration undo that). A TYPE CHANGE does not: choosing
 * a different window type and keeping the previous type's pane grid is precisely the
 * "type in name only" outcome the dropdown exists to avoid. It is therefore NOT passed
 * to the chokepoint, so `resolveWindowDimensions()` re-derives it from the target type —
 * including the DW-11 double-window override, which is applied inside the resolver and
 * must not be bypassed.
 *
 * Pure: no DOM, no THREE, no I/O, no `window.*` (P4). P8 — every exported function
 * emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { buildWindowStoreRecord } from './WindowOpeningFactory';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import type { WindowOpening } from './WindowTypes';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/**
 * THE BOUNDARY for a TYPE CHANGE (C15) — identity, the structural void, and the
 * instance's own topological CHOICE (`windowType`, `mark`). Everything else the
 * chokepoint emits is TYPE-DERIVED and is re-seeded from the target type.
 */
export const PRESERVED_ON_TYPE_CHANGE: ReadonlySet<string> = new Set([
    'id', 'openingId', 'wallId',
    'offset', 'width', 'height', 'sillHeight',
    'windowType',
    'mark',
]);

/** The outcome of planning a window type change. */
export interface WindowTypeChangePlan {
    readonly id: string;
    readonly wallId: string;
    readonly from: string | undefined;
    readonly to: string;
    /** Merge-patch to apply to the store record. Empty when `blockedReason` is set. */
    readonly patch: Readonly<Record<string, unknown>>;
    /** Non-null when the target type could not be resolved — a FINDING, never invented. */
    readonly blockedReason: string | null;
}

/**
 * Plan a window's type change. PURE — reads the catalogue, mutates nothing.
 *
 * @param win           The live store record being retyped.
 * @param targetTypeId  The `WindowSystemType.id` the architect chose.
 */
export function planWindowTypeChange(
    win: WindowOpening,
    targetTypeId: string,
): WindowTypeChangePlan {
    return _tracer().startActiveSpan('pryzm.window.planTypeChange', (span) => {
        try {
            span.setAttribute('pryzm.window.id', win.id);
            span.setAttribute('pryzm.window.targetTypeId', targetTypeId);

            const target = targetTypeId ? windowSystemTypeStore.getById(targetTypeId) : undefined;
            if (!target) {
                const reason =
                    `[WindowTypeChange] window type "${targetTypeId}" is not in ` +
                    `windowSystemTypeStore — refusing to retype window ${win.id}. Nothing changed.`;
                span.setAttribute('pryzm.window.typeChange.blocked', true);
                span.end();
                return {
                    id: win.id, wallId: win.wallId, from: win.systemTypeId,
                    to: targetTypeId, patch: {}, blockedReason: reason,
                };
            }

            const canonical = buildWindowStoreRecord({
                opening: {
                    id:           win.openingId,
                    elementId:    win.id,
                    systemTypeId: targetTypeId,
                    offset:       win.offset,
                    width:        win.width,
                    height:       win.height,
                    sillHeight:   win.sillHeight,
                    windowType:   win.windowType,
                    // frame/sash sections and the pane grid are DELIBERATELY omitted so
                    // the chokepoint re-resolves them from the target type.
                },
                wallId: win.wallId,
                mark:   win.mark,
            });

            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(canonical)) {
                if (PRESERVED_ON_TYPE_CHANGE.has(k)) continue;
                if (v === undefined) continue;
                patch[k] = v;
            }

            span.setAttribute('pryzm.window.typeChange.patchKeys', Object.keys(patch).length);
            span.end();
            return {
                id: win.id,
                wallId: win.wallId,
                from: win.systemTypeId,
                to: targetTypeId,
                patch,
                blockedReason: null,
            };
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
