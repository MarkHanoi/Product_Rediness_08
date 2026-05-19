/**
 * @file UpdateAIElementParametersCommand.ts
 * @description Updates a single AIParameter value in an ai_element's config,
 * triggering geometry rebuild via FurnitureStore → bim-furniture-updated event.
 *
 * CONTRACT (04-BIM §3.2 / UpdateFurnitureParametersCommand pattern):
 *  ✅ structuredClone snapshot before mutation for full undo
 *  ✅ Dot-path applied immutably — new config object, never mutates in place
 *  ✅ store.update() triggers bim-furniture-updated → furnitureBuilder.updateFurniture()
 *  ✅ No direct window.* builder coupling (§01 §2.7) — store events drive rebuild
 *  ✅ Fails explicitly if element not found or not ai_element
 */

import * as THREE from '@pryzm/renderer-three/three';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FurnitureData } from '@pryzm/geometry-furniture';
import { AIElementConfig } from '@pryzm/geometry-furniture';

export interface UpdateAIElementParametersPayload {
    /** Target furniture element id */
    id: string;
    /** AIParameter.id from aiElementConfig.parameters[] */
    parameterId: string;
    /** New value — must match the parameter's declared type */
    value: number | boolean | string;
}

export class UpdateAIElementParametersCommand implements Command {
    readonly affectedStores = ["furniture"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_FURNITURE_PARAMETERS;
    readonly timestamp: number;
    targetIds: string[];
    private oldData?: FurnitureData;

    constructor(private payload: UpdateAIElementParametersPayload) {
        // §07 §3.4 — cryptographic randomness for command IDs.
        this.id = `cmd-update-ai-element-${crypto.randomUUID()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = (context.stores as any).furnitureStore;
        const furniture: FurnitureData | undefined = store?.get(this.payload.id);

        if (!furniture) {
            return { ok: false, reason: `UpdateAIElementParametersCommand: Element "${this.payload.id}" not found` };
        }
        if (furniture.furnitureType !== 'ai_element') {
            return {
                ok: false,
                reason: `UpdateAIElementParametersCommand: Element "${this.payload.id}" is not ai_element (type="${furniture.furnitureType}")`
            };
        }
        if (!furniture.aiElementConfig) {
            return { ok: false, reason: `UpdateAIElementParametersCommand: aiElementConfig missing on "${this.payload.id}"` };
        }
        const paramDef = furniture.aiElementConfig.parameters?.find(p => p.id === this.payload.parameterId);
        if (!paramDef) {
            return {
                ok: false,
                reason: `UpdateAIElementParametersCommand: Parameter "${this.payload.parameterId}" not found in config`
            };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = (context.stores as any).furnitureStore;
        const furniture: FurnitureData = store.get(this.payload.id);
        if (!furniture?.aiElementConfig) {
            throw new Error(`UpdateAIElementParametersCommand: Cannot execute — element or config missing`);
        }

        // Full snapshot for undo
        this.oldData = structuredClone(furniture) as FurnitureData;

        // Immutable config update — deep clone, then apply dot-path
        const newConfig: AIElementConfig = structuredClone(furniture.aiElementConfig);

        const paramDef = newConfig.parameters?.find(p => p.id === this.payload.parameterId);
        if (!paramDef) {
            throw new Error(`UpdateAIElementParametersCommand: Parameter "${this.payload.parameterId}" missing during execute`);
        }

        // Update the stored default so it round-trips through undo/serialize correctly
        paramDef.default = this.payload.value;

        // Apply value to the target component field via dot-path
        UpdateAIElementParametersCommand.applyDotPath(newConfig, paramDef.target, this.payload.value);

        const newData: FurnitureData = {
            ...this.oldData,
            aiElementConfig: newConfig,
            // Keep Inspector dimensions in sync with declared bounding box
            width:  newConfig.boundingBox.w,
            length: newConfig.boundingBox.d,
            height: newConfig.boundingBox.h,
            // Restore THREE objects lost in structuredClone
            position: new THREE.Vector3(
                (this.oldData as any).position.x ?? (this.oldData as any).position._x ?? 0,
                (this.oldData as any).position.y ?? (this.oldData as any).position._y ?? 0,
                (this.oldData as any).position.z ?? (this.oldData as any).position._z ?? 0
            ),
            rotation: new THREE.Euler(
                (this.oldData as any).rotation.x ?? (this.oldData as any).rotation._x ?? 0,
                (this.oldData as any).rotation.y ?? (this.oldData as any).rotation._y ?? 0,
                (this.oldData as any).rotation.z ?? (this.oldData as any).rotation._z ?? 0,
                (this.oldData as any).rotation.order ?? (this.oldData as any).rotation._order ?? 'XYZ'
            ),
        };

        // §01 §2.7 — store.update() dispatches bim-furniture-updated; the
        // fragment builder is wired to that event. No direct window.* call.
        store.update(this.payload.id, newData);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.oldData) return { success: false, affectedElementIds: [] };

        const store = (context.stores as any).furnitureStore;

        // Restore THREE objects
        const restored: FurnitureData = {
            ...this.oldData,
            position: new THREE.Vector3(
                (this.oldData as any).position.x ?? (this.oldData as any).position._x ?? 0,
                (this.oldData as any).position.y ?? (this.oldData as any).position._y ?? 0,
                (this.oldData as any).position.z ?? (this.oldData as any).position._z ?? 0
            ),
            rotation: new THREE.Euler(
                (this.oldData as any).rotation.x ?? (this.oldData as any).rotation._x ?? 0,
                (this.oldData as any).rotation.y ?? (this.oldData as any).rotation._y ?? 0,
                (this.oldData as any).rotation.z ?? (this.oldData as any).rotation._z ?? 0,
                (this.oldData as any).rotation.order ?? (this.oldData as any).rotation._order ?? 'XYZ'
            ),
        };

        // §01 §2.7 — store.update() dispatches bim-furniture-updated; builders react.
        store.update(this.payload.id, restored);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    /**
     * Applies a value to a nested path inside AIElementConfig.
     * Target format: "<componentId>.<fieldPath>"
     * e.g. "pole.dimensions.height" → config.components[id="pole"].dimensions.height
     */
    private static applyDotPath(
        config: AIElementConfig,
        target: string,
        value: number | boolean | string
    ): void {
        const dotIndex = target.indexOf('.');
        if (dotIndex === -1) return;

        const componentId = target.slice(0, dotIndex);
        const fieldPath = target.slice(dotIndex + 1);

        const component = config.components.find(c => c.id === componentId);
        if (!component) {
            console.warn(`[UpdateAIElementParametersCommand] Component "${componentId}" not found`);
            return;
        }

        const parts = fieldPath.split('.');
        let obj: Record<string, unknown> = component as unknown as Record<string, unknown>;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (typeof obj[part] !== 'object' || obj[part] === null) {
                console.warn(`[UpdateAIElementParametersCommand] Broken path at "${part}" in "${target}"`);
                return;
            }
            obj = obj[part] as Record<string, unknown>;
        }

        obj[parts[parts.length - 1]] = value;
    }
}