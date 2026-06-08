// @vitest-environment happy-dom
//
// §GROUND-WELD (A.21.D39) — the GROUND floor of a generated multi-storey house
// must subdivide into its real rooms, not collapse to ONE merged room.
//
// The defect recurs because the GROUND reuses the user's PRE-DRAWN shell (drawn
// edge-by-edge, mitred by the editor's WallJoinResolver, raised by D38), so its
// post-miter wall centrelines can sit > the RoomDetectionEngine's 20 mm node grid
// away from where the engine tiled the interior partitions — the loop never closes.
// The robust fix WELDS the ground partition endpoints onto the (authoritative) shell
// + to each other, so the ground closes every room like the upper floors do.
//
// happy-dom: RoomDetectionEngine transitively imports core-app-model (UiPreferences),
// which touches `window` at module load.

import { describe, expect, it } from 'vitest';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { weldPartitionsToShell, type WeldWall } from '../src/workflows/houseLayout/weldPartitionsToShell.js';
import { generateHouseLayout } from '../src/workflows/houseLayout/houseOrchestrator.js';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import { polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = { bedrooms: 3, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
const constraints: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const weights: ScoringWeights = { corridorEfficiency: 1, kitchenWorkflow: 1, naturalLight: 1, privacy: 1 };

const mkShell = (poly: Pt[]): ShellAnalysis => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
};
let idc = 0;
const mint = (p: string) => `${p}-${idc++}`;

type EW = { id: string; baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] };
const toEngine = (w: { id: string; start: { x: number; z: number }; end: { x: number; z: number } }): EW =>
    ({ id: w.id, baseLine: [{ x: w.start.x, y: 0, z: w.start.z }, { x: w.end.x, y: 0, z: w.end.z }] });
