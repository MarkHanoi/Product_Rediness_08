/**
 * L-932 — MOVE AN **ANGLED** WALL: DO THE MUTUAL CORNERS RE-FORM AT EVERY ANGLE?
 *
 * ─── THE LEAD THE ROW OPENED WITH, AND WHY IT IS REFUTED ─────────────────────
 *
 * L-932's smoking gun was three console lines, one per wall:
 *
 *     [WallTransform] Wall "wall_01M05RG…" — gizmo aligned with direction N
 *
 * read as "every wall, whatever its angle, gets a gizmo aligned to cardinal
 * North", from which the hypothesis followed that the APPLIED TRANSLATION is a
 * cardinal axis rather than the wall's normal.
 *
 * **That is not what the line says.** `WallTransformController.activateFor`
 * ends:
 *
 *     console.log(`[WallTransform] Wall "${id}" — gizmo aligned with direction`,
 *                 wallDir);          // ← a THREE.Vector3 OBJECT, not a string
 *
 * There is no cardinal label anywhere in that call: `wallDir` is the wall's own
 * unit direction `(dx/len, 0, dz/len)`. `N` is the MINIFIED CONSTRUCTOR NAME of
 * `THREE.Vector3` in the production bundle — which is why all three walls print
 * the same token regardless of angle. (Confirmed against `dist/`: the same call
 * site there reads `new w(s/a,0,r/a)` … `console.log(…, l)`; the letter differs
 * per build, the phenomenon does not.)
 *
 * The gizmo is in fact correctly wall-local (`setFromUnitVectors(X, wallDir)` +
 * `setSpace('local')`), and `registerTransformDragHandler` commits a TRUE world
 * delta — `dx = obj.position.x - oldStart.x`, applied to BOTH endpoints. So the
 * move that reaches `UPDATE_WALL_BASELINE` is a faithful rigid translation at
 * any angle, and the "offset varies along the wall" half of the hypothesis is
 * false too: a translation has no such variation. **THE LEAD IS DEAD, and the
 * defect was downstream.**
 *
 * ─── WHAT IS ACTUALLY ANGLE-DEPENDENT — A LAW, NOT A GUESS ───────────────────
 *
 * Let the mover W translate PERPENDICULAR to itself by `m`, and let θ be the
 * angle between W's line and a corner partner P's line. Then, exactly:
 *
 *     the new corner slides ALONG P    by   m / sin θ
 *     the new corner slides ALONG W    by   m · |cot θ|
 *
 * At θ = 90° the second quantity is **ZERO** — the new corner lands exactly on
 * W's translated endpoint — and the first is exactly `m`. Every proximity gate
 * in `computeMoveReweldPlan` compared those displacements against `weldTol` and
 * `movedDisplacement + weldTol`, i.e. against the values the law takes at 90°
 * AND NOWHERE ELSE. **An orthogonal fixture cannot fail that way and gives a
 * FALSE GREEN**, which is why the CONTROL below is labelled as a control and
 * not as proof. As θ falls, `cot θ` grows without bound (bounded here only by
 * the engine's own MIN_ANGLE_RAD ≈ 5.7°, i.e. |cot θ| ≤ ~10).
 *
 * ─── ⚠ THE ASSERTIONS IN THIS FILE HAVE NOW FLIPPED THREE TIMES ──────────────
 *
 * Keep this note. It is the only thing standing between the next reader and a
 * fourth flip.
 *
 *   ORIGINAL           the neighbour at a broken corner LENGTHENS/SHORTENS to
 *                      the new line intersection — it FOLLOWS.
 *   2026-08-15 §10.2.2 REVERSED. `19ddf6bb` read C83 §10.2.2 — *"a re-weld MUST
 *                      NOT close a joint by moving a non-subject wall's
 *                      baseline"* — as universal. Neighbours became
 *                      byte-identical incumbents; the open joint was REFUSED
 *                      and reported rather than closed.
 *   2026-08-17 §10.6   RE-REVERSED, **for MUTUAL corners only** (L-942).
 *
 * ⭐ WHY THE FLIP-FLOP HAPPENED, stated so it does not happen again. §10.2.2 was
 * minted from L-922, where an INTERIOR wall's move dragged a PERIMETER baseline
 * 2.19 m and re-seated three hosted doors by one delta. That junction is a `T`
 * at degree 3 — an incumbent with a third party's stake in it — and §10.2.2 is
 * exactly right about it. It was OVER-BROAD about a 2-wall `L`, because at the
 * time NOTHING IN THE ENGINE COULD TELL THE TWO APART: a mutual corner and a
 * terminating corner are geometrically THE SAME PICTURE, the discriminator was
 * stored on the `joinedTo` edge, and `getJoinedWalls` returned `joinedWallIds`
 * alone and binned it. After the c2e8ba00 deploy that over-breadth hard-blocked
 * EVERY junction-breaking wall move in production (L-942).
 *
 * With `junctionType` / `junctionDegree` threaded through to
 * `MoveReweldPartner`, the two cases separate BY MEASUREMENT: interior↔interior
 * reads `L`/2 and FOLLOWS; interior↔perimeter reads `T`/3 and does not. The
 * follow is a PIVOT (§10.6.2 condition 4): the welded endpoint goes to the
 * analytic intersection, the FAR endpoint is untouched, the direction is
 * unchanged. That is what makes it not-L-922 — L-922 moved `baseLine[0]`
 * wholesale, the datum every hosted opening's offset is measured from.
 *
 * The complementary controls live where the fixture varies exactly one thing:
 *   • `wallMoveReweldSeam.test.ts` — same orthogonal loop, T/degree-3 instead of
 *     L/2 → neighbours byte-identical (the LOAD-BEARING L-922 control), plus the
 *     ABSENT-metadata arm (§10.6.3 #1 / C70 L-INV-1: absent ⇒ DO NOT FOLLOW).
 *   • §T/3 AT 30° in this file — the same discriminator control, run at an ANGLE,
 *     which the orthogonal one cannot reach.
 *
 * ─── THE FIXTURE, AND WHY THESE NUMBERS ──────────────────────────────────────
 *
 * A rectangle with one corner chamfered, so the mover is NON-AXIS-ALIGNED and
 * NOT at 45° (45° is symmetric in x and z and would hide a basis error):
 *
 *      (0,8) ─────────────── (12−√3, 8)          w-north   (horizontal)
 *        │                      ╲                w-angle   ← THE MOVER
 *        │                       ╲                          dir (−√3, 3), |d| = 2√3
 *        │                     (12,5)            w-east    (vertical)
 *        │                        │
 *      (0,0) ─────────────────(12,0)             w-south
 *
 * W's line makes **30°** with w-east's line and **60°** with w-north's — two
 * different cot values in ONE gesture, so a single fixture separates "the code
 * is angle-blind" from "the code is broken everywhere". Moving W inward by
 * m = 0.6 m along its own normal n̂ = (−√3/2, −1/2) predicts:
 *
 *     corner with w-east  slides along W by 0.6 · cot 30° = 1039.2 mm
 *     corner with w-north slides along W by 0.6 · cot 60° =  346.4 mm
 *
 * `weldTol` is `DEFAULT_SNAP_RADIUS` = 500 mm. MEASURED BEFORE THE L-932 FIX:
 * the 60° junction re-formed and the 30° junction was DROPPED — silently, by a
 * bare `continue`, with no `MoveReweldRefusal` — leaving the joint open by the
 * mover's full 600 mm, 520 mm off w-east's body, outside room detection's
 * 200 mm `hostSnap` floor, and the room went 93.40 m² → NO ROOM AT ALL. That is
 * the founder's 782 mm class of number and their trace's shape exactly: the
 * cascade RAN, and a gap survived it.
 *
 * ─── WHAT THIS FILE ASSERTS, AND AT WHICH LAYER ──────────────────────────────
 *
 * STORED baselines, read back from the REAL `WallStore` after the REAL
 * `UpdateWallBaselineCommand` → `WallMoveReweldService` →
 * `CascadeWallBaselineCommand` chain, plus the REAL `ReDetectRoomsCommand` room
 * set and its area. Never a pure function's return value — this repository has
 * shipped four "fixed" defects that could not run, and this family has been
 * reported five times.
 *
 * Every expected coordinate below is DERIVED IN THE TEST from the fixture's own
 * numbers by intersecting two infinite lines (`lineIntersect`), never copied out
 * of a run. Alongside each seat, three properties the seat alone does not prove:
 * the partner's FAR endpoint is byte-identical, its DIRECTION is unchanged, and
 * THE LOOP IS STILL CLOSED. Earlier files in this family asserted only where
 * walls SAT and never that the building still closed.
 *
 * @file packages/command-registry/__tests__/L932AngledWallMove.measure.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { WallMoveReweldService } from '@pryzm/geometry-wall';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';
import { RoomStore } from '@pryzm/room-topology';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    CascadeWallBaselineCommand,
    isCascadeWallBaselineApplying,
} from '../src/walls/CascadeWallBaselineCommand';

const LEVEL = 'L0';
const SQRT3 = Math.sqrt(3);

// ── harness (same shape as wallMoveReweldSeam.test.ts — real stores, real
//    commands; the joinedTo edges the coordinator flush writes in production
//    are seeded through the SAME graph API it calls, ADR-0321 §CONNECT-3) ─────

function makeLevelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function makeBimManager() {
    const registered = new Set<string>();
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: (id: string) => { registered.add(id); },
        unregisterElement: (id: string) => { registered.delete(id); },
    };
}

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number], thickness = 0.2): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

interface World {
    wallStore: WallStore;
    roomStore: RoomStore;
    cm: CommandManager;
    reweldService: WallMoveReweldService;
    dispose(): void;
}

function makeWorld(): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const roomStore = new RoomStore(new ProjectContext() as never, bimManager as never);
    const ctx = { stores: { wallStore, roomStore }, bimManager } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    // WallFaceResolver reads this global in production (WallFaceResolver.ts:37).
    Object.assign(window, { wallStore });

    const reweldService = new WallMoveReweldService(wallStore, {
        commandManagerRef: { current: cm },
        makeCascadeCommand: (input) => new CascadeWallBaselineCommand(input),
        getJoinedWalls: (wallId) => semanticGraphManager.getJoinedWalls(wallId),
        isCascadeApplying: isCascadeWallBaselineApplying,
    });

    return {
        wallStore, roomStore, cm, reweldService,
        dispose() {
            reweldService.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

/**
 * Seed the `joinedTo` edges the WallRebuildCoordinator flush writes in
 * production, WITH the §10.6 discriminator, through the SAME graph API it calls.
 *
 * ⚠ The junction stamp is a PARAMETER, not a constant, because it is the ONLY
 * variable that separates the follow from L-922's forbidden drag. `L`/2 =
 * MUTUAL (interior↔interior, jointly owned, follows). `T`/3 = an INCUMBENT with
 * a third party's stake (does not follow). Absent ⇒ do not follow — that arm is
 * pinned in `wallMoveReweldSeam.test.ts`, which owns the no-metadata control.
 */
