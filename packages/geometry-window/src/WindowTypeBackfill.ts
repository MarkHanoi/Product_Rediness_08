/**
 * WindowTypeBackfill — §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274). The WINDOW half.
 *
 * The exact mirror of `DoorTypeBackfill`, for the reason C15 gives: doors and windows
 * are ONE hosted-element family and must be resolved, stored and drawn to ONE standard.
 *
 * ── WHAT AN UNTYPED WINDOW ACTUALLY IS ────────────────────────────────────────
 *
 * Worse than an untyped door, because of ONE field: `columnRatios`. It is what says
 * WHETHER THE WINDOW HAS A MULLION AT ALL. It is stamped from the TYPE
 * (`WindowSystemType.defaultColumnRatios`) at creation; a record written by a path that
 * never resolved a type falls to the schema default `[1]` — a single undivided pane.
 * So an untyped record is not a broken window, it is a DIFFERENT WINDOW: no mullion, no
 * frame finish (schema-default grey), a blank schedule row, and — via
 * `resolveWindowDimensions(win)` in both `WindowBuilder` and `WindowPlanSymbolBuilder`
 * — the DEFAULT frame/sash sections rather than the type's.
 *
 * ── THE SAFETY RULE (identical to the door) ───────────────────────────────────
 *
 * THE INSTANCE IS THE STRONGEST AUTHORITY. `width` / `height` / `sillHeight` / `offset`
 * live on the record and must keep agreeing with the wall's CSG void (which lives on
 * the flat `WallData.openings[]` entry and is NOT part of this migration), so the
 * backfill NEVER moves them. It stamps the TYPE and the fields DERIVED from the type.
 * `INSTANCE_FIELDS` is that boundary, written down.
 *
 * Pure: no DOM, no THREE, no I/O, no `window.*` (P4). P8 — every exported function
 * emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { buildWindowStoreRecord } from './WindowOpeningFactory';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import { DEFAULT_WINDOW_TOOL_CONFIG } from './WindowToolConfigStore';
import type { WindowOpening } from './WindowTypes';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/**
 * THE BOUNDARY — the window's INSTANCE truth. Never migrated: the void on the host
 * wall must keep agreeing with the frame, and a window the architect resized stays
 * resized (C15).
 */
const INSTANCE_FIELDS: ReadonlySet<string> = new Set([
    'id', 'openingId', 'wallId',
    'offset', 'width', 'height', 'sillHeight',
    'frameThickness', 'frameDepth', 'glazingThickness', 'rebateDepth',
    'sashThickness', 'sashDepth', 'mullionThickness',
    'windowType',
    'mark',
]);

/** One record's migration: which window, from what (nothing), to which catalogue type. */
export interface WindowTypeBackfillEntry {
    readonly id: string;
    readonly wallId: string;
    readonly from: string | undefined;
    readonly to: string;
    readonly patch: Readonly<Record<string, unknown>>;
}

export interface WindowTypeBackfillPlan {
    readonly defaultTypeId: string;
    readonly defaultTypeName: string;
    readonly scanned: number;
    readonly entries: readonly WindowTypeBackfillEntry[];
    /** Non-null when no default could be resolved from the catalogue — a FINDING. */
    readonly blockedReason: string | null;
}

/** A window record is untyped when it carries no non-empty `systemTypeId`. */
export function isWindowUntyped(win: Pick<WindowOpening, 'systemTypeId'>): boolean {
    return typeof win.systemTypeId !== 'string' || win.systemTypeId.length === 0;
}

/**
 * THE DEFAULT TYPE — from the CATALOGUE, never invented.
 *
 * `DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId` (`wt-timber-casement`), VALIDATED against
 * `windowSystemTypeStore`. Deliberate, and the same argument as the door: it is the
 * type a window created TODAY through `buildWindowOpening()` carries, so a backfilled
 * legacy window and a freshly-drawn window are THE SAME WINDOW. (`wt-single-pane` — the
 * value the old plan/bus bridge invented — is the DIVERGENCE that L-266 killed, not the
 * standard; migrating onto it would resurrect the bug.)
 *
 * NOT the live `getWindowToolConfig()`: a migration must not depend on what the ribbon
 * happens to be showing.
 *
 * `null` when the catalogue cannot resolve it — reported, never papered over.
 */
export function resolveDefaultWindowSystemTypeId(): string | null {
    return _tracer().startActiveSpan('pryzm.window.resolveDefaultSystemTypeId', (span) => {
        try {
            const id = DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId;
            const type = windowSystemTypeStore.getById(id);
            span.setAttribute('pryzm.window.defaultSystemTypeId', id);
            span.setAttribute('pryzm.window.defaultResolved', type !== undefined);
            span.end();
            return type ? id : null;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}

/** Plan the window backfill. PURE — reads the catalogue, mutates nothing. */
export function planWindowTypeBackfill(windows: readonly WindowOpening[]): WindowTypeBackfillPlan {
    return _tracer().startActiveSpan('pryzm.window.planTypeBackfill', (span) => {
        try {
            const defaultTypeId = resolveDefaultWindowSystemTypeId();
            if (!defaultTypeId) {
                const reason =
                    `[WindowTypeBackfill] The window catalogue has no resolvable default type ` +
                    `("${DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId}" is not in windowSystemTypeStore). ` +
                    `Refusing to invent one — no windows migrated.`;
                span.setAttribute('pryzm.window.backfill.blocked', true);
                span.end();
                return {
                    defaultTypeId: DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId,
                    defaultTypeName: '',
                    scanned: windows.length,
                    entries: [],
                    blockedReason: reason,
                };
            }

            const defaultType = windowSystemTypeStore.getById(defaultTypeId)!;
            const entries: WindowTypeBackfillEntry[] = [];

            for (const win of windows) {
                if (!isWindowUntyped(win)) continue;

                // PARITY BY CONSTRUCTION — the ONE record chokepoint both creation paths
                // call, re-run over the existing record with the type supplied.
                const canonical = buildWindowStoreRecord({
                    opening: {
                        ...win,
                        id:           win.openingId,   // chokepoint: `opening.id` IS the openingId
                        elementId:    win.id,          // … and `opening.elementId` IS the window id
                        systemTypeId: defaultTypeId,
                    },
                    wallId: win.wallId,
                    mark:   win.mark,
                });

                const patch: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(canonical)) {
                    if (INSTANCE_FIELDS.has(k)) continue;   // never move the founder's geometry
                    if (v === undefined) continue;
                    patch[k] = v;
                }

                entries.push({
                    id:     win.id,
                    wallId: win.wallId,
                    from:   undefined,
                    to:     defaultTypeId,
                    patch,
                });
            }

            span.setAttribute('pryzm.window.backfill.scanned', windows.length);
            span.setAttribute('pryzm.window.backfill.untyped', entries.length);
            span.setAttribute('pryzm.window.backfill.defaultTypeId', defaultTypeId);
            span.end();
            return {
                defaultTypeId,
                defaultTypeName: defaultType.name,
                scanned: windows.length,
                entries,
                blockedReason: null,
            };
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
