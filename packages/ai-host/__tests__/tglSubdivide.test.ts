// TGL P3b — subdivision (rooms → footprints) tests.
// Contract (SPEC §7): every room gets exactly one footprint; footprints ⊆ shell
// rects; non-overlapping; total footprint area ≈ shell area; corridor cell
// present iff corridorId.

import { describe, expect, it } from 'vitest';
import { subdivide, subdivideWithReport, adjacencySortForZone } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, rectArea, subtractRectsFromRects, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

/** A footprint lies inside the union of shell rects iff it is contained in one. */
const insideShell = (f: Rect, shell: readonly Rect[]): boolean =>
    shell.some(s => f.x0 >= s.x0 - 1e-6 && f.z0 >= s.z0 - 1e-6 && f.x1 <= s.x1 + 1e-6 && f.z1 <= s.z1 + 1e-6);

const ABSOLUTE_MIN_SIDE = 0.9;   // matches ABSOLUTE_MIN_SHORT_SIDE_M in subdivide.ts
const shortSide = (r: Rect): number => Math.min(r.x1 - r.x0, r.z1 - r.z0);

const assertContract = (placements: ReturnType<typeof subdivide>, shell: readonly Rect[], rooms: readonly ProgramRoom[]): void => {
    // §HARD-MIN-SIDE-PER-ROOM (2026-05-28, updated): placements MAY be a strict
    // subset of the room set — rooms that would produce a short side smaller
    // than their per-type minShortSideM are dropped. Every placement that DOES
    // land must clear its own per-type floor.
    const placedIds = placements.map(p => p.roomId).sort();
    const roomIds = rooms.map(r => r.id);
    const roomIdsSorted = [...roomIds].sort();
    const typeById = new Map(rooms.map(r => [r.id, r.type]));
    expect(new Set(placedIds).size).toBe(placedIds.length);   // no duplicates
    expect(placedIds.every(id => roomIdsSorted.includes(id))).toBe(true);
    for (const p of placements) {
        expect(insideShell(p.rect, shell), `placement ${p.roomId} inside shell`).toBe(true);
        const type = typeById.get(p.roomId)!;
        const floor = Math.max(ABSOLUTE_MIN_SIDE, roomRule(type).minShortSideM || ABSOLUTE_MIN_SIDE);
        expect(shortSide(p.rect), `placement ${p.roomId} (${type}) short side ≥ ${floor} m`).toBeGreaterThanOrEqual(floor - 1e-6);
    }
    for (let i = 0; i < placements.length; i++)
        for (let j = i + 1; j < placements.length; j++)
            expect(overlaps(placements[i]!.rect, placements[j]!.rect)).toBe(false);
    // Total footprint area ≤ shell area (drops leave slack — neighbours absorb
    // it via squarify on the surviving pool, so equality is typical but not
    // mandatory after a drop). Strict equality is only required when no room
    // was dropped.
    const footArea = placements.reduce((s, p) => s + rectArea(p.rect), 0);
    const shellArea = shell.reduce((s, r) => s + rectArea(r), 0);
    expect(footArea).toBeLessThanOrEqual(shellArea + 1e-3);
    if (placedIds.length === roomIdsSorted.length) {
        // No drops → strict tiling of the shell.
        expect(footArea).toBeCloseTo(shellArea, 3);
    }
};

