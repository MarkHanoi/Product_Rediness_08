/**
 * §ANN — DeleteAnnotationCommand
 *
 * F-P5-04 inversion (LANE B, 2026-08-31): class body moved DOWN from
 * `plugins/annotations/src/commands/` (this path was a re-export shim pointing
 * up at the plugin). The plugin keeps a same-path shim via `@pryzm/plugin-sdk`.
 * Protocol: `../types`. P8: execute() emits a span.
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
        return _tracer().startActiveSpan('pryzm.annotation.delete', (span) => {
            try {
                const store = resolveAnnotationStore(ctx);
                if (!store) { span.end(); return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' }; }
                const existing = store.getById(this._annotationId);
                if (!existing) { span.end(); return { success: false, affectedElementIds: [], error: 'Annotation not found' }; }
                try {
                    this._snapshot = (typeof structuredClone === 'function')
                        ? structuredClone(existing)
                        : JSON.parse(JSON.stringify(existing));
                } catch {
                    this._snapshot = JSON.parse(JSON.stringify(existing));
                }
                store.remove(this._annotationId);
                span.setAttribute('pryzm.annotation.id', this._annotationId);
                span.end();
                return { success: true, affectedElementIds: [this._annotationId] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
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
