// TODO(E.5.x): ORPHANED — ReplacePanelHandler (plugins/curtain-wall/src/handlers/ReplacePanel.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler. Confirm no other live callers exist then remove in Phase E.5.x cleanup.

/**
 * ReplacePanelTypeCommand
 *
 * Replaces the panelType (and optionally materialOverride) of a single curtain panel.
 *
 * ## Command Flow
 *
 *   commandManager.execute(ReplacePanelTypeCommand)
 *     → CurtainPanelStore.update()
 *     → storeEventBus.emit({ elementType: 'curtain-panel', operation: 'update' })
 *     → EngineBootstrap panelStore subscriber calls curtainWallBuilder.updateCurtainWall(cw)
 *     → Builder re-reads all panels from CurtainPanelStore and re-renders
 *
 * ## Undo
 *
 * Restores the previous panelType and materialOverride snapshot.
 *
 * ## Contract References
 *
 * §2.7  — commandManager.execute() is the ONLY path for panel type changes
 * §3.5  — Store is data-only; builder re-renders via storeEventBus subscriber
 * §04   — AI may propose ReplacePanelTypeCommand via CommandProposal
 *
 * ## MODIFICATION DECLARATION
 *
 * Fix DW-01 (2026-03-31): Replaced all window-global curtainPanelStore /
 *   curtainWallStore reads with context.stores.curtainPanelStore /
 *   context.stores.curtainWallStore — §01 §2.7, §3.5 compliance.
 *
 * Fix MI-02 (2026-03-31): Removed "touch" pattern (cwStore.update(cwId, {})).
 *   Rebuild is now driven by a curtainPanelStore subscriber in EngineBootstrap
 *   that fires curtainWallBuilder.updateCurtainWall(cw) on any panel update event.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { PanelType, isValidPanelType } from '@pryzm/geometry-curtain-wall';

export interface ReplacePanelTypePayload {
    /** The CurtainPanelData.id to update. */
    panelId: string;
    /** The new panel type. */
    newPanelType: PanelType;
    /** Optional hex color override (e.g. '#ff0000'). Pass null to clear. */
    materialOverride?: string | null;
}

export class ReplacePanelTypeCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — this command mutates the panel store only.
    // The transitive parent re-render is driven by the panel-store subscriber in
    // EngineBootstrap (see §3.8 / §MI-02), so declaring "curtainWall" here would
    // wrongly bus this mutation to wall-shape subscribers and double-fire renders.
    readonly affectedStores = ["curtainPanel"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.REPLACE_CURTAIN_PANEL_TYPE;
    readonly timestamp = Date.now();
    targetIds: string[];

    private previousPanelType: PanelType | null = null;
    private previousMaterialOverride: string | undefined = undefined;

    constructor(private payload: ReplacePanelTypePayload) {
        this.targetIds = [payload.panelId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!isValidPanelType(this.payload.newPanelType)) {
            return {
                ok: false,
                reason: `'${this.payload.newPanelType}' is not a valid PanelType. ` +
                    `Valid values: SystemPanel_Glass, SystemPanel_Opaque, SystemPanel_Empty`
            };
        }

        // §DW-01 FIX: use injected context.stores — never window-global.*
        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) {
            return { ok: false, reason: 'CurtainPanelStore is not available in CommandContext' };
        }

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) {
            return { ok: false, reason: `Panel '${this.payload.panelId}' not found` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §DW-01 FIX: use injected context.stores — never window-global.*
        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) throw new Error('[ReplacePanelTypeCommand] CurtainPanelStore not available in CommandContext');

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) throw new Error(`Panel '${this.payload.panelId}' not found`);

        // §01 §2.2: Snapshot BEFORE mutation
        this.previousPanelType         = panel.panelType;
        this.previousMaterialOverride  = panel.materialOverride;

        const updates: Record<string, any> = { panelType: this.payload.newPanelType };
        if (this.payload.materialOverride !== undefined) {
            updates.materialOverride = this.payload.materialOverride ?? undefined;
        }

        // §MI-02 FIX: panelStore.update() emits storeEventBus 'curtain-panel' event.
        // EngineBootstrap's panelStore subscriber calls curtainWallBuilder.updateCurtainWall(cw)
        // — no touch of cwStore required. The old cwStore.update(cwId, {}) has been removed.
        panelStore.update(this.payload.panelId, updates);

        return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.previousPanelType === null) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo' };
        }

        // §DW-01 FIX: use injected context.stores — never window-global.*
        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) return { success: false, affectedElementIds: [], error: 'CurtainPanelStore not available in CommandContext' };

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) return { success: false, affectedElementIds: [], error: `Panel '${this.payload.panelId}' not found` };

        // §MI-02 FIX: panelStore.update() alone triggers the rebuild via subscriber.
        panelStore.update(this.payload.panelId, {
            panelType:        this.previousPanelType,
            materialOverride: this.previousMaterialOverride
        });

        return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
            payload:   this.payload as any
        };
    }
}
