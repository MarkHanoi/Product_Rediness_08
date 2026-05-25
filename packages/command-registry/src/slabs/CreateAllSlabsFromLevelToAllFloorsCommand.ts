import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { CreateSlabCommand } from './CreateSlabCommand';
import { batchCoordinator } from '@pryzm/core-app-model';

export class CreateAllSlabsFromLevelToAllFloorsCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS;
    readonly timestamp: number;
    // W9 FIX: Removed `readonly` — the array must be mutated during execute().
    targetIds: string[] = [];
    private createdCommands: CreateSlabCommand[] = [];

    constructor(private sourceLevelId: string) {
        this.id = `cmd-all-slabs-floors-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const level = context.bimManager.getLevelById(this.sourceLevelId);
        if (!level) {
            return { ok: false, reason: `Source level ${this.sourceLevelId} not found.` };
        }
        const slabs = context.stores.slabStore.getAll().filter(s => s.levelId === this.sourceLevelId);
        if (slabs.length === 0) {
            return { ok: false, reason: `No slabs found on level ${this.sourceLevelId}.` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const sourceSlabs = slabStore.getAll().filter(s => s.levelId === this.sourceLevelId);
        const allLevels = context.bimManager.getLevels();

        const targetLevels = allLevels
            .filter(l => l.id !== this.sourceLevelId)
            .sort((a, b) => a.elevation - b.elevation);

        if (targetLevels.length === 0) {
            return {
                success: true,
                affectedElementIds: [],
                info: [`No target levels found to replicate slabs from ${this.sourceLevelId}.`]
            };
        }

        const affectedIds: string[] = [];

        // §BATCH-PERF (OI-batch-audit, 2026-05-25) — two fixes mirroring the proven
        // sibling CreateSlabsOnAllFloorsCommand:
        //
        //   (1) De-O(N²) the duplicate check. The original called
        //       `slabStore.getAll().filter(levelId)` INSIDE the inner (level × sourceSlab)
        //       loop and re-scanned the WHOLE (growing) slab store each iteration —
        //       O(L × S × totalSlabs). Hoist one scan PER LEVEL into
        //       `existingByLevel`, and append created slabs to that per-level bucket so
        //       intra-run duplicates are still caught (exact original tolerance semantics).
        //
        //   (2) Wrap the mutation loop in `batchCoordinator.runBatch(...)` (first execute
        //       only) so the N slab `store.add()`s coalesce into ONE builder drain + ONE
        //       buffered event flush instead of N immediate rebuilds. Same options the
        //       sibling uses for slabs (skipPbrUpgrade / skipRedetectRooms — slabs are
        //       horizontal decks that don't define room boundaries).
        const _isDup = (existing: ReadonlyArray<{ position: { x: number; z: number }; width: number; depth: number }>, ref: { position: { x: number; z: number }; width: number; depth: number }): boolean =>
            existing.some(s =>
                Math.abs(s.position.x - ref.position.x) < 0.01 &&
                Math.abs(s.position.z - ref.position.z) < 0.01 &&
                Math.abs(s.width - ref.width) < 0.01 &&
                Math.abs(s.depth - ref.depth) < 0.01,
            );

        const _processLevels = (): void => {
            // One scan per target level (not per level × sourceSlab).
            const existingByLevel = new Map<string, Array<{ position: { x: number; z: number }; width: number; depth: number }>>();
            for (const level of targetLevels) {
                existingByLevel.set(level.id, slabStore.getAll().filter(s => s.levelId === level.id));
            }

            for (const level of targetLevels) {
                const existing = existingByLevel.get(level.id)!;
                for (const refSlab of sourceSlabs) {
                    if (_isDup(existing, refSlab)) continue;

                    // C1 FIX §01 §2.6: Pre-generate stable ID + IFC GUID here, not inside execute().
                    // C2 FIX §2.6: ifcGuid pre-generated so IFC GUID is stable across redo.
                    const payload = {
                        id: crypto.randomUUID(),
                        ifcGuid: crypto.randomUUID(),
                        width: refSlab.width,
                        depth: refSlab.depth,
                        thickness: refSlab.thickness,
                        position: { x: refSlab.position.x, y: 0, z: refSlab.position.z },
                        levelId: level.id,
                        polygon: refSlab.polygon ? refSlab.polygon.map(p => ({ x: p.x, y: p.y })) : undefined,
                    };

                    // C10 NOTE: Child commands are orchestrated directly without going through
                    // commandManager.execute(). This is an internal batch-orchestration pattern.
                    const cmd = new CreateSlabCommand(payload);
                    const res = cmd.execute(context);

                    if (res.success && res.affectedElementIds.length) {
                        this.createdCommands.push(cmd);
                        affectedIds.push(...res.affectedElementIds);
                        // Track the just-created slab so a later sourceSlab at the same
                        // position on this level is still treated as a duplicate (matches
                        // the original per-iteration getAll() re-scan behaviour).
                        existing.push({ position: { x: payload.position.x, z: payload.position.z }, width: payload.width, depth: payload.depth });
                    }
                }
            }
        };

        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(_processLevels, {
                levelIds: targetLevels.map(l => l.id),
                totalElementCount: targetLevels.length * sourceSlabs.length,
                skipPbrUpgrade: true,
                skipRedetectRooms: true,
            });
        } else {
            // Redo: run the loop directly (mirrors CreateSlabsOnAllFloorsCommand).
            _processLevels();
        }

        this.targetIds.push(...affectedIds);

        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Replicated ${sourceSlabs.length} slabs to ${targetLevels.length} floors. Total created: ${affectedIds.length}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const affectedIds: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const res = this.createdCommands[i].undo(context);
            if (res.success) {
                affectedIds.push(...res.affectedElementIds);
            }
        }
        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { sourceLevelId: this.sourceLevelId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
