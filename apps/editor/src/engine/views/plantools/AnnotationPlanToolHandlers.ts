/**
 * AnnotationPlanToolHandlers — Plan-view (2D canvas) handlers for all
 * annotation tools that were previously missing from PLAN_TOOL_HANDLERS.
 *
 * BIM-AWARE DESIGN
 * ─────────────────
 * Tags that carry BIM identity (door-tag, window-tag, element-tag, level-tag,
 * grid-bubble) harvest their label automatically from the nearest matching
 * model element — the user never types a label.  Only bespoke-content tools
 * (text-note, keynote, spot-elevation, callout-detail, revision-cloud) open
 * the styled AnnotationInputPanel.
 *
 * INTERACTION MODEL
 * ──────────────────
 * Single-click tools     : text-note, element-tag, door-tag, window-tag,
 *                          spot-elevation, keynote, level-tag, grid-bubble
 * Two-click tools        : radius-dim, diameter-dim, slope-dim, callout-detail
 * Three-click tool       : angular-dim (vertex → rayA → rayB)
 * Multi-click + dblclick : revision-cloud
 */

import { makeAnnotationElement }        from '@pryzm/plugin-annotations';
import { makePointRef }                 from '@pryzm/plugin-annotations';
import { pryzmAnnotationInput }         from '@app/ui/AnnotationInputPanel';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import * as THREE from '@pryzm/renderer-three/three';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _mkPt(wx: number, wz: number) {
    return makePointRef(new THREE.Vector3(wx, 0, wz));
}

function _mp3(wx: number, wz: number) { return { x: wx, y: 0, z: wz }; }

// [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
function _commit(
    type: string,
    viewId: string,
    refs: ReturnType<typeof _mkPt>[],
    modelPoints: { x: number; y: number; z: number }[],
    parameters: Record<string, any> = {},
): void {
    const id  = crypto.randomUUID();
    const ann = makeAnnotationElement(id, type as any, viewId, refs, { modelPoints, offset: 0 }, parameters);
    window.runtime?.bus?.executeCommand('annotation.create', ann)
        ?.then(() => console.log(`[AnnotationHandler] ${type} created`, id))
        ?.catch((e: Error) => console.error(`[AnnotationHandler] ${type} failed:`, e));
}

function _clear(c: PlanToolDrawContext): void {
    c.ctx.setTransform(1, 0, 0, 1, 0, 0);
    c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
}

function _hint(c: PlanToolDrawContext, text: string): void {
    const { ctx, overlayCanvas, dpr } = c;
    const cssH = overlayCanvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(30,58,138,0.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, 12, cssH - 12);
    ctx.restore();
}

function _dot(c: PlanToolDrawContext, pt: WorldPoint, color = '#6600ff', r = 5): void {
    const { sx, sy } = c.planCanvas.worldToScreen(pt.worldX, pt.worldZ);
    c.ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    c.ctx.save();
    c.ctx.fillStyle = color;
    c.ctx.beginPath();
    c.ctx.arc(sx, sy, r, 0, Math.PI * 2);
    c.ctx.fill();
    c.ctx.restore();
}

function _line(c: PlanToolDrawContext, ax: number, az: number, bx: number, bz: number, color = '#6600ff'): void {
    const sA = c.planCanvas.worldToScreen(ax, az);
    const sB = c.planCanvas.worldToScreen(bx, bz);
    c.ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    c.ctx.save();
    c.ctx.strokeStyle = color;
    c.ctx.lineWidth = 1.5;
    c.ctx.setLineDash([5, 4]);
    c.ctx.beginPath();
    c.ctx.moveTo(sA.sx, sA.sy);
    c.ctx.lineTo(sB.sx, sB.sy);
    c.ctx.stroke();
    c.ctx.setLineDash([]);
    c.ctx.restore();
}

// ─── BIM DATA HELPERS ─────────────────────────────────────────────────────────
// These functions read model stores exposed on `window` by initTools.ts.
// They never throw; silently fall back when stores are unavailable.

interface BimCandidate { label: string; pos: { wx: number; wz: number }; elementId: string; }

