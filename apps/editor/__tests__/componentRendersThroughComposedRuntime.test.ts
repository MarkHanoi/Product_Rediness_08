/**
 * @vitest-environment happy-dom
 */
// componentRendersThroughComposedRuntime — §82.6-COMPONENT-RENDER-MOUNT.
// STR-UCE-MASTER-SPEC §82.6 · ADR-0376 D10 · C113 §10 · C16 CA-21 · C03 §4.5–4.8 ·
// UCE-REACHABILITY-AUDIT R1 / rank 1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE FOUNDER'S 82.6: "Place; it draws; change a type parameter; it regenerates
//     in place; undo works." — measured on the REAL composed runtime.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `componentJoinThroughComposedRuntime.test.ts` proves the VERBS land in the store;
// `componentPlacementFlowThroughComposedRuntime.test.ts` proves a CLICK reaches the
// verb. Both declare the same caveat: *"That a placed component RENDERS … is
// REPORTED, not worked around."* THIS file is that half. It mounts the production
// attach (`attachComponentRender`, the function `initTools` calls) on the REAL
// `rt.stores.component` and a REAL `THREE.Scene`, dispatches the REAL verbs, and
// reads the MESHES back out of the scene graph — never the committer's return value,
// never a spy on the bake.
//
// ─── WHAT IS STUBBED, DECLARED ─────────────────────────────────────────────────
// Nothing on the subject path. There is no WebGL here (node env) — the scene graph
// is measured, not rasterised: a `THREE.Mesh` with N vertices under the occurrence's
// group is what the renderer would draw, and its bounds are what the bake produced.
//
// ─── WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ───────
//  1. That `initTools` runs this attach in the browser. That wiring is grep-asserted
//     in ARM F below (the lift test's D-1 idiom) and NOT browser-verified this lane.
//  2. PLAN / SECTION appearance — no plan-symbol producer exists for this family.
//  3. Picking — no pick strategy is registered for the kind.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { composeRuntime } from '@pryzm/runtime-composer';
import {
    packFamily,
    makeAddReferencePlaneMigrator,
    makeAddBoxSolidMigrator,
    type FamilyDocument,
    type FamilyManifest,
} from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import { attachComponentRender, type ComponentRenderHandle } from '../src/engine/component/index.js';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo';

const AUDIT = { actorId: 'component-render', projectId: 'component-render', clientId: 'node' } as const;
const BUDGET = 600_000;
const LEVEL_ID = 'level-1';
const LEVEL_Y = 3.2;

