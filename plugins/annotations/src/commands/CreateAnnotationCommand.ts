/**
 * §ANN — CreateAnnotationCommand
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

function resolveViewDefinitionStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.viewDefinitionStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.viewDefinitionStore ?? null : null;
}

export class CreateAnnotationCommand implements Command {
    readonly affectedStores = ["annotation"] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private _element: AnnotationElement) {
        this.targetIds = [_element.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { ok: false, reason: 'AnnotationStore not initialised' };
        if (store.has(this._element.id)) {
            return { ok: false, reason: `Annotation ${this._element.id} already exists` };
        }
        if (!this._element.ownerViewId) {
            return { ok: false, reason: 'Annotation must have an ownerViewId' };
        }
        const viewStore = resolveViewDefinitionStore(ctx);
        if (viewStore && typeof viewStore.has === 'function' && !viewStore.has(this._element.ownerViewId)) {
            return { ok: false, reason: `ownerViewId '${this._element.ownerViewId}' does not exist in viewDefinitionStore` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' };
        store.add(this._element);
        return { success: true, affectedElementIds: [this._element.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' };
        store.remove(this._element.id);
        return { success: true, affectedElementIds: [this._element.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { element: this._element },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
