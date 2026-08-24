/**
 * ApplySheetLayoutPresetCommand — Phase SC-4 (Next-Gen Sheet Composition Engine)
 *
 * Applies a named layout preset to a sheet by computing and setting its LayoutRule[].
 * The LayoutEngine.buildPreset() function is called at execute() time, not in the constructor,
 * so the rules reflect the current viewport IDs on the sheet at the time of execution.
 *
 * Contract compliance:
 *   §01 §2   — Command-first; LayoutEngine is called inside execute(), not from UI
 *   §04 §2.1 — Class A command (fully undoable)
 *   §07      — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import { layoutEngine } from '@pryzm/core-app-model';
import type { LayoutPresetKey } from '@pryzm/core-app-model';
import type { LayoutRule } from '@pryzm/core-app-model';

/**
 * §PRESETS-MUST-PLACE (L-10686) — the measured size of one placed viewport.
 *
 * A viewport has no size of its own: it is exactly as big as the drawing it
 * shows at the scale it shows it at, which is why the size is composed rather
 * than stored (see `composeForPlacement` / `viewportPaperRect` in
 * `@pryzm/file-format/sheets`). The composer lives at L3 and this command at
 * L2, so the caller measures and passes the numbers in — the same arrangement
 * `paperW`/`paperH` already use.
 *
 * When a size is absent the engine falls back to 40 % of the usable area, so an
 * unresolvable view still gets ARRANGED rather than left where it was.
 */
export interface LayoutBlockSizeMm {
    /** SheetViewport.id. */
    id: string;
    /** Composed paper footprint in millimetres. */
    w:  number;
    h:  number;
}

export interface ApplySheetLayoutPresetParams {
    sheetId:     string;
    presetKey:   LayoutPresetKey;
    /**
     * USABLE paper width in mm — the paper minus the title-block strip, which
     * is what `PaperParams.w` has always documented itself as. Passing the full
     * paper width lays viewports out underneath the title block.
     */
    paperW:      number;
    paperH:      number;
    marginMm:    number;
    /** Measured footprints, by viewport id. Optional — see LayoutBlockSizeMm. */
    blockSizes?: LayoutBlockSizeMm[];
}

export class ApplySheetLayoutPresetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.APPLY_SHEET_LAYOUT_PRESET;
    timestamp = Date.now();
    targetIds: string[];

    private _previousRules: LayoutRule[] = [];
    private _appliedRules:  LayoutRule[] = [];
    /** §PRESETS-MUST-PLACE (L-10686) — every position this command overwrote,
     *  so undo puts the sheet back exactly as the user had arranged it. */
    private _previousPositions: Array<{ id: string; x: number; y: number }> = [];

    constructor(private params: ApplySheetLayoutPresetParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        const validKeys: LayoutPresetKey[] = [
            'single-centred', 'plan-two-sections', 'plan-detail-column',
            'four-up', 'schedule-sheet', 'detail-sheet',
        ];
        if (!validKeys.includes(this.params.presetKey)) {
            return { ok: false, reason: `Unknown layout preset: '${this.params.presetKey}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.get(this.params.sheetId);
        if (!sheet) return { success: false, affectedElementIds: [] };

        this._previousRules = sheet.layoutRules ?? [];

        const viewportIds = sheet.viewports.map(vp => vp.id);
        this._appliedRules = layoutEngine.buildPreset(
            this.params.presetKey,
            viewportIds,
            { w: this.params.paperW, h: this.params.paperH, marginMm: this.params.marginMm },
        );

        const ok = sheetStore.setLayoutRules(this.params.sheetId, this._appliedRules);

        // ── §PRESETS-MUST-PLACE (L-10686) ──────────────────────────────────
        //
        // ⭐ THE PRESET USED TO END ON THE LINE ABOVE. It wrote `layoutRules`
        // and stopped. `layoutEngine.resolve()` had ZERO production callers and
        // `ResolvedPosition` zero consumers, so nothing anywhere in the product
        // ever turned a rule into a `SheetViewport.position`: the six buttons in
        // the sheet editor stored intent and moved nothing on the page.
        //
        // The founder clicked all six and reported the sheet unarranged. That is
        // the same defect as the scale dropdown he reported as a bug (L-10682) —
        // a control that looks live and does nothing — and it is worse than an
        // absent control, because it also spends the user's trust.
        //
        // Resolving here rather than in the UI keeps §01 §2 intact (the engine
        // is called inside `execute()`), makes the arrangement undoable as ONE
        // action, and means the AI sheet-authoring path gets it for free.
        const paper = { w: this.params.paperW, h: this.params.paperH, marginMm: this.params.marginMm };
        const blockSizes = new Map<string, { w: number; h: number }>(
            (this.params.blockSizes ?? []).map(b => [b.id, { w: b.w, h: b.h }]),
        );
        const resolved = layoutEngine.resolve(this._appliedRules, paper, blockSizes);

        this._previousPositions = [];
        let moved = 0;
        for (const pos of resolved) {
            const vp = sheet.viewports.find(v => v.id === pos.id);
            if (!vp) continue;                       // a rule may target a DataPanel
            this._previousPositions.push({ id: vp.id, x: vp.position.x, y: vp.position.y });
            // Clamped to the paper exactly as the drop handler clamps
            // (`SheetEditorPanel`'s drop: `Math.max(0, …)`), so a drawing larger
            // than the usable area lands ON the sheet rather than off its left
            // or bottom edge.
            if (sheetStore.moveViewport(this.params.sheetId, vp.id, {
                x: Math.max(0, pos.x),
                y: Math.max(0, pos.y),
            })) moved++;
        }

        console.log(
            `[ApplySheetLayoutPresetCommand] Applied preset '${this.params.presetKey}' → ` +
            `${this._appliedRules.length} rules, ${moved}/${sheet.viewports.length} viewports placed`,
        );
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        // Positions first, then rules — so a listener woken by the rule change
        // reads a sheet whose viewports are already back where they were.
        for (const prev of this._previousPositions) {
            sheetStore.moveViewport(this.params.sheetId, prev.id, { x: prev.x, y: prev.y });
        }
        const ok = sheetStore.setLayoutRules(this.params.sheetId, this._previousRules);
        return { success: ok, affectedElementIds: [this.params.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
