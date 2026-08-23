// @vitest-environment happy-dom
//
// §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE + §MIRROR-UPDATE (L-9940..L-9943)
// · C16 §5.1 CA-21 · C11 §5.2 · C84 EI-9 · ADR-0124.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS SUITE EXISTS, AND WHY EVERY GREEN STORE TEST BEFORE IT WAS NO HELP.
// ═══════════════════════════════════════════════════════════════════════════════
// `plugins/pool/__tests__/poolOneUndoEntry.test.ts` is green, drives the REAL bus,
// the REAL handler and the REAL multi-store undo router, and proves a genuinely
// important property: one gesture is one Ctrl+Z. It cannot see the founder's defect.
// He drew a pool and NOTHING APPEARED, and every assertion in that file passed while
// that was true — because every one of them reads a PLUGIN DTO store, and no
// renderer, projector, exporter or serializer reads those.
//
// `[[committed-is-not-reachable]]`: prove it at the layer the user experiences. For
// these two defects that layer is the LEGACY GEOMETRY STORE — the one
// `SlabFragmentBuilder` rebuilds from on `bim-slab-updated`, the one the 2-D plan
// projector reads, the one `ProjectSerializer` writes. So NOT ONE assertion below
// reads `ctx.stores`, and not one asserts `success === true`.
//
// ─── THE MEASURED ROOT, restated so a later reader does not re-derive it ──────
//     grep -c "\.created'"  apps/editor/src/engine/initTools.ts   -> 17
//     grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->  0
// Seventeen create-mirrors, zero update-mirrors. Every family could be CREATED and
// reach the render layer; none could be UPDATED and reach it. That single zero is
// the pool's hole in its host slab, the lift's shaft void (L-9403), and the reason
// thirteen `*.setMaterial` verbs had to be turned into refusals.
//
// ─── THE HARNESS REPRODUCES PRODUCTION'S SUBSCRIBER ORDER, ON PURPOSE ────────
// `element.updated` carries field NAMES and the mirror reads their VALUES out of the
// plugin store. That is only correct because `attachStores` subscribes to the
// PatchEmitter BEFORE `wireCommandEventBridge` does (`bootstrap.ts:103` vs
// `composeRuntime.ts:956`, and `PatchEmitter.listeners` is an insertion-ordered
// `Set`). ⚠ So this file subscribes them in THAT ORDER. A harness that wrote the
// world after the dispatch instead would prove the mirror works in a world that does
// not exist — and would go green if production's order were ever inverted.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores, createId } from '@pryzm/plugin-sdk';
import { SlabStore as PluginSlabStore, type SlabsState, buildSlabHandlerSet } from '@pryzm/plugin-slab';
import { SlabStore as LegacySlabStore } from '@pryzm/geometry-slab';
import { CreatePoolHandler } from '@pryzm/plugin-pool';
import {
    applyElementUpdate,
    registerElementUpdateBridge,
    MIRRORED_UPDATE_KINDS,
} from '../src/engine/elementUpdatedMirror';

const GROUND = 'level-1';
const HOST = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const POOL = 'pool_01ARZ3NDEKTSV4RRFFQ69G5FAV';

/** 4 × 2 m pool outline, world XZ, open loop — the same one `poolOneUndoEntry` uses. */
const POOL_BOUNDARY = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 2 },
    { x: 0, y: 0, z: 2 },
];

const POOL_PAYLOAD = {
    poolId: POOL,
    levelId: GROUND,
    hostSlabId: HOST,
    boundary: POOL_BOUNDARY,
    wallIds: ['wall-n', 'wall-e', 'wall-s', 'wall-w'],
    floorSlabId: 'slab-pool-floor',
    waterId: 'water-1',
};

/** The LEGACY slab record — `polygon` is `{x, y}` with `y` carrying world Z. That
 *  spelling difference from the plugin record's 3-D `boundary` is precisely what the
 *  mirror's `vec3RingsToPlanRings` exists to bridge, so the fixture uses the real one. */
function seedLegacySlab(store: LegacySlabStore, id: string): void {
    store.add({
        id,
        type: 'slab',
        levelId: GROUND,
        parentId: GROUND,
        width: 20,
        depth: 20,
        thickness: 0.2,
        baseOffset: 0,
        position: { x: 0, y: 0, z: 0 },
        polygon: [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 15 }, { x: -5, y: 15 }],
        holes: [],
        properties: {},
        ifcData: { guid: 'guid-' + id, ifcClass: 'IfcSlab' },
    } as never);
}

