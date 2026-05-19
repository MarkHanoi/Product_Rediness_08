import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
// [F-1.2] R2/R3 dual-write — commandManager is authoritative for WallRebuildCoordinator.
import {
    ALL_WALL_FACE_TYPES,
    computeWallCoreOffsets,
    wallFaceSignedOffset,
    type WallFaceType,
} from '@pryzm/plugin-annotations';

const GRID_SNAP_M = 0.05;
const PARALLEL_TOL = 0.985;

type AlignPhase = 'pick-source' | 'pick-target';
type Pt = { x: number; z: number };

interface AlignRef {
    elementId: string;
    elementType: string;
    label: string;
    origin: Pt;
    normal: Pt;
    tangent: Pt;
    a: Pt;
    b: Pt;
}

function snap(v: number): number {
    return Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;
}

function len(x: number, z: number): number {
    return Math.hypot(x, z);
}

function norm(x: number, z: number): Pt {
    const l = len(x, z);
    return l < 0.0001 ? { x: 1, z: 0 } : { x: x / l, z: z / l };
}

function dot(a: Pt, b: Pt): number {
    return a.x * b.x + a.z * b.z;
}

function distToPlane(ref: AlignRef, pt: WorldPoint): number {
    return Math.abs(dot(ref.normal, { x: pt.worldX, z: pt.worldZ }) - dot(ref.normal, ref.origin));
}

function refLabel(label: string): string {
    return label.replace('face:', '').replace('wall:', '').replace('core:', 'core ');
}

