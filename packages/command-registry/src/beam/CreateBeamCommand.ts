import { Command, CommandContext, CommandValidationResult, CommandResult, CommandType } from '../types';
import { BeamData, BEAM_CONSTRAINTS } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface CreateBeamInput {
    /**
     * §BEAM-AUDIT-2026-C5: callers MAY pre-stamp the beam id (collaboration
     * replay forwards it from `serialize().input.beamId`). When omitted, the
     * constructor generates one — but the value is then captured on the
     * command instance and is stable across local redo and wire replay.
     */
    beamId?: string;
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    width: number;
    depth: number;
    levelId?: string;
    startSupportId?: string;
    endSupportId?: string;
    startSupportType?: 'column' | 'wall' | 'beam';
    endSupportType?: 'column' | 'wall' | 'beam';
    material?: string;
    loadBearing?: boolean;
    fireRating?: string;
    /** Steel profile name (e.g. "254x146x37") — set when sectionType is 'UB' or 'UC'. */
    steelProfileName?: string;
    /** Section geometry type: 'rectangular' = concrete/generic, 'UB'/'UC' = steel I-section. */
    sectionType?: 'rectangular' | 'UB' | 'UC';
}

export class CreateBeamCommand implements Command {
    readonly affectedStores = ["beam", "level"] as const;
    readonly id: string;
    readonly type = 'CREATE_BEAM' as CommandType;
    readonly timestamp: number;
    readonly input: CreateBeamInput;
    readonly targetIds: string[] = [];
    
    /**
     * §BEAM-AUDIT-2026-C5: stable beam id captured at construction time so
     * the value survives redo and is identical on every collaboration peer.
     * Mirrors what `createdBeamId` was attempting to do but moves the choice
     * from inside `execute()` to construction, eliminating the “first
     * execute generates an id, redo generates a different one” race that
     * caused undo/redo + collab divergence (audit Critical-5).
     */
    public readonly beamId: string;
    private createdBeamId?: string;

    constructor(input: CreateBeamInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.beamId = input.beamId ?? crypto.randomUUID();
        // Echo the resolved id back into `input` so `serialize()` always
        // forwards it on the wire — collaboration peers reconstruct with
        // the same id and dependent commands (AssignBeamSupports, Update,
        // Delete) target a beam every peer agrees on.
        this.input = { ...input, beamId: this.beamId };
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        const dx = this.input.endPoint.x - this.input.startPoint.x;
        const dy = this.input.endPoint.y - this.input.startPoint.y;
        const dz = this.input.endPoint.z - this.input.startPoint.z;
        const span = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (span < BEAM_CONSTRAINTS.MIN_SPAN) {
            errors.push(`Beam span ${span.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_SPAN}m`);
        }

        if (span > BEAM_CONSTRAINTS.MAX_SPAN) {
            errors.push(`Beam span ${span.toFixed(2)}m exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN}m`);
        }

        if (this.input.width < BEAM_CONSTRAINTS.MIN_WIDTH) {
            errors.push(`Beam width ${this.input.width.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_WIDTH}m`);
        }

        if (this.input.depth < BEAM_CONSTRAINTS.MIN_DEPTH) {
            errors.push(`Beam depth ${this.input.depth.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_DEPTH}m`);
        }

        const spanToDepthRatio = span / this.input.depth;
        if (spanToDepthRatio > BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO) {
            errors.push(`Span-to-depth ratio ${spanToDepthRatio.toFixed(1)} exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO}`);
        } else if (spanToDepthRatio > BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO) {
            warnings.push(`Span-to-depth ratio ${spanToDepthRatio.toFixed(1)} exceeds recommended ${BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO}`);
        }

        if (!this.input.startSupportId || !this.input.endSupportId) {
            warnings.push('Beam does not have both supports defined. Load path may be incomplete.');
        }

        const levelId = this.input.levelId || context.stores.wallStore.activeLevelId || 'default-level';
        const levels = context.stores.wallStore.getLevels();
        const levelExists = levels.length === 0 || levels.some((l: any) => l.id === levelId);
        
        if (!levelExists && levels.length > 0) {
            errors.push(`Level "${levelId}" does not exist`);
        }

        if (errors.length > 0) {
            return {
                ok: false,
                reason: errors.join('; '),
                blockingIssues: errors,
                warnings
            };
        }

        return { ok: true, warnings };
    }

