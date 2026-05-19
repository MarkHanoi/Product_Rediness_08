import * as THREE from '@pryzm/renderer-three/three';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { PlumbingFixtureData, PlumbingFixtureType } from '@pryzm/geometry-plumbing';
import type { ToiletVariant } from '@pryzm/geometry-plumbing';
import type { ShowerVariant } from '@pryzm/geometry-plumbing';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * UpdatePlumbingParametersCommand
 * --------------------------------
 * Mutates a placed plumbing fixture in-place. Used by the PropertyPanel for:
 *   • Dimensional edits (width / length / height / baseOffset / color)
 *   • LOD400 type swaps (toiletVariant) — see Contract 39
 *   • Family swaps     (fixtureType)    — see Contract 39
 *
 * Geometry is rebuilt deterministically from the new DTO via
 * PlumbingFragmentBuilder.updateFixture() so preview and committed forms stay
 * in lock-step (Contract 36 §5).
 */
export interface UpdatePlumbingParametersPayload {
    id: string;
    width?: number;
    length?: number;
    height?: number;
    baseOffset?: number;
    color?: string;
    /** LOD400 toilet sub-family. Ignored unless the fixture's family resolves to 'toilet'. */
    toiletVariant?: ToiletVariant;
    /** LOD400 shower sub-family. Ignored unless the fixture's family resolves to 'shower'. */
    showerVariant?: ShowerVariant;
    /** Family swap (toilet ↔ sink ↔ bath ↔ shower). Currently used for variant-only changes. */
    fixtureType?: PlumbingFixtureType;
}

export class UpdatePlumbingParametersCommand implements Command {
    readonly affectedStores = ["plumbing"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_PLUMBING_PARAMETERS;
    readonly timestamp: number;
    targetIds: string[];
    private oldData?: PlumbingFixtureData;

    constructor(private payload: UpdatePlumbingParametersPayload) {
        this.id = `cmd-update-plumbing-${Date.now()}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const fixture = context.stores.plumbingStore.get(this.payload.id);
        if (!fixture) return { ok: false, reason: "Plumbing fixture not found" };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.plumbingStore;
        const fixture = store.get(this.payload.id);
        if (!fixture) throw new Error("Plumbing fixture not found");

        this.oldData = structuredClone(fixture);

        const nextFixtureType = this.payload.fixtureType ?? fixture.fixtureType;
        const nextToiletVariant = nextFixtureType === 'toilet'
            ? (this.payload.toiletVariant ?? fixture.toiletVariant)
            : undefined;
        const nextShowerVariant = nextFixtureType === 'shower'
            ? (this.payload.showerVariant ?? fixture.showerVariant)
            : undefined;

        const newData: PlumbingFixtureData = {
            ...fixture,
            fixtureType:   nextFixtureType,
            toiletVariant: nextToiletVariant,
            showerVariant: nextShowerVariant,
            width:      this.payload.width      ?? fixture.width,
            length:     this.payload.length     ?? fixture.length,
            height:     this.payload.height     ?? fixture.height,
            baseOffset: this.payload.baseOffset ?? fixture.baseOffset,
            color:      this.payload.color      ?? fixture.color,
            position:   fixture.position.clone()
        };

        // Handle line-based repositioning for Bath
        if (this.payload.width !== undefined && fixture.startPoint && fixture.endPoint && fixture.fixtureType === 'bath') {
            const start = new THREE.Vector3(fixture.startPoint.x, fixture.startPoint.y, fixture.startPoint.z);
            const end = new THREE.Vector3(fixture.endPoint.x, fixture.endPoint.y, fixture.endPoint.z);
            const direction = new THREE.Vector3().subVectors(end, start).normalize();
            
            const newEnd = start.clone().add(direction.multiplyScalar(this.payload.width));
            newData.endPoint = { x: newEnd.x, y: newEnd.y, z: newEnd.z };
            
            const newCenter = new THREE.Vector3().addVectors(start, newEnd).multiplyScalar(0.5);
            newData.position.copy(newCenter);
        }

        if (this.payload.baseOffset !== undefined) {
            const level = context.bimManager.getLevelById(fixture.levelId);
            if (level) {
                newData.position.y = level.elevation + this.payload.baseOffset;
            }
        }

        store.add(newData); // store.add performs a set/update

        _bus.emit('bim-plumbing-updated', { id: this.payload.id }); // F.events.17

        const builder = window.plumbingFragmentBuilder;
        if (builder?.updateFixture) {
            builder.updateFixture(newData);
        }

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.oldData) return { success: false, affectedElementIds: [] };
        context.stores.plumbingStore.add(this.oldData);
        const builder = window.plumbingFragmentBuilder;
        if (builder?.updateFixture) builder.updateFixture(this.oldData);
        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: this.payload as any, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}
