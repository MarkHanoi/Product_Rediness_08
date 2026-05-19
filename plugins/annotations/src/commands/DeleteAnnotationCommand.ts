/**
 * §ANN — DeleteAnnotationCommand
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

export class DeleteAnnotationCommand implements Command {
    readonly affectedStores = ["annotation"] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    private _snapshot: AnnotationElement | null = null;

    constructor(private _annotationId: string) {
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
            this._snapshot = (typeof structuredClone === 'function')
                ? structuredClone(existing)
                : JSON.parse(JSON.stringify(existing));
        } catch {
            this._snapshot = JSON.parse(JSON.stringify(existing));
        }
        store.remove(this._annotationId);
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store || !this._snapshot) {
            return { success: false, affectedElementIds: [], error: 'Cannot undo: snapshot missing' };
        }
        store.add(this._snapshot);
        return { success: true, affectedElementIds: [this._annotationId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { annotationId: this._annotationId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