function detect(walls: EW[]) {
    const store = { getByLevel: (_l: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
    return new RoomDetectionEngine(store).detectRoomsForLevel('L0', 0, 2.7);
}

/** Pull the interior partition WeldWalls out of a built command set (world m). */
function partitionsFromSet(set: ReturnType<typeof buildLayoutCommands>): WeldWall[] {
    const walls = (set.wallBatch.payload as { walls: Array<{ id: string; baseLine: Array<{ x: number; z: number }> }> }).walls;
    return walls.map(w => ({ id: w.id, start: { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z }, end: { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z } }));
}

describe('§GROUND-WELD — weldPartitionsToShell unit', () => {
    const shell: WeldWall[] = [
        { id: 's0', start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
        { id: 's1', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },
        { id: 's2', start: { x: 10, z: 8 }, end: { x: 0, z: 8 } },
        { id: 's3', start: { x: 0, z: 8 }, end: { x: 0, z: 0 } },
    ];

    it('snaps a partition endpoint that sits 8 cm OFF the shell onto the shell line', () => {
        // A partition meant to run from the bottom shell to the top shell, but both
        // ends drifted 80 mm past/short of the shell (the >20 mm grid failure).
        const parts: WeldWall[] = [{ id: 'p0', start: { x: 5, z: -0.08 }, end: { x: 5, z: 8.08 } }];
        const out = weldPartitionsToShell(parts, shell);
        expect(out).toHaveLength(1);
        // Endpoints now lie exactly on z=0 and z=8 (the shell lines).
        expect(Math.abs(out[0]!.start.z - 0)).toBeLessThan(1e-6);
        expect(Math.abs(out[0]!.end.z - 8)).toBeLessThan(1e-6);
    });

    it('welds two partition endpoints that should meet to a single shared point', () => {
        const parts: WeldWall[] = [
            { id: 'p0', start: { x: 5, z: 0 }, end: { x: 5.02, z: 4.01 } },   // drifted
            { id: 'p1', start: { x: 5, z: 4 }, end: { x: 9.99, z: 4 } },      // drifted
        ];
        const out = weldPartitionsToShell(parts, shell);
        const a = out.find(w => w.id === 'p0')!;
        const b = out.find(w => w.id === 'p1')!;
        expect(a.end.x).toBe(b.start.x);
        expect(a.end.z).toBe(b.start.z);
    });

    it('does NOT move endpoints already exactly on the shell (deterministic no-op)', () => {
        const parts: WeldWall[] = [{ id: 'p0', start: { x: 4, z: 0 }, end: { x: 4, z: 8 } }];
        const out1 = weldPartitionsToShell(parts, shell);
        const out2 = weldPartitionsToShell(parts, shell);
        expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
        expect(out1[0]!.start).toEqual({ x: 4, z: 0 });
        expect(out1[0]!.end).toEqual({ x: 4, z: 8 });
    });

    it('drops a partition the weld collapses below the 5 cm min length', () => {
        const parts: WeldWall[] = [{ id: 'p0', start: { x: 5, z: 0 }, end: { x: 5, z: 0.02 } }];
        const out = weldPartitionsToShell(parts, shell);
        expect(out).toHaveLength(0);
    });
});

describe('§GROUND-WELD — GROUND floor detects its full room set', () => {
    it('a faithful GROUND floor (footprint = shell; shell drifted within snap range) detects ≥4 rooms and weld never regresses it', () => {
        // Faithful model: the engine footprint IS the drawn shell perimeter (same
        // source). The DETECTION shell walls are the post-WallJoinResolver geometry,
        // drifted (mitre/trim) within the engine's snap range. The weld makes the
        // junctions EXACT so closure is deterministic, never worse than the raw set.
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }];
        const house = generateHouseLayout(mkShell(poly), PROGRAM, constraints, weights, {
            storeyCount: 2, floorToFloorM: 3, baseElevationM: 0, levelIdForStorey: (i: number) => `L${i}`, roofKind: 'gable',
        });
        const set = buildLayoutCommands(house.perStoreyLayout[0]!, { levelId: 'L0', skipExteriorWalls: true, wallThicknessM: 0.1 }, mint);
        // Pre-drawn shell, mitre-overrun at each corner by thickness/2 (0.1 m).
        const t2 = 0.1;
        const shellWalls: WeldWall[] = poly.map((a, i) => {
            const b = poly[(i + 1) % poly.length]!;
            const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L;
            return { id: `shell-${i}`, start: { x: a.x - ux * t2, z: a.z - uz * t2 }, end: { x: b.x + ux * t2, z: b.z + uz * t2 } };
        });
        const rawParts = partitionsFromSet(set);
        const rawDetected = detect([...shellWalls.map(toEngine), ...rawParts.map(toEngine)]);
        const welded = weldPartitionsToShell(rawParts, shellWalls);
        const detected = detect([...shellWalls.map(toEngine), ...welded.map(toEngine)]);
        // eslint-disable-next-line no-console
        console.log('§GROUND-WELD faithful raw=', rawDetected.length, 'welded=', detected.length, 'parts=', rawParts.length);
        // A multi-bed ground programme → clearly NOT one merged room.
        expect(detected.length).toBeGreaterThanOrEqual(4);
        expect(detected.length).toBeGreaterThanOrEqual(rawDetected.length);
    });

    it('GUARANTEE — after weld, every partition endpoint near the shell lies EXACTLY on a shell line', () => {
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }];
        const house = generateHouseLayout(mkShell(poly), PROGRAM, constraints, weights, {
            storeyCount: 2, floorToFloorM: 3, baseElevationM: 0, levelIdForStorey: (i: number) => `L${i}`, roofKind: 'gable',
        });
        const set = buildLayoutCommands(house.perStoreyLayout[0]!, { levelId: 'L0', skipExteriorWalls: true, wallThicknessM: 0.1 }, mint);
        // Shell drifted 0.12 m off-line (within the 0.30 m snap tol) to prove the snap.
        const drift = 0.12;
        const shellWalls: WeldWall[] = poly.map((a, i) => {
            const b = poly[(i + 1) % poly.length]!;
            // push each horizontal/vertical shell wall slightly outward (off its true line)
            const outX = (a.x === 14 && b.x === 14) ? drift : (a.x === 0 && b.x === 0) ? -drift : 0;
            const outZ = (a.z === 0 && b.z === 0) ? -drift : (a.z === 11 && b.z === 11) ? drift : 0;
            return { id: `shell-${i}`, start: { x: a.x + outX, z: a.z + outZ }, end: { x: b.x + outX, z: b.z + outZ } };
        });
        const welded = weldPartitionsToShell(partitionsFromSet(set), shellWalls);
        // Distance from a point to the nearest (drifted) shell line.
        const lines = [-drift, 14 + drift]; const zlines = [-drift, 11 + drift];
        const distToShell = (p: { x: number; z: number }): number => Math.min(
            ...lines.map(L => Math.abs(p.x - L)), ...zlines.map(L => Math.abs(p.z - L)),
        );
        for (const w of welded) {
            for (const ep of [w.start, w.end]) {
                const d = distToShell(ep);
                // An endpoint within snap range of the shell must now sit ON the shell
                // line (≤ 1 mm grid). Interior junctions (> 0.30 m off) stay interior.
                if (d <= 0.30) expect(d).toBeLessThanOrEqual(0.0011);
            }
        }
    });

    it('welding NEVER reduces the detected room count vs the clean (already-aligned) set', () => {
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }];
        const shellA = mkShell(poly);
        const house = generateHouseLayout(shellA, PROGRAM, constraints, weights, {
            storeyCount: 2, floorToFloorM: 3, baseElevationM: 0, levelIdForStorey: (i: number) => `L${i}`, roofKind: 'gable',
        });
        const set = buildLayoutCommands(house.perStoreyLayout[0]!, { levelId: 'L0', skipExteriorWalls: true, wallThicknessM: 0.1 }, mint);
        const shellWalls: WeldWall[] = poly.map((a, i) => {
            const b = poly[(i + 1) % poly.length]!;
            return { id: `shell-${i}`, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } };
        });
        const raw = partitionsFromSet(set);
        const cleanDetected = detect([...shellWalls.map(toEngine), ...raw.map(toEngine)]);
        const welded = weldPartitionsToShell(raw, shellWalls);
        const weldedDetected = detect([...shellWalls.map(toEngine), ...welded.map(toEngine)]);
        expect(weldedDetected.length).toBeGreaterThanOrEqual(cleanDetected.length);
    });
});