function makeViewDependencyTracker() {
    const dirtiedLevelIds: string[] = [];
    return {
        dirtiedLevelIds,
        registerElement: () => { /* not exercised here */ },
        markLevelsDirty: (ids: string[]) => { dirtiedLevelIds.push(...ids); },
    };
}

/** The whole production chain for ONE plugin store, wired in production's order. */
async function makeSlabWorld() {
    const { EventBus } = await import('../../../packages/runtime-composer/src/EventBus');
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );

    const pluginStore = new PluginSlabStore();
    const legacyStore = new LegacySlabStore({ activeLevelId: GROUND } as never);
    const vdt = makeViewDependencyTracker();
    const emitter = new PatchEmitter();
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({ slab: Object.fromEntries(pluginStore.getState()) as SlabsState }),
    });
    for (const h of buildSlabHandlerSet()) bus.register(h);

    // ⚠ ORDER: stores FIRST, bridge SECOND — production's order, and the mirror's
    // correctness depends on it (see the header).
    attachStores(emitter, { slab: pluginStore as unknown as never });
    const events = new EventBus();
    wireCommandEventBridge(emitter, events);
    registerElementUpdateBridge(events as never, {
        slabStore: legacyStore as never,
        pluginRecord: (storeKey, id) =>
            storeKey === 'slab'
                ? (pluginStore.getState().get(id) as unknown as Record<string, unknown> | undefined)
                : undefined,
        viewDependencyTracker: vdt as never,
    });

    return { bus, pluginStore, legacyStore, events, emitter, vdt };
}

/** Create the same slab in BOTH stores, as any slab the user can select exists. */
async function seedBothStores(w: Awaited<ReturnType<typeof makeSlabWorld>>, id: string) {
    await w.bus.executeCommand('slab.create', {
        id,
        levelId: GROUND,
        // `signedAreaXZ` measures the X/Z plane, so the loop must carry a real `z`.
        boundary: [
            { x: -5, y: 0, z: -5 }, { x: 15, y: 0, z: -5 },
            { x: 15, y: 0, z: 15 }, { x: -5, y: 0, z: 15 },
        ],
        thickness: 0.2,
    });
    seedLegacySlab(w.legacyStore, id);
}

