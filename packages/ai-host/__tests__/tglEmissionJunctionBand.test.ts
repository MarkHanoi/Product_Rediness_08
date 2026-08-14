// @vitest-environment happy-dom
//
// L-909(a) — EMISSION CORRECTNESS: every D-TGL partition endpoint lands INSIDE the
// junction band of its host, and the RoomDetectionEngine's §DIAG-PARTITION-REACH
// rescuer has NOTHING to rescue (0 dangling ends).
//
// The founder's production log showed the join machinery straining:
//   §DIAG-PARTITION-REACH reconnected … closed a 988mm dangling gap
//   §DIAG-PARTITION-REACH reconnected … closed a 1100mm dangling gap
//   §DIAG-ROOM-LOOP BREAK — endpoint 235mm from centreline EXCEEDS hostSnap 200mm
// Downstream rescuers half-recover what the pipeline got wrong. This suite pins the
// SEAM: geometry emitted by the REAL emit path (generateDeterministicLayouts →
// emitGeometry → projectPartitionEndpointsToShell) must be junction-exact BEFORE any
// rescuer runs, on rectilinear AND skewed AND sheared (rectify-path) shells.
//
// The dangling predicate here is a measurement PORT of RoomDetectionEngine's own
// §DIAG-PARTITION-REACH gate (CORNER_CONNECTED_TOL_M = 0.30 m corner band;
// hostSnap = max(0.20, thickness/2 + 0.02) body-T band) so "0 dangling" in this
// suite means exactly "the rescuer finds nothing" in production. The second arm
// then EXECUTES the real RoomDetectionEngine and asserts the rescuer log stays
// silent — the port can never drift from the real gate unnoticed.
//
// happy-dom: RoomDetectionEngine transitively imports core-app-model (UiPreferences),
// which touches `window` at module load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { polygonAreaM2, type ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { corridorEfficiency: 1, kitchenWorkflow: 1, naturalLight: 1, privacy: 1 };

const mkShell = (poly: Pt[]): ShellAnalysis => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
};

// The founder-relevant shell family: rectilinear control, L-plate, skewed
// (principal-axis path), sheared convex quad (§RECTIFY-QUAD + projection path).
const SHELLS: Array<{ name: string; poly: Pt[] }> = [
    { name: 'rectilinear 12x10', poly: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }] },
    {
        name: 'L-plate 12x10 minus 5x4 notch',
        poly: [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 }, { x: 7, z: 6 }, { x: 7, z: 10 }, { x: 0, z: 10 },
        ],
    },
    {
        name: 'skewed quad (principal-axis path)',
        poly: [{ x: 0.4, z: 0 }, { x: 11.4, z: 0.7 }, { x: 10.7, z: 9.7 }, { x: -0.3, z: 9 }],
    },
    {
        name: 'sheared parallelogram (§RECTIFY-QUAD projection path)',
        // fill ratio vs bbox ≈ 0.79 (≥ 0.5 → rectifies); 110 m² net.
        poly: [{ x: 0, z: 0 }, { x: 11, z: 0 }, { x: 14, z: 10 }, { x: 3, z: 10 }],
    },
];

interface SegM { readonly ax: number; readonly az: number; readonly bx: number; readonly bz: number; readonly isExternal: boolean }

function optionToSegs(option: { walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; isExternal?: boolean }> }): SegM[] {
    return option.walls.map(w => ({
        ax: w.start.x / 1000, az: w.start.y / 1000,
        bx: w.end.x / 1000, bz: w.end.y / 1000,
        isExternal: w.isExternal === true,
    }));
}

// ── Measurement port of RoomDetectionEngine §DIAG-PARTITION-REACH's gate ──────
// (CORNER_CONNECTED_TOL_M / SPAN_MARGIN_M / SNAP_FLOOR mirror RoomDetectionEngine.ts;
// the executed-engine arm below keeps this port honest.)
const CORNER_CONNECTED_TOL_M = 0.30;
const SPAN_MARGIN_M = 0.05;
const SNAP_FLOOR = 0.20;

interface DanglingEnd { seg: SegM; side: 'a' | 'b'; x: number; z: number; minGapM: number }

