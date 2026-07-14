/**
 * WindowOpeningFactory — §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266).
 * THE `window.create` CHOKEPOINT. The exact mirror of `DoorOpeningFactory` (L-260 A).
 *
 * ── The defect this cures (REPRODUCED, not assumed) ───────────────────────────
 *
 * C15 governs doors and windows as ONE hosted-element family. The door got a
 * creation chokepoint in L-260 A; the WINDOW never did, and the two window creation
 * paths resolved the architect's choice INDEPENDENTLY:
 *
 *   | field          | 3D (`WindowTool`)                   | PLAN (`WindowPlanToolHandler`)          |
 *   |----------------|-------------------------------------|-----------------------------------------|
 *   | `systemTypeId` | `'wt-timber-casement'` (field init) | `window.windowTool?.systemTypeId` (a P4 |
 *   |                |                                     | GLOBAL read) ?? `ot.systemTypeId`       |
 *   |                |                                     | ?? **`undefined`** → the `initTools`    |
 *   |                |                                     | bridge then applies its OWN fallback,   |
 *   |                |                                     | **`'wt-single-pane'`**                  |
 *   | `width`        | `DEFAULT_SINGLE/DOUBLE_WIDTH` (1.2 / 2.4, private fields) | **HARD-CODED `1.2` / `2.4`** |
 *   | `height`       | `DEFAULT_HEIGHT` (1.2)              | **HARD-CODED `1.2`**                    |
 *   | `sillHeight`   | `DEFAULT_SILL_HEIGHT` (1.0)         | **HARD-CODED `1.0`**                    |
 *
 * So the SAME ribbon selection produced a TIMBER CASEMENT in 3D and a SINGLE PANE in
 * plan — a different `systemTypeId`, therefore a different frame finish, a different
 * `defaultColumnRatios` (a mullion, or none) and therefore A DIFFERENT PLAN SYMBOL
 * AND A DIFFERENT 3D OBJECT. That is the founder's "window parity not correct",
 * and it is C11's signature failure for the EIGHTH time.
 *
 * The four hard-coded dimensions are the same numbers as the 3D tool's private
 * fields TODAY — but they are TWO TRUTHS for one dimension, so they were one edit
 * away from drifting, which is L-127.
 *
 * ── The cure ──────────────────────────────────────────────────────────────────
 *
 * Do NOT teach the plan tool to imitate the 3D tool — that leaves two paths to keep
 * in step by hand, and they never are (this is the seventh time we have learned it).
 * Resolve the window ONCE, BELOW the tools:
 *
 *   `buildWindowOpening()`     — the ONE opening record, from the ONE
 *                                `WindowToolConfigStore` + the ONE
 *                                `resolveWindowDimensions()` + the host wall.
 *   `buildWindowStoreRecord()` — the ONE rich `WindowStore` record, from that opening.
 *
 * Both commit paths (`CreateWallOpeningCommand` for 3D, the `wall.opening.created`
 * bridge for the bus/plan path) call `buildWindowStoreRecord()`. Same choice + same
 * wall ⇒ BYTE-IDENTICAL records, BY CONSTRUCTION ⇒ the identical symbol.
 *
 * WHY THE STORE-RECORD CHOKEPOINT IS THE LOAD-BEARING ONE: `WindowPlanSymbolBuilder`
 * draws from the STORE RECORD, not from the opening. A chokepoint that stops at the
 * opening is a chokepoint that reaches nothing (the L-246 lesson: geometry that is
 * computed perfectly and then thrown away is not a fix). `buildWindowStoreRecord()`
 * re-resolves `systemTypeId` from the config store when the opening does not carry
 * one, so a sloppy creation path CANNOT produce a divergent window even if it forgets
 * to state the type. Parity is enforced where the symbol reads, not where the tool writes.
 *
 * Pure: no DOM, no THREE, no I/O, no `window.*` (P4). P8 — every exported function
 * emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { resolveWindowDimensions } from './WindowDimensions';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import {
    getWindowToolConfig,
    type WindowToolConfig,
    type WindowTypeChoice,
} from './WindowToolConfigStore';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/** The flat wall-opening record persisted on `WallData.openings[]` (C15 §2). */
export interface WindowOpeningData {
    readonly id: string;
    readonly elementId: string;
    readonly type: 'window';
    readonly windowType: WindowTypeChoice;
    readonly systemTypeId: string;
    /** LEFT EDGE of the opening span (§OPENING-OFFSET-LEFTEDGE-UNIFY). */
    readonly offset: number;
    readonly width: number;
    readonly height: number;
    readonly sillHeight: number;
    readonly frameThickness: number;
    readonly frameDepth: number;
    readonly glazingThickness: number;
    readonly rebateDepth: number;
    /**
     * §L-266 — the sash sections the LOD-300 symbol articulates the frame with. They are
     * persisted ON THE RECORD because the symbol must DERIVE them, never invent them: a
     * symbol builder that types a dimension is the bug at higher resolution (L-127).
     */
    readonly sashThickness: number;
    readonly sashDepth: number;
    /**
     * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE MULLION, UNDER ITS ONE REAL NAME.
     *
     * This slot used to be `readonly mullionThickness: number` — a second source of truth
     * for a dimension the record already carried, invented by an earlier draft of L-266
     * and then reverted. THE REVERT WAS HALF-DONE: `buildWindowOpening` stopped WRITING
     * the field but the interface still REQUIRED it, so `@pryzm/geometry-window` has not
     * typechecked since (TS2741). It is now the record's own `columnDividerThickness` +
     * `columnRatios` — the fields `WindowBuilder` actually extrudes mullions from, and
     * therefore the only ones the plan symbol may read.
     */
    readonly columnDividerThickness: number;
    readonly rowDividerThickness: number;
    readonly columnRatios: readonly number[];
}

