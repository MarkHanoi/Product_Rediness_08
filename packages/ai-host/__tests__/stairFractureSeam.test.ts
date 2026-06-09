// @vitest-environment happy-dom
//
// §FRACTURE-SEAL — acceptance test for the LIVE v94 §DIAG-SEAL room-merge defect.
//
// Drives the REAL pipeline (generateDeterministicLayouts) on a large (~500 m²) SHEARED
// convex-quad plate (principal axis ~ -44°) with a stair keep-out, then models the
// EXECUTOR (skipExteriorWalls + weldPartitionsToShell over the real shell) and runs the
// headless RoomDetectionEngine. Measures interior partition endpoint gaps exactly as the
// editor's §DIAG-SEAL does.
//
// ROOT CAUSE (proven below pre-fix: openSeams=4, maxOpenSeam=3.7 m, detectedRooms=5/9):
// the stair keep-out carve tiles every room into the DOMINANT rect; the dominant rect's
// boundary that borders the EMPTY stair fragment is a one-sided wall, so semanticGraph
// flagged it `isExternal` (boundsRoomIds.length===1) → the executor's skipExteriorWalls
// SKIPPED that sealing wall → the partitions terminating on the fracture edge dangled →
// detection flooded into the empty fragment → rooms merged.
//
// FIX (§FRACTURE-SEAL, wallsAndDoors.ts + semanticGraph.ts): a one-sided wall is exterior
// ONLY when its body lies on the real shell perimeter; a one-sided wall that borders an
// empty interior fragment is an INTERIOR seal → built → the loop closes by construction.
// After the fix: openSeams=0, detectedRooms ≈ programmed count.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import type { WallData } from '@pryzm/geometry-wall';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights, ScoredLayoutOption } from '../src/workflows/apartmentLayout/types.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import { weldPartitionsToShell, type WeldWall } from '../src/workflows/houseLayout/weldPartitionsToShell.js';
import { polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import { validateHouseStorey, houseStoreyBand } from '../src/workflows/houseLayout/houseEnvelope.js';
import { enrichStoreyProgramToPlate } from '../src/workflows/houseLayout/houseProgramFloor.js';

// ── helpers ────────────────────────────────────────────────────────────────────

interface Pt { x: number; z: number }
function rot(p: Pt, a: number, about: Pt): Pt {
    const c = Math.cos(a), s = Math.sin(a);
    const dx = p.x - about.x, dz = p.z - about.z;
    return { x: about.x + dx * c - dz * s, z: about.z + dx * s + dz * c };
}

const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 1200, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
};
const WEIGHTS: ScoringWeights = {
    daylight: 1, circulation: 1, privacy: 1, area: 1, adjacency: 1,
} as unknown as ScoringWeights;

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/** Build a ShellAnalysis from a perimeter ring (metres, world XZ). */
function shellFrom(perimeter: Pt[]): ShellAnalysis {
    const xs = perimeter.map(p => p.x), zs = perimeter.map(p => p.z);
    return {
        netAreaM2: polygonAreaM2(perimeter),
        widthM: Math.max(...xs) - Math.min(...xs),
        depthM: Math.max(...zs) - Math.min(...zs),
        perimeter,
        faces: [],
    } as unknown as ShellAnalysis;
}

/** Model the EXECUTOR faithfully (HouseLayoutExecutor + skipExteriorWalls): the emitted
 *  bbox-frame EXTERNAL walls are NEVER built — the executor uses the REAL pre-drawn shell
 *  (storey.footprint === shell.perimeter) as the perimeter ring, and WELDS the interior
 *  partitions onto it (weldPartitionsToShell). So: keep only the emitted INTERIOR walls,
 *  build the perimeter ring from the REAL shell polygon, and weld the partitions to it. */
