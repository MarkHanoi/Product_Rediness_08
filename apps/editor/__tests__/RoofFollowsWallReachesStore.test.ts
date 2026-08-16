/**
 * §ROOF-FOLLOWS-WALL — REACHABILITY (L-924 · GR-12 · C79 §5.2/§7.4 · C72)
 *
 * ─── WHAT THIS SUITE MEASURES THAT THE ENGINE SUITE CANNOT ───────────────────
 * `packages/geometry-roof/__tests__/roofFollowsMovedWall.test.ts` is GREEN and
 * proves the ENGINE returns the right polygon — `recomputeRoofForWall(...)`
 * hands back a 48 m² ring for a 36 m² roof whose north wall moved 2 m. Its own
 * commit (16ef37b0) says in as many words that this is *"NOT REACHABLE IN
 * PRODUCTION YET"*.
 *
 * That is precisely the situation §committed-is-not-reachable exists for: a
 * pure function's return value is not a product behaviour. Every assertion
 * below therefore reads the **STORED RECORD** back out of the real
 * `@pryzm/geometry-roof` `RoofStore` — the store `RoofFragmentBuilder` rebuilds
 * meshes from, `ProjectSerializer.serializeRoof` persists, and `ProjectLoader`
 * restores. `recomputeRoofForWall`'s return value is deliberately never
 * asserted on its own anywhere in this file.
 *
 * ─── THE THREE THINGS MEASURED RED, AND WHY ALL THREE ARE ONE DEFECT ─────────
 * A roof follows its walls only if ALL of:
 *   (1) `UpdateRoofBoundaryCommand` exists to WRITE the re-derived footprint;
 *   (2) a `RoofDependencyTracker` is CONSTRUCTED and subscribed to the wall
 *       store, or nothing ever calls the engine;
 *   (3) `boundingWallIds` is POPULATED AT CREATION, or the tracker's dependency
 *       filter matches no roof and the engine is called with an empty set.
 *
 * Arms A and B pin (3) on BOTH region creation paths. C79 §7.4 is binding and
 * is the reason they are two arms of one suite rather than one arm: per-path
 * divergence is rated WORSE than uniform absence, because it makes whether a
 * roof follows depend on which surface the user drew it on — a rule no user can
 * learn. If only one of A/B can be made green, NEITHER should be wired.
 *
 * Arm C pins (1)+(2) end to end: a wall moves in a real `WallStore`, and the
 * roof's STORED footprint must read 48 m².
 */

import { describe, it, expect } from 'vitest';
import { RoofStore } from '@pryzm/geometry-roof';
import { traceRoofRegionAtPoint, type RegionWallLike } from '@pryzm/geometry-roof';
import { WallStore } from '@pryzm/geometry-wall';

// ── Fixtures — the reference case, identical to the engine suite ─────────────

const ROOF_ID = 'roof-follow-probe';
const LEVEL_ID = 'L0';

/** A plain 6 x 6 room — 36 m², four straight walls, stable ids. */
function room6x6(): RegionWallLike[] {
    return [
        { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
        { id: 'w-east', baseLine: [{ x: 6, z: 0 }, { x: 6, z: 6 }] },
        { id: 'w-north', baseLine: [{ x: 6, z: 6 }, { x: 0, z: 6 }] },
        { id: 'w-west', baseLine: [{ x: 0, z: 6 }, { x: 0, z: 0 }] },
    ] as RegionWallLike[];
}

function areaOf(polygon: ReadonlyArray<readonly [number, number]> | ReadonlyArray<number[]>): number {
    let a = 0;
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i] as number[], q = polygon[(i + 1) % polygon.length] as number[];
        a += p[0]! * q[1]! - q[0]! * p[1]!;
    }
    return Math.abs(a / 2);
}

/** `RoofTool._normalisePolygon` — the footprint is stored CENTROID-LOCAL. */
function normalise(raw: [number, number][]): { polygon: [number, number][]; centroid: [number, number] } {
    let cx = 0, cz = 0;
    for (const [x, z] of raw) { cx += x; cz += z; }
    cx /= raw.length; cz /= raw.length;
    return { polygon: raw.map(([x, z]) => [x - cx, z - cz] as [number, number]), centroid: [cx, cz] };
}

/** The level authority `WallStore.add` refuses to proceed without (ADR-0318). */
function attachedWallStore(): WallStore {
    const level = { id: LEVEL_ID, name: 'L0', elevation: 0 };
    return new WallStore(
        { activeLevelId: LEVEL_ID } as never,
        { getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined), getLevels: () => [level], registerElement: () => {}, unregisterElement: () => {} } as never,
    );
}

