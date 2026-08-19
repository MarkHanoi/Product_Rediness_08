/**
 * ⭐ C100 §2.1 / §9.6.c step 3 / S17 — A WINDOW'S `materialId` REACHES THE MESH.
 *
 * The twin of `geometry-door/__tests__/DoorMasterMaterialReachesMesh.test.ts`, and
 * deliberately the same measurement rather than a window-flavoured variation of it —
 * `DoorBuilder` and `WindowBuilder` are the two halves of one family (C15 hosted
 * openings) and C100 §9.1 names them in the same row, so they must be held to the
 * same pin or one of them will drift back.
 *
 * ─── The defect being pinned, and why it is SUBTLER than the door's ─────────
 *
 * The door's builder ignored `frameFinish` entirely, so picking a finish did
 * nothing at all. The window's builder DOES read `frameFinish` — but only
 * `frameFinish.materialColor`, **the hex the panel's dropdown cached beside the id**.
 * So a window has always rendered a TRANSCRIPTION of the master, never the master.
 *
 * C100 §2.1 is explicit that this is inverted: *"a resolved colour is a CACHE, never
 * an authority."* The visible consequence is §2.2's promise failing in silence —
 * *"editing a master row changes every element that references it"* — a window keeps
 * its stale copy forever and nothing says so. That is a quieter failure than the
 * door's and a longer-lived one, because it looks correct on the day it is authored.
 *
 * Case 1 below is therefore the load-bearing one: the record carries an id AND a
 * DELIBERATELY STALE cached hex beside it, and the assertion is that the MASTER
 * wins. A test that made the two agree would pass against the unfixed builder.
 *
 * ─── Red-first ──────────────────────────────────────────────────────────────
 * VERIFIED to fail without the fix — see the commit body for the executed run.
 *
 * ⚠ WHAT THIS STILL DOES NOT PROVE: that a frame was drawn, or that the renderer was
 * not culling. It proves the master's colour reaches the material on the mesh.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG, materialHex } from '@pryzm/schemas/materials';
import { WindowBuilder } from '../src/WindowBuilder';
import { WINDOW_COLOR_SENTINEL, WINDOW_UNRESOLVED_MATERIAL_COLOR } from '../src/windowFinishColour';

const LEVEL_ID = 'L1';
const ELEVATION = 0;

const baseWin = (extra: Record<string, unknown> = {}) => ({
    id: 'win-mat-1', wallId: 'w-host', openingId: 'op-1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: WINDOW_COLOR_SENTINEL,
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
    ...extra,
}) as never;

function hostWall() {
    return {
        id: 'w-host', levelId: LEVEL_ID,
        baseLine: [{ x: 0, y: ELEVATION, z: 0 }, { x: 6, y: ELEVATION, z: 0 }],
        height: 3.0, thickness: 0.2, baseOffset: 0,
        openings: [{ id: 'op-1', elementId: 'win-mat-1', type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 }],
    };
}

function makeBuilder(): { builder: WindowBuilder; scene: THREE.Scene } {
    const wall = hostWall();
    const wallStoreStub = {
        getById: () => wall,
        getLevelById: () => ({ id: LEVEL_ID, elevation: ELEVATION }),
    } as never;
    const scene = new THREE.Scene();
    return { builder: new WindowBuilder(scene, wallStoreStub), scene };
}

type Rebuildable = { rebuild(win: unknown, prev?: unknown): void };

/** mats[0] is the frame material — `_applyPropertyOnly`'s own comment states it. */
function frameHex(builder: WindowBuilder, id: string): string {
    const mats = (builder as unknown as { windowMaterials: Map<string, THREE.Material[]> })
        .windowMaterials.get(id);
    expect(mats, 'the builder must have recorded materials for this window').toBeTruthy();
    return '#' + (mats![0] as THREE.MeshStandardMaterial).color.getHexString().toLowerCase();
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

/** Read from the master, NEVER transcribed. */
const masterHex = (id: string): string => {
    const rec = MATERIAL_CATALOG.find((m) => m.id === id);
    expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
    return rec!.color.toLowerCase();
};

describe('C100 §2.1 / S17 — a window\'s materialId reaches the material on the mesh', () => {
    it('⭐ 1. the MASTER outranks the hex CACHED beside the id', () => {
        // The load-bearing case. `materialColor` here is deliberately WRONG — the
        // shape a record takes after a master row is edited, or after an old project
        // is reopened. Pre-S17 the builder returned this stale hex; it must now
        // return the catalogue's.
        const { builder, scene } = makeBuilder();
        (builder as unknown as Rebuildable).rebuild(baseWin({
            frameFinish: { name: 'Walnut', materialId: 'wood-walnut', materialColor: '#001122' },
        }));

        const expected = masterHex('wood-walnut');
        expect(frameHex(builder, 'win-mat-1')).toBe(expected);
        expect(frameHex(builder, 'win-mat-1')).not.toBe('#001122');

        // …and it is on a real mesh in the scene, not merely in a map.
        expect(meshHexes(scene).has(expected)).toBe(true);
    });

    it('⭐ 2. the LIVE-PATCH branch — `frameFinish` is a PROPERTY-ONLY field', () => {
        // `frameFinish` sits in `_PROPERTY_ONLY_FIELDS`, so choosing a finish never
        // reaches the rebuild branch. Passing `prev` selects the patch branch, which
        // is the path the user's actual gesture takes.
        const { builder } = makeBuilder();
        const before = baseWin({ id: 'win-mat-2' });
        (builder as unknown as Rebuildable).rebuild(before);
        expect(frameHex(builder, 'win-mat-2')).toBe(WINDOW_COLOR_SENTINEL);

        const after = baseWin({
            id: 'win-mat-2',
            frameFinish: { name: 'Oak', materialId: 'wood-oak', materialColor: '#c8a96e' },
        });
        (builder as unknown as Rebuildable).rebuild(after, before);

        expect(frameHex(builder, 'win-mat-2')).toBe(masterHex('wood-oak'));
    });

    it('3. an UNKNOWN id paints MAGENTA — a named failure, never a plausible grey (§5)', () => {
        const { builder } = makeBuilder();
        (builder as unknown as Rebuildable).rebuild(baseWin({
            id: 'win-mat-3',
            frameFinish: { name: 'Deleted', materialId: 'not-a-real-material', materialColor: '#123456' },
        }));
        expect(frameHex(builder, 'win-mat-3')).toBe(WINDOW_UNRESOLVED_MATERIAL_COLOR);
        expect(frameHex(builder, 'win-mat-3')).not.toBe('#123456');
    });

    it('4. CONTROL — a window with NO materialId renders exactly as it did before S17', () => {
        // C100 §9.6.b: repainting the product is the thing that would rightly get
        // this convergence reverted. The ladder is ADDITIVE — every pre-S17 rung
        // still fires with the same answer — and these two pin that.
        const { builder } = makeBuilder();

        // (a) the sentinel: nothing authored anywhere.
        (builder as unknown as Rebuildable).rebuild(baseWin({ id: 'win-mat-4a' }));
        expect(frameHex(builder, 'win-mat-4a')).toBe(WINDOW_COLOR_SENTINEL);

        // (b) a finish carrying only a cached hex — the pre-id record shape. It is
        //     used, exactly as before, because the name was already lost and this is
        //     the only thing left; not because a hex is an authority.
        (builder as unknown as Rebuildable).rebuild(baseWin({
            id: 'win-mat-4b',
            frameFinish: { name: 'Legacy timber', materialColor: '#a0724a' },
        }));
        expect(frameHex(builder, 'win-mat-4b')).toBe('#a0724a');

        // (c) an authored flat frameColor with no finish at all.
        (builder as unknown as Rebuildable).rebuild(baseWin({ id: 'win-mat-4c', frameColor: '#8b5a2b' }));
        expect(frameHex(builder, 'win-mat-4c')).toBe('#8b5a2b');
    });

    it('5. the expected hex comes from the MASTER, so a catalogue edit reaches the window', () => {
        expect(materialHex('wood-walnut')).toBe(masterHex('wood-walnut'));
        expect(materialHex('wood-oak')).toBe(masterHex('wood-oak'));
    });
});