function seedJoinedTo(
    wallIds: string[],
    pairs: Array<[string, string] | { type: 'L' | 'T'; wallIds: [string, string] }>,
): void {
    semanticGraphManager.replaceJoinedToForLevelWalls(
        wallIds,
        pairs.map(p => {
            const j = Array.isArray(p) ? { type: 'L' as const, wallIds: p } : p;
            return {
                junctionType: j.type,
                junctionDegree: j.type === 'L' ? 2 : 3,
                wallIds: j.wallIds as [string, string],
            };
        }),
    );
}

type XZ = [number, number];

const bl2 = (world: World, id: string): [XZ, XZ] => {
    const b = world.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

/** BYTE-identical comparison of one stored endpoint. §10.6.2 condition 4 asks
 *  for "untouched", and `near()` would pass a small drag; small drags across
 *  gestures accumulate into exactly L-922's 2.19 m. */
const ptJson = (world: World, id: string, idx: 0 | 1): string =>
    JSON.stringify(world.wallStore.getById(id)!.baseLine[idx]);
const blJson = (world: World, id: string): string =>
    JSON.stringify(world.wallStore.getById(id)!.baseLine);

/** Distance from p to the SEGMENT [a,b] — the physical "is the joint closed?". */
function distToSegment(p: XZ, a: XZ, b: XZ): number {
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}

const mm = (m: number): number => Math.round(m * 1000);

/** Nearest-endpoint distance — the "dangling gap" §DIAG-PARTITION-REACH reports. */
function cornerGap(p: XZ, a: XZ, b: XZ): number {
    return Math.min(Math.hypot(p[0] - a[0], p[1] - a[1]), Math.hypot(p[0] - b[0], p[1] - b[1]));
}

/**
 * ⭐ THE EXPECTED VALUE, DERIVED — intersection of the two INFINITE lines
 * through (a1,a2) and (b1,b2).
 *
 * §10.6.2 says the mutual partner's welded endpoint goes to "the analytic
 * intersection of its own line with the mover's NEW line". That sentence IS this
 * function, so every expected coordinate below is computed from the fixture's
 * own authored numbers and the drag vector — never lifted from a run. A test
 * whose expectations are copied out of the implementation's output asserts the
 * implementation, not the requirement.
 */
function lineIntersect(a1: XZ, a2: XZ, b1: XZ, b2: XZ): XZ {
    const dax = a2[0] - a1[0], daz = a2[1] - a1[1];
    const dbx = b2[0] - b1[0], dbz = b2[1] - b1[1];
    const cross = dax * dbz - daz * dbx;
    expect(Math.abs(cross)).toBeGreaterThan(1e-9); // the fixture must not be parallel
    const t = ((b1[0] - a1[0]) * dbz - (b1[1] - a1[1]) * dbx) / cross;
    return [a1[0] + dax * t, a1[1] + daz * t];
}

/** Directed angle of a stored wall, for "the partner PIVOTED, it did not rotate". */
const dirOf = (b: [XZ, XZ]): number => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);