describe('§T-JUNCTION-WELD — endpoint-on-midspan junctions seal (PM-6, 2026-06-08)', () => {
    const noShell: WeldWall[] = [];

    it('snaps a partition ENDING near another partition\'s MID-SPAN exactly onto it', () => {
        // Spine A runs along z=5 (x:0→10). Stub B rises from the floor and ENDS just
        // short of / beside A's mid-span (gap 0.12 m, well inside the 0.30 m tol). The
        // T must close on A's centreline (z=5) so room detection can\'t flood across it.
        const A: WeldWall = { id: 'A', start: { x: 0, z: 5 }, end: { x: 10, z: 5 } };
        const B: WeldWall = { id: 'B', start: { x: 4, z: 0 }, end: { x: 4, z: 4.88 } }; // ends 0.12 m below A
        const welded = weldPartitionsToShell([A, B], noShell);
        const b = welded.find(w => w.id === 'B')!;
        // The endpoint nearest A (the high-z end) now sits ON A's span (z ≈ 5, ≤ 1 mm grid).
        const tEnd = b.start.z > b.end.z ? b.start : b.end;
        expect(Math.abs(tEnd.z - 5)).toBeLessThanOrEqual(0.0011);
        expect(tEnd.x).toBeCloseTo(4, 2);           // x unchanged (perpendicular snap)
        // A itself is untouched (it owns the span; only B's endpoint moved).
        const a = welded.find(w => w.id === 'A')!;
        expect(a.start.z).toBeCloseTo(5, 5);
        expect(a.end.z).toBeCloseTo(5, 5);
    });

    it('does NOT snap an endpoint that is only near another partition\'s ENDPOINT (Pass 2 owns that) nor across a wide gap', () => {
        // B ends 0.5 m from A's span — beyond the 0.30 m tol → must NOT move (no false weld).
        const A: WeldWall = { id: 'A', start: { x: 0, z: 5 }, end: { x: 10, z: 5 } };
        const B: WeldWall = { id: 'B', start: { x: 4, z: 0 }, end: { x: 4, z: 4.5 } };
        const welded = weldPartitionsToShell([A, B], noShell);
        const b = welded.find(w => w.id === 'B')!;
        const tEnd = b.start.z > b.end.z ? b.start : b.end;
        expect(tEnd.z).toBeCloseTo(4.5, 5);          // unchanged — too far to snap
    });

    it('two clean axis-aligned partitions meeting at a shared CORNER are byte-identical (no regression)', () => {
        // A and B already share the exact corner (10,5) as ENDPOINTS — a near-end hit is
        // excluded by the TJUNC_MARGIN interior guard, so Pass 1.5 leaves them for Pass 2.
        const A: WeldWall = { id: 'A', start: { x: 0, z: 5 }, end: { x: 10, z: 5 } };
        const B: WeldWall = { id: 'B', start: { x: 10, z: 5 }, end: { x: 10, z: 12 } };
        const welded = weldPartitionsToShell([A, B], noShell);
        const a = welded.find(w => w.id === 'A')!, b = welded.find(w => w.id === 'B')!;
        expect(a.end.x).toBeCloseTo(10, 5); expect(a.end.z).toBeCloseTo(5, 5);
        expect(b.start.x).toBeCloseTo(10, 5); expect(b.start.z).toBeCloseTo(5, 5);
    });
});
