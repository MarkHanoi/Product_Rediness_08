import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { stableCreatedId } from '../StableCreatedId';
import { FurnitureData, FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import type { KitchenCabinetConfig } from '@pryzm/geometry-furniture';
import type { WardrobeCabinetConfig } from '@pryzm/geometry-furniture';
// §WARD118 — THE height authority for wardrobe cabinets (C84 EI-9: one answer).
import { validateWardrobeCabinetHeight } from '@pryzm/geometry-furniture';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
// §FIX-INTERIOR-FFL-SEATING — the ONE finished-floor seating chokepoint (C11 §5.4).
import { resolveFloorSeatingDatum } from '../seating/SeatingDatumResolver';

export interface CreateFurniturePayload {
    id?: string;
    furnitureType: FurnitureType;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; order?: string };
    levelId: string;
    baseOffset: number;
    width: number;
    length: number;
    height: number;
    widthBranchTwo?: number;
    lengthBranchTwo?: number;
    widthMain?: number;
    lengthSide?: number;
    seatDepthMain?: number;
    seatDepthSide?: number;
    material: FurnitureMaterial;
    /** ⭐ C100 §2.1 / L-1460 — the MASTER catalogue id. `material` above is the
     *  legacy four-value construction hint, not a material reference. */
    materialId?: string;
    color?: string;
    hasHeadboard?: boolean;
    lo3?: number;
    startPoint?: { x: number; y: number; z: number };
    cornerPoint?: { x: number; y: number; z: number };
    endPoint?: { x: number; y: number; z: number };
    metadata?: Record<string, any>;
    kitchenConfig?: KitchenCabinetConfig;
    wardrobeCabinetConfig?: WardrobeCabinetConfig;
    furnitureCategory?: FurnitureData['furnitureCategory'];

    wardrobeConfig?: any;
}

// Configuration for furniture-specific defaults
const FURNITURE_DEFAULTS = {
    dining_table: {
        chairsCount: 6,
        chairWidth: 0.45,
        chairLength: 0.45,
        chairHeight: 0.9,
        chairOffset: 0.4
    },
    wardrobe: {
        defaultLo3: 200
    }
} as const;

