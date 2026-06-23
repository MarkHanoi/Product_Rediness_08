// @vitest-environment happy-dom
//
// §STAIR-ROOM-IN-SHELL — the ROTATED-PLATE stair keep-out lands inside the shell (founder invariant #5).
//
// WHAT THIS GUARDS (and why the engine is ALREADY correct here):
//   The founder ALWAYS draws the site boundary at an ANGLE. A multi-storey house then reserves a vertical
//   stair core. The worry is that the stair ROOM (the keep-out the rooms tile around) pokes PAST the
//   slanted shell on a rotated plate. The engine avoids that BY CONSTRUCTION via the principal-axis frame:
//
//     runDeterministicLayout de-rotates the WHOLE problem by −principalAxisRad (rectDecomposition
//     `rotatePt`): the shell handed to `enumerateLayouts` is the DE-ROTATED (axis-aligned) polygon, and
//     the house orchestrator hands it the stair keep-out in that SAME de-rotated LAYOUT frame
//     (`keepOutRectsLayout` = AABB of `toLayout(containedFootprint)`), where the stair body is
//     axis-aligned ⇒ the AABB is TIGHT (no rotation inflation) ⇒ its 4 corners ARE the footprint corners,
//     which `solveStairContainmentWorld` already pinned inside the (rotated) shell. Rotation preserves
//     point-in-polygon, so a keep-out inside the DE-ROTATED shell is inside the ROTATED shell once
//     runDeterministicLayout rotates the emitted geometry back by +angle. (`resolveFlightPlans` authors
//     the flight directions in the layout frame and rotates them by EXACTLY +principalAxisRad, so the
//     de-rotated footprint is genuinely axis-aligned — see houseOrchestrator.ts:57.)
//
//   So the correct regression guard exercises the REAL frame: a DE-ROTATED shell + a TIGHT layout-frame
//   keep-out (exactly what `enumerateLayouts` receives in production) — NOT a rotated shell + a world-AABB
//   keep-out (a frame combination `enumerateLayouts` is never handed; testing it would assert a
//   non-production failure mode). This file proves every emitted room — INCLUDING the stair — is inside the
//   de-rotated shell, i.e. inside the rotated shell after rotate-back.
//
// (Contrast tglRoomOutOfBoundsRotated.test.ts, which calls enumerateLayouts with a ROTATED shell to prove
//  the OUT-OF-BOUNDS *gate predicate* is angle-robust; it deliberately keeps the stair "comfortably
//  interior … without the keep-out's own AABB corners clipping the slanted perimeter (which would be a
//  separate, legitimate out-of-bounds for the STAIR …)" — exactly the frame mismatch this file avoids by
//  feeding the de-rotated shell the real pipeline uses.)

import { afterEach, describe, expect, it } from 'vitest';
import {
    roomsOutOfShellRoomIds,
    enumerateLayouts,
    type EnumerateInput,
    type TglCandidate,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { rotatePoly, rotatePt, principalAxisAngle, polygonBBox } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
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

// ── The founder's rotated plate. A 13 × 10 rectangle drawn at ~25° (bbox-fill ≈ 0.57 > 0.5 ⇒ the
//    polygon-native route). `runDeterministicLayout` would de-rotate this by −principalAxisRad about its
//    centroid; we reproduce that derivation here so the test feeds `enumerateLayouts` EXACTLY what the
//    real pipeline feeds it. ───────────────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180;
const THETA = 25 * DEG;
const PIVOT: Pt = { x: 6.5, z: 5 };
const AXIS_RECT: Pt[] = [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }];
const ROTATED_WORLD_SHELL: Pt[] = rotatePoly(AXIS_RECT, THETA, PIVOT);

// The principal-axis derivation `runDeterministicLayout` performs (rectDecomposition.principalAxisAngle +
// the centroid pivot). For a clean rotated rectangle this recovers ≈ −25° about the centroid, so the
// DE-ROTATED shell is (within float) the original axis-aligned rectangle — the frame the engine runs in.
const ANGLE = principalAxisAngle(ROTATED_WORLD_SHELL);
const polyCentroid = (poly: readonly Pt[]): Pt => {
    let cx = 0, cz = 0; for (const p of poly) { cx += p.x; cz += p.z; } return { x: cx / poly.length, z: cz / poly.length };
};
const RD_PIVOT = polyCentroid(ROTATED_WORLD_SHELL);
const DEROTATED_SHELL: Pt[] = ROTATED_WORLD_SHELL.map(p => rotatePt(p, -ANGLE, RD_PIVOT));