function seedWalls(store: WallStore): void {
    for (const w of room6x6()) {
        const bl = (w as unknown as { baseLine: { x: number; z: number }[] }).baseLine;
        store.add({
            id: w.id,
            type: 'wall',
            levelId: LEVEL_ID,
            baseLine: [{ x: bl[0]!.x, y: 0, z: bl[0]!.z }, { x: bl[1]!.x, y: 0, z: bl[1]!.z }],
            height: 2.7,
            thickness: 0.2,
            properties: {},
        } as never);
    }
}

/**
 * Move the north wall `dz` north, welding the two corners it shares with east
 * and west — the shape `CASCADE_WALL_BASELINE` commits. A test that broke the
 * loop open would be measuring a torn model rather than a moved one.
 */
function moveNorthWall(store: WallStore, dz: number): void {
    for (const id of ['w-east', 'w-north', 'w-west']) {
        const wall = store.getById(id) as unknown as { baseLine: { x: number; y: number; z: number }[] } | undefined;
        if (!wall) continue;
        store.update(id, {
            baseLine: wall.baseLine.map((p) => (p.z >= 6 - 1e-9 ? { x: p.x, y: p.y, z: p.z + dz } : p)),
        } as never);
    }
}

// ── Arms ─────────────────────────────────────────────────────────────────────

