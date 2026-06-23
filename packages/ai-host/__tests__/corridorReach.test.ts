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

// §STAIR-ROOM-FILL-POCKET (founder "green arrow", 2026-06-23) — the stair room must absorb ALL the
// adjacent empty pocket so it borders its neighbours cleanly, NOT just grow toward the corridor.
describe('§STAIR-ROOM-FILL-POCKET — fillPocket option', () => {
    const SHELL2: Rect = { x0: 0, z0: 0, x1: 10, z1: 6 };
    const CORR2 = rectPolygon({ x0: 0, z0: 2.5, x1: 6, z1: 3.5 });   // corridor on the left half

    it('default OFF: behaviour is byte-identical (no pocket fill)', () => {
        const stair: Rect = { x0: 6, z0: 2.5, x1: 7, z1: 3.5 };   // already abutting the corridor at x=6
        const out = growStairCellsToCorridor({
            corridorCell: CORR2, stairRects: new Map([['s', stair]]), obstacleCells: [], shellBBox: SHELL2,
        });
        expect(out.get('s')).toEqual(stair);   // unchanged without fillPocket
    });

    it('fillPocket ON: the stair absorbs the empty space around it without clipping a room', () => {
        // Stair small in a big empty plate, with ONE habitable room in the corner. The stair must
        // grow to fill all the empty pocket up to the corridor + the room + the shell edges.
        const stair: Rect = { x0: 6, z0: 2.5, x1: 7, z1: 3.5 };
        const room = rectPolygon({ x0: 8, z0: 0, x1: 10, z1: 6 });   // a room hugging the right edge
        const out = growStairCellsToCorridor({
            corridorCell: CORR2, stairRects: new Map([['s', stair]]), obstacleCells: [room],
            shellBBox: SHELL2, fillPocket: true,
        });
        const grown = out.get('s')!;
        // Grew up to the room's left face (x=8), not into it.
        expect(grown.x1).toBeCloseTo(8, 4);
        // Grew to the shell top + bottom (z 0..6) — the whole empty vertical pocket.
        expect(grown.z0).toBeCloseTo(0, 4);
        expect(grown.z1).toBeCloseTo(6, 4);
        // Left edge stays on the corridor (x=6) — it does not eat the corridor.
        expect(grown.x0).toBeCloseTo(6, 4);
        // Never overlaps the room (the hard invariant).
        expect(rectPolyOverlapArea(grown, room)).toBeLessThanOrEqual(1e-3);
        // Never overlaps the corridor.
        expect(rectPolyOverlapArea(grown, CORR2)).toBeLessThanOrEqual(1e-3);
        // It is now much larger than the original sliver (the pocket is absorbed).
        expect((grown.x1 - grown.x0) * (grown.z1 - grown.z0)).toBeGreaterThan(2 * 1);
    });

    it('fillPocket ON: absorbs an L-CORNER pocket (the founder ground-floor stair, 2026-06-23)', () => {
        // The founder geometry: the stair sits in a CORNER with an untracked pocket BESIDE it (between
        // the stair and the EAST shell wall) that a room does NOT fully fence off — the room only
        // occupies the bottom band, so the empty space wraps the stair's corner. The stair room must
        // absorb the maximal EMPTY rectangle (the corner pocket), not leave the white sliver beside it.
        const SHELL3: Rect = { x0: 0, z0: 0, x1: 10, z1: 6 };
        const corridor = rectPolygon({ x0: 0, z0: 4, x1: 1, z1: 6 });   // left-top corridor strip
        const stair: Rect = { x0: 1, z0: 4, x1: 3, z1: 6 };             // top, abutting the corridor at x=1
        // A room occupies the BOTTOM band only (does NOT reach the top), so the top-right is an EMPTY
        // corner pocket the stair must absorb (between the stair and the east shell wall).
        const room = rectPolygon({ x0: 1, z0: 0, x1: 5, z1: 4 });
        const out = growStairCellsToCorridor({
            corridorCell: corridor, stairRects: new Map([['s', stair]]), obstacleCells: [room],
            shellBBox: SHELL3, fillPocket: true,
        });
        const grown = out.get('s')!;
        // The stair grew EAST to the shell wall (x=10) — the corner pocket beside it is absorbed, not
        // left as untracked white space.
        expect(grown.x1).toBeCloseTo(10, 4);
        // It grew to the TOP shell (z=6) and stayed off the room (z stays ≥ 4 over the room's x-range).
        expect(grown.z1).toBeCloseTo(6, 4);
        // Never eats the room or the corridor (the hard invariant).
        expect(rectPolyOverlapArea(grown, room)).toBeLessThanOrEqual(1e-3);
        expect(rectPolyOverlapArea(grown, corridor)).toBeLessThanOrEqual(1e-3);
        // The absorbed pocket is materially bigger than the original 2×2 stair landing.
        expect((grown.x1 - grown.x0) * (grown.z1 - grown.z0)).toBeGreaterThan(2 * 2 + 1e-3);
    });

    it('fillPocket ON: two stairs never grow into each other', () => {
        const s0: Rect = { x0: 6, z0: 2.5, x1: 7, z1: 3.5 };
        const s1: Rect = { x0: 8.5, z0: 2.5, x1: 9.5, z1: 3.5 };
        const out = growStairCellsToCorridor({
            corridorCell: CORR2, stairRects: new Map([['s0', s0], ['s1', s1]]), obstacleCells: [],
            shellBBox: SHELL2, fillPocket: true,
        });
        const g0 = out.get('s0')!, g1 = out.get('s1')!;
        const ov = Math.max(0, Math.min(g0.x1, g1.x1) - Math.max(g0.x0, g1.x0))
            * Math.max(0, Math.min(g0.z1, g1.z1) - Math.max(g0.z0, g1.z0));
        expect(ov).toBeLessThanOrEqual(1e-3);
    });

    it('fillPocket is deterministic', () => {
        const stair: Rect = { x0: 6, z0: 2.5, x1: 7, z1: 3.5 };
        const room = rectPolygon({ x0: 8, z0: 0, x1: 10, z1: 6 });
        const mk = () => growStairCellsToCorridor({
            corridorCell: CORR2, stairRects: new Map([['s', stair]]), obstacleCells: [room],
            shellBBox: SHELL2, fillPocket: true,
        });
        expect([...mk()]).toEqual([...mk()]);
    });
});
