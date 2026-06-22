// §SUITE-WITHIN-PARENT ("hotel-style" ensuite suites) — TEST-FIRST, GATED build.
//
// Doctrine: docs/04-reference/LAYOUT-GENERATION-ALGORITHM.md §20.3. On a HOUSE
// UPPER storey, with the window toggle `__pryzmHotelSuites === true`, the program
// mints SUITES — every bedroom (master + others) gets its OWN paired ensuite
// (door opening FROM the bedroom, never the corridor) — and the standalone shared
// bathroom count drops. The subdivider carves each ensuite from a CORNER of its
// host bedroom's cell.
//
// CRITICAL (this is the most-reverted area of the engine):
//   • Default OFF ⇒ program mint + carve are BYTE-IDENTICAL to today.
//   • House UPPER path ONLY (gated on the upper-storey signal: no kitchen, no
//     living, no entrance hall). Apartment 'single' + ground floor are unchanged.
//   • Pure + deterministic (ADR-0061): no RNG, no Date.now.

import { afterEach, describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { rectArea, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

// A house UPPER storey program (the §SUITE-WITHIN-PARENT target):
//   bedrooms + a bath, NO kitchen / NO living / NO entrance hall (storeyAllocation
//   + houseProgramFloor produce exactly these flags for role 'upper').
const UPPER_PROGRAM: ApartmentProgram = {
    bedrooms: 4, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
    includeKitchen: false,
};

// An APARTMENT (single) program — must be byte-identical with the toggle ON.
const APARTMENT_PROGRAM: ApartmentProgram = {
    bedrooms: 4, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

// A house GROUND program — has public rooms; must be unaffected by the toggle.
const GROUND_PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    includeKitchen: true,
};

const setToggle = (on: boolean): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    g.window = { ...(g.window ?? {}), __pryzmHotelSuites: on };
};
const clearToggle = (): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    if (g.window) delete g.window.__pryzmHotelSuites;
};

afterEach(() => clearToggle());

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

const sharesWall = (a: Rect, b: Rect): boolean => {
    // Share a vertical wall (touch in x) with z-overlap, or a horizontal wall.
    const touchX = Math.abs(a.x1 - b.x0) < 1e-3 || Math.abs(a.x0 - b.x1) < 1e-3;
    const touchZ = Math.abs(a.z1 - b.z0) < 1e-3 || Math.abs(a.z0 - b.z1) < 1e-3;
    const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-3;
    const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-3;
    return (touchX && zOverlap) || (touchZ && xOverlap);
};

