// ChangeFurnitureTypeCommand — §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105).
//
// Replaces a PLACED furniture element's `furnitureType` (its asset / builder)
// IN PLACE — preserving the element id, position, rotation, level, base offset,
// element mark, and IFC spatial containment. Optionally re-seeds the geometric
// dimensions + colour/material from the target type's catalogue defaults so the
// swapped piece reads at the right scale (a sofa → armchair should not keep the
// 3-seat footprint unless the caller explicitly passes it).
//
// This is the FURNITURE member of the uniform "change element type" contract
// (ADR-0105). Walls/doors/windows/slabs already have per-family type-swap
// commands (UpdateWallSystemTypeCommand, SetDoorType/SetWindowType,
// UpdateSlabLayers…); furniture had CREATE + UPDATE_PARAMETERS but NO way to
// change the TYPE of an existing element — this closes that gap.
//
// WHY the legacy CommandManager path (and not a plugin-bus produceCommand
// handler): the 3D furniture mesh is rebuilt by FurnitureFragmentBuilder, which
// subscribes to the `bim-furniture-updated` event emitted by
// FurnitureStore.update(). Only the legacy `ctx.stores.furnitureStore` IS that
// live geometry store — mirroring the proven UpdateFurnitureParametersCommand
// path guarantees the swap reaches the mesh for EXISTING placed elements
// (ADR-0105 §Root-cause). store.update() re-runs
// FurnitureFactory.getBuilder(newType) so the mesh is fully swapped; the id is
// unchanged so selection / hosting / the property panel stay bound.

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FurnitureData, FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import type { KitchenCabinetConfig } from '@pryzm/geometry-furniture';
import type { WardrobeCabinetConfig } from '@pryzm/geometry-furniture';

export interface ChangeFurnitureTypePayload {
    /** Id of the placed furniture element to re-type. */
    id: string;
    /** Target furniture type (its builder/asset). */
    newFurnitureType: FurnitureType;
    /** New subcategory tag; when omitted the store keeps the existing one. */
    newFurnitureCategory?: FurnitureData['furnitureCategory'];
    // ── Optional geometry re-seed (from the target type's catalogue defaults) ──
    // When provided, the swapped element takes the target type's canonical
    // footprint. When omitted, the element KEEPS its current dimensions so a
    // deliberate resize survives a type swap.
    newWidth?: number;
    newLength?: number;
    newHeight?: number;
    newBaseOffset?: number;
    newColor?: string;
    newMaterial?: FurnitureMaterial;
    // ── Optional config for parametric target types ──
    newKitchenConfig?: KitchenCabinetConfig;
    newWardrobeCabinetConfig?: WardrobeCabinetConfig;
    newWardrobeConfig?: any;
}

/**
 * Change the TYPE of a placed furniture element in place.
 *
 * Contract §01 §2.1 — routed through CommandManager, never furnitureStore.update()
 *   directly from UI.
 * Contract §01 §2.7 — no direct builder call; the rebuild is triggered by
 *   furnitureStore.update() → `bim-furniture-updated` → FurnitureFragmentBuilder.
 * ADR-0105 — the uniform change-type contract (furniture member).
 */
export class ChangeFurnitureTypeCommand implements Command {
    readonly affectedStores = ['furniture'] as const;
    readonly id: string;
    readonly type = CommandType.CHANGE_FURNITURE_TYPE;
    readonly timestamp: number;
    targetIds: string[];
    private oldData?: FurnitureData;

    constructor(private payload: ChangeFurnitureTypePayload) {
        this.id = `cmd-change-furniture-type-${crypto.randomUUID()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = (context.stores as any).furnitureStore;
        if (!store) return { ok: false, reason: 'furnitureStore not available' };
        const furniture = store.get(this.payload.id);
        if (!furniture) return { ok: false, reason: `Furniture not found: ${this.payload.id}` };
        if (typeof this.payload.newFurnitureType !== 'string' || this.payload.newFurnitureType.length === 0) {
            return { ok: false, reason: 'newFurnitureType must be a non-empty string' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = (context.stores as any).furnitureStore;
        const furniture: FurnitureData | undefined = store.get(this.payload.id);
        if (!furniture) throw new Error(`Furniture not found: ${this.payload.id}`);

        // §09 F-08 — snapshot for undo (no payload dumps).
        this.oldData = structuredClone(furniture);

        // Build the re-typed record. Everything that anchors the element in the
        // model — id, position, rotation, level*, mark, hostedSpaceId, properties —
        // is carried over verbatim so the swap is truly IN PLACE. Only the
        // furnitureType (+ optional re-seeded geometry / config) changes.
        const newData: FurnitureData = {
            ...furniture,
            furnitureType: this.payload.newFurnitureType,
            furnitureCategory: this.payload.newFurnitureCategory ?? furniture.furnitureCategory,
            width:  this.payload.newWidth  ?? furniture.width,
            length: this.payload.newLength ?? furniture.length,
            height: this.payload.newHeight ?? furniture.height,
            baseOffset: this.payload.newBaseOffset ?? furniture.baseOffset,
            color:    this.payload.newColor    ?? furniture.color,
            material: this.payload.newMaterial ?? furniture.material,
        };

        // Config swap: a target type may need its own parametric config and must
        // SHED a stale config that belongs to the previous type (e.g. sofa→kitchen
        // must not keep a wardrobeConfig). We set the config that matches the new
        // type and clear the ones that don't, so FurnitureFragmentBuilder routes to
        // the correct builder cleanly.
        const t = this.payload.newFurnitureType;
        const isKitchen  = t.startsWith('kitchen_');
        const isWardrobe = t === 'wardrobe' || t === 'wardrobe_glass_door' || t === 'corner_wardrobe';
        const isWardrobeCabinet = t.startsWith('wardrobe_') && !isWardrobe;

        newData.kitchenConfig         = isKitchen        ? (this.payload.newKitchenConfig         ?? furniture.kitchenConfig)         : undefined;
        newData.wardrobeCabinetConfig = isWardrobeCabinet ? (this.payload.newWardrobeCabinetConfig ?? furniture.wardrobeCabinetConfig) : undefined;
        newData.wardrobeConfig        = isWardrobe        ? (this.payload.newWardrobeConfig        ?? furniture.wardrobeConfig)        : undefined;
        // ai_element / glb_import configs belong to their own types only.
        if (t !== 'ai_element') newData.aiElementConfig = undefined;

        // §01 §2.7 — store.update() emits `bim-furniture-updated`; the fragment
        // builder rebuilds the mesh with FurnitureFactory.getBuilder(newType).
        store.update(this.payload.id, newData);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.oldData) return { success: false, affectedElementIds: [] };
        const store = (context.stores as any).furnitureStore;
        store.update(this.payload.id, this.oldData);
        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
