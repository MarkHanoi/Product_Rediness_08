/**
 * DrawingPipelineOrchestrator — Contract 23 §14 (main-thread side)
 *
 * Manages the DrawingPipelineWorker lifecycle and provides the main-thread API
 * for submitting pipeline jobs.
 *
 * Contract compliance:
 *   Contract 23 §14 — geometry serialised as Float32Array / Uint32Array (Transferable)
 *   Contract 23 §8  — style snapshot from GraphicsRulesEngine (not from VG stores)
 *   Contract 23 §7.1— resolveStyle() is the ONLY style entry point (engine snapshot)
 */

import * as THREE from '@pryzm/renderer-three/three';
import type * as OBC from '@thatopen/components';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import type { PipelineRequest, PipelineResult, WorkerOutboundMessage, PipelineElementBatch, SerializedRule } from './DrawingPipelineTypes';
import { lookupElementUUID } from '../views/DrawingSelectionIndex';

const DEFAULT_POCHE_FILLS: Record<string, string> = {
    'A-WALL': '#1a1a1a',
    'A-COLS': '#111111',
    'A-FLOR': '#2d2d2d',
    'A-BEAM': '#1a1a1a',
};

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

export interface OrchestratorJobOptions {
    viewId: string;
    sectionFlipV: boolean;
    hWorldAxis: 'x' | 'z';
    pocheFills?: Record<string, string>;
}

type PendingResolver = {
    resolve: (r: PipelineResult) => void;
    reject:  (e: Error)          => void;
};

export class DrawingPipelineOrchestrator {

    private _worker: Worker | null = null;
    private readonly _pending = new Map<string, PendingResolver>();
    private _reqCounter = 0;
    private readonly _activeReq = new Map<string, string>();

    constructor() {
        this._spawnWorker();
    }

    submitJob(
        drawing: OBC.TechnicalDrawing,
        options: OrchestratorJobOptions,
    ): Promise<PipelineResult> {
        const requestId = `req-${++this._reqCounter}`;

        const priorId = this._activeReq.get(options.viewId);
        if (priorId) {
            const prior = this._pending.get(priorId);
            if (prior) {
                this._pending.delete(priorId);
                prior.reject(new Error('DrawingPipeline: superseded by newer request'));
            }
        }
        this._activeReq.set(options.viewId, requestId);

        return new Promise<PipelineResult>((resolve, reject) => {
            this._pending.set(requestId, { resolve, reject });

            try {
                const batches = this._serialiseDrawing(drawing, options);
                const rules   = this._snapshotRules();
                const fills   = { ...DEFAULT_POCHE_FILLS, ...(options.pocheFills ?? {}) };

                const request: PipelineRequest = {
                    type:       'run',
                    requestId,
                    viewId:     options.viewId,
                    batches,
                    rules,
                    pocheFills: fills,
                };

                const transfers: Transferable[] = batches.map(b => b.positions.buffer);

                if (!this._worker) this._spawnWorker();
                this._worker!.postMessage(request, transfers);

            } catch (err: unknown) {
                this._pending.delete(requestId);
                this._activeReq.delete(options.viewId);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }

    dispose(): void {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        for (const { reject } of this._pending.values()) {
            reject(new Error('DrawingPipelineOrchestrator: disposed'));
        }
        this._pending.clear();
        this._activeReq.clear();
    }

    private _spawnWorker(): void {
        try {
            this._worker = new Worker(
                new URL('./DrawingPipelineWorker.ts', import.meta.url),
                { type: 'module' },
            );
            this._worker.onmessage = (evt: MessageEvent<WorkerOutboundMessage>) => {
                this._handleWorkerMessage(evt.data);
            };
            this._worker.onerror = (evt: ErrorEvent) => {
                console.error('[DrawingPipelineOrchestrator] Worker error:', evt.message, evt);
                for (const [id, { reject }] of this._pending) {
                    reject(new Error(`DrawingPipeline worker error: ${evt.message}`));
                    this._pending.delete(id);
                }
                this._worker = null;
                this._spawnWorker();
            };
        } catch (err) {
            console.error('[DrawingPipelineOrchestrator] Failed to spawn worker:', err);
            this._worker = null;
        }
    }

    private _handleWorkerMessage(msg: WorkerOutboundMessage): void {
        const pending = this._pending.get(msg.requestId);
        if (!pending) return;

        this._pending.delete(msg.requestId);

        if (msg.type === 'result') {
            pending.resolve(msg);
        } else {
            pending.reject(new Error(`DrawingPipeline worker: ${msg.message}`));
        }
    }

    private _serialiseDrawing(
        drawing:  OBC.TechnicalDrawing,
        options:  OrchestratorJobOptions,
    ): PipelineElementBatch[] {
        const batches: PipelineElementBatch[] = [];

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;

            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;

            const layerTag = [
                child.userData?.layerName,
                child.name,
                child.parent?.userData?.layerName,
                child.parent?.name,
            ].filter(Boolean).join(' ');

            const elementId = (
                lookupElementUUID(drawing as object, child)
                ?? child.userData?.elementUUID
                ?? child.userData?.elementId
                ?? child.parent?.userData?.elementUUID
                ?? child.parent?.userData?.elementId
                ?? ''
            ) as string;

            const count = posAttr.count;
            const edgeCount = Math.floor(count / 2);
            const positions = new Float32Array(edgeCount * 4);

            let writeIdx = 0;
            for (let i = 0; i + 1 < count; i += 2) {
                let h0: number, v0: number, h1: number, v1: number;

                if (options.sectionFlipV) {
                    h0 = posAttr.getX(i);
                    v0 = -posAttr.getZ(i);
                    h1 = posAttr.getX(i + 1);
                    v1 = -posAttr.getZ(i + 1);
                } else {
                    _tmpV1.set(posAttr.getX(i),     posAttr.getY(i),     posAttr.getZ(i))    .applyMatrix4(mat);
                    _tmpV2.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                    h0 = options.hWorldAxis === 'x' ? _tmpV1.x : _tmpV1.z;
                    v0 = _tmpV1.z;
                    h1 = options.hWorldAxis === 'x' ? _tmpV2.x : _tmpV2.z;
                    v1 = _tmpV2.z;
                }

                positions[writeIdx++] = h0;
                positions[writeIdx++] = v0;
                positions[writeIdx++] = h1;
                positions[writeIdx++] = v1;
            }

            const trimmed = writeIdx < positions.length
                ? positions.slice(0, writeIdx)
                : positions;

            batches.push({ elementId, layerTag, positions: trimmed });
        });

        return batches;
    }

    private _snapshotRules(): SerializedRule[] {
        return graphicsRulesEngine.getRules().map(r => ({
            priority:  r.priority,
            zone:      r.zone,
            category:  r.category,
            viewId:    r.viewId,
            elementId: r.elementId,
            style: {
                widthMm: r.style.widthMm,
                color:   r.style.color,
                dashPx:  r.style.dashPx,
                opacity: r.style.opacity,
            },
        }));
    }
}

export const drawingPipelineOrchestrator = (typeof Worker !== 'undefined')
    ? new DrawingPipelineOrchestrator()
    : null as unknown as DrawingPipelineOrchestrator;
