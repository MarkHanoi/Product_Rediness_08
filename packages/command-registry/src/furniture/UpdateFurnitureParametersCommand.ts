import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FurnitureData, FurnitureMaterial } from '@pryzm/geometry-furniture';
import { KitchenCabinetConfig } from '@pryzm/geometry-furniture';
import { WardrobeCabinetConfig } from '@pryzm/geometry-furniture';
import * as THREE from '@pryzm/renderer-three/three';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface UpdateFurnitureParametersPayload {
    id: string;
    width?: number;
    length?: number;
    height?: number;
    widthMain?: number;
    lengthSide?: number;
    seatDepthMain?: number;
    seatDepthSide?: number;
    baseOffset?: number;
    color?: string;
    material?: FurnitureMaterial;
    lo3?: number;
    widthBranchTwo?: number;
    lengthBranchTwo?: number;
    cornerBehavior?: any;
    wardrobeConfig?: any;
    kitchenConfig?: KitchenCabinetConfig;
    wardrobeCabinetConfig?: WardrobeCabinetConfig;
    position?: { x: number, y: number, z: number };
    rotation?: { x: number, y: number, z: number, order?: THREE.EulerOrder };
    showDoors?: boolean;
    showDebug?: boolean;
}

export class UpdateFurnitureParametersCommand implements Command {
    readonly affectedStores = ["furniture"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_FURNITURE_PARAMETERS;
    readonly timestamp: number;
    targetIds: string[];
    private oldData?: FurnitureData;

    constructor(private payload: UpdateFurnitureParametersPayload) {
        // §07 §3.4 — prefer cryptographic randomness for command IDs.
        this.id = `cmd-update-furniture-${crypto.randomUUID()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const furniture = (context.stores as any).furnitureStore.get(this.payload.id);
        if (!furniture) return { ok: false, reason: "Furniture not found" };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = (context.stores as any).furnitureStore;
        const furniture = store.get(this.payload.id);
        if (!furniture) throw new Error("Furniture not found");

        // §09 F-08: no payload/object dumps in execute — use error/info messages only.
        this.oldData = structuredClone(furniture);

        const newData: FurnitureData = {
            ...furniture,
            width: this.payload.width ?? furniture.width,
            length: this.payload.length ?? furniture.length,
            height: this.payload.height ?? furniture.height,
            widthMain: this.payload.widthMain ?? furniture.widthMain,
            lengthSide: this.payload.lengthSide ?? furniture.lengthSide,
            seatDepthMain: this.payload.seatDepthMain ?? furniture.seatDepthMain,
            seatDepthSide: this.payload.seatDepthSide ?? furniture.seatDepthSide,
            baseOffset: this.payload.baseOffset ?? furniture.baseOffset,
            color: this.payload.color ?? furniture.color,
            material: this.payload.material ?? furniture.material,
            lo3: this.payload.lo3 ?? furniture.lo3,
            widthBranchTwo: this.payload.widthBranchTwo ?? furniture.widthBranchTwo,
            lengthBranchTwo: this.payload.lengthBranchTwo ?? furniture.lengthBranchTwo,
            wardrobeConfig: this.payload.wardrobeConfig ?? furniture.wardrobeConfig,
            kitchenConfig: this.payload.kitchenConfig ?? furniture.kitchenConfig,
            wardrobeCabinetConfig: this.payload.wardrobeCabinetConfig ?? furniture.wardrobeCabinetConfig,
            position: this.payload.position ? 
                new THREE.Vector3(this.payload.position.x, this.payload.position.y, this.payload.position.z) :
                (furniture.position ? new THREE.Vector3(
                    typeof furniture.position.x === 'number' ? furniture.position.x : (furniture.position._x ?? 0),
                    typeof furniture.position.y === 'number' ? furniture.position.y : (furniture.position._y ?? 0),
                    typeof furniture.position.z === 'number' ? furniture.position.z : (furniture.position._z ?? 0)
                ) : new THREE.Vector3()),
            rotation: this.payload.rotation ?
                new THREE.Euler(this.payload.rotation.x, this.payload.rotation.y, this.payload.rotation.z, this.payload.rotation.order || 'XYZ') :
                (furniture.rotation ? new THREE.Euler(
                    typeof furniture.rotation.x === 'number' ? furniture.rotation.x : (furniture.rotation._x ?? 0),
                    typeof furniture.rotation.y === 'number' ? furniture.rotation.y : (furniture.rotation._y ?? 0),
                    typeof furniture.rotation.z === 'number' ? furniture.rotation.z : (furniture.rotation._z ?? 0),
                    furniture.rotation.order || furniture.rotation._order || 'XYZ'
                ) : undefined)
        };

        // ✅ Sync kitchen geometry when PropertyInspector edits top-level width/length/height
        // The kitchen engine reads from kitchenConfig.length/depth/height so we must update those too
        if (furniture.kitchenConfig && !this.payload.kitchenConfig &&
            (this.payload.width !== undefined || this.payload.length !== undefined || this.payload.height !== undefined)) {
            const kc = structuredClone(furniture.kitchenConfig) as any;
            if (this.payload.width  !== undefined) kc.length = this.payload.width;   // arm length
            if (this.payload.length !== undefined) kc.depth  = this.payload.length;  // cabinet depth
            if (this.payload.height !== undefined) kc.height = this.payload.height;  // cabinet height
            newData.kitchenConfig = kc;
        }

        // ✅ Same sync for wardrobe cabinet geometry
        if (furniture.wardrobeCabinetConfig && !this.payload.wardrobeCabinetConfig &&
            (this.payload.width !== undefined || this.payload.length !== undefined || this.payload.height !== undefined)) {
            const wc = structuredClone(furniture.wardrobeCabinetConfig) as any;
            if (this.payload.width  !== undefined) wc.length = this.payload.width;
            if (this.payload.length !== undefined) wc.depth  = this.payload.length;
            if (this.payload.height !== undefined) wc.height = this.payload.height;
            newData.wardrobeCabinetConfig = wc;
        }

        // ✅ Handle Width update for line-based elements (Wardrobe)
        // If width changed and we have start/end points, update endPoint to prevent shift
        if (this.payload.width !== undefined && furniture.startPoint && (furniture.endPoint || furniture.cornerPoint)) {
            if (furniture.furnitureType === 'corner_wardrobe' && furniture.cornerPoint) {
                const start = new THREE.Vector3(furniture.startPoint.x, furniture.startPoint.y, furniture.startPoint.z);
                const corner = new THREE.Vector3(furniture.cornerPoint.x, furniture.cornerPoint.y, furniture.cornerPoint.z);
                const direction = new THREE.Vector3().subVectors(corner, start).normalize();
                
                // New corner point based on new width (Branch 1 length)
                const newCorner = start.clone().add(direction.multiplyScalar(this.payload.width));
                newData.cornerPoint = newCorner;
                
                // If we have an endPoint, we might need to shift it too or keep it relative?
                // Usually we keep the second branch's orientation and length
                if (furniture.endPoint) {
                    const oldCorner = new THREE.Vector3(furniture.cornerPoint.x, furniture.cornerPoint.y, furniture.cornerPoint.z);
                    const end = new THREE.Vector3(furniture.endPoint.x, furniture.endPoint.y, furniture.endPoint.z);
                    const branch2Vector = new THREE.Vector3().subVectors(end, oldCorner);
                    newData.endPoint = newCorner.clone().add(branch2Vector);
                }
            } else if (furniture.furnitureType !== 'corner_wardrobe' && furniture.endPoint) {
                const start = new THREE.Vector3(furniture.startPoint.x, furniture.startPoint.y, furniture.startPoint.z);
                const end = new THREE.Vector3(furniture.endPoint.x, furniture.endPoint.y, furniture.endPoint.z);
                const direction = new THREE.Vector3().subVectors(end, start).normalize();
                
                // New end point based on new width
                const newEnd = start.clone().add(direction.multiplyScalar(this.payload.width));
                newData.endPoint = newEnd;
                
                // Re-calculate center position
                const newCenter = new THREE.Vector3().addVectors(start, newEnd).multiplyScalar(0.5);
                (newData.position as any).x = newCenter.x;
                (newData.position as any).y = newCenter.y;
                (newData.position as any).z = newCenter.z;
            }
        }

        // ✅ Handle lengthBranchTwo update for Corner Wardrobe
        if (this.payload.lengthBranchTwo !== undefined && furniture.cornerPoint && furniture.endPoint && furniture.furnitureType === 'corner_wardrobe') {
            const corner = newData.cornerPoint ? 
                new THREE.Vector3(newData.cornerPoint.x, newData.cornerPoint.y, newData.cornerPoint.z) :
                new THREE.Vector3(furniture.cornerPoint.x, furniture.cornerPoint.y, furniture.cornerPoint.z);
            const end = new THREE.Vector3(furniture.endPoint.x, furniture.endPoint.y, furniture.endPoint.z);
            const direction = new THREE.Vector3().subVectors(end, new THREE.Vector3(furniture.cornerPoint.x, furniture.cornerPoint.y, furniture.cornerPoint.z)).normalize();
            
            const newEnd = corner.clone().add(direction.multiplyScalar(this.payload.lengthBranchTwo));
            newData.endPoint = newEnd;
        }

        // ✅ Maintain level-based baseOffset logic
        if (this.payload.baseOffset !== undefined) {
            const bimManager = window.bimManager;
            const level = bimManager.getLevelById(furniture.levelId);
            if (level) {
                (newData.position as any).y = level.elevation + this.payload.baseOffset;
            }
        }

        // 🔥 CRITICAL FIX: Synchronize wardrobeConfig with updated dimensions
        if (
            newData.furnitureType === 'wardrobe' ||
            newData.furnitureType === 'wardrobe_glass_door' ||
            newData.furnitureType === 'corner_wardrobe'
        ) {
            newData.wardrobeConfig = {
                ...furniture.wardrobeConfig,
                ...this.payload.wardrobeConfig,
                width: newData.width,
                height: newData.height,
                depth: newData.length,
                widthBranchTwo: newData.widthBranchTwo,
                lengthBranchTwo: newData.lengthBranchTwo,
                cornerBehavior: this.payload.cornerBehavior ?? furniture.wardrobeConfig?.cornerBehavior,
                // Ensure sections and sideSections are preserved/updated from payload
                sections: this.payload.wardrobeConfig?.sections ?? furniture.wardrobeConfig?.sections ?? [],
                sideSections: this.payload.wardrobeConfig?.sideSections ?? furniture.wardrobeConfig?.sideSections ?? [],
                showDoors: this.payload.showDoors ?? this.payload.wardrobeConfig?.showDoors ?? furniture.wardrobeConfig?.showDoors,
                showDebug: this.payload.showDebug ?? this.payload.wardrobeConfig?.showDebug ?? furniture.wardrobeConfig?.showDebug,
                // Modular Branch Configs
                mainBranch: this.payload.wardrobeConfig?.mainBranch ?? furniture.wardrobeConfig?.mainBranch,
                sideBranch: this.payload.wardrobeConfig?.sideBranch ?? furniture.wardrobeConfig?.sideBranch
            };
        }

        // §01 §2.7 — store.update() already dispatches bim-furniture-updated;
        // builders subscribe to that event so we no longer call window.furnitureFragmentBuilder
        // directly from a command (removes the global-window coupling).
        store.update(this.payload.id, newData);

        // PropertyInspector also listens on this same custom event for live refresh.
        _bus.emit('bim-furniture-updated', { id: this.payload.id }); // F.events.17

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.oldData) {
            return { success: false, affectedElementIds: [] };
        }

        const store = (context.stores as any).furnitureStore;

        // 🔥 Ensure wardrobeConfig is restored correctly
        if (
            this.oldData.furnitureType === 'wardrobe' ||
            this.oldData.furnitureType === 'wardrobe_glass_door'
        ) {
            this.oldData.wardrobeConfig = {
                width: this.oldData.width,
                height: this.oldData.height,
                depth: this.oldData.length,
                sections:
                    this.oldData.wardrobeConfig?.sections ?? []
            };
        }

        // §01 §2.7 — store.update() dispatches bim-furniture-updated; builders react.
        store.update(this.payload.id, this.oldData);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}