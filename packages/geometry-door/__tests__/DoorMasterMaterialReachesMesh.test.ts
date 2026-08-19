/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / S17 — A DOOR'S `materialId` REACHES THE MESH.
 *
 * ─── What C100 requires of this file, and why it is not a producer test ─────
 *
 * §9.6.c step 3: *"each landing with a test that drives a **real DTO through the
 * real producer into the real bridge** and asserts the master's hex — never
 * `composeMaterialKey` in isolation (§9.3)."* §9.3 RETRACTED an earlier slice for
 * proving coverage without touching its subject: a test titled *"resolves an
 * id-only DOOR"* that never constructed a door.
 *
 * ⚠ For a door, the producer/bridge pair is **not the path the founder sees**.
 * `produceDoor` + `plugins/door/.../material-bridge.ts` are the P1 pipeline;
 * what draws the door in the editor today is `DoorBuilder`, which builds
 * `THREE.MeshStandardMaterial` instances directly. So this test drives the
 * **production `DoorBuilder`** — the same class `HostedLeafSitsInItsHole.test.ts`
 * drives — and reads the colour off the materials attached to the meshes it put in
 * the scene. That is as close to a pixel as a headless assertion reaches.
 *
 * ─── The defect being pinned ────────────────────────────────────────────────
 *
 * The door's material identity has lived on `frameFinish.materialId` /
 * `leafFinish.materialId` for months. The property panel's "Frame Finish" and
 * "Leaf Finish" dropdowns are populated **from `STANDARD_MATERIAL_LIBRARY`** and
 * write those ids through `UpdateDoorParameterCommand` (a live command-registry
 * route); `ProjectSerializer` copies the whole record and `ProjectLoader` calls
 * `doorStore.add(d)`, so the id survives save and reload.
 *
 * ⛔ **`DoorBuilder` read `door.frameColor` and nothing else.** Worse, `frameFinish`
 * is in `_PROPERTY_ONLY_FIELDS`, so choosing a finish was routed to the LIVE PATCH
 * branch, whose entire effect was `frameMat.color.set(door.frameColor)` —
 * re-applying the colour that had not changed. Picking Oak wrote a correct id to a
 * correctly persisted record and the door on screen never moved.
 *
 * That is why case 2 below drives the PATCH branch specifically. A fix wired only
 * into the rebuild branch would leave the user's actual gesture on the broken path
 * and this file would still be green — so the branch is selected deliberately, by
 * passing `prev`, exactly as `_drainQueue` does.
 *
 * ─── Red-first ──────────────────────────────────────────────────────────────
 * VERIFIED to fail without the fix: reverting `buildVisuals` to
 * `vgStyle?.colorOverride ?? door.frameColor` turns cases 1, 2 and 3 red and leaves
 * 4 and 5 green. A test that passes on the broken code proves nothing, so that was
 * executed rather than assumed.
 *
 * ⚠ WHAT THIS STILL DOES NOT PROVE, stated so it is never read as coverage: that a
 * frame was drawn, that the renderer was not culling, or that persistence round-trips
 * (that is ARM D/E's axis, and door already passes it — the serializer copies the
 * whole record). It proves the master's colour reaches the material on the mesh,
 * which is the link that was broken.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';
import { DOOR_COLOR_SENTINEL, DOOR_UNRESOLVED_MATERIAL_COLOR } from '../src/doorFinishColour';

const LEVEL_ID = 'L1';
const ELEVATION = 0;

/** A minimal, VALID door record — the sentinel colours are the schema's own defaults. */
const baseDoor = (extra: Record<string, unknown> = {}) => ({
    id: 'd-mat-1', wallId: 'w-host', openingId: 'op-1',
    offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameThickness: 0.05, frameDepth: 0.07, leafThickness: 0.04,
    frameColor: DOOR_COLOR_SENTINEL, leafColor: DOOR_COLOR_SENTINEL,
    handle: true, handleHeight: 1.05,
    threshold: false, thresholdHeight: 0.02, leafVisibleInPlan: false,
    ...extra,
}) as never;

function hostWall() {
    return {
        id: 'w-host', levelId: LEVEL_ID,
        baseLine: [{ x: 0, y: ELEVATION, z: 0 }, { x: 6, y: ELEVATION, z: 0 }],
        height: 3.0, thickness: 0.2, baseOffset: 0,
        openings: [{ id: 'op-1', elementId: 'd-mat-1', type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 }],
    };
}

function makeBuilder(): { builder: DoorBuilder; scene: THREE.Scene } {
    initDefaultViewsManager();
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'fine' } } as never);
    const wall = hostWall();
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: LEVEL_ID, elevation: ELEVATION }),
    } as never;
    const scene = new THREE.Scene();
    return { builder: new DoorBuilder(scene, wallStoreStub), scene };
}

type Rebuildable = { rebuild(door: unknown, prev?: unknown): void };

/**
 * The FRAME and LEAF material colours, read back off the builder's own material
 * array — index 0 is the frame material and index 1 the leaf, as
 * `_applyPropertyOnly`'s own comment states. These are the very instances assigned
 * to the meshes; `meshHexes()` below cross-checks that from the scene side.
 */
function slotHexes(builder: DoorBuilder, id: string): { frame: string; leaf: string } {
    const mats = (builder as unknown as { doorMaterials: Map<string, THREE.Material[]> })
        .doorMaterials.get(id);
    expect(mats, 'the builder must have recorded materials for this door').toBeTruthy();
    const hex = (m: THREE.Material | undefined) =>
        '#' + (m as THREE.MeshStandardMaterial).color.getHexString().toLowerCase();
    return { frame: hex(mats![0]), leaf: hex(mats![1]) };
}

