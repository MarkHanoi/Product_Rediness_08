/**
 * DOC-2.8 — CreateCalloutDetailCommand
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
import { makeAnnotationElement, viewDefinitionStore as viewDefinitionStoreSingleton } from '@pryzm/core-app-model';
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
function resolveVgGovernanceStore(ctx: CommandContext | undefined): any | null {
    return ctx?.stores?.vgGovernanceStore
        ?? (typeof window !== 'undefined' ? window.vgGovernanceStore ?? null : null);
}

export interface CreateCalloutDetailParams {
    detailViewId: string;
    detailViewName: string;
    detailSpatial?: ViewSpatialContext;
    parentViewId: string;
    annotationId: string;
    hostViewId: string;
    cropPoints: { x: number; y: number; z: number }[];
    leaderPoint?: { x: number; y: number; z: number };
}

export class CreateCalloutDetailCommand implements Command {
    readonly affectedStores = ['view', 'annotation'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_CALLOUT_DETAIL;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: CreateCalloutDetailParams) {
        this.targetIds = [params.detailViewId, params.annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.params.detailViewId?.trim()) return { ok: false, reason: 'detailViewId must be a non-empty string.' };
        if (!this.params.hostViewId?.trim()) return { ok: false, reason: 'hostViewId must be a non-empty string.' };
        if (!this.params.cropPoints || this.params.cropPoints.length < 2) return { ok: false, reason: 'cropPoints must have at least 2 points.' };
        const viewStore = resolveViewDefinitionStore(ctx);
        if (viewStore.has(this.params.detailViewId)) return { ok: false, reason: `A view with id '${this.params.detailViewId}' already exists.` };
        const annStore = resolveAnnotationStore(ctx);
        if (annStore?.has(this.params.annotationId)) return { ok: false, reason: `Annotation ${this.params.annotationId} already exists.` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.annotation.callout_detail.create', (span) => {
            try {
                const viewStore = resolveViewDefinitionStore(ctx);
                const vgStore   = resolveVgGovernanceStore(ctx);
                const spatial: ViewSpatialContext = { ...this.params.detailSpatial } as ViewSpatialContext;
                const view = viewStore.create({
                    id: this.params.detailViewId, name: this.params.detailViewName,
                    viewType: 'detail', spatial, intent: `callout:parentView=${this.params.parentViewId}`,
                });
                if (!view) { span.end(); return { success: false, affectedElementIds: [], error: 'Failed to create detail ViewDefinition.' }; }
                if (vgStore && typeof vgStore.ensureView === 'function') {
                    vgStore.ensureView(this.params.detailViewId, this.params.detailViewName, 'model-default');
                }
                const centreX = this.params.cropPoints.reduce((s, p) => s + p.x, 0) / this.params.cropPoints.length;
                const centreZ = this.params.cropPoints.reduce((s, p) => s + p.z, 0) / this.params.cropPoints.length;
                const centreY = this.params.cropPoints[0]!.y;
                const ann = makeAnnotationElement(
                    this.params.annotationId, 'callout-detail', this.params.hostViewId, [],
                    { modelPoints: this.params.leaderPoint ? [...this.params.cropPoints, this.params.leaderPoint] : this.params.cropPoints, offset: 0 },
                    { linkedViewId: this.params.detailViewId, parentViewId: this.params.parentViewId, cropPoints: this.params.cropPoints, leaderPoint: this.params.leaderPoint ?? null, centre: { x: centreX, y: centreY, z: centreZ } }
                );
                const annStore = resolveAnnotationStore(ctx);
                if (!annStore) {
                    viewStore.delete(this.params.detailViewId);
                    span.end();
                    return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised.' };
                }
                annStore.add(ann);
                span.setAttribute('pryzm.annotation.id', this.params.annotationId);
                span.end();
                return { success: true, affectedElementIds: [this.params.detailViewId, this.params.annotationId] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    undo(ctx: CommandContext): CommandResult {
        const annStore  = resolveAnnotationStore(ctx);
        const viewStore = resolveViewDefinitionStore(ctx);
        annStore?.remove(this.params.annotationId);
        viewStore.delete(this.params.detailViewId);
        return { success: true, affectedElementIds: [this.params.detailViewId, this.params.annotationId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { params: this.params }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}
