/**
 * L-936 — TWO INTERIOR WALLS IN AN L; MOVE ONE AND THE OTHER DOES NOT FOLLOW.
 * THE MEASUREMENT, COMMITTED BEFORE ANY FIX. NOTHING IS FIXED IN THIS FILE.
 *
 * ─── THE ROW'S SMOKING GUN, AND WHY THE CODE ALREADY REFUTES HALF OF IT ──────
 *
 * The founder's console line:
 *
 *     [WallMoveReweldService] §MOVE-REWELD-DISPATCH: moved wall wall_01M075…
 *       → 1 junction re-weld(s) via joinedTo-graph [wall_01M075…]
 *
 * was read as *"the joinedTo query returned only the mover, so the partner edge
 * is missing or the traversal is wrong"*. **That reading cannot be right, and
 * the emitter says so in its own source.** Two facts, both from
 * `WallMoveReweldService.onWallUpdated`:
 *
 *   1. The bracketed list is `entries.map(e => e.wallId)` — the ENGINE'S PLAN,
 *      not the partner list. `partnerIds` is never printed at all.
 *   2. The words `via joinedTo-graph` are only reachable when the query answered
 *      `{ok:true}` **with a non-empty `joinedWallIds`**: `ok && length === 0`
 *      returns before any log, and `!ok` prints `level-scan (graph refused: …)`.
 *
 * So the graph DID answer, and it DID name at least one partner. What the line
 * actually records is `computeMoveReweldPlan` returning exactly one entry, whose
 * `wallId` is the subject — which is the ENGINE'S DESIGNED OUTPUT for a CORNER
 * partner under C83 §10.2.2 (the incumbent is not ours to move; only the subject
 * adapts). **The count of 1 is not a lie about the graph. It is a true report of
 * a plan that contains no partner, printed in a shape that cannot distinguish
 * "no partner was found" from "a partner was found and deliberately left where
 * it is".** That ambiguity is what sent six lanes downstream.
 *
 * This file measures the three layers separately so the row can be decided on
 * evidence rather than on that one ambiguous line:
 *
 *   STAGE A — the WRITER'S INPUT. The REAL junction index (`WallPipelineV2Cache`
 *             → `JunctionResolverV2`) over the founder's L-pair. Does the solve
 *             produce a junction record naming BOTH interior walls?
 *   STAGE B — the EDGE SET. Those REAL records fed through the REAL graph writer
 *             (`replaceJoinedToForLevelWalls`, exactly as
 *             `writeJoinedToEdgesForLevel` does at the flush), then
 *             `getJoinedWalls` dumped for BOTH walls BEFORE the move.
 *             ⭐ THIS IS THE READING THE ROW ASKS FOR.
 *   STAGE C — the DISPATCH. The real `UpdateWallBaselineCommand` →
 *             `WallMoveReweldService` → `CascadeWallBaselineCommand` chain, with
 *             the partner list, the plan entries and the plan refusals captured
 *             separately.
 *   STAGE D — the STORED LAYER. The PARTNER wall's baseline read back out of the
 *             REAL `WallStore` after the move. Never a function's return value.
 *
 * @file packages/command-registry/__tests__/L936InteriorLPairMove.measure.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore, WallPipelineV2Cache, WallMoveReweldService } from '@pryzm/geometry-wall';
import type { WallData, LevelWallSpec } from '@pryzm/geometry-wall';
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
const THICK = 0.2;

// ── the founder's fixture ────────────────────────────────────────────────────
//
//   (0,8) ───────────────────────────── (10,8)      p-north
//     │                    │                        │
//     │            i-b ────┼──────────── (10,5)     ← the L pair: i-a ⊥ i-b,
//     │                    │ i-a                       sharing the corner (4,5)
//     │                    │                        │
//   (0,0) ────────────(4,0)───────────── (10,0)     p-south
//
// TWO INTERIOR walls in an L (i-a vertical, i-b horizontal, shared corner at
// (4,5)); each has its FAR end terminating on a perimeter wall's body, which is
// how an interior partition is actually drawn. Both interior — the founder's
// exact words, and the configuration no previous lane in this family tested
// (L-922/L-926 moved a PERIMETER wall, L-932 moved an ANGLED one).

const PERIMETER: Array<[string, [number, number], [number, number]]> = [
    ['p-south', [0, 0], [10, 0]],
    ['p-east',  [10, 0], [10, 8]],
    ['p-north', [10, 8], [0, 8]],
    ['p-west',  [0, 8], [0, 0]],
];
const INTERIOR: Array<[string, [number, number], [number, number]]> = [
    ['i-a', [4, 0], [4, 5]],   // vertical partition, top end AT the corner
    ['i-b', [4, 5], [10, 5]],  // horizontal partition, start end AT the corner
];

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number]): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: THICK, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function makeLevelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function makeBimManager() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    const registered = new Set<string>();
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: (id: string) => { registered.add(id); },
        unregisterElement: (id: string) => { registered.delete(id); },
    };
}

/** What the dispatch actually saw, captured at the seam rather than inferred
 *  from the console line the row quoted. */
