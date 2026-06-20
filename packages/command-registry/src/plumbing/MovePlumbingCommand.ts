import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { PlumbingFixtureData } from '@pryzm/geometry-plumbing';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * MovePlumbingCommand — §ELEMENT-SEMANTIC-AUDIT S4 (founder 2026-06-20).
 *
 * Translates a placed plumbing fixture to a new ABSOLUTE world position. This is
 * the missing prerequisite for plumbing gizmo-move: UpdatePlumbingParametersCommand
 * intentionally has NO position field, and there was no Move command at all, so a
 * plumbing fixture could be created but never moved (and a remote replay had nothing
 * to reconstruct). Mirrors MoveLightingCommand in shape; fully undoable.
 *
 * The fixture's `position` is a THREE.Vector3 — we clone-and-set it rather than
 * importing THREE here (P2: THREE is owned by renderer-three). Line-based fixtures
 * (bath) also carry startPoint/endPoint; those are translated by the same delta so
 * the fixture stays internally consistent.
 */
export interface MovePlumbingPayload {
    readonly id: string;
    /** New absolute world position. */
    readonly to: { readonly x: number; readonly y: number; readonly z: number };
}

export class MovePlumbingCommand implements Command {
    readonly affectedStores = ['plumbing'] as const;
    readonly id: string;
    readonly type = CommandType.MOVE_PLUMBING;
    readonly timestamp: number;
    targetIds: string[];

    private prevFixture?: PlumbingFixtureData;

    constructor(private readonly payload: MovePlumbingPayload) {
        this.id = `cmd-move-plumbing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const fixture = context.stores.plumbingStore.get(this.payload.id);
        if (!fixture) return { ok: false, reason: 'Plumbing fixture not found' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const store = context.stores.plumbingStore;
        const fixture = store.get(this.payload.id);
        if (!fixture) return { success: false, affectedElementIds: [], info: ['Plumbing fixture not found'] };

        // Snapshot for undo — shallow-copy but keep position a real Vector3 (a
        // structuredClone would strip the prototype and break later .clone()/.set()).
        this.prevFixture = {
            ...fixture,
            position: fixture.position.clone(),
            ...(fixture.startPoint ? { startPoint: { ...fixture.startPoint } } : {}),
            ...(fixture.endPoint ? { endPoint: { ...fixture.endPoint } } : {}),
        };

        const old = fixture.position;
        const dx = this.payload.to.x - old.x;
        const dy = this.payload.to.y - old.y;
        const dz = this.payload.to.z - old.z;

        const newPosition = fixture.position.clone();
        newPosition.set(this.payload.to.x, this.payload.to.y, this.payload.to.z);

        const newData: PlumbingFixtureData = {
            ...fixture,
            position: newPosition,
            ...(fixture.startPoint
                ? { startPoint: { x: fixture.startPoint.x + dx, y: fixture.startPoint.y + dy, z: fixture.startPoint.z + dz } }
                : {}),
            ...(fixture.endPoint
                ? { endPoint: { x: fixture.endPoint.x + dx, y: fixture.endPoint.y + dy, z: fixture.endPoint.z + dz } }
                : {}),
        };

        store.add(newData); // store.add performs a set/upsert
        _bus.emit('bim-plumbing-updated', { id: this.payload.id }); // F.events.17

        const builder = window.plumbingFragmentBuilder;
        if (builder?.updateFixture) builder.updateFixture(newData);

        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevFixture) return { success: false, affectedElementIds: [] };
        context.stores.plumbingStore.add(this.prevFixture);
        _bus.emit('bim-plumbing-updated', { id: this.payload.id });
        const builder = window.plumbingFragmentBuilder;
        if (builder?.updateFixture) builder.updateFixture(this.prevFixture);
        return { success: true, affectedElementIds: [this.payload.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { id: this.payload.id, to: { ...this.payload.to } },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