function _nearestDoor(pt: WorldPoint, radius = 3.0): BimCandidate | null {
    const doorStore = window.doorStore; // TODO(TASK-08)
    const wallStore = window.wallStore; // TODO(TASK-08)
    if (!doorStore?.getAll || !wallStore?.getAll) return null;

    const wallMap = new Map<string, any>();
    for (const w of wallStore.getAll()) wallMap.set(w.id, w);

    let best: BimCandidate | null = null;
    let bestDist = radius;
    let idx = 0;
    for (const door of doorStore.getAll()) {
        idx++;
        const wall = wallMap.get(door.wallId);
        if (!wall?.baseLine) continue;
        const [s0, s1] = wall.baseLine;
        const dx = s1.x - s0.x, dz = s1.z - s0.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        const cx = s0.x + (dx / len) * door.offset;
        const cz = s0.z + (dz / len) * door.offset;
        const dist = Math.hypot(cx - pt.worldX, cz - pt.worldZ);
        if (dist < bestDist) {
            bestDist = dist;
            const mark = door.mark?.trim() || _autoMark('D', idx);
            best = { label: mark, pos: { wx: cx, wz: cz }, elementId: door.id };
        }
    }
    return best;
}

function _nearestWindow(pt: WorldPoint, radius = 3.0): BimCandidate | null {
    const windowStore = window.windowStore; // TODO(TASK-08)
    const wallStore   = window.wallStore; // TODO(TASK-08)
    if (!windowStore?.getAll || !wallStore?.getAll) return null;

    const wallMap = new Map<string, any>();
    for (const w of wallStore.getAll()) wallMap.set(w.id, w);

    let best: BimCandidate | null = null;
    let bestDist = radius;
    let idx = 0;
    for (const win of windowStore.getAll()) {
        idx++;
        const wall = wallMap.get(win.wallId);
        if (!wall?.baseLine) continue;
        const [s0, s1] = wall.baseLine;
        const ddx = s1.x - s0.x, ddz = s1.z - s0.z;
        const len = Math.hypot(ddx, ddz);
        if (len < 0.001) continue;
        const cx = s0.x + (ddx / len) * win.offset;
        const cz = s0.z + (ddz / len) * win.offset;
        const dist = Math.hypot(cx - pt.worldX, cz - pt.worldZ);
        if (dist < bestDist) {
            bestDist = dist;
            const mark = win.mark?.trim() || _autoMark('W', idx);
            best = { label: mark, pos: { wx: cx, wz: cz }, elementId: win.id };
        }
    }
    return best;
}

function _nearestElement(pt: WorldPoint, radius = 3.0): BimCandidate | null {
    // Try doors first, then windows, then columns
    const door = _nearestDoor(pt, radius);
    if (door) return door;
    const win = _nearestWindow(pt, radius);
    if (win) return win;

    const columnStore = window.columnStore; // TODO(TASK-08)
    if (columnStore?.getAll) {
        let bestDist = radius;
        let best: BimCandidate | null = null;
        let idx = 0;
        for (const col of columnStore.getAll()) {
            idx++;
            const cx = col.position?.x ?? 0;
            const cz = col.position?.z ?? 0;
            const dist = Math.hypot(cx - pt.worldX, cz - pt.worldZ);
            if (dist < bestDist) {
                bestDist = dist;
                const mark = col.mark?.trim() || _autoMark('C', idx);
                best = { label: mark, pos: { wx: cx, wz: cz }, elementId: col.id };
            }
        }
        if (best) return best;
    }

    return null;
}

function _nearestGrid(pt: WorldPoint, radius = 5.0): BimCandidate | null {
    const gridStore = window.gridStore; // TODO(TASK-08)
    if (!gridStore?.getAll) return null;
    let best: BimCandidate | null = null;
    let bestDist = radius;
    for (const g of gridStore.getAll()) {
        // Grid is an axis-aligned infinite line at g.position on its axis
        let dist: number;
        let cx: number, cz: number;
        if (g.axis === 'X') {
            dist = Math.abs(g.position - pt.worldZ);
            cx = pt.worldX; cz = g.position;
        } else {
            dist = Math.abs(g.position - pt.worldX);
            cx = g.position; cz = pt.worldZ;
        }
        if (dist < bestDist) {
            bestDist = dist;
            best = { label: g.name ?? g.id, pos: { wx: cx, wz: cz }, elementId: g.id };
        }
    }
    return best;
}