interface DispatchCapture {
    /** Every `CascadeWallBaselineCommand` the service built, in order. */
    readonly plans: Array<{ cause: string; wallIds: string[] }>;
    /** Every consequence the service reported (production wires NO sink — see
     *  the STAGE C finding — so this is evidence that is computed and dropped). */
    readonly consequences: Array<{ stage: string; reason: string; partnerIds: string[]; detail: string[] }>;
}

interface World {
    wallStore: WallStore;
    roomStore: RoomStore;
    cm: CommandManager;
    reweldService: WallMoveReweldService;
    capture: DispatchCapture;
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
    Object.assign(window, { wallStore });   // WallFaceResolver reads this global

    const capture: DispatchCapture = { plans: [], consequences: [] };

    const reweldService = new WallMoveReweldService(wallStore, {
        commandManagerRef: { current: cm },
        makeCascadeCommand: (input) => {
            capture.plans.push({ cause: input.cause, wallIds: input.entries.map(e => e.wallId) });
            return new CascadeWallBaselineCommand(input);
        },
        getJoinedWalls: (wallId) => semanticGraphManager.getJoinedWalls(wallId),
        isCascadeApplying: isCascadeWallBaselineApplying,
        // ⚠ PRODUCTION DOES NOT PASS THIS (engineLauncher.ts §MOVE-REWELD-DISPATCH).
        //   Wired here only so the measurement can SEE what production discards.
        onConsequence: (r) => {
            capture.consequences.push({
                stage: r.stage, reason: r.reason,
                partnerIds: [...r.partnerIds], detail: [...r.detail],
            });
        },
    });