    execute(context: CommandContext): CommandResult {
        const beamStore = context.stores.beamStore;
        if (!beamStore) {
            return {
                success: false,
                affectedElementIds: [],
                info: ['BeamStore not available in context']
            };
        }

        // §BEAM-AUDIT-2026-C5: use the constructor-stamped id, NEVER a fresh
        // crypto.randomUUID() — that broke redo and made collab peers diverge.
        const beamId = this.beamId;
        const levelId = this.input.levelId || context.stores.wallStore.activeLevelId;

        if (!levelId) {
            return { success: false, affectedElementIds: [], info: ["Execution failed: Missing levelId"] };
        }

        // P2.1: Enforce spatial registration
        try {
            context.bimManager.registerElement(beamId, levelId);
        } catch (e: any) {
            return { success: false, affectedElementIds: [], info: [e.message] };
        }

        const beam: BeamData = {
            id: beamId,
            levelId,
            startPoint: this.input.startPoint,
            endPoint: this.input.endPoint,
            width: this.input.width,
            depth: this.input.depth,
            startSupportId: this.input.startSupportId,
            endSupportId: this.input.endSupportId,
            startSupportType: this.input.startSupportType,
            endSupportType: this.input.endSupportType,
            material: this.input.material,
            loadBearing: this.input.loadBearing ?? true,
            fireRating: this.input.fireRating,
            steelProfileName: this.input.steelProfileName,
            sectionType: this.input.sectionType ?? 'rectangular',
            properties: {
                mark: `BE${(context.stores.beamStore.getAll().length + 1).toString().padStart(3, '0')}`
            }
        };

        beamStore.add(beam);
        this.createdBeamId = beamId;

        // §BEAM-AUDIT-2026-W8: register semantic identity for the beam so the
        // ElementRegistry / DependencyResolver / cross-system selection helpers
        // can resolve `beamId → 'beam'` without scanning every store. Mirrors
        // CreateColumnCommand and CreateRoofCommand. Best-effort: a registry
        // already containing this id (e.g. via wire-replay race) is not fatal.
        try { elementRegistry.registerSemantic(beamId, 'beam' as any); } catch (_) {}

        // Gap 7 — SemanticGraph: beam sitsOn its level.
        // If supports are defined, also write supports relationships so the
        // DependencyResolver can traverse the structural load path.
        try {
            semanticGraphManager.addRelationship({
                type: 'sitsOn',
                sourceId: beamId,
                targetId: levelId,
                createdBy: 'CreateBeamCommand',
                metadata: { addedBy: 'CreateBeamCommand' }
            });
            if (this.input.startSupportId) {
                semanticGraphManager.addRelationship({
                    type: 'supports',
                    sourceId: this.input.startSupportId,
                    targetId: beamId,
                    createdBy: 'CreateBeamCommand',
                    metadata: { role: 'startSupport' }
                });
            }
            if (this.input.endSupportId && this.input.endSupportId !== this.input.startSupportId) {
                semanticGraphManager.addRelationship({
                    type: 'supports',
                    sourceId: this.input.endSupportId,
                    targetId: beamId,
                    createdBy: 'CreateBeamCommand',
                    metadata: { role: 'endSupport' }
                });
            }
        } catch (err) {
            console.warn('[CreateBeamCommand] SemanticGraph write failed (non-fatal):', err);
        }

        return {
            success: true,
            affectedElementIds: [beamId]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdBeamId) {
            return {
                success: false,
                affectedElementIds: [],
                info: ['No beam to undo']
            };
        }

        // P2.1: Remove from spatial container
        context.bimManager.unregisterElement(this.createdBeamId);
        try {
            semanticGraphManager.removeAllRelationshipsForElement(this.createdBeamId);
        } catch (err) {
            console.warn('[CreateBeamCommand.undo] SemanticGraph cleanup failed (non-fatal):', err);
        }

        // §BEAM-AUDIT-2026-W8: symmetric counterpart to registerSemantic in
        // execute(). Without this, undo leaks an entry in ElementRegistry that
        // resolves to 'beam' for an id whose store record has been removed.
        try { elementRegistry.unregister(this.createdBeamId); } catch (_) {}

        const beamStore = context.stores.beamStore;
        if (beamStore) {
            beamStore.remove(this.createdBeamId);
        }

        return {
            success: true,
            affectedElementIds: [this.createdBeamId]
        };
    }

    serialize(): any {
        return {
            type: this.type,
            id: this.id,
            timestamp: this.timestamp,
            input: this.input,
            createdBeamId: this.createdBeamId
        };
    }
}
