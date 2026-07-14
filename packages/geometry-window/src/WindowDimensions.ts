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
    /**
     * Structural opening (void) width along the wall baseline.
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — this used to live as
     * `DEFAULT_SINGLE_WIDTH` / `DEFAULT_DOUBLE_WIDTH` private fields on `WindowTool`
     * AND, independently, as the bare literals `1.2` / `2.4` inside
     * `WindowPlanToolHandler`. Two truths for one dimension is exactly L-127.
     */
    width: number;
    /** Window head height (sill → head). Was `WindowTool.DEFAULT_HEIGHT` / a literal `1.2`. */
    height: number;
    /** Sill height above the level. Was `WindowTool.DEFAULT_SILL_HEIGHT` / a literal `1.0`. */
    sillHeight: number;
    /** Frame member FACE WIDTH — how far the frame reaches into the opening at each jamb. */
    frameThickness: number;
    /** Frame member DEPTH across the wall reveal (the 3D builder widens this to the wall). */
    frameDepth: number;
    /**
     * SASH member face width — the openable leaf frame captured inside the outer frame.
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the founder's LOD-300 window
     * reference draws the frame as a REAL multi-line profile: outer frame, SASH,
     * mullion/meeting-stile, glazing line. The sash was the one member the record could
     * not name, so the symbol could not draw it without inventing an offset.
     */
    sashThickness: number;
    /** SASH member depth across the reveal — the sash sits proud of the glazing plane. */
    sashDepth: number;
    /** Glazing unit thickness — what the plan double-line glazing is drawn at. */
    glazingThickness: number;
    /** Jamb rebate / check depth — the pocket in the frame that captures the glazing. */
    rebateDepth: number;
    /**
     * MULLION / MEETING-STILE member face width — the centre post between two panes.
     *
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266). NOTE THE NAME: this is the
     * record's EXISTING `columnDividerThickness` field, not a new `mullionThickness`
     * of our own. An earlier draft of this fix introduced `mullionThickness` — which
     * would have been a SECOND TRUTH for a dimension the record already carried, i.e.
     * the very disease this ticket exists to kill, committed inside its own cure.
     * `WindowBuilder` (the 3D authority) extrudes its mullions from
     * `columnDividerThickness` + `columnRatios`; the plan symbol therefore reads
     * exactly those, and the two cannot disagree.
     *
     * WHETHER there is a mullion at all is NOT this dimension's business — that is
     * `columnRatios` (a 2-pane window has one divider, a 1-pane window has none).
     * This is only HOW WIDE it is when the pane grid says one exists. Never draw a
     * mullion because the symbol felt like it (L-127).
     *
     * THE DOUBLE-WINDOW RULE is reproduced from `WindowBuilder` verbatim: a `double`
     * window's meeting stile is widened to a 60 mm minimum (two sashes meet there, so
     * the member carries two frame sections, not one). It is resolved HERE so the 3D
     * builder and the plan symbol cannot apply it differently.
     */
    columnDividerThickness: number;
    /** ROW divider (transom) member face width — the horizontal counterpart. */
    rowDividerThickness: number;
    /**
     * The PANE GRID. Carried on the resolved dimensions because the symbol must draw a
     * divider ONLY where the record says a pane boundary exists. `[1]` = a single pane
     * (no mullion); `[0.5, 0.5]` = two equal panes (one mullion on the centreline).
     */
    columnRatios: readonly number[];
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
 *
 * `singleWidth` / `doubleWidth` / `height` / `sillHeight` — exactly the historical
 * `WindowTool.DEFAULT_*` private fields, which `WindowPlanToolHandler` had ALSO
 * written out as bare literals (`1.2` / `2.4` / `1.2` / `1.0`). Same numbers, two
 * places, no link — so they could drift silently, which is the whole disease
 * (L-266). They are one constant now.
 *
 * `sashThickness` (34 mm) / `sashDepth` (45 mm) — a standard casement sash section.
 * The sash is what makes an LOD-300 window read as a real frame profile rather than
 * a stack of parallel lines, and the record could not previously name it.
 */
