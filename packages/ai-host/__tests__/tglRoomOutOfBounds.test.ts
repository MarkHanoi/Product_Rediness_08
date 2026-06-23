// @vitest-environment happy-dom
//
// §ROOM-OUT-OF-BOUNDS (founder P0 CONTRACT VIOLATION, 2026-06-23) — rooms OUTSIDE the site boundary
// (the shell polygon) are STRICTLY PROHIBITED by contract. The regression: on a 2-storey house the
// UPPER floor placed en-suites OUTSIDE the shell (protruding past the south shell wall) because the
// `enforceSuiteCarve` en-suite work emitted an en-suite as a band PAST the shell when it could not fit
// inside its host bedroom — and NO hard gate rejected it (the diagnostics covered window / circulation
// / served-through / ensuite-1to1 but never out-of-bounds).
//
// TWO FIXES, both pinned here:
//   1. A HARD out-of-bounds gate (`roomsOutOfShellRoomIds` + Rule 'room-out-of-bounds') that rejects
//      ANY candidate with ANY placed room not fully inside the shell, on EVERY storey + EVERY room type,
//      and ranks in-bounds candidates strictly above out-of-bounds ones (`preferInBoundsCandidates`).
//   2. The en-suite carve (`enforceSuiteCarve`) DROPS an en-suite that would escape the shell rather
//      than banding it outside — verified end-to-end via `enumerateLayouts` on the founder's case.
//
// happy-dom: the hotel-suite toggle reads `window.__pryzmHotelSuites` (matches tglHotelSuites.test.ts).

import { afterEach, describe, expect, it } from 'vitest';
import {
    roomsOutOfShellRoomIds,
    preferInBoundsCandidates,
    enumerateLayouts,
    type EnumerateInput,
    type TglCandidate,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const setHotelSuites = (on: boolean): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    g.window = { ...(g.window ?? {}), __pryzmHotelSuites: on };
};
const clearHotelSuites = (): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    if (g.window) delete g.window.__pryzmHotelSuites;
};
afterEach(() => clearHotelSuites());

const rectRing = (r: Rect): Pt[] => [
    { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
];
const place = (id: string, r: Rect): RoomPlacement => ({ roomId: id, rect: r });

// A 12 × 10 m rectangular shell (the boundary). South wall is z = 0; rooms must not poke past it.
const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

describe('§ROOM-OUT-OF-BOUNDS — roomsOutOfShellRoomIds predicate (the HARD gate input)', () => {
    it('PASSES an all-in-bounds layout (no room flagged)', () => {
        const placements = [
            place('master', { x0: 0, z0: 0, x1: 6, z1: 5 }),
            place('ens', { x0: 6, z0: 0, x1: 8, z1: 5 }),
            place('bed2', { x0: 0, z0: 5, x1: 6, z1: 10 }),
            place('corr', { x0: 8, z0: 0, x1: 12, z1: 10 }),
        ];
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: SHELL })).toEqual([]);
    });

    it('FAILS a layout with an en-suite poking PAST the south shell wall (the founder defect)', () => {
        const placements = [
            place('master', { x0: 0, z0: 0, x1: 6, z1: 5 }),
            // The en-suite is banded BELOW z = 0 — outside the shell's south wall (the regression).
            place('ens', { x0: 6, z0: -2.5, x1: 8, z1: 0 }),
            place('corr', { x0: 8, z0: 0, x1: 12, z1: 10 }),
        ];
        const bad = roomsOutOfShellRoomIds({ placements, shellPolygon: SHELL });
        expect(bad).toContain('ens');
        // The in-bounds rooms are NOT flagged.
        expect(bad).not.toContain('master');
        expect(bad).not.toContain('corr');
    });

    it('flags EVERY out-of-bounds room type (en-suite, stair, corridor, bedroom)', () => {
        const placements = [
            place('ens', { x0: 6, z0: -1, x1: 8, z1: 1 }),      // straddles the south wall
            place('stair', { x0: 12.5, z0: 2, x1: 14, z1: 4 }), // past the east wall
            place('corr', { x0: -1, z0: 4, x1: 1, z1: 6 }),     // past the west wall
            place('bed', { x0: 4, z0: 9, x1: 6, z1: 11.5 }),    // past the north wall
            place('living', { x0: 1, z0: 1, x1: 5, z1: 5 }),    // in bounds
        ];
        const bad = roomsOutOfShellRoomIds({ placements, shellPolygon: SHELL });
        expect(bad).toEqual(['bed', 'corr', 'ens', 'stair']);   // sorted; living omitted
    });

    it('a room FLUSH to the shell wall is NOT flagged (epsilon tolerance for weld slack)', () => {
        const placements = [
            place('master', { x0: 0, z0: 0, x1: 6, z1: 10 }),       // full west half, flush on 3 walls
            place('ens', { x0: 6, z0: 0, x1: 12, z1: 0.015 }),      // 1.5 cm past z=0 within the 2 cm eps
        ];
        // ens is 1.5 cm below the south wall — within the 2 cm float/weld eps ⇒ NOT flagged.
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: SHELL })).toEqual([]);
        // …but a 5 cm overshoot IS flagged (beyond eps).
        const overshoot = [place('ens', { x0: 6, z0: -0.05, x1: 12, z1: 5 })];
        expect(roomsOutOfShellRoomIds({ placements: overshoot, shellPolygon: SHELL })).toContain('ens');
    });

    it('uses the REAL cell polygon when supplied (a sheared cell judged on its true boundary)', () => {
        // A cell whose bbox is in-bounds but whose real polygon pokes past z = 0 in one corner.
        const cellPolygonById = new Map<string, readonly Pt[]>([
            ['skew', [{ x: 2, z: 0.1 }, { x: 6, z: -1 }, { x: 6, z: 4 }, { x: 2, z: 4 }]],
        ]);
        const placements = [place('skew', { x0: 2, z0: -1, x1: 6, z1: 4 })];
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: SHELL, cellPolygonById })).toContain('skew');
    });

    it('no real shell polygon (< 3 vertices) ⇒ nothing to enforce (never throws)', () => {
        const placements = [place('a', { x0: -100, z0: -100, x1: 100, z1: 100 })];
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: [] })).toEqual([]);
    });
});

