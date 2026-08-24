// @vitest-environment happy-dom
//
// §FIX-POOL-HOST-FROM-GEOMETRY (L-10820) · C15 · C83 · C84 EI-2 · C92 · ADR-0124.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER: *"check the pool — is not working — no matter if i select the slab
//    before or after (actually there should not be the need of selecting the slab —
//    it should be like when you place a window in a wall — you don't need to select
//    the wall — same)"*
// ═══════════════════════════════════════════════════════════════════════════════
//
// On screen: `A pool must be cut into a slab. Draw it over a slab on this level, or
// select the slab first and draw again.` — a refusal that names TWO routes back to
// success, both of which were closed.
//
// ─── WHY EVERY EXISTING POOL TEST WAS GREEN WHILE THIS WAS TRUE ──────────────
// `planOnlyToolFinishGesture.spec.ts` installs its world as
//
//     w.runtime  = { …, stores: { slab: { getState: () => slabs } } };
//     w.slabStore = undefined;
//
// with each slab carrying `boundary: [{x, z}, …]`. **That world does not exist in
// production**, and the handler was written against it:
//
//   1. `window.runtime` is the COMPOSED `PryzmRuntime` (engineLauncher.ts:179) and
//      its `stores` is a `StoresSlot` — five NAMED members (`elements`, `hydrate`,
//      `registerHydrator`, `viewState`, `project`, types.ts:2800-2834) and NO index
//      signature. `runtime.stores['slab']` is `undefined` in every real session, so
//      the handler's first candidate source is DEAD CODE. It typechecked only
//      because the read is done through a hand-written
//      `window as unknown as { runtime?: { stores?: Record<string, …> } }` cast that
//      asserts a shape the runtime does not have. [[fake-more-capable-than-real]].
//   2. The surviving source is the legacy `window.slabStore`, and its records are
//      `SlabData` (`geometry-slab/src/SlabTypes.ts:85-99`) — which has **no
//      `boundary` field at all**. The outline is `polygon?: {x, y}[]`, where `y`
//      ENCODES THE Z AXIS and is LOCAL to `position` (`RegionBoundarySources.ts:53`,
//      `SlabColumnCoupling.ts:73-78`). Reading `.boundary` off it is `undefined`
//      forever, so `_resolveHostSlab` skipped every slab in the project.
//
// So the GEOMETRY route could never return a host — which is the *"you don't need to
// select the wall"* half of his report.
//
// ─── AND THE SELECTION ROUTE WAS CLOSED TOO, BY A NAME TEST ──────────────────
// His console, two adjacent lines:
//
//     [SvpPlanToolOverlay] Handler activated: pool
//     [§SELECT-CLEARED] reason=tool-activated-selection-disabled
//         id=c0ba8bda-77a4-4f24-a248-fbc78aebed56 type=Slab
//
// `armedSelectionSnapshot` correctly captures that id BEFORE the suppression, so the
// override should have survived. It did not, because `_selectedSlabId()` gated it on
// `armed.startsWith('slab')` — and **`c0ba8bda-…` is a bare UUID**. Only
// `SlabPlanToolHandler` mints `createId('slab')` → `slab_<ULID>`; the 3-D `SlabTool`
// (`SlabTool.ts:431`), `SlabPickWallsController` (:219) and every slab restored by
// `ProjectLoader` carry `crypto.randomUUID()`. A gate that classifies by NAME is
// satisfied by RENAMING and defeated by not-renaming — CLAUDE.md P4's lesson, here
// costing the founder the only route the error message told him to use.
//
// ⛔ THE ERROR IS NOT THE BUG, so not one assertion below is "no error thrown".
// Today's HEAD throws a clean, well-worded, correctly-spelled refusal. The
// assertions are on the OBSERVABLE the founder wanted: the host id, and the cut.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { CreatePoolHandler } from '@pryzm/plugin-pool';
import { PoolPlanToolHandler } from '../PoolPlanToolHandler';
import type { PlanToolDrawContext, WorldPoint } from '../PlanToolHandler';
import { __resetActivePoolDrawModeForTests, setActivePoolDrawMode } from '../activePoolDrawMode';
import { __resetArmedSelectionForTests, captureArmedSelection } from '../armedSelectionSnapshot';

const LEVEL = 'level-1';

/**
 * ⭐ THE FOUNDER'S OWN SLAB ID, verbatim from his console. A bare UUID — NOT
 * `slab_<ULID>` — which is what defeated the `startsWith('slab')` name test, and what
 * ARM A2 below shows ALSO defeats the schema one layer deeper.
 */
