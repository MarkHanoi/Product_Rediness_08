/**
 * §ANN — CreateAnnotationCommand
 *
 * F-P5-04 inversion (LANE B, 2026-08-31): the class body moved DOWN from
 * `plugins/annotations/src/commands/` into this file, which until then was a
 * re-export shim pointing UP at the plugin — the exact upward import the
 * inversion removes. The plugin keeps a same-path shim routed through
 * `@pryzm/plugin-sdk`, so no consumer sees a path change.
 *
 * Protocol: `../types` (adopted from the plugin's `legacy-command-protocol`
 * copy — the enum literals are string-identical by that file's own design).
 * P8: execute() emits a span (sibling idiom: UpdateDoorSystemTypeCommand).
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import type { AnnotationElement } from '@pryzm/core-app-model';
import { trace, type Tracer } from '@opentelemetry/api';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

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
        return _tracer().startActiveSpan('pryzm.annotation.create', (span) => {
            try {
                const store = resolveAnnotationStore(ctx);
                if (!store) { span.end(); return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' }; }
                store.add(this._element);
                span.setAttribute('pryzm.annotation.id', this._element.id);
                span.setAttribute('pryzm.annotation.type', this._element.type);
                span.end();
                return { success: true, affectedElementIds: [this._element.id] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
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
