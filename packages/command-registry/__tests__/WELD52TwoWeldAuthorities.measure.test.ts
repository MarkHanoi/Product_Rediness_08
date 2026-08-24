// §WELD52-COUNT-THE-EVENTS — ISSUE-LOG L-10831, and the census behind L-10830.
//
// WHAT THE FOUNDER REPORTED (production console, `bc3aa61b`, 2026-08-24)
// ----------------------------------------------------------------------------
// ONE wall drag. Read the ORDER:
//
//   [SlabWallConnectivityService] §L-925-DIRECTION-STABLE wall …ENM2FR: the new
//      corner (17.900, 12.572) lies PAST this wall's far endpoint … span
//      [17.900, 12.572] → [17.900, 9.471].
//   EXECUTE: UPDATE_WALL_BASELINE
//   [SlabWallConnectivityService] §L-925-DIRECTION-STABLE wall …ENM2FR: (IDENTICAL)
//   EXECUTE: CASCADE_WALL_BASELINE
//
// Same wall, same corner, same span, TWICE, for one gesture — and nothing in
// either line to tell a reader that one of the two is a DRY RUN that dispatches
// nothing. **A reader counts events.** The founder counted two welds.
//
// WHAT THIS FILE ESTABLISHES, AND WHY IT IS A CENSUS AND NOT A COMPLAINT
// ----------------------------------------------------------------------------
// It answers the question the brief posed as *"is the double `§L-925` a double
// RUN or a double LOG?"* with a MEASUREMENT rather than a reading of the source,
// because the two have different fixes and the source alone does not settle
// which is happening in a live gesture.
//
// The answer is BOTH-AND-NEITHER, which is why it needed measuring:
//
//   · `planWeldEntriesForSlab` genuinely RUNS TWICE per gesture — once as the
//     pre-flight (`previewSlabConnectivityWeld`, which `wallPlacementGate
//     .gateWallMove` consults BEFORE the wall is allowed to move) and once from
//     the store subscriber (`onWallUpdated`) after it has. That is by design and
//     is documented as such: the pre-flight exists so a weld that must REFUSE
//     refuses before the model changes (§L-921-SLAB-PREFLIGHT), which is the fix
//     for a half-executed gesture. **It must not be collapsed to one run.**
//
//   · Only ONE of the two DISPATCHES. The pre-flight never mutates — its shim's
//     `update` throws by construction.
//
// So the defect is neither "runs twice" nor "logs twice" but **logs twice
// without distinguishing the prediction from the record**. The fix is a LABEL,
// not a deletion: both lines are kept, because the pre-flight's line is exactly
// what makes a pre-move refusal explicable.
//
// ⭐ AND THE SECOND CENSUS IS THE MORE IMPORTANT ONE: §TWO-AUTHORITIES counts
// how many distinct services emit a weld for ONE gesture. The answer is TWO, and
// it is DECLARED (engineLauncher §03 orders them on purpose) rather than
// accidental. It is pinned here so that `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT`
// is never again read as a render defect — it is the FOOTPRINT of the first
// authority, observed by the second.
//
// ⚠ EXPECTED TO FAIL ON `ecc3a643` (HEAD before the fix): §ONE-COMMIT-PASS and
// §PASS-IS-LABELLED both fail there — HEAD emits two byte-identical lines and
// zero labelled ones.
//
// REAL, imported from production, never re-implemented: WallStore
// (geometry-wall), SlabStore + SlabWallConnectivityService +
// previewSlabConnectivityWeld + traceRegionSketchAtPoint (geometry-slab),
// CommandManager + UpdateWallBaselineCommand (command-registry). Harness shape is
// `slabWeldPastEndpointReversal.measure.test.ts`'s, deliberately — a divergence
// here is then a divergence in the SUBJECT, not in the fixture.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import {
    SlabStore,
    SlabWallConnectivityService,
    previewSlabConnectivityWeld,
    traceRegionSketchAtPoint,
    type RegionWallLike,
    type SlabData,
    type SlabSketch,
} from '@pryzm/geometry-slab';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';

const LEVEL = 'L0';

// ── harness ──────────────────────────────────────────────────────────────────

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
        registered,
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

