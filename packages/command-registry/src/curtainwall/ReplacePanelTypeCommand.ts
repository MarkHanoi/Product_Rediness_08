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
import { PanelType, isValidPanelType, VALID_PANEL_TYPES, DEFAULT_HOSTED_DOOR } from '@pryzm/geometry-curtain-wall';
import type { CurtainPanelHostedDoor } from '@pryzm/geometry-curtain-wall';

export interface ReplacePanelTypePayload {
    /** The CurtainPanelData.id to update. */
    panelId: string;
    /** The new panel type. */
    newPanelType: PanelType;
    /** Optional hex color override (e.g. '#ff0000'). Pass null to clear. */
    materialOverride?: string | null;
    /**
     * §CW-2 / C87 §13.4 CW-Attr-1 — signed metres off the wall centreline.
     * Omit to leave it untouched; pass 0 to return the panel to flush.
     *
     * ⚠ THIS COMMAND IS NOW "SET PANEL INSTANCE ATTRIBUTES", NOT ONLY "REPLACE
     * TYPE", AND THE NAME NO LONGER MATCHES. Renaming it is a separate change: the
     * type string is `CommandType.REPLACE_CURTAIN_PANEL_TYPE` and it is SERIALISED
     * into the undo history (`serialize()` below), so a rename is a stored-data
     * change, not a refactor — the same reasoning C69 §1.1 applies to bus verbs.
     * Recorded here so the mismatch is declared rather than discovered.
     */
    offsetFromCentreline?: number;
    /**
     * §CW-3 / C87 §13.5 CW-Door-1 — the hosted-door configuration for a
     * `SystemPanel_Door` cell. Omit to leave it untouched; pass `null` to clear it.
     *
     * ── THE C15 DECISION THIS FIELD ENCODES (taken 2026-08-19, lane CW1) ────────
     * A curtain-wall door is **answer (b)**: a PANEL KIND that REPLACES a grid cell,
     * NOT a C15 hosted opening. It therefore has no `offset`, no `openings[]` entry
     * and no void cut — it is authored on the panel record, by the same one route
     * every other per-panel attribute uses. The full reasoning and its contract
     * citations live in C87 §13.5; it is not restated here, because a decision
     * restated in two places is a decision that will diverge.
     */
    hostedDoor?: Partial<CurtainPanelHostedDoor> | null;
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
    /** §CW-2 — captured only when the payload actually carries an offset, so an
     *  undo cannot write `undefined` over an offset this command never touched. */
    private previousOffset: number | undefined = undefined;
    private touchedOffset = false;
    /** §CW-3 — same discipline as `touchedOffset`: snapshot ONLY what this
     *  dispatch wrote, so an undo cannot revert a door some other command set. */
    private previousHostedDoor: CurtainPanelHostedDoor | undefined = undefined;
    private touchedHostedDoor = false;

    constructor(private payload: ReplacePanelTypePayload) {
        this.targetIds = [payload.panelId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!isValidPanelType(this.payload.newPanelType)) {
            return {
                ok: false,
                // §CW-Voc-3 — GENERATED, NOT TRANSCRIBED. This named THREE members while
                // `isValidPanelType` validates against THIRTEEN, so a user told
                // "valid values: Glass, Opaque, Empty" could not discover the ten that
                // would have worked. Same defect as `ReplacePanel.ts:77-79` (fixed
                // 648b443d) — a hand-written copy of a union is C84 EI-8a's failure mode.
                reason: `'${this.payload.newPanelType}' is not a valid PanelType. ` +
                    `Valid values: ${VALID_PANEL_TYPES.join(', ')}`
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
        // §CW-2 — the snapshot is taken ONLY when this command touches the field.
        // Capturing unconditionally would make `undo()` write `undefined` over an
        // offset some OTHER command set, which is a silent edit disguised as a
        // revert — the C84 EI-7 shape (restoring a field you never wrote).
        if (this.payload.offsetFromCentreline !== undefined) {
            this.previousOffset = panel.offsetFromCentreline;
            this.touchedOffset  = true;
            updates.offsetFromCentreline = this.payload.offsetFromCentreline;
        }

        // §CW-3 / C87 §13.5 — HOSTED DOOR.
        //
        // Two behaviours, and the second is the one that stops a dead affordance:
        //  · an explicit `hostedDoor` payload is MERGED onto the defaults, so a UI
        //    that sends only `{ hingesSide: 'right' }` does not blank the other five;
        //  · switching a cell TO `SystemPanel_Door` with no door record materialises
        //    `DEFAULT_HOSTED_DOOR`. Without this, `isAuthoredPanel` sees
        //    `hostedDoor === undefined`, the sparse-override writer records only the
        //    panelType, and the six door fields never reach the file — a door that
        //    reloads with its hinge side reset and no error (the L-1057 shape).
        //    `buildDoorObject` already spreads the defaults at BUILD time, which is
        //    exactly why the gap was invisible: the door LOOKED right and was not stored.
        if (this.payload.hostedDoor !== undefined) {
            this.previousHostedDoor = panel.hostedDoor;
            this.touchedHostedDoor  = true;
            updates.hostedDoor = this.payload.hostedDoor === null
                ? undefined
                : { ...DEFAULT_HOSTED_DOOR, ...(panel.hostedDoor ?? {}), ...this.payload.hostedDoor };
        } else if (this.payload.newPanelType === 'SystemPanel_Door' && !panel.hostedDoor) {
            this.previousHostedDoor = panel.hostedDoor;
            this.touchedHostedDoor  = true;
            updates.hostedDoor = { ...DEFAULT_HOSTED_DOOR };
        }
        // The converse is deliberate and is NOT done: moving a cell AWAY from
        // `SystemPanel_Door` leaves `hostedDoor` in place, so an undo — or a change
        // of mind — restores the user's hinge side and swing rather than the
        // factory defaults. A stale sub-record on a non-door panel is inert
        // (`buildFlatPanel` never reads it) and `isAuthoredPanel` keeps it persisted.

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
            materialOverride: this.previousMaterialOverride,
            // §CW-2 — restored only if execute() actually changed it. See execute().
            ...(this.touchedOffset ? { offsetFromCentreline: this.previousOffset } : {}),
            ...(this.touchedHostedDoor ? { hostedDoor: this.previousHostedDoor } : {}),
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