const HOST_UUID = 'c0ba8bda-77a4-4f24-a248-fbc78aebed56';

/**
 * A CANONICAL slab id — `createId('slab')` shape, which is what `SlabPlanToolHandler`
 * mints (SlabPlanToolHandler.ts:414) and the only shape `Pool.hostSlabId`'s
 * `idRef('slab')` accepts. A slab drawn with the PLAN slab tool carries this and lands
 * in BOTH stores (bus `slab.create` → DTO; `initTools.ts` §FT1 `slab.created` → legacy),
 * so it is the id shape for which the whole gesture works end to end.
 */
const HOST = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER_HOST = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';

/** A 20 × 20 m terrace centred on the origin — the ring ARMs A/B/D draw on top of. */
const TERRACE: ReadonlyArray<[number, number]> = [[-5, -5], [15, -5], [15, 15], [-5, 15]];

/**
 * A record in the REAL legacy `SlabData` spelling — `polygon` as `{x, y}` with `y`
 * carrying the plan-Z axis, LOCAL to `position`. Not `boundary`, and not `{x, z}`.
 * This is the shape `window.slabStore.getAll()` actually returns in the browser.
 */
function legacySlab(
    id: string,
    ring: ReadonlyArray<[number, number]>,
    position = { x: 0, y: 0, z: 0 },
): Record<string, unknown> {
    return {
        id,
        type: 'slab',
        levelId: LEVEL,
        parentId: LEVEL,
        thickness: 0.2,
        baseOffset: 0,
        position,
        polygon: ring.map(([x, z]) => ({ x, y: z })),
        holes: [],
    };
}

/** The dispatches the handler made, newest last. */
let dispatches: Array<{ type: string; payload: Record<string, unknown> }> = [];
/** Every refusal the handler surfaced, so a test can say WHY it refused. */
let refusals: string[] = [];

vi.mock('@app/ui/create/activatePlanOnlyTool', () => ({
    notifyPlanToolRefusal: (m: string): void => { refusals.push(m); },
    notifyPlanToolCreated: (): void => undefined,
}));

/**
 * ⭐ `window.runtime.stores` IN ITS REAL PRODUCTION SHAPE — the `StoresSlot`.
 *
 * Five NAMED members and NO `slab` key, because that is what `composeRuntime` builds
 * (composeRuntime.ts:1650-1679) and what `engineLauncher.ts:179` publishes. A harness
 * that adds a `slab` key here would be testing a world that does not exist, which is
 * precisely how this defect survived every previous pool suite.
 */
function installWorld(slabs: ReadonlyArray<Record<string, unknown>>): void {
    dispatches = [];
    refusals = [];
    const all = [...slabs];
    const legacyStore = { getAll: () => all, getById: (id: string) => all.find(s => s['id'] === id) };
    const w = window as unknown as Record<string, unknown>;
    w.slabStore = legacyStore;
    w.runtime = {
        bus: {
            executeCommand: (type: string, payload: Record<string, unknown>) => {
                dispatches.push({ type, payload });
                return Promise.resolve({ ok: true });
            },
        },
        // The REAL slot: `elements` is the ADR-0318 live view over `storeRegistry`,
        // and `storeRegistry.register('slab', slabStore)` registers the LEGACY
        // singleton (composeRuntime.ts:1621-1628) — the same instance as
        // `window.slabStore`. There is no `slab` key beside it.
        stores: {
            elements: {
                get: (kind: string) => (kind === 'slab' ? legacyStore : undefined),
                has: (kind: string) => kind === 'slab',
                kinds: () => ['slab'],
            },
            viewState: { activeLayer: null, activeLevel: null, zoom: 1 },
            project: { units: 'metric' },
        },
    };
    // NO SELECTION AT ALL — the founder's *"there should not be the need of selecting
    // the slab"*. Arming the pool tool has already cleared it in his session.
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
}

