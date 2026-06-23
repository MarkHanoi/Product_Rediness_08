// @vitest-environment happy-dom
//
// §ROOM-OUT-OF-BOUNDS — ROTATED-PLATE HARDENING (founder P0 CONTRACT VIOLATION, 2026-06-23).
//
// THE FOUNDER'S REAL CASE: a 2-storey house whose site boundary is drawn at an ANGLE (a ROTATED
// rectangular plate — the founder ALWAYS draws rotated boundaries). The UPPER floor placed a ROW of
// en-suites OUTSIDE the shell — banded past the south wall. A prior fix added the out-of-bounds hard
// gate (`roomsOutOfShellRoomIds` + `'room-out-of-bounds'` + `preferInBoundsCandidates`) and an
// en-suite carve guard, but it only verified the AXIS-ALIGNED case and had TWO holes that made it
// useless on a rotated plate:
//   (A) the gate EXCLUDED rooms on sheared/rectified plates ("only real cells are checked"), so the
//       very band-past-the-south-wall en-suites (emitted as rect EXTRAS, no real cell) were SKIPPED;
//   (B) the en-suite carve verified against the BBOX of the sheared shell (which over-covers it), so
//       a band fitting inside the bbox passed the in-bounds check.
//
// THE FIX (tgl/enumerate.ts):
//   • TASK 1 — the gate now tests the ACTUAL emitted set (`emitPlacements`) against the REAL shell in
//     ONE consistent (plan) frame: cell polygon when present, else the emitted rect. NO exclusion for
//     rectified plates ⇒ a band-past-the-south-wall en-suite is ALWAYS flagged, rotation and all.
//   • TASK 2 — `enforceSuiteCarve` is given the REAL strategy-frame polygon (`polyT`), NOT its bbox, so
//     an en-suite carve escaping the TRUE sheared boundary is DROPPED at the source (host left whole),
//     never emitted as an external band.
//
// THIS FILE is the rotated-plate proof: a unit test that the predicate FLAGS a room poking outside a
// ROTATED shell, and end-to-end tests that EVERY emitted room on a ROTATED 2-storey-house plate (upper
// hotel-suites + ground) is fully inside the rotated shell polygon.
//
// happy-dom: the hotel-suite toggle reads `window.__pryzmHotelSuites` (matches tglHotelSuites.test.ts).

import { afterEach, describe, expect, it } from 'vitest';
import {
    roomsOutOfShellRoomIds,
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

const place = (id: string, r: Rect): RoomPlacement => ({ roomId: id, rect: r });

// ── Rotation helpers ──────────────────────────────────────────────────────────
const DEG = Math.PI / 180;
const rotPt = (p: Pt, theta: number, c: Pt): Pt => {
    const dx = p.x - c.x, dz = p.z - c.z;
    const ct = Math.cos(theta), st = Math.sin(theta);
    return { x: c.x + dx * ct - dz * st, z: c.z + dx * st + dz * ct };
};
const rotPoly = (poly: readonly Pt[], theta: number, c: Pt): Pt[] => poly.map(p => rotPt(p, theta, c));
const rotRect = (r: Rect, theta: number, c: Pt): Rect => {
    // The keep-out is reported in the engine plan frame as an AABB; we rotate its CENTRE so the stair
    // sits inside the rotated shell. (The engine inflates + xf's it per strategy; we only need it to
    // land well inside the rotated plate so the carve is exercised, not clip the shell edge.)
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const rc = rotPt({ x: cx, z: cz }, theta, c);
    const w = (r.x1 - r.x0) / 2, h = (r.z1 - r.z0) / 2;
    return { x0: rc.x - w, z0: rc.z - h, x1: rc.x + w, z1: rc.z + h };
};

// ── A ~25° ROTATED 13 × 10 rectangle (the founder ALWAYS draws rotated boundaries). 25° gives a
//    bbox-fill ≈ 0.566 > 0.5 ⇒ rectifyConvexQuad fires ⇒ shellRectified ⇒ the §POLYGON-NATIVE-ROUTE,
//    which is exactly the path the prior gate excluded. ──────────────────────────────────────────
const THETA = 25 * DEG;
const PIVOT: Pt = { x: 6.5, z: 5 };
const AXIS_RECT: Pt[] = [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }];
const ROTATED_SHELL: Pt[] = rotPoly(AXIS_RECT, THETA, PIVOT);
// A stair keep-out placed COMFORTABLY interior in the source frame, then rotated with the plate so its
// (axis-aligned) keep-out AABB stays well inside the rotated shell — the carve + gate are exercised
// without the keep-out's own AABB corners clipping the slanted perimeter (which would be a separate,
// legitimate out-of-bounds for the STAIR rather than the en-suite band this test targets).
const AXIS_STAIR: Rect = { x0: 9.5, z0: 6.5, x1: 11.5, z1: 8.5 };
const ROTATED_STAIR: Rect = rotRect(AXIS_STAIR, THETA, PIVOT);

