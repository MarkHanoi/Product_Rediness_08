/**
 * DOC-2.8 — CreateCalloutDetailCommand
 *
 * Moved from src/engine/subsystems/commands/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../legacy-command-protocol';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { viewDefinitionStore as viewDefinitionStoreSingleton } from '@pryzm/core-app-model';
import type { ViewSpatialContext } from '@pryzm/core-app-model';

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
        const viewStore = resolveViewDefinitionStore(ctx);
        const vgStore   = resolveVgGovernanceStore(ctx);
        const spatial: ViewSpatialContext = { ...this.params.detailSpatial } as ViewSpatialContext;
        const view = viewStore.create({
            id: this.params.detailViewId, name: this.params.detailViewName,
            viewType: 'detail', spatial, intent: `callout:parentView=${this.params.parentViewId}`,
        });
        if (!view) return { success: false, affectedElementIds: [], error: 'Failed to create detail ViewDefinition.' };
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
            return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised.' };
        }
        annStore.add(ann);
        return { success: true, affectedElementIds: [this.params.detailViewId, this.params.annotationId] };
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
