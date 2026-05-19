import * as THREE from '@pryzm/renderer-three/three';
import { makeAnnotationElement } from '@pryzm/plugin-annotations';
import { makePointRef, makeWallFaceRef } from '@pryzm/plugin-annotations';
import {
    detectWallFace,
    wallFaceSignedOffset,
    computeWallCoreOffsets,
    type WallFaceHit,
    type WallFaceType,
} from '@pryzm/plugin-annotations';
import { LinearDimOptionsBar } from '@pryzm/plugin-annotations';
import { formatDimension } from '@pryzm/plugin-annotations';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

type DimRef = {
    worldX: number; worldZ: number;
    wallId: string | null;
    faceType: WallFaceType;
    param: number;
};

export class LinearDimPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;

    private _dimState = 0;
    private _dimRefA: DimRef | null = null;
    private _dimRefB: DimRef | null = null;
    private _dimHoverHit: WallFaceHit | null = null;
    private _dimCursorPoint: WorldPoint | null = null;
    private _dimLiveOffset = 0;
    private _dimOffsetMoved = false;
    private _optionsBar: LinearDimOptionsBar | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._dimState       = 1;
        this._dimRefA        = null;
        this._dimRefB        = null;
        this._dimHoverHit    = null;
        this._dimCursorPoint = null;
        this._dimLiveOffset  = 0;
        this._dimOffsetMoved = false;
        if (!this._optionsBar) this._optionsBar = new LinearDimOptionsBar();
        this._optionsBar.show();
    }

    deactivate(): void {
        this._optionsBar?.hide();
        this._clearOverlay();
        this._dimState       = 0;
        this._dimRefA        = null;
        this._dimRefB        = null;
        this._dimHoverHit    = null;
        this._dimCursorPoint = null;
        this._dimLiveOffset  = 0;
        this._dimOffsetMoved = false;
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        if (!this._ctx) return;
        this._dimCursorPoint = pt;
        if (this._dimState !== 3) {
            this._dimHoverHit = this._findNearestWallHit(pt.worldX, pt.worldZ);
        } else if (this._dimState === 3 && this._dimRefA && this._dimRefB) {
            const ax = this._dimRefA.worldX, az = this._dimRefA.worldZ;
            const bx = this._dimRefB.worldX, bz = this._dimRefB.worldZ;
            const dx = bx - ax, dz = bz - az;
            const len = Math.hypot(dx, dz);
            if (len > 0.001) {
                const nx = -dz / len, nz = dx / len;
                this._dimLiveOffset = (pt.worldX - ax) * nx + (pt.worldZ - az) * nz;
                this._dimOffsetMoved = true;
            }
        }
        this._drawLinearDimPreview();
    }

    onClick(pt: WorldPoint): void {
        if (this._dimState === 1) {
            const hit = this._dimHoverHit;
            this._dimRefA = {
                worldX: hit ? hit.facePoint.x : pt.worldX,
                worldZ: hit ? hit.facePoint.z : pt.worldZ,
                wallId: hit ? hit.wallId : null,
                faceType: hit ? hit.faceType : 'wall:centerline',
                param: hit ? hit.param : 0,
            };
            this._dimState = 2;
            console.log('[LinearDimPlanToolHandler] Dim ref A set', this._dimRefA);

        } else if (this._dimState === 2) {
            const hit = this._dimHoverHit;
            const bx = hit ? hit.facePoint.x : pt.worldX;
            const bz = hit ? hit.facePoint.z : pt.worldZ;
            const dist = Math.hypot(bx - this._dimRefA!.worldX, bz - this._dimRefA!.worldZ);
            if (dist < 0.01) {
                console.warn('[LinearDimPlanToolHandler] Dim: A and B too close — skipped');
                return;
            }
            this._dimRefB = {
                worldX: bx, worldZ: bz,
                wallId: hit ? hit.wallId : null,
                faceType: hit ? hit.faceType : 'wall:centerline',
                param: hit ? hit.param : 0,
            };
            this._dimState = 3;
            this._dimLiveOffset  = 0;
            this._dimOffsetMoved = false;
            console.log('[LinearDimPlanToolHandler] Dim ref B set', this._dimRefB);

        } else if (this._dimState === 3) {
            if (this._dimOffsetMoved) this._commitLinearDim();
        }
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            e.preventDefault();
            this._dimBackStep();
            return true;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            this._optionsBar?.cycleFaceType();
            if (this._dimCursorPoint) {
                this._dimHoverHit = this._findNearestWallHit(
                    this._dimCursorPoint.worldX, this._dimCursorPoint.worldZ
                );
                this._drawLinearDimPreview();
            }
            return true;
        }
        if (e.key === 'Enter' && this._dimState === 3) {
            e.preventDefault();
            if (this._dimOffsetMoved) this._commitLinearDim();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._dimRefA        = null;
        this._dimRefB        = null;
        this._dimHoverHit    = null;
        this._dimCursorPoint = null;
        this._dimLiveOffset  = 0;
        this._dimOffsetMoved = false;
        this._dimState = 1;
        this._clearOverlay();
    }

    redraw(): void {
        this._drawLinearDimPreview();
    }

    private _dimBackStep(): void {
        if (this._dimState === 3) {
            this._dimRefB = null;
            this._dimLiveOffset = 0;
            this._dimOffsetMoved = false;
            this._dimState = 2;
            this._clearOverlay();
            console.log('[LinearDimPlanToolHandler] Dim Escape: DEFINE_OFFSET → PICK_WALL_B');
        } else if (this._dimState === 2) {
            this._dimRefA = null;
            this._dimHoverHit = null;
            this._dimState = 1;
            this._clearOverlay();
            console.log('[LinearDimPlanToolHandler] Dim Escape: PICK_WALL_B → PICK_WALL_A');
        } else {
            this.cancel();
            console.log('[LinearDimPlanToolHandler] Dim Escape: cancelled');
        }
    }

    private _commitLinearDim(): void {
        const c = this._ctx;
        const refAData = this._dimRefA;
        const refBData = this._dimRefB;
        if (!refAData || !refBData || !c) return;

        // Phase 6: resolve perpendicular constraint for parallel walls
        const resolved = this._resolveParallelWallDim(refAData, refBData);
        const ptAx = resolved?.ax ?? refAData.worldX;
        const ptAz = resolved?.az ?? refAData.worldZ;
        const ptBx = resolved?.bx ?? refBData.worldX;
        const ptBz = resolved?.bz ?? refBData.worldZ;

        if (resolved) {
            console.log('[LinearDimPlanToolHandler] Parallel wall constraint applied — perpendicular dim');
        }

        const vecA = new THREE.Vector3(ptAx, 0, ptAz);
        const vecB = new THREE.Vector3(ptBx, 0, ptBz);

        const refA = refAData.wallId
            ? makeWallFaceRef(refAData.wallId, refAData.faceType as any, refAData.param)
            : makePointRef(vecA);
        const refB = refBData.wallId
            ? makeWallFaceRef(refBData.wallId, refBData.faceType as any, refBData.param)
            : makePointRef(vecB);

        const unit = this._optionsBar?.unit ?? 'mm';
        const geometry2D = {
            modelPoints: [
                { x: vecA.x, y: 0, z: vecA.z },
                { x: vecB.x, y: 0, z: vecB.z },
            ],
            offset: this._dimLiveOffset,
        };

        const annotId    = crypto.randomUUID();
        const annotation = makeAnnotationElement(annotId, 'linear-dim', c.viewDef.id, [refA, refB], geometry2D, { unit });

        const dist = vecA.distanceTo(vecB);
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('annotation.create', annotation)
            ?.catch((e: Error) => console.error('[LinearDimPlanToolHandler] annotation.create failed:', e));
        console.log('[LinearDimPlanToolHandler] Linear dim created', annotId, `length=${formatDimension(dist, unit)}`);

        this._dimRefA        = null;
        this._dimRefB        = null;
        this._dimHoverHit    = null;
        this._dimLiveOffset  = 0;
        this._dimOffsetMoved = false;
        this._dimState       = 1;
        this._clearOverlay();
    }

    /**
     * Phase 6 — Parallel wall perpendicular constraint.
     *
     * Given two DimRefs, checks whether both are attached to walls that are
     * within 15° of parallel. If so, projects A and B onto their respective
     * wall baselines and returns corrected world coordinates such that the
     * resulting dimension line is always perpendicular to the walls.
     *
     * Returns null if either ref is not on a wall, or the walls are not
     * sufficiently parallel — the caller falls back to the unconstrained path.
     */
    private _resolveParallelWallDim(
        refA: DimRef,
        refB: DimRef,
    ): { ax: number; az: number; bx: number; bz: number } | null {
        if (!refA.wallId || !refB.wallId) return null;

        // DIMENSION-SYSTEM-AUDIT-2026 §A3 — prefer the injected wallStore.
        const wallStore = this._ctx?.wallStore ?? window.wallStore; // TODO(TASK-08)
        if (!wallStore?.getById) return null;

        const wallA = wallStore.getById(refA.wallId);
        const wallB = wallStore.getById(refB.wallId);
        if (!wallA || !wallB) return null;

        const blA = wallA.baseLine as Array<{ x: number; z: number }> | undefined;
        const blB = wallB.baseLine as Array<{ x: number; z: number }> | undefined;
        if (!blA || blA.length < 2 || !blB || blB.length < 2) return null;

        // Direction unit vectors for both walls
        const dAx = blA[1].x - blA[0].x, dAz = blA[1].z - blA[0].z;
        const dBx = blB[1].x - blB[0].x, dBz = blB[1].z - blB[0].z;
        const lenA = Math.hypot(dAx, dAz), lenB = Math.hypot(dBx, dBz);
        if (lenA < 0.001 || lenB < 0.001) return null;

        const uAx = dAx / lenA, uAz = dAz / lenA;
        const uBx = dBx / lenB, uBz = dBz / lenB;

        // Parallelism check: |dot(uA, uB)| > cos(15°) ≈ 0.9659
        const dotAB = Math.abs(uAx * uBx + uAz * uBz);
        if (dotAB < Math.cos(15 * Math.PI / 180)) return null;

        // Project refA onto wall A baseline: closest point on infinite line
        const tA = (refA.worldX - blA[0].x) * uAx + (refA.worldZ - blA[0].z) * uAz;
        const ax = blA[0].x + uAx * tA;
        const az = blA[0].z + uAz * tA;

        // Project refB onto wall B baseline
        const tB = (refB.worldX - blB[0].x) * uBx + (refB.worldZ - blB[0].z) * uBz;
        const bx = blB[0].x + uBx * tB;
        const bz = blB[0].z + uBz * tB;

        // Sanity: the perpendicular distance must be non-trivial
        const perpX = -uAz, perpZ = uAx;
        const perpDist = Math.abs((bx - ax) * perpX + (bz - az) * perpZ);
        if (perpDist < 0.001) return null;

        return { ax, az, bx, bz };
    }

    private _drawLinearDimPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        const ppu  = planCanvas.getPixelsPerUnit?.() ?? 100;
        const unit = this._optionsBar?.unit ?? 'mm';

        if (this._dimState === 1 || this._dimState === 2) {
            if (this._dimHoverHit) this._drawFaceHighlight(ctx, this._dimHoverHit, ppu, planCanvas);
        }

        if (this._dimRefA && (this._dimState === 2 || this._dimState === 3)) {
            const sA = planCanvas.worldToScreen(this._dimRefA.worldX, this._dimRefA.worldZ);
            ctx.fillStyle = '#1e40af'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sA.sx, sA.sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (this._dimRefB && this._dimState === 3) {
            const sB = planCanvas.worldToScreen(this._dimRefB.worldX, this._dimRefB.worldZ);
            ctx.fillStyle = '#1e40af'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sB.sx, sB.sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }

        if (this._dimState === 2 && this._dimRefA) {
            const snapPt = this._dimHoverHit
                ? { worldX: this._dimHoverHit.facePoint.x, worldZ: this._dimHoverHit.facePoint.z }
                : this._dimCursorPoint;
            if (snapPt) {
                const sA   = planCanvas.worldToScreen(this._dimRefA.worldX, this._dimRefA.worldZ);
                const sCur = planCanvas.worldToScreen(snapPt.worldX, snapPt.worldZ);
                ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#2563eb';
                ctx.beginPath(); ctx.moveTo(sA.sx, sA.sy); ctx.lineTo(sCur.sx, sCur.sy); ctx.stroke();
                ctx.setLineDash([]);

                const dist = Math.hypot(snapPt.worldX - this._dimRefA.worldX, snapPt.worldZ - this._dimRefA.worldZ);
                const label = formatDimension(dist, unit);
                const midX = (sA.sx + sCur.sx) / 2, midY = (sA.sy + sCur.sy) / 2;
                ctx.font = 'bold 11px sans-serif';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
                ctx.fillStyle = '#1e40af'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label, midX, midY);

                if (this._dimHoverHit) {
                    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.setLineDash([]);
                    ctx.beginPath(); ctx.arc(sCur.sx, sCur.sy, 7, 0, Math.PI * 2); ctx.stroke();
                }
            }
        }

        if (this._dimState === 3 && this._dimRefA && this._dimRefB) {
            const ax = this._dimRefA.worldX, az = this._dimRefA.worldZ;
            const bx = this._dimRefB.worldX, bz = this._dimRefB.worldZ;
            const dirX = bx - ax, dirZ = bz - az;
            const dirLen = Math.hypot(dirX, dirZ);
            if (dirLen > 0.001) {
                const nx = -dirZ / dirLen, nz = dirX / dirLen;
                const off = this._dimLiveOffset;
                const dimAX = ax + nx * off, dimAZ = az + nz * off;
                const dimBX = bx + nx * off, dimBZ = bz + nz * off;
                const sRefA = planCanvas.worldToScreen(ax, az);
                const sRefB = planCanvas.worldToScreen(bx, bz);
                const sDimA = planCanvas.worldToScreen(dimAX, dimAZ);
                const sDimB = planCanvas.worldToScreen(dimBX, dimBZ);
                const hasOffset = Math.abs(off) * ppu > 4;

                if (hasOffset) {
                    const WITNESS_GAP = 5, WITNESS_OVERSHOOT = 5;
                    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 1; ctx.setLineDash([]);
                    for (const [ref, dim] of [[sRefA, sDimA], [sRefB, sDimB]] as const) {
                        const wdx = dim.sx - ref.sx, wdy = dim.sy - ref.sy;
                        const wl = Math.hypot(wdx, wdy);
                        if (wl < 1) continue;
                        const ux = wdx / wl, uy = wdy / wl;
                        ctx.beginPath();
                        ctx.moveTo(ref.sx + ux * WITNESS_GAP, ref.sy + uy * WITNESS_GAP);
                        ctx.lineTo(dim.sx + ux * WITNESS_OVERSHOOT, dim.sy + uy * WITNESS_OVERSHOOT);
                        ctx.stroke();
                    }
                }

                ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(sDimA.sx, sDimA.sy); ctx.lineTo(sDimB.sx, sDimB.sy); ctx.stroke();

                const ddx = sDimB.sx - sDimA.sx, ddy = sDimB.sy - sDimA.sy;
                const dlen = Math.hypot(ddx, ddy);
                if (dlen > 0.5) {
                    const TICK = 7;
                    const udx = ddx / dlen, udy = ddy / dlen;
                    const pdx = -udy, pdy = udx;
                    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2;
                    for (const s of [sDimA, sDimB]) {
                        ctx.beginPath();
                        ctx.moveTo(s.sx + (udx + pdx) * TICK, s.sy + (udy + pdy) * TICK);
                        ctx.lineTo(s.sx - (udx + pdx) * TICK, s.sy - (udy + pdy) * TICK);
                        ctx.stroke();
                    }
                }

                const dist = Math.hypot(bx - ax, bz - az);
                const label = formatDimension(dist, unit);
                const midSX = (sDimA.sx + sDimB.sx) / 2, midSY = (sDimA.sy + sDimB.sy) / 2;
                const labelOffPx = 14;
                let lpx = 0, lpy = -1;
                if (dlen > 0.5) {
                    lpx = -ddy / dlen; lpy = ddx / dlen;
                    if (lpy > 0) { lpx = -lpx; lpy = -lpy; }
                }
                const lcx = midSX + lpx * labelOffPx, lcy = midSY + lpy * labelOffPx;
                ctx.font = 'bold 11px sans-serif';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillRect(lcx - tw / 2 - 4, lcy - 8, tw + 8, 16);
                ctx.fillStyle = '#1e3a8a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(label, lcx, lcy);
            }
        }

        const hints: Record<number, string> = {
            1: 'Click a wall face to set start point  [Tab = cycle face type]',
            2: 'Click a wall face to set end point  [Esc = back]',
            3: 'Move cursor to set offset · click or Enter to place  [Esc = back]',
        };
        const hint = hints[this._dimState] ?? '';
        if (hint) {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(30,58,138,0.85)';
            ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
            ctx.fillText(hint, 12, cssH - 12);
        }

        ctx.restore();
    }

    private _findNearestWallHit(worldX: number, worldZ: number): WallFaceHit | null {
        const c = this._ctx;
        // DIMENSION-SYSTEM-AUDIT-2026 §A3 — prefer the injected wallStore.
        const wallStore = c?.wallStore ?? window.wallStore; // TODO(TASK-08)
        if (!wallStore?.getAll) return null;

        const levelId = c?.viewDef.spatial?.levelId;
        const hitPt   = new THREE.Vector3(worldX, 0, worldZ);
        const SNAP_R  = 0.8;

        let bestWall: any = null;
        let bestDist = SNAP_R;

        for (const wall of wallStore.getAll() as any[]) {
            if (levelId && wall.levelId !== levelId) continue;
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;
            const s = new THREE.Vector3(bl[0].x, 0, bl[0].z);
            const e = new THREE.Vector3(bl[1].x, 0, bl[1].z);
            const d = this._distToSeg(hitPt, s, e);
            if (d < bestDist) { bestDist = d; bestWall = wall; }
        }

        if (!bestWall) return null;
        const preferredFace: WallFaceType = this._optionsBar?.preferredFaceType ?? 'face:exterior';
        return detectWallFace(hitPt, bestWall, preferredFace);
    }

    private _distToSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
        const abx = b.x - a.x, abz = b.z - a.z;
        const len2 = abx * abx + abz * abz;
        if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z);
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
        return Math.hypot(p.x - (a.x + t * abx), p.z - (a.z + t * abz));
    }

    private _drawFaceHighlight(
        ctx: CanvasRenderingContext2D,
        hit: WallFaceHit,
        _ppu: number,
        planCanvas: any,
    ): void {
        // DIMENSION-SYSTEM-AUDIT-2026 §A3 — prefer the injected wallStore.
        const wallStore = this._ctx?.wallStore ?? window.wallStore; // TODO(TASK-08)
        const wall = wallStore?.getById?.(hit.wallId);
        if (!wall?.baseLine || wall.baseLine.length < 2) {
            const sf = planCanvas.worldToScreen(hit.facePoint.x, hit.facePoint.z);
            ctx.strokeStyle = '#4499ff'; ctx.lineWidth = 2; ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(sf.sx, sf.sy, 8, 0, Math.PI * 2); ctx.stroke();
            return;
        }

        const bl = wall.baseLine;
        const halfThick = (wall.thickness ?? 0.2) * 0.5;
        const { exteriorFinish, interiorFinish } = computeWallCoreOffsets(wall.layers);
        const faceOff = wallFaceSignedOffset(hit.faceType, halfThick, exteriorFinish, interiorFinish);

        const wdx = bl[1].x - bl[0].x, wdz = bl[1].z - bl[0].z;
        const wlen = Math.hypot(wdx, wdz);
        if (wlen < 0.001) return;
        const ux = wdx / wlen, uz = wdz / wlen;
        const nx = uz, nz = -ux;

        const faceA = { x: bl[0].x + nx * faceOff, z: bl[0].z + nz * faceOff };
        const faceB = { x: bl[1].x + nx * faceOff, z: bl[1].z + nz * faceOff };
        const sfA = planCanvas.worldToScreen(faceA.x, faceA.z);
        const sfB = planCanvas.worldToScreen(faceB.x, faceB.z);

        ctx.strokeStyle = '#4499ff'; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sfA.sx, sfA.sy); ctx.lineTo(sfB.sx, sfB.sy); ctx.stroke();

        const baseA = planCanvas.worldToScreen(bl[0].x, bl[0].z);
        const baseB = planCanvas.worldToScreen(bl[1].x, bl[1].z);
        ctx.fillStyle = 'rgba(68,153,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(baseA.sx, baseA.sy); ctx.lineTo(baseB.sx, baseB.sy);
        ctx.lineTo(sfB.sx, sfB.sy); ctx.lineTo(sfA.sx, sfA.sy);
        ctx.closePath(); ctx.fill();

        const sf = planCanvas.worldToScreen(hit.facePoint.x, hit.facePoint.z);
        ctx.strokeStyle = '#4499ff'; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(sf.sx, sf.sy, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#4499ff';
        ctx.beginPath(); ctx.arc(sf.sx, sf.sy, 3, 0, Math.PI * 2); ctx.fill();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
