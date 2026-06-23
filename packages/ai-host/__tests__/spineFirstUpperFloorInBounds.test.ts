// @vitest-environment happy-dom
//
// §SPINE-FIRST P8b (founder "upper floors out of the boundary", 2026-06-23) — REGRESSION GUARD.
//
// THE DEFECT: on a 2-storey house the UPPER (all-private) storey is laid out circulation-FIRST
// (the spine-first path: derive a central corridor spine → pack the private rooms off it). The
// prior `clampRect` fell back to the UNCLAMPED rect when a packed spine cell clamped entirely
// AWAY from the shell — which SHIPPED a room PAST the boundary (the exact upper-floor
// out-of-boundary regression). The fix (subdivide.ts §SPINE-FIRST P8b) replaces that with
// `clampOrNull`: an out-of-shell cell is DROPPED (reported), NEVER emitted past the boundary.
//
// THIS FILE drives the REAL engine end-to-end via `enumerateLayouts` with `spineFirst: true` on an
// all-private UPPER program, reconstructs each room from the EMITTED Space-node footprints, and
// asserts the out-of-bounds predicate (`roomsOutOfShellRoomIds`) flags NOTHING — i.e. every shipped
// room is fully inside the boundary. Cases: an axis-aligned rectangle plate (the spine path's gated
// case), and a ROTATED rectangle plate (the founder ALWAYS draws rotated boundaries — whichever
// route handles it, NO room may escape the shell).
//
// happy-dom: matches the sibling out-of-bounds suites (window-scoped toggles).

import { describe, expect, it } from 'vitest';
import {
    roomsOutOfShellRoomIds,
    enumerateLayouts,
    type EnumerateInput,
    type TglCandidate,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

// An all-private (upper) house storey — bedrooms + baths only, no public rooms (kitchen / living /
// dining / hall). This is the program that makes the spine-first path eligible.
const UPPER_PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

// The house path is keyed on an injected envelopeValidator; a permissive one keeps the storey
// shipping so we exercise the spine carve + the out-of-bounds gate rather than a structured
// envelope rejection (matches the sibling rotated/out-of-bounds suites).
const envelopeValidator: EnumerateInput['envelopeValidator'] =
    () => ({ admissible: true, hardFindings: [], softFindings: [] });

// ── Rotation helpers (mirror tglRoomOutOfBoundsRotated.test.ts) ─────────────────
const DEG = Math.PI / 180;
const rotPt = (p: Pt, theta: number, c: Pt): Pt => {
    const dx = p.x - c.x, dz = p.z - c.z;
    const ct = Math.cos(theta), st = Math.sin(theta);
    return { x: c.x + dx * ct - dz * st, z: c.z + dx * st + dz * ct };
};
const rotPoly = (poly: readonly Pt[], theta: number, c: Pt): Pt[] => poly.map(p => rotPt(p, theta, c));
const rotRect = (r: Rect, theta: number, c: Pt): Rect => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const rc = rotPt({ x: cx, z: cz }, theta, c);
    const w = (r.x1 - r.x0) / 2, h = (r.z1 - r.z0) / 2;
    return { x0: rc.x - w, z0: rc.z - h, x1: rc.x + w, z1: rc.z + h };
};

// A clean AXIS-ALIGNED ~16 × 11 rectangle (the case P8 KEEPS on the spine path) + a top-right
// corner stair keep-out (matches spineFirstWiring's PLATE/STAIR).
const AXIS_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
const AXIS_STAIR: Rect = { x0: 13.5, z0: 8.5, x1: 16, z1: 11 };

// A ~20° ROTATED copy of the same rectangle + the same stair rotated with it (well-interior keep-out
// so the carve is exercised without the stair's own AABB clipping the slanted perimeter).
const THETA = 20 * DEG;
const PIVOT: Pt = { x: 8, z: 5.5 };
const AXIS_RECT: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
const ROTATED_SHELL: Pt[] = rotPoly(AXIS_RECT, THETA, PIVOT);
const ROTATED_STAIR_SRC: Rect = { x0: 12, z0: 7, x1: 14, z1: 9 };  // comfortably interior in source frame
const ROTATED_STAIR: Rect = rotRect(ROTATED_STAIR_SRC, THETA, PIVOT);

const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: AXIS_SHELL, program: UPPER_PROGRAM, levelId: 'L1', seed: 'spine-upper-inbounds',
    weights: WEIGHTS, count: 3, keepOutRects: [AXIS_STAIR], envelopeValidator, spineFirst: true, ...over,
});

// Reconstruct each room from the EMITTED Space-node footprint (cell polygon + its bbox rect) and run
// the polygon-in-polygon out-of-bounds gate against the shell. A small epsilon for weld slack.
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
    expect(oob, `${label}: rooms OUTSIDE the shell in the shipped winner: ${oob.join(',')}`).toEqual([]);
};

describe('§SPINE-FIRST P8b — upper-floor spine layout keeps EVERY room inside the boundary', () => {
    it('AXIS-ALIGNED rectangle plate: spineFirst ON → every emitted upper room is inside the shell', () => {
        assertWinnerInBounds(enumerateLayouts(input()), AXIS_SHELL, 'axis');
    });

    it('AXIS-ALIGNED plate: the shipped winner carries NO `room-out-of-bounds` failure', () => {
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        const anyClean = out.some(c => !c.hardFailedRules.includes('room-out-of-bounds'));
        if (anyClean) expect(out[0]!.hardFailedRules).not.toContain('room-out-of-bounds');
    });

    it('ROTATED rectangle plate (founder always draws rotated): every emitted upper room is inside the shell', () => {
        const out = enumerateLayouts(input({
            shellPolygon: ROTATED_SHELL, keepOutRects: [ROTATED_STAIR], seed: 'spine-upper-rot',
        }));
        assertWinnerInBounds(out, ROTATED_SHELL, 'rotated');
    });

    it('determinism preserved (ADR-0061) — two spine-first upper runs are byte-identical (both plates)', () => {
        const a = input({ seed: 'spine-det-axis' });
        expect(JSON.stringify(enumerateLayouts(a))).toEqual(JSON.stringify(enumerateLayouts(a)));
        const r = input({ shellPolygon: ROTATED_SHELL, keepOutRects: [ROTATED_STAIR], seed: 'spine-det-rot' });
        expect(JSON.stringify(enumerateLayouts(r))).toEqual(JSON.stringify(enumerateLayouts(r)));
    });
});