function _levelForView(viewDef: any): { name: string; elevation: number } | null {
    const levelStore = window.levelStore; // TODO(TASK-08)
    if (!levelStore?.getAll) return null;
    // Try to match by levelId from viewDef
    const levels = levelStore.getAll() as any[];
    if (viewDef?.levelId) {
        const lvl = levels.find((l: any) => l.id === viewDef.levelId);
        if (lvl) return { name: lvl.name ?? lvl.label ?? 'Level', elevation: lvl.elevation ?? 0 };
    }
    // Fallback: lowest absolute elevation
    if (levels.length > 0) {
        const l = levels[0];
        return { name: l.name ?? 'Level', elevation: l.elevation ?? 0 };
    }
    return null;
}

function _autoMark(prefix: string, n: number): string {
    return `${prefix}-${String(n).padStart(2, '0')}`;
}

// ─── TEXT NOTE ────────────────────────────────────────────────────────────────

export class TextNotePlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._cursor = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#374151');
        _hint(this._ctx, 'Click to place a text note');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        pryzmAnnotationInput({
            title: 'TEXT NOTE',
            subtitle: 'Bespoke annotation text',
            label: 'Note text',
            placeholder: 'Enter your note…',
            multiline: true,
            confirmLabel: 'Place',
            iconSvg: `<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`,
        }).then(result => {
            if (!result || !result.value) return;
            _commit('text-note', c.viewDef.id,
                [_mkPt(pt.worldX, pt.worldZ)],
                [_mp3(pt.worldX, pt.worldZ)],
                { text: result.value },
            );
            _clear(c);
        });
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._cursor = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── ELEMENT TAG (generic) ────────────────────────────────────────────────────
// Harvests mark from the nearest BIM element — door, window, or column.
// Fallback to a prompt only if no element is found within 3 m.

export class ElementTagPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _nearest: BimCandidate | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._nearest = null; this._cursor = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor  = pt;
        this._nearest = _nearestElement(pt);
        _clear(this._ctx);
        if (this._nearest) {
            _dot(this._ctx, { worldX: this._nearest.pos.wx, worldZ: this._nearest.pos.wz }, '#6600ff', 7);
            _hint(this._ctx, `Click to tag  "${this._nearest.label}"`);
        } else {
            _dot(this._ctx, pt, '#374151');
            _hint(this._ctx, 'Move near a door, window or column · click to tag');
        }
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const near = _nearestElement(pt);
        if (near) {
            _commit('tag', c.viewDef.id,
                [_mkPt(near.pos.wx, near.pos.wz), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(near.pos.wx, near.pos.wz), _mp3(pt.worldX, pt.worldZ)],
                { label: near.label, cachedLabel: near.label, showLeader: true, elementId: near.elementId },
            );
            _clear(c);
        } else {
            // Fallback — no element nearby
            pryzmAnnotationInput({
                title: 'ELEMENT TAG',
                subtitle: 'No element detected at cursor',
                label: 'Tag label',
                placeholder: 'e.g. D-01',
                confirmLabel: 'Place',
            }).then(result => {
                if (!result) return;
                _commit('tag', c.viewDef.id,
                    [_mkPt(pt.worldX, pt.worldZ)],
                    [_mp3(pt.worldX, pt.worldZ)],
                    { label: result.value, cachedLabel: result.value, showLeader: false },
                );
                _clear(c);
            });
        }
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._nearest = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── DOOR TAG ─────────────────────────────────────────────────────────────────
// Snaps to the nearest door within 6 m and auto-fills the door's mark and size.
// Hover preview draws a circle bubble at the snapped door centre so the user
// sees exactly where the tag will land before clicking.

