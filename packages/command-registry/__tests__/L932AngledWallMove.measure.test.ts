/**
 * L-932 — MOVE AN **ANGLED** WALL AND ITS NEIGHBOURS DO NOT FOLLOW.
 * THE MEASUREMENT, COMMITTED BEFORE ANY FIX.
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
 * defect is downstream.**
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
 * W's translated endpoint. Every proximity gate in `computeMoveReweldPlan`
 * compares that displacement against `weldTol`, and every one of them has
 * therefore been comparing against zero for the entire life of this family.
 * **An orthogonal fixture cannot fail this way and would give a false green.**
 * As θ falls the quantity grows without bound (bounded only by the engine's own
 * MIN_ANGLE_RAD ≈ 5.7°, i.e. |cot θ| ≤ ~10).
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
 * `weldTol` is `DEFAULT_SNAP_RADIUS` = 500 mm. So the prediction is that the
 * 60° junction re-forms and the 30° junction is DROPPED — silently, with no
 * refusal — leaving a joint open by the mover's full 600 mm. That is the
 * founder's 782 mm class of number, and their trace's shape exactly: the
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
 * NOTHING IS FIXED IN THIS FILE.
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

function seedJoinedTo(wallIds: string[], pairs: Array<[string, string]>): void {
    semanticGraphManager.replaceJoinedToForLevelWalls(
        wallIds,
        pairs.map(([a, b]) => ({ junctionType: 'L', junctionDegree: 2, wallIds: [a, b] as [string, string] })),
    );
}

type XZ = [number, number];

const bl2 = (world: World, id: string): [XZ, XZ] => {
    const b = world.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

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
// CONTROL — the ORTHOGONAL gesture. It must stay green through any fix.
// ════════════════════════════════════════════════════════════════════════════

describe('L-932 CONTROL — an ORTHOGONAL wall move (the case that has always worked)', () => {
    it('the loop stays closed and the room survives — this is the FALSE GREEN an orthogonal fixture would give', () => {
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

        // Move the EAST wall inward (−x) by 0.6 m — perpendicular to itself,
        // the same magnitude the angled case uses.
        const res = moveWall(world, 'o-east', -0.6, 0);
        expect(res.success).toBe(true);

        const east = bl2(world, 'o-east');
        const south = bl2(world, 'o-south');
        const north = bl2(world, 'o-north');

        // TWO independent questions, and conflating them is what hid this
        // family for five reports:
        //   offBody  — did the mover's endpoint leave the partner's BODY?
        //              This is what decides whether room detection's hostSnap
        //              / §DIAG-PARTITION-REACH can rescue the loop.
        //   corner   — did the shared CORNER survive? This is what the
        //              re-weld exists to restore.
        const offBodySouth = distToSegment(east[0], south[0], south[1]);
        const offBodyNorth = distToSegment(east[1], north[0], north[1]);
        const cornerSouth = cornerGap(east[0], south[0], south[1]);
        const cornerNorth = cornerGap(east[1], north[0], north[1]);
        console.log(
            `[L-932 CONTROL orthogonal] offBody south=${mm(offBodySouth)}mm north=${mm(offBodyNorth)}mm | ` +
            `cornerGap south=${mm(cornerSouth)}mm north=${mm(cornerNorth)}mm`,
        );

        // ⭐ THE CONTROL'S REAL FINDING — the re-weld did NOT restore the
        //    corner here either (600 mm dangling, exactly the mover's own
        //    displacement). What SAVES the orthogonal case is that the mover
        //    is PERPENDICULAR to its partners, so translating it along its own
        //    normal slides its endpoint ALONG the partner's body and never off
        //    it: offBody stays 0, the joint degrades from a corner to a
        //    T-abutment, and §DIAG-PARTITION-REACH reconnects it.
        //    The failure was always there; it was always MASKED.
        expect(offBodySouth).toBeLessThan(1e-9);
        expect(offBodyNorth).toBeLessThan(1e-9);
        expect(cornerSouth).toBeGreaterThan(0.5);

        const after = redetect(world);
        expect(after.length).toBe(1);   // rescued → the room survives
        console.log(
            `[L-932 CONTROL orthogonal] room area ${before[0]!.area.toFixed(2)} → ${after[0]!.area.toFixed(2)} m²`,
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// THE DEFECT — the same gesture on a NON-AXIS-ALIGNED wall.
// ════════════════════════════════════════════════════════════════════════════

describe('L-932 — an ANGLED wall move leaves its 30° neighbour behind', () => {
    /**
     * Chamfered rectangle. `w-angle` makes 30° with `w-east` and 60° with
     * `w-north`, so ONE gesture exercises two different cot θ regimes.
     */
    function buildChamferedRoom(w: World): void {
        w.wallStore.add(wallRecord('w-south', [0, 0], [12, 0]));
        w.wallStore.add(wallRecord('w-east', [12, 0], [12, 5]));
        w.wallStore.add(wallRecord('w-angle', [12, 5], [12 - SQRT3, 8]));
        w.wallStore.add(wallRecord('w-north', [12 - SQRT3, 8], [0, 8]));
        w.wallStore.add(wallRecord('w-west', [0, 8], [0, 0]));
        seedJoinedTo(['w-south', 'w-east', 'w-angle', 'w-north', 'w-west'], [
            ['w-south', 'w-east'], ['w-east', 'w-angle'],
            ['w-angle', 'w-north'], ['w-north', 'w-west'], ['w-west', 'w-south'],
        ]);
    }

    it('MEASURE: the 30° junction is dropped SILENTLY and the stored loop is left open', () => {
        world = makeWorld();
        buildChamferedRoom(world);

        const before = redetect(world);
        console.log(`[L-932] before: ${before.length} room(s), area ${before[0]?.area.toFixed(2)} m²`);
        expect(before.length).toBe(1);

        const eastBefore = bl2(world, 'w-east');
        const northBefore = bl2(world, 'w-north');

        // The founder's gesture: drag the angled wall along ITS OWN NORMAL.
        // n̂ = (−√3/2, −1/2) points into the room; m = 0.6 m.
        const m = 0.6;
        const dx = m * (-SQRT3 / 2);
        const dz = m * (-1 / 2);
        const res = moveWall(world, 'w-angle', dx, dz);
        expect(res.success).toBe(true);

        const angle = bl2(world, 'w-angle');
        const east = bl2(world, 'w-east');
        const north = bl2(world, 'w-north');

        // ── C83 §10 — the INCUMBENTS must not have moved. (This half is
        //    correct today and must stay correct: it is L-922's scar.)
        expect(east).toEqual(eastBefore);
        expect(north).toEqual(northBefore);

        // ── THE MEASUREMENT, at the STORED layer ────────────────────────────
        const offBody30 = distToSegment(angle[0], east[0], east[1]);
        const offBody60 = distToSegment(angle[1], north[0], north[1]);
        const corner30 = cornerGap(angle[0], east[0], east[1]);
        const corner60 = cornerGap(angle[1], north[0], north[1]);

        console.log(
            `[L-932] STORED w-angle = [${angle[0].map(n => n.toFixed(4))}] → [${angle[1].map(n => n.toFixed(4))}]`,
        );
        console.log(
            `[L-932] 30° junction (w-east):  offBody=${mm(offBody30)}mm cornerGap=${mm(corner30)}mm` +
            `  [predicted: offBody = m·cos30° = ${mm(m * Math.cos(Math.PI / 6))}mm,` +
            ` corner slide along mover = m·cot30° = ${mm(m / Math.tan(Math.PI / 6))}mm]`,
        );
        console.log(
            `[L-932] 60° junction (w-north): offBody=${mm(offBody60)}mm cornerGap=${mm(corner60)}mm` +
            `  [predicted: offBody = m·cos60° = ${mm(m * Math.cos(Math.PI / 3))}mm,` +
            ` corner slide along mover = m·cot60° = ${mm(m / Math.tan(Math.PI / 3))}mm]`,
        );

        // ── THE SUCCESS CRITERION, stated exactly ───────────────────────────
        // C83 §10.1: the MOVER adapts, the incumbent is untouched. So "the
        // joint is closed" does NOT mean "the corner is still shared" — it
        // means the mover's endpoint TERMINATES ON the incumbent's stored
        // segment. `offBody` is that question; `cornerGap` is not (a legal
        // outcome seats the mover mid-body, 693 mm from the incumbent's end).
        //
        // The 60° junction PASSES it: its corner slid 346 mm along the mover,
        // inside weldTol (500 mm), so every gate let it through and the mover's
        // end was re-seated to (9.5751, 8.0000) — ON w-north. Proof that the
        // machinery is not broken in general, and that the incumbent was never
        // moved to achieve it.
        expect(offBody60).toBeLessThan(1e-9);

        // The 30° junction FAILS it: its corner slid 1039 mm along the mover —
        // OUTSIDE weldTol — so `computeMoveReweldPlan` dropped it, SILENTLY (a
        // bare `continue`, not a `MoveReweldRefusal`), and nobody was told.
        // The mover's start is left at the raw translation, 520 mm off
        // w-east's body.
        //
        // ⚠ THIS EXPECTATION IS THE DEFECT PIN. The fix must INVERT it.
        expect(offBody30).toBeGreaterThan(0.2);

        // 520 mm is also far outside room detection's 200 mm `hostSnap` floor,
        // so §DIAG-PARTITION-REACH cannot rescue this loop the way it rescued
        // the orthogonal control's. BOTH safety nets fail together, and both
        // fail for one reason: at θ = 90° every quantity above is identically
        // ZERO, so neither net has ever been exercised.
        expect(offBody30).toBeGreaterThan(0.2);
        expect(corner30).toBeGreaterThan(0.5);

        // ── AND THE ROOM THE FOUNDER LOST ───────────────────────────────────
        // 93.40 m² → NO ROOM AT ALL, from one wall move. The founder's report
        // is the same event at a different size: "Room 00-001 (276.5 m²) is NO
        // LONGER DETECTED AS A ROOM AT ALL".
        //
        // Compare the control above: an identical 600 mm perpendicular drag on
        // an ORTHOGONAL wall left the same 600 mm dangling corners, and the
        // room survived — because there the mover's endpoints never left their
        // partners' bodies and §DIAG-PARTITION-REACH could reconnect them.
        //
        // ⚠ DEFECT PIN. The fix must turn this back into 1 room.
        const after = redetect(world);
        console.log(`[L-932] after: ${after.length} room(s), area ${after[0]?.area.toFixed(2) ?? '—'} m²`);
        expect(after.length).toBe(0);
    });
});
