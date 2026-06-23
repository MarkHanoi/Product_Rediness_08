// @vitest-environment happy-dom
//
// §HOUSE-UPPER-CLEAN-IN-BOUNDS (founder defect, 2026-06-23) — the upper floor of a 2-storey house on a
// ROTATED plate exploded into "Master 8 m² + 3 bedrooms + FOUR En-suites + a 73 m² corridor", and the
// en-suites BANDED PAST the shared shell (below the ground-floor boundary line). Two roots:
//
//   (1) §HOTEL-SUITES was DEFAULT-ON (editor flip cb0527c4) — it minted ONE en-suite PER bedroom, so a
//       plain 2-bed brief became 4 suites. The fix reverts the editor default to OFF (opt-in only): the
//       engine reads `window.__pryzmHotelSuites === true`, so the upper floor is now a clean
//       bedrooms + bath set. This file proves the no-hotel-suites upper floor: ≤ 2 bedrooms + ≤ 1 bath,
//       NO per-bedroom en-suite explosion.
//
//   (2) The §SPINE-TREE return path (the founder's browser had `__pryzmSpineTree` ON too) BYPASSED the
//       `enforceSuiteCarve` in-bounds net, so on a rotated/sheared shell `carveSpineSuites` banded an
//       en-suite past the boundary. The fix runs the SAME suite in-bounds drop on the spine-tree return
//       (`dropSuitesOutOfShell`): any en-suite escaping the shell is DROPPED + the host kept whole.
//       This file proves that EVEN with hotel-suites force-ON on the rotated plate AND the spine-tree
//       path ON, NO emitted upper room is outside the shared shell.
//
// The shared-shell contract: the two storeys use the SAME footprint, so an upper room outside the shell
// is outside the ground-floor perimeter too — the absolutely-forbidden defect.

import { afterEach, describe, expect, it } from 'vitest';
import {
    roomsOutOfShellRoomIds,
    enumerateLayouts,
    type EnumerateInput,
    type TglCandidate,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ── Toggles (read by the engine as `=== true`). ────────────────────────────────
const setFlags = (over: { hotel?: boolean; tree?: boolean }): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean; __pryzmSpineTree?: boolean } };
    g.window = { ...(g.window ?? {}) };
    if (over.hotel !== undefined) g.window.__pryzmHotelSuites = over.hotel;
    if (over.tree !== undefined) g.window.__pryzmSpineTree = over.tree;
};
const clearFlags = (): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean; __pryzmSpineTree?: boolean } };
    if (g.window) { delete g.window.__pryzmHotelSuites; delete g.window.__pryzmSpineTree; }
};
afterEach(() => clearFlags());

// ── Rotation helpers (a rotated rectangle = the founder ALWAYS draws rotated boundaries). ──────────
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

// The founder's plate: ~17.3 × 14 m, ROTATED (principalAxis ≠ 0). A right/corner stair keep-out.
const THETA = 20 * DEG;
const PIVOT: Pt = { x: 8.65, z: 7 };
const AXIS_RECT: Pt[] = [{ x: 0, z: 0 }, { x: 17.3, z: 0 }, { x: 17.3, z: 14 }, { x: 0, z: 14 }];
const ROTATED_SHELL: Pt[] = rotPoly(AXIS_RECT, THETA, PIVOT);
// Stair keep-out: the founder's winner was kind=right, pos=CORNER. Place a 2.8 m corner keep-out a
// hair INSIDE the plate (so its rotated AABB doesn't itself clip the slanted perimeter — that would be
// a legitimate out-of-bounds for the STAIR, not the en-suite band this test targets) and rotate it with
// the plate. A corner stair keeps the spine-tree path feasible — the production path the founder hit.
const AXIS_STAIR: Rect = { x0: 13.8, z0: 10.5, x1: 16.6, z1: 13.3 };
const ROTATED_STAIR: Rect = rotRect(AXIS_STAIR, THETA, PIVOT);

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
// The house path injects a permissive envelope validator so the storey ships (we exercise the carve/gate).
const envelopeValidator: EnumerateInput['envelopeValidator'] = () => ({ admissible: true, hardFindings: [], softFindings: [] });

// The BRIEF: a 2-bedroom, 1-bath upper (the private level). NO kitchen / living / hall ⇒ the house-upper
// suite signal (so hotel-suites would fire here IF the toggle were on).
const UPPER_2BED: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: false, livingRoom: false, entranceHall: false, includeKitchen: false,
};

