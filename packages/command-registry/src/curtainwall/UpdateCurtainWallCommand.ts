/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    UpdateCurtainWallCommand.ts
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md):
 *   #2  Removed direct builder call — store mutation triggers subscriber in main.ts
 *   #7  Full snapshot via store.get() (which returns a deep clone from CurtainWallStore)
 *       Undo restores via store.set() for complete state replacement
 *   #9  Uses context.stores.curtainWallStore (injected), not window.curtainWallStore // TODO(TASK-08)
 *
 * Fix DW-03 (2026-03-31): Added spatial re-registration when levelId changes.
 *   When updates.levelId differs from snapshot.levelId:
 *     execute() → bimManager.unregisterElement(cwId) → bimManager.registerElement(cwId, newLevelId)
 *     undo()    → bimManager.unregisterElement(cwId) → bimManager.registerElement(cwId, oldLevelId)
 *   Contract references: §02 §1.2, §02 §5, §03-CURTAIN-WALL-COMMAND-PIPELINE-CONTRACT §7
 *
 * Contract References:
 *   §01 §2.2  Full pre-mutation snapshot required; store.get() returns a deep-cloned value
 *   §2.7      No direct builder call in command layer
 *   §3.5      Store is data-only; builder driven by storeEventBus subscriber
 *   §02 §1.2  Spatial registration must always reflect the element's current levelId
 *
 * Impact Assessment:
 *   Other Commands:  None
 *   Builder Impact:  None
 *
 * Risk Level: Low
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';

export interface UpdateCurtainWallInput {
    id: string;
    updates: Partial<CurtainWallData>;
}

export class UpdateCurtainWallCommand implements Command {
    readonly affectedStores = ["curtainWall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_CURTAIN_WALL;
    readonly timestamp = Date.now();
    readonly targetIds: string[];

    /** §01 §2.2: Full pre-mutation snapshot — deep clone returned by store.get() */
    private snapshot?: CurtainWallData;

    /**
     * §DW-03: Track whether the levelId changed during execute() so undo()
     * can reverse the spatial re-registration correctly.
     */
    private levelIdChanged = false;
    private previousLevelId = '';

    constructor(private input: UpdateCurtainWallInput) {
        this.targetIds = [input.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.input.id) return { ok: false, reason: 'Missing curtain wall ID' };

        // §Critical #9: Use injected store, not window global
        const store = context.stores.curtainWallStore;
        if (!store) return { ok: false, reason: 'CurtainWallStore not available' };

        if (!store.get(this.input.id)) {
            return { ok: false, reason: `Curtain wall '${this.input.id}' not found` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.curtainWallStore;

        // §01 §2.2: Capture full pre-mutation snapshot before any write.
        // store.get() returns a deep clone (Vector3 copied) — safe as snapshot.
        const before = store.get(this.input.id);
        if (!before) return { success: false, affectedElementIds: [], info: ['Curtain wall not found'] };

        this.snapshot = before;

        // §DW-03 FIX: Detect levelId change BEFORE the store mutation.
        const newLevelId = this.input.updates.levelId;
        this.levelIdChanged = !!(newLevelId && newLevelId !== this.snapshot.levelId);
        this.previousLevelId = this.snapshot.levelId;

        // §2.7: store.update() emits storeEventBus → subscriber in main.ts drives builder
        store.update(this.input.id, this.input.updates);

        // §DW-03 FIX: Re-register spatial position when levelId changes.
        // bimManager.unregisterElement removes the wall from the old level index.
        // bimManager.registerElement adds it to the new level index.
        if (this.levelIdChanged && newLevelId) {
            try {
                context.bimManager.unregisterElement(this.input.id);
                context.bimManager.registerElement(this.input.id, newLevelId);
                console.log(`[UpdateCurtainWallCommand] §DW-03: Spatial re-registered '${this.input.id}' from level '${this.previousLevelId}' → '${newLevelId}'`);
            } catch (err) {
                console.error('[UpdateCurtainWallCommand] §DW-03: Spatial re-registration failed:', err);
            }
        }

        return { success: true, affectedElementIds: [this.input.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.snapshot) return { success: true, affectedElementIds: [] };

        // §01 §2.2: Full state replacement via set() — not partial update
        const store = context.stores.curtainWallStore;
        store.set(this.input.id, this.snapshot);

        // §DW-03 FIX: Reverse the spatial re-registration on undo.
        if (this.levelIdChanged && this.previousLevelId) {
            try {
                context.bimManager.unregisterElement(this.input.id);
                context.bimManager.registerElement(this.input.id, this.previousLevelId);
                console.log(`[UpdateCurtainWallCommand] §DW-03 undo: Spatial restored '${this.input.id}' to level '${this.previousLevelId}'`);
            } catch (err) {
                console.error('[UpdateCurtainWallCommand] §DW-03 undo: Spatial restore failed:', err);
            }
        }

        return { success: true, affectedElementIds: [this.input.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   this.input as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1
        };
    }
}