function regionSlab(id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData {
    return {
        id, type: 'slab', levelId: LEVEL, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 }, polygon: ring, sketch,
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

/** Which service spoke, and how many times it DISPATCHED. */
interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    cm: CommandManager;
    /** Every `CascadeWallBaselineCommand` the slab service handed the manager. */
    slabDispatches: string[];
    dispose(): void;
}

function makeWorld(): World {
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();

    const ctx = {
        stores: { wallStore, slabStore },
        bimManager: makeBimManager(),
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    Object.assign(window, { wallStore });   // WallFaceResolver reads this global

    const slabDispatches: string[] = [];
    const recording = {
        execute: (command: never, metadata?: never) => {
            const cmd = command as unknown as {
                serialize?: () => { payload?: { cause?: string } };
            };
            slabDispatches.push(cmd.serialize?.().payload?.cause ?? '(none)');
            return cm.execute(command, metadata);
        },
        isReverting: () => cm.isReverting(),
    };

    const slabService = new SlabWallConnectivityService(
        slabStore,
        wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
        () => false,
        recording as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[3],
    );
    slabService.bootstrap();

    return {
        wallStore, slabStore, cm, slabDispatches,
        dispose() {
            slabService.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

const asRegionWalls = (ws: WallStore): RegionWallLike[] =>
    ws.getAll().map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));

/**
 * The founder's ground, from `slabWeldPastEndpointReversal.measure.test.ts`:
 * a 6×4 perimeter loop. `w-west` is dragged +7 m in x, i.e. PAST `w-south`'s far
 * end at x = 6 — which is exactly the condition `§L-925-DIRECTION-STABLE` fires
 * on, and the condition the founder's console shows.
 */
function buildLoop(world: World): void {
    world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
    world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
    world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
    world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
    const traced = traceRegionSketchAtPoint(asRegionWalls(world.wallStore), 3, 2)!;
    expect(traced, 'the 6x4 loop must trace a region for the slab').not.toBeNull();
    world.slabStore.add(regionSlab('slab-loop', traced.sketch, traced.ring));
    semanticGraphManager.replaceJoinedToForLevelWalls(
        ['w-south', 'w-east', 'w-north', 'w-west'],
        [
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-south', 'w-east'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-east', 'w-north'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-north', 'w-west'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-west', 'w-south'] },
        ] as never,
    );
}

/**
 * ONE user gesture, in the two passes production actually runs it in:
 *
 *   1. the PRE-FLIGHT that `wallPlacementGate.gateWallMove` consults before the
 *      wall is permitted to move (`previewSlabConnectivityWeld`), and
 *   2. the COMMIT, whose store write wakes the subscriber.
 *
 * Console output is captured across BOTH, because the founder's console is one
 * transcript and the defect is only visible when the two passes are read
 * together.
 */
function oneGesture(world: World, dx: number): { lines: string[]; moveOk: boolean } {
    const w = world.wallStore.getById('w-west')!;
    const newBaseLine = [
        { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z },
        { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z },
    ] as const;

    const lines: string[] = [];
    const realLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
    let moveOk = false;
    try {
        // PASS 1 — the gate's dry run. Dispatches nothing, by construction.
        previewSlabConnectivityWeld({
            slabStore: world.slabStore as never,
            wallStore: world.wallStore as never,
            movedWallId: 'w-west',
            newBaseLine: newBaseLine as never,
        });
        // PASS 2 — the commit, which wakes `onWallUpdated`.
        const res = world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'w-west',
            newBaseLine: newBaseLine as never,
        })) as { success?: boolean };
        moveOk = res?.success === true;
    } finally {
        console.log = realLog;
    }
    return { lines, moveOk };
}

const l925 = (lines: string[]): string[] =>
    lines.filter(l => l.includes('§L-925-DIRECTION-STABLE'));

/**
 * §L-925 emissions naming ONE wall — which is the unit the founder's console
 * actually shows. `w-west` has TWO slab-loop partners (`w-south`, `w-north`), so
 * the whole-gesture count is 2 partners x 2 passes = 4. The transcript that was
 * reported is the per-wall slice of that, and it read as two welds of one wall.
 * Both units are asserted below, so the next reader cannot confuse them.
 */
const l925For = (lines: string[], wallId: string): string[] =>
    l925(lines).filter(l => l.includes(`wall ${wallId}:`));

let world: World | undefined;

beforeEach(() => { semanticGraphManager.clear(); });
afterEach(() => { world?.dispose(); world = undefined; });

// ════════════════════════════════════════════════════════════════════════════
// §COUNT-THE-EVENTS — one gesture, two passes, and which of them wrote
// ════════════════════════════════════════════════════════════════════════════