export class CreateFurnitureCommand implements Command {
    readonly affectedStores = ["furniture", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_FURNITURE;
    readonly timestamp: number;
    targetIds: string[];
    private createdId?: string;
    private createdChildrenIds: string[] = [];

    constructor(private payload: CreateFurniturePayload) {
        // §07 §3.4: prefer cryptographic randomness for command IDs.
        this.id = `cmd-furniture-${crypto.randomUUID()}`;
        this.timestamp = Date.now();
        this.targetIds = payload.id ? [payload.id] : [];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) {
            return { ok: false, reason: "Missing levelId" };
        }

        const level = context.bimManager.getLevelById(this.payload.levelId);
        if (!level) {
            return { ok: false, reason: `Level not found: ${this.payload.levelId}` };
        }

        // §WARD118 — a wardrobe cabinet is created at a height THE ONE authority
        // accepts, or not at all (C16 CA-18 / C74: refuse by name with both numbers,
        // never round). Same function, same verdict as the update path.
        if (this.payload.wardrobeCabinetConfig) {
            const verdict = validateWardrobeCabinetHeight(this.payload.wardrobeCabinetConfig.height);
            if (!verdict.ok) return { ok: false, reason: verdict.code, blockingIssues: [verdict.reason] };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        try {
            // §STABLE-CREATED-ID (C03 §2.6) — without a payload id this minted a NEW
            // furniture id on every call, so redo restored a different element than
            // undo removed. Memoised per command instance; a payload id still wins.
            const id = stableCreatedId(this, 'furniture', this.payload.id);
            const level = context.bimManager.getLevelById(this.payload.levelId);
            if (!level) throw new Error(`Level not found: ${this.payload.levelId}`);

            context.bimManager.registerElement(id, this.payload.levelId);

            // §FIX-CATCHUP-DUPLICATE-CREATE (L-18) — register the furniture id in the
            // ElementRegistry, exactly like every other Create* command (wall/slab/room/
            // stair/roof/floor/ceiling/column…). This id→storeType routing table is what
            // RemoteCommandDispatcher.isAlreadyAppliedCreate (§DUPLICATE-ROOMS-PERSIST)
            // consults to make collab catch-up replay IDEMPOTENT. Furniture was the lone
            // Create* family that registered ONLY in the BimKernel spatial map and NOT
            // here, so a replayed CREATE_FURNITURE on reconnect/open was never recognised
            // as already-applied → the "duplicate sofa underneath". Guarded so a redo /
            // double-apply cannot throw on an already-registered id.
            try { elementRegistry.registerSemantic(id, 'furniture'); } catch { /* already registered (redo/replay) */ }

            // §03 §1.7: every furniture instance gets an FU-FF-NNN element mark.
            const mark = this._generateMark(context);

            // §FIX-FURNITURE-FFL-DEFAULT (L-87) — furniture rests on the FINISHED
            // floor level (FFL = the applied floor finish's top face), not the bare
            // structural slab top (the level datum). Resolve the FFL offset from the
            // floor finishes covering this level at the item's plan position; 0 when
            // the level has no finish (bare slab → datum IS the FFL). The mount
            // offset (baseOffset) then STACKS on top of this FFL baseline downstream
            // in FurnitureFragmentBuilder (worldY = position.y + baseOffset).
            //
            // §FIX-INTERIOR-FFL-SEATING — this used to inline `resolveFflOffset` +
            // its own floorStore lookup. That private copy is exactly what let the
            // other six creation paths (AI element, AI wardrobe, plumbing, lighting,
            // the D-FLE furnish batch) stay broken while this one was "fixed": C11
            // §5.4's "convergence by coincidence". The arithmetic now lives at ONE
            // chokepoint, `resolveFloorSeatingDatum`, which every path calls.
            const seat = resolveFloorSeatingDatum(
                context,
                this.payload.levelId,
                { x: this.payload.position.x, z: this.payload.position.z },
            );

            const data: FurnitureData = {
                id,
                type: 'furniture',
                furnitureType: this.payload.furnitureType,
                // A.21.D15 (2026-06-06) — `position.y` is the storey FLOOR datum
                // (the level's elevation). The mount height lives in `baseOffset`
                // and is applied EXACTLY ONCE downstream by FurnitureFragmentBuilder
                // (`root.position.y = position.y + baseOffset`). Previously this
                // baked `+ baseOffset` into position.y AS WELL, so wall-mounted
                // items (mirror/tv/wall_unit/extractor/curtain) double-counted the
                // offset and floated at `floor + 2 × offset`. Floor items
                // (baseOffset 0) were unaffected — which is why only wall-mounted
                // fixtures floated. Anchoring to the floor keeps EVERY storey's
                // fixtures on that storey (level.elevation is per-level).
                position: {
                    x: this.payload.position.x,
                    // §FIX-FURNITURE-FFL-DEFAULT (L-87) — FFL, not slab top.
                    y: seat.y,
                    z: this.payload.position.z,
                },
                rotation: {
                    x: this.payload.rotation.x,
                    y: this.payload.rotation.y,
                    z: this.payload.rotation.z,
                },
                levelId: this.payload.levelId,
                levelName: level.name,
                levelElevation: level.elevation,
                // §FIX-FURNITURE-BASE-OFFSET (L-86) — mount offset defaults to 0
                // (floor-standing). It STACKS on the FFL baseline resolved above, so
                // a floor item sits exactly on the finished floor, never floating.
                baseOffset: this.payload.baseOffset !== undefined ? this.payload.baseOffset : 0,
                width: this.payload.width,
                length: this.payload.length,
                height: this.payload.height,
                widthBranchTwo: this.payload.widthBranchTwo,
                lengthBranchTwo: this.payload.lengthBranchTwo,
                widthMain: this.payload.widthMain,
                lengthSide: this.payload.lengthSide,
                seatDepthMain: this.payload.seatDepthMain,
                seatDepthSide: this.payload.seatDepthSide,
                material: this.payload.material,
                // ⭐ C100 §2.1 / L-1460 — omitted when absent, so "names no material"
                // and "names a material that resolves to nothing" stay different
                // states on the record (C100 §5).
                ...(this.payload.materialId ? { materialId: this.payload.materialId } : {}),
                color: this.payload.color,
                hasHeadboard: this.payload.hasHeadboard,
                lo3: this.getLo3Value(),
                startPoint: this.payload.startPoint ? { x: this.payload.startPoint.x, y: this.payload.startPoint.y, z: this.payload.startPoint.z } : undefined,
                cornerPoint: this.payload.cornerPoint ? { x: this.payload.cornerPoint.x, y: this.payload.cornerPoint.y, z: this.payload.cornerPoint.z } : undefined,
                endPoint: this.payload.endPoint ? { x: this.payload.endPoint.x, y: this.payload.endPoint.y, z: this.payload.endPoint.z } : undefined,
                mark,
                hostedSpaceId: typeof this.payload.metadata?.hostedSpaceId === 'string'
                    ? (this.payload.metadata.hostedSpaceId as string)
                    : undefined,
                properties: { ...(this.payload.metadata || {}), mark },
                kitchenConfig: this.payload.kitchenConfig,
                wardrobeCabinetConfig: this.payload.wardrobeCabinetConfig,
                furnitureCategory: this.payload.furnitureCategory,

                wardrobeConfig: this.payload.wardrobeConfig
            };

            if (!(context.stores as any).furnitureStore) {
                throw new Error("FurnitureStore not initialized in context");
            }

            (context.stores as any).furnitureStore.add(data);
            this.createdId = id;
            this.targetIds = [id];

            // §03 §2.1 — SemanticGraph: furniture sitsOn its level. Authoritative —
            // failures bubble up so callers see the partial-write rather than silently
            // proceeding with a half-registered element.
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: id,
                targetId: this.payload.levelId,
                createdBy: 'CreateFurnitureCommand',
                metadata: { addedBy: 'CreateFurnitureCommand', furnitureType: this.payload.furnitureType }
            });

            // §CONTAINS-FIRST-PARTY-WRITER (C71 §2.1 #7, §5.2 — the named Tier-2
            // gap) — SemanticGraph: the room CONTAINS this furniture.
            //
            // `contains` had NO first-party writer on any path. C71 §5.2 records
            // the consequence exactly: on a natively-authored project "this room
            // contains nothing" and "nobody ever wrote this edge" were the SAME
            // VALUE — this repository's signature defect, appearing in the graph.
            // The IFC escape hatch was illusory too: IfcImporter's `contains` arm
            // sits under an `adjacentTo|boundedBy` ternary and is unreachable.
            //
            // THE CONSUMERS ARE ALREADY LIVE AND TYPED, and were waiting on data,
            // not on wiring (C71 §2.5 — a writer needs a named first consumer):
            //   · `HierarchyTreePanel._appendFurnitureGroup` —
            //     `sg.getTargets(room.id, 'contains')`. Its Furniture group has
            //     NEVER rendered: first because it called `getEdgesFromNode`, a
            //     method that has never existed (C71 §0), and then — once that was
            //     fixed — for want of the edge this write finally produces.
            //   · `WorldModelAdapter` — `getTargets(room.id, 'contains')` feeds
            //     `containedIds` into the AI world model's per-room summary.
            //
            // SOURCE OF TRUTH: `hostedSpaceId`, the room id the D-FLE furnish
            // engine stamps on every placed item (`buildFurnishCommands`:
            // `metadata.hostedSpaceId = p.hostedSpaceId`) and both ProjectSerializers
            // persist. The edge MIRRORS that authoritative field and never guesses
            // one: an item with no `hostedSpaceId` (hand-placed, not yet resolved to
            // a room) writes NO edge, because inventing a containment the model does
            // not assert is the provenance-invented defect one layer over.
            //
            // Direction is room → element, per the union's own declaration
            // (`'contains' // room → furniture/equipment`) and both readers, which
            // ask `getTargets(room.id, …)`.
            //
            // NON-FATAL, deliberately, and this differs from the `sitsOn` write
            // above: `sitsOn` is load-bearing for the level-delete guard, whereas a
            // missing `contains` edge degrades a tree group and an AI summary. A
            // furniture create must not fail because a room-containment edge could
            // not be recorded.
            const hostedSpaceId = data.hostedSpaceId;
            if (hostedSpaceId) {
                try {
                    semanticGraphManager.addRelationship({
                        type: 'contains',
                        sourceId: hostedSpaceId,
                        targetId: id,
                        createdBy: 'CreateFurnitureCommand',
                        metadata: { addedBy: 'CreateFurnitureCommand', furnitureType: this.payload.furnitureType },
                    });
                } catch (err) {
                    console.warn('[CreateFurnitureCommand] `contains` edge write failed (non-fatal):', err instanceof Error ? err.message : String(err));
                }
            }

            // §01 §2.7 — Builders are wired to the bim-furniture-added event that
            // FurnitureStore.add() already dispatches. No direct builder call here.

            // Create associated furniture (chairs for dining tables, etc.)
            this.createAssociatedFurniture(context);

            return { 
                success: true, 
                affectedElementIds: [id, ...this.createdChildrenIds] 
            };
        } catch (error) {
            // §09 F-08: log only the message — never the full payload object.
            console.error('[CreateFurnitureCommand] execute failed:', error instanceof Error ? error.message : String(error));
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [] 
            };
        }
    }

    /**
     * Generate the FU-FF-NNN element mark required by §03 §1.7.
     * NNN is a 1-based zero-padded counter derived from how many furniture
     * elements already exist in the store at execute time.
     */
    private _generateMark(context: CommandContext): string {
        const fStore = (context.stores as any).furnitureStore;
        const all: any[] = typeof fStore?.getAll === 'function' ? fStore.getAll() : [];
        const next = all.length + 1;
        return `FU-FF-${String(next).padStart(3, '0')}`;
    }

    private getLo3Value(): number | undefined {
        if (this.payload.lo3) return this.payload.lo3;

        if (this.payload.furnitureType === 'wardrobe') {
            return FURNITURE_DEFAULTS.wardrobe.defaultLo3;
        }

        return undefined;
    }

    private createAssociatedFurniture(context: CommandContext): void {
        // Skip if this is an update to existing furniture
        if (this.payload.id) return;

        switch (this.payload.furnitureType) {
            case 'dining_table':
                this.createDiningChairs(context);
                break;
            // dining_table_marble_brass intentionally omitted —
            // its builder draws its own surrounding chairs.
        }
    }

    private createDiningChairs(context: CommandContext): void {
        const defaults = FURNITURE_DEFAULTS.dining_table;

        // 3 chairs on each side (along length)
        const spacing = this.payload.length / 4;

        for (let side = -1; side <= 1; side += 2) {
            for (let i = 1; i <= 3; i++) {
                const chairX = this.payload.position.x + (side * (this.payload.width / 2 + defaults.chairOffset));
                const chairZ = this.payload.position.z - (this.payload.length / 2) + (i * spacing);

                const chairRotY = side === -1 ? Math.PI / 2 : -Math.PI / 2;

                const chairCommand = new CreateFurnitureCommand({
                    furnitureType: 'dining_chair',
                    position: { 
                        x: chairX, 
                        y: this.payload.position.y, 
                        z: chairZ 
                    },
                    rotation: { 
                        x: 0, 
                        y: chairRotY, 
                        z: 0 
                    },
                    levelId: this.payload.levelId,
                    baseOffset: this.payload.baseOffset,
                    width: defaults.chairWidth,
                    length: defaults.chairLength,
                    height: defaults.chairHeight,
                    material: this.payload.material,
                    ...(this.payload.materialId ? { materialId: this.payload.materialId } : {}),
                    color: this.payload.color,
                    metadata: {
                        parentFurnitureId: this.createdId,
                        parentType: 'dining_table'
                    }
                });

                const result = chairCommand.execute(context);
                if (result.success && result.affectedElementIds[0]) {
                    this.createdChildrenIds.push(result.affectedElementIds[0]);
                }
            }
        }
    }

    undo(context: CommandContext): CommandResult {
        try {
            if (!this.createdId) {
                return { success: false, affectedElementIds: [] };
            }

            // Remove children first — store.remove() dispatches bim-furniture-removed
            // and the builder is wired to that event (§01 §2.7).
            for (const childId of this.createdChildrenIds) {
                context.bimManager.unregisterElement(childId);
                // §FIX-CATCHUP-DUPLICATE-CREATE — mirror the execute()-time
                // ElementRegistry registration so an undone furniture create can be
                // legitimately re-applied (redo / genuine remote re-create) instead of
                // being wrongly skipped by isAlreadyAppliedCreate as "already applied".
                elementRegistry.unregister(childId);
                (context.stores as any).furnitureStore?.remove(childId);
            }

            // Remove parent
            context.bimManager.unregisterElement(this.createdId);
            elementRegistry.unregister(this.createdId); // §FIX-CATCHUP-DUPLICATE-CREATE
            try {
                semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
            } catch (err) {
                console.warn('[CreateFurnitureCommand.undo] SemanticGraph cleanup failed (non-fatal):', err instanceof Error ? err.message : String(err));
            }
            (context.stores as any).furnitureStore?.remove(this.createdId);

            return { 
                success: true, 
                affectedElementIds: [this.createdId, ...this.createdChildrenIds] 
            };
        } catch (error) {
            console.error('[CreateFurnitureCommand.undo] failed:', error instanceof Error ? error.message : String(error));
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [] 
            };
        }
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                ...this.payload,
                // Ensure Vector3 objects are serialized properly
                position: { ...this.payload.position },
                rotation: { ...this.payload.rotation },
                startPoint: this.payload.startPoint ? { ...this.payload.startPoint } : undefined,
                cornerPoint: this.payload.cornerPoint ? { ...this.payload.cornerPoint } : undefined,
                endPoint: this.payload.endPoint ? { ...this.payload.endPoint } : undefined
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }

    // Optional: Method to update payload (useful for command modifications)
    updatePayload(updates: Partial<CreateFurniturePayload>): void {
        this.payload = { ...this.payload, ...updates };
    }

    // Optional: Get created furniture ID (useful for command chaining)
    getCreatedId(): string | undefined {
        return this.createdId;
    }

    // Optional: Get child furniture IDs
    getChildIds(): string[] {
        return [...this.createdChildrenIds];
    }
}