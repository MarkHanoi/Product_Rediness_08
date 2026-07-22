// L-581 — INDEPENDENT ORACLE for the disputed L-525b value on Barcelona block 02309.
//
// The test asserts a UNIFORM 12 m inset leaves 2,922 m² (43.6%). The clamp says 256 m² (3.8%).
// Both come from the SAME miter family, so neither can adjudicate the other. This computes the
// erosion by a COMPLETELY DIFFERENT algorithm — rasterise the block on a fine grid and keep every
// cell whose distance to the boundary is >= 12 m. No offsetting, no mitring, no line dropping.
// That is the definition of a uniform inset, so it is ground truth up to grid resolution.
import { readFileSync } from 'node:fs';
type Pt = { x: number; z: number };
const src = readFileSync('packages/site-parcel-data/__tests__/insetPolygon.test.ts', 'utf8');
const start = src.indexOf('const BLOCK_02309');
const body = src.slice(start, src.indexOf('];', start));
const RING: Pt[] = [...body.matchAll(/\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g)]
    .map((m) => ({ x: parseFloat(m[1]!), z: parseFloat(m[2]!) }));

const area = (r: Pt[]): number => {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};
const inside = (p: Pt, r: Pt[]): boolean => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i]!, b = r[j]!;
        if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
};
const distToBoundary = (p: Pt, r: Pt[]): number => {
    let best = Infinity;
    for (let i = 0; i < r.length; i++) {
        const a = r[i]!, b = r[(i + 1) % r.length]!;
        const vx = b.x - a.x, vz = b.z - a.z;
        const L2 = vx * vx + vz * vz;
        const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz)));
    }
    return best;
};

console.log(`block 02309: ${RING.length} vertices, area ${area(RING).toFixed(0)} m²`);
const xs = RING.map((p) => p.x), zs = RING.map((p) => p.z);
const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
for (const step of [0.5, 0.25]) {
    let cells = 0;
    for (let x = x0; x <= x1; x += step) {
        for (let z = z0; z <= z1; z += step) {
            const p = { x, z };
            if (!inside(p, RING)) continue;
            if (distToBoundary(p, RING) >= 12) cells++;
        }
    }
    const a = cells * step * step;
    console.log(`  grid ${step} m → uniform 12 m inset area ≈ ${a.toFixed(0)} m²  (${((a / area(RING)) * 100).toFixed(1)}% of block)`);
}
console.log(`\n  the test asserts 2922 m² (43.6%)   |   the clamped code returns 256 m² (3.8%)`);