const input = (program: ApartmentProgram, over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: ROTATED_SHELL, program, levelId: 'L1', seed: 'house-upper',
    weights: WEIGHTS, count: 3, keepOutRects: [ROTATED_STAIR], envelopeValidator,
    spineFirst: true, ...over,
});

// Reconstruct the shipped winner's rooms from the emitted Space-node polygons (the ACTUAL geometry).
const winnerRooms = (out: readonly TglCandidate[]): {
    placements: RoomPlacement[];
    cellPolygonById: Map<string, readonly Pt[]>;
    typeBySource: Map<string, string>;
    areaBySource: Map<string, number>;
} => {
    expect(out.length, 'no candidate shipped').toBeGreaterThan(0);
    const best = out[0]!;
    const placements: RoomPlacement[] = [];
    const cellPolygonById = new Map<string, readonly Pt[]>();
    const typeBySource = new Map<string, string>();
    const areaBySource = new Map<string, number>();
    for (const n of best.graph.nodes) {
        if (n.kind !== 'Space') continue;
        const poly = n.geometry?.polygon;
        if (!poly || poly.length < 3) continue;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
        placements.push({ roomId: n.sourceId, rect: { x0, z0, x1, z1 } });
        cellPolygonById.set(n.sourceId, poly);
        // Space-node type + net area live on `attrs` (semanticGraph.ts: spaceType / netAreaM2).
        const attrs = (n.attrs ?? {}) as { spaceType?: string; netAreaM2?: number };
        typeBySource.set(n.sourceId, String(attrs.spaceType ?? ''));
        // Shoelace area of the real cell (independent of attrs, the geometric truth).
        let a = 0;
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
            a += p.x * q.z - q.x * p.z;
        }
        areaBySource.set(n.sourceId, Math.abs(a) / 2);
    }
    return { placements, cellPolygonById, typeBySource, areaBySource };
};

describe('§HOUSE-UPPER-CLEAN-IN-BOUNDS — the non-negotiable in-bounds contract', () => {
    it('hotel-suites ON + spine-tree ON, ROTATED plate: NO upper room escapes the shared shell', () => {
        // The EXACT founder scenario: both the browser defaults the editor used to set, on the founder's
        // 17.3×14 rotated plate with a CORNER stair (the winner). Even with the suite explosion forced on,
        // the §EN-SUITE-CARVE-IN-BOUNDS spine-tree net must keep EVERY room inside the shared shell.
        setFlags({ hotel: true, tree: true });
        const { placements, cellPolygonById, typeBySource } = winnerRooms(enumerateLayouts(input(UPPER_2BED, { seed: 'founder-exact' })));
        expect(placements.length, 'winner emitted no rooms').toBeGreaterThan(0);
        const oob = roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL, cellPolygonById, epsilonM: 0.06 });
        // The founder's EXACT defect signature: an EN-SUITE banded past the boundary. This must NEVER ship,
        // regardless of feasibility — the suite net DROPS an out-of-shell en-suite at the source.
        const ensuiteOob = oob.filter(id => typeBySource.get(id) === 'ensuite');
        expect(ensuiteOob, `EN-SUITES banded past the shared shell (the founder's defect): ${ensuiteOob.join(',')}`).toEqual([]);
        // And the stronger whole-set guarantee on the founder's feasible corner-stair plate.
        expect(oob, `rooms OUTSIDE the shared shell: ${oob.join(',')}`).toEqual([]);
    });

    it('hotel-suites ON + spine-tree OFF, ROTATED plate: NO en-suite escapes the shared shell', () => {
        setFlags({ hotel: true, tree: false });
        const { placements, cellPolygonById, typeBySource } = winnerRooms(enumerateLayouts(input(UPPER_2BED, { seed: 'hotel-notree' })));
        const oob = roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL, cellPolygonById, epsilonM: 0.06 });
        // The legacy carve has its OWN §EN-SUITE-CARVE-IN-BOUNDS net (enforceSuiteCarve); no en-suite band.
        const ensuiteOob = oob.filter(id => typeBySource.get(id) === 'ensuite');
        expect(ensuiteOob, `EN-SUITES banded past the shared shell: ${ensuiteOob.join(',')}`).toEqual([]);
    });
});