export class AlignPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _phase: AlignPhase = 'pick-source';
    private _sourceRef: AlignRef | null = null;
    private _hoverRef: AlignRef | null = null;
    private _cursorPt: WorldPoint | null = null;
    private _sourceId: string | null = null;
    private _sourceType: string | null = null;
    private _tabIndex = 0;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._phase = 'pick-source';
        this._sourceRef = null;
        this._hoverRef = null;
        this._cursorPt = null;
        this._tabIndex = 0;
        this._readSelection();
        this.redraw();
        console.log('[AlignTool] Activated', this._sourceId, this._sourceType);
    }

    deactivate(): void {
        this._clearOverlay();
        this._ctx = null;
        this._phase = 'pick-source';
        this._sourceRef = null;
        this._hoverRef = null;
        this._cursorPt = null;
        this._sourceId = null;
        this._sourceType = null;
        this._tabIndex = 0;
        window.runtime?.events?.emit('bim-operation-cancelled', { operationId: 'align' }); // F.events.10
    }

    cancel(): void {
        this._phase = 'pick-source';
        this._sourceRef = null;
        this._hoverRef = null;
        this._tabIndex = 0;
        this.redraw();
        console.log('[AlignTool] Cancelled');
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        this._hoverRef = this._pickReference(pt);
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        if (!this._sourceId) this._readSelection();
        const ref = this._pickReference(pt);
        if (!ref) {
            console.warn('[AlignTool] No reference plane under cursor');
            return;
        }
        if (this._phase === 'pick-source') {
            if (!this._sourceId || ref.elementId !== this._sourceId) {
                console.warn('[AlignTool] First reference must be on the selected source element');
                return;
            }
            this._sourceRef = ref;
            this._phase = 'pick-target';
            this._tabIndex = 0;
            this._hoverRef = null;
            this.redraw();
            console.log('[AlignTool] Source reference picked', ref.label);
            return;
        }
        if (!this._sourceRef) return;
        if (ref.elementId === this._sourceRef.elementId) {
            console.warn('[AlignTool] Target must be a different element');
            return;
        }
        if (Math.abs(dot(this._sourceRef.normal, ref.normal)) < PARALLEL_TOL) {
            console.warn('[AlignTool] Reference planes are not parallel');
            return;
        }
        const sourceOffset = dot(this._sourceRef.normal, this._sourceRef.origin);
        const targetOffset = dot(this._sourceRef.normal, ref.origin);
        const delta = sourceOffset - targetOffset;
        const dx = snap(this._sourceRef.normal.x * delta);
        const dz = snap(this._sourceRef.normal.z * delta);
        void this._commitMove(ref.elementId, ref.elementType, dx, dz);
        const overlay = window.planViewToolOverlay;
        setTimeout(() => overlay?.setActiveTool?.('none'), 0);
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Tab') {
            e.preventDefault();
            this._tabIndex++;
            if (this._cursorPt) this._hoverRef = this._pickReference(this._cursorPt);
            this.redraw();
            return true;
        }
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        return false;
    }

    redraw(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        if (this._sourceRef) this._drawRef(ctx, planCanvas, this._sourceRef, '#22c55e', 'Fixed: ' + refLabel(this._sourceRef.label));
        if (this._hoverRef) {
            const parallel = !this._sourceRef || Math.abs(dot(this._sourceRef.normal, this._hoverRef.normal)) >= PARALLEL_TOL;
            this._drawRef(ctx, planCanvas, this._hoverRef, parallel ? '#1E90FF' : '#ef4444', refLabel(this._hoverRef.label));
            if (this._sourceRef && parallel) {
                const sourceOffset = dot(this._sourceRef.normal, this._sourceRef.origin);
                const targetOffset = dot(this._sourceRef.normal, this._hoverRef.origin);
                const delta = sourceOffset - targetOffset;
                const dx = snap(this._sourceRef.normal.x * delta);
                const dz = snap(this._sourceRef.normal.z * delta);
                this._drawGhost(ctx, planCanvas, this._hoverRef, dx, dz);
            }
        }
        if (!this._cursorPt) return;
        const sc = planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ);
        const text = this._phase === 'pick-source'
            ? 'Pick fixed reference plane on selected element'
            : 'Pick moving reference plane  (Tab cycles)';
        this._drawHUDLabel(ctx, sc.sx + 16, sc.sy - 10, text, this._phase === 'pick-source' ? '#22c55e' : '#1E90FF');
        this._drawCrosshair(ctx, sc.sx, sc.sy, this._phase === 'pick-source' ? '#22c55e' : '#1E90FF');
    }

    private _pickReference(pt: WorldPoint): AlignRef | null {
        if (!this._ctx) return null;
        if (this._phase === 'pick-source') {
            if (!this._sourceId || !this._sourceType) return null;
            const refs = this._refsFor(this._sourceId, this._sourceType);
            return this._cycleNearest(refs, pt);
        }
        const sc = this._ctx.planCanvas.worldToScreen(pt.worldX, pt.worldZ);
        const id = this._ctx.planCanvas.hitTest(sc.sx, sc.sy, 18);
        if (!id) return null;
        const resolved = this._resolveElement(id);
        if (!resolved) return null;
        const refs = this._refsFor(resolved.id, resolved.type);
        return this._cycleNearest(refs, pt);
    }

    private _cycleNearest(refs: AlignRef[], pt: WorldPoint): AlignRef | null {
        if (!refs.length) return null;
        const sorted = [...refs].sort((a, b) => distToPlane(a, pt) - distToPlane(b, pt));
        return sorted[this._tabIndex % sorted.length] ?? sorted[0];
    }

    private _refsFor(id: string, type: string): AlignRef[] {
        switch (type) {
            case 'wall': return this._wallRefs(id);
            case 'curtain-wall':
            case 'curtainwall': return this._linearRefs(id, type, window.curtainWallStore, 'baseLine', 0.12); // TODO(TASK-08)
            case 'beam': return this._linearRefs(id, type, window.beamStore, null, 0.3); // TODO(TASK-08)
            case 'column': return this._boxRefs(id, type, window.columnStore); // TODO(TASK-08)
            case 'furniture': return this._boxRefs(id, type, window.furnitureStore); // TODO(TASK-08)
            case 'slab': return this._polygonRefs(id, type, window.slabStore, 'polygon'); // TODO(TASK-08)
            case 'floor': return this._polygonRefs(id, type, window.floorStore, 'floor'); // TODO(TASK-08)
            case 'ceiling': return this._polygonRefs(id, type, window.ceilingStore, 'ceiling'); // TODO(TASK-08)
            default: return [];
        }
    }

    private _wallRefs(id: string): AlignRef[] {
        const store = window.wallStore; // TODO(TASK-08)
        const wall = store?.getById?.(id);
        const bl = wall?.baseLine;
        if (!bl || bl.length < 2) return [];
        const a = { x: bl[0].x, z: bl[0].z };
        const b = { x: bl[1].x, z: bl[1].z };
        const tangent = norm(b.x - a.x, b.z - a.z);
        const normal = norm(tangent.z, -tangent.x);
        const half = (wall.thickness ?? 0.2) * 0.5;
        const core = computeWallCoreOffsets(wall.layers);
        return ALL_WALL_FACE_TYPES.map((faceType: WallFaceType) => {
            const off = wallFaceSignedOffset(faceType, half, core.exteriorFinish, core.interiorFinish);
            const pa = { x: a.x + normal.x * off, z: a.z + normal.z * off };
            const pb = { x: b.x + normal.x * off, z: b.z + normal.z * off };
            return { elementId: id, elementType: 'wall', label: faceType, origin: pa, normal, tangent, a: pa, b: pb };
        });
    }

    private _linearRefs(id: string, type: string, store: any, baseLineKey: string | null, defaultWidth: number): AlignRef[] {
        const el = store?.get?.(id) ?? store?.getById?.(id);
        if (!el) return [];
        const bl = baseLineKey ? el[baseLineKey] : [el.startPoint, el.endPoint];
        if (!bl?.[0] || !bl?.[1]) return [];
        const a0 = { x: bl[0].x, z: bl[0].z };
        const b0 = { x: bl[1].x, z: bl[1].z };
        const tangent = norm(b0.x - a0.x, b0.z - a0.z);
        const normal = norm(tangent.z, -tangent.x);
        const half = (el.thickness ?? el.width ?? defaultWidth) * 0.5;
        return [
            this._makeLinearRef(id, type, 'left face', a0, b0, normal, tangent, half),
            this._makeLinearRef(id, type, 'centerline', a0, b0, normal, tangent, 0),
            this._makeLinearRef(id, type, 'right face', a0, b0, normal, tangent, -half),
        ];
    }

    private _makeLinearRef(id: string, type: string, label: string, a0: Pt, b0: Pt, normal: Pt, tangent: Pt, off: number): AlignRef {
        const a = { x: a0.x + normal.x * off, z: a0.z + normal.z * off };
        const b = { x: b0.x + normal.x * off, z: b0.z + normal.z * off };
        return { elementId: id, elementType: type, label, origin: a, normal, tangent, a, b };
    }

    private _boxRefs(id: string, type: string, store: any): AlignRef[] {
        const el = store?.get?.(id) ?? store?.getById?.(id);
        const p = el?.position;
        if (!p) return [];
        const w = el.width ?? el.dimensions?.width ?? el.size?.x ?? (el.radius ? el.radius * 2 : 0.6);
        const d = el.depth ?? el.dimensions?.depth ?? el.size?.z ?? el.dimensions?.length ?? 0.6;
        return this._boundsRefs(id, type, p.x - w / 2, p.x + w / 2, p.z - d / 2, p.z + d / 2);
    }

    private _polygonRefs(id: string, type: string, store: any, mode: string): AlignRef[] {
        const el = store?.get?.(id) ?? store?.getById?.(id);
        const raw = mode === 'polygon'
            ? el?.polygon
            : (el?.boundary?.polygon ?? el?.polygon ?? el?.points);
        if (!raw?.length) return [];
        const pts = raw.map((p: any) => ({ x: p.x, z: p.z ?? p.y ?? 0 }));
        const xs = pts.map((p: Pt) => p.x);
        const zs = pts.map((p: Pt) => p.z);
        return this._boundsRefs(id, type, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs));
    }

    private _boundsRefs(id: string, type: string, minX: number, maxX: number, minZ: number, maxZ: number): AlignRef[] {
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        return [
            { elementId: id, elementType: type, label: 'left plane', origin: { x: minX, z: cz }, normal: { x: 1, z: 0 }, tangent: { x: 0, z: 1 }, a: { x: minX, z: minZ }, b: { x: minX, z: maxZ } },
            { elementId: id, elementType: type, label: 'center X plane', origin: { x: cx, z: cz }, normal: { x: 1, z: 0 }, tangent: { x: 0, z: 1 }, a: { x: cx, z: minZ }, b: { x: cx, z: maxZ } },
            { elementId: id, elementType: type, label: 'right plane', origin: { x: maxX, z: cz }, normal: { x: 1, z: 0 }, tangent: { x: 0, z: 1 }, a: { x: maxX, z: minZ }, b: { x: maxX, z: maxZ } },
            { elementId: id, elementType: type, label: 'front plane', origin: { x: cx, z: minZ }, normal: { x: 0, z: 1 }, tangent: { x: 1, z: 0 }, a: { x: minX, z: minZ }, b: { x: maxX, z: minZ } },
            { elementId: id, elementType: type, label: 'center Z plane', origin: { x: cx, z: cz }, normal: { x: 0, z: 1 }, tangent: { x: 1, z: 0 }, a: { x: minX, z: cz }, b: { x: maxX, z: cz } },
            { elementId: id, elementType: type, label: 'back plane', origin: { x: cx, z: maxZ }, normal: { x: 0, z: 1 }, tangent: { x: 1, z: 0 }, a: { x: minX, z: maxZ }, b: { x: maxX, z: maxZ } },
        ];
    }

    private _resolveElement(id: string): { id: string; type: string } | null {
        const checks: Array<[string, any, string[]]> = [
            ['wall', window.wallStore, ['getById', 'get']], // TODO(TASK-08)
            ['curtain-wall', window.curtainWallStore, ['getById', 'get']], // TODO(TASK-08)
            ['beam', window.beamStore, ['get', 'getById']], // TODO(TASK-08)
            ['column', window.columnStore, ['get', 'getById']], // TODO(TASK-08)
            ['furniture', window.furnitureStore, ['get', 'getById']], // TODO(TASK-08)
            ['slab', window.slabStore, ['getById', 'get']], // TODO(TASK-08)
            ['floor', window.floorStore, ['getById', 'get']], // TODO(TASK-08)
            ['ceiling', window.ceilingStore, ['getById', 'get']], // TODO(TASK-08)
        ];
        for (const [type, store, methods] of checks) {
            for (const m of methods) if (store?.[m]?.(id)) return { id, type };
        }
        return null;
    }

    private async _commitMove(id: string, type: string, dx: number, dz: number): Promise<void> {
        if (Math.hypot(dx, dz) < 0.001) return;
        switch (type) {
            case 'wall': return this._moveWall(id, dx, dz);
            case 'curtain-wall':
            case 'curtainwall': return this._moveCurtainWall(id, dx, dz);
            case 'beam': return this._moveBeam(id, dx, dz);
            case 'column': return this._moveColumn(id, dx, dz);
            case 'furniture': return this._moveFurniture(id, dx, dz);
            case 'slab': return this._moveSlab(id, dx, dz);
            case 'floor': return this._moveFloor(id, dx, dz);
            case 'ceiling': return this._moveCeiling(id, dx, dz);
        }
    }

    private async _moveWall(id: string, dx: number, dz: number): Promise<void> {
        const wall = window.wallStore?.getById?.(id); // TODO(TASK-08)
        const prev = wall?.baseLine;
        if (!prev) return;
        const next: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [
            { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
            { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
        ];
        // [F-1.2 R2/R3 §E.5.x] BUS-PRIMARY — bus handler bridges to commandManager.
        // Direct window.commandManager call removed; bus fires UpdateWallBaselineHandler
        // which calls initBusHandlers bridge → commandManager.execute() (undo-stack + voids).
        window.runtime?.bus?.executeCommand('wall.updateBaseline', {
            wallId: id, newBaseLine: next, prevBaseLine: prev,
        })?.catch((e: unknown) => console.error('[AlignTool] wall.updateBaseline failed:', e));
    }

    private async _moveCurtainWall(id: string, dx: number, dz: number): Promise<void> {
        const cw = window.curtainWallStore?.getById?.(id) ?? window.curtainWallStore?.get?.(id); // TODO(TASK-08)
        const prev = cw?.baseLine;
        if (!prev) return;
        const next: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [
            { x: prev[0].x + dx, y: prev[0].y, z: prev[0].z + dz },
            { x: prev[1].x + dx, y: prev[1].y, z: prev[1].z + dz },
        ];
        window.runtime?.bus?.executeCommand('curtainwall.move', { id, updates: { baseLine: next } })
            ?.catch((e: unknown) => console.error('[AlignTool] curtainwall.move failed:', e));
    }

    private async _moveBeam(id: string, dx: number, dz: number): Promise<void> {
        const beam = window.beamStore?.get?.(id) ?? window.beamStore?.getById?.(id); // TODO(TASK-08)
        if (!beam?.startPoint || !beam?.endPoint) return;
        window.runtime?.bus?.executeCommand('beam.update', {
            beamId: id,
            updates: {
                startPoint: { ...beam.startPoint, x: beam.startPoint.x + dx, z: beam.startPoint.z + dz },
                endPoint: { ...beam.endPoint, x: beam.endPoint.x + dx, z: beam.endPoint.z + dz },
            },
        })?.catch((e: unknown) => console.error('[AlignTool] beam.update failed:', e));
    }

    private async _moveColumn(id: string, dx: number, dz: number): Promise<void> {
        const col = window.columnStore?.get?.(id) ?? window.columnStore?.getById?.(id); // TODO(TASK-08)
        if (!col?.position) return;
        window.runtime?.bus?.executeCommand('column.update', { id, updates: { position: { ...col.position, x: col.position.x + dx, z: col.position.z + dz } } })
            ?.catch((e: unknown) => console.error('[AlignTool] column.update failed:', e));
    }

    private async _moveFurniture(id: string, dx: number, dz: number): Promise<void> {
        const item = window.furnitureStore?.get?.(id) ?? window.furnitureStore?.getById?.(id); // TODO(TASK-08)
        if (!item?.position) return;
        window.runtime?.bus?.executeCommand('furniture.updateParameters', { id, position: { ...item.position, x: item.position.x + dx, z: item.position.z + dz } })
            ?.catch((e: unknown) => console.error('[AlignTool] furniture.updateParameters failed:', e));
    }

    private async _moveSlab(id: string, dx: number, dz: number): Promise<void> {
        const slab = window.slabStore?.getById?.(id) ?? window.slabStore?.get?.(id); // TODO(TASK-08)
        if (!slab?.polygon) return;
        const polygon = slab.polygon.map((p: any) => ({ x: p.x + dx, y: p.y + dz }));
        window.runtime?.bus?.executeCommand('slab.updatePolygon', { slabId: id, polygon, holes: slab.holes })
            ?.catch((e: unknown) => console.error('[AlignTool] slab.updatePolygon failed:', e));
    }

    private async _moveFloor(id: string, dx: number, dz: number): Promise<void> {
        const floor = window.floorStore?.getById?.(id) ?? window.floorStore?.get?.(id); // TODO(TASK-08)
        const poly = floor?.boundary?.polygon ?? floor?.polygon ?? floor?.points;
        if (!poly) return;
        const polygon = poly.map((p: any) => ({ x: p.x + dx, z: (p.z ?? p.y ?? 0) + dz }));
        window.runtime?.bus?.executeCommand('floor.update', { floorId: id, updates: { boundary: { ...floor.boundary, polygon } } })
            ?.catch((e: unknown) => console.error('[AlignTool] floor.update failed:', e));
    }

    private async _moveCeiling(id: string, dx: number, dz: number): Promise<void> {
        const ceiling = window.ceilingStore?.getById?.(id) ?? window.ceilingStore?.get?.(id); // TODO(TASK-08)
        const poly = ceiling?.boundary?.polygon ?? ceiling?.polygon ?? ceiling?.points;
        if (!poly) return;
        const polygon = poly.map((p: any) => ({ x: p.x + dx, z: (p.z ?? p.y ?? 0) + dz }));
        window.runtime?.bus?.executeCommand('ceiling.update', { ceilingId: id, updates: { boundary: { ...ceiling.boundary, polygon } } })
            ?.catch((e: unknown) => console.error('[AlignTool] ceiling.update failed:', e));
    }

    private _drawRef(ctx: CanvasRenderingContext2D, planCanvas: any, ref: AlignRef, color: string, label: string): void {
        const a = planCanvas.worldToScreen(ref.a.x, ref.a.z);
        const b = planCanvas.worldToScreen(ref.b.x, ref.b.z);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        this._drawBubbleLabel(ctx, (a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 14, label, color);
        ctx.restore();
    }

    private _drawGhost(ctx: CanvasRenderingContext2D, planCanvas: any, ref: AlignRef, dx: number, dz: number): void {
        const a = planCanvas.worldToScreen(ref.a.x + dx, ref.a.z + dz);
        const b = planCanvas.worldToScreen(ref.b.x + dx, ref.b.z + dz);
        ctx.save();
        ctx.strokeStyle = 'rgba(30,144,255,0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.restore();
    }

    private _drawCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string): void {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.moveTo(sx - 12, sy);
        ctx.lineTo(sx + 12, sy);
        ctx.moveTo(sx, sy - 12);
        ctx.lineTo(sx, sy + 12);
        ctx.stroke();
        ctx.restore();
    }

    private _drawHUDLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
        this._drawBubbleLabel(ctx, sx + ctx.measureText(text).width / 2, sy, text, color);
    }

    private _drawBubbleLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
        ctx.save();
        ctx.font = '600 11px system-ui, sans-serif';
        const w = ctx.measureText(text).width + 12;
        const h = 18;
        ctx.fillStyle = 'rgba(10, 15, 25, 0.82)';
        ctx.beginPath();
        ctx.roundRect?.(sx - w / 2, sy - h / 2, w, h, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    private _clearOverlay(): void {
        if (!this._ctx) return;
        const { ctx, overlayCanvas, dpr } = this._ctx;
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
    }

    private _readSelection(): void {
        const sm = window.selectionManager;
        const obj = sm?.selectedObject ?? null;
        const id = obj?.userData?.id ?? null;
        const type = obj ? ((obj.userData?.elementType ?? obj.userData?.type ?? '') as string).toLowerCase() : null;
        this._sourceId = id;
        this._sourceType = type;
    }
}