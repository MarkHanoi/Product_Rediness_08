// §MT-06-CENSUS — the executed census of the two collections MT-06 calls rivals.
//
// THE ROW, VERBATIM (BIM30-MASTER-COMPLETION-TRACKER, MT-06 / C70 A-INV-1)
// ----------------------------------------------------------------------------
//   "`persist:opening` is MISCONFIGURED for its kind; openings have two
//    authoritative copies (`OpeningStore` + `WallData.openings[]`)"
//
// The row's instruction was: declare the single authority, migrate readers, and
// DELETE the loser. Before deleting anything this file does step 1 — CENSUS —
// because the sibling precedent `afe0cdad` nearly shipped silent data loss by
// deleting the "obviously redundant" half of a pair that turned out to be
// load-bearing, with no test covering it.
//
// WHAT THE CENSUS MEASURES, AND WHY IT IS EXECUTED AND NOT READ
// ----------------------------------------------------------------------------
// A doc comment claiming a chokepoint has been wrong here before (a "single
// chokepoint" was recently found to be 1 of 6), and `C11-ELEMENT-CREATION-
// PIPELINE.md:960` states, today, that a **Wall Opening (Door/Window)** is
// created via `OpeningStore.add()`. That line is the row's whole premise. So the
// premise is put to the REAL commands and the REAL stores here, and whatever
// they do is the answer.
//
// Three questions, each answered by a store read after a real command:
//
//   Q1  Does creating a WALL opening put a record in `OpeningStore`?
//   Q2  Does creating a SLAB opening put a record in `WallData.openings[]`?
//   Q3  Can `OpeningStore` host a WALL at all — i.e. is the separation a
//       convention a future writer could break, or is it CONSTRUCTED?
//
// Q3 is the one that decides whether this row is a deletion or a refutation:
// enumerated separation rots, constructed separation cannot. That is the same
// standard `c100df8f` was held to when authority moved from six call sites to
// `WallStore.add()`.
//
// REAL, imported from production: `WallStore`, `SlabStore`, `OpeningStore`,
// `CommandManager`, `CreateWallOpeningCommand`, `CreateOpeningCommand`,
// `doorStore`, `windowStore`. NOT real: `bimManager` is a level-authority stub
// and no meshes are built — the subject is WHICH COLLECTION RECEIVES A RECORD,
// never the triangulation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Opening } from '@pryzm/geometry-wall';
import { SlabStore, type SlabData } from '@pryzm/geometry-slab';
import { ProjectContext } from '@pryzm/core-app-model';
import { OpeningStore } from '@pryzm/core-app-model/stores';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';
import { CreateOpeningCommand } from '../src/slabs/CreateOpeningCommand';

const LEVEL = 'L0';
const WALL_ID = 'census-wall-1';
const SLAB_ID = 'census-slab-1';

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

function wallRecord(id: string): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3, thickness: 0.2, baseOffset: 0, openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'census', version: 1 },
    } as unknown as WallData;
}

function slabRecord(id: string): SlabData {
    return {
        id, type: 'slab', levelId: LEVEL, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 },
        polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    openingStore: OpeningStore;
    cm: CommandManager;
    dispose(): void;
}

