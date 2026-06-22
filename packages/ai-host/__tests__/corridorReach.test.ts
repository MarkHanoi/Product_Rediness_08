// §CORRIDOR-REACH P1 — the pure polygon-route stair→corridor grow (founder 2026-06-22: the corridor
// is the spine that connects the stair). These tests pin the geometry in ISOLATION (no enumerate
// plumbing): a stair separated from the corridor by EMPTY space grows to abut it; an already-abutting
// stair is untouched; a stair whose only path is BLOCKED by a room stays put (never clips a room).

import { describe, expect, it } from 'vitest';
import { growStairCellsToCorridor, rectPolyOverlapArea } from '../src/workflows/apartmentLayout/tgl/corridorReach.js';
import { rectPolygon } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const SHELL: Rect = { x0: 0, z0: 0, x1: 10, z1: 6 };
// A horizontal corridor strip spanning most of the plate at z∈[2.5,3.5], x∈[0,8].
const CORRIDOR = rectPolygon({ x0: 0, z0: 2.5, x1: 8, z1: 3.5 });

describe('§CORRIDOR-REACH P1 — growStairCellsToCorridor', () => {
    it('grows a stair separated from the corridor by EMPTY space until it abuts it (≥ door width)', () => {
        // Stair sits to the RIGHT of the corridor end with a 0.5 m empty gap (corridor x1=8, stair x0=8.5).
        const stair: Rect = { x0: 8.5, z0: 2.5, x1: 9.5, z1: 3.5 };
        const out = growStairCellsToCorridor({
            corridorCell: CORRIDOR,
            stairRects: new Map([['stair0', stair]]),
            obstacleCells: [],
            shellBBox: SHELL,
        });
        const grown = out.get('stair0')!;
        // It grew −x to the corridor's right edge (x=8), so it now spans the gap and abuts the corridor.
        expect(grown.x0).toBeCloseTo(8, 6);
        expect(grown.x1).toBeCloseTo(9.5, 6);   // far edge unchanged
        // Shares a full 1.0 m wall with the corridor at x=8 over z∈[2.5,3.5].
        expect(rectPolyOverlapArea({ x0: 7.99, z0: 2.5, x1: 8.01, z1: 3.5 }, rectPolygon(grown))).toBeGreaterThan(0);
    });

    it('leaves an already-abutting stair UNCHANGED', () => {
        const stair: Rect = { x0: 8, z0: 2.5, x1: 9, z1: 3.5 };   // left edge x=8 == corridor right edge
        const out = growStairCellsToCorridor({
            corridorCell: CORRIDOR,
            stairRects: new Map([['stair0', stair]]),
            obstacleCells: [],
            shellBBox: SHELL,
        });
        expect(out.get('stair0')).toEqual(stair);
    });

    it('does NOT grow (stays put) when a room BLOCKS the only path — never clips a room', () => {
        const stair: Rect = { x0: 8.5, z0: 2.5, x1: 9.5, z1: 3.5 };
        // A room fills the empty gap x∈[8,8.5] (and beyond), so the −x grow would overlap it.
        const blocker = rectPolygon({ x0: 8, z0: 2.0, x1: 8.5, z1: 4.0 });
        const out = growStairCellsToCorridor({
            corridorCell: CORRIDOR,
            stairRects: new Map([['stair0', stair]]),
            obstacleCells: [blocker],
            shellBBox: SHELL,
        });
        expect(out.get('stair0')).toEqual(stair);   // unchanged — no room clipped
    });

    it('never leaves the shell bbox', () => {
        // Corridor far to the left; stair hard against the right shell edge with no room between, but the
        // grow target (corridor) is reachable only by crossing the whole plate — allowed only if empty.
        const stair: Rect = { x0: 9, z0: 2.5, x1: 10, z1: 3.5 };
        const out = growStairCellsToCorridor({
            corridorCell: CORRIDOR,
            stairRects: new Map([['stair0', stair]]),
            obstacleCells: [],
            shellBBox: SHELL,
        });
        const grown = out.get('stair0')!;
        expect(grown.x0).toBeGreaterThanOrEqual(SHELL.x0 - 1e-6);
        expect(grown.x1).toBeLessThanOrEqual(SHELL.x1 + 1e-6);
    });

    it('is deterministic', () => {
        const stair: Rect = { x0: 8.5, z0: 2.5, x1: 9.5, z1: 3.5 };
        const mk = () => growStairCellsToCorridor({
            corridorCell: CORRIDOR, stairRects: new Map([['stair0', stair]]), obstacleCells: [], shellBBox: SHELL,
        });
        expect([...mk()]).toEqual([...mk()]);
    });

    it('rectPolyOverlapArea measures rect∩polygon area', () => {
        const poly = rectPolygon({ x0: 0, z0: 0, x1: 4, z1: 4 });   // 16 m²
        expect(rectPolyOverlapArea({ x0: 2, z0: 2, x1: 6, z1: 6 }, poly)).toBeCloseTo(4, 5);  // 2×2 corner
        expect(rectPolyOverlapArea({ x0: 5, z0: 5, x1: 6, z1: 6 }, poly)).toBeCloseTo(0, 5);  // disjoint
    });
});
