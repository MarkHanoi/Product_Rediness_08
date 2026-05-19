import { Command, CommandContext, CommandValidationResult, CommandResult, CommandType } from '../types';
import { semanticGraphManager } from '@pryzm/core-app-model';

export interface AssignBeamSupportsInput {
    beamId: string;
    startSupportId?: string;
    startSupportType?: 'column' | 'wall' | 'beam';
    endSupportId?: string;
    endSupportType?: 'column' | 'wall' | 'beam';
}

export class AssignBeamSupportsCommand implements Command {
    readonly affectedStores = ["beam"] as const;
    readonly id: string;
    readonly type = 'ASSIGN_BEAM_SUPPORTS' as CommandType;
    readonly timestamp: number;
    readonly input: AssignBeamSupportsInput;
    readonly targetIds: string[];
    
    private previousSupports?: {
        startSupportId?: string;
        startSupportType?: 'column' | 'wall' | 'beam';
        endSupportId?: string;
        endSupportType?: 'column' | 'wall' | 'beam';
    };

    /**
     * §BEAM-AUDIT-2026-W7: precise list of `supports` SemanticGraph edges
     * removed by execute(), so undo can reinstate exactly what was there
     * — including third-party edges authored by other commands. Recorded as
     * `{ sourceId, role }` because target is always the beam.
     */
    private removedSupportEdges: Array<{ sourceId: string; role: 'startSupport' | 'endSupport' | undefined; createdBy: string | undefined }> = [];

    constructor(input: AssignBeamSupportsInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.input = input;
        this.targetIds = [input.beamId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const beamStore = context.stores.beamStore;
        if (!beamStore) {
            return { ok: false, reason: 'BeamStore not available' };
        }

        const beam = beamStore.get(this.input.beamId);
        if (!beam) {
            return { ok: false, reason: `Beam "${this.input.beamId}" not found` };
        }

        const warnings: string[] = [];

        if (this.input.startSupportId) {
            const exists = this.supportExists(context, this.input.startSupportId, this.input.startSupportType);
            if (!exists) {
                return { ok: false, reason: `Start support "${this.input.startSupportId}" not found` };
            }
        }

        if (this.input.endSupportId) {
            const exists = this.supportExists(context, this.input.endSupportId, this.input.endSupportType);
            if (!exists) {
                return { ok: false, reason: `End support "${this.input.endSupportId}" not found` };
            }
        }

        if (this.input.startSupportId === this.input.endSupportId && this.input.startSupportId) {
            warnings.push('Start and end supports are the same element');
        }

        return { ok: true, warnings };
    }

    private supportExists(context: CommandContext, supportId: string, supportType?: string): boolean {
        if (supportType === 'column') {
            return context.stores.columnStore?.get(supportId) !== undefined;
        }
        if (supportType === 'wall') {
            return context.stores.wallStore?.getById(supportId) !== undefined;
        }
        if (supportType === 'beam') {
            return context.stores.beamStore?.get(supportId) !== undefined;
        }
        return (
            context.stores.columnStore?.get(supportId) !== undefined ||
            context.stores.wallStore?.getById(supportId) !== undefined ||
            context.stores.beamStore?.get(supportId) !== undefined
        );
    }

    execute(context: CommandContext): CommandResult {
        const beamStore = context.stores.beamStore;
        const beam = beamStore.get(this.input.beamId);
        
        if (!beam) {
            return { success: false, affectedElementIds: [], info: ['Beam not found'] };
        }

        this.previousSupports = {
            startSupportId: beam.startSupportId,
            startSupportType: beam.startSupportType as 'column' | 'wall' | 'beam' | undefined,
            endSupportId: beam.endSupportId,
            endSupportType: beam.endSupportType as 'column' | 'wall' | 'beam' | undefined
        };

        const updates: any = {};
        if (this.input.startSupportId !== undefined) {
            updates.startSupportId = this.input.startSupportId;
            updates.startSupportType = this.input.startSupportType;
        }
        if (this.input.endSupportId !== undefined) {
            updates.endSupportId = this.input.endSupportId;
            updates.endSupportType = this.input.endSupportType;
        }

        beamStore.update(this.input.beamId, updates);

        // §BEAM-AUDIT-2026-W7: keep the SemanticGraph 'supports' edges in sync
        // with the beam's actual support assignments. Without this, swapping a
        // support leaves a stale edge from the old supporter and never adds an
        // edge from the new one — DependencyResolver then walks the wrong load
        // path and structural validation reports phantom failures.
        try {
            // Capture & remove every existing 'supports' edge that targets
            // this beam (not just edges this command added — any source).
            const existing = semanticGraphManager.getRelationships(this.input.beamId, 'supports')
                .filter(rel => rel.targetId === this.input.beamId);
            this.removedSupportEdges = existing.map(rel => ({
                sourceId: rel.sourceId,
                role: rel.metadata?.role as ('startSupport' | 'endSupport' | undefined),
                createdBy: rel.createdBy,
            }));
            for (const rel of existing) {
                semanticGraphManager.removeRelationship(rel.id);
            }

            // Re-add edges that match the new assignment. Read the post-update
            // beam to honor the case where a side wasn't touched by this cmd.
            const fresh = beamStore.get(this.input.beamId);
            if (fresh?.startSupportId) {
                semanticGraphManager.addRelationship({
                    type: 'supports',
                    sourceId: fresh.startSupportId,
                    targetId: this.input.beamId,
                    createdBy: 'AssignBeamSupportsCommand',
                    metadata: { role: 'startSupport' },
                });
            }
            if (fresh?.endSupportId && fresh.endSupportId !== fresh.startSupportId) {
                semanticGraphManager.addRelationship({
                    type: 'supports',
                    sourceId: fresh.endSupportId,
                    targetId: this.input.beamId,
                    createdBy: 'AssignBeamSupportsCommand',
                    metadata: { role: 'endSupport' },
                });
            }
        } catch (err) {
            console.warn('[AssignBeamSupportsCommand] SemanticGraph rewrite failed (non-fatal):', err);
        }

        return { success: true, affectedElementIds: [this.input.beamId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.previousSupports) {
            return { success: false, affectedElementIds: [], info: ['No previous state'] };
        }

        const beamStore = context.stores.beamStore;
        beamStore.update(this.input.beamId, this.previousSupports);

        // §BEAM-AUDIT-2026-W7: reverse the SemanticGraph rewrite — drop any
        // 'supports' edges this execute() added/kept, then reinstate the
        // exact set captured before mutation.
        try {
            const current = semanticGraphManager.getRelationships(this.input.beamId, 'supports')
                .filter(rel => rel.targetId === this.input.beamId);
            for (const rel of current) {
                semanticGraphManager.removeRelationship(rel.id);
            }
            for (const edge of this.removedSupportEdges) {
                semanticGraphManager.addRelationship({
                    type: 'supports',
                    sourceId: edge.sourceId,
                    targetId: this.input.beamId,
                    createdBy: edge.createdBy ?? 'AssignBeamSupportsCommand.undo',
                    metadata: edge.role ? { role: edge.role } : undefined,
                });
            }
        } catch (err) {
            console.warn('[AssignBeamSupportsCommand.undo] SemanticGraph restore failed (non-fatal):', err);
        }

        return { success: true, affectedElementIds: [this.input.beamId] };
    }

    serialize(): any {
        return {
            type: this.type,
            id: this.id,
            timestamp: this.timestamp,
            input: this.input
        };
    }
}