// The stair keep-out the house orchestrator hands the engine is `keepOutRectsLayout`: the TIGHT AABB of
// the stair footprint expressed in this DE-ROTATED (layout) frame, where the stair body is axis-aligned.
// We model a real §STAIR-DEFAULT-BIAS CORNER stair: a ~2.2 × 2.2 m core hugging a corner of the de-rotated
// rectangle (the worst-aspect wall). Axis-aligned in the layout frame ⇒ this is exactly what the
// orchestrator's `coreFootprintLayout` AABB produces.
const dbb = polygonBBox(DEROTATED_SHELL);
const STAIR_KEEPOUT_LAYOUT: Rect = {
    x0: dbb.x1 - 2.4, z0: dbb.z0 + 0.2, x1: dbb.x1 - 0.2, z1: dbb.z0 + 2.4,
};

describe('§STAIR-ROOM-IN-SHELL — frame sanity (the de-rotation the real pipeline performs)', () => {
    it('the de-rotated shell of a 25°-rotated rectangle is axis-aligned (principal-axis recovers it)', () => {
        const b = polygonBBox(DEROTATED_SHELL);
        // Each de-rotated vertex sits on a bbox corner (within float) ⇒ axis-aligned rectangle.
        for (const v of DEROTATED_SHELL) {
            const onX = Math.abs(v.x - b.x0) < 1e-6 || Math.abs(v.x - b.x1) < 1e-6;
            const onZ = Math.abs(v.z - b.z0) < 1e-6 || Math.abs(v.z - b.z1) < 1e-6;
            expect(onX && onZ, `de-rotated vertex (${v.x.toFixed(3)},${v.z.toFixed(3)}) must be a bbox corner`).toBe(true);
        }
    });

    it('the tight layout-frame keep-out is fully inside the de-rotated shell (no AABB inflation)', () => {
        const oob = roomsOutOfShellRoomIds({
            placements: [{ roomId: 'stair0', rect: STAIR_KEEPOUT_LAYOUT }],
            shellPolygon: DEROTATED_SHELL,
        });
        expect(oob, 'a TIGHT axis-aligned corner keep-out must be in-bounds in the layout frame').toEqual([]);
    });
});

// ── End-to-end through the REAL frame: feed enumerateLayouts the de-rotated shell + the tight layout-frame
//    keep-out (what runDeterministicLayout hands it), then assert EVERY emitted room — including the stair —
//    is inside the de-rotated shell. In-bounds here ⟺ in-bounds in the rotated world shell after the
//    +angle rotate-back (rotation preserves point-in-polygon). ──────────────────────────────────────────
describe('§STAIR-ROOM-IN-SHELL — enumerateLayouts keeps the corner stair inside the (de-rotated) shell', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const envelopeValidator: EnumerateInput['envelopeValidator'] = () => ({ admissible: true, hardFindings: [], softFindings: [] });

    const UPPER_PROGRAM: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: false, livingRoom: false, entranceHall: false, includeKitchen: false,
    };

    const input: EnumerateInput = {
        shellPolygon: DEROTATED_SHELL, program: UPPER_PROGRAM, levelId: 'L1', seed: 'rot-stair-corner',
        weights: WEIGHTS, count: 3, keepOutRects: [STAIR_KEEPOUT_LAYOUT], envelopeValidator,
    };

    const winnerOutOfBounds = (out: readonly TglCandidate[]): string[] => {
        expect(out.length, 'no candidate shipped').toBeGreaterThan(0);
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
        expect(placements.length, 'winner emitted no rooms').toBeGreaterThan(0);
        // The keep-out always mints a stair room — it MUST be present AND in-bounds.
        expect(placements.some(p => p.roomId.startsWith('stair')), 'a stair room must be emitted').toBe(true);
        return [...roomsOutOfShellRoomIds({ placements, shellPolygon: DEROTATED_SHELL, cellPolygonById, epsilonM: 0.06 })];
    };

    it('the shipped winner places EVERY room — INCLUDING the corner stair — inside the (de-rotated) shell', () => {
        setHotelSuites(true);
        const oob = winnerOutOfBounds(enumerateLayouts(input));
        expect(oob, `rooms outside the de-rotated shell in the shipped winner: ${oob.join(',')}`).toEqual([]);
    });

    it('determinism preserved (ADR-0061) — two runs are byte-identical', () => {
        setHotelSuites(true);
        expect(JSON.stringify(enumerateLayouts(input))).toEqual(JSON.stringify(enumerateLayouts(input)));
    });
});
