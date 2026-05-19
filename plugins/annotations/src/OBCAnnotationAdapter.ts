/**
 * DOC-2.1 — OBCAnnotationAdapter
 *
 * Moved from src/engine/subsystems/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 * Command imports updated to use plugin-local commands/.
 */

import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from './subsystem/AnnotationTypes';
import { CreateAnnotationCommand } from './commands/CreateAnnotationCommand';
import { DeleteAnnotationCommand } from './commands/DeleteAnnotationCommand';

export class OBCAnnotationAdapter {
    private _currentDrawing: OBC.TechnicalDrawing | null = null;
    private _currentViewDefId: string | null = null;
    private _uuidToAnnotationId = new Map<string, string>();
    private _unsubscribes: (() => void)[] = [];

    serialize(): { version: 1; entries: Array<[string, string]> } {
        return { version: 1, entries: Array.from(this._uuidToAnnotationId.entries()) };
    }

    deserialize(payload: any): void {
        this._uuidToAnnotationId.clear();
        if (!payload || typeof payload !== 'object') return;
        if (payload.version !== 1) return;
        const list = Array.isArray(payload.entries) ? payload.entries : [];
        for (const e of list) {
            if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') {
                this._uuidToAnnotationId.set(e[0], e[1]);
            }
        }
    }

    setDrawingEditor(editor: any): void {
        const components: OBC.Components | null = editor?.components ?? null;
        if (!components) {
            console.warn('[OBCAnnotationAdapter] setDrawingEditor: editor has no .components — events not subscribed');
            return;
        }
        this._subscribeToLinearAnnotations(components);
        this._subscribeToAngleAnnotations(components);
        this._subscribeToSlopeAnnotations(components);
        console.log('[OBCAnnotationAdapter] DOC-2.1: subscribed to OBC annotation system events');
    }

    attachToDrawing(drawing: OBC.TechnicalDrawing, viewDefId: string): void {
        this._currentDrawing = drawing; this._currentViewDefId = viewDefId;
        console.log(`[OBCAnnotationAdapter] DOC-2.1: attached to drawing for viewDefId="${viewDefId}"`);
    }

    detach(): void { this._currentDrawing = null; this._currentViewDefId = null; }

    private _isObcClassAvailable(klass: any): boolean {
        return !!klass && typeof (klass as any).uuid === 'string' && (klass as any).uuid.length > 0;
    }

    private _subscribeToLinearAnnotations(components: OBC.Components): void {
        if (!this._isObcClassAvailable(OBC.LinearAnnotations)) {
            console.info('[OBCAnnotationAdapter] LinearAnnotations not present in this OBC build — skipping subscribe.'); return;
        }
        try {
            const linearSys = components.get(OBC.LinearAnnotations as any) as unknown as OBC.LinearAnnotations;
            const commitHandler = (items: any[]) => { this._handleLinearCommit(items); };
            const deleteHandler = (uuids: string[]) => { this._handleDelete(uuids); };
            linearSys.onCommit.add(commitHandler); linearSys.onDelete.add(deleteHandler);
            this._unsubscribes.push(() => { linearSys.onCommit.remove(commitHandler); linearSys.onDelete.remove(deleteHandler); });
        } catch (err) { console.info('[OBCAnnotationAdapter] LinearAnnotations subscribe skipped:', (err as Error)?.message ?? err); }
    }

    private _subscribeToAngleAnnotations(components: OBC.Components): void {
        if (!this._isObcClassAvailable(OBC.AngleAnnotations)) {
            console.info('[OBCAnnotationAdapter] AngleAnnotations not present in this OBC build — skipping subscribe.'); return;
        }
        try {
            const angleSys = components.get(OBC.AngleAnnotations as any) as unknown as OBC.AngleAnnotations;
            const commitHandler = (items: any[]) => { this._handleAngleCommit(items); };
            const deleteHandler = (uuids: string[]) => { this._handleDelete(uuids); };
            angleSys.onCommit.add(commitHandler); angleSys.onDelete.add(deleteHandler);
            this._unsubscribes.push(() => { angleSys.onCommit.remove(commitHandler); angleSys.onDelete.remove(deleteHandler); });
        } catch (err) { console.info('[OBCAnnotationAdapter] AngleAnnotations subscribe skipped:', (err as Error)?.message ?? err); }
    }

    private _subscribeToSlopeAnnotations(components: OBC.Components): void {
        if (!this._isObcClassAvailable(OBC.SlopeAnnotations)) {
            console.info('[OBCAnnotationAdapter] SlopeAnnotations not present in this OBC build — skipping subscribe.'); return;
        }
        try {
            const slopeSys = components.get(OBC.SlopeAnnotations as any) as unknown as OBC.SlopeAnnotations;
            const commitHandler = (items: any[]) => { this._handleSlopeCommit(items); };
            slopeSys.onCommit.add(commitHandler);
            this._unsubscribes.push(() => { slopeSys.onCommit.remove(commitHandler); });
        } catch (err) { console.info('[OBCAnnotationAdapter] SlopeAnnotations subscribe skipped:', (err as Error)?.message ?? err); }
    }

    private _handleSlopeCommit(items: { drawing: OBC.TechnicalDrawing; item: any; group: any }[]): void {
        const viewDefId = this._currentViewDefId;
        if (!viewDefId) return;
        for (const { drawing, item, group } of items) {
            if (drawing !== this._currentDrawing) continue;
            const annotationId = crypto.randomUUID();
            const pA = item.pointA ?? item.start ?? { x: 0, y: 0, z: 0 };
            const pB = item.pointB ?? item.end   ?? { x: 1, y: 0, z: 0 };
            const rise = Math.abs(pB.y - pA.y);
            const run  = Math.sqrt(Math.pow(pB.x - pA.x, 2) + Math.pow(pB.z - pA.z, 2));
            const slopeRatio = typeof item.slope === 'number' ? item.slope : (run > 0.001 ? rise / run : 0);
            const slopePercent = slopeRatio * 100;
            const dto = makeAnnotationElement(annotationId, 'slope-dim', viewDefId, [], { modelPoints: [{ x: pA.x, y: pA.y, z: pA.z }, { x: pB.x, y: pB.y, z: pB.z }], offset: 0 }, { slopeRatio, slopePercent, unit: 'percent' });
            if (item.uuid) this._uuidToAnnotationId.set(item.uuid, annotationId);
            this._dispatchCreate(dto); group.clear();
            console.log('[OBCAnnotationAdapter] slope-dim created', annotationId, `slope=${slopePercent.toFixed(1)}%`);
        }
    }

    private _handleLinearCommit(items: { drawing: OBC.TechnicalDrawing; item: any; group: any }[]): void {
        const viewDefId = this._currentViewDefId;
        if (!viewDefId) return;
        for (const { drawing, item, group } of items) {
            if (drawing !== this._currentDrawing) continue;
            const annotationId = crypto.randomUUID();
            const dto = makeAnnotationElement(annotationId, 'linear-dim', viewDefId, [], { modelPoints: [{ x: item.pointA.x, y: item.pointA.y, z: item.pointA.z }, { x: item.pointB.x, y: item.pointB.y, z: item.pointB.z }], offset: typeof item.offset === 'number' ? item.offset : 0 }, { unit: 'mm' });
            if (item.uuid) this._uuidToAnnotationId.set(item.uuid, annotationId);
            this._dispatchCreate(dto); group.clear();
        }
    }

    private _handleAngleCommit(items: { drawing: OBC.TechnicalDrawing; item: any; group: any }[]): void {
        const viewDefId = this._currentViewDefId;
        if (!viewDefId) return;
        for (const { drawing, item, group } of items) {
            if (drawing !== this._currentDrawing) continue;
            const annotationId = crypto.randomUUID();
            const dto = makeAnnotationElement(annotationId, 'angular-dim', viewDefId, [], { modelPoints: [{ x: item.pointA.x, y: item.pointA.y, z: item.pointA.z }, { x: item.vertex.x, y: item.vertex.y, z: item.vertex.z }, { x: item.pointB.x, y: item.pointB.y, z: item.pointB.z }], offset: 0 }, { arcRadius: typeof item.arcRadius === 'number' ? item.arcRadius : 0 });
            if (item.uuid) this._uuidToAnnotationId.set(item.uuid, annotationId);
            this._dispatchCreate(dto); group.clear();
        }
    }

    private _handleDelete(uuids: string[]): void {
        const cm = window.commandManager; // TODO(TASK-06)
        if (!cm) { console.warn('[OBCAnnotationAdapter] commandManager not available for delete'); return; }
        for (const uuid of uuids) {
            const annotationId = this._uuidToAnnotationId.get(uuid);
            if (!annotationId) continue;
            try { cm.execute(new DeleteAnnotationCommand(annotationId)); this._uuidToAnnotationId.delete(uuid); }
            catch (err) { console.error(`[OBCAnnotationAdapter] Delete dispatch failed for uuid=${uuid}:`, err); }
        }
    }

    private _dispatchCreate(dto: ReturnType<typeof makeAnnotationElement>): void {
        const cm = window.commandManager; // TODO(TASK-06)
        if (!cm) { console.warn('[OBCAnnotationAdapter] commandManager not available — annotation not committed'); return; }
        try { cm.execute(new CreateAnnotationCommand(dto)); console.log(`[OBCAnnotationAdapter] DOC-2.1: dispatched CreateAnnotationCommand type=${dto.type} id=${dto.id}`); }
        catch (err) { console.error('[OBCAnnotationAdapter] CreateAnnotationCommand dispatch failed:', err); }
    }

    dispose(): void {
        this.detach();
        for (const unsub of this._unsubscribes) { try { unsub(); } catch { /* ignore */ } }
        this._unsubscribes = []; this._uuidToAnnotationId.clear();
        console.log('[OBCAnnotationAdapter] disposed');
    }
}

export const obcAnnotationAdapter = new OBCAnnotationAdapter();
