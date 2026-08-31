/**
 * §FIX-AUTODIM-SUBSYSTEM-STORE-SINK (L-145) — CreateManyAnnotationsCommand
 *
 * A single composite legacy command that creates N `AnnotationElement`s in the
 * SUBSYSTEM `annotationStore` (the store `PlanViewAnnotationRenderer.getByView`
 * actually draws from) as ONE undoable unit.
 *
 * Why this exists (ADR-0119): the modern bus verb `annotation.create` writes a
 * FLAT `AnnotationData` into the CQRS `AnnotationsState` (id/viewId/kind/anchor/
 * text only — it DROPS `geometry2D`+`references`) and that store is never read by
 * the plan renderer. The renderer reads the subsystem `annotationStore`, whose
 * mutation + undo are owned by this legacy command protocol (the same path the
 * working `LinearDimensionAnnotationTool` uses via `CreateAnnotationCommand`).
 * AutoDimension emits a whole SET, which C11/C24.1 §1.2 require to collapse to a
 * SINGLE undo — so we batch every element into one command (one CommandManager
 * history entry) rather than N `CreateAnnotationCommand`s (N undo steps).
 *
 * §ROOMTAG-ONE-COMMAND (L-1396): `RoomTagAutoPopulator` is the composite's
 * second consumer — one command per automatic tag pass, not one per room.
 *
 * F-P5-04 inversion (LANE B, 2026-08-31): class body moved DOWN from
 * `plugins/annotations/src/commands/` (this path was a re-export shim pointing
 * up at the plugin). The plugin keeps a same-path shim via `@pryzm/plugin-sdk`.
 * Protocol: `../types`. P8: execute() emits a span.
 *
 * Contract compliance:
 *   §01 §2 / P6 — mutation only through a command (never a direct store write from UI)
 *   ADR-0002    — declares affectedStores; resolves the store from ctx (no window-any fallback preferred)
 *   ADR-0061    — element ids are `annotation_<ULID>` (minted by the caller)
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
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

export class CreateManyAnnotationsCommand implements Command {
    readonly affectedStores = ['annotation'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_ANNOTATION;
    timestamp = Date.now();
    targetIds: string[];

    /** Elements actually added by execute() — the exact set undo() must remove. */
    private _added: AnnotationElement[] = [];

    constructor(private _elements: readonly AnnotationElement[]) {
        this.targetIds = _elements.map((e) => e.id);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const store = resolveAnnotationStore(ctx);
        if (!store) return { ok: false, reason: 'AnnotationStore not initialised' };
        if (this._elements.length === 0) return { ok: false, reason: 'No annotations to create' };
        const viewStore = resolveViewDefinitionStore(ctx);
        for (const el of this._elements) {
            if (!el.ownerViewId) {
                return { ok: false, reason: `Annotation ${el.id} must have an ownerViewId` };
            }
            if (viewStore && typeof viewStore.has === 'function' && !viewStore.has(el.ownerViewId)) {
                return { ok: false, reason: `ownerViewId '${el.ownerViewId}' does not exist in viewDefinitionStore` };
            }
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.annotation.createMany', (span) => {
            try {
                const store = resolveAnnotationStore(ctx);
                if (!store) { span.end(); return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised' }; }
                this._added = [];
                for (const el of this._elements) {
                    // Skip ids that already exist so a re-run/redo never double-adds
                    // (store.add() also guards, but tracking _added keeps undo exact).
                    if (typeof store.has === 'function' && store.has(el.id)) continue;
                    store.add(el);
                    this._added.push(el);
                }
                span.setAttribute('pryzm.annotation.count', this._added.length);
                span.end();
                return { success: true, affectedElementIds: this._added.map((e) => e.id) };
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
        // Remove in reverse insertion order so the store returns to its prior state.
        for (let i = this._added.length - 1; i >= 0; i--) {
            store.remove(this._added[i]!.id);
        }
        const removed = this._added.map((e) => e.id);
        return { success: true, affectedElementIds: removed };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { elements: this._elements },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