export class DoorTagPlanToolHandler implements PlanToolHandler {
    private _ctx:     PlanToolDrawContext | null = null;
    private _nearest: BimCandidate | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._nearest = null; this._cursor = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor  = pt;
        this._nearest = _nearestDoor(pt, 6);
        _clear(this._ctx);
        const c = this._ctx;
        if (this._nearest) {
            // Draw circle preview at the door centre
            const { sx, sy } = c.planCanvas.worldToScreen(this._nearest.pos.wx, this._nearest.pos.wz);
            const { ctx, dpr } = c;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.strokeStyle = '#1a2035';
            ctx.lineWidth = 1.5;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(sx, sy, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#1a2035';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._nearest.label, sx, sy);
            ctx.restore();
            _hint(c, `Click to place door tag  "${this._nearest.label}"`);
        } else {
            _dot(c, pt, '#374151');
            _hint(c, 'Move near a door · click to place tag');
        }
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const near = _nearestDoor(pt, 6);
        if (near) {
            // Fetch size from doorStore if available
            const door = (window.doorStore?.getAll?.() as any[])?.find((d: any) => d.id === near.elementId); // TODO(TASK-08)
            const wMm = door ? Math.round(door.width * 1000) : 0;
            const hMm = door ? Math.round(door.height * 1000) : 0;
            _commit('door-tag', c.viewDef.id,
                [_mkPt(near.pos.wx, near.pos.wz), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(near.pos.wx, near.pos.wz), _mp3(pt.worldX, pt.worldZ)],
                {
                    label: near.label,
                    cachedLabel: near.label,
                    showLeader: true,
                    elementId: near.elementId,
                    widthMm: wMm,
                    heightMm: hMm,
                },
            );
            _clear(c);
        } else {
            _hint(c, '⚠ No door found nearby — move closer and try again');
        }
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._nearest = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── WINDOW TAG ───────────────────────────────────────────────────────────────
// Snaps to the nearest window within 6 m. Hover preview draws a circle bubble
// with a horizontal divider (visual differentiator from door-tag).

export class WindowTagPlanToolHandler implements PlanToolHandler {
    private _ctx:     PlanToolDrawContext | null = null;
    private _nearest: BimCandidate | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._nearest = null; this._cursor = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor  = pt;
        this._nearest = _nearestWindow(pt, 6);
        _clear(this._ctx);
        const c = this._ctx;
        if (this._nearest) {
            const { sx, sy } = c.planCanvas.worldToScreen(this._nearest.pos.wx, this._nearest.pos.wz);
            const { ctx, dpr } = c;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.strokeStyle = '#0f4c81';
            ctx.lineWidth = 1.5;
            ctx.fillStyle = 'rgba(240,247,255,0.9)';
            ctx.beginPath();
            ctx.arc(sx, sy, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Horizontal divider
            ctx.beginPath();
            ctx.moveTo(sx - 13, sy);
            ctx.lineTo(sx + 13, sy);
            ctx.stroke();
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#0f4c81';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._nearest.label, sx, sy - 4);
            ctx.restore();
            _hint(c, `Click to place window tag  "${this._nearest.label}"`);
        } else {
            _dot(c, pt, '#374151');
            _hint(c, 'Move near a window · click to place tag');
        }
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const near = _nearestWindow(pt, 6);
        if (near) {
            const win = (window.windowStore?.getAll?.() as any[])?.find((w: any) => w.id === near.elementId); // TODO(TASK-08)
            const wMm = win ? Math.round(win.width * 1000) : 0;
            const hMm = win ? Math.round(win.height * 1000) : 0;
            _commit('window-tag', c.viewDef.id,
                [_mkPt(near.pos.wx, near.pos.wz), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(near.pos.wx, near.pos.wz), _mp3(pt.worldX, pt.worldZ)],
                {
                    label: near.label,
                    cachedLabel: near.label,
                    showLeader: true,
                    elementId: near.elementId,
                    widthMm: wMm,
                    heightMm: hMm,
                },
            );
            _clear(c);
        } else {
            _hint(c, '⚠ No window found nearby — move closer and try again');
        }
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._nearest = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── ANGULAR DIMENSION ────────────────────────────────────────────────────────

export class AngularDimPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _state = 1;
    private _vertex: WorldPoint | null = null;
    private _rayA:   WorldPoint | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._vertex = this._rayA = this._cursor = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._state = 1; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._vertex) _dot(this._ctx, this._vertex);
        if (this._rayA)   _dot(this._ctx, this._rayA);
        if (this._vertex && this._state >= 2)
            _line(this._ctx, this._vertex.worldX, this._vertex.worldZ, pt.worldX, pt.worldZ);
        if (this._vertex && this._rayA && this._state === 3) {
            _line(this._ctx, this._vertex.worldX, this._vertex.worldZ, this._rayA.worldX, this._rayA.worldZ, '#1e3a8a');
        }
        const hints = ['', 'Click arc vertex (angle center)', 'Click first ray endpoint', 'Click second ray endpoint'];
        _hint(this._ctx, hints[this._state] ?? '');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) { this._vertex = pt; this._state = 2; }
        else if (this._state === 2) { this._rayA = pt; this._state = 3; }
        else if (this._state === 3 && this._vertex && this._rayA) {
            _commit('angular-dim', this._ctx.viewDef.id,
                [_mkPt(this._vertex.worldX, this._vertex.worldZ),
                 _mkPt(this._rayA.worldX,   this._rayA.worldZ),
                 _mkPt(pt.worldX,            pt.worldZ)],
                [_mp3(this._vertex.worldX, this._vertex.worldZ),
                 _mp3(this._rayA.worldX,   this._rayA.worldZ),
                 _mp3(pt.worldX,            pt.worldZ)],
                { unit: 'deg' },
            );
            this._vertex = this._rayA = null;
            this._state = 1;
            _clear(this._ctx);
        }
    }