// ── IDS — real prefixed ULIDs (C111 §1.1-a; Crockford base32, no I/L/O/U) ──────
const ULID_STEM = '01BXZ3NDEKTSV4RRFFQ69G5R';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const PARAM_WIDTH = `par_${ulidN(4)}`;
const PARAM_HEIGHT = `par_${ulidN(5)}`;
const PLANE_ID = `plane_${ulidN(6)}`;
const SOLID_ID = `sol_${ulidN(7)}`;
const PROFILE_ID = `prof_${ulidN(8)}`;
const COMPONENT_ID = `component_${ulidN(9)}`;
const COMPONENT_2 = `component_${ulidN(10)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let scene: THREE.Scene;
let handle: ComponentRenderHandle;
/** Resolves the next `onGeometryReady` for an id — the ONLY honest "it landed" signal
 *  (§COMPONENT-RENDER-ASYNC-SEAM: `onAdd` returns an EMPTY group by design). */
const waiters = new Map<string, Array<(n: number) => void>>();
function nextGeometry(id: string): Promise<number> {
    return new Promise((res) => {
        const list = waiters.get(id) ?? [];
        list.push(res);
        waiters.set(id, list);
    });
}

function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component missing on the REAL composed runtime.');
    return s;
}
function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}

/** The occurrence's group in the scene, by the name the committer gives it. */
function groupOf(id: string): THREE.Group | undefined {
    return scene.getObjectByName(`component:${id}`) as THREE.Group | undefined;
}
function meshesOf(id: string): THREE.Mesh[] {
    const g = groupOf(id);
    return g ? (g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[]) : [];
}
function boundsOf(id: string): THREE.Box3 {
    const box = new THREE.Box3();
    for (const m of meshesOf(id)) {
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!);
    }
    return box;
}

/** The fixture — authored through the SAME ops the workspace applies (`add-reference-
 *  plane`, `add-box-solid`), packed through the one packer, loaded through the one
 *  catalogue. Width is bound to a TYPE parameter so a type swap re-shapes it; Height
 *  to an INSTANCE parameter so `setInstanceParameter` re-shapes it. */
async function loadFixtureDefinition(): Promise<void> {
    const base: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 700, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'S-900', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'S-1200', values: { [PARAM_WIDTH]: 1200 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [], connectors: [], propertySets: [], featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1', id: DEF_ID, name: 'RenderFixtureCabinet', semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane-82-6' },
        description: 'componentRenders fixture', ifcEntity: 'IfcFurniture', category: 'Furniture', tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: '2026-09-05T00:00:00.000Z', lastModifiedAt: '2026-09-05T00:00:00.000Z',
    } as unknown as FamilyManifest;

    const v = base.formatVersion;
    const withPlane = makeAddReferencePlaneMigrator(v, v, {
        plane: { id: PLANE_ID, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    }).apply({ manifest, document: base, events: [] } as any);
    const withBox = makeAddBoxSolidMigrator(v, v, {
        solidId: SOLID_ID, profileId: PROFILE_ID, profileName: 'Body', planeId: PLANE_ID,
        entityIds: [ulidN(11), ulidN(12), ulidN(13), ulidN(14)],
        width: { kind: 'parameter', parameterId: PARAM_WIDTH },
        depth: { kind: 'literal', value: 500 },
        height: { kind: 'parameter', parameterId: PARAM_HEIGHT },
    }).apply(withPlane as any);

    const packed = await packFamily({ manifest: withBox.manifest as FamilyManifest, document: withBox.document as FamilyDocument });
    if (!packed.ok) throw new Error(`[test] packFamily failed: ${(packed as { message?: string }).message}`);
    const loaded = await componentCatalog.loadFromBytes(packed.bytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
}

const PLACE = {
    componentId: COMPONENT_ID, levelId: LEVEL_ID, definitionId: DEF_ID, typeId: TYPE_A,
    origin: { x: 2, y: 0, z: 3 }, rotation: 0,
};

beforeAll(async () => {
    rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
    (window as unknown as { runtime: unknown }).runtime = rt;
    componentCatalog.clear();
    await loadFixtureDefinition();

    scene = new THREE.Scene();
    // ⭐ THE PRODUCTION ATTACH, on the REAL store and the REAL catalogue — the call
    // `initTools` makes, with a scene in place of `world.scene.three`.
    handle = attachComponentRender({
        store: store(),
        scene,
        catalog: componentCatalog,
        levelY: (levelId: string) => (levelId === LEVEL_ID ? LEVEL_Y : 0),
        onGeometryReady: (id, n) => {
            const list = waiters.get(id);
            if (!list) return;
            waiters.delete(id);
            for (const res of list) res(n);
        },
    });
}, BUDGET);

afterAll(() => {
    handle?.dispose();
    componentCatalog.clear();
    rt?.dispose?.();
});

describe('§82.6 — a PLACED component DRAWS, REGENERATES in place, and UNDOES — through the composed runtime', () => {

    it('ARM A — component.place → a MESH is in the scene, at the storey elevation, with the bake\'s bounds', async () => {
        wipe();
        expect(meshesOf(COMPONENT_ID), 'must start with nothing drawn').toHaveLength(0);

        const landed = nextGeometry(COMPONENT_ID);
        await rt.bus.executeCommand('component.place', PLACE);

        // §COMPONENT-RENDER-ASYNC-SEAM — the group exists NOW, empty; the honest
        // "did it draw" is the callback, and this arm waits for it rather than sleeping.
        expect(groupOf(COMPONENT_ID), 'the group is registered synchronously').toBeDefined();
        const solids = await landed;
        expect(solids, 'ONE solid baked (the box)').toBe(1);

        const meshes = meshesOf(COMPONENT_ID);
        expect(meshes, 'ONE mesh under the occurrence group').toHaveLength(1);
        const pos = meshes[0]!.geometry.getAttribute('position');
        expect(pos.count, 'a real extrusion has vertices').toBeGreaterThan(0);

        // Type S-900: width 900 mm, depth 500 mm literal, height 700 mm → metres.
        const b = boundsOf(COMPONENT_ID);
        expect(b.max.x - b.min.x).toBeCloseTo(0.9, 6);
        expect(b.max.z - b.min.z).toBeCloseTo(0.5, 6);
        expect(b.max.y - b.min.y).toBeCloseTo(0.7, 6);

        // Placement transform: the group carries origin + the LEVEL's elevation (the
        // storey rides `levelId`; `component.place` writes origin.y = 0).
        const g = groupOf(COMPONENT_ID)!;
        expect(g.position.x).toBe(2);
        expect(g.position.z).toBe(3);
        expect(g.position.y, '§82.6-LEVEL-Y — drawn on ITS storey, not the ground').toBe(LEVEL_Y);
        expect(g.userData['primitiveType']).toBe('component');
        expect(meshes[0]!.userData['elementId']).toBe(COMPONENT_ID);

        expect(handle.committer.stats.refusedBakes).toBe(0);
        expect(handle.committer.stats.unresolvedDefinitions).toBe(0);
    }, BUDGET);

    it('ARM B — component.setInstanceParameter REGENERATES the mesh in place (spec §12 / §66)', async () => {
        const before = boundsOf(COMPONENT_ID);
        expect(before.max.y - before.min.y).toBeCloseTo(0.7, 6);

        const landed = nextGeometry(COMPONENT_ID);
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_HEIGHT, value: 1000,
        });
        expect(await landed).toBe(1);

        // Same group, new geometry: the occurrence did not move, its solid re-baked.
        const after = boundsOf(COMPONENT_ID);
        expect(after.max.y - after.min.y, 'Height 1000 mm → 1.0 m').toBeCloseTo(1.0, 6);
        expect(after.max.x - after.min.x, 'width untouched').toBeCloseTo(0.9, 6);
        expect(meshesOf(COMPONENT_ID), 'still ONE mesh — the old one was disposed, not stacked').toHaveLength(1);
        expect(groupOf(COMPONENT_ID)!.position.x).toBe(2);
    }, BUDGET);

    it('ARM C — component.swapType REGENERATES from the TYPE\'s values; the instance override survives (J7)', async () => {
        const landed = nextGeometry(COMPONENT_ID);
        await rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_B });
        expect(await landed).toBe(1);

        const b = boundsOf(COMPONENT_ID);
        expect(b.max.x - b.min.x, 'S-1200 → 1.2 m wide').toBeCloseTo(1.2, 6);
        expect(b.max.y - b.min.y, 'the instance override (Height 1000) is NOT collapsed by a type swap').toBeCloseTo(1.0, 6);
        expect(groupOf(COMPONENT_ID)!.userData['typeId']).toBe(TYPE_B);
    }, BUDGET);

    it('ARM D — a MOVE is a transform, not a bake (§COMPONENT-RENDER-GENERATION-GUARD\'s cheap path)', async () => {
        const rebuilds = handle.committer.stats.rebuilds;
        // The record's origin is the store's; a move lands as a nested patch, exactly
        // as the undo adapter would apply it.
        store().applyPatch([{ op: 'replace', path: [COMPONENT_ID, 'origin'], value: { x: 5, y: 0, z: 1 } }]);
        expect(groupOf(COMPONENT_ID)!.position.x).toBe(5);
        expect(groupOf(COMPONENT_ID)!.position.z).toBe(1);
        expect(handle.committer.stats.rebuilds, 'NO bake was issued for a move').toBe(rebuilds);
        expect(handle.committer.stats.transformOnlyUpdates).toBeGreaterThanOrEqual(1);
    }, BUDGET);

    it('ARM E — ⭐ UNDO through the REAL adapter ERASES the mesh; REDO brings it back (C03 §4.5–4.8, one subscription)', async () => {
        const adapter = buildUndoStoreMap()['component'];
        expect(adapter, 'the `component` undo adapter must resolve').toBeDefined();

        // Undo of the placement = the inverse patch the ring buffer applies.
        adapter!.applyPatch([{ op: 'remove', path: [COMPONENT_ID] } as never]);
        expect(groupOf(COMPONENT_ID), 'Ctrl+Z: the group is GONE from the scene').toBeUndefined();
        expect(store().getState().has(COMPONENT_ID)).toBe(false);

        // Redo = re-add the record through the same adapter; the SAME subscription draws it.
        const landed = nextGeometry(COMPONENT_ID);
        adapter!.applyPatch([{ op: 'add', path: [COMPONENT_ID], value: {
            id: COMPONENT_ID, type: 'component', levelId: LEVEL_ID, definitionId: DEF_ID, typeId: TYPE_A,
            instanceParameters: {}, origin: { x: 2, y: 0, z: 3 }, rotation: 0,
        } } as never]);
        expect(await landed).toBe(1);
        expect(meshesOf(COMPONENT_ID), 'Ctrl+Y: drawn again').toHaveLength(1);
        expect(boundsOf(COMPONENT_ID).max.x - boundsOf(COMPONENT_ID).min.x).toBeCloseTo(0.9, 6);
    }, BUDGET);

    it('ARM F — a placement whose definition arrives LATER draws when the catalogue notifies (§82.6-DEFINITION-INVALIDATION — the project-restore order)', async () => {
        // Simulate the restore order: records first (sync), definitions after (async).
        const entry = componentCatalog.entry(DEF_ID)!;
        const bytes = entry.bytes;
        componentCatalog.clear();
        expect(componentCatalog.has(DEF_ID)).toBe(false);

        const unresolvedBefore = handle.committer.stats.unresolvedDefinitions;
        const landedEmpty = nextGeometry(COMPONENT_2);
        store().applyPatch([{ op: 'add', path: [COMPONENT_2], value: {
            id: COMPONENT_2, type: 'component', levelId: LEVEL_ID, definitionId: DEF_ID, typeId: TYPE_A,
            instanceParameters: {}, origin: { x: 0, y: 0, z: 0 }, rotation: 0,
        } }]);
        expect(await landedEmpty, 'nothing drawn while the definition is absent — an ABSENCE, not a box').toBe(0);
        expect(handle.committer.stats.unresolvedDefinitions).toBe(unresolvedBefore + 1);
        expect(groupOf(COMPONENT_2)!.userData['pryzmUnresolvedDefinition']).toBe(DEF_ID);
        expect(meshesOf(COMPONENT_2)).toHaveLength(0);

        // The definition loads (the restore's async half) → the catalogue notifies →
        // every drawn occurrence re-bakes → the mesh appears WITHOUT any store change.
        const landed = nextGeometry(COMPONENT_2);
        const res = await componentCatalog.loadFromBytes(bytes, { provenance: 'project' });
        expect(res.ok).toBe(true);
        expect(await landed).toBe(1);
        expect(meshesOf(COMPONENT_2), 'DRAWN once its definition exists').toHaveLength(1);
        expect(groupOf(COMPONENT_2)!.userData['pryzmUnresolvedDefinition']).toBeUndefined();
    }, BUDGET);

    it('ARM G — the production wiring CALLS this attach (the lift test\'s D-1 idiom; NOT browser-verified)', () => {
        const src = readFileSync(resolve(__dirname, '../src/engine/initTools.ts'), 'utf8');
        expect(src).toMatch(/attachComponentRender\(\{/);
        expect(src, 'on the REAL component store').toMatch(/slot\?\.\['component'\] as DirtyComponentStore/);
        expect(src, 'with the scene the viewport draws').toMatch(/scene:\s*world\.scene\.three/);
        expect(src, 'with the storey elevation').toMatch(/getLevelById\?\.\(levelId\)/);
        // The barrel exports it under the name initTools imports.
        const barrel = readFileSync(resolve(__dirname, '../src/engine/component/index.ts'), 'utf8');
        expect(barrel).toMatch(/attachComponentRender/);
    });

    it('ARM H — dispose() removes every group and the subscriptions (project teardown)', async () => {
        const drawn = handle.drawnIds();
        expect(drawn.length).toBeGreaterThan(0);
        handle.dispose();
        for (const id of drawn) expect(groupOf(id)).toBeUndefined();
        // A patch after dispose reaches nobody — re-attach for afterAll's dispose to be idempotent.
        wipe();
        handle = attachComponentRender({ store: store(), scene, catalog: componentCatalog });
        expect(handle.drawnIds()).toHaveLength(0);
    });
});