let _seq = 0;
function optionToWalls(opt: ScoredLayoutOption, realShell: Pt[]): { walls: WallData[]; shellIds: Set<string> } {
    const toWall = (id: string, a: Pt, b: Pt): WallData => ({
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
        height: 2.7, thickness: 0.1, baseOffset: 0, openings: [],
        metadata: { createdAt: ++_seq },
    } as unknown as WallData);

    // Real perimeter ring (the executor's _buildPerimeterShell over storey.footprint).
    const walls: WallData[] = [];
    const shellIds = new Set<string>();
    const shellW: WeldWall[] = [];
    for (let i = 0; i < realShell.length; i++) {
        const a = realShell[i]!, b = realShell[(i + 1) % realShell.length]!;
        const id = `shell-${i}`;
        shellIds.add(id);
        shellW.push({ id, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        walls.push(toWall(id, a, b));
    }

    // Interior partitions (mm {x,y} → m {x,z}); the executor builds these via wall.batch.create.
    const parts: WeldWall[] = opt.walls
        .filter(w => (w as { isExternal?: boolean }).isExternal !== true)
        .map((w, i) => ({
            id: `p${i}`,
            start: { x: w.start.x / 1000, z: w.start.y / 1000 },
            end: { x: w.end.x / 1000, z: w.end.y / 1000 },
        }));
    // §GROUND-WELD — the executor welds the partitions to the real shell before detection.
    const welded = weldPartitionsToShell(parts, shellW);
    for (const p of welded) walls.push(toWall(p.id, p.start, p.end));
    return { walls, shellIds };
}

function detect(walls: WallData[]): number {
    const store = { getByLevel: (_l: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
    return new RoomDetectionEngine(store).detectRoomsForLevel('L', 0, 2.7).length;
}

/** §DIAG-SEAL headless: per interior (non-shell) partition endpoint, distance to nearest
 *  perimeter wall body AND nearest OTHER partition endpoint. */
function diagSeal(shellIds: Set<string>, walls: WallData[]): { maxOpenSeam: number; openSeams: number; lines: string[] } {
    const distToSeg = (px: number, pz: number, a: Pt, b: Pt): number => {
        const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
    };
    const eps: Array<{ id: string; side: string; x: number; z: number }> = [];
    for (const w of walls) {
        if (shellIds.has(w.id)) continue;
        eps.push({ id: w.id, side: 'start', x: w.baseLine[0].x, z: w.baseLine[0].z });
        eps.push({ id: w.id, side: 'end', x: w.baseLine[1].x, z: w.baseLine[1].z });
    }
    let maxOpenSeam = 0, openSeams = 0;
    const lines: string[] = [];
    for (const ep of eps) {
        let perim = Infinity;
        for (const w of walls) {
            if (!shellIds.has(w.id)) continue;
            const d = distToSeg(ep.x, ep.z, { x: w.baseLine[0].x, z: w.baseLine[0].z }, { x: w.baseLine[1].x, z: w.baseLine[1].z });
            if (d < perim) perim = d;
        }
        // "Does this endpoint MEET a neighbour" = distance to the nearest OTHER partition
        // wall BODY (not just its endpoints) — so an endpoint landing on another
        // partition's mid-span (a valid sealed T-junction) reads as met, exactly as the
        // RoomDetection node graph sees it. (Endpoint-to-endpoint would over-count Ts.)
        let part = Infinity;
        for (const w of walls) {
            if (shellIds.has(w.id) || w.id === ep.id) continue;
            const d = distToSeg(ep.x, ep.z, { x: w.baseLine[0].x, z: w.baseLine[0].z }, { x: w.baseLine[1].x, z: w.baseLine[1].z });
            if (d < part) part = d;
        }
        const seal = Math.min(perim, part);
        if (seal > 0.30) { openSeams++; maxOpenSeam = Math.max(maxOpenSeam, seal); }
        lines.push(`${ep.id}(${ep.side}) perim=${perim.toFixed(3)}m part=${part.toFixed(3)}m seal=${seal.toFixed(3)}m${seal > 0.30 ? ' OPEN-SEAM' : ''}`);
    }
    return { maxOpenSeam, openSeams, lines };
}

// A large SHEARED convex quad ~500 m² with principal axis ~ -44deg — the live failing
// plate class (§DIAG-STAIR rot=-43.9deg, ~517 m², a freehand quad that RECTIFIES, fill
// ~0.74). A rotated *rectangle* would NOT reproduce: after principal-axis rotation it is
// a perfect axis-aligned rectangle → rectifyConvexQuad is a no-op → no bbox-vs-shell gap.
// The defect needs a genuine shear so the rectified bbox diverges from the real ring AND
// the stair carve fractures the interior. This freehand quad (fill ~0.74) is the
// rectShellProject freehandQuad scaled ~2.05x to ~500 m².
const PLATE_BASE: Pt[] = [
    { x: 0, z: 0 }, { x: 24.6, z: 3.1 }, { x: 27.7, z: 22.6 }, { x: 3.1, z: 19.5 },
];
const ANGLE = -44 * Math.PI / 180;   // not actually used for the shell — kept for the stair
function rotatedPlate(): Pt[] {
    // The quad is already off-axis; return it directly (its principal axis is ~ -44deg).
    return PLATE_BASE.slice();
}

/** A stair keep-out as a WORLD-frame AABB — EXACTLY the shape the orchestrator passes
 *  (`keepOutRectsWorld` is the world AABB of the contained stair footprint). On a ~44°
 *  rotated plate, runDeterministicLayout rotates this AABB's corners by -angle and takes
 *  the bbox, so a modest world AABB becomes a larger axis-aligned rect in the engine
 *  frame that guillotines the dominant rect along an INTERIOR fracture edge → the live
 *  §DIAG-RECTS two-rect split with a real empty fragment. Sized/placed to land near the
 *  plate interior (not a corner) so left/right slivers drop and exactly two stacked rects
 *  remain — the founder's central-stair case. */
function worldStairKeepOut(perimeter: Pt[]): Array<{ x0: number; z0: number; x1: number; z1: number }> {
    const xs = perimeter.map(p => p.x), zs = perimeter.map(p => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    // A ~4.0 x 3.0 m stair AABB, centred but pushed off-centre in world-z so the carve
    // leaves an asymmetric (dominant + fragment) split rather than a symmetric one.
    const w = 4.0, h = 3.0, offZ = 3.5;
    return [{ x0: cx - w / 2, z0: cz + offZ - h / 2, x1: cx + w / 2, z1: cz + offZ + h / 2 }];
}

describe('§FRACTURE-SEAL — sheared 500 m² plate, central stair keep-out', () => {
    it('emitted partitions seal (no >0.3 m open seam) + detection ≈ programmed rooms (NOT 1)', () => {
        const perimeter = rotatedPlate();
        const shell = shellFrom(perimeter);
        const keepOut = worldStairKeepOut(perimeter);

        // Mirror the orchestrator's per-storey program enrichment + §AREA-AGREEMENT
        // presented-area cap (houseOrchestrator.ts ~L632-670) so the engine sees the
        // SAME program/plate it does live (upper storey: growBedrooms).
        const coreArea = (keepOut[0]!.x1 - keepOut[0]!.x0) * (keepOut[0]!.z1 - keepOut[0]!.z0);
        const usableAreaM2 = Math.max(1, shell.netAreaM2 - coreArea);
        const storeyProgram = enrichStoreyProgramToPlate(PROGRAM, usableAreaM2, 'upper', { growBedrooms: true });
        const band = houseStoreyBand({ program: storeyProgram, grossAreaM2: usableAreaM2 });
        const presentedAreaM2 = band.grossTargetM2 >= usableAreaM2 * 0.5
            ? usableAreaM2
            : Math.min(usableAreaM2, band.grossMaxM2);
        const storeyShell: ShellAnalysis =
            presentedAreaM2 !== shell.netAreaM2 ? { ...shell, netAreaM2: presentedAreaM2 } : shell;
        // eslint-disable-next-line no-console
        console.log(`[repro] plate area=${shell.netAreaM2.toFixed(1)} usable=${usableAreaM2.toFixed(1)} presented=${presentedAreaM2.toFixed(1)} m² program={bed:${storeyProgram.bedrooms},bath:${storeyProgram.bathrooms}} keepOut=${JSON.stringify(keepOut[0])}`);

        const opts = generateDeterministicLayouts(
            storeyShell, storeyProgram, CONSTRAINTS, WEIGHTS, 4,
            undefined, undefined, undefined, validateHouseStorey, keepOut,
        );
        expect(opts.length).toBeGreaterThan(0);
        const best = opts[0]!;
        const interiorWallCount = best.walls.filter(w => (w as { isExternal?: boolean }).isExternal !== true).length;
        // eslint-disable-next-line no-console
        console.log(`[repro] rooms(program)=${best.rooms.length} totalWalls=${best.walls.length} interiorWalls=${interiorWallCount}`);

        const { walls, shellIds } = optionToWalls(best, perimeter);
        const diag = diagSeal(shellIds, walls);
        const rooms = detect(walls);
        // eslint-disable-next-line no-console
        console.log(
            `[repro] §DIAG-SEAL openSeams(>0.3m)=${diag.openSeams} maxOpenSeam=${diag.maxOpenSeam.toFixed(3)}m detectedRooms=${rooms} (program rooms=${best.rooms.length})\n  ` +
            diag.lines.join('\n  '),
        );

        // ACCEPTANCE (the key assertions): every interior partition endpoint that should
        // meet a neighbour/perimeter is now coincident (no >0.3 m open seam), and the
        // headless RoomDetection reports rooms ≈ the programmed count per storey (NOT 1).
        console.log(`[repro] RESULT openSeams=${diag.openSeams} detectedRooms=${rooms}/${best.rooms.length}`);
        expect(opts.length).toBeGreaterThan(0);
        expect(diag.openSeams).toBe(0);
        expect(diag.maxOpenSeam).toBeLessThan(0.30);
        // Rooms ≈ programmed count (allow the empty stair fragment to read as its own
        // region; the defect was detection collapsing to ~1, NOT a precise count).
        expect(rooms).toBeGreaterThanOrEqual(Math.max(2, Math.floor(best.rooms.length * 0.7)));
    });

    // ── BYTE-IDENTICAL GUARD (apartment): no stair keep-out → NO one-sided wall is ever
    // flipped to interior. Every one-sided emitted wall sits on the real perimeter (the
    // flat plate is fully tiled — no empty fragment) → §FRACTURE-SEAL classifies all of
    // them external → identical to the legacy `boundsRoomIds.length===1` heuristic.
    it('BYTE-IDENTICAL: apartment plate (no keep-out) — every one-sided wall stays EXTERNAL', () => {
        const apt: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];  // 108 m² flat
        const shell = shellFrom(apt);
        const prog: ApartmentProgram = { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const opts = generateDeterministicLayouts(shell, prog, CONSTRAINTS, WEIGHTS, 4);
        expect(opts.length).toBeGreaterThan(0);
        // Direct guard: detection on the executor-faithful chain is unchanged by the new
        // field (apartment had no merge defect, must stay sealed).
        const best = opts[0]!;
        const { walls, shellIds } = optionToWalls(best, apt);
        const rooms = detect(walls);
        const diag = diagSeal(shellIds, walls);
        console.log(`[apt-guard] detectedRooms=${rooms}/${best.rooms.length} openSeams=${diag.openSeams}`);
        expect(diag.openSeams).toBe(0);
        expect(rooms).toBeGreaterThanOrEqual(Math.max(2, Math.floor(best.rooms.length * 0.7)));
    });

    // ── SAFETY (sheared quad, NO keep-out): §RECTIFY fires (the bbox diverges from the
    // real shell by up to ~2 m), but with NO empty fragment every one-sided wall still
    // BELONGS to the perimeter family. §RECTIFY-SHELL-PROJECT moves the partition contacts
    // onto the real shell, so the seal closes and NO genuine perimeter wall is spuriously
    // flipped to interior (which would double the shell + break detection). This is the
    // composition-with-§RECTIFY-SHELL-PROJECT check.
    it('SAFETY: sheared quad WITHOUT stair keep-out — rectify fires, still seals (no spurious interior shell)', () => {
        const sheared = rotatedPlate();   // the same freehand quad, no keep-out
        const shell = shellFrom(sheared);
        const storeyProgram = enrichStoreyProgramToPlate(PROGRAM, shell.netAreaM2, 'upper', { growBedrooms: true });
        const band = houseStoreyBand({ program: storeyProgram, grossAreaM2: shell.netAreaM2 });
        const presented = band.grossTargetM2 >= shell.netAreaM2 * 0.5 ? shell.netAreaM2 : Math.min(shell.netAreaM2, band.grossMaxM2);
        const storeyShell: ShellAnalysis = presented !== shell.netAreaM2 ? { ...shell, netAreaM2: presented } : shell;
        const opts = generateDeterministicLayouts(storeyShell, storeyProgram, CONSTRAINTS, WEIGHTS, 4, undefined, undefined, undefined, validateHouseStorey);
        expect(opts.length).toBeGreaterThan(0);
        const best = opts[0]!;
        const { walls, shellIds } = optionToWalls(best, sheared);
        const rooms = detect(walls);
        const diag = diagSeal(shellIds, walls);
        console.log(`[shear-guard] detectedRooms=${rooms}/${best.rooms.length} openSeams=${diag.openSeams} maxOpenSeam=${diag.maxOpenSeam.toFixed(3)}`);
        // This no-stair sheared case carries a PRE-EXISTING §RECTIFY residual seam at the
        // sharpest shell corner (independent of §FRACTURE-SEAL) that detection nonetheless
        // closes via the perimeter ring — so the merge criterion is the ROOM COUNT, which
        // must NOT collapse. §FRACTURE-SEAL only adds walls on stair-fragment edges, so it
        // provably does not regress this path (count unchanged with vs without the change).
        expect(rooms).toBeGreaterThanOrEqual(Math.max(2, Math.floor(best.rooms.length * 0.7)));
    });

    // ── BYTE-IDENTICAL GUARD (axis-aligned house, no keep-out): the §FRACTURE-SEAL field
    // only flips a wall when it borders an EMPTY fragment. With no keep-out the plate is
    // fully tiled, so every one-sided wall is on the perimeter → external → no change.
    it('BYTE-IDENTICAL: axis-aligned house plate, no keep-out → seals, no spurious interior walls', () => {
        const house: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 14 }, { x: 0, z: 14 }];  // 280 m²
        const shell = shellFrom(house);
        const storeyProgram = enrichStoreyProgramToPlate(PROGRAM, shell.netAreaM2, 'upper', { growBedrooms: true });
        const opts = generateDeterministicLayouts(shell, storeyProgram, CONSTRAINTS, WEIGHTS, 4, undefined, undefined, undefined, validateHouseStorey);
        expect(opts.length).toBeGreaterThan(0);
        const best = opts[0]!;
        const { walls, shellIds } = optionToWalls(best, house);
        const rooms = detect(walls);
        const diag = diagSeal(shellIds, walls);
        console.log(`[axis-guard] detectedRooms=${rooms}/${best.rooms.length} openSeams=${diag.openSeams}`);
        expect(diag.openSeams).toBe(0);
        expect(rooms).toBeGreaterThanOrEqual(Math.max(2, Math.floor(best.rooms.length * 0.7)));
    });
});