    return {
        wallStore, roomStore, cm, reweldService, capture,
        dispose() {
            reweldService.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

/** Build the fixture in the store AND write the joinedTo edges from the REAL
 *  junction solve — the same two products `WallRebuildCoordinator._flush`
 *  produces from one `refreshV2Cache` (ADR-0321 §CONNECT-3). */
function buildFixture(w: World): { junctionDump: string[]; levelWallIds: string[] } {
    const all = [...PERIMETER, ...INTERIOR];
    for (const [id, s, e] of all) w.wallStore.add(wallRecord(id, s, e));

    const specs: LevelWallSpec[] = all.map(([id, s, e]) => ({
        id,
        startXZ: { x: s[0], z: s[1] },
        endXZ:   { x: e[0], z: e[1] },
        thickness: THICK,
    }));

    // THE REAL INDEX — JunctionResolverV2 via the cache the builder owns.
    const cache = new WallPipelineV2Cache();
    cache.refresh(specs);

    const junctionDump = cache.junctions.map(
        j => `${j.id} type=${j.type} degree=${j.degree} at=(${j.point.x.toFixed(3)},${j.point.z.toFixed(3)}) walls=[${j.wallIds.join(', ')}]`,
    );

    const levelWallIds = all.map(([id]) => id);
    // THE REAL WRITER, called exactly as `writeJoinedToEdgesForLevel` calls it.
    semanticGraphManager.replaceJoinedToForLevelWalls(
        levelWallIds,
        cache.junctions.map(rec => ({
            junctionType: rec.type,
            junctionDegree: rec.degree,
            wallIds: rec.wallIds,
        })),
    );

    return { junctionDump, levelWallIds };
}

type XZ = [number, number];
const bl2 = (w: World, id: string): [XZ, XZ] => {
    const b = w.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};
const mm = (m: number): number => Math.round(m * 1000);

function distToSegment(p: XZ, a: XZ, b: XZ): number {
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}
/** The dangling corner — how far the partner's shared endpoint now sits from
 *  the mover's stored body. This is the number the founder SEES. */
const cornerGap = (p: XZ, a: XZ, b: XZ): number =>
    Math.min(Math.hypot(p[0] - a[0], p[1] - a[1]), Math.hypot(p[0] - b[0], p[1] - b[1]));

function moveWall(w: World, id: string, dx: number, dz: number) {
    const wall = w.wallStore.getById(id)!;
    return w.cm.execute(new UpdateWallBaselineCommand({
        wallId: id,
        newBaseLine: [
            { x: wall.baseLine[0].x + dx, y: wall.baseLine[0].y, z: wall.baseLine[0].z + dz },
            { x: wall.baseLine[1].x + dx, y: wall.baseLine[1].y, z: wall.baseLine[1].z + dz },
        ],
    }));
}

function redetect(w: World): number {
    const res = w.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
    expect(res.success).toBe(true);
    return w.roomStore.getByLevel(LEVEL).length;
}

let world: World | undefined;

beforeEach(() => {
    semanticGraphManager.clear();
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    for (const x of windowStore.getAll()) windowStore.remove(x.id);
});
afterEach(() => {
    world?.dispose();
    world = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// STAGE A + B — the WRITER and the EDGE SET. The reading the row asks for.
// ════════════════════════════════════════════════════════════════════════════

describe('L-936 STAGE A/B — is the `joinedTo` edge for the interior L-pair WRITTEN?', () => {
    it('MEASURE: the real junction solve names both interior walls, and the edge set is symmetric BEFORE the move', () => {
        world = makeWorld();
        const { junctionDump } = buildFixture(world);

        console.log('[L-936 STAGE A] junction index (JunctionResolverV2, real solve):');
        for (const line of junctionDump) console.log(`[L-936 STAGE A]   ${line}`);

        const qa = semanticGraphManager.getJoinedWalls('i-a');
        const qb = semanticGraphManager.getJoinedWalls('i-b');
        console.log(`[L-936 STAGE B] getJoinedWalls('i-a') = ${JSON.stringify(qa)}`);
        console.log(`[L-936 STAGE B] getJoinedWalls('i-b') = ${JSON.stringify(qb)}`);

        // ⭐ THE READING THAT DECIDES THE ROW.
        //    Cause 1 ("the edge was never written") predicts a refusal or an
        //    answer that omits the partner. Cause 2 ("the traversal includes the
        //    subject / never leaves the start node") predicts the subject's own
        //    id in its own result.
        expect(qa.ok).toBe(true);
        expect(qb.ok).toBe(true);
        expect(qa.ok && qa.joinedWallIds).toContain('i-b');
        expect(qb.ok && qb.joinedWallIds).toContain('i-a');
        // No self-edge: the traversal does NOT return the subject.
        expect(qa.ok && qa.joinedWallIds).not.toContain('i-a');
        expect(qb.ok && qb.joinedWallIds).not.toContain('i-b');
    });

    /**
     * ⭐ THE DISCRIMINATOR ANY FIX NEEDS, AND IT ALREADY EXISTS IN THE INDEX.
     *
     * A fix that lets the L-partner follow must not reopen L-922 (an interior
     * move dragging a PERIMETER baseline 2.19 m and re-seating three doors). So
     * it needs a measurable separation between "a mutual corner of two walls
     * that arrived together" and "a wall terminating on an incumbent it arrived
     * at". `JunctionResolverV2` already draws exactly that line and the graph
     * already stores it — `replaceJoinedToForLevelWalls` writes
     * `metadata: {junctionType, junctionDegree}` on every edge:
     *
     *     interior ↔ interior (the founder's L)  →  type L, degree 2
     *     interior ↔ perimeter (both of them)    →  type T, degree 3
     *
     * ⚠ AND IT IS THROWN AWAY ON THE READ. `getJoinedWalls` returns bare ids;
     * `MoveReweldPartner` is `{id, baseLine}`. So `computeMoveReweldPlan` must
     * re-derive authorship from geometry alone (`classifyWeldAuthorship`), which
     * cannot see the difference — both look like "an endpoint near an endpoint"
     * — and folds the two into one `corner` verdict. The evidence that would
     * decide the founder's case is computed at the flush and dropped one call
     * later. Pinned here so the fix does not have to re-discover it, and so it
     * cannot rot before the fix lands.
     */
    it('MEASURE: the index ALREADY separates the interior L-pair (L/2) from both interior↔perimeter joins (T/3)', () => {
        world = makeWorld();
        const { junctionDump } = buildFixture(world);

        const find = (a: string, b: string) =>
            junctionDump.find(l => l.includes(`${a}, ${b}`) || l.includes(`${b}, ${a}`));

        const lPair = find('i-a', 'i-b');
        const tSouth = find('p-south', 'i-a');
        const tEast = find('i-b', 'p-east');
        console.log(`[L-936 ⭐ discriminator] interior L-pair      : ${lPair}`);
        console.log(`[L-936 ⭐ discriminator] i-a ↔ p-south (perim): ${tSouth}`);
        console.log(`[L-936 ⭐ discriminator] i-b ↔ p-east  (perim): ${tEast}`);

        expect(lPair).toContain('type=L degree=2');
        expect(tSouth).toContain('type=T degree=3');
        expect(tEast).toContain('type=T degree=3');

        // …and the metadata is on the stored edge, not merely in the solve.
        const edge = semanticGraphManager
            .getRelationships('i-b')
            .find(r => r.type === 'joinedTo' && r.targetId === 'i-a');
        console.log(`[L-936 ⭐ discriminator] stored joinedTo edge metadata = ${JSON.stringify(edge?.metadata)}`);
        expect(edge?.metadata).toMatchObject({ junctionType: 'L', junctionDegree: 2 });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// STAGE C + D — the DISPATCH and the STORED LAYER.
// ════════════════════════════════════════════════════════════════════════════

describe('L-936 STAGE C/D — the partner is REACHED, and then deliberately left behind', () => {
    /**
     * The gesture sweep. A gizmo drag is not guaranteed to be a pure
     * perpendicular translation, and at θ = 90° a perpendicular translation is
     * the degenerate case where the new corner lands exactly on the mover's own
     * endpoint (L-932's cot θ law). Four directions therefore, so the finding
     * cannot be an artefact of one of them.
     */
    const GESTURES: Array<{ name: string; dx: number; dz: number }> = [
        { name: 'perpendicular, INTO the partner (−z 0.6)',  dx: 0,    dz: -0.6 },
        { name: 'perpendicular, AWAY from partner (+z 0.6)', dx: 0,    dz: +0.6 },
        { name: 'oblique drag (−0.4, −0.6)',                 dx: -0.4, dz: -0.6 },
        { name: 'oblique drag (+0.4, +0.6)',                 dx: +0.4, dz: +0.6 },
    ];

    for (const g of GESTURES) {
        it(`MEASURE [${g.name}]: i-a's STORED baseline after moving i-b`, () => {
            world = makeWorld();
            buildFixture(world);
            const roomsBefore = redetect(world);

            const partnerBefore = bl2(world, 'i-a');
            const res = moveWall(world, 'i-b', g.dx, g.dz);
            expect(res.success).toBe(true);

            const partnerAfter = bl2(world, 'i-a');
            const moverAfter = bl2(world, 'i-b');

            // ── STAGE C — what the dispatch actually built ───────────────────
            console.log(
                `[L-936 STAGE C ${g.name}] plans=${JSON.stringify(world.capture.plans)} ` +
                `consequences=${JSON.stringify(world.capture.consequences.map(c => `${c.stage}/${c.reason}→[${c.partnerIds}]`))}`,
            );
            for (const c of world.capture.consequences) {
                for (const d of c.detail) console.log(`[L-936 STAGE C ${g.name}]   detail: ${d}`);
            }

            // ── STAGE D — THE STORED LAYER ──────────────────────────────────
            const gap = cornerGap(partnerAfter[1], moverAfter[0], moverAfter[1]);
            const offBody = distToSegment(partnerAfter[1], moverAfter[0], moverAfter[1]);
            console.log(
                `[L-936 STAGE D ${g.name}] STORED i-a = ${JSON.stringify(partnerAfter)} ` +
                `(was ${JSON.stringify(partnerBefore)}) | STORED i-b = ${JSON.stringify(moverAfter)}`,
            );
            console.log(
                `[L-936 STAGE D ${g.name}] i-a's shared endpoint → i-b's body: ` +
                `offBody=${mm(offBody)}mm cornerGap=${mm(gap)}mm | rooms ${roomsBefore} → ${redetect(world)}`,
            );

            // ⭐ THE FINDING, PINNED. The partner NEVER moves, in ANY direction:
            //    it is classified CORNER (its endpoint sits at the mover's own
            //    endpoint, inside `cornerBandM = t/2 + COINCIDENT_M`), and C83
            //    §10.2.2 forbids the engine moving a non-subject baseline. So
            //    the follow the founder asks for is not dropped by a broken
            //    query — it is DECLINED by the rule, for a pair in which
            //    NEITHER wall is an incumbent perimeter.
            expect(partnerAfter).toEqual(partnerBefore);
        });
    }

    it('MEASURE: the partner IS in the plan input — the count in the log is about ENTRIES, not partners', () => {
        world = makeWorld();
        buildFixture(world);

        // What the service reads at event time (STAGE B, restated at the seam
        // the service itself uses).
        const q = semanticGraphManager.getJoinedWalls('i-b');
        expect(q.ok).toBe(true);
        const partnersSeen = q.ok ? [...q.joinedWallIds] : [];

        moveWall(world, 'i-b', -0.4, -0.6);

        const plannedWallIds = world.capture.plans.flatMap(p => p.wallIds);
        console.log(
            `[L-936 ⭐] partners the graph handed the engine = [${partnersSeen.join(', ')}] ` +
            `(${partnersSeen.length}) | wallIds in the dispatched plan = [${plannedWallIds.join(', ')}] ` +
            `(${plannedWallIds.length})`,
        );

        // The graph named the partner …
        expect(partnersSeen).toContain('i-a');
        // … and the plan does not, which is the ONE fact the founder's console
        // line cannot tell you, because it prints only the second list.
        expect(plannedWallIds).not.toContain('i-a');
    });
});