function makeWorld(): World {
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    const openingStore = new OpeningStore(new ProjectContext() as never);

    const ctx = {
        stores: { wallStore, slabStore, openingStore },
        bimManager: makeBimManager(),
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    Object.assign(window, { wallStore });   // WallFaceResolver reads this global

    wallStore.add(wallRecord(WALL_ID));
    slabStore.add(slabRecord(SLAB_ID));

    return {
        wallStore, slabStore, openingStore, cm,
        dispose() { Object.assign(window, { wallStore: undefined }); },
    };
}

const wallOpenings = (w: World): Opening[] =>
    (w.wallStore.getById(WALL_ID)?.openings ?? []) as Opening[];

let world: World;

beforeEach(() => {
    doorStore.getAll().forEach(d => doorStore.remove?.(d.id));
    windowStore.getAll().forEach(x => windowStore.remove?.(x.id));
    world = makeWorld();
});
afterEach(() => world.dispose());

describe('§MT-06-CENSUS — which collection receives which opening', () => {
    // ── Q1 ───────────────────────────────────────────────────────────────────
    it('a WALL opening lands in WallData.openings[] and NOWHERE in OpeningStore', () => {
        expect(world.openingStore.getAll().length).toBe(0);

        const res = world.cm.execute(new CreateWallOpeningCommand({
            wallId: WALL_ID,
            openingData: {
                type: 'window', offset: 2.0, width: 1.2,
                height: 1.4, sillHeight: 0.9, windowType: 'single',
            },
        } as never));
        expect(res.success).toBe(true);

        // RECORD A — the wall's own list took it.
        expect(wallOpenings(world).length).toBe(1);
        // RECORD B — the hosted element store took it.
        expect(windowStore.getAll().length).toBe(1);

        // …and `OpeningStore` never saw it. This is the row's premise, MEASURED:
        // the two collections named as rivals do not both hold this record —
        // only one of them does, and the other holds nothing.
        expect(world.openingStore.getAll().length).toBe(0);
    });

    // ── Q2 ───────────────────────────────────────────────────────────────────
    it('a SLAB opening lands in OpeningStore and NOWHERE in WallData.openings[]', () => {
        const res = world.cm.execute(new CreateOpeningCommand({
            id: 'census-op-1', hostId: SLAB_ID, levelId: LEVEL,
            profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        }));
        expect(res.success).toBe(true);

        expect(world.openingStore.getAll().length).toBe(1);
        expect(world.openingStore.getByHostId(SLAB_ID).length).toBe(1);

        // The wall list is untouched — no rival copy was minted.
        expect(wallOpenings(world).length).toBe(0);
    });

    // ── Q3 — the one that makes the separation STRUCTURAL rather than habitual ─
    it('OpeningStore CANNOT be given a wall-hosted opening — the host must be a slab', () => {
        const cmd = new CreateOpeningCommand({
            id: 'census-op-illegal', hostId: WALL_ID, levelId: LEVEL,
            profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
        });

        const ctx = {
            stores: {
                wallStore: world.wallStore,
                slabStore: world.slabStore,
                openingStore: world.openingStore,
            },
            bimManager: makeBimManager(),
        } as unknown as CommandContext;

        // `canExecute` resolves the host through `slabStore` ONLY. A wall id is
        // not a slab id, so the command refuses — and it refuses WITH IDENTITY,
        // naming the id it could not resolve, per the refusal doctrine.
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(String(v.reason)).toContain(WALL_ID);

        // And the refusal is total: nothing was written on the way to saying no.
        expect(world.openingStore.getAll().length).toBe(0);
    });

    // ── the two collections, side by side, after BOTH kinds exist ────────────
    it('with one of each kind alive, the two collections are DISJOINT', () => {
        world.cm.execute(new CreateWallOpeningCommand({
            wallId: WALL_ID,
            openingData: {
                type: 'door', offset: 1.5, width: 0.9,
                height: 2.1, sillHeight: 0, doorType: 'single',
            },
        } as never));
        world.cm.execute(new CreateOpeningCommand({
            id: 'census-op-2', hostId: SLAB_ID, levelId: LEVEL,
            profile: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 2 }],
        }));

        const wallIds = new Set(wallOpenings(world).map(o => o.id ?? o.elementId));
        const storeIds = new Set(world.openingStore.getAll().map(o => o.id));

        expect(wallIds.size).toBe(1);
        expect(storeIds.size).toBe(1);

        // ZERO overlap. Not "the same record written twice" — two records of two
        // different kinds, each in exactly one place.
        const overlap = [...storeIds].filter(id => wallIds.has(id as never));
        expect(overlap).toEqual([]);
    });
});