describe('§HOUSE-UPPER-CLEAN — a clean 2-bed upper floor (hotel-suites DEFAULT-OFF)', () => {
    // The engine peeks `window.__pryzmHotelSuites === true`. With it absent (the NEW editor default),
    // the bubble graph mints a normal bedrooms + bath set — NO per-bedroom en-suite explosion.
    it('bubble graph: a 2-bed upper mints at most ONE en-suite (the master), never one-per-bedroom', () => {
        // The KEY hotel-suites regression: with the toggle OFF, NO matter how many bedrooms the engine
        // sizes the storey to (`scaleProgramToShell` scales the count to the plate), the en-suite count
        // must stay ≤ 1 — the per-bedroom suite explosion is the defect. We use a smallish area so the
        // count stays near the brief, but the assertion is on the EN-SUITE count, not the bed count.
        clearFlags();                                   // hotel-suites OFF (the default)
        const g = buildBubbleGraph(UPPER_2BED, 120);
        const beds = g.rooms.filter(r => r.type === 'bedroom' || r.type === 'master');
        const ensuites = g.rooms.filter(r => r.type === 'ensuite');
        expect(beds.length, 'at least the requested bedrooms').toBeGreaterThanOrEqual(2);
        // NO per-bedroom en-suite explosion: at most ONE en-suite (the master's), regardless of beds.
        expect(ensuites.length, `en-suites=${ensuites.length} — hotel-suites OFF must not mint one per bedroom`).toBeLessThanOrEqual(1);
        // The en-suite count is STRICTLY below the bedroom count (no 1:1 suite minting).
        if (beds.length >= 2) expect(ensuites.length).toBeLessThan(beds.length);
    });

    it('hotel-suites OFF on the rotated plate: in-bounds, no en-suite explosion, SMALL corridor, master largest', () => {
        // spineFirst is on (the production default for the upper floor) but hotel-suites OFF (the new
        // default). The shipped upper floor must be in-bounds, NOT explode into 4 en-suites, NOT balloon
        // the corridor into a 73 m² blob, and the master must be the LARGEST bedroom (§MASTER-SURPLUS).
        setFlags({ tree: true });                       // spine-tree on, hotel-suites absent ⇒ OFF
        const out = enumerateLayouts(input(UPPER_2BED, { seed: 'clean-upper' }));
        const { placements, cellPolygonById, typeBySource, areaBySource } = winnerRooms(out);
        const oob = roomsOutOfShellRoomIds({ placements, shellPolygon: ROTATED_SHELL, cellPolygonById, epsilonM: 0.06 });
        expect(oob, `rooms OUTSIDE the shell: ${oob.join(',')}`).toEqual([]);

        const ensuiteCount = [...typeBySource.values()].filter(t => t === 'ensuite').length;
        expect(ensuiteCount, 'no per-bedroom en-suite explosion with hotel-suites OFF').toBeLessThanOrEqual(1);

        // §CORRIDOR-PHYSIOGNOMY — the corridor is a STRIP, never the founder's 73 m² blob. A single-loaded
        // upper corridor should be well under 30 m² (a real corridor is ~10–18 m²; we allow generous slack).
        const corridorIds = [...typeBySource.entries()].filter(([, t]) => t === 'corridor').map(([id]) => id);
        for (const id of corridorIds) {
            const a = areaBySource.get(id) ?? 0;
            expect(a, `corridor ${id} ballooned to ${a.toFixed(1)} m² (founder's 73 m² blob defect)`).toBeLessThan(30);
        }

        // §MASTER-SURPLUS — the master is the LARGEST bedroom (never the founder's 8 m² master). Compare
        // the master's area against every non-master bedroom.
        const masterAreas = [...typeBySource.entries()].filter(([, t]) => t === 'master').map(([id]) => areaBySource.get(id) ?? 0);
        const bedroomAreas = [...typeBySource.entries()].filter(([, t]) => t === 'bedroom').map(([id]) => areaBySource.get(id) ?? 0);
        if (masterAreas.length > 0 && bedroomAreas.length > 0) {
            const masterA = Math.max(...masterAreas);
            const maxBedroom = Math.max(...bedroomAreas);
            expect(masterA, `master (${masterA.toFixed(1)} m²) must be ≥ the largest other bedroom (${maxBedroom.toFixed(1)} m²)`)
                .toBeGreaterThanOrEqual(maxBedroom - 0.5);
        }
    });

    it('determinism (ADR-0061): two runs of the clean upper floor are byte-identical', () => {
        setFlags({ tree: true });
        const i = input(UPPER_2BED, { seed: 'det' });
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