describe('§ROOM-OUT-OF-BOUNDS rotated — the predicate FLAGS a room poking outside a ROTATED shell', () => {
    it('a room whose cell pokes past a slanted (rotated) shell edge is FLAGGED (no false negative)', () => {
        // Take a room cell that, in the AXIS frame, straddles the south wall (z<0), then rotate BOTH the
        // shell and the cell by the same angle. The rotated cell must STILL be flagged — rotation must not
        // create a false negative (the heart of hole (A)).
        const axisOutsideCell: Pt[] = [{ x: 6, z: -2.5 }, { x: 8, z: -2.5 }, { x: 8, z: 0 }, { x: 6, z: 0 }];
        const rotatedOutsideCell = rotPoly(axisOutsideCell, THETA, PIVOT);
        const cellPolygonById = new Map<string, readonly Pt[]>([['ens', rotatedOutsideCell]]);
        // The bbox of the rotated cell drives `placements` (any rect — the gate prefers the cell when given).
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of rotatedOutsideCell) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
        const placements = [place('ens', { x0, z0, x1, z1 })];
        const bad = roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL, cellPolygonById });
        expect(bad, 'a cell banded past the rotated south wall MUST be flagged').toContain('ens');
    });

    it('an IN-bounds rotated cell is NOT flagged (no false positive)', () => {
        // A small room well inside the rotated plate (rotate an axis cell that sits comfortably interior).
        const axisInsideCell: Pt[] = [{ x: 3, z: 3 }, { x: 7, z: 3 }, { x: 7, z: 7 }, { x: 3, z: 7 }];
        const rotatedInsideCell = rotPoly(axisInsideCell, THETA, PIVOT);
        const cellPolygonById = new Map<string, readonly Pt[]>([['room', rotatedInsideCell]]);
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of rotatedInsideCell) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
        const placements = [place('room', { x0, z0, x1, z1 })];
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL, cellPolygonById })).toEqual([]);
    });

    it('a rect-only room (no cell) banded past the rotated shell is FLAGGED via its rect', () => {
        // The exact (A) hole: a room emitted as a rect EXTRA (no real cell) that overflows the rotated
        // façade. The gate must judge it by its rect against the REAL rotated shell.
        const axisBand: Rect = { x0: 5, z0: -3, x1: 9, z1: -0.5 };  // wholly south of z=0 in the axis frame
        const rc = rotRect(axisBand, THETA, PIVOT);
        const placements = [place('extraBand', rc)];               // no cellPolygonById ⇒ rect is the geometry
        expect(roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL })).toContain('extraBand');
    });
});

// ── End-to-end: the founder's 2-storey house on the ROTATED plate. Reconstruct each room from the
//    EMITTED Space-node polygons (the ACTUAL geometry) and assert ALL are inside the rotated shell. ──
describe('§ROOM-OUT-OF-BOUNDS rotated — enumerateLayouts keeps EVERY room inside the ROTATED shell', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    // The house path is keyed on an injected envelopeValidator; a permissive one keeps the storey shipping
    // so we exercise the carve + gate rather than a structured envelope rejection.
    const envelopeValidator: EnumerateInput['envelopeValidator'] = () => ({ admissible: true, hardFindings: [], softFindings: [] });

    // UPPER storey — hotel-suites (4 bedrooms + en-suites), no kitchen/living/hall (the suite path).
    const UPPER_PROGRAM: ApartmentProgram = {
        bedrooms: 4, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: false, livingRoom: false, entranceHall: false, includeKitchen: false,
    };
    // GROUND storey — public rooms + an entrance hall (the arrival storey).
    const GROUND_PROGRAM: ApartmentProgram = {
        bedrooms: 1, bathrooms: 1, masterEnSuite: false,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true, includeKitchen: true,
    };

    const input = (program: ApartmentProgram, levelId: string, seed: string): EnumerateInput => ({
        shellPolygon: ROTATED_SHELL, program, levelId, seed,
        weights: WEIGHTS, count: 3, keepOutRects: [ROTATED_STAIR], envelopeValidator,
    });

    // Reconstruct each room from the emitted Space-node footprint (cell polygon + its bbox rect) and run
    // the polygon-in-polygon containment gate against the rotated shell. A small epsilon for weld slack.
    const assertWinnerInBounds = (out: readonly TglCandidate[], shell: Pt[], label: string): void => {
        expect(out.length, `${label}: no candidate shipped`).toBeGreaterThan(0);
        const best = out[0]!;
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
        expect(placements.length, `${label}: winner emitted no rooms`).toBeGreaterThan(0);
        const oob = roomsOutOfShellRoomIds({ placements, shellPolygon: shell, cellPolygonById, epsilonM: 0.06 });
        expect(oob, `${label}: rooms OUTSIDE the rotated shell in the shipped winner: ${oob.join(',')}`).toEqual([]);
    };

    it('UPPER hotel-suites on the ROTATED plate: EVERY emitted room is inside the rotated shell', () => {
        setHotelSuites(true);
        assertWinnerInBounds(enumerateLayouts(input(UPPER_PROGRAM, 'L1', 'rot-upper')), ROTATED_SHELL, 'upper');
    });

    it('UPPER (no hotel-suites) on the ROTATED plate: EVERY emitted room is inside the rotated shell', () => {
        assertWinnerInBounds(enumerateLayouts(input(UPPER_PROGRAM, 'L1', 'rot-upper-nohotel')), ROTATED_SHELL, 'upper-nohotel');
    });

    it('GROUND storey on the ROTATED plate: EVERY emitted room is inside the rotated shell', () => {
        assertWinnerInBounds(enumerateLayouts(input(GROUND_PROGRAM, 'L0', 'rot-ground')), ROTATED_SHELL, 'ground');
    });

    it('determinism preserved (ADR-0061) — two upper-suite runs on the rotated plate are byte-identical', () => {
        setHotelSuites(true);
        const i = input(UPPER_PROGRAM, 'L1', 'rot-det');
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