    cancel(): void {
        if (this._state === 3) { this._rayA = null; this._state = 2; }
        else { this._vertex = this._rayA = null; this._state = 1; }
        if (this._ctx) _clear(this._ctx);
    }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── RADIUS DIMENSION ─────────────────────────────────────────────────────────

export class RadiusDimPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _state = 1;
    private _center: WorldPoint | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._center = this._cursor = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._center) {
            _dot(this._ctx, this._center);
            _line(this._ctx, this._center.worldX, this._center.worldZ, pt.worldX, pt.worldZ);
        }
        _dot(this._ctx, pt, '#6600ff', 4);
        _hint(this._ctx, this._state === 1 ? 'Click arc/circle center' : 'Click point on circumference');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) { this._center = pt; this._state = 2; }
        else if (this._center) {
            const r = Math.hypot(pt.worldX - this._center.worldX, pt.worldZ - this._center.worldZ);
            _commit('radius-dim', this._ctx.viewDef.id,
                [_mkPt(this._center.worldX, this._center.worldZ), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(this._center.worldX, this._center.worldZ), _mp3(pt.worldX, pt.worldZ)],
                { unit: 'mm', radius: r },
            );
            this._center = null; this._state = 1;
            _clear(this._ctx);
        }
    }

    cancel(): void { this._center = null; this._state = 1; if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── DIAMETER DIMENSION ───────────────────────────────────────────────────────

export class DiameterDimPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _state = 1;
    private _ptA:    WorldPoint | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._ptA = this._cursor = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._ptA) { _dot(this._ctx, this._ptA); _line(this._ctx, this._ptA.worldX, this._ptA.worldZ, pt.worldX, pt.worldZ); }
        _dot(this._ctx, pt, '#6600ff', 4);
        _hint(this._ctx, this._state === 1 ? 'Click first point on circle' : 'Click opposite point on circle');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) { this._ptA = pt; this._state = 2; }
        else if (this._ptA) {
            const d = Math.hypot(pt.worldX - this._ptA.worldX, pt.worldZ - this._ptA.worldZ);
            _commit('diameter-dim', this._ctx.viewDef.id,
                [_mkPt(this._ptA.worldX, this._ptA.worldZ), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(this._ptA.worldX, this._ptA.worldZ), _mp3(pt.worldX, pt.worldZ)],
                { unit: 'mm', diameter: d },
            );
            this._ptA = null; this._state = 1;
            _clear(this._ctx);
        }
    }

    cancel(): void { this._ptA = null; this._state = 1; if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── SLOPE DIMENSION ──────────────────────────────────────────────────────────

export class SlopeDimPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _state = 1;
    private _ptA:    WorldPoint | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._ptA = this._cursor = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._ptA) { _dot(this._ctx, this._ptA); _line(this._ctx, this._ptA.worldX, this._ptA.worldZ, pt.worldX, pt.worldZ); }
        _dot(this._ctx, pt, '#6600ff', 4);
        _hint(this._ctx, this._state === 1 ? 'Click start point (lower elevation)' : 'Click end point');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) { this._ptA = pt; this._state = 2; }
        else if (this._ptA) {
            const run = Math.hypot(pt.worldX - this._ptA.worldX, pt.worldZ - this._ptA.worldZ);
            const slopeRatio = run > 0.001 ? 0.05 : 0;
            _commit('slope-dim', this._ctx.viewDef.id,
                [_mkPt(this._ptA.worldX, this._ptA.worldZ), _mkPt(pt.worldX, pt.worldZ)],
                [_mp3(this._ptA.worldX, this._ptA.worldZ), _mp3(pt.worldX, pt.worldZ)],
                { unit: 'ratio', slopeRatio, slopePercent: slopeRatio * 100 },
            );
            this._ptA = null; this._state = 1;
            _clear(this._ctx);
        }
    }

    cancel(): void { this._ptA = null; this._state = 1; if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── SPOT ELEVATION ───────────────────────────────────────────────────────────

export class SpotElevationPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#374151');
        _hint(this._ctx, 'Click to place a spot elevation');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        // Pre-fill with the view's level elevation if available
        const lvl = _levelForView(c.viewDef);
        const defaultElev = lvl ? lvl.elevation.toFixed(3) : '0.000';
        pryzmAnnotationInput({
            title: 'SPOT ELEVATION',
            subtitle: 'Surveyed point elevation',
            label: 'Elevation (m)',
            placeholder: '±0.000',
            defaultValue: defaultElev,
            confirmLabel: 'Place',
            iconSvg: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
        }).then(result => {
            if (!result) return;
            const elevation = parseFloat(result.value) || 0;
            _commit('spot-elevation', c.viewDef.id,
                [_mkPt(pt.worldX, pt.worldZ)],
                [_mp3(pt.worldX, pt.worldZ)],
                { unit: 'm', elevation },
            );
            _clear(c);
        });
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── KEYNOTE ──────────────────────────────────────────────────────────────────

export class KeynotePlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#374151');
        _hint(this._ctx, 'Click to place a keynote');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        pryzmAnnotationInput({
            title: 'KEYNOTE',
            subtitle: 'Specification / NBS reference',
            label: 'Keynote reference',
            placeholder: 'e.g. 08 90 00',
            confirmLabel: 'Place',
            iconSvg: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
        }).then(result => {
            if (!result) return;
            _commit('keynote', c.viewDef.id,
                [_mkPt(pt.worldX, pt.worldZ)],
                [_mp3(pt.worldX, pt.worldZ)],
                { key: result.value, code: result.value },
            );
            _clear(c);
        });
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── LEVEL TAG ────────────────────────────────────────────────────────────────
// Auto-resolves the view's level elevation from the level store.

export class LevelTagPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;
    private _lvl:    { name: string; elevation: number } | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._lvl = _levelForView(ctx.viewDef);
    }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#374151');
        const hint = this._lvl
            ? `Click to place level tag  "${this._lvl.name}  ${this._lvl.elevation >= 0 ? '+' : ''}${this._lvl.elevation.toFixed(3)} m"`
            : 'Click to place a level tag';
        _hint(this._ctx, hint);
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const lvl = this._lvl ?? { name: 'Level', elevation: 0 };
        const label = `${lvl.name}  ${lvl.elevation >= 0 ? '+' : ''}${lvl.elevation.toFixed(3)}`;
        _commit('level-tag', c.viewDef.id,
            [_mkPt(pt.worldX, pt.worldZ)],
            [_mp3(pt.worldX, pt.worldZ)],
            { elevation: lvl.elevation, label, cachedLabel: label, levelName: lvl.name },
        );
        _clear(c);
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── GRID BUBBLE ─────────────────────────────────────────────────────────────
// Snaps to the nearest grid axis and auto-uses the grid's name.

