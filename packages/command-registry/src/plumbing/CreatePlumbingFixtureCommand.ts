import * as THREE from '@pryzm/renderer-three/three';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { PlumbingFixtureData } from '@pryzm/geometry-plumbing';
import type { ToiletVariant } from '@pryzm/geometry-plumbing';
import type { ShowerVariant } from '@pryzm/geometry-plumbing';
import type { BathroomAccessoryVariant } from '@pryzm/geometry-plumbing';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface CreatePlumbingFixturePayload {
    id?: string;
    fixtureType: 'toilet' | 'sink' | 'bath' | 'shower' | 'accessory';
    /** LOD400 sub-family. Only used when fixtureType === 'toilet'. */
    toiletVariant?: ToiletVariant;
    /** LOD400 sub-family. Only used when fixtureType === 'shower'. */
    showerVariant?: ShowerVariant;
    /** LOD400 sub-family. Only used when fixtureType === 'accessory'. */
    accessoryVariant?: BathroomAccessoryVariant;
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    levelId: string;
    baseOffset: number;
    width?: number;
    height?: number;
    length?: number;
    color?: string;
    startPoint?: { x: number, y: number, z: number };
    endPoint?: { x: number, y: number, z: number };
}

export class CreatePlumbingFixtureCommand implements Command {
    readonly affectedStores = ["plumbing", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_PLUMBING_FIXTURE;
    readonly timestamp: number;
    targetIds: string[];
    private createdId?: string;

    constructor(private payload: CreatePlumbingFixturePayload) {
        this.id = `cmd-plumbing-${Date.now()}`;
        this.timestamp = Date.now();
        this.targetIds = payload.id ? [payload.id] : [];
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) return { ok: false, reason: "Missing levelId" };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const id = this.payload.id || crypto.randomUUID();
        const level = context.bimManager.getLevelById(this.payload.levelId);
        if (!level) throw new Error(`Level not found: ${this.payload.levelId}`);

        context.bimManager.registerElement(id, this.payload.levelId);

        const rotation = new THREE.Euler(this.payload.rotation.x, this.payload.rotation.y, this.payload.rotation.z);
        const data: PlumbingFixtureData = {
            id,
            type: 'plumbing_fixture',
            fixtureType: this.payload.fixtureType,
            toiletVariant:    this.payload.fixtureType === 'toilet'    ? this.payload.toiletVariant    : undefined,
            showerVariant:    this.payload.fixtureType === 'shower'    ? this.payload.showerVariant    : undefined,
            accessoryVariant: this.payload.fixtureType === 'accessory' ? this.payload.accessoryVariant : undefined,
            position: new THREE.Vector3(this.payload.position.x, level.elevation + (this.payload.baseOffset !== undefined ? this.payload.baseOffset : 0.2), this.payload.position.z),
            rotation,
            levelId: this.payload.levelId,
            levelName: level.name,
            levelElevation: level.elevation,
            baseOffset: this.payload.baseOffset !== undefined ? this.payload.baseOffset : 0.2,
            width: this.payload.width,
            height: this.payload.height,
            length: this.payload.length,
            color: this.payload.color,
            startPoint: this.payload.startPoint,
            endPoint: this.payload.endPoint,
            properties: {}
        };

        context.stores.plumbingStore.add(data);
        this.createdId = id;
        this.targetIds = [id];

        // Gap 7 — SemanticGraph: plumbing fixture sitsOn its level.
        // Enables DependencyResolver to find all plumbing fixtures on a level and
        // powers IFC IfcRelContainedInSpatialStructure for sanitary fixtures.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: id,
                targetId: this.payload.levelId,
                createdBy: 'CreatePlumbingFixtureCommand',
                metadata: { addedBy: 'CreatePlumbingFixtureCommand', fixtureType: this.payload.fixtureType }
            });
        } catch (err) {
            console.warn('[CreatePlumbingFixtureCommand] SemanticGraph write failed (non-fatal):', err);
        }

        return { success: true, affectedElementIds: [id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };
        context.bimManager.unregisterElement(this.createdId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
        } catch (err) {
            console.warn('[CreatePlumbingFixtureCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }
        context.stores.plumbingStore.remove(this.createdId);
        return { success: true, affectedElementIds: [this.createdId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: this.payload as any, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}
