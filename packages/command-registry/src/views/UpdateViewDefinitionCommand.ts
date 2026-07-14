/**
 * UpdateViewDefinitionCommand — Phase B
 *
 * Updates mutable fields of an existing ViewDefinition (name, discipline,
 * spatial context, temporal filter, vgTemplateId, AI intent string, tags).
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; snapshot captured in execute()
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Additive update only; schema stable
 *   §07        — No server routes
 *
 * Undo: restores the snapshot captured at execute() time.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewDefinition, ViewSpatialContext, ViewTemporalContext, ViewCropSettings } from '@pryzm/core-app-model';

export interface UpdateViewDefinitionPatch {
    name?:         string;
    discipline?:   ViewDefinition['discipline'];
    spatial?:      Partial<ViewSpatialContext>;
    temporal?:     Partial<ViewTemporalContext>;
    vgTemplateId?: string | null;
    intent?:       string;
    tags?:         string[];
    purpose?:      ViewDefinition['purpose'] | null;
    /**
     * §PERF-ELEV-CROP-DRAG-FLOW (L-222) — optional crop patch so a single command
     * can commit BOTH a spatial change (sectionVolume / cropRegion / sectionPlane)
     * AND the crop it derives (farClip.offset / region) as ONE undo entry. This is
     * the atomic commit of a section/elevation scope-box drag: previously the drag
     * fired UPDATE_VIEW_DEFINITION *and* SET_VIEW_CROP per pointermove — two commands,
     * two undo entries, two competing projections. `viewDefinitionStore.update()`
     * already applies `patch.crop`; `undo()` below restores the pre-command crop.
     * Pass `null` to clear crop, `undefined` (omit) to leave crop untouched.
     */
    crop?:         ViewCropSettings | null;
    /**
     * §FIX-VIEW-OUTPUT-NO-BRIDGE (L-289) — scale / detailLevel / visualStyle / displayModel /
     * shadows. `viewDefinitionStore.update()` has always applied `patch.output` (MERGE
     * semantics); it simply was not DECLARED here, because the properties panel used to fire
     * `view.setOutput` — a command type NOTHING in the editor handles, so every Output-section
     * edit was a silent no-op. The panel now routes here. Pass `null` to clear output entirely.
     */
    output?:       ViewDefinition['output'] | null;
    /**
     * §FEAT-SET-OUT-INTENT (L-289) — live documentation. REPLACE semantics.
     * Pass `null` to make the view no longer live.
     */
    setOut?:       ViewDefinition['setOut'] | null;
}

export class UpdateViewDefinitionCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_VIEW_DEFINITION;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: ViewDefinition | null = null;

    constructor(
        private viewId: string,
        private patch:  UpdateViewDefinitionPatch,
    ) {
        this.targetIds = [viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this.viewId}' does not exist.` };
        }
        if (Object.keys(this.patch).length === 0) {
            return { ok: false, reason: 'Patch is empty — nothing to update.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = viewDefinitionStore.get(this.viewId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.viewId}' not found.` };
        }
        const ok = viewDefinitionStore.update(this.viewId, this.patch);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const snap = this.snapshot;
        const ok = viewDefinitionStore.update(this.viewId, {
            name:         snap.name,
            discipline:   snap.discipline,
            spatial:      snap.spatial,
            temporal:     snap.temporal,
            vgTemplateId: snap.vgTemplateId ?? null,
            intent:       snap.intent,
            tags:         snap.metadata.tags,
            purpose:      snap.purpose ?? null,
            // §PERF-ELEV-CROP-DRAG-FLOW (L-222) — restore the pre-command crop only
            // when this command actually patched it, so a spatial-only update never
            // clobbers an unrelated crop. `snap.crop` is the crop as it was at
            // execute() time (i.e. before this command applied `patch.crop`).
            ...(this.patch.crop !== undefined ? { crop: snap.crop ?? null } : {}),
            // §FIX-VIEW-OUTPUT-NO-BRIDGE / §FEAT-SET-OUT-INTENT (L-289) — same conditional rule
            // as `crop`, and for the same reason: restore ONLY what this command actually
            // patched, so an unrelated update never clobbers a field it did not touch.
            //
            // `output` must be restored with REPLACE semantics, not merge. `update()` merges
            // output (`{...view.output, ...patch.output}`), so handing it the snapshot object
            // would leave any key the forward patch ADDED still present — the exact
            // §VIEW-UNDO-SPATIAL-MERGE-RESIDUE (G8) defect, one field over. Clearing to `null`
            // first makes the restore a true replace.
            ...(this.patch.output !== undefined ? { output: null } : {}),
            ...(this.patch.setOut !== undefined ? { setOut: snap.setOut ?? null } : {}),
        } as any);
        // The replace half of the output restore — `update()` merges, so the clear above and
        // this write cannot be one call.
        if (this.patch.output !== undefined && snap.output) {
            viewDefinitionStore.setOutput(this.viewId, snap.output);
        }
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewId: this.viewId, patch: this.patch, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
