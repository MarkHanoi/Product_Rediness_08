// §CLASSIFY-EDGES-RUN-GROUP (2026-08-06) — regression coverage for the founder-confirmed
// Córdoba OA-2 "sliver" defect: `classifyEdges` used to tag ONLY the single most-extremal edge
// as `'front'`/`'rear'`, leaving a near-identical NEIGHBOUR edge of the SAME physical street/rear
// boundary (routine on a real, slightly-kinked cadastral digitization) classified `'side'` — which
// then took a setback that ordinance never intended for that boundary. See `boundaryProjection.ts`'s
// own header on `classifyEdges` for the full trace against the real parcel below.

import { describe, expect, it } from 'vitest';
import { classifyEdges, type XZPoint } from '../src/ui/site/boundaryProjection';

/** Absolute shoelace area (m²) of an XZ ring. */
function areaXZ(ring: ReadonlyArray<XZPoint>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

// The REAL Córdoba Catastro ring for `2947201UG4924N` (AV MEDINA AZAHARA 7, ~782 m², OA-2),
// projected to local scene-XZ metres about its own centroid-ish reference point (equirectangular,
// matching `latLonToSceneXZ`'s own method). Its street frontage digitizes as edges 12→13→0 and its
// rear boundary as edges 8→9 — each pair near-collinear (well under 1° apart), separated from the
// genuine ~90° corners on every other side. This is the exact shape that reproduced the founder's
// 6.9 m² sliver on a 782 m² parcel under OA-2's real `{front:0, side:10.5, rear:10.5}` setbacks.
const CORDOBA_OA2_RING: XZPoint[] = [
    { x: 12.21, z: 16.81 }, { x: 12.12, z: 14.69 }, { x: 11.25, z: 2.12 }, { x: 11.07, z: -1.22 },
    { x: 10.63, z: -7.35 }, { x: 10.37, z: -10.69 }, { x: 10.19, z: -14.03 }, { x: 9.93, z: -17.03 },
    { x: 9.84, z: -18.37 }, { x: -8.26, z: -17.03 }, { x: -12.39, z: -16.70 }, { x: -11.07, z: 2.56 },
    { x: -9.93, z: 18.26 }, { x: 2.11, z: 17.48 },
];

describe('classifyEdges — §CLASSIFY-EDGES-RUN-GROUP (real multi-edge frontage/rear boundaries)', () => {
    it('sanity: the real ring area matches the published cadastral area (~782 m²)', () => {
        expect(areaXZ(CORDOBA_OA2_RING)).toBeCloseTo(784, -1); // within ~10 m² of 782/784
    });

    it('groups BOTH near-collinear edges of the real frontage/rear boundaries, not just one', () => {
        const out = classifyEdges(CORDOBA_OA2_RING);
        expect(out.length).toBe(CORDOBA_OA2_RING.length);

        const frontCount = out.filter((c) => c === 'front').length;
        const rearCount = out.filter((c) => c === 'rear').length;

        // Before the fix: exactly ONE edge each. The real boundary is two edges each (edges 8,9
        // form the rear-facing run; edges 12,13 form the front-facing run under this heuristic's
        // −Z/+Z convention) — the fix must group the whole run, not stop at the first edge.
        expect(frontCount).toBeGreaterThanOrEqual(2);
        expect(rearCount).toBeGreaterThanOrEqual(2);

        // The grouped edges must be genuinely CONSECUTIVE (a run), never scattered indices —
        // scattering would mean the grouping matched by chance, not by real adjacency.
        const frontIdx = out.map((c, i) => (c === 'front' ? i : -1)).filter((i) => i >= 0);
        const rearIdx = out.map((c, i) => (c === 'rear' ? i : -1)).filter((i) => i >= 0);
        const isConsecutiveCycle = (idx: number[]): boolean => {
            const n = CORDOBA_OA2_RING.length;
            const sorted = [...idx].sort((a, b) => a - b);
            for (let k = 1; k < sorted.length; k++) {
                if ((sorted[k]! - sorted[k - 1]! + n) % n !== 1) return false;
            }
            return true;
        };
        expect(isConsecutiveCycle(frontIdx)).toBe(true);
        expect(isConsecutiveCycle(rearIdx)).toBe(true);

        // Every OTHER edge (the genuine ~90°-turn sides) stays 'side' — this is a strict
        // generalisation, not a wholesale reclassification.
        expect(out.filter((c) => c === 'side').length).toBe(
            CORDOBA_OA2_RING.length - frontCount - rearCount,
        );
    });

    it('does NOT change behaviour on a clean rectangle (every neighbour turns ~90°, so each run is exactly one edge)', () => {
        const rect: XZPoint[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 20 }, { x: 0, z: 20 },
        ];
        const out = classifyEdges(rect);
        expect(out.filter((c) => c === 'front').length).toBe(1);
        expect(out.filter((c) => c === 'rear').length).toBe(1);
        expect(out.filter((c) => c === 'side').length).toBe(2);
    });

    it('never assigns the same edge to both front and rear', () => {
        const out = classifyEdges(CORDOBA_OA2_RING);
        // Trivially true by construction (each entry is one string), but pins the INVARIANT this
        // module's own safety-net comment calls out — a future edit that weakens `growRun`'s
        // stopping condition could otherwise let a merged run claim an edge twice.
        for (const c of out) {
            expect(['front', 'side', 'rear', 'unclassified']).toContain(c);
        }
    });
});