describe('subdivide (TGL P3b)', () => {
    it('rectangular shell: one footprint per room, tiling the shell with no overlap', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }]; // 120 m²
        const g = buildBubbleGraph(PROGRAM, rectArea(shell[0]!));
        const out = subdivide(shell, g);
        assertContract(out, shell, g.rooms);
    });

    it('L-shaped shell (two rects): every rect is used, contract holds', () => {
        // L: 12×10 with a 6×4 notch cut from the top-right.
        const poly: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const shell = decomposeToRects(poly);
        expect(shell.length).toBeGreaterThanOrEqual(2);
        const shellArea = shell.reduce((s, r) => s + rectArea(r), 0);
        const g = buildBubbleGraph(PROGRAM, shellArea);
        const out = subdivide(shell, g);
        assertContract(out, shell, g.rooms);
    });

    it('corridor footprint present iff the graph has a corridor', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        const withCorridor = buildBubbleGraph(PROGRAM, 120);
        const out1 = subdivide(shell, withCorridor);
        expect(out1.some(p => p.roomId === withCorridor.corridorId)).toBe(true);

        const studio: ApartmentProgram = { bedrooms: 0, bathrooms: 0, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const g2 = buildBubbleGraph(studio, 50);
        expect(g2.corridorId).toBeNull();
        const out2 = subdivide([{ x0: 0, z0: 0, x1: 10, z1: 5 }], g2);
        assertContract(out2, [{ x0: 0, z0: 0, x1: 10, z1: 5 }], g2.rooms);
    });

    it('is deterministic — identical input gives byte-identical output', () => {
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        const g = buildBubbleGraph(PROGRAM, 120);
        expect(JSON.stringify(subdivide(shell, g))).toEqual(JSON.stringify(subdivide(shell, g)));
    });

    it('returns [] for degenerate input', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        expect(subdivide([], g)).toEqual([]);
        expect(subdivide([{ x0: 0, z0: 0, x1: 0, z1: 0 }], g)).toEqual([]);
        const empty = buildBubbleGraph({ bedrooms: 0, bathrooms: 0, masterEnSuite: false, openPlanKitchenDining: false, livingRoom: false, entranceHall: false }, 0);
        // kitchen is always pushed, so this still has 1 room — but a zero-area shell yields [].
        expect(subdivide([{ x0: 0, z0: 0, x1: 0, z1: 0 }], empty)).toEqual([]);
    });

    // §NO-PUBLIC-CARVE (founder defect, 2026-06-10) — an UPPER HOUSE STOREY has a
    // corridor + bedrooms + baths but NO public room (no living/kitchen/dining/hall).
    // The 3-zone carve hard-required a public zone, so the corridor was squarified as
    // a treemap cell touching only the front-row master → every other bedroom/bath
    // SEALED (prod: 8 rooms / 2 doors). The double-loaded carve must make EVERY
    // private room share a wall with the corridor so wallsAndDoors can place its door.
    it('§NO-PUBLIC-CARVE: upper-storey (no public room) — every private room abuts the corridor', () => {
        // Two ways two rects SHARE A WALL (a common edge of non-zero extent).
        const sharesWall = (a: Rect, b: Rect): boolean => {
            const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
            const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
            if (vAbut && zOv > 0.05) return true;
            const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
            const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            return hAbut && xOv > 0.05;
        };
        // Upper-storey programme: 3 bedrooms + 2 baths + ensuite, NO public rooms.
        const upper: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
            includeKitchen: false,
        };
        const shell = [{ x0: 0, z0: 0, x1: 12, z1: 9 }];   // 108 m²
        const g = buildBubbleGraph(upper, rectArea(shell[0]!));
        // No public room minted (the trigger for the double-loaded path).
        expect(g.rooms.every(r => roomRule(r.type).privacy !== 'public')).toBe(true);
        expect(g.corridorId).not.toBeNull();
        const out = subdivide(shell, g);
        assertContract(out, shell, g.rooms);

        const corridor = out.find(p => p.roomId === g.corridorId)!;
        expect(corridor).toBeDefined();
        // EVERY private room (bedroom / master / bathroom) must share a wall with the
        // corridor — the ensuite is the only exception (reached through the master).
        const ensuiteId = g.rooms.find(r => r.type === 'ensuite')?.id;
        const privateIds = g.rooms
            .filter(r => roomRule(r.type).privacy === 'private' && r.id !== ensuiteId)
            .map(r => r.id);
        const placedPrivate = out.filter(p => privateIds.includes(p.roomId));
        expect(placedPrivate.length).toBeGreaterThan(0);
        for (const p of placedPrivate) {
            expect(
                sharesWall(p.rect, corridor.rect),
                `private room ${p.roomId} must abut the corridor (double-loaded spine)`,
            ).toBe(true);
        }
    });
});

// ───────────────── §STAIR-OBSTACLE-CARVE (2026-06-08, Defect A) ───────────────
//
// A multi-storey house carves a stair-core keep-out out of the plate, fracturing
// the single rectangle into a FRAME / L of 2–4 sub-rects. The generic multi-rect
// path packs each fragment INDEPENDENTLY → no corridor spine across the hole → the
// plan ships as a merged blob with a §CIRCULATION-REROUTE compromise (the founder's
// central-stair defect: ONE giant "Living/Corridor/Bedroom/Kitchen/Bathroom" room).
// With `stairCarved: true` the subdivider runs the corridor carve on the DOMINANT
// sub-rect so every room is enclosed + corridor-linked and the slivers stay empty.