describe('§ROOF-FOLLOWS-WALL — the re-derived boundary must reach the ROOF STORE', () => {
    it('CONTROL — the fixture is sound: the traced region really does grow 36 m² → 48 m²', () => {
        // Not the subject. Without this, "the stored roof did not follow" would
        // be unfalsifiable — it could mean the region never changed either.
        const walls = attachedWallStore();
        seedWalls(walls);
        const before = traceRoofRegionAtPoint(walls.getAll() as never, 3, 3)!;
        expect(areaOf(before.polygon)).toBeCloseTo(36, 6);
        expect(before.attribution.hostWallIds).toContain('w-north');

        moveNorthWall(walls, 2);
        const after = traceRoofRegionAtPoint(walls.getAll() as never, 3, 3)!;
        expect(areaOf(after.polygon)).toBeCloseTo(48, 6);
    });

    /**
     * ARM A — the 3D path (`RoofTool._handleRegionClick` → `CreateRoofCommand`).
     *
     * `traced.attribution` is computed and REPORTED at the click (the tool logs
     * `formatRoofRegionAttributionReport`), then dropped: the tool stashes only
     * `traced.polygon` into `_pendingPolygon`. Measured at the STORE, which is
     * where it has to survive for the tracker to ever see it.
     */
    it('ARM A — a roof created BY REGION in 3D stores the walls it was traced from', async () => {
        const { CreateRoofCommand } = await import('@pryzm/command-registry');
        const walls = attachedWallStore();
        seedWalls(walls);
        const roofStore = new RoofStore();

        const traced = traceRoofRegionAtPoint(walls.getAll() as never, 3, 3)!;
        const { polygon, centroid } = normalise(traced.polygon as [number, number][]);

        const level = { id: LEVEL_ID, name: 'L0', elevation: 0 };
        const ctx = {
            stores: { roofStore, wallStore: walls },
            bimManager: { getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined), getLevels: () => [level], registerElement: () => {} },
            projectContext: { activeLevelId: LEVEL_ID },
        };

        const cmd = new CreateRoofCommand(ROOF_ID, {
            levelId: LEVEL_ID,
            footprint: { polygon, centroid },
            roofType: 'flat',
            overhang: 0.3,
            baseOffset: 0,
            thickness: 0.2,
            // THE FIELD UNDER TEST. It is not on `CreateRoofPayload` today, so
            // this is the shape the wiring must accept — not a shape it has.
            boundingWallIds: traced.attribution.hostWallIds as string[],
        } as never);
        cmd.execute(ctx as never);

        const stored = roofStore.getById(ROOF_ID);
        expect(stored, 'CreateRoofCommand must have added the roof').toBeDefined();
        expect(
            stored!.boundingWallIds,
            'a by-region roof drawn in 3D must STORE its bounding walls — without them the tracker matches no roof',
        ).toBeDefined();
        expect(stored!.boundingWallIds).toContain('w-north');
    });

    /**
     * ARM B — the plan path (`RoofPlanToolHandler._commitRegion` → bus
     * `roof.create` → `CommandEventBridge` `roof.created` → the §P3.2-RF legacy
     * bridge in `initTools.ts` → `roofStore.add`).
     *
     * The plan path never touches `CreateRoofCommand` at all: the plugin
     * handler wins the verb and the bridge is what mirrors the roof into the
     * geometry store. So Arm A passing says NOTHING about this path, which is
     * exactly the per-path divergence C79 §7.4 forbids shipping.
     *
     * Driven through the REAL `CommandEventBridge` emit shape, because the
     * field has to survive that hop: the bridge reads `record.payload` and
     * re-emits a NAMED subset of it, so a field the emitter does not list is
     * dropped in flight however correctly the tool dispatched it.
     */
    it('ARM B — a roof created BY REGION in PLAN stores the walls it was traced from', async () => {
        const walls = attachedWallStore();
        seedWalls(walls);
        const roofStore = new RoofStore();

        const traced = traceRoofRegionAtPoint(walls.getAll() as never, 3, 3)!;

        // What `RoofPlanToolHandler._commit` dispatches on the bus today, plus
        // the attribution it currently drops.
        const dispatched = {
            id: ROOF_ID,
            levelId: LEVEL_ID,
            boundary: (traced.polygon as [number, number][]).map(([x, z]) => ({ x, y: 0, z })),
            shape: 'flat',
            pitch: 0,
            overhang: 0.3,
            thickness: 0.2,
            boundingWallIds: traced.attribution.hostWallIds as string[],
        };

        // THE REAL BRIDGE, driven with a stub PatchEmitter + EventBus. Imported
        // from source rather than the package barrel: `@pryzm/runtime-composer`'s
        // index transitively pulls `pdfjs-dist`, which touches `DOMMatrix` at
        // module scope and cannot load under this suite's `node` environment.
        // `CommandEventBridge.ts` itself imports nothing but types.
        const { wireCommandEventBridge } = await import(
            '../../../packages/runtime-composer/src/CommandEventBridge'
        );

        let ev!: {
            id?: string; levelId: string; boundary?: ReadonlyArray<{ x: number; y: number; z: number }>;
            overhang?: number; thickness?: number; boundingWallIds?: string[];
        };
        let emit!: (bytes: unknown, record: unknown) => void;
        const patches = { subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; } };
        const events = {
            emit: (name: string, payload: unknown) => { if (name === 'roof.created') ev = payload as typeof ev; },
        };
        wireCommandEventBridge(patches as never, events as never);

        emit(new Uint8Array(), {
            id: 'evt-1', type: 'roof.create', payload: dispatched,
            affectedStores: ['roof'], audit: { actorId: 'probe' }, forward: [],
        });

        expect(ev, 'the bridge must emit `roof.created` for a `roof.create` record').toBeDefined();
        expect(
            ev.boundingWallIds,
            'the bus→event hop must carry boundingWallIds, or the plan path can never populate it',
        ).toContain('w-north');

        // The §P3.2-RF legacy mirror, EXECUTED — not transcribed. This is the
        // exact function `initTools.ts` calls inside its `roof.created`
        // subscriber; it was extracted from that closure precisely so this
        // assertion runs production code instead of a copy of it.
        const { roofRecordFromCreatedEvent } = await import('../src/engine/roofCreatedMirror');
        const record = roofRecordFromCreatedEvent(ev);
        expect(record, 'the mirror must accept a well-formed roof.created event').not.toBeNull();
        roofStore.add(record as never);

        const stored = roofStore.getById(ROOF_ID);
        expect(
            stored!.boundingWallIds,
            'a by-region roof drawn in PLAN must STORE its bounding walls — C79 §7.4 forbids the 3D path following while this one silently does not',
        ).toBeDefined();
        expect(stored!.boundingWallIds).toContain('w-north');
    });

    /**
     * ARM C — THE REACHABILITY PROOF. Everything above is creation; this is the
     * follow itself, and it reads the number off the STORED record.
     *
     * Wired exactly as `initTools.ts` wires the three live trackers: the real
     * store pair, the real command factory, and a `commandManagerRef` whose
     * `.current` runs `canExecute` then `execute` against a real
     * `CommandContext` — the same two-step `_cmExec` performs in production.
     */
    it('ARM C — moving a bounding wall rewrites the roof STORE from 36 m² to 48 m²', async () => {
        const registry = await import('@pryzm/command-registry');
        const UpdateRoofBoundaryCommand = (registry as Record<string, unknown>).UpdateRoofBoundaryCommand as
            | (new (p: unknown) => { canExecute(c: unknown): { ok: boolean; reason?: string }; execute(c: unknown): unknown })
            | undefined;
        expect(
            UpdateRoofBoundaryCommand,
            'UpdateRoofBoundaryCommand must exist — the tracker has no way to WRITE the re-derived footprint without it',
        ).toBeDefined();

        const { RoofDependencyTracker } = await import('@pryzm/geometry-roof');

        const walls = attachedWallStore();
        seedWalls(walls);
        const roofStore = new RoofStore();

        // Seed the roof exactly as a by-region creation leaves it. Arms A and B
        // own whether creation populates this; Arm C isolates the FOLLOW.
        const traced = traceRoofRegionAtPoint(walls.getAll() as never, 3, 3)!;
        const { polygon, centroid } = normalise(traced.polygon as [number, number][]);
        roofStore.add({
            id: ROOF_ID, type: 'roof', levelId: LEVEL_ID,
            footprint: { polygon, centroid },
            roofType: 'flat', overhang: 0.3, baseOffset: 0, thickness: 0.2,
            boundingWallIds: traced.attribution.hostWallIds as string[],
            properties: {},
        } as never);
        expect(areaOf(roofStore.getById(ROOF_ID)!.footprint.polygon)).toBeCloseTo(36, 6);

        // The production wiring, at the one point that matters.
        const commandManagerRef: { current?: { execute(c: unknown): unknown } } = {};
        const ctx = { stores: { roofStore, wallStore: walls } };
        commandManagerRef.current = {
            execute: (cmd: unknown) => {
                const c = cmd as { canExecute(x: unknown): { ok: boolean; reason?: string }; execute(x: unknown): unknown };
                const v = c.canExecute(ctx);
                if (!v.ok) throw new Error(`command refused: ${v.reason}`);
                return c.execute(ctx);
            },
        };

        const tracker = new RoofDependencyTracker(
            roofStore as never,
            walls as never,
            (p: unknown) => new UpdateRoofBoundaryCommand!(p),
            commandManagerRef as never,
        );
        tracker.bootstrap();

        // The gesture. Nothing below touches the roof directly.
        moveNorthWall(walls, 2);

        const stored = roofStore.getById(ROOF_ID)!;
        expect(
            areaOf(stored.footprint.polygon),
            "the roof's STORED footprint must follow its wall — the engine returning 48 m² is not the product doing so",
        ).toBeCloseTo(48, 3);
    });

    /**
     * ARM D — STRUCTURAL PIN, and labelled as one because it is WEAKER than the
     * three arms above and must not be mistaken for them.
     *
     * WHAT IT DOES NOT PROVE: that this line executes at boot. `initTools` is a
     * ~2600-line function needing a THREE world, a components registry and
     * twenty stores before its first statement runs, so no suite in this repo
     * executes it. Arm C proves the tracker + command MECHANISM against the real
     * `RoofStore` and the real `WallStore`, wired with the same four arguments;
     * the root `tsc` proves those arguments type-check against the production
     * store types. The residue — "does this block run at boot" — is the exact
     * assumption the three EXISTING trackers (slab, floor, ceiling) already rest
     * on, and it is inherited here rather than newly created.
     *
     * WHAT IT DOES PROVE: that the construction and its `bootstrap()` are still
     * present. Roof's follow path has no gate of its own —
     * `check-move-propagation`'s A7 arm is purely STRUCTURAL (it greps
     * `RoofTypes.ts` for a field NAME), so it cannot notice this wiring
     * disappearing. Without this pin, deleting the two lines in `initTools`
     * would leave every arm above green and the product silently back to a roof
     * that does not follow.
     */
    it('ARM D — STRUCTURAL: initTools still constructs and bootstraps the roof tracker', async () => {
        const { readFile } = await import('node:fs/promises');
        const src = await readFile(new URL('../src/engine/initTools.ts', import.meta.url), 'utf8');

        expect(
            /new RoofDependencyTracker\(/.test(src),
            'initTools must CONSTRUCT the roof tracker — without it nothing subscribes to the wall store on roof\'s behalf',
        ).toBe(true);
        expect(
            /roofDependencyTracker\.bootstrap\(\)/.test(src),
            'the tracker must be BOOTSTRAPPED — roofs already in the store when the editor opens (every loaded project) register no dependency otherwise',
        ).toBe(true);
        expect(
            /new UpdateRoofBoundaryCommand\(/.test(src),
            'the factory must build the real command — a tracker with no write-back recomputes into the void',
        ).toBe(true);
    });
});
