// @vitest-environment happy-dom
//
// HOUSE-LAYOUT INVARIANTS — the founder's "one invariant to enforce in CI"
// (Stage 5, 2026-06-09). A 2-storey house generated on a ~45°-ROTATED rectangular
// plate must satisfy three architectural invariants that a topology-quality-0
// layout violates (the founder's console audit caught central stairs, merged-name
// rooms, and silently-dropped rooms on rotated plates):
//
//   I1 / stair   — the stair core is a CORNER (left | right | back), NEVER central.
//                  Read off `StairCore.interiorSide` (the §DIAG-STAIR winner kind).
//   I3 / naming  — no engine-named room contains '/' (the merged-name signature),
//                  and the room count is ≥ the programmed count (no merge collapse).
//   I4 / count   — every storey's room count ≥ the programmed room count for that
//                  storey (no silent drops; mirrors `allocateProgramToStoreys`).
//
// happy-dom: the house orchestrator transitively imports modules that touch
// `window` via the room-detection seam (matches skewedPlateGeometry.test.ts).
//
// STATUS (2026-06-09): I1, I3, I4 all PASS today on a 45° plate (verified by probe).
// The §TOPO-HARD-REJECT gate (Fix A) and the upstream stair-containment work
// (§STAIR-CONTAIN-UPSTREAM) are what make these hold. No part is `.skip`-ed —
// every assertion below reflects current engine behaviour.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout, allocateProgramToStoreys } from '../src/workflows/houseLayout/index.js';
import {
    deriveProjectNorthFrame,
    rectifyShellRing,
    projectNorthWeld,
    type WeldWall,
} from '../src/workflows/houseLayout/index.js';
import { weldPartitionsToShell } from '../src/workflows/houseLayout/weldPartitionsToShell.js';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import { rotatePt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

type Pt = { x: number; z: number };

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** Rotate an axis-aligned rectangle about its centroid → a genuinely rotated shell
 *  (world metres). Mirrors `rotatedRect` in skewedPlateGeometry.test.ts. */
function rotatedRect(wM: number, hM: number, deg: number): Pt[] {
    const rect: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const c = { x: wM / 2, z: hM / 2 };
    return rect.map(p => rotatePt(p, (deg * Math.PI) / 180, c));
}

function mkShell(poly: Pt[]): ShellAnalysis {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
}

/** A conservative LOWER BOUND on the rooms a storey's program must mint — derived
 *  from the same `allocateProgramToStoreys` the engine uses. Counts only the rooms
 *  that are unconditionally minted (bedrooms + bathrooms + ensuite + living +
 *  kitchen); deliberately OMITS the corridor (conditional) and dining (may merge
 *  with the kitchen under open-plan) so the assertion is a true floor, never an
 *  over-count. The invariant is "no SILENT drop" — emitted ≥ this floor. */
function programmedRoomFloor(p: ApartmentProgram): number {
    return (
        p.bedrooms +
        p.bathrooms +
        (p.masterEnSuite ? 1 : 0) +
        (p.livingRoom ? 1 : 0) +
        // open-plan or not, §KITCHEN-DISTINCT keeps the kitchen an enclosed room.
        (p.openPlanKitchenDining || p.livingRoom ? 1 : 0)
    );
}

// A 13 × 10 m (130 m²) plate rotated 45° — the worst-case principal-axis rotation.
const SKEW = mkShell(rotatedRect(13, 10, 45));

describe('house-layout invariants on a 45°-rotated plate (founder CI invariant)', () => {
    const res = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('produces a well-formed 2-storey result with one stair', () => {
        expect(res.storeys).toHaveLength(2);
        expect(res.stairs).toHaveLength(1);
        expect(res.perStoreyLayout).toHaveLength(2);
    });

    // ── I1 / stair — corner, never central ──────────────────────────────────────
    it('I1: the stair core is a CORNER (left|right|back), never central', () => {
        const stair = res.stairs[0]!;
        expect(stair.interiorSide).toBeDefined();
        expect(['left', 'right', 'back']).toContain(stair.interiorSide);
        expect(stair.interiorSide).not.toBe('central');
    });

    // ── I3 / naming — no merged compound name + room count not collapsed ──────────
    it('I3: no engine-named room contains "/" (the merged-name signature)', () => {
        let checkedRooms = 0;
        for (const layout of res.perStoreyLayout) {
            if (!layout) continue;
            for (const room of layout.rooms) {
                checkedRooms++;
                expect(
                    (room.name ?? '').includes('/'),
                    `room "${room.name}" carries a compound merged name`,
                ).toBe(false);
            }
        }
        // Guard against a vacuous pass.
        expect(checkedRooms).toBeGreaterThan(0);
    });

    // ── I4 / count — every storey ≥ its programmed room floor (no silent drops) ───
    it('I4: every storey room count ≥ its programmed room floor', () => {
        const storeyPrograms = allocateProgramToStoreys(PROGRAM, 2);
        expect(res.perStoreyLayout).toHaveLength(storeyPrograms.length);
        for (let i = 0; i < storeyPrograms.length; i++) {
            const layout = res.perStoreyLayout[i]!;
            const floor = programmedRoomFloor(storeyPrograms[i]!.program);
            expect(
                layout.rooms.length,
                `storey ${i} emitted ${layout.rooms.length} rooms < programmed floor ${floor}`,
            ).toBeGreaterThanOrEqual(floor);
        }
    });

    // ── determinism (no RNG) ──────────────────────────────────────────────────────
    it('is deterministic (same rotated input → identical result)', () => {
        const a = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const b = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ── §HALL-SINGLETON (ADR-0063 founder rule #1, 2026-06-10) ──────────────────────────
// A residential house has EXACTLY ONE entrance hall, ALWAYS on the GROUND storey,
// NONE on any upper storey. The bubble graph mints a `hall` iff a storey's program
// carries `entranceHall === true`, so the invariant is verified on the per-storey
// program split (`allocateProgramToStoreys`) the engine actually consumes.
describe('§HALL-SINGLETON: exactly one entrance hall, ground-only (founder rule #1)', () => {
    const countGroundHalls = (storeyCount: number, p: ApartmentProgram = PROGRAM): number => {
        const ss = allocateProgramToStoreys(p, storeyCount);
        return ss.filter(s => s.role === 'ground' && s.program.entranceHall === true).length;
    };
    const countUpperHalls = (storeyCount: number, p: ApartmentProgram = PROGRAM): number => {
        const ss = allocateProgramToStoreys(p, storeyCount);
        return ss.filter(s => s.role !== 'ground' && s.program.entranceHall === true).length;
    };

    for (const n of [1, 2, 3]) {
        it(`a ${n}-storey house has exactly ONE ground hall and ZERO upper halls`, () => {
            expect(countGroundHalls(n)).toBe(1);
            expect(countUpperHalls(n)).toBe(0);
        });
    }

    it('forces a ground hall even when the brief OMITS entranceHall (never zero)', () => {
        const noHallBrief: ApartmentProgram = { ...PROGRAM, entranceHall: false };
        for (const n of [1, 2, 3]) {
            expect(countGroundHalls(n, noHallBrief)).toBe(1);
            expect(countUpperHalls(n, noHallBrief)).toBe(0);
        }
    });

    it('strips an upper hall if the brief somehow carries one (singleton correction)', () => {
        // The allocator builds upper programs with entranceHall:false by construction;
        // this asserts the post-build §HALL-SINGLETON pass also keeps upper halls at zero
        // regardless of the incoming flag (the flag only seeds the GROUND storey).
        const ss = allocateProgramToStoreys({ ...PROGRAM, entranceHall: true }, 3);
        expect(ss.filter(s => s.role !== 'ground' && s.program.entranceHall === true)).toHaveLength(0);
        expect(ss.filter(s => s.role === 'ground' && s.program.entranceHall === true)).toHaveLength(1);
    });

    it('is deterministic (same brief + storey count → identical split)', () => {
        const a = allocateProgramToStoreys(PROGRAM, 3);
        const b = allocateProgramToStoreys(PROGRAM, 3);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});

// ── §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11) ──────────────────────────
// The multi-storey GROUND floor under-filled a LARGE plate (32 m² blank @ 250 m²,
// 71 @ 289) because its bedrooms live UPSTAIRS, so growing the bedroom count never
// lifted the ground programme toward the plate — §HOUSE-MAX-CAP clamped the presented
// area to grossMax≈218 and the rest was blank. The fix grows the ground's PUBLIC/
// SERVICE room SET (study + utility — both CORRIDOR-SERVED, so they never seal) so
// the programme — and the cap — reach the plate. This block is the no-seal hard gate.
describe('§HOUSE-GROUND-PUBLIC-SET: a large multi-storey ground fills its plate without sealing', () => {
    // A 17 × 17 m (289 m²) detached plate — the large case the defect was measured on.
    const BIG = mkShell([{ x: 0, z: 0 }, { x: 17, z: 0 }, { x: 17, z: 17 }, { x: 0, z: 17 }]);
    const res = generateHouseLayout(BIG, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
    const ground = res.perStoreyLayout[0]!;

    it('produces a non-null ground storey with rooms', () => {
        expect(ground).not.toBeNull();
        expect(ground.rooms.length).toBeGreaterThan(0);
    });

    it('the large ground floor mints a study AND a utility (the public-set fill)', () => {
        const types = new Set(ground.rooms.map(r => r.type));
        expect(types.has('study'), 'large ground should include a study').toBe(true);
        expect(types.has('utility'), 'large ground should include a utility').toBe(true);
    });

    it('every ground room is reachable — NO sealed room (no door-less room)', () => {
        // A room is reachable if it declares direct access OR a door/adjacency links it.
        // The ensuite is the one architectural exception (reached via its host bedroom).
        for (const room of ground.rooms) {
            if (room.type === 'ensuite') continue;
            const reachable = room.hasDirectAccess === true
                || (Array.isArray(room.adjacentTo) && room.adjacentTo.length > 0);
            expect(reachable, `ground room "${room.name}" (${room.type}) is SEALED — no access`).toBe(true);
        }
    });

    it('no merged compound name on the large ground (the under-fill blob signature)', () => {
        for (const room of ground.rooms) {
            expect((room.name ?? '').includes('/'),
                `ground room "${room.name}" carries a merged name`).toBe(false);
        }
    });

    it('the normal ~130 m² ground is UNCHANGED (no study/utility — byte-identical case)', () => {
        const small = generateHouseLayout(
            mkShell([{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }]),
            PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 },
        );
        const types = new Set(small.perStoreyLayout[0]!.rooms.map(r => r.type));
        expect(types.has('study'), 'a normal-size ground must NOT gain a study').toBe(false);
        expect(types.has('utility'), 'a normal-size ground must NOT gain a utility').toBe(false);
    });

    it('is deterministic on the large plate (same input → identical result)', () => {
        const b = generateHouseLayout(BIG, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(JSON.stringify(res)).toEqual(JSON.stringify(b));
    });
});

// ── §PROJECT-NORTH (ADR-0070 Model B, SPEC-PROJECT-NORTH-AUTHORING-FRAME) ────────────
// The RIGID-TRANSFORM-LAST weld is the §53 root fix for the rotated-plate SEAM
// RESIDUAL. This block is the live gate for that fix.
//
// SCOPE — RIGOROUS HONESTY (what the probe proved, what the fix ACTUALLY delivers):
//   • The TESTABLE, rotation-induced defect is the GEOMETRIC SEAM RESIDUAL: on the
//     45°/43.2° plate an interior partition endpoint lands ~0.355 m off its mate —
//     an OPEN SEAM the world-frame weld can only close by ever-widening (the
//     §WJ-SKEW / §SHELL-SNAP-WIDEN band-aids) with a §WJ-SKEW diagonal-drag hazard.
//     `projectNorthWeld` welds in the AXIS-ALIGNED Project-North frame, where the
//     snap runs strictly ALONG an axis, and closes the seam to ~0 with NO dropped
//     divider — provably (the assertions below).
//   • The OTHER reported symptoms (§TOPO-HARD-REJECT, sealed/door-less rooms,
//     §CIRCULATION-REROUTE) were measured (headless probe, console capture) to fire
//     IDENTICALLY on the AXIS-ALIGNED (θ=0) 13×10 plate of the same program — they
//     are PRE-WELD ENGINE layout-quality verdicts (`enumerate.ts` hard-topology gate
//     + `wallsAndDoors` door placement), NOT downstream of the seam residual and NOT
//     touched by an executor-side weld. We therefore DO NOT assert their absence here
//     (that would be a false claim); they keep their own engine-side tracker lines.
//   • BYTE-IDENTITY: at θ=0 the whole transform is identity ⇒ `projectNorthWeld` is a
//     byte-for-byte pass-through to `weldPartitionsToShell` (ADR-0061 I2). Asserted.
//
// The build path the executor takes — `buildLayoutCommands` then weld the wall
// baselines against the footprint ring — is reproduced here so the PURE geometry is
// gated in ai-host (the editor weld + room detection are not reachable from here).
describe('§PROJECT-NORTH: RIGID-TRANSFORM-LAST weld dissolves the rotated-plate seam residual', () => {
    // Build the footprint ring (world m) as ordered shell walls — one per edge.
    const ringWalls = (poly: readonly Pt[]): WeldWall[] => {
        const out: WeldWall[] = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            out.push({ id: `shell-${i}`, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
        return out;
    };
    // Distance from a point to a segment (the detector's corner-snap geometry).
    const distToSeg = (px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number => {
        const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
    };
    // Worst seal residual over every partition endpoint = min(nearest shell body,
    // nearest OTHER partition endpoint). > 0.30 m ⇒ an OPEN SEAM (room-merge gap).
    const worstSeal = (parts: readonly WeldWall[], shell: readonly WeldWall[]): number => {
        let m = 0;
        for (const w of parts) {
            for (const e of [w.start, w.end]) {
                let nearShell = Infinity;
                for (const s of shell) { const d = distToSeg(e.x, e.z, s.start, s.end); if (d < nearShell) nearShell = d; }
                let nearPart = Infinity;
                for (const o of parts) {
                    if (o.id === w.id) continue;
                    for (const e2 of [o.start, o.end]) { const d = Math.hypot(e.x - e2.x, e.z - e2.z); if (d < nearPart) nearPart = d; }
                }
                m = Math.max(m, Math.min(nearShell, nearPart));
            }
        }
        return m;
    };
    // Emit the interior partitions (world m) for storey 0 of a generated house on a plate.
    const partitionsFor = (shellPoly: Pt[]): { partitions: WeldWall[]; shell: WeldWall[] } => {
        const res = generateHouseLayout(mkShell(shellPoly), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const option = res.perStoreyLayout[0]!;
        const footprint = res.storeys[0]!.footprint as Pt[];
        const shell = ringWalls(footprint);
        let seq = 0;
        const set = buildLayoutCommands(
            option,
            { levelId: 'L0', baseElevationM: 0, wallHeightM: 3, skipExteriorWalls: true, shellWalls: shell },
            (p) => `${p}-${seq++}`,   // deterministic + UNIQUE per mint (no id collisions)
        );
        const walls = (set.wallBatch.payload as { walls: Array<{ id: string; baseLine: Array<{ x: number; z: number }> }> }).walls;
        const partitions: WeldWall[] = walls.map(w => ({
            id: w.id,
            start: { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
            end: { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
        }));
        return { partitions, shell };
    };

    // The §53 plate: 13×10 m rotated 45° (the worst-case principal-axis rotation).
    const SKEW_POLY = rotatedRect(13, 10, 45);

    it('the 45°-rotated plate HAS an open seam under the world-frame weld at tight tolerance', () => {
        const { partitions, shell } = partitionsFor(SKEW_POLY);
        // The original (pre-band-aid) TIGHT weld in the WORLD frame leaves the residual:
        // an endpoint > 0.30 m corner-snap from its mate → the merge gap §53 reports.
        const worldTight = weldPartitionsToShell(partitions, shell, { shellSnapTolM: 0.30, partitionWeldTolM: 0.05 });
        expect(worstSeal(worldTight, shell)).toBeGreaterThan(0.30);
    });

    it('§PROJECT-NORTH closes EVERY seam on the 45° plate (residual ≤ corner-snap, NO dropped divider)', () => {
        const { partitions, shell } = partitionsFor(SKEW_POLY);
        const frame = deriveProjectNorthFrame(shell.map(w => w.start));
        expect(frame.thetaRad).not.toBe(0);   // a genuinely rotated plate
        const out = projectNorthWeld(partitions, shell, frame);
        // The seal residual is measured against the RECTIFIED+re-rotated shell — the
        // seal reference the executor uses (== the drawn shell on a clean rectangle).
        expect(worstSeal(out.partitions, out.shellWallsWorld)).toBeLessThanOrEqual(0.30);
        // No interior divider was dropped (a dropped divider MERGES two rooms — the
        // §DIAG-SEAL-DROP root cause; RIGID-TRANSFORM-LAST closes without dropping).
        expect(out.partitions.length).toBe(partitions.length);
    });

    it('seals at EVERY tested rotation (10/30/43.2/60/75°) — angle-independent by construction', () => {
        for (const deg of [10, 30, 43.2, 60, 75]) {
            const { partitions, shell } = partitionsFor(rotatedRect(13, 10, deg));
            const frame = deriveProjectNorthFrame(shell.map(w => w.start));
            const out = projectNorthWeld(partitions, shell, frame);
            expect(
                worstSeal(out.partitions, out.shellWallsWorld),
                `deg=${deg} left an open seam`,
            ).toBeLessThanOrEqual(0.30);
            expect(out.partitions.length, `deg=${deg} dropped a divider`).toBe(partitions.length);
        }
    });

    it('BYTE-IDENTITY: an axis-aligned (θ=0) plate ⇒ projectNorthWeld === weldPartitionsToShell', () => {
        const { partitions, shell } = partitionsFor([{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }]);
        const frame = deriveProjectNorthFrame(shell.map(w => w.start));
        expect(frame.thetaRad).toBe(0);   // axis-aligned ⇒ identity
        const direct = weldPartitionsToShell(partitions, shell);
        const viaPN = projectNorthWeld(partitions, shell, frame).partitions;
        expect(JSON.stringify(viaPN)).toEqual(JSON.stringify(direct));
    });

    it('the rigid +θ transform PRESERVES coincidence + wall length (no geometry corruption)', () => {
        const { partitions, shell } = partitionsFor(SKEW_POLY);
        const frame = deriveProjectNorthFrame(shell.map(w => w.start));
        const out = projectNorthWeld(partitions, shell, frame);
        // Every surviving partition's length is preserved within the weld tolerance
        // (a rigid rotation is isometric; the weld only nudges endpoints onto mates).
        const lenById = new Map(partitions.map(p => [p.id, Math.hypot(p.end.x - p.start.x, p.end.z - p.start.z)]));
        for (const w of out.partitions) {
            const before = lenById.get(w.id)!;
            const after = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
            // The weld may shorten a perimeter-terminating wall by up to its snap; bound
            // the change generously (this guards against a transform that mangles length).
            expect(Math.abs(after - before), `wall ${w.id} length corrupted`).toBeLessThan(0.7);
        }
    });

    it('is deterministic (same rotated input → identical welded geometry)', () => {
        const a = partitionsFor(SKEW_POLY);
        const fa = deriveProjectNorthFrame(a.shell.map(w => w.start));
        const r1 = projectNorthWeld(a.partitions, a.shell, fa);
        const r2 = projectNorthWeld(a.partitions, a.shell, fa);
        expect(JSON.stringify(r1)).toEqual(JSON.stringify(r2));
    });
});

// ── rectifyShellRing — the load-bearing §3.3 step (clean axis-aligned rectilinear) ──
describe('§PROJECT-NORTH rectifyShellRing: a near-axis ring snaps to EXACT axis', () => {
    it('snaps a slightly-drifted rectangle to perfectly axis-aligned corners', () => {
        // A rectangle whose corners drifted a few cm (post-miter drawn-shell drift).
        const drifted = [
            { x: 0.03, z: -0.02 }, { x: 13.01, z: 0.04 },
            { x: 12.98, z: 10.03 }, { x: -0.02, z: 9.99 },
        ];
        const out = rectifyShellRing(drifted);
        // Every edge is now exactly horizontal or vertical (axis-aligned).
        for (let i = 0; i < out.length; i++) {
            const a = out[i]!, b = out[(i + 1) % out.length]!;
            const horizontal = Math.abs(a.z - b.z) < 1e-9;
            const vertical = Math.abs(a.x - b.x) < 1e-9;
            expect(horizontal || vertical, `edge ${i} is not axis-aligned`).toBe(true);
        }
    });

    it('leaves a genuinely diagonal edge (a real chamfer) UNTOUCHED', () => {
        // A pentagon with one clearly-diagonal chamfer (2 m off-axis run) the user drew.
        const chamfer = [
            { x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 8 },
            { x: 11, z: 10 }, { x: 0, z: 10 },   // the (13,8)→(11,10) edge is a real 2 m chamfer
        ];
        const out = rectifyShellRing(chamfer);
        // The chamfer edge keeps its diagonal run (NOT collapsed to an axis).
        const a = out[2]!, b = out[3]!;
        expect(Math.abs(a.x - b.x)).toBeGreaterThan(1.0);
        expect(Math.abs(a.z - b.z)).toBeGreaterThan(1.0);
    });
});