/** Every distinct material colour actually attached to a mesh in the scene. */
function meshHexes(scene: THREE.Scene): Set<string> {
    const out = new Set<string>();
    scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const one of Array.isArray(m) ? m : [m]) {
            const c = (one as THREE.MeshStandardMaterial).color;
            if (c) out.add('#' + c.getHexString().toLowerCase());
        }
    });
    return out;
}

/** Read from the master, NEVER transcribed — a typed hex passes while the catalogue moves. */
const masterHex = (id: string): string => {
    const rec = MATERIAL_CATALOG.find((m) => m.id === id);
    expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
    return rec!.color.toLowerCase();
};

beforeEach(() => {
    // The unresolved diagnostic is deduplicated per door+slot for the session; the
    // colour assertions below do not depend on the warning firing, so no reset is
    // needed — but each case uses its own door id so the states stay independent.
});

describe('C100 §2.1 / S17 — a door\'s materialId reaches the material on the mesh', () => {
    it('⭐ 1. a frame finish naming a MASTER material paints the MASTER\'s colour', () => {
        const { builder, scene } = makeBuilder();
        // Exactly the shape `DoorSection`'s "Frame Finish" dropdown writes.
        (builder as unknown as Rebuildable).rebuild(baseDoor({
            frameFinish: { name: 'Walnut', materialId: 'wood-walnut', materialColor: '#5a3a28' },
        }));

        const expected = masterHex('wood-walnut');
        expect(slotHexes(builder, 'd-mat-1').frame).toBe(expected);

        // …and it is on a real mesh in the scene, not merely in a map.
        expect(meshHexes(scene).has(expected)).toBe(true);

        // NEGATIVE, the pre-S17 answer: the flat field the builder used to read.
        expect(slotHexes(builder, 'd-mat-1').frame).not.toBe(DOOR_COLOR_SENTINEL);
    });

    it('⭐ 2. the LIVE-PATCH branch — the one the user\'s actual gesture takes', () => {
        // `frameFinish` sits in `_PROPERTY_ONLY_FIELDS`, so choosing a finish never
        // reaches the rebuild branch. Passing `prev` selects the patch branch, which
        // is what `_drainQueue` does. This is the case the defect lived in.
        const { builder } = makeBuilder();
        const before = baseDoor({ id: 'd-mat-2' });
        (builder as unknown as Rebuildable).rebuild(before);
        expect(slotHexes(builder, 'd-mat-2').frame).toBe(DOOR_COLOR_SENTINEL);

        const after = baseDoor({
            id: 'd-mat-2',
            frameFinish: { name: 'Oak', materialId: 'wood-oak', materialColor: '#c8a96e' },
        });
        (builder as unknown as Rebuildable).rebuild(after, before);

        expect(slotHexes(builder, 'd-mat-2').frame).toBe(masterHex('wood-oak'));
    });

    it('3. an UNKNOWN id paints MAGENTA — a named failure, never a plausible timber', () => {
        const { builder } = makeBuilder();
        (builder as unknown as Rebuildable).rebuild(baseDoor({
            id: 'd-mat-3',
            leafFinish: { name: 'Deleted', materialId: 'not-a-real-material', materialColor: '#123456' },
        }));

        // C100 §5: the failure is VISIBLE. Not the cached hex beside the dead id —
        // using that would make "your material was deleted" look deliberate.
        expect(slotHexes(builder, 'd-mat-3').leaf).toBe(DOOR_UNRESOLVED_MATERIAL_COLOR);
        expect(slotHexes(builder, 'd-mat-3').leaf).not.toBe('#123456');
    });

    it('4. an explicit Frame Colour still OVERRIDES the finish (§2.1 step 1)', () => {
        // The flat field DISAGREES with the finish it is derived from — which is
        // what a hand edit through the colour picker produces, and the only signal
        // that tells an override apart from a stale cache.
        const { builder } = makeBuilder();
        (builder as unknown as Rebuildable).rebuild(baseDoor({
            id: 'd-mat-4',
            frameColor: '#ff0000',
            frameFinish: { name: 'Oak', materialId: 'wood-oak', materialColor: '#c8a96e' },
        }));
        expect(slotHexes(builder, 'd-mat-4').frame).toBe('#ff0000');
    });

    it('5. CONTROL — a door with NO finish renders exactly as it did before S17', () => {
        // C100 §9.6.b names repainting the product as the thing that would rightly
        // get this convergence reverted. Both branches of "no material was named"
        // are pinned: the schema sentinel, and an authored flat colour.
        const { builder } = makeBuilder();
        (builder as unknown as Rebuildable).rebuild(baseDoor({ id: 'd-mat-5a' }));
        const a = slotHexes(builder, 'd-mat-5a');
        expect(a.frame).toBe(DOOR_COLOR_SENTINEL);
        expect(a.leaf).toBe(DOOR_COLOR_SENTINEL);

        (builder as unknown as Rebuildable).rebuild(baseDoor({
            id: 'd-mat-5b', frameColor: '#8b5a2b', leafColor: '#c8a165',
        }));
        const b = slotHexes(builder, 'd-mat-5b');
        expect(b.frame).toBe('#8b5a2b');
        expect(b.leaf).toBe('#c8a165');
    });

    it('6. the expected hex comes from the MASTER, so a catalogue edit reaches the door', () => {
        // C100 §2.2's whole point: "editing a master row changes every element that
        // references it". If this file transcribed the hex, that property would be
        // untestable — the test would agree with a stale copy.
        expect(materialHex('wood-walnut')).toBe(masterHex('wood-walnut'));
        expect(materialHex('wood-oak')).toBe(masterHex('wood-oak'));
    });
});
