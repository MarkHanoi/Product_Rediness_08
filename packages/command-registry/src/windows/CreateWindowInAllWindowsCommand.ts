import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';

/**
 * Creates a window in every wall segment, centered by the CENTER convention
 * (offset = distance from baseLine[0] to CENTRE of opening = wallLength / 2).
 *
 * DW-02 FIX: The redundant CenterWindowInWallCommand sub-call has been removed.
 * CreateWallOpeningCommand already places each window at centreOffset = wallLength / 2
 * which is the correct CENTER-convention offset. Re-applying CenterWindowInWallCommand
 * was causing a double-write and (prior to DW-01 fix) offset corruption.
 */
export class CreateWindowInAllWindowsCommand implements Command {
    readonly affectedStores = ["window", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.ADD_OPENING;
    timestamp: number = Date.now();
    targetIds: string[] = [];
    /**
     * §WINDOW-AUDIT-2026 C1 (WIN-BATCH-REDO) — sub-commands are constructed lazily on
     * the FIRST execute() and then cached for the lifetime of this batch command.
     * Subsequent execute() invocations (redo after undo) reuse the cached sub-commands
     * so the pre-generated openingId / openingElementId stay stable across the entire
     * undo/redo cycle. Annotations, schedules, IFC GUIDs and remote-replay all see the
     * same window IDs forever, which is the §01 §2.6 deterministic-replay requirement.
     */
    private subCommands: CreateWallOpeningCommand[] | null = null;
    private processedWallIds: string[] = [];

    constructor() {}

    canExecute(context: CommandContext): CommandValidationResult {
        const walls = context.stores.wallStore.getAll();
        if (!walls || walls.length === 0) return { ok: false, reason: 'No walls found in the project' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §WINDOW-AUDIT-2026 C1: build sub-commands once; reuse on every redo.
        if (this.subCommands === null) {
            this.subCommands = [];
            this.processedWallIds = [];
            const walls = context.stores.wallStore.getAll();
            for (const wall of walls) {
                const start = wall.baseLine[0];
                const end   = wall.baseLine[1];
                const wallLength = new THREE.Vector3().subVectors(end, start).length();
                const windowWidth = 1.2;

                // Skip walls that are too short to accommodate the window.
                if (wallLength < windowWidth + 0.1) continue;

                // CENTER convention: offset = distance from baseLine[0] to CENTRE of opening.
                const centreOffset = wallLength / 2;

                this.subCommands.push(new CreateWallOpeningCommand({
                    wallId: wall.id,
                    openingData: {
                        type: 'window',
                        windowType: 'single',
                        width: windowWidth,
                        height: 1.2,
                        offset: centreOffset,
                        sillHeight: 1.0,
                    },
                }));
                this.processedWallIds.push(wall.id);
            }
        }

        const affectedIds: string[] = [];
        for (const cmd of this.subCommands) {
            const result = cmd.execute(context);
            if (result.success && result.affectedElementIds.length > 0) {
                affectedIds.push(...result.affectedElementIds);
            }
        }

        this.targetIds = affectedIds;
        return { success: affectedIds.length > 0, affectedElementIds: affectedIds };
    }

    undo(context: CommandContext): CommandResult {
        const affectedIds: string[] = [];
        if (!this.subCommands) return { success: true, affectedElementIds: [] };
        for (let i = this.subCommands.length - 1; i >= 0; i--) {
            const result = this.subCommands[i].undo(context);
            affectedIds.push(...result.affectedElementIds);
        }
        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        // §WINDOW-AUDIT-2026 W8 (WIN-BATCH-SERIALISE) — emit child window IDs so
        // remote replay can reconstruct the exact same opening identities (no
        // ID drift across collaborating sessions).
        const childOpeningIds = this.subCommands?.map(c => (c as any).openingElementId) ?? [];
        return {
            type: this.type,
            payload: {
                wallIds: this.processedWallIds,
                childOpeningIds,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 2,
        };
    }
}
