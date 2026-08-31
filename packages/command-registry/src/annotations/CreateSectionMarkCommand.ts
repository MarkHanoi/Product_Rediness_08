/**
 * DOC-2.7 — CreateSectionMarkCommand
 *
 * F-P5-04 inversion (LANE B, 2026-08-31): the class body moved DOWN from
 * `plugins/annotations/src/commands/` into this file, which until then was a
 * re-export shim pointing UP at the plugin — the exact upward import the
 * inversion removes. The plugin keeps a same-path shim routed through
 * `@pryzm/plugin-sdk`, so no consumer sees a path change.
 *
 * Protocol: `../types` (adopted from the plugin's `legacy-command-protocol`
 * copy — the enum literals are string-identical by that file's own design).
 * P8: execute() emits a span (sibling idiom: UpdateAnnotationCommand).
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import {
    makeAnnotationElement,
    viewDefinitionStore as viewDefinitionStoreSingleton,
    viewIntentInstanceStore as viewIntentInstanceStoreSingleton,
} from '@pryzm/core-app-model';
import type { ViewSpatialContext } from '@pryzm/core-app-model';
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
function resolveViewDefinitionStore(ctx: CommandContext | undefined): any {
    return ctx?.stores?.viewDefinitionStore ?? viewDefinitionStoreSingleton;
}
function resolveViewIntentInstanceStore(ctx: CommandContext | undefined): any {
    return ctx?.stores?.viewIntentInstanceStore ?? viewIntentInstanceStoreSingleton;
}
function resolveVgGovernanceStore(ctx: CommandContext | undefined): any | null {
    return ctx?.stores?.vgGovernanceStore
        ?? (typeof window !== 'undefined' ? window.vgGovernanceStore ?? null : null);
}

export interface CreateSectionMarkParams {
    sectionViewId: string;
    sectionViewName: string;
    sectionSpatial?: ViewSpatialContext;
    annotationId: string;
    hostViewId: string;
    cutPointA: { x: number; y: number; z: number };
    cutPointB: { x: number; y: number; z: number };
    tailDirection: { x: number; z: number };
}

export class CreateSectionMarkCommand implements Command {
    readonly affectedStores = ['view', 'annotation'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_SECTION_MARK;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: CreateSectionMarkParams) {
        this.targetIds = [params.sectionViewId, params.annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.params.sectionViewId?.trim()) return { ok: false, reason: 'sectionViewId must be a non-empty string.' };
        if (!this.params.hostViewId?.trim()) return { ok: false, reason: 'hostViewId must be a non-empty string.' };
        const viewStore = resolveViewDefinitionStore(ctx);
        if (viewStore.has(this.params.sectionViewId)) return { ok: false, reason: `A view with id '${this.params.sectionViewId}' already exists.` };
        const annStore = resolveAnnotationStore(ctx);
        if (annStore?.has(this.params.annotationId)) return { ok: false, reason: `Annotation ${this.params.annotationId} already exists.` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.annotation.section_mark.create', (span) => {
            try {
                const viewStore   = resolveViewDefinitionStore(ctx);
                const intentStore = resolveViewIntentInstanceStore(ctx);
                const vgStore     = resolveVgGovernanceStore(ctx);
                const view = viewStore.create({
                    id: this.params.sectionViewId, name: this.params.sectionViewName,
                    viewType: 'section', spatial: this.params.sectionSpatial,
                });
                if (!view) { span.end(); return { success: false, affectedElementIds: [], error: 'Failed to create section ViewDefinition.' }; }
                intentStore.assign(this.params.sectionViewId);
                if (vgStore && typeof vgStore.ensureView === 'function') {
                    vgStore.ensureView(this.params.sectionViewId, this.params.sectionViewName, 'model-default');
                }
                const { cutPointA, cutPointB, tailDirection } = this.params;
                const midPt = { x: (cutPointA.x + cutPointB.x) / 2, y: (cutPointA.y + cutPointB.y) / 2, z: (cutPointA.z + cutPointB.z) / 2 };
                const ann = makeAnnotationElement(
                    this.params.annotationId, 'section-mark', this.params.hostViewId, [],
                    { modelPoints: [cutPointA, cutPointB, midPt], offset: 0 },
                    { linkedViewId: this.params.sectionViewId, cutPointA, cutPointB, tailDirection }
                );
                const annStore = resolveAnnotationStore(ctx);
                if (!annStore) {
                    intentStore.delete(this.params.sectionViewId);
                    viewStore.delete(this.params.sectionViewId);
                    span.end();
                    return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised.' };
                }
                annStore.add(ann);
                span.setAttribute('pryzm.annotation.id', this.params.annotationId);
                span.end();
                return { success: true, affectedElementIds: [this.params.sectionViewId, this.params.annotationId] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    undo(ctx: CommandContext): CommandResult {
        const annStore    = resolveAnnotationStore(ctx);
        const viewStore   = resolveViewDefinitionStore(ctx);
        const intentStore = resolveViewIntentInstanceStore(ctx);
        annStore?.remove(this.params.annotationId);
        intentStore.delete(this.params.sectionViewId);
        viewStore.delete(this.params.sectionViewId);
        return { success: true, affectedElementIds: [this.params.sectionViewId, this.params.annotationId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { params: this.params }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}
