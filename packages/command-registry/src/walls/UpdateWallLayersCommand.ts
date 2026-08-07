import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { serializeWallSnapshot, deserializeWallSnapshot } from './wallSnapshotUtils';

export interface WallLayer {
    name: string;
    function: string;
    thickness: number;
    materialColor?: string;
}

export interface UpdateWallLayersInput {
    wallId: string;
    layers: WallLayer[];
    thickness: number;
    /**
     * ⚠ CORRECTED 2026-08-06 (§FIX-WALL-LAYER-EDIT-DETACHED-STORE). The paragraph that
     * previously stood here described wall layers as TYPE-owned — "saving a new layer stack
     * also updates the type definition and propagates the change to ALL walls sharing that
     * type". **That is not the model this codebase implements**, and this doc-block was the
     * only artefact asserting it. Three subsystems say the opposite, in code:
     *
     *   • `WallTypes.ts:254-259` — systemTypeId is heritage metadata, "NOT used for geometry".
     *   • `CreateWallCommand.ts:179-190` — layers are `structuredClone`d and frozen onto the
     *     INSTANCE at creation; the wall never re-reads the type.
     *   • `UpdateSlabLayersCommand.ts:21-22` — the slab equivalent, and the working precedent,
     *     states outright that the instance stack is "immune to future type edits".
     *
     * Layers are INSTANCE-owned. An outlier comment is how the next person re-derives the
     * wrong model, so it is corrected here rather than left to be discovered again.
     *
     * ⚠ NOTE THE FALL-THROUGH BELOW: `execute()` computes
     * `typeId = input.systemTypeId ?? wall.systemTypeId ?? null`, so passing `null` does NOT
     * suppress propagation for a wall that carries a type — it falls through to the wall's own
     * systemTypeId and propagates anyway. There is no "instance-only" value of this field.
     * That is why the property-panel LAYERS editor does not route here at all; it dispatches
     * `element.changeType` → `UpdateWallSystemTypeCommand`, which is instance-scoped by
     * construction (no typeStore write, no sibling sweep).
     *
     * The propagation branch is retained for the TYPE-SWAP caller
     * (`plugins/wall/src/handlers/UpdateWallSystemType.ts`), where re-stamping siblings from a
     * changed type definition IS the intended operation. It is not the layer-edit path.
     */
    systemTypeId?: string | null;
}

/**
 * UpdateWallLayersCommand
 *
 * Persists an edited layer stack to a wall (and optionally to its WallSystemType
 * plus all sibling walls sharing the same type) and triggers geometry rebuild.
 *
 * §03-WALL-THICKNESS-CONTRACT §1:
 *   Wall thickness is DERIVED from the layer stack. The thickness field on WallData
 *   must always equal sum(layers[i].thickness). It is therefore not directly editable
 *   in the property panel; it updates automatically when layers change.
 *
 * §03-WALL-THICKNESS-CONTRACT §2 (Type propagation) — SCOPE CORRECTED 2026-08-06:
 *   This command's propagation branch belongs to the TYPE-SWAP operation, not to layer
 *   editing. Wall layers are INSTANCE-owned (see the note on `systemTypeId` above for the
 *   three code sites that establish it). The property-panel LAYERS editor deliberately does
 *   NOT route here — it dispatches `element.changeType` → `UpdateWallSystemTypeCommand`,
 *   which writes exactly one wall.
 *
 * Contract §01 §2.1 — Must go through CommandManager, never wallStore.update() directly.
 * Contract §01 §2.7 — No direct builder calls; rebuild triggered via
 *   wallStore.updateWall() → emit('update') → subscriber → wallFragmentBuilder.updateWall().
 */
export class UpdateWallLayersCommand implements Command {
    readonly affectedStores = ["wall"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALL_LAYERS;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;
    /** Snapshots of ALL sibling walls that were also updated (type propagation). */
    private prevSiblingSnapshots: any[] = [];
    /** Previous type definition, if a WallSystemType was updated. */
    private prevTypeSnapshot: any = null;

    constructor(private input: UpdateWallLayersInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
        if (!this.input.layers || this.input.layers.length === 0) {
            return { ok: false, reason: 'Layer stack must contain at least one layer' };
        }
        if (this.input.thickness <= 0) {
            return { ok: false, reason: 'Total thickness must be positive' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeWallSnapshot(wall);
        this.prevSiblingSnapshots = [];
        this.prevTypeSnapshot = null;

        const frozenLayers = this.input.layers.map(l => Object.freeze({ ...l }));
        const affectedIds: string[] = [this.input.wallId];

        // §03-WALL-THICKNESS-CONTRACT §2: If this wall belongs to a named type,
        // update the type definition and propagate to all walls sharing it.
        const typeId = this.input.systemTypeId ?? wall.systemTypeId ?? null;
        if (typeId) {
            const typeStore = ctx.stores.wallSystemTypeStore;
            if (typeStore) {
                const existingType = typeStore.getById(typeId);
                if (existingType) {
                    // Snapshot for undo
                    this.prevTypeSnapshot = { id: typeId, layers: existingType.layers, totalThickness: existingType.totalThickness };

                    // Update the WallSystemType definition
                    typeStore.update(typeId, { layers: frozenLayers as any });

                    // Propagate to ALL walls using this type (except the primary wall — handled below)
                    const allWalls = ctx.stores.wallStore.getAll();
                    for (const sibling of allWalls) {
                        if (sibling.id === this.input.wallId) continue;
                        if (sibling.systemTypeId !== typeId) continue;

                        this.prevSiblingSnapshots.push(serializeWallSnapshot(sibling));

                        const siblingNext: any = {
                            ...serializeWallSnapshot(sibling),
                            layers: frozenLayers,
                            thickness: this.input.thickness,
                        };
                        ctx.stores.wallStore.updateWall(siblingNext);
                        affectedIds.push(sibling.id);
                    }
                }
            }
        }

        // Update the primary wall instance
        const nextState: any = {
            ...serializeWallSnapshot(wall),
            layers: frozenLayers,
            thickness: this.input.thickness,
        };
        if (typeId !== undefined) {
            nextState.systemTypeId = typeId;
        }

        ctx.stores.wallStore.updateWall(nextState);
        return { success: true, affectedElementIds: affectedIds };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        const affectedIds: string[] = [this.input.wallId];

        // Restore sibling walls first
        for (const snap of this.prevSiblingSnapshots) {
            const restored = deserializeWallSnapshot(snap);
            ctx.stores.wallStore.updateWall(restored);
            affectedIds.push(snap.id);
        }

        // Restore the WallSystemType definition if it was changed
        if (this.prevTypeSnapshot && ctx.stores.wallSystemTypeStore) {
            ctx.stores.wallSystemTypeStore.update(this.prevTypeSnapshot.id, {
                layers: this.prevTypeSnapshot.layers,
            });
        }

        // Restore primary wall
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
        return { success: true, affectedElementIds: affectedIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input
        };
    }
}