describe('§WELD52 §COUNT-THE-EVENTS — the double §L-925 is a double RUN, one DISPATCH', () => {
    it('§DOUBLE-RUN: one gesture emits §L-925 exactly TWICE — the founder\'s transcript', () => {
        world = makeWorld();
        buildLoop(world);

        const { lines } = oneGesture(world, 7);

        // The census, at the unit the founder read it: ONE wall, spoken about
        // TWICE. This is his "IDENTICAL LINE AGAIN", measured.
        for (const wallId of ['w-south', 'w-north']) {
            const per = l925For(lines, wallId);
            expect(
                per.length,
                `wall ${wallId} must be spoken about exactly twice per gesture ` +
                `(pre-flight + commit); got ${per.length}:\n${per.join('\n')}`,
            ).toBe(2);
        }

        // And the whole-gesture total, pinned so the two units cannot be
        // conflated: 2 slab-loop partners x 2 passes.
        expect(
            l925(lines).length,
            `2 slab-loop partners x 2 passes = 4; got:\n${l925(lines).join('\n')}`,
        ).toBe(4);
    });

    it('§ONE-DISPATCH: only ONE of the two passes writes anything', () => {
        world = makeWorld();
        buildLoop(world);

        oneGesture(world, 7);

        // The pre-flight's shim `update` throws by construction, so a second
        // dispatch here would be a real double-write and not a logging defect.
        expect(
            world.slabDispatches.length,
            `the slab service must dispatch exactly one cascade per gesture; got ` +
            `[${world.slabDispatches.join(', ')}]`,
        ).toBe(1);
        expect(world.slabDispatches[0]).toBe('slab-connectivity');
    });

    it('§PASS-IS-LABELLED: every §L-925 line names the pass that produced it', () => {
        world = makeWorld();
        buildLoop(world);

        const emissions = l925(oneGesture(world, 7).lines);
        for (const line of emissions) {
            expect(
                /\[(PRE-FLIGHT|COMMIT)\]/.test(line),
                `a §L-925 line must name its pass, or a reader counts two welds ` +
                `where there is one:\n${line}`,
            ).toBe(true);
        }
    });

    it('§ONE-COMMIT-PASS: exactly one line is the COMMIT and one is the DRY RUN', () => {
        world = makeWorld();
        buildLoop(world);

        const { lines } = oneGesture(world, 7);

        // ⭐ THE MEASURED QUANTITY THE BRIEF ASKED FOR: of the emissions naming
        // one wall in one gesture, how many claim to be a weld that was WRITTEN.
        // Exactly one may. On HEAD the answer is ZERO — no line claims anything
        // either way, which is exactly why the founder counted two welds.
        for (const wallId of ['w-south', 'w-north']) {
            const per = l925For(lines, wallId);
            const commits = per.filter(l => l.includes('[COMMIT]'));
            const dryRuns = per.filter(l => l.includes('[PRE-FLIGHT]'));

            expect(
                commits.length,
                `exactly one §L-925 emission for wall ${wallId} may claim to be a ` +
                `committed weld; got ${commits.length} of ${per.length}`,
            ).toBe(1);
            expect(
                dryRuns.length,
                `and exactly one must declare itself a dry run for wall ${wallId}`,
            ).toBe(1);

            // The dry run must say, in words, that it dispatched nothing — the
            // clause whose absence cost the count.
            expect(dryRuns[0]).toMatch(/nothing is dispatched/i);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §TWO-AUTHORITIES — the finding behind L-10830, pinned as a number
// ════════════════════════════════════════════════════════════════════════════

describe('§WELD52 §TWO-AUTHORITIES — two services weld one gesture, by declared design', () => {
    /**
     * ⭐ THIS IS NOT A COMPLAINT, IT IS A CENSUS, AND THE DISTINCTION MATTERS.
     *
     * `engineLauncher.ts` §03 orders these two on purpose and says why:
     *
     *   "Constructed AFTER the slab service so its subscriber runs second:
     *    corner welds land first, and already-seated partners fall below
     *    computeMoveReweld's displacement floor (no re-write)."
     *
     * `WallStore.subscribe` is FIFO (`:1725` push / `:1769` for-of), so that
     * comment describes real, reproducible behaviour. The consequence — the weld
     * engine finding every slab-loop partner already seated and reporting
     * `EMPTY-PLAN` / `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT` — is the PREDICTED
     * outcome of the ordering, not a malfunction of either service.
     *
     * What was missing is that NEITHER SERVICE'S DIAGNOSTIC KNEW IT. The
     * ordering is declared in exactly one place: a comment in the composition
     * root. This arm pins the fact so the next reader meets it as a measurement.
     */
    it('§TWO-AUTHORITIES: the slab service commits its corner weld during the move itself', () => {
        world = makeWorld();
        buildLoop(world);

        const { moveOk } = oneGesture(world, 7);
        expect(moveOk, 'the past-endpoint move must succeed (§L-925 option (b))').toBe(true);

        // ONE gesture; the slab service has already written the partners by the
        // time any later subscriber runs. Measured in millimetres, not asserted
        // from the source.
        expect(world.slabDispatches.length).toBe(1);

        const south = world.wallStore.getById('w-south')!.baseLine;
        const north = world.wallStore.getById('w-north')!.baseLine;
        const gapSouthMm = Math.round(
            Math.min(
                Math.hypot(south[0].x - 7, south[0].z - 0),
                Math.hypot(south[1].x - 7, south[1].z - 0),
            ) * 1000,
        );
        const gapNorthMm = Math.round(
            Math.min(
                Math.hypot(north[0].x - 7, north[0].z - 4),
                Math.hypot(north[1].x - 7, north[1].z - 4),
            ) * 1000,
        );

        // ⭐ THE FINGERPRINT. Both partners now touch the moved wall's NEW line to
        // the millimetre — put there by the SLAB service. Any weld engine that
        // runs after this point measures 0 mm and correctly reports "already
        // welded". That reading is the footprint of THIS cascade, and it is why
        // it must never again be read as a render / invalidation defect.
        expect(
            gapSouthMm,
            'w-south must be seated on the moved wall\'s new line by the slab cascade',
        ).toBe(0);
        expect(
            gapNorthMm,
            'w-north must be seated on the moved wall\'s new line by the slab cascade',
        ).toBe(0);
    });
});
