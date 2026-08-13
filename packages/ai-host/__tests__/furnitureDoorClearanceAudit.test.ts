// §CIRCULATION-INTEGRITY-AUDIT — DEFECT 3: "furniture in front of a door".
//
// Companion to `circulationIntegrityAudit.test.ts` (defects 1+2). Drives the REAL furnisher
// `furnishRoom` (C74 §3.4) over a deterministic room × door sweep and measures intrusion
// into the door clearance against TWO different keep-out definitions:
//
//   A. `doorObstacles` — the box the placement solver ACTUALLY consults
//      (`placeSolver.ts:165`): a symmetric rectangle, door-width wide × max(width, 0.9) m
//      deep, deliberately NOT widened past the jambs (widening regressed the wardrobe run).
//   B. `makeSwingSector` / `rectIntersectsSwing` — the REAL 90° swing arc
//      (`doorSwingKeepout.ts`), radius = leaf width, hinged on one jamb.
//
// The gap between A and B is the defect surface. B is authored, unit-tested, and HARD by
// design (`rejectFurnitureClashingDoors` DROPS clashing items) — and is imported by NOTHING
// in the repo except its own unit test. It is authored-but-unwired: the root cause is that
// `Door.swing` exists on the schema (`packages/schemas/src/elements/Door.ts`) but is dropped
// at the wall-opening boundary, so `OpeningPose` carries no hinge side and the sector
// geometry has no data to run on. `placeSolver.ts:184-185` says exactly this in a comment.
//
// This probe MEASURES that gap rather than asserting it away. Because the swing side is
// genuinely unknown at this layer, arm B tests BOTH hinge choices and reports the
// EITHER-SIDE intrusion rate (a real installation picks one; the generator cannot say which,
// which is itself the finding).

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { footprintCorners, quadsOverlap } from '../src/workflows/furnishLayout/collision.js';
import { makeSwingSector, rectIntersectsSwing } from '../src/workflows/furnishLayout/doorSwingKeepout.js';
import type { RectXZ } from '../src/workflows/furnishLayout/doorSwingKeepout.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';

/** A w×d rectangular room with ONE door of `doorW` centred on the chosen wall. */
function room(
    occupancy: string, w: number, d: number,
    wall: 'z0' | 'z1' | 'x0' | 'x1', doorW: number,
): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    const door =
        wall === 'z0' ? { center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 } }
        : wall === 'z1' ? { center: { x: w / 2, z: d }, normal: { x: 0, z: -1 } }
        : wall === 'x0' ? { center: { x: 0, z: d / 2 }, normal: { x: 1, z: 0 } }
        : { center: { x: w, z: d / 2 }, normal: { x: -1, z: 0 } };
    return {
        roomId: `r-${occupancy}-${wall}`, levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: door.center, normal: door.normal, width: doorW }],
        windows: [], levelElevation: 0,
    };
}

/** EXACT mirror of `placeSolver.doorObstacles` (the box placement really consults). */
function solverDoorQuad(dr: { center: Pt; normal: Pt; width: number }) {
    const swingR = Math.max(dr.width, 0.9);
    const c = { x: dr.center.x + dr.normal.x * (swingR / 2), z: dr.center.z + dr.normal.z * (swingR / 2) };
    return footprintCorners(c.x, c.z, dr.width, swingR, Math.atan2(dr.normal.x, dr.normal.z));
}

const itemQuad = (p: PlacedFurniture) =>
    footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);

/** An axis-aligned bbox around the item's rotated footprint — `rectIntersectsSwing` takes a
 *  RectXZ (`minX/minZ/maxX/maxZ`), so this is the CONSERVATIVE (over-reporting) reading. */
function itemRect(p: PlacedFurniture): RectXZ {
    const q = itemQuad(p);
    const xs = q.map(c => c.x), zs = q.map(c => c.z);
    return { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) };
}

/** A floor obstacle: on the floor and not the collision-exempt rug. */
const isFloorItem = (p: PlacedFurniture): boolean =>
    p.kind !== 'rug' && (p.footprint.baseOffset ?? 0) <= 0.01;

interface Row {
    readonly label: string;
    readonly items: number;
    readonly boxHits: string[];
    readonly swingHitsEitherSide: string[];
    readonly swingHitsBothSides: string[];
}