function makeCtx(): PlanToolDrawContext {
    const canvas = document.createElement('canvas');
    const ctx2d = {
        setTransform: () => undefined, clearRect: () => undefined, save: () => undefined,
        restore: () => undefined, beginPath: () => undefined, moveTo: () => undefined,
        lineTo: () => undefined, closePath: () => undefined, stroke: () => undefined,
        fill: () => undefined, arc: () => undefined, fillRect: () => undefined,
        fillText: () => undefined, measureText: () => ({ width: 10 }),
        set fillStyle(_v: unknown) { /* noop */ }, set strokeStyle(_v: unknown) { /* noop */ },
        set lineWidth(_v: unknown) { /* noop */ }, set font(_v: unknown) { /* noop */ },
        set globalAlpha(_v: unknown) { /* noop */ }, setLineDash: () => undefined,
    } as unknown as CanvasRenderingContext2D;
    return {
        overlayCanvas: Object.assign(canvas, { width: 800, height: 600 }),
        baseCanvas: canvas,
        ctx: ctx2d,
        dpr: 1,
        viewDef: { id: 'vd-pool', spatial: { levelId: LEVEL } },
        runtime: (window as unknown as { runtime: unknown }).runtime,
    } as unknown as PlanToolDrawContext;
}

const wp = (x: number, z: number): WorldPoint => ({ worldX: x, worldZ: z } as WorldPoint);

/**
 * Draw a rectangular pool by its two opposite corners — the RECTANGULAR loop mode,
 * which commits on the second click. One gesture, no selection, no double-click.
 */
function drawRectPool(handler: PoolPlanToolHandler, a: [number, number], b: [number, number]): void {
    setActivePoolDrawMode('rectangular');
    handler.activate(makeCtx());
    handler.onClick(wp(a[0], a[1]));
    handler.onClick(wp(b[0], b[1]));
}

const poolCreate = (): Record<string, unknown> | undefined =>
    dispatches.find(d => d.type === 'pool.create')?.payload;

beforeEach(() => {
    __resetActivePoolDrawModeForTests();
    __resetArmedSelectionForTests();
});

