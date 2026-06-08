import { describe, it } from 'vitest';
import {
    __candidatesForTest as candidates,
    chooseStairCorePosition,
} from '../src/workflows/houseLayout/stairPosition.js';

// Plate-local polygon helpers (mm). Build a jittery near-rect like the real shell.
function jitteryRectMm(wM: number, dM: number, jMM: number, seed: number): { x: number; y: number }[] {
    const pts = [
        { x: 0, z: 0 }, { x: wM / 2, z: 0 }, { x: wM, z: 0 },
        { x: wM, z: dM / 2 }, { x: wM, z: dM },
        { x: wM / 2, z: dM }, { x: 0, z: dM }, { x: 0, z: dM / 2 },
    ];
    let s = seed;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
    const world = pts.map(p => ({ x: p.x + rnd() * jMM / 1000, z: p.z + rnd() * jMM / 1000 }));
    let minX = Infinity, minZ = Infinity;
    for (const p of world) { minX = Math.min(minX, p.x); minZ = Math.min(minZ, p.z); }
    // plate-local mm
    return world.map(p => ({ x: (p.x - minX) * 1000, y: (p.z - minZ) * 1000 }));
}

function bboxMm(poly: { x: number; y: number }[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { minX, minY, maxX, maxY };
}

// Strict point-in-poly (NO tolerance) for diagnosing how far outside a corner is.
function strictInside(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i]!.y, yj = poly[j]!.y, xi = poly[i]!.x, xj = poly[j]!.x;
        const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-30) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}

function distToPoly(px: number, py: number, poly: { x: number; y: number }[]): number {
    let best = Infinity;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ey = b.y - a.y;
        const L2 = ex * ex + ey * ey || 1e-30;
        let t = ((px - a.x) * ex + (py - a.y) * ey) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = a.x + t * ex, qy = a.y + t * ey;
        best = Math.min(best, Math.hypot(px - qx, py - qy));
    }
    return best;
}

describe('PROBE stair containment', () => {
    it('PARALLELOGRAM / skewed plate (residual skew in layout frame)', () => {
        const coreW = 2000, coreH = 2800;
        // A parallelogram: top edge shifted right by `shearM`. In plate-local mm.
        for (const shearM of [4.0, 5.0, 6.0, 8.0]) {
            const wM = 14, dM = 11;
            // world poly sheared, then to plate-local mm (bbox-min origin)
            const world = [
                { x: 0, z: 0 }, { x: wM, z: 0 },
                { x: wM + shearM, z: dM }, { x: shearM, z: dM },
            ];
            let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
            for (const p of world) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
            const poly = world.map(p => ({ x: (p.x - minX) * 1000, y: (p.z - minZ) * 1000 }));
            const plateW = (maxX - minX) * 1000, plateH = (maxZ - minZ) * 1000;
            const cs = candidates(plateW, plateH, coreW, coreH, poly);
            const chosen = chooseStairCorePosition(plateW, plateH, coreW, coreH, poly, { sunDir: { x: 0, y: 1 } });
            const corners = [
                { x: chosen.x, y: chosen.y }, { x: chosen.x + coreW, y: chosen.y },
                { x: chosen.x, y: chosen.y + coreH }, { x: chosen.x + coreW, y: chosen.y + coreH },
            ];
            let maxOut = 0;
            for (const c of corners) if (!strictInside(c.x, c.y, poly)) maxOut = Math.max(maxOut, distToPoly(c.x, c.y, poly));
            // eslint-disable-next-line no-console
            console.log(`SHEAR ${shearM}m kind=${chosen.kind} x=${chosen.x.toFixed(0)} y=${chosen.y.toFixed(0)} maxOutMm=${maxOut.toFixed(0)} kinds=${cs.map(c=>c.kind).join(',')}`);
        }
    });

    it('dumps candidate corner positions vs polygon', () => {
        const sizes: [number, number][] = [[16, 12.5], [12, 10], [18, 9], [9, 14], [8, 8]];
        const coreW = 2000, coreH = 2800;
        for (const [wM, dM] of sizes) {
            const poly = jitteryRectMm(wM, dM, 30, wM * 131 + dM * 7);
            const bb = bboxMm(poly);
            const plateW = bb.maxX, plateH = bb.maxY;
            const cs = candidates(plateW, plateH, coreW, coreH, poly);
            const chosen = chooseStairCorePosition(plateW, plateH, coreW, coreH, poly, { sunDir: { x: 0, y: 1 } });
            // For chosen, compute max outside-distance over 4 corners.
            const corners = [
                { x: chosen.x, y: chosen.y },
                { x: chosen.x + coreW, y: chosen.y },
                { x: chosen.x, y: chosen.y + coreH },
                { x: chosen.x + coreW, y: chosen.y + coreH },
            ];
            let maxOut = 0;
            for (const c of corners) {
                if (!strictInside(c.x, c.y, poly)) maxOut = Math.max(maxOut, distToPoly(c.x, c.y, poly));
            }
            // eslint-disable-next-line no-console
            console.log(`plate ${wM}x${dM} kind=${chosen.kind} x=${chosen.x.toFixed(0)} y=${chosen.y.toFixed(0)} maxCornerOutsideMm=${maxOut.toFixed(0)} ncand=${cs.length} kinds=${cs.map(c=>c.kind).join(',')}`);
        }
    });
});