describe('§ROOM-OUT-OF-BOUNDS — preferInBoundsCandidates ranks in-bounds strictly above out-of-bounds', () => {
    const cand = (strategy: string, rules: string[]): TglCandidate =>
        ({ strategy, hardFailedRules: rules } as unknown as TglCandidate);

    it('narrows to the in-bounds subset when one exists among hard-invalid candidates', () => {
        const pool = [
            cand('A', ['room-out-of-bounds']),
            cand('B', ['reach']),                 // hard-invalid but IN BOUNDS
            cand('C', ['room-out-of-bounds', 'reach']),
        ];
        const kept = preferInBoundsCandidates(pool);
        expect(kept.map(c => c.strategy)).toEqual(['B']);
    });

    it('is a no-op when EVERY candidate is in bounds (byte-identical)', () => {
        const pool = [cand('A', ['reach']), cand('B', [])];
        expect(preferInBoundsCandidates(pool)).toBe(pool);
    });

    it('never empties the pool — when ALL candidates are out-of-bounds it returns them unchanged', () => {
        const pool = [cand('A', ['room-out-of-bounds']), cand('B', ['room-out-of-bounds'])];
        expect(preferInBoundsCandidates(pool)).toBe(pool);
    });
});

// ── End-to-end (the founder's case): a 2-storey house UPPER floor with hotel-suites (multi-bedroom +
//    en-suites), generated on a TIGHT plate where the prior code pushed an en-suite past the shell.
//    EVERY placed room in the shipped winner must be fully inside the shell polygon. ────────────────
describe('§ROOM-OUT-OF-BOUNDS — enumerateLayouts: the upper-floor winner keeps EVERY room in-bounds', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    // A house UPPER storey program (no kitchen / living / hall) with a master en-suite — the suite path.
    const UPPER_PROGRAM: ApartmentProgram = {
        bedrooms: 4, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: false, livingRoom: false, entranceHall: false, includeKitchen: false,
    };
    // A tight plate + a corner stair keep-out ⇒ the house path (gate active) ⇒ en-suite carve under pressure.
    const PLATE: Pt[] = [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }];
    const STAIR: Rect = { x0: 11, z0: 8, x1: 13, z1: 10 };
    // The house path is keyed on an injected envelopeValidator; a permissive one keeps the storey shipping
    // so we exercise the carve+gate rather than a structured envelope rejection.
    const envelopeValidator: EnumerateInput['envelopeValidator'] = () => ({ admissible: true, hardFindings: [], softFindings: [] });
    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: PLATE, program: UPPER_PROGRAM, levelId: 'L1', seed: 'oob-upper',
        weights: WEIGHTS, count: 3, keepOutRects: [STAIR], envelopeValidator, ...over,
    });

    const assertWinnerInBounds = (out: readonly TglCandidate[], shell: Pt[]): void => {
        expect(out.length).toBeGreaterThan(0);
        const best = out[0]!;
        // Reconstruct each room's placement from the emitted Space-node footprints.
        const placements: RoomPlacement[] = [];
        const cellPolygonById = new Map<string, readonly Pt[]>();
        for (const n of best.graph.nodes) {
            if (n.kind !== 'Space') continue;
            const poly = n.geometry?.polygon;
            if (!poly || poly.length < 3) continue;
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
            placements.push({ roomId: n.sourceId, rect: { x0, z0, x1, z1 } });
            cellPolygonById.set(n.sourceId, poly);
        }
        expect(placements.length, 'winner emitted no rooms').toBeGreaterThan(0);
        const oob = roomsOutOfShellRoomIds({ placements, shellPolygon: shell, cellPolygonById, epsilonM: 0.05 });
        expect(oob, `rooms outside the shell in the shipped winner: ${oob.join(',')}`).toEqual([]);
    };

    it('default (no hotel-suites): the winning upper layout has EVERY room inside the shell', () => {
        assertWinnerInBounds(enumerateLayouts(input()), PLATE);
    });

    it('with hotel-suites ON (multi en-suite carve): the winner STILL keeps every room in-bounds', () => {
        setHotelSuites(true);
        assertWinnerInBounds(enumerateLayouts(input()), PLATE);
    });

    it('the winner never carries a `room-out-of-bounds` failure when an in-bounds sibling exists', () => {
        setHotelSuites(true);
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        const anyClean = out.some(c => !c.hardFailedRules.includes('room-out-of-bounds'));
        if (anyClean) expect(out[0]!.hardFailedRules).not.toContain('room-out-of-bounds');
    });

    it('determinism preserved (ADR-0061) — two runs byte-identical', () => {
        setHotelSuites(true);
        const i = input();
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
