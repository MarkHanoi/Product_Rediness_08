/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    UpdateAllCurtainWallsCommand.ts
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md + §2026-03-14 audit):
 *   #2  Removed direct builder call — store.update() triggers subscriber in main.ts
 *   #7  Full per-element snapshot via store.get() (deep clone); undo restores via store.set()
 *   #11 CommandType corrected from UPDATE_CURTAIN_WALL to UPDATE_ALL_CURTAIN_WALLS
 *       (UPDATE_ALL_CURTAIN_WALLS added to CommandType enum in types.ts)
 *
 * Contract References:
 *   §01 §2.2  Full pre-mutation snapshot per element; store.get() returns a deep-cloned value
 *   §2.7      No direct builder call
 *   §3.5      store.update() emits storeEventBus → subscriber drives builder
 *
 * Impact Assessment:
 *   Other Commands:  None
 *   Builder Impact:  None
 *
 * Risk Level: Low
 */

import { Command, CommandType, CommandResult, CommandContext, CommandValidationResult, SerializedCommand } from '../types';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';

export class UpdateAllCurtainWallsCommand implements Command {
    readonly affectedStores = ["curtainWall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.UPDATE_ALL_CURTAIN_WALLS;
    readonly timestamp = Date.now();
    targetIds: string[] = [];

    private properties: Partial<Pick<CurtainWallData, 'gridXSpacing' | 'gridYSpacing' | 'panelThickness' | 'mullionSize' | 'mullionColor' | 'baseOffset' | 'height'>>;

    /** §01 §2.2: Full per-element snapshot — store.get() returns a deep-cloned CurtainWallData */
    private snapshots: Map<string, CurtainWallData> = new Map();

    constructor(
        properties: Partial<Pick<CurtainWallData, 'gridXSpacing' | 'gridYSpacing' | 'panelThickness' | 'mullionSize' | 'mullionColor' | 'baseOffset' | 'height'>>
    ) {
        this.properties = properties;
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.curtainWallStore) {
            return { ok: false, reason: 'CurtainWallStore not found' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.curtainWallStore;
        const allCWs = store.getAll();
        const affectedIds: string[] = [];
        this.snapshots.clear();
        this.targetIds = allCWs.map((cw: CurtainWallData) => cw.id);

        for (const cw of allCWs) {
            // §01 §2.2: Full snapshot before mutation — store.get() returns a deep clone
            const snapshot = store.get(cw.id);
            if (snapshot) {
                this.snapshots.set(cw.id, snapshot);
            }

            // §2.7: store.update() → storeEventBus → subscriber → builder.build()
            store.update(cw.id, { ...this.properties });
            affectedIds.push(cw.id);
        }

        return { success: true, affectedElementIds: affectedIds };
    }

    undo(context: CommandContext): CommandResult {
        const store = context.stores.curtainWallStore;
        const affectedIds: string[] = [];

        this.snapshots.forEach((snapshot, id) => {
            // §01 §2.2: Full state replacement — not partial update
            store.set(id, snapshot);
            affectedIds.push(id);
        });

        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        return {
            id: this.id,
            type: this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            payload: { properties: this.properties },
            version: 1
        } as any;
    }
}
