/**
 * §ANN-VII-1 — UpdateConstraintCommand
 *
 * Moved from src/engine/subsystems/commands/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../legacy-command-protocol';
import type { ConstraintRecord } from '../subsystem/ConstraintStore';

function resolveAnnotationStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.annotationStore ?? (ctx as any)?.annotationStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
}

function resolveConstraintStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.constraintStore ?? (ctx as any)?.constraintStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.constraintStore ?? null : null;
}

function resolveConstraintSolver(ctx: CommandContext | undefined): any | null {
    const fromCtx = (ctx as any)?.constraintSolver;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.constraintSolver ?? null : null;
}

function resolveResolverStores(ctx: CommandContext | undefined): any | null {
    const fromCtx = (ctx as any)?.resolverStores;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.resolverStores ?? null : null;
}

export class UpdateConstraintCommand implements Command {
    readonly affectedStores = ["annotation"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_CONSTRAINT;
    timestamp = Date.now();
    targetIds: string[] = [];

    private _prevRecords: ConstraintRecord[] = [];

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!resolveAnnotationStore(ctx)) return { ok: false, reason: 'AnnotationStore not initialised' };
        if (!resolveConstraintStore(ctx)) return { ok: false, reason: 'ConstraintStore not initialised' };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const annotationStore  = resolveAnnotationStore(ctx);
        const constraintStore  = resolveConstraintStore(ctx);
        const constraintSolver = resolveConstraintSolver(ctx);
        const resolverStores   = resolveResolverStores(ctx);
        if (!annotationStore || !constraintStore) {
            return { success: false, affectedElementIds: [], error: 'Stores not initialised' };
        }
        this._prevRecords = constraintStore.all.map((r: ConstraintRecord) => ({
            ...r, references: [r.references[0], r.references[1]],
        }));
        const lockedDims = (annotationStore.getAll() as any[]).filter(
            (ann: any) => ann.type === 'linear-dim' && ann.parameters?.isLocked
        );
        const affectedIds: string[] = [];
        for (const ann of lockedDims) {
            constraintStore.deleteByAnnotationId(ann.id);
            const record = constraintStore.createFromAnnotation(ann);
            if (record) affectedIds.push(ann.id);
        }
        this.targetIds = affectedIds;
        if (constraintSolver && resolverStores) {
            constraintSolver.checkAll(constraintStore, resolverStores);
        } else {
            constraintStore.notifyListeners();
        }
        return { success: true, affectedElementIds: affectedIds };
    }

    undo(ctx: CommandContext): CommandResult {
        const constraintStore = resolveConstraintStore(ctx);
        if (!constraintStore) return { success: false, affectedElementIds: [], error: 'ConstraintStore not initialised' };
        constraintStore.clear();
        for (const record of this._prevRecords) {
            if (typeof constraintStore.restoreRecord === 'function') {
                constraintStore.restoreRecord(record);
            } else {
                const annotationStore = resolveAnnotationStore(ctx);
                if (annotationStore) {
                    const ann = annotationStore.getById(record.sourceAnnotationId);
                    if (ann) constraintStore.createFromAnnotation(ann);
                }
            }
        }
        const constraintSolver = resolveConstraintSolver(ctx);
        const resolverStores   = resolveResolverStores(ctx);
        if (constraintSolver && resolverStores) {
            constraintSolver.checkAll(constraintStore, resolverStores);
        } else {
            constraintStore.notifyListeners();
        }
        return { success: true, affectedElementIds: this.targetIds };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type, payload: {},
            targetIds: this.targetIds, timestamp: this.timestamp, version: 1,
        };
    }
}
