/**
 * GridSnapProvider — snap candidates from the uniform math grid and,
 * optionally, from BIM structural grids.
 *
 * Emits three distinct candidate types so the SnapManager hierarchy
 * can rank them correctly (see §40 §7 — Snap Hierarchy):
 *
 *   SnapType.GRID_INTERSECTION (priority 200) — two BIM grids crossing
 *   SnapType.GRID_LINE         (priority 150) — single BIM grid datum
 *   SnapType.GRID              (priority  10) — uniform math grid (typing aid)
 *
 * BIM-grid intersections are computed pairwise on the visible grids:
 *   • orthogonal × orthogonal — trivial (X-grid.position, Y-grid.position)
 *   • orthogonal × linear     — solve infinite-line intersection
 *   • linear     × linear     — solve infinite-line intersection
 *   (linear grids are treated as their *infinite* host line for snap
 *    intersection purposes, matching Revit datum behaviour)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

/** Minimal Grid shape — mirrors BimKernel.Grid without a hard import cycle. */
interface BimGridRef {
    id: string;
    name?: string;
    axis: 'X' | 'Y';
    position: number;
    isVisible: boolean;
    /** §40 §2 — drawing mode. Defaults to 'orthogonal' when absent. */
    mode?: 'orthogonal' | 'linear';
    /** §40 §2.2 — Linear-mode endpoints (XZ plane). */
    startX?: number;
    startZ?: number;
    endX?:   number;
    endZ?:   number;
}

/** Cached host-line representation of a grid in the XZ plane: P + t * D. */
interface GridLine {
    grid: BimGridRef;
    /** Point on the line. */
    px: number;
    pz: number;
    /** Unit direction vector. */
    dx: number;
    dz: number;
}

export class GridSnapProvider implements ISnapProvider {
    readonly providerType = 'grid';
    private gridSize: number;

    /**
     * Optional injector for BIM structural grids.
     * When provided, structural grid positions emit high-priority snap candidates
     * in addition to (and with higher priority than) the uniform math grid.
     */
    private readonly getBimGrids: (() => BimGridRef[]) | undefined;

    constructor(gridSize: number = 0.5, getBimGrids?: () => BimGridRef[]) {
        this.gridSize = gridSize;
        this.getBimGrids = getBimGrids;
    }

    setGridSize(size: number): void {
        this.gridSize = size;
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];

        // ── 1. Uniform math-grid snap ────────────────────────────────────────
        if (enabledTypes.has(SnapType.GRID)) {
            const snappedX = Math.round(queryPoint.x / this.gridSize) * this.gridSize;
            const snappedZ = Math.round(queryPoint.z / this.gridSize) * this.gridSize;
            const mathPoint = new THREE.Vector3(snappedX, 0, snappedZ);

            const mathDist = new THREE.Vector3(queryPoint.x, 0, queryPoint.z)
                .distanceTo(mathPoint);

            if (mathDist <= radius) {
                candidates.push({
                    point: mathPoint,
                    type: SnapType.GRID,
                    priority: DEFAULT_SNAP_PRIORITIES[SnapType.GRID],
                    distance: mathDist,
                    metadata: { gridSize: this.gridSize, source: 'math' }
                });
            }
        }

        // ── 2. BIM structural grids (lines + intersections) ──────────────────
        const bimGrids = this.getBimGrids?.();
        if (!bimGrids || bimGrids.length === 0) return candidates;

        const visible = bimGrids.filter(g => g && g.isVisible);
        if (visible.length === 0) return candidates;

        // Build host-line representation once.
        const lines: GridLine[] = [];
        for (const g of visible) {
            const ln = this._toHostLine(g);
            if (ln) lines.push(ln);
        }

