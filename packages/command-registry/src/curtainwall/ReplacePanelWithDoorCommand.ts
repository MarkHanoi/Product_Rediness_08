/**
 * ReplacePanelWithDoorCommand
 *
 * Converts a curtain wall panel into a hosted door (SystemPanel_Door) or
 * restores it to its previous panel type (undo).
 *
 * This implements the Revit "Place Door in Curtain Panel" workflow:
 *   - User selects a panel (glass or opaque)
 *   - Invokes this command with optional door configuration
 *   - Panel type switches to SystemPanel_Door
 *   - CurtainPanelBuilder renders parametric door geometry inside the cell
 *
 * ## Command Flow
 *
 *   commandManager.execute(ReplacePanelWithDoorCommand)
 *     → CurtainPanelStore.update({ panelType: 'SystemPanel_Door', hostedDoor })
 *     → storeEventBus.emit({ elementType: 'curtain-panel', operation: 'update' })
 *     → EngineBootstrap panelStore subscriber → curtainWallBuilder.updateCurtainWall(cw)
 *     → Builder re-renders, CurtainWallInstanceManager routes door to individual build
 *     → CurtainPanelBuilder._buildDoorObject() renders frame + leaf
 *
 * ## Undo
 *
 *   Restores the previous panelType, materialOverride, and hostedDoor snapshot.
 *
 * ## Contract References
 *
 *   §2.7  — commandManager.execute() is the ONLY mutation path
 *   §3.5  — Store is data-only; rebuild driven by storeEventBus subscriber
 *   §01 §2.2 — Full snapshot captured before mutation; undo uses store.set()
 *   §DW-01 — context.stores.curtainPanelStore used (never window.*)
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import {
    PanelType,
    CurtainPanelHostedDoor,
    DEFAULT_HOSTED_DOOR,
} from '@pryzm/geometry-curtain-wall';

export interface ReplacePanelWithDoorPayload {
    /** The CurtainPanelData.id to convert to a door panel. */
    panelId: string;
    /**
     * Door configuration to apply. Merged over DEFAULT_HOSTED_DOOR.
     * Pass undefined to use all defaults (standard floor-to-ceiling door).
     */
    doorConfig?: Partial<CurtainPanelHostedDoor>;
}

export class ReplacePanelWithDoorCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — mirror of ReplacePanelTypeCommand. Mutates
    // panel-store rows only; the parent wall is re-rendered transitively via the
    // panel subscriber in EngineBootstrap.
    readonly affectedStores = ["curtainPanel"] as const;
    readonly id        = crypto.randomUUID();
    readonly type      = CommandType.REPLACE_CURTAIN_PANEL_WITH_DOOR;
    readonly timestamp = Date.now();
    targetIds: string[];

    // §01 §2.2: Previous state snapshot — populated in execute(), used in undo()
    private prevPanelType:        PanelType | null                 = null;
    private prevMaterialOverride: string | undefined               = undefined;
    private prevHostedDoor:       CurtainPanelHostedDoor | undefined = undefined;

    constructor(private readonly payload: ReplacePanelWithDoorPayload) {
        this.targetIds = [payload.panelId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) {
            return { ok: false, reason: 'CurtainPanelStore is not available in CommandContext' };
        }

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) {
            return { ok: false, reason: `Panel '${this.payload.panelId}' not found` };
        }

        if (panel.panelType === 'SystemPanel_Empty') {
            return { ok: false, reason: 'Cannot place a door in an empty panel — convert to glass or opaque first' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) {
            throw new Error('[ReplacePanelWithDoorCommand] CurtainPanelStore not available in CommandContext');
        }

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) {
            throw new Error(`[ReplacePanelWithDoorCommand] Panel '${this.payload.panelId}' not found`);
        }

        // §01 §2.2: Snapshot BEFORE mutation
        this.prevPanelType        = panel.panelType;
        this.prevMaterialOverride = panel.materialOverride;
        this.prevHostedDoor       = panel.hostedDoor ? { ...panel.hostedDoor } : undefined;

        // Build door config: merge defaults → stored door → command payload
        const hostedDoor: CurtainPanelHostedDoor = {
            ...DEFAULT_HOSTED_DOOR,
            ...(panel.hostedDoor ?? {}),
            ...(this.payload.doorConfig ?? {}),
        };

        panelStore.update(this.payload.panelId, {
            panelType:        'SystemPanel_Door',
            materialOverride: undefined,
            hostedDoor,
        });

        return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
    }

    undo(context: CommandContext): CommandResult {
        if (this.prevPanelType === null) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo' };
        }

        const panelStore = context.stores.curtainPanelStore;
        if (!panelStore) {
            return { success: false, affectedElementIds: [], error: 'CurtainPanelStore not available in CommandContext' };
        }

        const panel = panelStore.get(this.payload.panelId);
        if (!panel) {
            return { success: false, affectedElementIds: [], error: `Panel '${this.payload.panelId}' not found` };
        }

        panelStore.update(this.payload.panelId, {
            panelType:        this.prevPanelType,
            materialOverride: this.prevMaterialOverride,
            hostedDoor:       this.prevHostedDoor,
        });

        return { success: true, affectedElementIds: [this.payload.panelId, panel.curtainWallId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
            payload:   this.payload as any,
        };
    }
}