/** Signed-area magnitude of a ring — the room area the engine reports is the
 *  CENTRELINE polygon's (measured: the authored chamfer ring gives 93.40 m²,
 *  and `ReDetectRoomsCommand` logs 93.40). */
function shoelace(ring: XZ[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        a += ring[i]![0] * ring[j]![1] - ring[j]![0] * ring[i]![1];
    }
    return Math.abs(a) / 2;
}

/**
 * ⭐ THE BUILDING STILL CLOSES. Asserts every consecutive corner of a wall ring
 * is coincident. `walls` is given in loop order as [id, startsAtPreviousCorner],
 * because stored winding is an authoring accident (w-north runs EAST→WEST, and
 * assuming reading order is what made an earlier draft of this assertion fail
 * against correct geometry).
 */
function expectLoopClosed(world: World, corners: Array<{ from: [string, 0 | 1]; to: [string, 0 | 1] }>): void {
    for (const { from, to } of corners) {
        const a = bl2(world, from[0])[from[1]];
        const b = bl2(world, to[0])[to[1]];
        const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
        expect(
            gap,
            `loop OPEN at ${from[0]}[${from[1]}]→${to[0]}[${to[1]}]: ${mm(gap)}mm`,
        ).toBeLessThan(1e-9);
    }
}

/** Commit a whole-wall rigid translation through the REAL move command —
 *  exactly what `registerTransformDragHandler` dispatches on gizmo drag-end. */
function moveWall(world: World, id: string, dx: number, dz: number) {
    const w = world.wallStore.getById(id)!;
    return world.cm.execute(new UpdateWallBaselineCommand({
        wallId: id,
        newBaseLine: [
            { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z + dz },
            { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z + dz },
        ],
    }));
}