export const DEFAULT_WINDOW_DIMENSIONS = Object.freeze({
    singleWidth:      1.2,
    doubleWidth:      2.4,
    height:           1.2,
    sillHeight:       1.0,
    frameThickness:   0.05,
    frameDepth:       0.07,
    sashThickness:    0.034,
    sashDepth:        0.045,
    glazingThickness: 0.024,
    rebateDepth:      0.015,
    // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE MULLION HAS EXACTLY ONE NAME.
    //
    // These are the `WindowOpeningSchema` defaults for the record's OWN
    // `columnDividerThickness` / `rowDividerThickness` / `columnRatios` fields, so a
    // typeless window resolves to precisely what the schema would have defaulted it to.
    //
    // The dead `mullionThickness: 0.056` that used to sit here was the residue of a
    // REVERTED second source of truth (see `columnDividerThickness` on
    // `ResolvedWindowDimensions`). The revert was left half-done: the field was
    // removed from the resolver's RETURN but not from this table, not from
    // `WindowDimensionSource`, and not from `WindowOpeningData` — which is why
    // `@pryzm/geometry-window` did not typecheck. One field, one owner, one name.
    columnDividerThickness: 0.03,
    rowDividerThickness:    0.03,
    columnRatios:           Object.freeze([1]) as readonly number[],
    /**
     * THE DOUBLE-WINDOW MEETING-STILE MINIMUM (60 mm).
     *
     * Two sashes MEET at a `double` window's centre post, so that member carries two
     * frame sections, not one — it cannot be as slim as an intermediate glazing bar.
     * This rule previously lived as the bare literal `0.06` inside `WindowBuilder`
     * (`Math.max(win.columnDividerThickness, 0.06)`), where the PLAN SYMBOL could not
     * see it: the 3D window grew a 60 mm mullion and the symbol drew a 30 mm one.
     * Resolving it HERE is what makes the two agree by construction (L-127).
     */
    doubleMeetingStileMin: 0.06,
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
    /**
     * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — `'single'` / `'double'`.
     *
     * THIS is what makes ONE resolver serve BOTH the post-creation case and the
     * PRE-CREATION (tool) case, which is what the two creation paths need in order to
     * agree BY CONSTRUCTION:
     *
     *   • a PLACED window passes its record, which already carries `width` / `height` /
     *     `sillHeight` — those win, because the instance is the strongest authority
     *     (a user may have resized it),
     *   • a TOOL about to create one passes only `{ systemTypeId, windowType }` — no
     *     width exists yet — and the resolver falls through to the TYPE's standard
     *     opening, and finally to the canonical default.
     *
     * One function, one resolution order, no second "tool-side" resolver to drift.
     */
    windowType?: 'single' | 'double';
    width?: number;
    height?: number;
    sillHeight?: number;
    frameThickness?: number;
    frameDepth?: number;
    sashThickness?: number;
    sashDepth?: number;
    glazingThickness?: number;
    rebateDepth?: number;
    /**
     * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the record's OWN divider fields. There is
     * deliberately NO `mullionThickness` here: `WindowBuilder` extrudes its mullions from
     * `columnDividerThickness` + `columnRatios`, so those are the fields the resolver — and
     * therefore the plan symbol — must read. A second name for one dimension is L-127.
     */
    columnDividerThickness?: number;
    rowDividerThickness?: number;
    columnRatios?: readonly number[];
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

            // ── THE STRUCTURAL OPENING (§FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300) ──
            //
            // This is the block the whole file exists for, and the reason ONE resolver
            // can serve BOTH the post-creation and the PRE-CREATION (tool) case:
            //
            //   • a PLACED window passes its record → `win.width` is set → it WINS. The
            //     instance is the strongest authority (the user may have resized it).
            //   • a TOOL about to create one passes only `{ systemTypeId, windowType }`
            //     → no width exists yet → we fall through to the TYPE's standard opening,
            //     then to the canonical default.
            //
            // So the plan tool and the 3D tool cannot land on different widths unless
            // they disagree about the TYPE — and `WindowToolConfigStore` makes that
            // impossible. Parity BY CONSTRUCTION, not by convention (C11 §3).
            //
            // `doubleWidth` mirrors `resolveDoorDimensions`: a type that declares only a
            // single-leaf `width` implies a double of twice that, so a catalogue author
            // never has to state a number the geometry already knows.
            const isDouble = win.windowType === 'double';
            const width =
                _num(win.width)
                ?? (isDouble
                    ? (_num(d?.doubleWidth)
                        ?? (_num(d?.width) !== undefined
                            ? (d!.width as number) * 2
                            : DEFAULT_WINDOW_DIMENSIONS.doubleWidth))
                    : (_num(d?.width) ?? DEFAULT_WINDOW_DIMENSIONS.singleWidth));

            // ── THE PANE GRID AND ITS DIVIDERS (§FEAT-WINDOW-CUT-ZONE-AND-LOD, L-278) ──
            //
            // THIS BLOCK IS THE WHOLE MULLION STORY, AND IT LIVES HERE SO THERE IS ONE OF IT.
            //
            // The pane grid says WHETHER a mullion exists ([1] → none; [0.5,0.5] → one on the
            // centreline); `columnDividerThickness` says HOW WIDE it is when one does. The
            // symbol must NEVER draw a mullion because it felt like one (L-127).
            //
            // DW-11: a `double` window is a BIM classification, not a ratio — it always has two
            // sashes meeting on a structural centre post, whatever the record's grid says. That
            // override, and the 60 mm meeting-stile minimum below it, previously lived ONLY in
            // `WindowBuilder`, so the 3D window and the plan symbol disagreed about the mullion
            // by 30 mm. Both now read the same resolved answer.
            const colRatios: readonly number[] = isDouble
                ? [0.5, 0.5]
                : (win.columnRatios?.length ? win.columnRatios : (type?.defaultColumnRatios?.length
                    ? type.defaultColumnRatios
                    : DEFAULT_WINDOW_DIMENSIONS.columnRatios));

            const baseCdt = _num(win.columnDividerThickness)
                ?? _num(d?.columnDividerThickness)
                ?? DEFAULT_WINDOW_DIMENSIONS.columnDividerThickness;

            const resolved: ResolvedWindowDimensions = {
                width,
                columnRatios:           [...colRatios],
                columnDividerThickness: isDouble
                    ? Math.max(baseCdt, DEFAULT_WINDOW_DIMENSIONS.doubleMeetingStileMin)
                    : baseCdt,
                rowDividerThickness:    _num(win.rowDividerThickness)
                    ?? _num(d?.rowDividerThickness)
                    ?? DEFAULT_WINDOW_DIMENSIONS.rowDividerThickness,
                height:           _num(win.height)           ?? _num(d?.height)           ?? DEFAULT_WINDOW_DIMENSIONS.height,
                sillHeight:       _num(win.sillHeight)       ?? _num(d?.sillHeight)       ?? DEFAULT_WINDOW_DIMENSIONS.sillHeight,
                frameThickness:   _num(win.frameThickness)   ?? _num(d?.frameThickness)   ?? DEFAULT_WINDOW_DIMENSIONS.frameThickness,
                frameDepth:       _num(win.frameDepth)       ?? _num(d?.frameDepth)       ?? DEFAULT_WINDOW_DIMENSIONS.frameDepth,
                sashThickness:    _num(win.sashThickness)    ?? _num(d?.sashThickness)    ?? DEFAULT_WINDOW_DIMENSIONS.sashThickness,
                sashDepth:        _num(win.sashDepth)        ?? _num(d?.sashDepth)        ?? DEFAULT_WINDOW_DIMENSIONS.sashDepth,
                glazingThickness: _num(win.glazingThickness) ?? _num(d?.glazingThickness) ?? DEFAULT_WINDOW_DIMENSIONS.glazingThickness,
                rebateDepth:      _num(win.rebateDepth)      ?? _num(d?.rebateDepth)      ?? DEFAULT_WINDOW_DIMENSIONS.rebateDepth,
                sill:             win.sill ?? DEFAULT_WINDOW_DIMENSIONS.sill,
                sillDepth:        _num(win.sillDepth)        ?? _num(d?.sillDepth)        ?? DEFAULT_WINDOW_DIMENSIONS.sillDepth,
                sillThickness:    _num(win.sillThickness)    ?? _num(d?.sillThickness)    ?? DEFAULT_WINDOW_DIMENSIONS.sillThickness,
                sillOverhang:     _num(win.sillOverhang)     ?? _num(d?.sillOverhang)     ?? DEFAULT_WINDOW_DIMENSIONS.sillOverhang,
            };

            span.setAttribute('pryzm.window.systemTypeId', win.systemTypeId ?? '<default>');
            span.setAttribute('pryzm.window.windowType', win.windowType ?? 'single');
            span.setAttribute('pryzm.window.width', resolved.width);
            span.setAttribute('pryzm.window.frameThickness', resolved.frameThickness);
            span.setAttribute('pryzm.window.glazingThickness', resolved.glazingThickness);
            // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the mullion is observable: `panes` says
            // whether one exists at all, `columnDividerThickness` how wide it is.
            span.setAttribute('pryzm.window.panes', resolved.columnRatios.length);
            span.setAttribute('pryzm.window.columnDividerThickness', resolved.columnDividerThickness);
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