export class GridBubblePlanToolHandler implements PlanToolHandler {
    private _ctx:     PlanToolDrawContext | null = null;
    private _nearest: BimCandidate | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor  = pt;
        this._nearest = _nearestGrid(pt);
        _clear(this._ctx);
        if (this._nearest) {
            _dot(this._ctx, { worldX: this._nearest.pos.wx, worldZ: this._nearest.pos.wz }, '#6600ff', 7);
            _hint(this._ctx, `Click to place grid bubble  "${this._nearest.label}"`);
        } else {
            _dot(this._ctx, pt, '#374151');
            _hint(this._ctx, 'Move near a grid axis · click to place bubble');
        }
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const near = _nearestGrid(pt) ?? this._nearest;
        if (near) {
            _commit('grid-bubble', c.viewDef.id,
                [_mkPt(near.pos.wx, near.pos.wz)],
                [_mp3(near.pos.wx, near.pos.wz)],
                { label: near.label, name: near.label, cachedLabel: near.label, gridId: near.elementId },
            );
            _clear(c);
        } else {
            _hint(c, '⚠ No grid axis found nearby — move closer and try again');
        }
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._nearest = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── REVISION CLOUD ───────────────────────────────────────────────────────────

export class RevisionCloudPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _pts:    WorldPoint[] = [];
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._pts = []; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; this._pts = []; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        this._redraw(pt);
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._pts.push(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (!this._ctx || this._pts.length < 3) return;
        const c = this._ctx;
        const pts3 = this._pts.map(p => _mp3(p.worldX, p.worldZ));
        pryzmAnnotationInput({
            title: 'REVISION CLOUD',
            subtitle: 'Mark up scope of revision',
            label: 'Revision code',
            placeholder: 'e.g. A',
            defaultValue: 'A',
            confirmLabel: 'Place Cloud',
            iconSvg: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>`,
        }).then(result => {
            _commit('revision-cloud', c.viewDef.id,
                this._pts.map(p => _mkPt(p.worldX, p.worldZ)),
                pts3,
                { revisionCode: result?.value ?? 'A', note: '' },
            );
            this._pts = [];
            _clear(c);
        });
    }

    cancel(): void { this._pts = []; if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this._redraw(this._cursor); }

    private _redraw(cursor: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        _clear(c);
        const { ctx, planCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        const all = [...this._pts, cursor];
        if (all.length > 1) {
            ctx.beginPath();
            const s0 = planCanvas.worldToScreen(all[0].worldX, all[0].worldZ);
            ctx.moveTo(s0.sx, s0.sy);
            for (let i = 1; i < all.length; i++) {
                const s = planCanvas.worldToScreen(all[i].worldX, all[i].worldZ);
                ctx.lineTo(s.sx, s.sy);
            }
            ctx.stroke();
        }
        for (const p of this._pts) {
            const s = planCanvas.worldToScreen(p.worldX, p.worldZ);
            ctx.fillStyle = '#d97706';
            ctx.beginPath();
            ctx.arc(s.sx, s.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.setLineDash([]);
        ctx.restore();
        _hint(c,
            this._pts.length < 3
                ? `Click to add points (${this._pts.length} placed — need ≥ 3)`
                : `Click to add points · double-click to close cloud (${this._pts.length} pts)`,
        );
    }
}

// ─── CALLOUT DETAIL ───────────────────────────────────────────────────────────

export class CalloutDetailPlanToolHandler implements PlanToolHandler {
    private _ctx:     PlanToolDrawContext | null = null;
    private _state = 1;
    private _cornerA: WorldPoint | null = null;
    private _cursor:  WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._cornerA = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._cornerA) {
            const { ctx, planCanvas, dpr } = this._ctx;
            const sA = planCanvas.worldToScreen(this._cornerA.worldX, this._cornerA.worldZ);
            const sB = planCanvas.worldToScreen(pt.worldX, pt.worldZ);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.save();
            ctx.strokeStyle = '#1a2035';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(
                Math.min(sA.sx, sB.sx), Math.min(sA.sy, sB.sy),
                Math.abs(sB.sx - sA.sx), Math.abs(sB.sy - sA.sy),
            );
            ctx.setLineDash([]);
            ctx.restore();
        }
        _dot(this._ctx, pt, '#6600ff', 4);
        _hint(this._ctx, this._state === 1 ? 'Click top-left corner of callout region' : 'Click bottom-right corner');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) { this._cornerA = pt; this._state = 2; }
        else if (this._cornerA) {
            const c = this._ctx;
            const cA = this._cornerA;
            pryzmAnnotationInput({
                title: 'CALLOUT / DETAIL',
                subtitle: 'Linked detail view reference',
                label: 'Callout label',
                placeholder: 'e.g. 1/A2',
                confirmLabel: 'Place',
                iconSvg: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>`,
            }).then(result => {
                _commit('callout-detail', c.viewDef.id,
                    [_mkPt(cA.worldX, cA.worldZ), _mkPt(pt.worldX, pt.worldZ)],
                    [_mp3(cA.worldX, cA.worldZ), _mp3(pt.worldX, pt.worldZ)],
                    { calloutLabel: result?.value ?? '' },
                );
                this._cornerA = null; this._state = 1;
                _clear(c);
            });
        }
    }

    cancel(): void { this._cornerA = null; this._state = 1; if (this._ctx) _clear(this._ctx); }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── NORTH ARROW ──────────────────────────────────────────────────────────────
