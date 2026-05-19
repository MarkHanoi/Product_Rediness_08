import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface AddGridPayload {
    gridId?: string;
    orientation: 'X' | 'Y';
    position: number;
    name?: string;
    extentMin?: number;
    extentMax?: number;
    /** §40 §2 — drawing mode this grid was authored with. Default 'orthogonal'. */
    mode?: 'orthogonal' | 'linear';
    /** §40 §2.2 — Linear-mode endpoints. Required when mode='linear'. */
    startX?: number;
    startZ?: number;
    endX?: number;
    endZ?: number;
    /** §40 §3 — pin state at creation time. Default false. */
    isPinned?: boolean;
}

export class AddGridCommand implements Command {
    readonly affectedStores = ["grid"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];
    private payload: Required<Omit<AddGridPayload, 'startX'|'startZ'|'endX'|'endZ'>> & {
        startX?: number; startZ?: number; endX?: number; endZ?: number;
    };

    constructor(payload: AddGridPayload) {
        this.id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();

        const gridId = payload.gridId || `grid-${Date.now()}`;
        const name = payload.name || `${payload.orientation}${Math.floor(payload.position)}`;

        this.payload = {
            gridId,
            orientation: payload.orientation,
            position: payload.position,
            name,
            extentMin: payload.extentMin ?? -100,
            extentMax: payload.extentMax ?? 100,
            mode: payload.mode ?? 'orthogonal',
            isPinned: payload.isPinned ?? false,
            startX: payload.startX,
            startZ: payload.startZ,
            endX:   payload.endX,
            endZ:   payload.endZ,
        };
        this.targetIds = [this.payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { gridStore, wallStore } = context.stores;
        
        if (wallStore.getLevels().length === 0) {
            return { ok: false, reason: "Cannot add grid: No levels exist in the project." };
        }

        if (!['X', 'Y'].includes(this.payload.orientation)) {
            return { ok: false, reason: `Invalid orientation: ${this.payload.orientation}` };
        }

        if (!isFinite(this.payload.position)) {
            return { ok: false, reason: "Position must be a finite number." };
        }

        if (!isFinite(this.payload.extentMin) || !isFinite(this.payload.extentMax) || this.payload.extentMin >= this.payload.extentMax) {
            return { ok: false, reason: "Grid extents must be finite and ordered." };
        }

        if (this.payload.mode === 'linear') {
            const { startX, startZ, endX, endZ } = this.payload;
            if (![startX, startZ, endX, endZ].every(v => typeof v === 'number' && isFinite(v))) {
                return { ok: false, reason: "Linear-mode grid requires finite startX/startZ/endX/endZ." };
            }
            const dx = (endX! - startX!), dz = (endZ! - startZ!);
            if (dx*dx + dz*dz < 1e-6) {
                return { ok: false, reason: "Linear-mode grid endpoints must not be coincident." };
            }
        }

        if (gridStore.getById(this.payload.gridId)) {
            return { ok: false, reason: `Grid ID "${this.payload.gridId}" already exists.` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §01 §2.7 Builder Isolation: only mutate the store. The renderer is
        // driven by BimManager's StoreEventBus listener.
        const { gridStore } = context.stores;

        const gridData = {
            id: this.payload.gridId,
            name: this.payload.name,
            axis: this.payload.orientation,
            position: this.payload.position,
            extentMin: this.payload.extentMin,
            extentMax: this.payload.extentMax,
            mode: this.payload.mode,
            isPinned: this.payload.isPinned,
            startX: this.payload.startX,
            startZ: this.payload.startZ,
            endX:   this.payload.endX,
            endZ:   this.payload.endZ,
        };

        gridStore.add(gridData);

        _bus.emit('grid-added', { id: gridData.id ?? this.payload.gridId ?? '' }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${this.payload.name}" added at ${this.payload.position}m`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const { gridStore } = context.stores;

        // §01 §2.7: Store-only mutation. Renderer follows via StoreEventBus.
        gridStore.remove(this.payload.gridId);

        _bus.emit('grid-removed', { id: this.payload.gridId ?? '' }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${this.payload.name}" removed`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: CommandType.CREATE_GRID,
            payload: this.payload,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