describe('subdivideWithReport — stair-carved plate keeps a corridor spine (Defect A)', () => {
    /** Carve a stair keep-out hole (metres) out of a single plate, return the
     *  fractured rect set the way enumerate.ts builds it. */
    const carve = (plate: Rect, hole: Rect): Rect[] =>
        subtractRectsFromRects([plate], [{
            x0: hole.x0 - 0.05, z0: hole.z0 - 0.05, x1: hole.x1 + 0.05, z1: hole.z1 + 0.05,
        }]);

    const plate: Rect = { x0: 0, z0: 0, x1: 13, z1: 10 };   // 130 m² ground floor

    it('a CENTRAL hole fractures the plate into ≥3 sub-rects (the failure topology)', () => {
        const rects = carve(plate, { x0: 5.5, z0: 3.6, x1: 7.5, z1: 6.4 });
        // bottom + top full-width bands + left + right side bands.
        expect(rects.length).toBeGreaterThanOrEqual(3);
    });

    // The BACK-CORNER stair the placement engine (§STAIR-CORNER-ANCHOR) now produces:
    // flush to a side wall AND the rear wall → a clean L = one dominant rect + a small
    // corner sliver, so the corridor carve runs on the dominant rect.
    const cornerCore: Rect = { x0: 0, z0: 7.2, x1: 2, z1: 10 };

    it('with stairCarved=true a back-CORNER hole yields a corridor + many enclosed rooms', () => {
        const rects = carve(plate, cornerCore);
        expect(rects.length).toBeGreaterThanOrEqual(2);
        const g = buildBubbleGraph(PROGRAM, rectArea(plate));
        const res = subdivideWithReport(rects, g, { stairCarved: true });
        // A real corridor is placed (the spine), plus multiple distinct rooms.
        expect(res.placements.some(p => p.roomId === g.corridorId)).toBe(true);
        expect(res.placements.length).toBeGreaterThanOrEqual(4);
        // Every placement stays clear of the stair keep-out (no room over the core).
        for (const p of res.placements) {
            const o = p.rect.x0 < cornerCore.x1 - 1e-6 && cornerCore.x0 < p.rect.x1 - 1e-6 &&
                      p.rect.z0 < cornerCore.z1 - 1e-6 && cornerCore.z0 < p.rect.z1 - 1e-6;
            expect(o, `placement ${p.roomId} must not overlap the stair core`).toBe(false);
        }
    });

    it('the stairCarved corridor carve produces NON-overlapping placements', () => {
        const rects = carve(plate, cornerCore);
        const g = buildBubbleGraph(PROGRAM, rectArea(plate));
        const res = subdivideWithReport(rects, g, { stairCarved: true });
        for (let i = 0; i < res.placements.length; i++)
            for (let j = i + 1; j < res.placements.length; j++)
                expect(overlaps(res.placements[i]!.rect, res.placements[j]!.rect)).toBe(false);
    });

    it('a NON-carved multi-rect L-shell is UNCHANGED by the stairCarved flag default-off', () => {
        // Regression guard: a real L shell (not a stair carve) must NOT trigger the
        // dominant-rect corridor carve — it uses the generic multi-rect path.
        const poly: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(PROGRAM, shell.reduce((s, r) => s + rectArea(r), 0));
        const withoutFlag = subdivideWithReport(shell, g);
        const withFlagOff = subdivideWithReport(shell, g, { stairCarved: false });
        expect(JSON.stringify(withFlagOff)).toEqual(JSON.stringify(withoutFlag));
    });

    it('is deterministic with the stairCarved flag set', () => {
        const rects = carve(plate, cornerCore);
        const g = buildBubbleGraph(PROGRAM, rectArea(plate));
        const a = subdivideWithReport(rects, g, { stairCarved: true });
        const b = subdivideWithReport(rects, g, { stairCarved: true });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    // §STAIR-FRAGMENT (Fix 4, 2026-06-09) — the dominant-gate floor is 0.40. A plate
    // whose dominant rect holds ~0.42 of the buildable area (between the OLD 0.45 floor
    // and the NEW 0.40 floor) must NOW take the corridor carve, where at 0.45 it would
    // have fallen through to the merge-prone generic per-rect path.
    it('a ~0.42-dominant carved plate takes the corridor carve at the 0.40 gate (Fix 4)', () => {
        // Three rects whose areas are ~0.42 / ~0.33 / ~0.25 of the total (dominant just
        // above 0.40, below the old 0.45). Built as a single plate with a side notch.
        const dom: Rect = { x0: 0, z0: 0, x1: 7, z1: 9 };       // 63 m² — dominant ~0.42
        const mid: Rect = { x0: 7, z0: 0, x1: 12.5, z1: 9 };    // ~49.5 m² — ~0.33
        const small: Rect = { x0: 12.5, z0: 0, x1: 16, z1: 9 }; // ~31.5 m² — ~0.21
        const rects = [dom, mid, small];
        const totalArea = rects.reduce((s, r) => s + rectArea(r), 0);
        const domFrac = rectArea(dom) / totalArea;
        // Guard the fixture sits in the (0.40, 0.45) window the fix targets.
        expect(domFrac).toBeGreaterThanOrEqual(0.40);
        expect(domFrac).toBeLessThan(0.45);
        const g = buildBubbleGraph(PROGRAM, totalArea);
        const res = subdivideWithReport(rects, g, { stairCarved: true });
        // The corridor spine is placed → the carve fired (not the generic per-rect path,
        // which never places the corridor room as a spine across the dominant rect).
        expect(res.placements.some(p => p.roomId === g.corridorId)).toBe(true);
        expect(res.placements.length).toBeGreaterThanOrEqual(4);
    });

    // Apartment-path guard: with stairCarved DEFAULT-OFF the lowered gate is never
    // reached (the whole §STAIR-OBSTACLE-CARVE branch is skipped). A multi-rect plate
    // passed WITHOUT the flag is identical with the flag explicitly false → the
    // DOMINANT_FRACTION change cannot affect the apartment path.
    it('the lowered gate cannot affect the no-keep-out (apartment) path', () => {
        const dom: Rect = { x0: 0, z0: 0, x1: 7, z1: 9 };
        const mid: Rect = { x0: 7, z0: 0, x1: 12.5, z1: 9 };
        const small: Rect = { x0: 12.5, z0: 0, x1: 16, z1: 9 };
        const rects = [dom, mid, small];
        const g = buildBubbleGraph(PROGRAM, rects.reduce((s, r) => s + rectArea(r), 0));
        const noFlag = subdivideWithReport(rects, g);
        const flagOff = subdivideWithReport(rects, g, { stairCarved: false });
        expect(JSON.stringify(flagOff)).toEqual(JSON.stringify(noFlag));
    });
});

// §ADJACENCY-SORT (Phase 4) — reorder a zone so high-preference pairs land consecutively.
describe('adjacencySortForZone (Phase 4 — §ADJACENCY-SORT)', () => {
    const room = (id: string, type: ProgramRoom['type'], name = id): ProgramRoom => ({
        id, type, name, targetAreaM2: 12, isPrivate: roomRule(type).privacy === 'private',
        needsWindow: roomRule(type).needsWindow,
    });

    it('§4c INVARIANT — uniform pair-weights preserve the input order exactly', () => {
        // bedroom↔bedroom, bedroom↔wc, bedroom↔study all resolve to preferenceBetween
        // 1.0 (no declared pair) → a uniform-weight zone → the sort is the identity.
        const input = [room('r5', 'bedroom'), room('r2', 'wc'), room('r9', 'study'), room('r1', 'bedroom')];
        const out = adjacencySortForZone(input);
        expect(out.map(r => r.id)).toEqual(['r5', 'r2', 'r9', 'r1']);
    });

    it('clusters by an EXPLICIT preference difference (kitchen↔dining 1.0 > kitchen↔corridor 0.6 > dining↔corridor 0.4)', () => {
        // preferenceBetween saturates at 1.0 for undeclared pairs, so the sort only
        // re-clusters where pairs are EXPLICITLY distinct. kitchen↔dining (1.0) is the
        // unique strongest edge here; kitchen↔corridor (0.6) and dining↔corridor (0.4)
        // are weaker, so the greedy sort pulls kitchen + dining together and leaves the
        // corridor (the weak link) at the seam — genuinely REORDERING the scrambled input.
        const input = [room('a', 'corridor'), room('b', 'dining'), room('c', 'kitchen')];
        const out = adjacencySortForZone(input).map(r => r.type);
        const ki = out.indexOf('kitchen'), di = out.indexOf('dining');
        expect(Math.abs(ki - di)).toBe(1);                              // strongest pair adjacent
        expect(out).not.toEqual(['corridor', 'dining', 'kitchen']);     // actually reordered
    });

    it('is a pure permutation (same multiset, deterministic)', () => {
        const input = [room('a', 'kitchen'), room('b', 'living'), room('c', 'dining'), room('d', 'hall')];
        const a = adjacencySortForZone(input).map(r => r.id).sort();
        const b = adjacencySortForZone(input).map(r => r.id).sort();
        expect(a).toEqual(['a', 'b', 'c', 'd']);
        expect(JSON.stringify(adjacencySortForZone(input))).toEqual(JSON.stringify(adjacencySortForZone(input)));
    });
});