// Single-click placement. The orientation defaults to 0° (North up).

export class NorthArrowPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#1a4731');
        _hint(this._ctx, 'Click to place a North arrow');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        _commit('north-arrow', c.viewDef.id,
            [_mkPt(pt.worldX, pt.worldZ)],
            [_mp3(pt.worldX, pt.worldZ)],
            { rotationDeg: 0 },
        );
        _clear(c);
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._cursor = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── SCALE BAR ────────────────────────────────────────────────────────────────
// Single-click placement. Scale is read from the view's outputSettings.

export class ScaleBarPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        _dot(this._ctx, pt, '#374151');
        _hint(this._ctx, 'Click to place a scale bar');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        const c = this._ctx;
        const scale = (c.viewDef as any).outputSettings?.scale ?? 100;
        _commit('scale-bar', c.viewDef.id,
            [_mkPt(pt.worldX, pt.worldZ)],
            [_mp3(pt.worldX, pt.worldZ)],
            { scale, segments: 4, segmentLengthM: 1 },
        );
        _clear(c);
    }

    cancel(): void { if (this._ctx) _clear(this._ctx); this._cursor = null; }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}

// ─── MATCHLINE ────────────────────────────────────────────────────────────────
// Two-click tool: click start point then end point to define the matchline.

export class MatchlinePlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;
    private _state = 1;
    private _ptA:    WorldPoint | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void { this._ctx = ctx; this._state = 1; this._ptA = null; }
    deactivate(): void { if (this._ctx) _clear(this._ctx); this._ctx = null; }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._cursor = pt;
        _clear(this._ctx);
        if (this._ptA) {
            _dot(this._ctx, this._ptA, '#6600ff', 5);
            _line(this._ctx, this._ptA.worldX, this._ptA.worldZ, pt.worldX, pt.worldZ, '#6600ff');
        }
        _dot(this._ctx, pt, '#6600ff', 4);
        _hint(this._ctx, this._state === 1 ? 'Click to set matchline start point' : 'Click to set matchline end point');
    }

    onClick(pt: WorldPoint): void {
        if (!this._ctx) return;
        if (this._state === 1) {
            this._ptA = pt;
            this._state = 2;
        } else if (this._ptA) {
            const c = this._ctx;
            pryzmAnnotationInput({
                title: 'MATCHLINE',
                subtitle: 'Sheet reference for continuation',
                label: 'Sheet reference',
                placeholder: 'e.g. A2',
                confirmLabel: 'Place',
                iconSvg: `<line x1="3" y1="12" x2="21" y2="12"/><polyline points="8 8 3 12 8 16"/>`,
            }).then(result => {
                _commit('matchline', c.viewDef.id,
                    [_mkPt(this._ptA!.worldX, this._ptA!.worldZ), _mkPt(pt.worldX, pt.worldZ)],
                    [_mp3(this._ptA!.worldX, this._ptA!.worldZ), _mp3(pt.worldX, pt.worldZ)],
                    { sheetRef: result?.value ?? '', label: result?.value ?? 'MATCH LINE' },
                );
                this._ptA = null;
                this._state = 1;
                _clear(c);
            });
        }
    }

    cancel(): void {
        this._ptA = null;
        this._state = 1;
        if (this._ctx) _clear(this._ctx);
    }
    redraw(): void { if (this._ctx && this._cursor) this.onMouseMove(this._cursor); }
}
