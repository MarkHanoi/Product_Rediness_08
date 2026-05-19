import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Point3D } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface CreateWallBetweenMarksInput {
    mark1: string;
    mark2: string;
    height: number;
    thickness: number;
    levelId?: string;
}

export class CreateWallBetweenMarksCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.CREATE_WALL; 
    readonly timestamp = Date.now();
    targetIds: string[] = [];

    // ✅ FIX C1: ID pre-generated in constructor (Contract §2.6).
    private readonly wallId: string;

    // ✅ FIX §2.4: Baseline captured as plain serializable objects on first execute.
    // On redo, source walls may have been modified, so re-computing midpoints would
    // produce a geometrically different wall — violating §2.4 (redo must reapply
    // identical semantic state). We capture once and reuse on every subsequent redo.
    private capturedBaseLine: [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number }
    ] | null = null;

    // ✅ FIX §2.4: levelId resolved once on first execute and reused on redo,
    // so the wall always ends up on the same level regardless of later store changes.
    private capturedLevelId: string | null = null;

    constructor(private input: CreateWallBetweenMarksInput) {
        this.wallId = crypto.randomUUID();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const wall1 = context.stores.wallStore.getAll().find(w => w.properties?.mark === this.input.mark1);
        const wall2 = context.stores.wallStore.getAll().find(w => w.properties?.mark === this.input.mark2);

        if (!wall1) return { ok: false, reason: `Wall with Mark ${this.input.mark1} not found` };
        if (!wall2) return { ok: false, reason: `Wall with Mark ${this.input.mark2} not found` };

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallId = this.wallId;

        // Guard against double-execute (redo idempotency)
        if (context.stores.wallStore.getById(wallId)) {
            return { success: true, affectedElementIds: [wallId] };
        }

        // ✅ FIX §2.4: Only compute midpoints on the FIRST execute.
        // On redo this.capturedBaseLine is already set — reuse the original geometry
        // so the wall is identical to what was created the first time, even if the
        // source walls have since been moved or resized.
        if (!this.capturedBaseLine) {
            const wall1 = context.stores.wallStore.getAll().find(w => w.properties?.mark === this.input.mark1);
            const wall2 = context.stores.wallStore.getAll().find(w => w.properties?.mark === this.input.mark2);

            if (!wall1 || !wall2) {
                console.error(`Walls not found for marks: ${this.input.mark1}, ${this.input.mark2}`);
                return { success: false, affectedElementIds: [], info: ["Walls not found"] };
            }

            // Phase B DTO migration: baseLine is [Point3D, Point3D] — use plain arithmetic.
            const mid1: Point3D = {
                x: (wall1.baseLine[0].x + wall1.baseLine[1].x) * 0.5,
                y: (wall1.baseLine[0].y + wall1.baseLine[1].y) * 0.5,
                z: (wall1.baseLine[0].z + wall1.baseLine[1].z) * 0.5,
            };
            const mid2: Point3D = {
                x: (wall2.baseLine[0].x + wall2.baseLine[1].x) * 0.5,
                y: (wall2.baseLine[0].y + wall2.baseLine[1].y) * 0.5,
                z: (wall2.baseLine[0].z + wall2.baseLine[1].z) * 0.5,
            };

            this.capturedBaseLine = [mid1, mid2];
            this.capturedLevelId = this.input.levelId || wall1.levelId;
        }

        const [mid1, mid2] = this.capturedBaseLine;
        const levelId = this.capturedLevelId!;

        const newWall = {
            id: wallId,
            type: 'wall' as const,
            // Phase B DTO migration: capturedBaseLine is already [Point3D, Point3D].
            baseLine: [mid1, mid2] as [Point3D, Point3D],
            height: this.input.height || 3.0,
            thickness: this.input.thickness || 0.2,
            levelId: levelId,
            baseOffset: 0,
            openings: [] as any[],
            childrenIds: [] as string[],
            properties: {
                mark: `W-CONN-${this.input.mark1}-${this.input.mark2}`
            }
        };

        // 1️⃣ Store first — triggers Store Event Bus → subscriber in EngineBootstrap.
        console.log("Creating new wall:", newWall);
        context.stores.wallStore.add(newWall);

        // 2️⃣ §5 ORDERING FIX: Spatial registration AFTER successful store mutation.
        try {
            context.bimManager.registerElement(wallId, levelId);
        } catch (e: any) {
            // Roll back store add if spatial registration fails
            context.stores.wallStore.remove(wallId);
            return { success: false, affectedElementIds: [], info: [e.message] };
        }

        // 3️⃣ §3.5 FIX: Type registration in command layer, not in store.
        elementRegistry.registerSemantic(wallId, 'wall');

        this.targetIds = [wallId];

        return { success: true, affectedElementIds: [wallId] };
    }

    undo(context: CommandContext): CommandResult {
        // ✅ FIX C1/M2: Use stable pre-generated wallId.
        // §WALL-AUDIT-2026-M11: Single wallStore.remove() — the previous code path
        // included a redundant rollback remove() in execute() (since refactored to a
        // try/catch over registerElement) AND a remove() here in undo(). With the
        // execute() rollback now scoped strictly to the registration failure branch,
        // undo() is the sole authoritative remove() call for the happy path.
        if (context.stores.wallStore.getById(this.wallId)) {
            context.bimManager.unregisterElement(this.wallId);
            elementRegistry.unregister(this.wallId);
            context.stores.wallStore.remove(this.wallId);
            return { success: true, affectedElementIds: [this.wallId] };
        }
        return { success: true, affectedElementIds: [] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.input,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
