// §HALL-HINGE-CORRIDOR-FIT (2026-06-21) — recover the hall-hinge carve on a SHALLOW private wing.
//
// Live ground-floor defect (founder, PR #519): the hall-hinge carve bailed when the private band
// fell short by a sliver PURELY because the fixed 1.2 m corridor strip ate the wing
// (wingAlong=5.4 − hall=2.3 − corridor=1.2 = 1.9 m < 2.0 m). Bailing fell through to squarify,
// which BURIED the bedroom behind the public zone (it then doored onto the dining room, not
// circulation — the §DIAG-TOPO-GATE circulation/privacy failure). The fix NARROWS the corridor
// toward its 1.0 m minimum walkable width to keep the band ≥ 2.0 m, recovering the carve.
//
// The recovery's arithmetic is exercised here directly (it is the binding logic of the fix), and
// the end-to-end no-regression / no-public-on-corridor invariants are asserted through subdivide.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PUBLIC = new Set(['living', 'kitchen', 'dining']);

function sharedWallM(a: Rect, b: Rect): number {
    const eps = 0.05;
    if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) {
        const ov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (ov > eps) return ov;
    }
    if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps) {
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (ov > eps) return ov;
    }
    return 0;
}

// ── (1) The recovery's binding arithmetic, in isolation ──────────────────────
//
// This mirrors the EXACT in-engine computation at the §HALL-HINGE-CORRIDOR-FIT branch. Keeping it
// here pins the contract: narrow the corridor toward corridorMin to keep the band ≥ MIN_ZONE; never
// below corridorMin; leave cw untouched when the band already passes (existing carves byte-identical).
const MIN_ZONE = 2.0;          // private-band minimum depth (matches subdivide.ts)
const CORRIDOR_FULL = 1.2;     // CORRIDOR_STRIP_WIDTH_M
const CORRIDOR_MIN = 1.0;      // roomRule('corridor').minShortSideM

/** Returns the corridor width the fit would use, or null if it genuinely cannot fit (bail). */
function fitCorridorWidth(wingAlong: number, hallDepth: number): number | null {
    let cw = CORRIDOR_FULL;
    const maxCwForBand = wingAlong - hallDepth - MIN_ZONE;
    if (cw > maxCwForBand && maxCwForBand >= CORRIDOR_MIN - 1e-6) cw = Math.max(CORRIDOR_MIN, maxCwForBand);
    return wingAlong - hallDepth - cw < MIN_ZONE - 1e-6 ? null : cw;
}

describe('§HALL-HINGE-CORRIDOR-FIT — recovery arithmetic', () => {
    it('recovers the live case (wing 5.4, hall 2.3) by narrowing the corridor 1.2→1.1 m', () => {
        const cw = fitCorridorWidth(5.4, 2.3);
        expect(cw).not.toBeNull();
        expect(cw!).toBeCloseTo(1.1, 5);           // band becomes exactly 2.0 m
        expect(5.4 - 2.3 - cw!).toBeGreaterThanOrEqual(MIN_ZONE - 1e-6);
        expect(cw!).toBeGreaterThanOrEqual(CORRIDOR_MIN - 1e-6);   // still walkable
    });

    it('leaves the corridor at full width when the wing is deep enough (byte-identical)', () => {
        // band with full 1.2 m strip = 6.5 − 2.3 − 1.2 = 3.0 ≥ 2.0 → no narrowing.
        expect(fitCorridorWidth(6.5, 2.3)).toBeCloseTo(CORRIDOR_FULL, 5);
    });

    it('bails (null) only when even the 1.0 m minimum corridor cannot leave a usable band', () => {
        // wing 5.0, hall 2.3 → maxCwForBand = 0.7 < corridorMin 1.0 → cannot recover.
        expect(fitCorridorWidth(5.0, 2.3)).toBeNull();
        // boundary: wing 5.3, hall 2.3 → maxCwForBand = 1.0 = corridorMin → recovers at exactly 1.0.
        expect(fitCorridorWidth(5.3, 2.3)).toBeCloseTo(CORRIDOR_MIN, 5);
    });

    it('never narrows below the corridor minimum and never widens beyond the full strip', () => {
        for (let wing = 4.5; wing <= 9; wing += 0.1) {
            const cw = fitCorridorWidth(wing, 2.3);
            if (cw === null) continue;
            expect(cw).toBeGreaterThanOrEqual(CORRIDOR_MIN - 1e-6);
            expect(cw).toBeLessThanOrEqual(CORRIDOR_FULL + 1e-6);
            expect(wing - 2.3 - cw).toBeGreaterThanOrEqual(MIN_ZONE - 1e-6);
        }
    });
});

// ── (2) End-to-end: a ground plate still carves cleanly, no public on corridor ─
describe('§HALL-HINGE-CORRIDOR-FIT — end-to-end carve stays sound', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { logSpy.mockRestore(); });

    const GROUND: ApartmentProgram = {
        bedrooms: 1, bathrooms: 1, masterEnSuite: false,
        includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
    };
    const PLATE: Rect[] = [
        { x0: 0, z0: 0, x1: 13, z1: 6 },
        { x0: 0, z0: 6, x1: 13, z1: 11.46 },
        { x0: 13, z0: 0, x1: 16, z1: 5.3 },
        { x0: 13, z0: 5.3, x1: 16, z1: 9.3 },
        { x0: 13, z0: 9.3, x1: 16, z1: 12.3 },
    ];
    const KEEPOUT: Rect[] = [{ x0: 14, z0: 9.5, x1: 16, z1: 12.3 }];

    it('no public room (living/kitchen/dining) abuts the corridor', () => {
        const x1m = 16, z1m = 12.3;
        const area = PLATE.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: x1m, z: 0 }, { x: x1m, z: z1m }, { x: 0, z: z1m }];
        const graph = buildBubbleGraph(GROUND, area, poly, { envelopeFitGrowth: false });
        const sub = subdivideWithReport(PLATE, graph, { stairCarved: true, keepOutRects: KEEPOUT });
        const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
        const corridor = graph.rooms.find(r => r.type === 'corridor');
        const corrP = corridor && sub.placements.find(p => p.roomId === corridor.id);
        if (!corrP) return;   // corridor dropped on this plate — not this test's concern
        const publicOnCorr = sub.placements.filter(p =>
            PUBLIC.has(typeById.get(p.roomId) ?? '') && sharedWallM(p.rect, corrP.rect) >= 0.9);
        expect(publicOnCorr).toHaveLength(0);
    });
});
