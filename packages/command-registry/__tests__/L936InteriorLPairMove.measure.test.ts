/**
 * L-936 / L-942 — TWO INTERIOR WALLS IN AN L; MOVE ONE AND THE OTHER FOLLOWS.
 *
 * ⚠ THIS FILE'S TITLE USED TO END *"…AND THE OTHER DOES NOT FOLLOW. THE
 * MEASUREMENT, COMMITTED BEFORE ANY FIX. NOTHING IS FIXED IN THIS FILE."* Both
 * halves are now false and the second one is why the first is: the measurement
 * DID lead to a fix (C83 §10.6, `53f93049`), and this file was rewritten to
 * assert what the contract requires instead of what the engine used to do. The
 * probe history below is kept verbatim because it is the record of how the
 * discriminator was found — but it is HISTORY, not the current requirement. The
 * current requirement lives in the three §10.6.5 describe blocks at the bottom.
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

/**
 * §10.6.5 assertion 2 — THE L-922 CONTROL'S STEM, and why the base rectangle
 * alone cannot carry that control.
 *
 * The control has to be a junction where a PERIMETER would be dragged if the
 * discriminator were ignored. MEASURED, not assumed: `computeMoveReweldPlan`
 * step 1 only considers a partner whose OWN ENDPOINT lies within `weldTol` of
 * the mover's pre-move segment. In the plain rectangle the only perimeter
 * endpoints are the four rectangle corners, and every one of them is metres
 * away from both interior walls — so moving `i-a`/`i-b` never even OFFERS a
 * perimeter to the corner path, and a "the perimeter did not move" assertion
 * there passes for a reason that has nothing to do with §10.6. That is exactly
 * the "absent or weak control" the contract warns about.
 *
 * `i-c` fixes that with one wall: a diagonal partition landing ON the
 * south-west rectangle corner, so `p-south`'s and `p-west`'s endpoints both sit
 * at distance 0 from the mover and BOTH reach step 6. The junction solve reads
 * (measured, `JunctionResolverV2`):
 *
 *     J0 type=Y degree=3 at=(0.000,0.000) walls=[p-south, i-c, p-west]
 *
 * Y at degree 3 — NOT `L`/2 — which is C83 §10.1 stated as geometry rather than
 * as policy: a closed perimeter polyline already spends a wall at each of its
 * own corners, so an interior wall arriving there can only ever raise the degree
 * to ≥3. **An enclosed perimeter is structurally incapable of presenting as a
 * mutual 2-wall L.** Adding `i-c` leaves J1..J6 byte-identical (measured), so
 * the base fixture's readings are untouched.
 */
const DIAGONAL_STEM: [string, [number, number], [number, number]] =
    ['i-c', [0, 0], [3, 3]];

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

/**
 * ⭐ HOW EVERY ARM BELOW IS OBSERVED RED WITHOUT EDITING SHARED SOURCE.
 *
 * `WallMoveReweldService` reads the discriminator through ONE injected seam —
 * `deps.getJoinedWalls` — so the seam is the honest place to point the engine at
 * the wrong branch. Three readers, all handing the service a well-formed
 * `JoinedWallsQuery`:
 *
 *   'real'    — the actual `semanticGraphManager`. The behaviour under test.
 *   'strip'   — the PRE-§10.6 READER, byte-exactly: same `joinedWallIds`, the
 *               `junctions` array dropped. This is not a mock of the old code,
 *               it IS the old code's return shape, and it is also the shape the
 *               level-scan fallback produces in production. Under it nothing may
 *               follow (§10.6.3 #1 / C70 L-INV-1).
 *   'forge-L2'— a reader that LIES, stamping `L`/2 on every edge including the
 *               interior↔perimeter ones. Used only to prove the L-922 control's
 *               assertion is LIVE: if the discriminator were ignored, that test
 *               fails and a perimeter baseline moves. A control nobody has seen
 *               fail is not a control.
 *
 * This keeps the whole red/green cycle inside the file this lane owns —
 * `WallMoveReweld.ts` is shared with live lanes and is never touched here.
 */
type ReaderMode = 'real' | 'strip' | 'forge-L2';

function makeReader(mode: ReaderMode) {
    return (wallId: string) => {
        const q = semanticGraphManager.getJoinedWalls(wallId) as {
            ok: boolean;
            wallId: string;
            joinedWallIds?: readonly string[];
            junctions?: readonly { wallId: string; junctionType?: string; junctionDegree?: number }[];
            reason?: string;
        };
        if (mode === 'real' || !q.ok) return q as never;
        if (mode === 'strip') {
            return { ok: true, wallId: q.wallId, joinedWallIds: q.joinedWallIds ?? [] } as never;
        }
        return {
            ok: true,
            wallId: q.wallId,
            joinedWallIds: q.joinedWallIds ?? [],
            junctions: (q.joinedWallIds ?? []).map(id => ({
                wallId: id, junctionType: 'L' as const, junctionDegree: 2,
            })),
        } as never;
    };
}

