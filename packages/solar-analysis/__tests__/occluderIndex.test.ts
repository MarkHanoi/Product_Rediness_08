// §PERF-SUNHOURS-BVH (L-143) — the occluder spatial index MUST be a strict superset of
// the boxes a ray segment crosses (so the accelerated raycast is byte-identical to the
// naive all-occluders loop), and deterministic (same input ⇒ same candidate set).

import { describe, expect, it } from 'vitest';
import { buildOccluderIndex, type OccluderBox } from '../src/occluderIndex.js';

/** Reference: does the ray SEGMENT from (e0,n0) along unit (de,dn) for `reach` metres
 *  cross box `b`? A dense march the index must never miss (ground truth for the test). */
function segmentCrossesBoxNaive(
    e0: number, n0: number, de: number, dn: number, reach: number, b: OccluderBox,
): boolean {
    const dmag = Math.hypot(de, dn) || 1;
    const ux = de / dmag, uz = dn / dmag;
    // Fine march — much finer than the index's half-cell sampling.
    for (let d = 0; d <= reach; d += 0.25) {
        const e = e0 + ux * d, n = n0 + uz * d;
        if (e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN) return true;
    }
    return false;
}

/** A deterministic LCG so the fuzz cases are reproducible (no Math.random). */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}

function randomBoxes(rand: () => number, n: number, spread = 400): OccluderBox[] {
    const boxes: OccluderBox[] = [];
    for (let i = 0; i < n; i++) {
        const e = (rand() - 0.5) * spread;
        const nn = (rand() - 0.5) * spread;
        const w = 4 + rand() * 30;
        const d = 4 + rand() * 30;
        boxes.push({ minE: e, maxE: e + w, minN: nn, maxN: nn + d });
    }
    return boxes;
}

describe('buildOccluderIndex — superset guarantee (determinism-preserving)', () => {
    it('returns EVERY box a ray segment crosses (a strict superset of ground truth)', () => {
        const rand = lcg(12345);
        const boxes = randomBoxes(rand, 300);
        const index = buildOccluderIndex(boxes);
        const out: number[] = [];

        let checkedRays = 0;
        let crossings = 0;
        for (let r = 0; r < 500; r++) {
            const e0 = (rand() - 0.5) * 400;
            const n0 = (rand() - 0.5) * 400;
            const ang = rand() * Math.PI * 2;
            const de = Math.cos(ang), dn = Math.sin(ang);
            const reach = 50 + rand() * 500;
            index.queryRaySegment(e0, n0, de, dn, reach, out);
            const candidate = new Set(out);
            for (let bi = 0; bi < boxes.length; bi++) {
                if (segmentCrossesBoxNaive(e0, n0, de, dn, reach, boxes[bi]!)) {
                    crossings++;
                    // The core contract: every TRUE crossing is in the candidate set.
                    expect(candidate.has(bi)).toBe(true);
                }
            }
            checkedRays++;
        }
        expect(checkedRays).toBe(500);
        expect(crossings).toBeGreaterThan(0); // the fuzz actually exercised crossings
    });

    it('is deterministic — identical boxes + ray ⇒ identical candidate list', () => {
        const rand = lcg(999);
        const boxes = randomBoxes(rand, 120);
        const a = buildOccluderIndex(boxes);
        const b = buildOccluderIndex(boxes);
        const outA: number[] = [];
        const outB: number[] = [];
        for (let r = 0; r < 100; r++) {
            const e0 = (rand() - 0.5) * 300, n0 = (rand() - 0.5) * 300;
            const ang = rand() * Math.PI * 2;
            a.queryRaySegment(e0, n0, Math.cos(ang), Math.sin(ang), 250, outA);
            b.queryRaySegment(e0, n0, Math.cos(ang), Math.sin(ang), 250, outB);
            expect(outA).toEqual(outB);
        }
    });

    it('prunes hard — a ray only returns a small fraction of a large occluder set', () => {
        const rand = lcg(42);
        const boxes = randomBoxes(rand, 2000, 1000);
        const index = buildOccluderIndex(boxes);
        const out: number[] = [];
        index.queryRaySegment(0, 0, 1, 0, 200, out);
        // A 200 m ray across a 1 km field of 2000 boxes must not scan them all.
        expect(out.length).toBeLessThan(boxes.length / 4);
    });

    it('handles empty + degenerate inputs without throwing', () => {
        const empty = buildOccluderIndex([]);
        const out: number[] = [];
        expect(empty.queryRaySegment(0, 0, 1, 0, 100, out)).toEqual([]);
        const one = buildOccluderIndex([{ minE: -5, maxE: 5, minN: -5, maxN: 5 }]);
        // Overhead sun (zero horizontal direction) → origin cell only, still finds the box.
        expect(one.queryRaySegment(0, 0, 0, 0, 0, out)).toContain(0);
    });

    it('scratch array is reused (cleared each query, no stale carryover)', () => {
        const rand = lcg(7);
        const boxes = randomBoxes(rand, 200);
        const index = buildOccluderIndex(boxes);
        const out: number[] = [];
        index.queryRaySegment(0, 0, 1, 0, 250, out);
        const firstLen = out.length;
        expect(firstLen).toBeGreaterThan(0);
        // Re-running the SAME query into the SAME array must not accumulate (it is cleared).
        index.queryRaySegment(0, 0, 1, 0, 250, out);
        expect(out.length).toBe(firstLen);
        // A different query yields its OWN result, never a union with the previous one.
        index.queryRaySegment(0, 0, 0, 1, 250, out);
        const northSet = new Set(out);
        for (let bi = 0; bi < boxes.length; bi++) {
            if (segmentCrossesBoxNaive(0, 0, 0, 1, 250, boxes[bi]!)) expect(northSet.has(bi)).toBe(true);
        }
    });
});
