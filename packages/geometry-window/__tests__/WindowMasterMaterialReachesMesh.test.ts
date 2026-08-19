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
// ⭐ The REAL instancing gate (lane INST1). See case 2b.
import { materialInstanceSignature } from '@pryzm/renderer-three';
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

    it('⭐ 2. a SECOND master id, and the STALE cache beside it loses again', () => {
        // ⛔ THIS TEST WAS A FALSE GREEN AND IT PASSED FOR THE WRONG REASON.
        //
        // As MT3 left it, this case used `materialId: 'wood-oak'` beside
        // `materialColor: '#c8a96e'` — and `wood-oak`'s master colour IS `#c8a96e`
        // (materialCatalog.ts:54). The two agreed byte-for-byte, so the assertion
        // held against the UNFIXED builder: measured 2026-08-19, this file failed
        // 2 of 5 before the wiring and THIS WAS NOT ONE OF THEM. It is exactly the
        // trap this file's own header names — *"a test that made the two agree
        // would pass against the unfixed builder"* — committed inside the file that
        // warns about it.
        //
        // The cached hex is now deliberately WRONG, so the case can fail.
        //
        // ⚠ AND ITS STATED RATIONALE WAS FALSE TOO. It claimed passing `prev`
        // "selects the patch branch, which is the path the user's actual gesture
        // takes". It does not: `_isPropertyOnlyChange` opens with
        // `PROPERTY_ONLY_FAST_PATH_ENABLED = false` and returns before it classifies
        // anything (§INSTANCE-WINDOWS disabled it — an in-place patch would bleed
        // through a SHARED material to every sibling window). So `_applyPropertyOnly`
        // is unreachable for windows today, and a finish change takes the REBUILD
        // path. `prev` is still passed here, because that is the shape the store
        // emits on an update and the branch must stay correct if the flag ever flips
        // back — but this is a rebuild, and calling it a patch-branch proof would be
        // §COMMITTED-IS-NOT-REACHABLE with the roles reversed.
        const { builder } = makeBuilder();
        const before = baseWin({ id: 'win-mat-2' });
        (builder as unknown as Rebuildable).rebuild(before);
        expect(frameHex(builder, 'win-mat-2')).toBe(WINDOW_COLOR_SENTINEL);

        const after = baseWin({
            id: 'win-mat-2',
            frameFinish: { name: 'Oak', materialId: 'wood-oak', materialColor: '#0f0f0f' },
        });
        (builder as unknown as Rebuildable).rebuild(after, before);

        expect(frameHex(builder, 'win-mat-2')).toBe(masterHex('wood-oak'));
        expect(frameHex(builder, 'win-mat-2')).not.toBe('#0f0f0f');
    });

    it('⭐ 2b. INSTANCING SURVIVES — ONE material per distinct COLOUR, not one per window', () => {
        // ⭐ THE HIGHEST-LEVERAGE THING THIS SLICE COULD HAVE GOT WRONG, and a
        // colour assertion cannot see it. A window at the default `fine` LOD is
        // TWELVE meshes; the founder's live project holds 3,304 windows = 39,648
        // meshes, ~85% of his entire scene. `dedupInstanceMaterial` collapses only
        // CLASSIC material types (materialSignature.ts:42-48) — anything else
        // returns null from the signature, keeps a unique uuid, and forces a size-1
        // instance group. So a resolver that minted a material PER WINDOW (or a
        // non-classic one) would paint every colour correctly and silently destroy
        // instancing for the largest family in the model.
        //
        // `_sharedFrameMaterial` keys its cache on `(levelId, colour, transparent,
        // opacity, roughness)`, and `_resolveFrameColor` hands it a HEX STRING, so
        // the count is bounded by DISTINCT COLOURS. This pins that it stays so.
        //
        // ⭐ WHY MATERIAL *IDENTITY* IS THE THING TO ASSERT, not merely the hex:
        // `InstancedElementRenderer`'s group key is
        //   `levelId_indexCount_vertexCount_x0_y0_z0_materialUuid`
        // (InstancedElementRenderer.ts:370). Every other term is geometry or level;
        // `materialUuid` is the ONLY term this resolver can move. Two materials that
        // are EQUAL but not the SAME OBJECT carry different uuids and therefore land
        // in different groups — so the `toBe` identity assertion below is
        // load-bearing, and a `toEqual` would pass while instancing silently
        // fragmented into one group per window.
        //
        // ⚠ The `levelId` in both keys is NOT fragmentation, and was checked rather
        // than assumed: the GROUP key splits by level anyway (level visibility needs
        // one InstancedMesh per geo x mat x level), so keying the material by level
        // costs nothing on top. Recorded because it looks like a defect and is not.
        const { builder } = makeBuilder();
        const cache = (builder as unknown as { _sharedFrameMats: Map<string, THREE.Material> })._sharedFrameMats;

        // Twelve windows, all naming the SAME master material.
        for (let i = 0; i < 12; i++) {
            (builder as unknown as Rebuildable).rebuild(baseWin({
                id: `win-inst-${i}`,
                frameFinish: { name: 'Walnut', materialId: 'wood-walnut', materialColor: '#001122' },
            }));
        }

        // Every one of them resolved to the master…
        for (let i = 0; i < 12; i++) {
            expect(frameHex(builder, `win-inst-${i}`)).toBe(masterHex('wood-walnut'));
        }

        // …and they are literally THE SAME material object, not twelve equal ones.
        const first = (builder as unknown as { windowMaterials: Map<string, THREE.Material[]> })
            .windowMaterials.get('win-inst-0')![0];
        for (let i = 1; i < 12; i++) {
            const m = (builder as unknown as { windowMaterials: Map<string, THREE.Material[]> })
                .windowMaterials.get(`win-inst-${i}`)![0];
            expect(m, 'twelve windows of one material must SHARE one THREE material').toBe(first);
        }

        // The sill shares the frame's colour but carries a different roughness, so
        // the cache legitimately holds 2 entries per colour — 2, not 12, and
        // certainly not 24. The bound that matters is "does not scale with N".
        const beforeCount = cache.size;
        for (let i = 12; i < 40; i++) {
            (builder as unknown as Rebuildable).rebuild(baseWin({
                id: `win-inst-${i}`,
                frameFinish: { name: 'Walnut', materialId: 'wood-walnut', materialColor: '#001122' },
            }));
        }
        expect(cache.size, '28 more windows of the SAME colour must mint NO new materials')
            .toBe(beforeCount);

        // And the material is a CLASSIC type, or dedupInstanceMaterial cannot
        // collapse it however few there are.
        expect((first as THREE.Material).type).toBe('MeshStandardMaterial');

        // ⭐⭐ THE ACTUAL GATE, asserted against the REAL serializer rather than
        // against its allowlist restated by hand (lane INST1, 2026-08-19: windows
        // now instance BY DEFAULT). `materialInstanceSignature` returns `null` for
        // anything outside DEDUP_ELIGIBLE_TYPES, and a null signature is what
        // forces a SIZE-1 INSTANCE GROUP PER WINDOW. Checking `.type` against a
        // string I typed here would be the transcription defect this whole
        // contract is about — so the signature function itself is the witness.
        const sig = materialInstanceSignature(first as THREE.Material);
        expect(sig, 'a null signature forces one instance group PER WINDOW').not.toBeNull();

        // …and every one of the 40 produces the SAME signature, which is what lets
        // them collapse into one group rather than forty.
        for (let i = 1; i < 40; i++) {
            const m = (builder as unknown as { windowMaterials: Map<string, THREE.Material[]> })
                .windowMaterials.get(`win-inst-${i}`)![0]!;
            expect(materialInstanceSignature(m)).toBe(sig);
        }
    });

    it('⭐ 2c. INSTANCING — N DISTINCT COLOURS give N buckets, not N-per-window', () => {
        // The complement of 2b, and the half that a same-colour test cannot see: a
        // resolver that returned a per-window value (a uuid, a timestamp, a
        // per-element tint) would still pass 2b if every window shared one input.
        // Here the INPUT genuinely varies over 3 masters across 30 windows, and the
        // requirement is that the material count tracks the COLOURS, not the count.
        const { builder } = makeBuilder();
        const cache = (builder as unknown as { _sharedFrameMats: Map<string, THREE.Material> })._sharedFrameMats;
        const ids = ['wood-oak', 'wood-walnut', 'wood-pine'] as const;

        for (let i = 0; i < 30; i++) {
            (builder as unknown as Rebuildable).rebuild(baseWin({
                id: `win-col-${i}`,
                frameFinish: { name: 'x', materialId: ids[i % 3], materialColor: '#001122' },
            }));
        }

        const distinctColours = new Set(
            Array.from({ length: 30 }, (_, i) => frameHex(builder, `win-col-${i}`)),
        );
        expect(distinctColours.size, '3 masters must give exactly 3 colours').toBe(3);

        // The frame + sill share a colour but differ in roughness, so the cache
        // holds a small fixed multiple of the colour count — bounded by COLOURS,
        // never by the 30 windows. That is the property INST1 depends on.
        expect(cache.size).toBeLessThanOrEqual(distinctColours.size * 2);
        expect(cache.size).toBeLessThan(30);
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
