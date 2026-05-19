/**
 * §ANN-C3 — LockAnnotationCommand
 *
 * Moved from src/engine/subsystems/commands/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../legacy-command-protocol';

function resolveAnnotationStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.annotationStore ?? (ctx as any)?.annotationStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
}

export interface LockAnnotationOptions {
    lock: boolean;
    constraintType?: 'hard' | 'soft';
    currentDistanceMetres?: number;
}

export class LockAnnotationCommand implements Command {
    readonly affectedStores = ["annotation"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.LOCK_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    private _prevParameters: Record<string, any> | null = null;

    constructor(
        private _annotationId: string,
        private _opts: LockAnnotationOptions
    ) {
        this.targetIds = [_annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { ok: false, reason: 'AnnotationStore not initialised' };
        const ann = store.getById(this._annotationId);
        if (!ann)  return { ok: false, reason: `Annotation ${this._annotationId} not found` };
        if (ann.type !== 'linear-dim') {
            return { ok: false, reason: 'LockAnnotationCommand only applies to linear-dim annotations' };
        }
        if (this._opts.lock && (this._opts.currentDistanceMetres ?? 0) <= 0) {
            return { ok: false, reason: 'currentDistanceMetres must be > 0 when locking a dimension' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' };
        const ann = store.getById(this._annotationId);
        if (!ann)  return { success: false, affectedElementIds: [], error: 'Annotation not found' };
        this._prevParameters = { ...ann.parameters };
        const nextParams: Record<string, any> = { ...ann.parameters };
        if (this._opts.lock) {
            nextParams.isLocked               = true;
            nextParams.constraintType         = this._opts.constraintType ?? 'soft';
            nextParams.constraintOperator     = '==';
            nextParams.constraintValueMetres  = this._opts.currentDistanceMetres!;
        } else {
            nextParams.isLocked = false;
        }
        store.update({ id: this._annotationId, parameters: nextParams });
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store || !this._prevParameters) {
            return { success: false, affectedElementIds: [], error: 'Cannot undo: snapshot missing' };
        }
        store.update({ id: this._annotationId, parameters: this._prevParameters });
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { annotationId: this._annotationId, opts: this._opts },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
