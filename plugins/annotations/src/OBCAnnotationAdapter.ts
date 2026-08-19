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

    /**
     * §FIX-OBC-ANNOTATION-SKIP-MESSAGE (L-1286) — is `klass` usable through the
     * OBC **Component registry** (`components.get`)?
     *
     * ⚠ THIS IS NOT "does the class exist". It asks whether the class is a
     * registrable `Component`, which is the only thing `components.get` can
     * resolve. Measured against the installed `@thatopen/components` **3.4.6**:
     * `LinearAnnotations`, `AngleAnnotations` and `SlopeAnnotations` ALL EXIST
     * (`index.d.ts:4314`, `:84`, `:5677`) but extend `AnnotationSystem`
     * (`:174`), which declares no static `uuid` — and OBC's own examples reach
     * them a different way entirely: `techDrawings.use(OBC.LinearAnnotations)`
     * (`index.d.ts:5926`, `:6294`).
     *
     * So this probe answers `false` for every version in our `^3.4.2` range,
     * permanently, and the boot log's old wording — "not present in this OBC
     * build" — was FACTUALLY WRONG. It sent the reader looking for a version
     * gap that does not exist. See `_logObcSubscribeSkipped`.
     */
    private _isObcClassAvailable(klass: any): boolean {
        return !!klass && typeof (klass as any).uuid === 'string' && (klass as any).uuid.length > 0;
    }

    /**
     * §FIX-OBC-ANNOTATION-SKIP-MESSAGE (L-1286) — one honest sentence for all
     * three skips.
     *
     * ⭐ AND THE PART A READER MOST NEEDS: skipping costs the user NOTHING
     * today. This adapter is a SECOND, optional ingest path — it would capture
     * dimensions drawn through OBC's own `DrawingEditor`. PRYZM's linear /
     * angular / slope dimension tools (`initAnnotationTools.ts`, the
     * `AnnotationRailPanel` buttons) are first-party, fully wired, and commit
     * through the SAME `CreateAnnotationCommand` into the SAME `annotationStore`
     * without touching this file. So this is a dead optional path, NOT a
     * C84 EI-3 "UI offers, pipeline refuses" defect — checked by following all
     * three toolbar buttons to their tools, which import no OBC annotation
     * system at all.
     */
    private _logObcSubscribeSkipped(systemName: string): void {
        console.info(
            `[OBCAnnotationAdapter] ${systemName} is present in OBC but is not a registrable Component ` +
            '(it extends AnnotationSystem, which has no static uuid), so components.get() cannot resolve it — ' +
            'skipping subscribe. HARMLESS: this is the optional OBC-authored ingest path; PRYZM\'s own ' +
            'linear/angular/slope dimension tools are unaffected and remain fully wired.',
        );
    }

    private _subscribeToLinearAnnotations(components: OBC.Components): void {
        if (!this._isObcClassAvailable(OBC.LinearAnnotations)) {
            this._logObcSubscribeSkipped('LinearAnnotations'); return;
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
            this._logObcSubscribeSkipped('AngleAnnotations'); return;
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
            this._logObcSubscribeSkipped('SlopeAnnotations'); return;
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