describe('§MIRROR-UPDATE (L-9942) — an UPDATE must reach the store the RENDERER reads', () => {
    /**
     * ARM 1 — THE CHANNEL EXISTS AT ALL.
     *
     * Every bus→legacy bridge in `initTools.ts` is event-driven, so a verb that emits
     * no typed event is unbridgeable BY CONSTRUCTION however correct its handler is.
     * Before this lane, `slab.addHole` emitted only `command.executed` — and the
     * presence of that generic relay is exactly what made the absence silent.
     */
    it('ARM 1 — `slab.addHole` emits `element.updated`, naming the field it committed', async () => {
        const w = await makeSlabWorld();
        // ⚠ `Slab.id` is a BRANDED `slab_<ulid>` — a hand-written probe id is refused
        // by the schema, which is the store boundary doing its job.
        const id = createId('slab');
        await seedBothStores(w, id);

        const seen: Record<string, unknown>[] = [];
        w.events.on('element.updated', (ev: unknown) => { seen.push(ev as Record<string, unknown>); });

        await w.bus.executeCommand('slab.addHole', {
            slabId: id,
            hole: [{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 2 }],
        });

        expect(seen.length, 'a mutation with no typed event cannot be bridged by anything').toBe(1);
        expect(seen[0]!['elementKind']).toBe('slab');
        expect(seen[0]!['elementId']).toBe(id);
        // ⭐ The event names the field the COMMIT touched, not the field the row
        // ALLOWS — `AddSlabHoleHandler` writes a DEEP patch (`[id,'holes',N]`) and the
        // bridge must collapse it onto its top-level field.
        expect(seen[0]!['changedFields']).toEqual(['holes']);
    });

    /**
     * ARM 2 — ⭐ THE READ-BACK (C16 §5.1 CA-21). THE ONE THAT MATTERS.
     *
     * Real plugin handlers, real bus, real `CommandEventBridge`, real `EventBus`, the
     * REAL mirror `initTools.ts` registers, and the REAL `@pryzm/geometry-slab` store
     * that `SlabFragmentBuilder` punches holes from. The only thing dispatched is the
     * user's gesture.
     */
    it('ARM 2 — dispatching the REAL `slab.addHole` puts the hole in the LEGACY record, in PLAN coordinates', async () => {
        const w = await makeSlabWorld();
        // ⚠ `Slab.id` is a BRANDED `slab_<ulid>` — a hand-written probe id is refused
        // by the schema, which is the store boundary doing its job.
        const id = createId('slab');
        await seedBothStores(w, id);

        // (4) the rebuild signal. `SlabFragmentBuilder` schedules off exactly these
        // store events, so recording them is recording the rebuild.
        const storeEvents: string[] = [];
        w.legacyStore.subscribe((event: string) => { storeEvents.push(event); });

        await w.bus.executeCommand('slab.addHole', {
            slabId: id,
            hole: [{ x: 1, y: 0, z: 7 }, { x: 3, y: 0, z: 7 }, { x: 3, y: 0, z: 9 }],
        });

        // Stated first so a failure below cannot be misread as "the handler is broken".
        expect(
            (w.pluginStore.get(id) as unknown as { holes?: unknown[] })?.holes?.length,
            'the plugin handler is not the defect',
        ).toBe(1);

        // ⛔ THE DEFECT.
        const legacy = w.legacyStore.getById(id) as unknown as {
            holes?: { x: number; y: number }[][];
        };
        expect(legacy?.holes?.length, 'the hole must exist in the store the RENDERER reads').toBe(1);

        // ⭐ AND IT MUST LAND IN THE RIGHT PLACE. The plugin ring is `{x,y,z}` world;
        // the legacy ring is `{x,y}` PLAN with `y` carrying world Z. A verbatim copy
        // would have written `y: 0` for every vertex — a degenerate sliver on a
        // ground-floor plate and a hole somewhere else entirely on any other storey.
        // Geometrically plausible, silent, and wrong.
        expect(legacy!.holes![0]).toEqual([
            { x: 1, y: 7 },
            { x: 3, y: 7 },
            { x: 3, y: 9 },
        ]);

        expect(storeEvents, 'no `update` event means no mesh rebuild — the record would be right and the screen still wrong')
            .toContain('update');

        // The plan pipeline projects per storey and does not watch field writes.
        expect(w.vdt.dirtiedLevelIds).toContain(GROUND);
    });

    /**
     * ARM 3 — THE WHOLE-RECORD WRITE CONTRACT.
     *
     * `SlabStore.update()` is a whole-record REPLACE: handed a one-key partial it
     * leaves the slab as that one key, frozen, with no diagnostics (L-977, recorded in
     * `SlabStore.changeLevel`'s own header). So this asserts the UNTOUCHED fields
     * survive — a mirror that "worked" by annihilating the polygon would pass a
     * thickness-only assertion.
     */
    it('ARM 3 — `slab.setThickness` moves the legacy thickness and does NOT annihilate the rest of the record', async () => {
        const w = await makeSlabWorld();
        // ⚠ `Slab.id` is a BRANDED `slab_<ulid>` — a hand-written probe id is refused
        // by the schema, which is the store boundary doing its job.
        const id = createId('slab');
        await seedBothStores(w, id);

        await w.bus.executeCommand('slab.setThickness', { slabId: id, thickness: 0.45 });

        const legacy = w.legacyStore.getById(id) as unknown as {
            thickness?: number; polygon?: unknown[]; levelId?: string; id?: string; type?: string;
        };
        expect(legacy?.thickness, 'the founder edits a thickness and the plate must re-extrude').toBe(0.45);
        expect(legacy?.polygon?.length, 'the polygon must survive a thickness edit').toBe(4);
        expect(legacy?.levelId).toBe(GROUND);
        expect(legacy?.id).toBe(id);
        expect(legacy?.type).toBe('slab');
    });

    /**
     * ARM 4 — REFUSALS ARE VALUES, AND THEY CARRY A REASON.
     *
     * §context-data-honesty: failure and emptiness are never the same value. A mirror
     * that returned `void` for "no adapter for this kind" would reproduce the exact
     * silence it replaces — the bridge would declare a channel, nothing would answer,
     * and the command would report success.
     */
    it('ARM 4 — an un-adapted kind and an un-bridged field both REFUSE BY NAME', async () => {
        const w = await makeSlabWorld();
        // ⚠ `Slab.id` is a BRANDED `slab_<ulid>` — a hand-written probe id is refused
        // by the schema, which is the store boundary doing its job.
        const id = createId('slab');
        await seedBothStores(w, id);

        const noAdapter = applyElementUpdate(
            { elementKind: 'handrail', elementId: id, changedFields: ['path'] },
            { slabStore: w.legacyStore as never, pluginRecord: () => undefined },
        );
        expect(noAdapter.applied).toBe(false);
        expect(noAdapter.applied === false && noAdapter.reason).toContain('handrail');

        const noField = applyElementUpdate(
            { elementKind: 'slab', elementId: id, changedFields: ['sketch'] },
            {
                slabStore: w.legacyStore as never,
                pluginRecord: (k, i) =>
                    k === 'slab'
                        ? (w.pluginStore.getState().get(i) as unknown as Record<string, unknown> | undefined)
                        : undefined,
            },
        );
        expect(noField.applied, 'a field with no declared bridge must not be copied hopefully').toBe(false);

        const missingRecord = applyElementUpdate(
            { elementKind: 'slab', elementId: 'no-such-slab', changedFields: ['thickness'] },
            { slabStore: w.legacyStore as never, pluginRecord: () => undefined },
        );
        expect(missingRecord.applied).toBe(false);

        // The census is exported so a probe can assert it rather than trust prose.
        expect([...MIRRORED_UPDATE_KINDS].sort()).toEqual(['column', 'roof', 'slab']);
    });
});

