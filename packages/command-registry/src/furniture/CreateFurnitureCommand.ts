import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FurnitureData, FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import type { KitchenCabinetConfig } from '@pryzm/geometry-furniture';
import type { WardrobeCabinetConfig } from '@pryzm/geometry-furniture';
import { semanticGraphManager } from '@pryzm/core-app-model';

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

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        try {
            const id = this.payload.id || crypto.randomUUID();
            const level = context.bimManager.getLevelById(this.payload.levelId);
            if (!level) throw new Error(`Level not found: ${this.payload.levelId}`);

            context.bimManager.registerElement(id, this.payload.levelId);

            // §03 §1.7: every furniture instance gets an FU-FF-NNN element mark.
            const mark = this._generateMark(context);

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
                    y: level.elevation,
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
                baseOffset: this.payload.baseOffset !== undefined ? this.payload.baseOffset : 0.2,
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
                (context.stores as any).furnitureStore?.remove(childId);
            }

            // Remove parent
            context.bimManager.unregisterElement(this.createdId);
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