describe('§CIRCULATION-INTEGRITY-AUDIT — DEFECT 3: furniture blocking a door', () => {
    it('measures intrusion under BOTH the wired box and the real swing sector', () => {
        const occupancies = ['bedroom', 'living-room', 'dining-room', 'bathroom', 'kitchen', 'study'];
        const sizes: Array<[number, number]> = [[4, 3], [5, 4], [3, 2.5], [3.5, 5]];
        const walls: Array<'z0' | 'z1' | 'x0' | 'x1'> = ['z0', 'z1', 'x0', 'x1'];
        const doorWidths = [0.9, 1.0, 1.2];

        const rows: Row[] = [];
        for (const occ of occupancies) for (const [w, d] of sizes)
            for (const wall of walls) for (const dw of doorWidths) {
                const inp = room(occ, w, d, wall, dw);
                let placed: PlacedFurniture[];
                try { placed = furnishRoom(inp); } catch { continue; }
                const floor = placed.filter(isFloorItem);
                const dr = inp.doors[0]!;

                const boxQ = solverDoorQuad(dr);
                const boxHits = floor.filter(p => quadsOverlap(itemQuad(p), boxQ)).map(p => p.kind);

                // The leaf lies IN the wall plane; hinge on either jamb, sweeping into the room.
                const along = { x: -dr.normal.z, z: dr.normal.x };          // unit, along the wall
                const half = dr.width / 2;
                const jambA: Pt = { x: dr.center.x - along.x * half, z: dr.center.z - along.z * half };
                const jambB: Pt = { x: dr.center.x + along.x * half, z: dr.center.z + along.z * half };
                // hingeToLatch points from the hinge jamb toward the other jamb.
                const sectorA = makeSwingSector(jambA, along, dr.width, 1);
                const sectorA2 = makeSwingSector(jambA, along, dr.width, -1);
                const sectorB = makeSwingSector(jambB, { x: -along.x, z: -along.z }, dr.width, 1);
                const sectorB2 = makeSwingSector(jambB, { x: -along.x, z: -along.z }, dr.width, -1);
                // Pick, per jamb, the sweep that goes INTO the room (the one whose mid-arc point
                // lands on the inward-normal side of the wall line).
                const intoRoom = (s: ReturnType<typeof makeSwingSector>): boolean => {
                    const mid = s.startRad + s.sweepRad / 2;
                    const px = s.hinge.x + Math.cos(mid) * s.radiusM - dr.center.x;
                    const pz = s.hinge.z + Math.sin(mid) * s.radiusM - dr.center.z;
                    return px * dr.normal.x + pz * dr.normal.z > 0;
                };
                const swingA = intoRoom(sectorA) ? sectorA : sectorA2;
                const swingB = intoRoom(sectorB) ? sectorB : sectorB2;

                const hitsA = new Set(floor.filter(p => rectIntersectsSwing(itemRect(p), swingA)).map(p => p.kind));
                const hitsB = new Set(floor.filter(p => rectIntersectsSwing(itemRect(p), swingB)).map(p => p.kind));
                const either = [...new Set([...hitsA, ...hitsB])].sort();
                const both = [...hitsA].filter(k => hitsB.has(k)).sort();

                rows.push({
                    label: `${occ} ${w}x${d} ${wall} d${dw}`,
                    items: floor.length, boxHits, swingHitsEitherSide: either, swingHitsBothSides: both,
                });
            }

        const withBox = rows.filter(r => r.boxHits.length > 0);
        const withEither = rows.filter(r => r.swingHitsEitherSide.length > 0);
        const withBoth = rows.filter(r => r.swingHitsBothSides.length > 0);
        const pct = (n: number): string => `${((n / Math.max(1, rows.length)) * 100).toFixed(0)}%`;
        const kinds = (rs: Row[], f: (r: Row) => readonly string[]): string => {
            const c = new Map<string, number>();
            for (const r of rs) for (const k of f(r)) c.set(k, (c.get(k) ?? 0) + 1);
            return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ') || '(none)';
        };

        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · furnishLayout] ${rows.length} (occupancy × size × ` +
            'wall × door-width) rooms through the REAL furnishRoom:\n' +
            `  A. intrudes the WIRED box (placeSolver.doorObstacles):        ${withBox.length}/${rows.length} (${pct(withBox.length)})\n` +
            `       offenders: ${kinds(withBox, r => r.boxHits)}\n` +
            `  B. intrudes the REAL 90° swing arc on EITHER hinge:           ${withEither.length}/${rows.length} (${pct(withEither.length)})\n` +
            `       offenders: ${kinds(withEither, r => r.swingHitsEitherSide)}\n` +
            `  B′. intrudes the arc on BOTH hinges (blocked whichever way): ${withBoth.length}/${rows.length} (${pct(withBoth.length)})\n` +
            `       offenders: ${kinds(withBoth, r => r.swingHitsBothSides)}\n` +
            '  NOTE B/B′ use the item AABB (rectIntersectsSwing takes a RectXZ), so they\n' +
            '  OVER-report a rotated footprint. B′ is the conservative floor: a real door hinged\n' +
            '  either way is blocked. The A/B gap is the unwired-sector defect surface.\n',
        );

        expect(rows.length).toBeGreaterThanOrEqual(200);
        // The WIRED keep-out is a hard reject in the solver, so it must hold at 0 — if this
        // ever goes non-zero the solver itself regressed, independently of the sector gap.
        expect(withBox.length).toBe(0);
    }, 300_000);

    // ARM C — the COLLISION-EXEMPT paths. `placeSolver` deliberately skips several placement
    // routes: the rug (`placeUnder` — "neither tested against obstacles NOR added as one"),
    // wall-hosted accessories (`placeOnLeaderWall`), and `placeBedsideLamps`, which
    // `furnishRoom.ts:93` calls WITHOUT the obstacle set (the integrated-bed branch one line
    // above DOES pass it). A rug across a threshold is cosmetic; a floor lamp in the swing is
    // not. This arm measures what the exemptions actually let through.
    it('measures door intrusion by COLLISION-EXEMPT items (rug / wall-hosted / bedside)', () => {
        const occupancies = ['bedroom', 'living-room', 'dining-room', 'bathroom', 'kitchen', 'study'];
        const sizes: Array<[number, number]> = [[4, 3], [5, 4], [3, 2.5], [3.5, 5]];
        const walls: Array<'z0' | 'z1' | 'x0' | 'x1'> = ['z0', 'z1', 'x0', 'x1'];
        let rooms = 0;
        const byKind = new Map<string, number>();
        for (const occ of occupancies) for (const [w, d] of sizes) for (const wall of walls) {
            const inp = room(occ, w, d, wall, 0.9);
            let placed: PlacedFurniture[];
            try { placed = furnishRoom(inp); } catch { continue; }
            rooms++;
            const boxQ = solverDoorQuad(inp.doors[0]!);
            for (const p of placed) {
                if (isFloorItem(p)) continue;                    // covered by arm A
                if (!quadsOverlap(itemQuad(p), boxQ)) continue;
                byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
            }
        }
        const total = [...byKind.values()].reduce((a, b) => a + b, 0);
        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · furnishLayout EXEMPT PATHS] ${rooms} rooms:\n` +
            `  exempt items intruding the WIRED door box: ${total}\n` +
            `  by kind: ${[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ') || '(none)'}\n`,
        );
        expect(rooms).toBeGreaterThan(0);
    }, 300_000);

    // C70 §5.6 — watch the instrument go RED. A deliberately door-blocking item must be
    // reported by BOTH keep-out definitions; remove it and both go quiet.
    it('both keep-out predicates go RED on a deliberately blocking item (negative control)', () => {
        const inp = room('bedroom', 4, 3, 'z0', 0.9);
        const dr = inp.doors[0]!;
        // A 1.0 × 0.6 m box parked squarely 0.3 m in front of the leaf.
        const blocker = { x: dr.center.x, z: dr.center.z + 0.3, w: 1.0, l: 0.6, yaw: 0 };
        const bq = footprintCorners(blocker.x, blocker.z, blocker.w, blocker.l, blocker.yaw);
        expect(quadsOverlap(bq, solverDoorQuad(dr))).toBe(true);

        const along = { x: -dr.normal.z, z: dr.normal.x };
        const hinge: Pt = { x: dr.center.x - along.x * (dr.width / 2), z: dr.center.z - along.z * (dr.width / 2) };
        const sector = makeSwingSector(hinge, along, dr.width, 1);
        const sectorAlt = makeSwingSector(hinge, along, dr.width, -1);
        const rect: RectXZ = {
            minX: blocker.x - blocker.w / 2, maxX: blocker.x + blocker.w / 2,
            minZ: blocker.z - blocker.l / 2, maxZ: blocker.z + blocker.l / 2,
        };
        expect(rectIntersectsSwing(rect, sector) || rectIntersectsSwing(rect, sectorAlt)).toBe(true);

        // Restore: move it to the far corner and both predicates go quiet.
        const farQ = footprintCorners(3.5, 2.6, blocker.w, blocker.l, 0);
        expect(quadsOverlap(farQ, solverDoorQuad(dr))).toBe(false);
        const farRect: RectXZ = { minX: 3.0, maxX: 4.0, minZ: 2.3, maxZ: 2.9 };
        expect(rectIntersectsSwing(farRect, sector)).toBe(false);
        expect(rectIntersectsSwing(farRect, sectorAlt)).toBe(false);
    });
});
