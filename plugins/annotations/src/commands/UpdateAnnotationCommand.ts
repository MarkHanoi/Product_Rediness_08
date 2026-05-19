/**
 * §ANN — UpdateAnnotationCommand
 *
 * Moved from src/engine/subsystems/commands/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../legacy-command-protocol';
import { AnnotationElement } from '../subsystem/AnnotationTypes';

function resolveAnnotationStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.annotationStore ?? (ctx as any)?.annotationStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
}

export class UpdateAnnotationCommand implements Command {
    readonly affectedStores = ["annotation"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    private _prevFullRecord: AnnotationElement | null = null;

    constructor(
        private _annotationId: string,
        private _patch: Partial<AnnotationElement>
    ) {
        this.targetIds = [_annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { ok: false, reason: 'AnnotationStore not initialised' };
        if (!store.has(this._annotationId)) {
            return { ok: false, reason: `Annotation ${this._annotationId} not found` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' };
        const existing = store.getById(this._annotationId);
        if (!existing) return { success: false, affectedElementIds: [], error: 'Annotation not found' };
        try {
            this._prevFullRecord = (typeof structuredClone === 'function')
                ? structuredClone(existing)
                : JSON.parse(JSON.stringify(existing));
        } catch {
            this._prevFullRecord = JSON.parse(JSON.stringify(existing));
        }
        store.update({ id: this._annotationId, ...this._patch });
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store || !this._prevFullRecord) {
            return { success: false, affectedElementIds: [], error: 'Cannot undo: snapshot missing' };
        }
        if (store.has(this._annotationId)) store.remove(this._annotationId);
        store.add(this._prevFullRecord);
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { annotationId: this._annotationId, patch: this._patch },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