function makeWorld(readerMode: ReaderMode = 'real'): World {
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
        getJoinedWalls: makeReader(readerMode),
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
function buildFixture(
    w: World,
    opts: {
        /** §10.6.5 assertion 2 — add the diagonal partition on the SW corner. */
        withDiagonalStem?: boolean;
        /**
         * §10.6.5 assertion 3, sub-arm (a). `'none'` writes NO `joinedTo` edges,
         * so `getJoinedWalls` answers `{ok:false}` and the service takes its
         * production LEVEL-SCAN fallback — the path that carries no junction
         * metadata at all. Nothing may follow there.
         */
        writeEdges?: 'real' | 'none';
    } = {},
): { junctionDump: string[]; levelWallIds: string[] } {
    const all = [...PERIMETER, ...INTERIOR, ...(opts.withDiagonalStem ? [DIAGONAL_STEM] : [])];
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
    if (opts.writeEdges !== 'none') {
        // THE REAL WRITER, called exactly as `writeJoinedToEdgesForLevel` calls it.
        semanticGraphManager.replaceJoinedToForLevelWalls(
            levelWallIds,
            cache.junctions.map(rec => ({
                junctionType: rec.type,
                junctionDegree: rec.degree,
                wallIds: rec.wallIds,
            })),
        );
    }

    return { junctionDump, levelWallIds };
}

type XZ = [number, number];
const bl2 = (w: World, id: string): [XZ, XZ] => {
    const b = w.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};
/** The FULL stored points, y included — byte-identity is asserted on THIS, not
 *  on a projection that could hide a y-drift. */
const bl3 = (w: World, id: string): string =>
    JSON.stringify(w.wallStore.getById(id)!.baseLine.map(p => [p.x, p.y, p.z]));
const mm = (m: number): number => Math.round(m * 1000);

/**
 * THE REQUIREMENT, COMPUTED INDEPENDENTLY OF THE ENGINE.
 *
 * Intersection of the two INFINITE lines through the given segments — plain
 * Cramer, written here so the expected seat is DERIVED from C83 §10.6.2 ("the
 * welded endpoint goes to the corner") rather than read back off
 * `WallMoveReweld`. Every use below also pins the literal metre value it should
 * produce, so a bug in this helper cannot quietly make an assertion vacuous.
 */
function lineIntersection(a: [XZ, XZ], b: [XZ, XZ]): XZ | null {
    const dax = a[1][0] - a[0][0], daz = a[1][1] - a[0][1];
    const dbx = b[1][0] - b[0][0], dbz = b[1][1] - b[0][1];
    const cross = dax * dbz - daz * dbx;
    if (Math.abs(cross) < 1e-12) return null;
    const t = ((b[0][0] - a[0][0]) * dbz - (b[0][1] - a[0][1]) * dbx) / cross;
    return [a[0][0] + dax * t, a[0][1] + daz * t];
}

/** Unit direction of a segment, rounded to µm — §10.6.2 condition 4's
 *  "direction unchanged" half, asserted rather than assumed from the endpoints. */
function unitDir(s: [XZ, XZ]): [number, number] {
    const dx = s[1][0] - s[0][0], dz = s[1][1] - s[0][1];
    const L = Math.hypot(dx, dz);
    return [Math.round((dx / L) * 1e6), Math.round((dz / L) * 1e6)];
}

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

/**
 * DOES THE BUILDING STILL CLOSE? The worst gap between consecutive perimeter
 * walls' shared endpoints, in metres.
 *
 * `PERIMETER` is wound consistently (each wall's end IS the next wall's start),
 * so a closed ring reads exactly 0. This is asserted IN ADDITION to the
 * byte-identity guard below, and it is not redundant with it: byte-identity says
 * "these four baselines are the ones I wrote", while this says "the shell is a
 * closed polygon". Several tests in this family historically asserted only where
 * walls SAT and never that the building still enclosed anything.
 */
function perimeterRingGapM(w: World): number {
    let worst = 0;
    for (let i = 0; i < PERIMETER.length; i++) {
        const a = bl2(w, PERIMETER[i][0]);
        const b = bl2(w, PERIMETER[(i + 1) % PERIMETER.length][0]);
        worst = Math.max(worst, Math.hypot(a[1][0] - b[0][0], a[1][1] - b[0][1]));
    }
    return worst;
}

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
     * ⚠ AND IT USED TO BE THROWN AWAY ON THE READ — that was the whole of
     * L-942. `getJoinedWalls` returned bare ids and `MoveReweldPartner` was
     * `{id, baseLine}`, so `computeMoveReweldPlan` had to re-derive authorship
     * from geometry alone (`classifyWeldAuthorship`), which cannot see the
     * difference — both are "an endpoint near an endpoint" — and folded the two
     * into one `corner` verdict, refusing BOTH. The evidence that decides the
     * founder's case was computed at the flush and dropped one call later.
     *
     * ✅ CLOSED by C83 §10.6 (`53f93049`): `JoinedWallsQuery` now carries
     * `junctions`, `MoveReweldPartner` carries `junctionType`/`junctionDegree`,
     * and `isMutualCorner` reads them. This test still measures the INDEX and
     * the STORED EDGE — the two products the fix depends on — because the fix is
     * only ever as true as its inputs. What the fix DOES with them is §10.6.5,
     * measured at the stored layer in the next describe block.
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
//
// ⭐ THIS BLOCK WAS REWRITTEN WHEN C83 §10.6 LANDED (`53f93049`), AND THE OLD
//    NAME IS PART OF THE RECORD. It used to read *"the partner is REACHED, and
//    then deliberately left behind"*, and its `expect(partnerAfter).toEqual(
//    partnerBefore)` was TRUE — for a pair the engine could not tell from an
//    incumbent, because `getJoinedWalls` binned the discriminator before the
//    engine ever saw it. The measurement did not rot; the SUBJECT changed. The
//    numbers below are therefore DERIVED from §10.6.2 — the analytic
//    intersection of the partner's line with the mover's NEW line — and never
//    read back off the implementation.
//
// §10.6.5 makes three assertions mandatory, and all three live here:
//
//   1. THE FOLLOW HAPPENS, AT THE STORED LAYER — `WallStore` after dispatch, on
//      a mutual L/degree-2 pair, seated at the analytic intersection, with the
//      FAR endpoint byte-identical and the direction unchanged (it PIVOTS; it
//      does not translate). IN BOTH DRAG DIRECTIONS — the follow is symmetric
//      (`6c676413`); see the gesture table's header for why the asymmetric first
//      draft was itself a bug and how a round-trip probe caught it.
//   2. THE L-922 CONTROL — a degree-3 interior↔perimeter join in the same
//      fixture comes out byte-identical. L-922 was an interior move dragging a
//      PERIMETER baseline 2.19 m and re-seating three hosted doors, one clamped
//      to offset 0.000. This is the assertion that makes the carve-out safe, so
//      it is also the one shown FAILING (reader `'forge-L2'`) before it is
//      trusted.
//   3. ABSENT METADATA TAKES THE PRE-§10.6 BRANCH BYTE-IDENTICALLY — §10.6.3 #1
//      and C70 L-INV-1: a missing discriminator is "I could not determine",
//      never "L". Measured on BOTH production shapes that produce it.
// ════════════════════════════════════════════════════════════════════════════

/**
 * `i-a`'s pre-move LINE, as a constant, so the expected seat can be stated in
 * metres AND cross-checked against the analytic helper.
 *
 * ⚠ It is the LINE, not the stored segment: `i-a`'s stored start reads
 * `(4, 0.100)`, its foot having been trimmed onto `p-south`'s face by the join
 * pass at build time. `x = 4` for BOTH stored endpoints either way, which is the
 * only property the derivation below leans on — and that property is ASSERTED in
 * each arm rather than assumed, so a future fixture change cannot make the
 * literal expectations quietly wrong.
 */
const I_A_BEFORE: [XZ, XZ] = [[4, 0], [4, 5]];

describe('C83 §10.6.5 #1 — the mutual L/degree-2 partner FOLLOWS, and the follow is a PIVOT', () => {
    /**
     * ⭐ THE ASSERTIONS IN THIS BLOCK HAVE NOW BEEN REVERSED THREE TIMES. READ
     *    THIS BEFORE FLIPPING THEM A FOURTH.
     *
     *   1. ORIGINAL (pre-2026-08-15). The neighbour LENGTHENED to meet the mover
     *      — the partner-entry branch in `computeMoveReweldPlan`, applied to
     *      every partner alike.
     *   2. C83 §10.2.2 (2026-08-15) REVERSED IT: nothing follows, the incumbent
     *      is never ours to move. That was minted from L-922 — an interior move
     *      rewrote a PERIMETER's `baseLine[0]` by 2.19 m and re-seated three
     *      hosted doors off the moved datum, one clamped to offset 0.000.
     *   3. C83 §10.6 (2026-08-17, `53f93049`) RE-REVERSED IT — **for mutual
     *      L/degree-2 corners ONLY.**
     *
     * §10.2.2 was RIGHT about L-922 and OVER-BROAD everywhere else, and the
     * reason it had to be over-broad is the interesting part: a MUTUAL corner
     * (two interior walls that jointly own the corner) and a TERMINATING corner
     * (a newcomer arriving at an incumbent) are GEOMETRICALLY THE SAME PICTURE.
     * `classifyWeldAuthorship` folds them into one `corner` verdict because from
     * geometry alone nothing else is possible. The separator was never geometric
     * — it is STORED, on the `joinedTo` edge (`junctionType`/`junctionDegree`),
     * and `getJoinedWalls` was BINNING it on the read. With no discriminator the
     * only safe rule was "refuse both", so the founder's L-pair paid for the
     * perimeter's regression. §10.6 threads the discriminator through; the
     * carve-out is exactly as wide as `isMutualCorner`, and §10.6.5 #2 below is
     * the control that proves it did not swallow L-922 again.
     *
     * ── THE SYMMETRY, WHICH WAS ITSELF A BUG FIRST (`6c676413`) ──────────────
     *
     * §10.6's FIRST DRAFT let the partner follow only when the corner fell PAST
     * its end — a lengthening — because the new branch sat INSIDE the `beyond >
     * ON_SEGMENT_EPS_M` arm. This table encoded that asymmetry as a REQUIREMENT
     * ("INTO the partner ⇒ stationary; a follow here would be a BUG"), and the
     * reasoning read plausibly: on the INTO leg the corner already lies on the
     * partner's body, so the joint closes at no cost to the partner.
     *
     * **A round-trip probe refuted it.** Drag out, the partner follows; drag back
     * the same distance, and the partner stays long with a stub poking past the
     * corner — the wall does not return to where it started. A gesture that does
     * not undo itself is not a gesture, and "closing the joint costs the partner
     * nothing" was measuring the JOINT while the user was looking at the WALL.
     * The `beyond` test exists to stop an INCUMBENT being lengthened; a mutual
     * partner is a CO-OWNER of the corner, so that test does not apply to it in
     * either direction. The branch moved above `beyond` and the follow became
     * symmetric: the welded endpoint seats on the intersection whether that
     * SHORTENS or LENGTHENS the partner.
     *
     * So all four gestures below now pivot, and the two directions are no longer
     * different outcomes — they are the same rule with opposite sign.
     *
     * ── THE DERIVATION (arithmetic shown; nothing read off the engine) ───────
     *
     * `i-a` is stored on the line `x = 4`. `i-b` is horizontal on `z = 5`, so a
     * translation by `(dx, dz)` puts it on `z = 5 + dz` REGARDLESS of `dx` — a
     * horizontal line slid horizontally is the same line. The intersection of
     * `x = 4` with `z = 5 + dz` is therefore
     *
     *     (4, 5 + dz)   →   dz = −0.6 ⇒ (4, 4.4)      [partner SHORTENS 600 mm]
     *                       dz = +0.6 ⇒ (4, 5.6)      [partner LENGTHENS 600 mm]
     *
     * which is why the two oblique drags land on the same seats as the two
     * perpendicular ones. Each arm asserts that literal AND the analytic
     * intersection recomputed from the STORED geometry, so neither a bug in the
     * helper nor a typo in the literal can make an arm vacuous.
     *
     * The sweep keeps its oblique arms because a gizmo drag is not guaranteed to
     * be a pure perpendicular translation, and because at θ = 90° the
     * perpendicular case is degenerate under L-932's cot θ law.
     */
    const GESTURES: Array<{
        name: string; dx: number; dz: number;
        /** The seat, in metres, stated independently of the analytic helper. */
        expectedWeldedXZ: XZ;
        /** Which way the partner's own length goes — narrative only, but it is
         *  the half the asymmetric first draft got wrong, so it is named. */
        sense: 'shortens' | 'lengthens';
    }> = [
        { name: 'perpendicular, INTO the partner (−z 0.6)',  dx: 0,    dz: -0.6, expectedWeldedXZ: [4, 4.4], sense: 'shortens' },
        { name: 'perpendicular, AWAY from partner (+z 0.6)', dx: 0,    dz: +0.6, expectedWeldedXZ: [4, 5.6], sense: 'lengthens' },
        { name: 'oblique drag (−0.4, −0.6)',                 dx: -0.4, dz: -0.6, expectedWeldedXZ: [4, 4.4], sense: 'shortens' },
        { name: 'oblique drag (+0.4, +0.6)',                 dx: +0.4, dz: +0.6, expectedWeldedXZ: [4, 5.6], sense: 'lengthens' },
    ];

    for (const g of GESTURES) {
        it(`MEASURE [${g.name}]: i-a's STORED baseline after moving i-b — it PIVOTS to (${g.expectedWeldedXZ[0]}, ${g.expectedWeldedXZ[1]}) and ${g.sense}`, () => {
            world = makeWorld();
            buildFixture(world);
            const roomsBefore = redetect(world);

            const partnerBefore = bl2(world, 'i-a');
            const partnerBefore3 = bl3(world, 'i-a');
            const perimBefore = PERIMETER.map(([id]) => [id, bl3(world!, id)] as const);
            const ringGapBefore = perimeterRingGapM(world);

            const res = moveWall(world, 'i-b', g.dx, g.dz);
            expect(res.success).toBe(true);

            const partnerAfter = bl2(world, 'i-a');
            const moverAfter = bl2(world, 'i-b');

            // ── STAGE C — what the dispatch actually built ───────────────────
            console.log(
                `[§10.6.5 #1 ${g.name}] plans=${JSON.stringify(world.capture.plans)} ` +
                `consequences=${JSON.stringify(world.capture.consequences.map(c => `${c.stage}/${c.reason}→[${c.partnerIds}]`))}`,
            );

            // ── STAGE D — THE STORED LAYER ──────────────────────────────────
            const gap = cornerGap(partnerAfter[1], moverAfter[0], moverAfter[1]);
            const offBody = distToSegment(partnerAfter[1], moverAfter[0], moverAfter[1]);
            const roomsAfter = redetect(world);
            const ringGapAfter = perimeterRingGapM(world);
            console.log(
                `[§10.6.5 #1 ${g.name}] STORED i-a = ${JSON.stringify(partnerAfter)} ` +
                `(was ${JSON.stringify(partnerBefore)}) | STORED i-b = ${JSON.stringify(moverAfter)}`,
            );
            console.log(
                `[§10.6.5 #1 ${g.name}] i-a's shared endpoint → i-b's body: ` +
                `offBody=${mm(offBody)}mm cornerGap=${mm(gap)}mm | rooms ${roomsBefore} → ${roomsAfter} ` +
                `| perimeter ring gap ${mm(ringGapBefore)}mm → ${mm(ringGapAfter)}mm`,
            );

            // ── THE REQUIREMENT, DERIVED — never read off the implementation.
            //    §10.6.2: the welded endpoint goes to the intersection of the
            //    PARTNER's line with the MOVER's NEW line. Both inputs are read
            //    from the STORE (`partnerBefore` is i-a as it actually stood,
            //    trimmed foot and all), so this is the fixture's own arithmetic
            //    and not a restatement of the engine's.
            const analytic = lineIntersection(partnerBefore, moverAfter);
            expect(analytic).not.toBeNull();
            console.log(
                `[§10.6.5 #1 ${g.name}] analytic intersection (i-a's line ∩ i-b's NEW line) = ` +
                `(${analytic![0].toFixed(4)}, ${analytic![1].toFixed(4)}) | literal requirement = ` +
                `(${g.expectedWeldedXZ[0]}, ${g.expectedWeldedXZ[1]})`,
            );

            // 0) THE ANCHOR FOR THE LITERAL. The derivation in the table header
            //    says "i-a is the line x = 4". That is a claim about the FIXTURE,
            //    so it is measured, not assumed — otherwise a future change to
            //    the fixture would leave the literals silently describing a
            //    building that no longer exists.
            expect([partnerBefore[0][0], partnerBefore[1][0]])
                .toEqual([I_A_BEFORE[0][0], I_A_BEFORE[1][0]]);

            // 1) THE FOLLOW, at the STORED layer, seated on the intersection.
            //    `bl2` reads `wallStore.getById(...)` AFTER dispatch — never a
            //    plan, never a pure function's return. A plan computed and not
            //    applied is exactly what L-921 was.
            expect(mm(partnerAfter[1][0])).toBe(mm(analytic![0]));
            expect(mm(partnerAfter[1][1])).toBe(mm(analytic![1]));
            //    …and on the independently-stated metre value.
            expect(mm(partnerAfter[1][0])).toBe(mm(g.expectedWeldedXZ[0]));
            expect(mm(partnerAfter[1][1])).toBe(mm(g.expectedWeldedXZ[1]));
            //    It genuinely MOVED — guards against a vacuous pass if the
            //    intersection ever coincided with the old endpoint. THE SIGN IS
            //    THE SYMMETRY: `shortens` arms land 600 mm below the old seat,
            //    `lengthens` arms 600 mm above it, and the magnitude is the same
            //    600 mm both ways.
            expect(mm(partnerAfter[1][1]) - mm(partnerBefore[1][1]))
                .toBe(g.sense === 'shortens' ? -600 : +600);

            // 2) §10.6.2 CONDITION 4 — IT PIVOTS, IT DOES NOT TRANSLATE.
            //    The FAR endpoint is byte-identical. This is the whole
            //    difference from L-922, which rewrote `baseLine[0]` — the
            //    datum every hosted opening's offset is measured from.
            expect(partnerAfter[0]).toEqual(partnerBefore[0]);
            expect(JSON.parse(bl3(world, 'i-a'))[0])
                .toEqual(JSON.parse(partnerBefore3)[0]);

            // 3) …and the DIRECTION is unchanged, which is what makes it an
            //    extend/shrink along its own line rather than a rotation.
            expect(unitDir(partnerAfter)).toEqual(unitDir(partnerBefore));

            // 4) THE CORNER IS ACTUALLY CLOSED, and closed AS A CORNER. The
            //    founder's visible symptom was a 600 mm hanging corner, so
            //    `offBody = 0` (i-a's end is on i-b's body) is the minimum. The
            //    `cornerGap = 0` half is stronger and is the one that matches
            //    what a mutual L means: i-a's end meets i-b's END, not a point
            //    part-way along it. An L that closed onto i-b's mid-span would
            //    be a T, i.e. a different building.
            expect(mm(offBody)).toBe(0);
            expect(mm(gap)).toBe(0);

            // 5) THE BUILDING STILL CLOSES. Rooms are re-detected from scratch
            //    after the move and the count must survive; the perimeter ring
            //    must still be a closed polygon. Asserting only where the two
            //    interior walls SIT would pass just as happily on a shell that
            //    had come apart.
            expect(roomsAfter).toBe(roomsBefore);
            expect(mm(ringGapAfter)).toBe(mm(ringGapBefore));
            expect(mm(ringGapAfter)).toBe(0);

            // 6) THE BLANKET PERIMETER GUARD. Cheap, always on, and it holds for
            // every gesture: no interior move may write a perimeter baseline.
            // (It is NOT the L-922 control — measured, none of these four
            // perimeters is even offered to the corner path here, because no
            // perimeter ENDPOINT lies within weldTol of i-b. The control that
            // does discriminate is §10.6.5 #2 below.)
            for (const [id, before] of perimBefore) {
                expect(`${id}:${bl3(world, id)}`).toBe(`${id}:${before}`);
            }
        });
    }

    /**
     * THE SAME RULE ON THE OTHER ENDPOINT. Above, the partner welds at
     * `baseLine[1]`. Here `i-a` is the mover and `i-b` the partner, so the seat
     * lands on `baseLine[0]` — the `weldedIsStart` branch, and *literally the
     * field L-922 corrupted*. It has to work, and it has to work without
     * touching `baseLine[1]`.
     *
     * Derivation: `i-a` translates −0.6 in x, so its new line is `x = 3.4`.
     * `i-b`'s line is `z = 5`. Intersection `(3.4, 5)`, which is 600 mm PAST
     * `i-b`'s start `(4,5)` — the partner must lengthen, and being L/degree-2 it
     * may. Expected stored `i-b` = `[[3.4,5],[10,5]]`.
     */
    it('MEASURE [mover = i-a, −x 0.6]: the pivot also works on baseLine[0] — the field L-922 corrupted', () => {
        world = makeWorld();
        buildFixture(world);

        const partnerBefore = bl2(world, 'i-b');
        const partnerBefore3 = bl3(world, 'i-b');
        const perimBefore = PERIMETER.map(([id]) => [id, bl3(world!, id)] as const);

        expect(moveWall(world, 'i-a', -0.6, 0).success).toBe(true);

        const partnerAfter = bl2(world, 'i-b');
        const moverAfter = bl2(world, 'i-a');
        const analytic = lineIntersection(partnerBefore, moverAfter)!;
        console.log(
            `[§10.6.5 #1 start-pivot] STORED i-b = ${JSON.stringify(partnerAfter)} ` +
            `(was ${JSON.stringify(partnerBefore)}) | STORED i-a = ${JSON.stringify(moverAfter)} ` +
            `| analytic = (${analytic[0].toFixed(4)}, ${analytic[1].toFixed(4)})`,
        );

        // Seated on the analytic intersection, and on the derived metre value.
        expect([mm(partnerAfter[0][0]), mm(partnerAfter[0][1])])
            .toEqual([mm(analytic[0]), mm(analytic[1])]);
        expect([mm(partnerAfter[0][0]), mm(partnerAfter[0][1])]).toEqual([3400, 5000]);
        // FAR endpoint byte-identical, direction unchanged.
        expect(JSON.parse(bl3(world, 'i-b'))[1]).toEqual(JSON.parse(partnerBefore3)[1]);
        expect(partnerAfter[1]).toEqual(partnerBefore[1]);
        expect(unitDir(partnerAfter)).toEqual(unitDir(partnerBefore));
        for (const [id, before] of perimBefore) {
            expect(`${id}:${bl3(world, id)}`).toBe(`${id}:${before}`);
        }
    });

    it('MEASURE: the AWAY gesture now puts the partner IN the dispatched plan — the count in the log was about ENTRIES', () => {
        world = makeWorld();
        buildFixture(world);

        const q = semanticGraphManager.getJoinedWalls('i-b');
        expect(q.ok).toBe(true);
        const partnersSeen = q.ok ? [...q.joinedWallIds] : [];

        moveWall(world, 'i-b', 0, +0.6);

        const plannedWallIds = world.capture.plans.flatMap(p => p.wallIds);
        console.log(
            `[§10.6.5 #1 plan] partners the graph handed the engine = [${partnersSeen.join(', ')}] ` +
            `| wallIds in the dispatched plan = [${plannedWallIds.join(', ')}]`,
        );

        expect(partnersSeen).toContain('i-a');
        // …and NOW the plan names it too. Pre-§10.6 this read `.not.toContain`,
        // and that gap between "the graph named a partner" and "the plan carries
        // one" is precisely what the founder's console line could not show.
        expect(plannedWallIds).toContain('i-a');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §10.6.5 #2 — THE L-922 CONTROL. The assertion that makes the carve-out safe.
// ════════════════════════════════════════════════════════════════════════════

/** 0.6 m perpendicular to the 45° stem: the drag that pushes the SW corner
 *  junction off the end of `p-west`. Stated as an exact expression, not a
 *  rounded decimal, so the analytic seat below is exact too. */
const STEM_DRAG = 0.6 / Math.SQRT2;

describe('C83 §10.6.5 #2 — THE L-922 CONTROL: a degree-3 interior↔perimeter join does NOT follow', () => {
    /**
     * THE REGRESSION THIS GUARDS. L-922: an interior wall was moved, the engine
     * rewrote a PERIMETER wall's `baseLine[0]` by 2.19 m, and three hosted doors
     * were re-seated off that moved datum — one clamped to offset 0.000, i.e.
     * silently shoved to the wall's end. §10.6 re-opens the exact code path that
     * did it (step 6's "the joint can only close if the partner lengthens"
     * branch), and the ONLY thing standing between the two is
     * `isMutualCorner` — `junctionType === 'L' && junctionDegree === 2`.
     *
     * THE GEOMETRY IS DELIBERATELY IDENTICAL TO THE FOLLOWING CASE. `i-c`'s
     * endpoint sits exactly on `p-west`'s endpoint, the drag is perpendicular,
     * the new corner lands past the incumbent's end, and steps 3, 4, 5 and the
     * reversal check all PASS. The plan reaches the discriminator with nothing
     * else left to stop it. That is the point: a mutual corner and a terminating
     * corner are THE SAME PICTURE, and only the stored metadata separates them.
     *
     * Derivation of what a BROKEN discriminator would produce, so the control
     * has a known FAILURE value and not only a known pass value: `i-c`'s new
     * line is `z = x − 2·(0.6/√2)`, which meets `p-west`'s line `x = 0` at
     * `z = −0.8485`. A perimeter corner dragged 848 mm below the building. That
     * is exactly what reader `'forge-L2'` produces in the next test.
     */
    it('MEASURE: moving i-c leaves BOTH perimeters at the degree-3 corner byte-identical', () => {
        world = makeWorld();
        const { junctionDump } = buildFixture(world, { withDiagonalStem: true });

        const swCorner = junctionDump.find(l => l.includes('at=(0.000,0.000)'));
        console.log(`[§10.6.5 #2] SW junction = ${swCorner}`);
        // The discriminator, MEASURED — not degree 2, not type L, so
        // `isMutualCorner` must read false for both perimeters.
        expect(swCorner).toContain('degree=3');
        expect(swCorner).not.toContain('type=L');
        // C83 §10.1 as geometry: a closed perimeter spends a wall at each of its
        // own corners, so an interior arrival can only push the degree to ≥3.
        expect(swCorner).toContain('p-west');
        expect(swCorner).toContain('p-south');
        expect(swCorner).toContain('i-c');

        const before = new Map(
            [...PERIMETER.map(([id]) => id), 'i-a', 'i-b'].map(id => [id, bl3(world!, id)]),
        );

        expect(moveWall(world, 'i-c', +STEM_DRAG, -STEM_DRAG).success).toBe(true);

        console.log(
            `[§10.6.5 #2] STORED p-west = ${bl3(world, 'p-west')} (was ${before.get('p-west')})`,
        );
        console.log(
            `[§10.6.5 #2] consequences = ${JSON.stringify(world.capture.consequences)}`,
        );

        // ⭐ THE CONTROL. Byte-identical — every point, y included.
        for (const [id, b] of before) {
            expect(`${id}:${bl3(world, id)}`).toBe(`${id}:${b}`);
        }

        // …and the refusal is REPORTED, not silently dropped. A junction the
        // engine will not close is a fact the user must be told (L-921); a
        // control that only proves "nothing moved" cannot tell a correct refusal
        // from a partner that was never considered at all.
        const dump = JSON.stringify(world.capture.consequences);
        expect(dump).toContain('INCUMBENT_EXTENSION_REQUIRED');
        expect(dump).toContain('p-west');
    });

    /**
     * THE CONTROL'S OWN CONTROL — proof the assertion above is LIVE.
     *
     * §10.6.5 #2 is only worth anything if it CAN fail. Here the graph reader is
     * swapped for one that lies, stamping `L`/degree-2 on every edge including
     * the interior↔perimeter ones, while the geometry, the gesture and the
     * engine are untouched. The discriminator is then the only variable in the
     * experiment — and the perimeter moves 848 mm, straight out of the
     * derivation above. L-922, reproduced on demand.
     *
     * This is also the honest statement of the carve-out's blast radius: §10.6
     * is exactly as safe as `getJoinedWalls`'s metadata is truthful, and nothing
     * downstream re-checks it.
     */
    it('MEASURE [reader lies: L/2 on every edge]: the perimeter IS dragged — so the control above is not vacuous', () => {
        world = makeWorld('forge-L2');
        buildFixture(world, { withDiagonalStem: true });

        const pWestBefore = bl2(world, 'p-west');
        expect(moveWall(world, 'i-c', +STEM_DRAG, -STEM_DRAG).success).toBe(true);
        const pWestAfter = bl2(world, 'p-west');

        console.log(
            `[§10.6.5 #2 forged] STORED p-west = ${JSON.stringify(pWestAfter)} ` +
            `(was ${JSON.stringify(pWestBefore)})`,
        );

        // p-west is stored (0,8) → (0,0); the welded end is `baseLine[1]`, and it
        // is dragged to the intersection with i-c's new line, z = −2·(0.6/√2).
        expect(pWestAfter).not.toEqual(pWestBefore);
        expect(mm(pWestAfter[1][1])).toBe(mm(-2 * STEM_DRAG));
        // …and the FAR end still holds, which is why this reads as L-922 rather
        // than as wholesale corruption: a pivot performed on the wrong wall.
        expect(pWestAfter[0]).toEqual(pWestBefore[0]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §10.6.5 #3 — ABSENT METADATA TAKES THE PRE-§10.6 BRANCH, BYTE-IDENTICALLY.
// ════════════════════════════════════════════════════════════════════════════

describe('C83 §10.6.5 #3 — a missing discriminator is "I could not determine", never "L"', () => {
    /**
     * §10.6.3 #1 / C70 L-INV-1. Two production shapes produce a partner with no
     * junction metadata, and NEITHER may follow:
     *
     *   (a) THE LEVEL-SCAN FALLBACK. `getJoinedWalls` refuses (the wall is not
     *       covered by any flush yet), the service falls back to every wall on
     *       the level and resolves partners GEOMETRICALLY. There is no junction
     *       record to read, `junctionById` stays empty, and `isMutualCorner`
     *       reads false. This arm matters most: it is reached on every move that
     *       happens before the first `joinedTo` flush.
     *
     *   (b) A READER THAT ANSWERS WITHOUT `junctions` — the pre-§10.6 reader,
     *       byte-exactly, which is also what any older or injected graph
     *       satisfying `ReweldJoinedWallsQuery` hands over (the field is
     *       OPTIONAL on that mirror, so this is a reachable production shape and
     *       not a hypothetical).
     *
     * The gesture is the one that DOES follow when the metadata is present
     * (`i-b`, +z 0.6 → `i-a` pivots to z = 5.6), so "nothing followed" here
     * cannot be an artefact of picking a gesture that never follows anyway.
     */
    it('MEASURE (a) level-scan fallback — the graph refuses, so NOTHING follows', () => {
        world = makeWorld();
        buildFixture(world, { writeEdges: 'none' });

        // The precondition, measured rather than assumed: the graph REFUSES.
        const q = semanticGraphManager.getJoinedWalls('i-b');
        console.log(`[§10.6.5 #3a] getJoinedWalls('i-b') = ${JSON.stringify(q)}`);
        expect(q.ok).toBe(false);

        const before = new Map(
            [...PERIMETER.map(([id]) => id), 'i-a'].map(id => [id, bl3(world!, id)]),
        );
        expect(moveWall(world, 'i-b', 0, +0.6).success).toBe(true);

        console.log(`[§10.6.5 #3a] STORED i-a = ${bl3(world, 'i-a')} (was ${before.get('i-a')})`);
        for (const [id, b] of before) {
            expect(`${id}:${bl3(world, id)}`).toBe(`${id}:${b}`);
        }
    });

    it('MEASURE (b) the reader answers WITHOUT `junctions` — the pre-§10.6 reader, byte-exactly', () => {
        world = makeWorld('strip');
        buildFixture(world);

        // The graph itself DOES carry the discriminator. This arm therefore
        // proves the engine turns on what the READER hands it, so a reader that
        // drops the field cannot silently inherit the new branch.
        const stored = semanticGraphManager
            .getRelationships('i-b')
            .find(r => r.type === 'joinedTo' && r.targetId === 'i-a');
        expect(stored?.metadata).toMatchObject({ junctionType: 'L', junctionDegree: 2 });

        const before = new Map(
            [...PERIMETER.map(([id]) => id), 'i-a'].map(id => [id, bl3(world!, id)]),
        );
        expect(moveWall(world, 'i-b', 0, +0.6).success).toBe(true);

        console.log(`[§10.6.5 #3b] STORED i-a = ${bl3(world, 'i-a')} (was ${before.get('i-a')})`);
        for (const [id, b] of before) {
            expect(`${id}:${bl3(world, id)}`).toBe(`${id}:${b}`);
        }
    });
});
