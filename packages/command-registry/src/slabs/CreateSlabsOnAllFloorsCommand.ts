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

export class CreateSlabsOnAllFloorsCommand implements Command {
    readonly affectedStores = ["slab", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_SLABS_ON_ALL_FLOORS;
    readonly timestamp: number;
    // W9 FIX: Removed `readonly` — the array must be mutated during execute().
    // TypeScript `readonly` on an array only prevents reassignment of the reference,
    // not mutation via push(). Removing the modifier signals intent correctly.
    targetIds: string[] = [];
    private createdCommands: CreateSlabCommand[] = [];

    constructor(private referenceSlabId: string) {
        this.id = `cmd-slabs-floors-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const refSlab = context.stores.slabStore.getById(this.referenceSlabId);
        if (!refSlab) {
            return { ok: false, reason: `Reference slab ${this.referenceSlabId} not found.` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const refSlab = slabStore.getById(this.referenceSlabId);

        if (!refSlab) {
            return { success: false, affectedElementIds: [], info: [`Reference slab ${this.referenceSlabId} not found.`] };
        }

        const allLevels = context.bimManager.getLevels();

        const targetLevels = allLevels
            .filter(l => l.id !== refSlab.levelId)
            .sort((a, b) => a.elevation - b.elevation);

        const __t_cmd_start = performance.now();
        const __refVertices = (refSlab as any).polygon?.length ?? 0;
        console.log(`[CreateSlabsOnAllFloorsCommand] START referenceSlabId="${this.referenceSlabId}" levels=${targetLevels.length} polygonVertices=${__refVertices}`);

        if (targetLevels.length === 0) {
            return {
                success: true,
                affectedElementIds: [],
                info: [`No target levels found to replicate slab ${this.referenceSlabId}. Current Level: ${refSlab.levelId}, All Levels: ${allLevels.map(l => l.id).join(', ')}`]
            };
        }

        // P1.2: Extract the level loop as a closure so it can be passed to
        // batchCoordinator.runBatch(fn, opts) on first execute.
        //
        // runBatch() depth-counting flow (P1.1 + P1.2):
        //   beginBatch()           → storeEventBus depth: 0 → 1  (outer async bracket)
        //   storeEventBus.batch()  → storeEventBus depth: 1 → 2  (inner sync bracket)
        //   _processLevels() runs  → store mutations buffered at depth 2
        //   batch() returns        → storeEventBus depth: 2 → 1  (no flush — outer still open)
        //   … rAF registration drain …
        //   _executeFinalSweep()   → storeEventBus depth: 1 → 0  → FLUSH all events
        //   If _processLevels throws → buffer discarded (depth 2→1), runBatch catch
        //     calls endBatch() (depth 1→0, empty flush), resets _isBatching. Bus clean.
        //
        // On redo (createdCommands already populated → slabs already registered), the
        // loop runs directly without batch wrapping — individual events dispatch immediately.
        const affectedIds: string[] = [];

        const _processLevels = () => {
            for (const level of targetLevels) {
                const __t_slab_start = performance.now();
                // C1 FIX §01 §2.6: Pre-generate stable ID + IFC GUID here, not inside execute().
                // C2 FIX §2.6: ifcGuid pre-generated so IFC GUID is stable across redo.
                const payload = {
                    id: crypto.randomUUID(),
                    ifcGuid: crypto.randomUUID(),
                    width: refSlab.width,
                    depth: refSlab.depth,
                    thickness: refSlab.thickness,
                    position: {
                        x: refSlab.position.x,
                        y: 0,
                        z: refSlab.position.z
                    },
                    levelId: level.id,
                    polygon: refSlab.polygon ? refSlab.polygon.map(p => ({ x: p.x, y: p.y })) : undefined
                };

                // C10 NOTE: Child commands are orchestrated directly without going through
                // commandManager.execute(). This is an internal batch-orchestration pattern.
                // The parent command owns the child undo stack and is the single history entry.
                const cmd = new CreateSlabCommand(payload);
                const res = cmd.execute(context);
                console.log(`[CreateSlabsOnAllFloorsCommand] slab levelId="${level.id}" success=${res.success} elapsed=${(performance.now() - __t_slab_start).toFixed(1)}ms`);

                if (res.success && res.affectedElementIds.length) {
                    const createdId = res.affectedElementIds[0];
                    this.createdCommands.push(cmd);
                    affectedIds.push(createdId);
                }
            }
        };

        if (this.createdCommands.length === 0) {
            // First execute: wrap store mutations in runBatch() for safe, batched event delivery.
            // SlabFragmentBuilder defers triangulation to a rAF-sliced drain queue when
            // batchCoordinator.isBatching === true, keeping the main thread responsive.
            console.log(`[CreateSlabsOnAllFloorsCommand] runBatch starting — ${targetLevels.length} slab(s) deferred to rAF drain.`);
            batchCoordinator.runBatch(_processLevels, {
                levelIds: targetLevels.map(l => l.id),
                totalElementCount: targetLevels.length,
                // BN-06: Slab materials are pre-specified MeshStandardMaterial with explicit
                // metalness/roughness (verified in SlabFragmentBuilder — all three material
                // paths set these values directly). The PBR upgrade pass traverses the ENTIRE
                // scene (15,037+ meshes in a 21-slab / 315-wall project) via requestIdleCallback
                // in 126 chunks. This traversal runs concurrently with the subsequent CW batch's
                // PSO first-render window, compounding the LONGTASK and causing BN-07 starvation
                // (10s delay on second batch's DEFERRED-RESUME-FLUSH). Skipping it eliminates
                // both the 126-chunk PBR storm and BN-07 as a side effect. No visual regression:
                // slab materials are PBR-ready by construction.
                skipPbrUpgrade: true,
                // §FIX-MOBILE-SLAB-HANG: Slabs are horizontal elements (floor/ceiling decks)
                // and do NOT define room boundaries. Room boundaries are derived exclusively
                // from vertical wall topology via PlanarTopologyEngine. Keeping this false
                // causes PlanarTopologyEngine to run synchronously (via microtask) for every
                // affected level immediately post-batch, blocking the main thread for 1–3 s per
                // level on mobile CPUs (10 levels = 10–30 s total). The overlay dismiss is
                // scheduled in the same post-render slot and cannot fire until all room
                // detections complete, producing the "Building 10 elements… stuck" symptom on
                // Android Chrome. Room topology remains correct: wall edits and project reloads
                // both trigger REDETECT_ROOMS independently; slab creation does not alter wall
                // geometry.
                skipRedetectRooms: true,
            });
        } else {
            // Redo: slabs already registered; run loop directly without batch wrapping.
            _processLevels();
        }

        this.targetIds.push(...affectedIds);

        console.log(`[CreateSlabsOnAllFloorsCommand] COMPLETE created=${affectedIds.length} total=${(performance.now() - __t_cmd_start).toFixed(1)}ms`);
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Generated ${affectedIds.length} slabs on other floors similar to ${this.referenceSlabId}.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const affectedIds: string[] = [];

        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const cmd = this.createdCommands[i];
            const res = cmd.undo(context);
            if (res.success) {
                affectedIds.push(...res.affectedElementIds);
            }
        }

        return {
            success: true,
            affectedElementIds: affectedIds
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { referenceSlabId: this.referenceSlabId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