describe('§FIX-POOL-HOST-FROM-GEOMETRY — a pool finds its slab the way a window finds its wall', () => {
    it('ARM A — with NO selection, the host is the slab the outline sits on', () => {
        // A 20 × 20 m terrace at the origin, stored the way the legacy store really
        // stores it: `polygon` as {x, y=Z}, LOCAL to `position`, and NO `boundary`.
        installWorld([legacySlab(HOST, TERRACE)]);

        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);   // wholly inside the terrace

        // ⛔ NOT "no error thrown" — today's HEAD refuses cleanly and correctly.
        // The observable is the HOST ID, resolved from geometry alone, with nothing
        // selected before, during or after. This is the founder's *"same as a window
        // in a wall"*.
        const payload = poolCreate();
        expect(refusals, `refused instead of hosting: ${refusals.join(' | ')}`).toEqual([]);
        expect(payload, 'pool.create was never dispatched').toBeDefined();
        expect(payload!['hostSlabId']).toBe(HOST);
        expect(payload!['levelId']).toBe(LEVEL);
    });

    it('ARM A2 — the founder\'s UUID-id slab IS found by geometry, and refused for the real reason', () => {
        // ⚠ THE OPEN HALF, PINNED AS AN OBSERVABLE RATHER THAN DESCRIBED IN PROSE.
        //
        // `Pool.hostSlabId` is `idRef('slab')` → /^slab_[0-9A-HJKMNP-TV-Z]{26}$/
        // (schemas/src/elements/Pool.ts:82), and `defineElement` puts the same regex on
        // `Slab.id` (base/BaseNode.ts:35-41). His slab's id is a bare UUID, so it can
        // neither BE in the plugin DTO store nor be REFERENCED as a host. Before this
        // change the tool said "draw it over a slab on this level" — which he had done.
        // Now it says the true thing, and names the id it found.
        installWorld([legacySlab(HOST_UUID, TERRACE)]);
        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);

        expect(poolCreate(), 'dispatched a host the bus provably rejects').toBeUndefined();
        // It must NOT claim there is no slab here — there is one, and it found it.
        expect(refusals.join(' ')).not.toMatch(/no slab on this level|not over any/i);
        expect(refusals.join(' ')).toContain(HOST_UUID);
    });

    it('ARM B — the cut lands in that slab: the real CreatePoolHandler punches the host\'s hole', async () => {
        installWorld([legacySlab(HOST, TERRACE)]);
        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);

        const payload = poolCreate();
        expect(payload, 'no pool.create to feed the real handler').toBeDefined();

        // The REAL bus + the REAL handler, over the DTO world the bus reads. The pool
        // tool's job is to NAME the host; this arm proves the named host is the one
        // that gets cut.
        const world: Record<string, Record<string, unknown>> = {
            pool: {}, wall: {}, water: {},
            slab: {
                [HOST]: {
                    id: HOST, type: 'slab', levelId: LEVEL, thickness: 0.2, baseOffset: 0,
                    boundary: [
                        { x: -5, y: 0, z: -5 }, { x: 15, y: 0, z: -5 },
                        { x: 15, y: 0, z: 15 }, { x: -5, y: 0, z: 15 },
                    ],
                    holes: [],
                },
            },
        };
        const bus = new CommandBus({
            audit: { actorId: 't', projectId: 'p', clientId: 'c' },
            emitter: new PatchEmitter(),
            undoStack: new UndoStack({ maxSize: 20 }),
            storesProvider: () => ({
                pool: world['pool'], wall: world['wall'], slab: world['slab'], water: world['water'],
            }),
        });
        bus.register(new CreatePoolHandler() as never);

        const ev = await bus.executeCommand('pool.create', payload) as unknown as {
            patches: ReadonlyArray<{
                storeKey: string;
                forwardPatches: ReadonlyArray<{ path: readonly unknown[]; value: unknown }>;
            }>;
        };

        // Commit through the per-store patch envelopes — the `attachStores` path, not
        // `nextStates`, so the store-key strip is exercised exactly as in production.
        const holePatch = ev.patches
            .filter(p => p.storeKey === 'slab')
            .flatMap(p => p.forwardPatches)
            .find(p => String(p.path[0]) === HOST && String(p.path[1]) === 'holes');

        expect(holePatch, 'the host slab was never cut').toBeDefined();
        const holes = holePatch!.value as Array<Array<{ x: number; z: number }>>;
        expect(holes).toHaveLength(1);
        // The cut is the outline the architect drew, over the slab he drew it on.
        const xs = holes[0]!.map(v => v.x);
        const zs = holes[0]!.map(v => v.z);
        expect(Math.min(...xs)).toBeCloseTo(2, 5);
        expect(Math.max(...xs)).toBeCloseTo(6, 5);
        expect(Math.min(...zs)).toBeCloseTo(2, 5);
        expect(Math.max(...zs)).toBeCloseTo(5, 5);
    });

    it('ARM C — a pool over NOTHING stays a refusal, and says there is no slab here', () => {
        installWorld([legacySlab(HOST, [[-5, -5], [0, -5], [0, 0], [-5, 0]])]);
        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [40, 40], [44, 43]);   // far off the slab

        expect(poolCreate(), 'invented a host it had no evidence for').toBeUndefined();
        expect(refusals.join(' ')).toMatch(/slab/i);
    });

    it('ARM D — overlapping slabs are a QUESTION, not a coin toss', () => {
        // Two slabs on this level, both containing the outline. Nothing selected.
        installWorld([
            legacySlab(HOST, TERRACE),
            legacySlab(OTHER_HOST, [[0, 0], [10, 0], [10, 10], [0, 10]]),
        ]);
        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);

        expect(poolCreate(), 'picked one of two overlapping slabs arbitrarily').toBeUndefined();
        expect(refusals.join(' ')).toMatch(/2 slabs|two slabs|overlap/i);
    });

    it('ARM D2 — the arm-time selection DISAMBIGUATES, even though the id is a bare UUID', () => {
        installWorld([
            legacySlab(HOST, TERRACE),
            legacySlab(OTHER_HOST, [[0, 0], [10, 0], [10, 10], [0, 10]]),
        ]);
        // What `suppressSelection()` captures immediately before it clears the
        // selection — a bare UUID, which is what defeated `startsWith('slab')`.
        captureArmedSelection(OTHER_HOST);

        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);

        expect(poolCreate()?.['hostSlabId']).toBe(OTHER_HOST);
    });

    it('ARM E — a slab with a non-zero position is lifted to world before the containment probe', () => {
        // `polygon` is LOCAL to `position` (SlabColumnCoupling.ts:73-78). A slab whose
        // ring reads 0..20 but which sits at x=100 does NOT contain a pool at (2, 2).
        installWorld([
            legacySlab(HOST, [[0, 0], [20, 0], [20, 20], [0, 20]], { x: 100, y: 0, z: 0 }),
        ]);
        const handler = new PoolPlanToolHandler();
        drawRectPool(handler, [2, 2], [6, 5]);
        expect(poolCreate(), 'ignored `position` and hosted on a slab 100 m away').toBeUndefined();

        // …and it DOES contain a pool drawn at (102, 2).
        installWorld([
            legacySlab(HOST, [[0, 0], [20, 0], [20, 20], [0, 20]], { x: 100, y: 0, z: 0 }),
        ]);
        const h2 = new PoolPlanToolHandler();
        drawRectPool(h2, [102, 2], [106, 5]);
        expect(poolCreate()?.['hostSlabId']).toBe(HOST);
    });
});