        // ── 2a. GRID_LINE candidates (cursor → grid line) ────────────────────
        if (enabledTypes.has(SnapType.GRID_LINE)) {
            for (const ln of lines) {
                const proj = this._projectOntoLine(queryPoint.x, queryPoint.z, ln);
                const dist = Math.hypot(queryPoint.x - proj.x, queryPoint.z - proj.z);
                if (dist <= radius) {
                    candidates.push({
                        point: new THREE.Vector3(proj.x, 0, proj.z),
                        type: SnapType.GRID_LINE,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.GRID_LINE],
                        distance: dist,
                        sourceId: ln.grid.id,
                        sourceType: 'BimGrid',
                        metadata: {
                            axis:     ln.grid.axis,
                            position: ln.grid.position,
                            mode:     ln.grid.mode ?? 'orthogonal',
                            gridName: ln.grid.name,
                            source:   'bim-grid',
                        }
                    });
                }
            }
        }

        // ── 2b. GRID_INTERSECTION candidates (pairwise grid × grid) ──────────
        // Quadratic in the number of visible grids — fine for typical BIM
        // datum counts (tens, not thousands). Only intersections inside the
        // snap radius become candidates, so most work is the line-line solve.
        if (enabledTypes.has(SnapType.GRID_INTERSECTION) && lines.length >= 2) {
            for (let i = 0; i < lines.length; i++) {
                for (let j = i + 1; j < lines.length; j++) {
                    const a = lines[i]!;
                    const b = lines[j]!;
                    const ix = this._intersectInfiniteLines(a, b);
                    if (!ix) continue; // parallel or coincident
                    const dist = Math.hypot(queryPoint.x - ix.x, queryPoint.z - ix.z);
                    if (dist > radius) continue;
                    candidates.push({
                        point: new THREE.Vector3(ix.x, 0, ix.z),
                        type: SnapType.GRID_INTERSECTION,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.GRID_INTERSECTION],
                        distance: dist,
                        sourceId: `${a.grid.id}×${b.grid.id}`,
                        sourceType: 'BimGridIntersection',
                        metadata: {
                            gridIdA:   a.grid.id,
                            gridIdB:   b.grid.id,
                            gridNameA: a.grid.name,
                            gridNameB: b.grid.name,
                            source:    'bim-grid-intersection',
                        }
                    });
                }
            }
        }

        return candidates;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Geometry helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the infinite host line for a grid in the XZ plane.
     * - Orthogonal X-axis grid: vertical line x=position (direction along Z)
     * - Orthogonal Y-axis grid: horizontal line z=position (direction along X)
     * - Linear grid: line through (startX,startZ)→(endX,endZ)
     */
    private _toHostLine(g: BimGridRef): GridLine | null {
        const isLinear = g.mode === 'linear'
            && Number.isFinite(g.startX) && Number.isFinite(g.startZ)
            && Number.isFinite(g.endX)   && Number.isFinite(g.endZ);

        if (isLinear) {
            const sx = g.startX!, sz = g.startZ!;
            const ex = g.endX!,   ez = g.endZ!;
            const dx = ex - sx,   dz = ez - sz;
            const len = Math.hypot(dx, dz);
            if (len < 1e-9) return null;
            return { grid: g, px: sx, pz: sz, dx: dx / len, dz: dz / len };
        }

        if (g.axis === 'X') {
            // Constant X = g.position, varies in Z. Direction: (0,1).
            return { grid: g, px: g.position, pz: 0, dx: 0, dz: 1 };
        }
        // Y-axis (in our XZ plane): constant Z = g.position, varies in X. Direction: (1,0).
        return { grid: g, px: 0, pz: g.position, dx: 1, dz: 0 };
    }

    /** Projects (qx, qz) onto an infinite line P + t·D and returns the foot. */
    private _projectOntoLine(qx: number, qz: number, ln: GridLine): { x: number; z: number } {
        const t = (qx - ln.px) * ln.dx + (qz - ln.pz) * ln.dz;
        return { x: ln.px + t * ln.dx, z: ln.pz + t * ln.dz };
    }

    /**
     * Infinite-line × infinite-line intersection in the XZ plane.
     * Returns null when the lines are parallel (cross product near zero).
     */
    private _intersectInfiniteLines(a: GridLine, b: GridLine): { x: number; z: number } | null {
        const cross = a.dx * b.dz - a.dz * b.dx;
        if (Math.abs(cross) < 1e-9) return null;

        // Solve a.p + t * a.d = b.p + s * b.d for t.
        const rx = b.px - a.px;
        const rz = b.pz - a.pz;
        const t = (rx * b.dz - rz * b.dx) / cross;

        return { x: a.px + t * a.dx, z: a.pz + t * a.dz };
    }
}