describe('§FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9940) — the founder draws a pool and SEES it', () => {
    /**
     * The pool world: FOUR stores, because `pool.create` really writes four. The
     * plain-object slices are the shape `poolOneUndoEntry.test.ts` uses; the SLAB one
     * is doubled by a real legacy `SlabStore` so the host's void can be read back off
     * the record a renderer consults.
     */
    async function makePoolWorld() {
        const { EventBus } = await import('../../../packages/runtime-composer/src/EventBus');
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );

        const world: Record<string, Record<string, Record<string, unknown>>> = {
            pool: {},
            wall: {},
            slab: {
                [HOST]: {
                    id: HOST,
                    type: 'slab',
                    levelId: GROUND,
                    boundary: [
                        { x: -5, y: 0, z: -5 }, { x: 15, y: 0, z: -5 },
                        { x: 15, y: 0, z: 15 }, { x: -5, y: 0, z: 15 },
                    ],
                    holes: [],
                    thickness: 0.2,
                    baseOffset: 0,
                },
            },
            water: {},
        };

        /** Store adapters that apply forward patches exactly as `Store.applyPatch` does. */
        const slice = (key: string) => ({
            applyPatch(patches: readonly unknown[]): void {
                for (const raw of patches) {
                    const p = raw as { op: string; path: (string | number)[]; value?: unknown };
                    const id = String(p.path[0]);
                    if (p.path.length === 1) {
                        if (p.op === 'remove') delete world[key]![id];
                        else world[key]![id] = p.value as Record<string, unknown>;
                    } else {
                        const field = String(p.path[1]);
                        const cur = world[key]![id];
                        if (cur) world[key]![id] = { ...cur, [field]: p.value };
                    }
                }
            },
        });

        const legacyStore = new LegacySlabStore({ activeLevelId: GROUND } as never);
        seedLegacySlab(legacyStore, HOST);

        const emitter = new PatchEmitter();
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            emitter,
            undoStack: new UndoStack({ maxSize: 50 }),
            storesProvider: () => ({
                pool: world['pool']!, wall: world['wall']!, slab: world['slab']!, water: world['water']!,
            }),
        });
        bus.register(new CreatePoolHandler() as never);

        // ⚠ ORDER — stores first, bridge second. Production's order.
        attachStores(emitter, {
            pool: slice('pool') as never, wall: slice('wall') as never,
            slab: slice('slab') as never, water: slice('water') as never,
        });
        const events = new EventBus();
        wireCommandEventBridge(emitter, events);
        registerElementUpdateBridge(events as never, {
            slabStore: legacyStore as never,
            pluginRecord: (storeKey, id) => world[storeKey]?.[id],
        });

        return { bus, world, events, legacyStore };
    }

    /**
     * ARM 5 — THE MEMBER EVENTS, STAMPED WITH THE MEMBER'S OWN VERB.
     *
     * ⭐ THE `commandType` IS THE ASSERTION, not decoration. The §P2.1 and §FT1
     * subscribers filter on it (`ev.commandType !== 'wall.create'` -> return), so a
     * compound that stamped `'pool.create'` would emit five events NOTHING listens to
     * — activation reported, nothing activated. That is the trap the balcony case
     * documents and the one a `toHaveBeenCalled`-style assertion would sail past.
     */
    it('ARM 5 — `pool.create` emits one member event PER MEMBER, shaped to pass the §P2.1 / §FT1 guards', async () => {
        const w = await makePoolWorld();
        const walls: Record<string, unknown>[] = [];
        const slabs: Record<string, unknown>[] = [];
        w.events.on('wall.created', (ev: unknown) => walls.push(ev as Record<string, unknown>));
        w.events.on('slab.created', (ev: unknown) => slabs.push(ev as Record<string, unknown>));

        await w.bus.executeCommand('pool.create', POOL_PAYLOAD);

        expect(walls.length, 'one basin wall per boundary EDGE').toBe(4);
        for (const ev of walls) {
            // The §P2.1 guard, verbatim: commandType, wallId, baseLine.length >= 2.
            expect(ev['commandType']).toBe('wall.create');
            expect(typeof ev['wallId']).toBe('string');
            expect((ev['baseLine'] as unknown[]).length).toBeGreaterThanOrEqual(2);
            // ⭐ The NEGATIVE base offset is the whole trick of the assembly — a basin
            // hangs BELOW the datum. A mirror that dropped it would draw four walls
            // standing on the terrace.
            expect(ev['baseOffset'] as number).toBeLessThan(0);
            expect(ev['height'] as number).toBeGreaterThan(0);
        }

        expect(slabs.length, 'the pool FLOOR is a real slab').toBe(1);
        // The §FT1 guard, verbatim: commandType, id, polygon.length >= 3.
        expect(slabs[0]!['commandType']).toBe('slab.create');
        expect(slabs[0]!['id']).toBe(POOL_PAYLOAD.floorSlabId);
        const polygon = slabs[0]!['polygon'] as { x: number; y: number }[];
        expect(polygon.length).toBeGreaterThanOrEqual(3);
        // ⚠ `slab.created`'s polygon is PLAN `{x, y}` with `y` = world Z. The pool
        // outline's third vertex is `{x:4, z:2}`; if this reads `y: 0` the basin has
        // been laid down flat in the XY plane.
        expect(polygon[2]).toEqual({ x: 4, y: 2 });
    });

    /**
     * ARM 6 — ⭐ THE POOL IS IN THE FLOOR PLATE, NOT ON IT.
     *
     * The host's `holes` is a whole-array REPLACE on an EXISTING slab, and every
     * legacy slab bridge keys on a CREATE. That is the same break the lift's shaft
     * void has (L-9403), and it is why both now ride `element.updated`.
     */
    it('ARM 6 — `pool.create` punches the void into the LEGACY host slab', async () => {
        const w = await makePoolWorld();
        const before = (w.legacyStore.getById(HOST) as unknown as { holes?: unknown[] })?.holes ?? [];
        expect(before.length, 'the fixture starts with an unbroken plate').toBe(0);

        await w.bus.executeCommand('pool.create', POOL_PAYLOAD);

        const after = w.legacyStore.getById(HOST) as unknown as { holes?: { x: number; y: number }[][] };
        expect(after?.holes?.length, 'without the void the pool sits ON the terrace instead of IN it').toBe(1);
        // Plan coordinates again, and the ring is the pool outline.
        expect(after!.holes![0]!.length).toBe(POOL_BOUNDARY.length);
        expect(after!.holes![0]![2]).toEqual({ x: 4, y: 2 });
    });

    /**
     * ARM 7 — ⛔ THE WATER IS NOT SMUGGLED THROUGH AS A SLAB.
     *
     * The cheapest way to make something blue appear would be to emit `slab.created`
     * for the water body. That would put one id on two families and give the water a
     * thickness it does not have — C84 EI-9, and the refusal the lift made when it
     * declined to feed its compound into the massing store. The water record is REAL,
     * COMMITTED and INVISIBLE, and the bridge says so by name (L-9941). This arm pins
     * the refusal so a later lane cannot "fix" the gap by smuggling.
     */
    it('ARM 7 — the water commits, is NOT emitted as another family, and is reported by name', async () => {
        const w = await makePoolWorld();
        const emitted: string[] = [];
        for (const name of ['wall.created', 'slab.created', 'element.updated', 'water.created']) {
            w.events.on(name as never, () => emitted.push(name));
        }
        const warnings: string[] = [];
        const realWarn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
        try {
            await w.bus.executeCommand('pool.create', POOL_PAYLOAD);
        } finally {
            console.warn = realWarn;
        }

        expect(Object.keys(w.world['water']!).length, 'the water record is real').toBe(1);
        expect(emitted, 'no rival family event may carry the water').not.toContain('water.created');
        expect(emitted.filter((e) => e === 'slab.created').length, 'exactly ONE slab — the pool floor; the water is not a second one').toBe(1);
        expect(
            warnings.join('\n'),
            'an invisible member must be NAMED at the layer that knows — R-13 (C104 §13.3)',
        ).toContain('WATER BODY');
    });
});