export interface BuildWindowOpeningInput {
    /**
     * The architect's resolved choice. When omitted the chokepoint reads the single
     * `WindowToolConfigStore` itself, so no caller can drift.
     */
    readonly config?: Partial<WindowToolConfig>;
    /** Host wall thickness (m) — the frame spans the full reveal. */
    readonly wallThickness: number;
    /** LEFT EDGE of the opening span along the wall baseline (m). */
    readonly offset: number;
    /** Pre-generated ids so PRYZM3 + legacy stores share stable keys. */
    readonly id?: string;
    readonly elementId?: string;
}

/** Fallback reveal depth when the host wall thickness is unknown/degenerate. */
const FALLBACK_WALL_THICKNESS = 0.2;

/**
 * THE CHOKEPOINT. Resolve a complete, canonical window opening from the architect's
 * ONE config + the host wall. Every window creation path calls this.
 */
export function buildWindowOpening(input: BuildWindowOpeningInput): WindowOpeningData {
    return _tracer().startActiveSpan('pryzm.window.buildOpening', (span) => {
        try {
            const stored = getWindowToolConfig();
            const windowType: WindowTypeChoice = input.config?.windowType ?? stored.windowType;
            const systemTypeId: string =
                (input.config?.systemTypeId && input.config.systemTypeId.length > 0)
                    ? input.config.systemTypeId
                    : stored.systemTypeId;

            // The ONE dimension authority. In the PRE-CREATION case there is no record
            // yet, so we pass only the choice — the resolver falls through type →
            // canonical default. This is the same call the placed window makes later.
            const dims = resolveWindowDimensions({ systemTypeId, windowType });

            // The frame spans the FULL wall reveal — this is what `WindowBuilder`
            // actually renders and what `WindowPlanSymbolBuilder` draws the frame faces
            // at, so the stored record must agree with both. The type's own `frameDepth`
            // is only a fallback for a wall with no resolvable thickness.
            const wallThickness = Number.isFinite(input.wallThickness) && input.wallThickness > 0
                ? input.wallThickness
                : FALLBACK_WALL_THICKNESS;

            const opening: WindowOpeningData = {
                id:               input.id        ?? crypto.randomUUID(),
                elementId:        input.elementId ?? crypto.randomUUID(),
                type:             'window',
                windowType,
                systemTypeId,
                offset:           input.offset,
                width:            dims.width,
                height:           dims.height,
                sillHeight:       dims.sillHeight,
                frameThickness:   dims.frameThickness,
                frameDepth:       wallThickness,
                glazingThickness: dims.glazingThickness,
                rebateDepth:      dims.rebateDepth,
                sashThickness:    dims.sashThickness,
                sashDepth:        dims.sashDepth,
                // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — PERSIST THE PANE GRID AND ITS
                // DIVIDERS. `columnRatios` is what says whether a mullion exists at all;
                // `columnDividerThickness` how wide it is (already widened to the 60 mm
                // meeting-stile minimum for a `double` by the resolver, so the 3D window and
                // the plan symbol cannot land on different mullions).
                columnDividerThickness: dims.columnDividerThickness,
                rowDividerThickness:    dims.rowDividerThickness,
                columnRatios:           [...dims.columnRatios],
            };

            span.setAttribute('pryzm.window.systemTypeId', systemTypeId);
            span.setAttribute('pryzm.window.windowType', windowType);
            span.setAttribute('pryzm.window.width', opening.width);
            span.end();
            return opening;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}

export interface BuildWindowStoreRecordInput {
    /** The canonical opening (from `buildWindowOpening`, or a persisted one on replay). */
    readonly opening: Readonly<Record<string, unknown>>;
    readonly wallId: string;
    /** Pre-assigned canonical mark, or a resolver to generate one (C03 §1.7). */
    readonly mark?: string;
    readonly resolveMark?: () => string;
}

/**
 * THE CHOKEPOINT (store side). Build the rich `WindowStore` record from a canonical
 * opening. BOTH commit paths call this, so a plan-created window and a 3D-created
 * window are byte-identical in the store: same type, same finishes, same mark, same
 * dims, same column/row ratios — and therefore the same plan symbol.
 */
export function buildWindowStoreRecord(input: BuildWindowStoreRecordInput): Record<string, unknown> {
    return _tracer().startActiveSpan('pryzm.window.buildStoreRecord', (span) => {
        try {
            const o = input.opening;
            const elementId = String(o.elementId ?? '');
            const openingId = String(o.id ?? '');

            const windowType: WindowTypeChoice = o.windowType === 'double' ? 'double' : 'single';

            // §L-266 — THE PARITY SEAM. The plan path historically arrived here with NO
            // systemTypeId (its P4 global read returned undefined) and the bridge then
            // invented `'wt-single-pane'` — a type the 3D path never chooses. Falling back
            // to the ONE `WindowToolConfigStore` instead means both paths land on the SAME
            // type even when a tool forgets to state it. The divergence is now
            // unrepresentable rather than merely discouraged.
            const systemTypeId = (typeof o.systemTypeId === 'string' && o.systemTypeId.length > 0)
                ? o.systemTypeId
                : getWindowToolConfig().systemTypeId;

            const sysType = windowSystemTypeStore.getById(systemTypeId);
            if (!sysType) {
                // §WINDOW-SYSTYPE-RESOLVE-WARN — a supplied id that resolves to nothing
                // means the window ships with NO finish (schema-default grey + blank
                // schedule). Loud, never silent; the window is still created.
                console.warn(
                    `[WindowOpeningFactory] window systemTypeId "${systemTypeId}" did not resolve to a ` +
                    `built-in window type — window created WITHOUT frame finish (blank schedule).`,
                );
            }

            // Dims: prefer what the opening persisted; otherwise re-resolve from the type,
            // so a legacy/replayed opening still lands on the canonical dimensions. Passing
            // the opening straight in means the record's own fields WIN — the instance is
            // the strongest authority (the user may have resized it).
            const dims = resolveWindowDimensions({
                systemTypeId,
                windowType,
                width:            typeof o.width            === 'number' ? o.width            : undefined,
                height:           typeof o.height           === 'number' ? o.height           : undefined,
                sillHeight:       typeof o.sillHeight       === 'number' ? o.sillHeight       : undefined,
                frameThickness:   typeof o.frameThickness   === 'number' ? o.frameThickness   : undefined,
                frameDepth:       typeof o.frameDepth       === 'number' ? o.frameDepth       : undefined,
                glazingThickness: typeof o.glazingThickness === 'number' ? o.glazingThickness : undefined,
                rebateDepth:      typeof o.rebateDepth      === 'number' ? o.rebateDepth      : undefined,
                sashThickness:    typeof o.sashThickness    === 'number' ? o.sashThickness    : undefined,
                sashDepth:        typeof o.sashDepth        === 'number' ? o.sashDepth        : undefined,
                // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the mullion's real fields. `o` is a
                // persisted/replayed opening, so its own grid WINS (a user may have set a
                // 3-pane window); otherwise the resolver falls to the type, then the default.
                columnDividerThickness: typeof o.columnDividerThickness === 'number' ? o.columnDividerThickness : undefined,
                rowDividerThickness:    typeof o.rowDividerThickness    === 'number' ? o.rowDividerThickness    : undefined,
                columnRatios:           Array.isArray(o.columnRatios) ? (o.columnRatios as number[]) : undefined,
            });

            const record: Record<string, unknown> = {
                id:               elementId,
                openingId,
                wallId:           input.wallId,
                offset:           typeof o.offset === 'number' && Number.isFinite(o.offset) ? o.offset : 0,
                width:            dims.width,
                height:           dims.height,
                sillHeight:       dims.sillHeight,
                windowType,
                systemTypeId,
                // §L-266 — PERSIST THE PROFILE. Before this, `buildWindowOpening` resolved
                // the frame/sash/mullion sections and BOTH store writers threw them away,
                // so the symbol had to re-derive them and could not honour a per-instance
                // override. The record now carries the members the LOD-300 symbol draws.
                frameThickness:   dims.frameThickness,
                frameDepth:       dims.frameDepth,
                glazingThickness: dims.glazingThickness,
                rebateDepth:      dims.rebateDepth,
                sashThickness:    dims.sashThickness,
                sashDepth:        dims.sashDepth,
                // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE MULLION REACHES THE SYMBOL.
                //
                // `WindowPlanSymbolBuilder` draws from the STORE RECORD. Resolving the pane
                // grid perfectly and then not writing it here would be the L-05 disease
                // (geometry computed and thrown away) — the symbol would fall back to the
                // schema default `[1]` and a DOUBLE window would draw with NO meeting stile
                // while the 3D window grew one. Write it where the symbol reads it.
                columnDividerThickness: dims.columnDividerThickness,
                rowDividerThickness:    dims.rowDividerThickness,
                columnRatios:           [...dims.columnRatios],
            };

            const mark = (input.mark && String(input.mark).trim())
                ? String(input.mark)
                : input.resolveMark?.();
            if (mark) record.mark = mark;

            if (sysType) {
                record.frameFinish    = { ...sysType.frameFinish };
                record.sillFinish     = { ...sysType.sillFinish };
                record.frameColor     = sysType.frameFinish.materialColor;
                record.glassOpacity   = sysType.glazingOpacity;
                record.finishMaterial = sysType.frameFinish.name;
                // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — `columnRatios` is DELIBERATELY NOT
                // re-assigned from the type here: `resolveWindowDimensions()` already folded
                // `sysType.defaultColumnRatios` into `dims.columnRatios` above, AND applied
                // the DW-11 double-window override on top of it. Re-applying the type's raw
                // default here would silently UNDO that override and hand a `double` window a
                // single pane — the exact class of bug this ticket exists to kill.
                if (sysType.defaultRowRatios?.length) {
                    record.rowRatios = [...sysType.defaultRowRatios];
                }
            }

            span.setAttribute('pryzm.window.systemTypeId', systemTypeId);
            span.setAttribute('pryzm.window.windowType', windowType);
            span.setAttribute('pryzm.window.resolvedType', sysType !== undefined);
            span.end();
            return record;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