/** Every wall endpoint that the RoomDetectionEngine would classify DANGLING
 *  (not corner-connected, not within any host's body-T snap band). */
function findDanglingEnds(segs: readonly SegM[]): DanglingEnd[] {
    const out: DanglingEnd[] = [];
    const closest = (px: number, pz: number, s: SegM) => {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-9) return { perp: Math.hypot(px - s.ax, pz - s.az), along: 0, len: 0 };
        const len = Math.sqrt(len2);
        let t = ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const fx = s.ax + t * dx, fz = s.az + t * dz;
        return { perp: Math.hypot(px - fx, pz - fz), along: t * len, len };
    };
    for (const seg of segs) {
        for (const side of ['a', 'b'] as const) {
            const px = side === 'a' ? seg.ax : seg.bx;
            const pz = side === 'a' ? seg.az : seg.bz;
            let connected = false;
            let minGap = Infinity;
            for (const o of segs) {
                if (o === seg) continue;
                const dA = Math.hypot(px - o.ax, pz - o.az);
                const dB = Math.hypot(px - o.bx, pz - o.bz);
                minGap = Math.min(minGap, dA, dB);
                if (dA <= CORNER_CONNECTED_TOL_M || dB <= CORNER_CONNECTED_TOL_M) { connected = true; break; }
                const c = closest(px, pz, o);
                minGap = Math.min(minGap, c.perp);
                if (c.len > 1e-6 && c.along > SPAN_MARGIN_M && c.along < c.len - SPAN_MARGIN_M
                    && c.perp <= SNAP_FLOOR) { connected = true; break; }
            }
            if (!connected) out.push({ seg, side, x: px, z: pz, minGapM: minGap });
        }
    }
    return out;
}

function toEngineWalls(segs: readonly SegM[]) {
    return segs.map((s, i) => ({
        id: `w${i}`,
        baseLine: [
            { x: s.ax, y: 0, z: s.az },
            { x: s.bx, y: 0, z: s.bz },
        ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    }));
}
function mockWallStore(walls: ReturnType<typeof toEngineWalls>) {
    return { getByLevel: (_lvl: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
}

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logSpy = vi.spyOn(console, 'log'); });
afterEach(() => { logSpy.mockRestore(); });

const reachLines = (): string[] =>
    logSpy.mock.calls
        .map(args => args.map(String).join(' '))
        .filter(l => l.includes('§DIAG-PARTITION-REACH reconnected'));

describe('L-909(a) — emitted geometry lands INSIDE the junction band (no rescuer work)', () => {
    for (const { name, poly } of SHELLS) {
        it(`${name}: every emitted endpoint is junction-connected (0 dangling)`, () => {
            const layouts = generateDeterministicLayouts(mkShell(poly), PROGRAM, CONSTRAINTS, WEIGHTS, 1);
            expect(layouts.length).toBeGreaterThan(0);
            const segs = optionToSegs(layouts[0]!);
            expect(segs.length).toBeGreaterThan(3);
            const dangling = findDanglingEnds(segs);
            const detail = dangling.map(d =>
                `(${d.x.toFixed(3)},${d.z.toFixed(3)}).${d.side} minGap=${(d.minGapM * 1000).toFixed(0)}mm ext=${d.seg.isExternal}`).join('\n');
            expect(dangling, `dangling ends on "${name}":\n${detail}`).toHaveLength(0);
        });

        it(`${name}: the REAL RoomDetectionEngine's §DIAG-PARTITION-REACH rescues NOTHING`, () => {
            const layouts = generateDeterministicLayouts(mkShell(poly), PROGRAM, CONSTRAINTS, WEIGHTS, 1);
            expect(layouts.length).toBeGreaterThan(0);
            const segs = optionToSegs(layouts[0]!);
            const engine = new RoomDetectionEngine(mockWallStore(toEngineWalls(segs)));
            const detected = engine.detectRoomsForLevel('L0', 0, 2.7);
            expect(detected.length).toBeGreaterThanOrEqual(3);
            expect(reachLines(), `rescuer fired on "${name}"`).toHaveLength(0);
        });
    }
});