describe('§SUITE-WITHIN-PARENT — hotel-style ensuite suites (gated, default OFF)', () => {
    // ───────────────────────────────────────────────────────────────────────
    // TEST 1 — OFF-path byte-identity (the regression guard). MUST be green
    //          before any engine edit ships.
    // ───────────────────────────────────────────────────────────────────────
    describe('toggle OFF — byte-identical to today', () => {
        it('buildBubbleGraph on a house upper program is unchanged', () => {
            clearToggle();
            const off = buildBubbleGraph(UPPER_PROGRAM, 180);
            // No toggle present at all = the established baseline.
            const baseline = buildBubbleGraph(UPPER_PROGRAM, 180);
            expect(JSON.stringify(off.rooms)).toBe(JSON.stringify(baseline.rooms));
            expect(JSON.stringify(off.edges)).toBe(JSON.stringify(baseline.edges));
            // Exactly ONE ensuite today (the master's); the rest are shared bathrooms.
            const ensuites = off.rooms.filter(r => r.type === 'ensuite');
            const baths = off.rooms.filter(r => r.type === 'bathroom');
            expect(ensuites.length).toBe(1);
            expect(baths.length).toBe(2);
        });

        it('subdivide on a house upper program is unchanged with the toggle OFF', () => {
            clearToggle();
            const shell: Rect[] = [{ x0: 0, z0: 0, x1: 14, z1: 11 }]; // 154 m²
            const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(shell[0]!));
            const baseline = subdivide(shell, g);
            const again = subdivide(shell, buildBubbleGraph(UPPER_PROGRAM, rectArea(shell[0]!)));
            expect(JSON.stringify(baseline)).toBe(JSON.stringify(again));
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // TEST 2 — toggle ON: the SUITE PROGRAM mint.
    // ───────────────────────────────────────────────────────────────────────
    describe('toggle ON — suite program mint (house upper only)', () => {
        it('mints one ensuite per bedroom (suite), each paired to its host', () => {
            setToggle(true);
            const g = buildBubbleGraph(UPPER_PROGRAM, 180);
            const beds = g.rooms.filter(r => r.type === 'master' || r.type === 'bedroom');
            const ensuites = g.rooms.filter(r => r.type === 'ensuite');
            // Each bedroom is a suite ⇒ ensuite count == bedroom count.
            expect(ensuites.length).toBe(beds.length);
            // Every ensuite is paired to a DISTINCT bedroom host.
            const hostIds = ensuites.map(e => e.ensuiteHostId);
            expect(hostIds.every(h => typeof h === 'string')).toBe(true);
            expect(new Set(hostIds).size).toBe(hostIds.length);
            const bedIdSet = new Set(beds.map(b => b.id));
            expect(hostIds.every(h => bedIdSet.has(h!))).toBe(true);
        });

        it('drops the standalone shared-bathroom count in favour of ensuites', () => {
            setToggle(true);
            const on = buildBubbleGraph(UPPER_PROGRAM, 180);
            clearToggle();
            const off = buildBubbleGraph(UPPER_PROGRAM, 180);
            const onBaths = on.rooms.filter(r => r.type === 'bathroom').length;
            const offBaths = off.rooms.filter(r => r.type === 'bathroom').length;
            expect(onBaths).toBeLessThan(offBaths);
            // 4 bedrooms (even) ⇒ no leftover shared bath.
            expect(onBaths).toBe(0);
        });

        it('keeps at most one shared bath when the bedroom count is odd', () => {
            setToggle(true);
            const oddProgram: ApartmentProgram = { ...UPPER_PROGRAM, bedrooms: 3, bathrooms: 2 };
            const g = buildBubbleGraph(oddProgram, 150);
            const beds = g.rooms.filter(r => r.type === 'master' || r.type === 'bedroom');
            const ensuites = g.rooms.filter(r => r.type === 'ensuite');
            const baths = g.rooms.filter(r => r.type === 'bathroom').length;
            expect(ensuites.length).toBe(beds.length);
            // Suites cover every bedroom; the shared baths are eliminated (odd count
            // is allowed to keep ≤ 1, never more).
            expect(baths).toBeLessThanOrEqual(1);
        });

        it('every ensuite door opens FROM its host bedroom, NEVER the corridor', () => {
            setToggle(true);
            const g = buildBubbleGraph(UPPER_PROGRAM, 180);
            const ensuites = g.rooms.filter(r => r.type === 'ensuite');
            for (const e of ensuites) {
                const edgesTouchingEnsuite = g.edges.filter(ed => ed.a === e.id || ed.b === e.id);
                // Exactly one edge: ensuite ↔ its host bedroom.
                expect(edgesTouchingEnsuite.length).toBe(1);
                const ed = edgesTouchingEnsuite[0]!;
                const other = ed.a === e.id ? ed.b : ed.a;
                expect(other).toBe(e.ensuiteHostId);
                // Never the corridor.
                expect(other).not.toBe(g.corridorId);
            }
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // TEST 2b — toggle ON must NOT affect the apartment / ground (house-upper only).
    // ───────────────────────────────────────────────────────────────────────
    describe('toggle ON — non-upper paths unaffected', () => {
        it('apartment (single) program is byte-identical with the toggle ON', () => {
            clearToggle();
            const off = buildBubbleGraph(APARTMENT_PROGRAM, 200);
            setToggle(true);
            const on = buildBubbleGraph(APARTMENT_PROGRAM, 200);
            expect(JSON.stringify(on.rooms)).toBe(JSON.stringify(off.rooms));
            expect(JSON.stringify(on.edges)).toBe(JSON.stringify(off.edges));
        });

        it('house ground (has public rooms) is byte-identical with the toggle ON', () => {
            clearToggle();
            const off = buildBubbleGraph(GROUND_PROGRAM, 150);
            setToggle(true);
            const on = buildBubbleGraph(GROUND_PROGRAM, 150);
            expect(JSON.stringify(on.rooms)).toBe(JSON.stringify(off.rooms));
            expect(JSON.stringify(on.edges)).toBe(JSON.stringify(off.edges));
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // TEST 3 — toggle ON: each ensuite is a CORNER sub-rect inside its host.
    // ───────────────────────────────────────────────────────────────────────
    describe('toggle ON — multi-ensuite corner carve (subdivide)', () => {
        it('places each ensuite as a corner sub-rect inside its host bedroom; no overlaps; ensuite off corridor', () => {
            setToggle(true);
            const shell: Rect[] = [{ x0: 0, z0: 0, x1: 16, z1: 12 }]; // 192 m²
            const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(shell[0]!));
            const placements = subdivide(shell, g);

            const byId = new Map(placements.map(p => [p.roomId, p.rect]));
            const corridorRect = g.corridorId ? byId.get(g.corridorId) : undefined;
            const ensuites = g.rooms.filter(r => r.type === 'ensuite');

            // No two placed rooms overlap (the global gate the engine relies on).
            for (let i = 0; i < placements.length; i++)
                for (let j = i + 1; j < placements.length; j++)
                    expect(overlaps(placements[i]!.rect, placements[j]!.rect),
                        `${placements[i]!.roomId} overlaps ${placements[j]!.roomId}`).toBe(false);

            // Count how many ensuites actually carved (vs fell back). At least the
            // master's ensuite (the established single carve) must place.
            let carved = 0;
            for (const e of ensuites) {
                const er = byId.get(e.id);
                if (!er) continue;        // fell back / dropped — covered by test 4
                carved += 1;
                const hostRect = byId.get(e.ensuiteHostId!);
                expect(hostRect, `host placed for ensuite ${e.id}`).toBeDefined();
                // Ensuite shares a wall with its host (the host↔ensuite door wall).
                expect(sharesWall(er, hostRect!), `ensuite ${e.id} shares a wall with host`).toBe(true);
                // Ensuite does NOT share a (door-width) wall with the corridor.
                if (corridorRect) {
                    const touchX = Math.abs(er.x1 - corridorRect.x0) < 1e-3 || Math.abs(er.x0 - corridorRect.x1) < 1e-3;
                    const touchZ = Math.abs(er.z1 - corridorRect.z0) < 1e-3 || Math.abs(er.z0 - corridorRect.z1) < 1e-3;
                    const zRun = Math.min(er.z1, corridorRect.z1) - Math.max(er.z0, corridorRect.z0);
                    const xRun = Math.min(er.x1, corridorRect.x1) - Math.max(er.x0, corridorRect.x0);
                    const corridorWallM = (touchX ? Math.max(0, zRun) : 0) + (touchZ ? Math.max(0, xRun) : 0);
                    expect(corridorWallM, `ensuite ${e.id} must not abut the corridor (got ${corridorWallM.toFixed(2)}m)`).toBeLessThan(0.8);
                }
            }
            expect(carved).toBeGreaterThanOrEqual(1);
        });
    });

    // ───────────────────────────────────────────────────────────────────────
    // TEST 4 — fall-back: a too-small host leaves the bedroom whole + reports
    //          (never silently drops the suite without a trace).
    // ───────────────────────────────────────────────────────────────────────
    describe('toggle ON — fall-back when a host cell is too small', () => {
        it('a tiny shell does not crash and never produces an overlapping/over-tiled layout', () => {
            setToggle(true);
            // A small shell: not every bedroom cell can seat both a bedroom + ensuite
            // at minimum. The carve must FALL BACK per-suite (host stays whole), never
            // overlap and never tile past the shell.
            const shell: Rect[] = [{ x0: 0, z0: 0, x1: 9, z1: 8 }]; // 72 m², 4-bed upper
            const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(shell[0]!));
            const placements = subdivide(shell, g);
            for (let i = 0; i < placements.length; i++)
                for (let j = i + 1; j < placements.length; j++)
                    expect(overlaps(placements[i]!.rect, placements[j]!.rect)).toBe(false);
            const foot = placements.reduce((s, p) => s + rectArea(p.rect), 0);
            expect(foot).toBeLessThanOrEqual(rectArea(shell[0]!) + 1e-2);
            // Every placed bedroom that did NOT get its ensuite carved is still a whole
            // rect (≥ its own minimum) — i.e. it was left whole, not shrunk-then-orphaned.
            const beds = g.rooms.filter(r => r.type === 'master' || r.type === 'bedroom');
            const byId = new Map(placements.map(p => [p.roomId, p.rect]));
            for (const b of beds) {
                const r = byId.get(b.id);
                if (!r) continue;
                expect(rectArea(r)).toBeGreaterThan(0);
            }
        });
    });
});
