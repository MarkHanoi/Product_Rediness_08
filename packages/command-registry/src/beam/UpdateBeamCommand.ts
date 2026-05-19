import { Command, CommandContext, CommandValidationResult, CommandResult, CommandType } from '../types';
import { BeamData, BEAM_CONSTRAINTS } from '@pryzm/core-app-model';

export interface UpdateBeamInput {
    beamId: string;
    updates: Partial<Omit<BeamData, 'id' | 'levelId' | 'ifcData'>>;
}

export class UpdateBeamCommand implements Command {
    readonly affectedStores = ["beam"] as const;
    readonly id: string;
    readonly type = 'UPDATE_BEAM' as CommandType;
    readonly timestamp: number;
    readonly input: UpdateBeamInput;
    readonly targetIds: string[];
    
    private previousState?: Partial<BeamData>;

    constructor(input: UpdateBeamInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.input = input;
        this.targetIds = [input.beamId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        const beamStore = context.stores.beamStore;
        if (!beamStore) {
            return { ok: false, reason: 'BeamStore not available' };
        }

        const beam = beamStore.get(this.input.beamId);
        if (!beam) {
            return { ok: false, reason: `Beam "${this.input.beamId}" not found` };
        }

        const updatedBeam = { ...beam, ...this.input.updates };

        if (this.input.updates.width !== undefined && this.input.updates.width < BEAM_CONSTRAINTS.MIN_WIDTH) {
            errors.push(`Width ${this.input.updates.width.toFixed(2)}m is below minimum`);
        }

        if (this.input.updates.depth !== undefined && this.input.updates.depth < BEAM_CONSTRAINTS.MIN_DEPTH) {
            errors.push(`Depth ${this.input.updates.depth.toFixed(2)}m is below minimum`);
        }

        if (this.input.updates.startPoint || this.input.updates.endPoint) {
            const start = updatedBeam.startPoint;
            const end = updatedBeam.endPoint;
            const span = Math.sqrt(
                Math.pow(end.x - start.x, 2) +
                Math.pow(end.y - start.y, 2) +
                Math.pow(end.z - start.z, 2)
            );
            
            const ratio = span / updatedBeam.depth;
            if (ratio > BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO) {
                errors.push(`Updated span-to-depth ratio ${ratio.toFixed(1)} exceeds maximum`);
            }
        }

        if (errors.length > 0) {
            return { ok: false, reason: errors.join('; '), blockingIssues: errors, warnings };
        }

        return { ok: true, warnings };
    }

    execute(context: CommandContext): CommandResult {
        const beamStore = context.stores.beamStore;
        const beam = beamStore.get(this.input.beamId);
        
        if (!beam) {
            return { success: false, affectedElementIds: [], info: ['Beam not found'] };
        }

        // §BEAM-AUDIT-2026-W1: deep clone — `BeamData` contains nested
        // objects (startPoint, endPoint, properties, ifcData, metadata).
        // A shallow `{ ...beam }` snapshots only top-level fields, so when
        // the store mutates nested values in place (the BeamStore.update
        // path does in some branches), `previousState` ends up referencing
        // the *current* values and undo becomes a no-op.
        this.previousState = structuredClone(beam);
        beamStore.update(this.input.beamId, this.input.updates);

        return { success: true, affectedElementIds: [this.input.beamId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.previousState) {
            return { success: false, affectedElementIds: [], info: ['No previous state'] };
        }

        const beamStore = context.stores.beamStore;
        beamStore.update(this.input.beamId, this.previousState);

        return { success: true, affectedElementIds: [this.input.beamId] };
    }

    serialize(): any {
        return {
            type: this.type,
            id: this.id,
            timestamp: this.timestamp,
            input: this.input,
            previousState: this.previousState
        };
    }
}