function redetect(world: World): Array<{ id: string; area: number }> {
    const res = world.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
    expect(res.success).toBe(true);
    return world.roomStore.getByLevel(LEVEL)
        .map(r => ({ id: r.id, area: r.computed?.area ?? 0 }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

// ── lifecycle ────────────────────────────────────────────────────────────────

let world: World | undefined;

beforeEach(() => {
    semanticGraphManager.clear();
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    for (const w of windowStore.getAll()) windowStore.remove(w.id);
});

afterEach(() => {
    world?.dispose();
    world = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// CONTROL — the ORTHOGONAL gesture, and WHY IT CANNOT PROVE L-932.
// ════════════════════════════════════════════════════════════════════════════

describe('L-932 CONTROL — an ORTHOGONAL wall move, where the angle law is DEGENERATE', () => {
    /**
     * ⚠ RE-SCOPED 2026-08-17 (§10.6). READ THIS BEFORE RESTORING THE OLD SHAPE.
     *
     * This control's PREMISE changed, so its assertions had to change with it —
     * renumbering them would have left a true assertion under a false name.
     *
     *   AS WRITTEN (pre-§10.6) it asserted `cornerGap > 0.5` and explained that
     *   the orthogonal case survives a 600 mm drag ONLY because the mover's
     *   endpoint slides ALONG the partner's body rather than off it — the joint
     *   degrades from a corner to a T-abutment and §DIAG-PARTITION-REACH
     *   reconnects it. Its finding was: *the corner was never restored here
     *   either; the failure was always there, it was always MASKED.*
     *
     *   NOW the corner IS restored, because these four perimeter junctions are
     *   stamped `L`/degree-2 — MUTUAL — and a mutual partner pivots to the
     *   analytic intersection (§10.6.2). The rescue is not needed and the
     *   degradation does not happen. Asserting a 600 mm dangling corner today
     *   would be asserting the bug.
     *
     * ⭐ WHAT SURVIVES UNCHANGED IS WHY THIS IS STILL ONLY A CONTROL. At θ = 90°
     * the corner slides `m · cot 90° = 0` along the mover and `m / sin 90° = m`
     * along the partner — i.e. EXACTLY the two constants (`weldTol`,
     * `movedDisplacement + weldTol`) that the pre-L-932 gates hard-coded. So this
     * fixture takes the byte-identical branch before and after the angle-aware
     * reach was introduced, and CANNOT distinguish them. It proves the orthogonal
     * case still works; the angled fixtures below are what prove L-932.
     */
    it('the mutual corners follow, the loop closes exactly — and at 90° the angle law is degenerate, so this proves nothing about L-932', () => {
        world = makeWorld();
        world.wallStore.add(wallRecord('o-south', [0, 0], [12, 0]));
        world.wallStore.add(wallRecord('o-east', [12, 0], [12, 8]));
        world.wallStore.add(wallRecord('o-north', [12, 8], [0, 8]));
        world.wallStore.add(wallRecord('o-west', [0, 8], [0, 0]));
        seedJoinedTo(['o-south', 'o-east', 'o-north', 'o-west'], [
            ['o-south', 'o-east'], ['o-east', 'o-north'],
            ['o-north', 'o-west'], ['o-west', 'o-south'],
        ]);

        const before = redetect(world);
        expect(before.length).toBe(1);
        expect(before[0]!.area).toBeCloseTo(shoelace([[0, 0], [12, 0], [12, 8], [0, 8]]), 6); // 96 m²

        // Far endpoints, and the wall that is NOT a partner of the mover.
        const southFarBefore = ptJson(world, 'o-south', 0);
        const northFarBefore = ptJson(world, 'o-north', 1);
        const westBefore = blJson(world, 'o-west');
        const southDirBefore = dirOf(bl2(world, 'o-south'));
        const northDirBefore = dirOf(bl2(world, 'o-north'));

        // Move the EAST wall inward (−x) by 0.6 m — perpendicular to itself,
        // the same magnitude the angled case uses.
        const m = 0.6;
        const res = moveWall(world, 'o-east', -m, 0);
        expect(res.success).toBe(true);

        // ── DERIVED EXPECTATIONS ────────────────────────────────────────────
        // The mover's NEW line: x = 12 − 0.6 = 11.4, from (11.4,0) to (11.4,8).
        const moverNewA: XZ = [12 - m, 0], moverNewB: XZ = [12 - m, 8];
        // o-south's own line is z = 0 → intersection (11.4, 0).
        const cSouth = lineIntersect([0, 0], [12, 0], moverNewA, moverNewB);
        // o-north's own line is z = 8 → intersection (11.4, 8).
        const cNorth = lineIntersect([12, 8], [0, 8], moverNewA, moverNewB);
        expect(cSouth).toEqual([11.4, 0]);
        expect(cNorth).toEqual([11.4, 8]);

        const east = bl2(world, 'o-east');
        const south = bl2(world, 'o-south');
        const north = bl2(world, 'o-north');
        console.log(
            `[L-932 CONTROL orthogonal] STORED o-south[1]=[${south[1]}] o-north[0]=[${north[0]}] ` +
            `o-east=[${east[0]}]→[${east[1]}]`,
        );

        // ── §10.6 THE FOLLOW, at the STORED layer ───────────────────────────
        expect(south[1][0]).toBeCloseTo(cSouth[0], 9);
        expect(south[1][1]).toBeCloseTo(cSouth[1], 9);
        expect(north[0][0]).toBeCloseTo(cNorth[0], 9);
        expect(north[0][1]).toBeCloseTo(cNorth[1], 9);

        // ── §10.6.2 condition 4 — IT IS A PIVOT, NOT A TRANSLATION ──────────
        expect(ptJson(world, 'o-south', 0)).toBe(southFarBefore);
        expect(ptJson(world, 'o-north', 1)).toBe(northFarBefore);
        expect(dirOf(south)).toBeCloseTo(southDirBefore, 12);
        expect(dirOf(north)).toBeCloseTo(northDirBefore, 12);

        // o-west is joined to o-north and o-south but NOT to the mover, so it is
        // not in the partner set at all and must be byte-untouched.
        expect(blJson(world, 'o-west')).toBe(westBefore);

        // The mover itself commits the raw translation verbatim: both corners
        // coincide with its own translated endpoints, so there is nothing to
        // re-seat (the engine's `MIN_DISPLACEMENT` skip).
        expect(east[0][0]).toBeCloseTo(11.4, 9);
        expect(east[1][0]).toBeCloseTo(11.4, 9);

        // Both readings the pre-fix version separated are now ZERO together: the
        // mover's endpoint is on the partner's body AND at the shared corner.
        const offBodySouth = distToSegment(east[0], south[0], south[1]);
        const offBodyNorth = distToSegment(east[1], north[0], north[1]);
        expect(offBodySouth).toBeLessThan(1e-9);
        expect(offBodyNorth).toBeLessThan(1e-9);
        expect(cornerGap(east[0], south[0], south[1])).toBeLessThan(1e-9);
        expect(cornerGap(east[1], north[0], north[1])).toBeLessThan(1e-9);

        // ── THE BUILDING STILL CLOSES ───────────────────────────────────────
        expectLoopClosed(world, [
            { from: ['o-south', 1], to: ['o-east', 0] },
            { from: ['o-east', 1], to: ['o-north', 0] },
            { from: ['o-north', 1], to: ['o-west', 0] },
            { from: ['o-west', 1], to: ['o-south', 0] },
        ]);

        // ── REACHABILITY: the REAL detector, on the REAL stored baselines ────
        const after = redetect(world);
        expect(after.length).toBe(1);
        // 11.4 × 8 = 91.2 m² — shrunk by exactly the drag, not rescued from a
        // broken loop.
        expect(after[0]!.area).toBeCloseTo(shoelace([[0, 0], [11.4, 0], [11.4, 8], [0, 8]]), 6);
        console.log(
            `[L-932 CONTROL orthogonal] room area ${before[0]!.area.toFixed(2)} → ${after[0]!.area.toFixed(2)} m²`,
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// THE DEFECT L-932 NAMED — the same gesture on a NON-AXIS-ALIGNED wall.
// ════════════════════════════════════════════════════════════════════════════

describe('L-932 — an ANGLED wall move: both mutual corners re-form at the analytic intersection', () => {
    /**
     * Chamfered rectangle. `w-angle` makes 30° with `w-east` and 60° with
     * `w-north`, so ONE gesture exercises two different cot θ regimes.
     */
    function buildChamferedRoom(w: World, eastJunction: 'L' | 'T' = 'L'): void {
        w.wallStore.add(wallRecord('w-south', [0, 0], [12, 0]));
        w.wallStore.add(wallRecord('w-east', [12, 0], [12, 5]));
        w.wallStore.add(wallRecord('w-angle', [12, 5], [12 - SQRT3, 8]));
        w.wallStore.add(wallRecord('w-north', [12 - SQRT3, 8], [0, 8]));
        w.wallStore.add(wallRecord('w-west', [0, 8], [0, 0]));
        seedJoinedTo(['w-south', 'w-east', 'w-angle', 'w-north', 'w-west'], [
            ['w-south', 'w-east'],
            { type: eastJunction, wallIds: ['w-east', 'w-angle'] },
            ['w-angle', 'w-north'], ['w-north', 'w-west'], ['w-west', 'w-south'],
        ]);
    }

    /** The founder's gesture: drag the angled wall along ITS OWN inward normal.
     *  n̂ = (−√3/2, −1/2); m = 0.6 m. */
    const M = 0.6;
    const DX = M * (-SQRT3 / 2);
    const DZ = M * (-1 / 2);

    it('§C83-10.6: the 30° AND 60° mutual corners both PIVOT to the analytic intersection, and the loop stays closed', () => {
        world = makeWorld();
        buildChamferedRoom(world);

        const before = redetect(world);
        console.log(`[L-932] before: ${before.length} room(s), area ${before[0]?.area.toFixed(2)} m²`);
        expect(before.length).toBe(1);
        expect(before[0]!.area).toBeCloseTo(
            shoelace([[0, 0], [12, 0], [12, 5], [12 - SQRT3, 8], [0, 8]]), 6,   // 93.4019 m²
        );

        const eastFarBefore = ptJson(world, 'w-east', 0);
        const northFarBefore = ptJson(world, 'w-north', 1);
        const southBefore = blJson(world, 'w-south');
        const westBefore = blJson(world, 'w-west');
        const eastDirBefore = dirOf(bl2(world, 'w-east'));
        const northDirBefore = dirOf(bl2(world, 'w-north'));
        const angleDirBefore = dirOf(bl2(world, 'w-angle'));

        const res = moveWall(world, 'w-angle', DX, DZ);
        expect(res.success).toBe(true);

        // ── DERIVED EXPECTATIONS — the arithmetic, written out ───────────────
        // The mover's NEW line runs through (12 − 0.3√3, 4.7) with the authored
        // direction (−√3, 3); parametrise P(t) = (12 − 0.3√3 − √3·t, 4.7 + 3t).
        const moverNewA: XZ = [12 + DX, 5 + DZ];
        const moverNewB: XZ = [12 - SQRT3 + DX, 8 + DZ];
        //   w-east's line is x = 12 → 12 − 0.3√3 − √3·t = 12 → t = −0.3
        //                            → z = 4.7 − 0.9 = 3.8.    CORNER = (12, 3.8)
        const c30 = lineIntersect([12, 0], [12, 5], moverNewA, moverNewB);
        //   w-north's line is z = 8 → 4.7 + 3t = 8 → t = 1.1
        //                            → x = 12 − 0.3√3 − 1.1√3 = 12 − 1.4√3.
        //                                            CORNER = (12 − 1.4√3, 8)
        const c60 = lineIntersect([12 - SQRT3, 8], [0, 8], moverNewA, moverNewB);
        expect(c30[0]).toBeCloseTo(12, 9);
        expect(c30[1]).toBeCloseTo(3.8, 9);
        expect(c60[0]).toBeCloseTo(12 - 1.4 * SQRT3, 9);   // ≈ 9.575128869
        expect(c60[1]).toBeCloseTo(8, 9);

        const angle = bl2(world, 'w-angle');
        const east = bl2(world, 'w-east');
        const north = bl2(world, 'w-north');

        console.log(
            `[L-932] STORED w-angle = [${angle[0].map(n => n.toFixed(4))}] → [${angle[1].map(n => n.toFixed(4))}]\n` +
            `[L-932] STORED w-east[1] = [${east[1].map(n => n.toFixed(4))}]  ` +
            `w-north[0] = [${north[0].map(n => n.toFixed(4))}]`,
        );
        console.log(
            `[L-932] 30° junction (w-east):  corner slid ${mm(Math.abs(5 - east[1][1]))}mm along the PARTNER ` +
            `[law: m/sin30° = ${mm(M / Math.sin(Math.PI / 6))}mm] and ` +
            `${mm(M / Math.tan(Math.PI / 6))}mm along the MOVER [m·cot30°] — the latter is what the ` +
            `pre-L-932 gates compared against weldTol = 500mm and DROPPED.`,
        );
        console.log(
            `[L-932] 60° junction (w-north): corner slid ${mm(Math.abs((12 - SQRT3) - north[0][0]))}mm along the ` +
            `PARTNER [law: m/sin60° = ${mm(M / Math.sin(Math.PI / 3))}mm], ${mm(M / Math.tan(Math.PI / 3))}mm ` +
            `along the MOVER — inside weldTol, which is why this one always passed.`,
        );

        // ── §10.6 THE FOLLOW — both partners re-seated, at the STORED layer ──
        // ⚠ THIS IS THE THIRD SPELLING OF THIS ASSERTION. See the file header:
        // original = follow, 2026-08-15 §10.2.2 = byte-identical incumbents,
        // 2026-08-17 §10.6 = follow again for MUTUAL corners only. The
        // discriminator (`L`/2, seeded above) is what makes these mutual; the
        // T/degree-3 control below is the same geometry with that one field
        // changed, and it asserts the opposite.
        //
        // Note the two directions in ONE gesture: w-east SHORTENS (5 → 3.8) and
        // w-north SHORTENS toward its far end (12−√3 → 12−1.4√3). §10.6 is
        // symmetric — an asymmetric first draft was itself a bug, caught by a
        // round-trip probe (§Z-5).
        expect(east[1][0]).toBeCloseTo(c30[0], 9);
        expect(east[1][1]).toBeCloseTo(c30[1], 9);
        expect(north[0][0]).toBeCloseTo(c60[0], 9);
        expect(north[0][1]).toBeCloseTo(c60[1], 9);

        // ── §10.6.2 condition 4 — PIVOT: far ends untouched, direction kept ──
        expect(ptJson(world, 'w-east', 0)).toBe(eastFarBefore);
        expect(ptJson(world, 'w-north', 1)).toBe(northFarBefore);
        expect(dirOf(east)).toBeCloseTo(eastDirBefore, 12);
        expect(dirOf(north)).toBeCloseTo(northDirBefore, 12);

        // Walls that are not the mover's partners are byte-untouched.
        expect(blJson(world, 'w-south')).toBe(southBefore);
        expect(blJson(world, 'w-west')).toBe(westBefore);

        // ── THE MOVER SEATS ON BOTH CORNERS — this is L-932's primary arm ────
        // Pre-fix, step 3's `distToSegment(corner, newS, newE) > weldTol` test
        // dropped the 30° corner before it was even counted, because it lands
        // 1039 mm past the mover's translated end. `alongMoverReach` is now
        // `m·cot θ + weldTol`, which equals `weldTol` at 90° — so the orthogonal
        // control above takes a byte-identical branch.
        expect(angle[0][0]).toBeCloseTo(c30[0], 9);
        expect(angle[0][1]).toBeCloseTo(c30[1], 9);
        expect(angle[1][0]).toBeCloseTo(c60[0], 9);
        expect(angle[1][1]).toBeCloseTo(c60[1], 9);
        // …and it EXTENDED along its own line; it did not rotate.
        expect(dirOf(angle)).toBeCloseTo(angleDirBefore, 12);
        expect(dirOf(angle)).toBeCloseTo(Math.atan2(3, -SQRT3), 12);

        // Both junctions now read ZERO on both questions — the mover terminates
        // on the partner's body AND the corner is shared. Pre-fix the 30° arm
        // read offBody = 520 mm (outside room detection's 200 mm hostSnap floor,
        // so §DIAG-PARTITION-REACH could not rescue it either) and cornerGap =
        // 1200 mm.
        expect(distToSegment(angle[0], east[0], east[1])).toBeLessThan(1e-9);
        expect(distToSegment(angle[1], north[0], north[1])).toBeLessThan(1e-9);
        expect(cornerGap(angle[0], east[0], east[1])).toBeLessThan(1e-9);
        expect(cornerGap(angle[1], north[0], north[1])).toBeLessThan(1e-9);

        // ── THE BUILDING STILL CLOSES ───────────────────────────────────────
        // Asserted for the WHOLE ring, not just the two junctions under test:
        // several files in this family asserted only where walls SAT.
        expectLoopClosed(world, [
            { from: ['w-south', 1], to: ['w-east', 0] },
            { from: ['w-east', 1], to: ['w-angle', 0] },
            { from: ['w-angle', 1], to: ['w-north', 0] },
            { from: ['w-north', 1], to: ['w-west', 0] },
            { from: ['w-west', 1], to: ['w-south', 0] },
        ]);

        // ── AND THE ROOM THE FOUNDER LOST ───────────────────────────────────
        // MEASURED BEFORE THE L-932 FIX: 93.40 m² → NO ROOM AT ALL, from one
        // wall move. The founder's report is the same event at a different size:
        // "Room 00-001 (276.5 m²) is NO LONGER DETECTED AS A ROOM AT ALL".
        //
        // ⭐ THE REACHABILITY PROOF. Not a function's return value: the room set,
        // re-derived by the REAL ReDetectRoomsCommand from the REAL stored
        // baselines after the REAL move + cascade.
        const after = redetect(world);
        console.log(`[L-932] after: ${after.length} room(s), area ${after[0]?.area.toFixed(2) ?? '—'} m²`);
        expect(after.length).toBe(1);
        // The room SHRANK by the move (the wall came inward) rather than
        // vanishing — the founder's screenshot-2 expectation — and it shrank to
        // the DERIVED polygon, not merely to "something smaller".
        expect(after[0]!.area).toBeCloseTo(
            shoelace([[0, 0], [12, 0], c30, c60, [0, 8]]), 6,   // 90.9078 m²
        );
        expect(after[0]!.area).toBeLessThan(before[0]!.area);

        // §DIAG-PARTITION-REACH must NOT have been needed here: the emitter is
        // fixed, so the rescuer has nothing to rescue. (Its firing is evidence
        // of the defect, not of health — L-909a / L-928.)
    });

    // ────────────────────────────────────────────────────────────────────────
    // ⭐ THE DISCRIMINATOR CONTROL, AT AN ANGLE.
    //
    // §10.6.5 makes an L-922 control MANDATORY, and `wallMoveReweldSeam.test.ts`
    // carries the load-bearing orthogonal one. This is its ANGLED twin, and it
    // exists because the orthogonal control cannot reach the branch L-932 is
    // about: at 90° the corner lands ON the mover's endpoint, so "the mover
    // extended to reach the incumbent" and "nothing happened" look identical.
    //
    // ⚠ VARY EXACTLY ONE THING. This fixture is byte-for-byte the geometry of
    // the test above — same chamfer, same drag, same partners, same code path.
    // The ONLY difference is that the w-east ↔ w-angle junction is stamped
    // T/degree-3 instead of L/2. So the assertion isolates the stored
    // discriminator and nothing else, which is precisely §10.6.2's claim: *"the
    // topology separates the two cases by MEASUREMENT, not by naming, intent, or
    // a wall-type flag."* If this ever goes green by w-east MOVING, the
    // mutual-corner carve-out has widened past its contract and L-942's fix has
    // become L-922's cause.
    //
    // A control in this family was once written that stayed green with the
    // discriminator removed, because its fixture never reached the mutual-corner
    // branch at all (a mid-span abutment classifies as `stem` at step 1b and
    // never consults `isMutualCorner`). Both endpoints here sit at w-angle's
    // ENDPOINTS, so `classifyWeldAuthorship` returns `corner` and the branch IS
    // reached — verified by the negative control: forcing `isMutualCorner` to
    // `return true` makes this test RED.
    // ────────────────────────────────────────────────────────────────────────
    it('§C83-10.6 CONTROL at 30°: same geometry, T/degree-3 instead of L/2 — w-east does NOT follow', () => {
        world = makeWorld();
        buildChamferedRoom(world, 'T');   // ⭐ THE ONLY VARIABLE

        const eastBefore = blJson(world, 'w-east');
        const northFarBefore = ptJson(world, 'w-north', 1);

        expect(moveWall(world, 'w-angle', DX, DZ).success).toBe(true);

        // §C83 §10.4 — byte-identical, not `near`. L-922 was a 2.19 m shift, but
        // a tolerance here would pass small drags, and small drags accumulate
        // across gestures into exactly that number.
        expect(blJson(world, 'w-east')).toBe(eastBefore);

        // The mover still ADAPTS to the incumbent — C83 §10.1, the newcomer
        // adapting — so it terminates ON w-east's body at (12, 3.8). What it
        // does NOT get is a shared corner: w-east keeps its 1.2 m of length past
        // that point, and the joint is a T-abutment. That is the contract-correct
        // outcome for an incumbent, and it is exactly what §10.6 declines to do
        // for a partner that is not one.
        const angle = bl2(world, 'w-angle');
        const east = bl2(world, 'w-east');
        expect(angle[0][0]).toBeCloseTo(12, 9);
        expect(angle[0][1]).toBeCloseTo(3.8, 9);
        expect(distToSegment(angle[0], east[0], east[1])).toBeLessThan(1e-9);
        expect(cornerGap(angle[0], east[0], east[1])).toBeCloseTo(1.2, 9);

        // The OTHER junction is still stamped L/2 and still follows — proof the
        // discriminator is read PER EDGE, not per gesture.
        const north = bl2(world, 'w-north');
        expect(north[0][0]).toBeCloseTo(12 - 1.4 * SQRT3, 9);
        expect(north[0][1]).toBeCloseTo(8, 9);
        expect(ptJson(world, 'w-north', 1)).toBe(northFarBefore);
        console.log(
            `[L-932 T/3 control] w-east byte-identical; mover seats on its BODY at ` +
            `[${angle[0].map(n => n.toFixed(4))}], cornerGap=${mm(cornerGap(angle[0], east[0], east[1]))}mm`,
        );
    });

    it('the follow is ANGLE-GENERAL, not a 30° special case — an analytic sweep of non-axis-aligned junctions', () => {
        // One fixture cannot prove a cot θ law. This sweeps the chamfer angle and
        // asserts, at EVERY angle, that each mutual partner's welded endpoint
        // lands on the CLOSED-FORM intersection derived below — not merely that
        // "the joint is closed", which a hard-coded fallback could also satisfy.
        //
        // ⭐ THE CLOSED FORM, so the expectation is arithmetic and not output.
        // With the chamfer at `deg` to the vertical east wall:
        //     mover direction  d = 3·(−sin, cos),  inward normal n̂ = (−cos, −sin)
        //     drag             m = 0.4 along n̂
        //     mover's new line passes (12 − m·cos, 5 − m·sin) with direction d
        //   ∩ a-east's line  x = 12          →  z = 5 − m/sin(deg)
        //   ∩ a-north's line z = 5 + rise    →  x = 12 − run − m/cos(deg)
        // Both are the `m / sin θ` law: θ = deg at the east junction and
        // θ = 90° − deg at the north one, which is why ONE sweep covers the whole
        // range of cot values with two independent readings per step.
        const m = 0.4;
        for (const deg of [15, 20, 25, 35, 40, 50, 65, 75]) {
            const rad = (deg * Math.PI) / 180;
            // A chamfer of FIXED LENGTH (3 m) at `deg` to the vertical east
            // wall — so the room stays non-degenerate at every angle. (A fixed
            // RISE instead collapses the north wall to 0.8 m by 75°, at which
            // point the corner correctly falls off the incumbent's end. That is a
            // fixture artefact, not a follow failure.)
            const run = 3 * Math.sin(rad);
            const rise = 3 * Math.cos(rad);
            const w = makeWorld();
            try {
                w.wallStore.add(wallRecord('a-south', [0, 0], [12, 0]));
                w.wallStore.add(wallRecord('a-east', [12, 0], [12, 5]));
                w.wallStore.add(wallRecord('a-angle', [12, 5], [12 - run, 5 + rise]));
                w.wallStore.add(wallRecord('a-north', [12 - run, 5 + rise], [0, 5 + rise]));
                w.wallStore.add(wallRecord('a-west', [0, 5 + rise], [0, 0]));
                seedJoinedTo(['a-south', 'a-east', 'a-angle', 'a-north', 'a-west'], [
                    ['a-south', 'a-east'], ['a-east', 'a-angle'],
                    ['a-angle', 'a-north'], ['a-north', 'a-west'], ['a-west', 'a-south'],
                ]);

                const beforeRooms = w.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
                expect(beforeRooms.success).toBe(true);
                expect(w.roomStore.getByLevel(LEVEL).length).toBe(1);

                const eastFarBefore = ptJson(w, 'a-east', 0);
                const northFarBefore = ptJson(w, 'a-north', 1);
                const southBefore = blJson(w, 'a-south');
                const westBefore = blJson(w, 'a-west');
                const eastDirBefore = dirOf(bl2(w, 'a-east'));
                const northDirBefore = dirOf(bl2(w, 'a-north'));
                const angleDirBefore = dirOf(bl2(w, 'a-angle'));

                // Drag 0.4 m along the mover's own inward normal.
                // d = (−run, rise), so n̂ = (−dz, dx)/|d| = (−cos, −sin).
                const res = moveWall(w, 'a-angle', m * -Math.cos(rad), m * -Math.sin(rad));
                expect(res.success).toBe(true);

                // ── DERIVED, two ways, and they must agree ──────────────────
                const moverNewA: XZ = [12 - m * Math.cos(rad), 5 - m * Math.sin(rad)];
                const moverNewB: XZ = [12 - run - m * Math.cos(rad), 5 + rise - m * Math.sin(rad)];
                const cEast = lineIntersect([12, 0], [12, 5], moverNewA, moverNewB);
                const cNorth = lineIntersect([12 - run, 5 + rise], [0, 5 + rise], moverNewA, moverNewB);
                // …against the closed form written out above:
                expect(cEast[0]).toBeCloseTo(12, 9);
                expect(cEast[1]).toBeCloseTo(5 - m / Math.sin(rad), 9);
                expect(cNorth[0]).toBeCloseTo(12 - run - m / Math.cos(rad), 9);
                expect(cNorth[1]).toBeCloseTo(5 + rise, 9);

                const ang = bl2(w, 'a-angle');
                const east = bl2(w, 'a-east');
                const north = bl2(w, 'a-north');
                console.log(
                    `[L-932 sweep] ${deg}° (cot=${(1 / Math.tan(rad)).toFixed(2)}) ` +
                    `east welded z ${5} → ${east[1][1].toFixed(6)} (expected ${(5 - m / Math.sin(rad)).toFixed(6)}, ` +
                    `slide m/sin = ${mm(m / Math.sin(rad))}mm) | ` +
                    `north welded x ${(12 - run).toFixed(4)} → ${north[0][0].toFixed(6)} ` +
                    `(expected ${(12 - run - m / Math.cos(rad)).toFixed(6)})`,
                );

                // §10.6 THE FOLLOW — both partners, at the analytic intersection.
                expect(east[1][0]).toBeCloseTo(cEast[0], 9);
                expect(east[1][1]).toBeCloseTo(cEast[1], 9);
                expect(north[0][0]).toBeCloseTo(cNorth[0], 9);
                expect(north[0][1]).toBeCloseTo(cNorth[1], 9);

                // §10.6.2 condition 4 — PIVOT, at every angle.
                expect(ptJson(w, 'a-east', 0)).toBe(eastFarBefore);
                expect(ptJson(w, 'a-north', 1)).toBe(northFarBefore);
                expect(dirOf(east)).toBeCloseTo(eastDirBefore, 12);
                expect(dirOf(north)).toBeCloseTo(northDirBefore, 12);
                expect(dirOf(ang)).toBeCloseTo(angleDirBefore, 12);

                // Non-partners byte-untouched, at every angle.
                expect(blJson(w, 'a-south')).toBe(southBefore);
                expect(blJson(w, 'a-west')).toBe(westBefore);

                // The mover terminates on both partners' bodies AND shares both
                // corners — the two questions that were conflated for five
                // reports, asserted separately.
                expect(distToSegment(ang[0], east[0], east[1])).toBeLessThan(1e-9);
                expect(distToSegment(ang[1], north[0], north[1])).toBeLessThan(1e-9);
                expect(cornerGap(ang[0], east[0], east[1])).toBeLessThan(1e-9);
                expect(cornerGap(ang[1], north[0], north[1])).toBeLessThan(1e-9);

                // THE BUILDING STILL CLOSES — at every angle.
                expectLoopClosed(w, [
                    { from: ['a-south', 1], to: ['a-east', 0] },
                    { from: ['a-east', 1], to: ['a-angle', 0] },
                    { from: ['a-angle', 1], to: ['a-north', 0] },
                    { from: ['a-north', 1], to: ['a-west', 0] },
                    { from: ['a-west', 1], to: ['a-south', 0] },
                ]);

                // …and the REAL detector still finds the room, from the REAL
                // stored baselines, with the DERIVED area.
                const afterRooms = w.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
                expect(afterRooms.success).toBe(true);
                const rooms = w.roomStore.getByLevel(LEVEL);
                expect(rooms.length, `${deg}°: the move destroyed the room`).toBe(1);
                expect(rooms[0]!.computed?.area ?? 0).toBeCloseTo(
                    shoelace([[0, 0], [12, 0], cEast, cNorth, [0, 5 + rise]]), 6,
                );
            } finally {
                w.dispose();
                semanticGraphManager.clear();
            }
        }
    });
});
