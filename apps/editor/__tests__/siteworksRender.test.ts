// siteworksRender — the 3-D leg. C116 §3 / §7 / §10a · ADR-0384 D4.
//
// ⛔ THE ARMS PIN GEOMETRY AND REFUSALS, NOT "IT ADDED SOMETHING TO THE SCENE". A
// plate at the wrong Y, a plate extruded the wrong way, and a surface silently not
// drawn all leave a scene that looks plausible in a unit test.

import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { Siteworks } from '@pryzm/schemas';
import { SiteworksMeshBuilder } from '../src/engine/SiteworksMeshBuilder';
import { attachSiteworksRender, type DirtySiteworksStore } from '../src/engine/attachSiteworksRender';

const P = (x: number, z: number) => ({ x, y: 0, z });

const road = (extra: Record<string, unknown> = {}) => Siteworks.parse({
    id: 'siteworks_01ARZ3NDEKTSV4RRFFQ69G5FA0',
    levelId: 'L0',
    role: 'road',
    form: 'linear',
    centreline: [P(0, 0), P(100, 0)],
    widthM: 7,
    boundary: [],
    holes: [],
    thickness: 0.3,
    baseOffset: 0,
    ...extra,
});

const lot = (extra: Record<string, unknown> = {}) => Siteworks.parse({
    id: 'siteworks_01ARZ3NDEKTSV4RRFFQ69G5FA1',
    levelId: 'L0',
    role: 'parking',
    form: 'areal',
    centreline: [],
    boundary: [P(0, 0), P(20, 0), P(20, 10), P(0, 10)],
    holes: [],
    thickness: 0.25,
    ...extra,
});

let scene: THREE.Object3D;
let builder: SiteworksMeshBuilder;

beforeEach(() => {
    scene = new THREE.Group();
    builder = new SiteworksMeshBuilder(scene);
});

describe('SiteworksMeshBuilder — the datum is Slab\'s, inherited (ADR-0384 D4)', () => {
    it('⭐ seats the FINISHED surface at level.elevation + baseOffset', () => {
        expect(builder.updateSiteworks(road({ baseOffset: 0.15 }), 12.5).drew).toBe('surface');
        expect(scene.children).toHaveLength(1);
        expect(scene.children[0]!.position.y).toBeCloseTo(12.65, 9);
    });

    it('⛔ the plate hangs BELOW the datum — it never extrudes upward', () => {
        builder.updateSiteworks(road({ thickness: 0.4 }), 10);
        const group = scene.children[0]!;
        const mesh = group.children[0] as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;
        // Local space, relative to the group seated at the datum: the whole plate is
        // at or below 0, and it is exactly `thickness` deep.
        expect(bb.max.y).toBeCloseTo(0, 6);
        expect(bb.min.y).toBeCloseTo(-0.4, 6);
    });
});

describe('SiteworksMeshBuilder — it ASKS the geometry authority, it does not re-derive', () => {
    it('a linear road is drawn at the swept width, not at the centreline', () => {
        builder.updateSiteworks(road(), 0);
        const mesh = scene.children[0]!.children[0] as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;
        expect(bb.max.x - bb.min.x).toBeCloseTo(100, 6);
        expect(bb.max.z - bb.min.z).toBeCloseTo(7, 6);
    });

    it('an areal car park is drawn at its boundary', () => {
        builder.updateSiteworks(lot(), 0);
        const mesh = scene.children[0]!.children[0] as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;
        expect(bb.max.x - bb.min.x).toBeCloseTo(20, 6);
        expect(bb.max.z - bb.min.z).toBeCloseTo(10, 6);
    });

    it('⛔ a surface the authority REFUSES draws NOTHING, and carries the reason', () => {
        // The hairpin the sweep refuses: it self-intersects at this width.
        const bad = road({
            centreline: [P(0, 0), P(40, 0), P(40, 1), P(0, 1)], widthM: 20,
        });
        const out = builder.updateSiteworks(bad, 0);
        expect(out.drew).toBe('nothing');
        if (out.drew === 'nothing') expect(out.reason).toMatch(/self-intersect/);
        // ⭐ AND NOTHING WAS ADDED. A half-drawn refusal is worse than none.
        expect(scene.children).toHaveLength(0);
    });
});

describe('SiteworksMeshBuilder — identity and hygiene', () => {
    it('stamps userData as a PROJECTION of the record (C116 §2)', () => {
        builder.updateSiteworks(road(), 0);
        const g = scene.children[0]!;
        expect(g.userData['type']).toBe('siteworks');
        expect(g.userData['elementType']).toBe('siteworks');
        expect(g.userData['id']).toBe('siteworks_01ARZ3NDEKTSV4RRFFQ69G5FA0');
        expect(g.userData['levelId']).toBe('L0');
        expect(g.userData['siteworksRole']).toBe('road');
        expect(g.userData['selectable']).toBe(true);
    });

    it('⛔ IDEMPOTENT BY ID — ten redraws leave ONE group, not ten overlapping plates', () => {
        for (let i = 0; i < 10; i++) builder.updateSiteworks(road({ widthM: 7 + i }), 0);
        expect(scene.children).toHaveLength(1);
    });

    it('removing disposes the geometry, not just the group', () => {
        builder.updateSiteworks(road(), 0);
        const mesh = scene.children[0]!.children[0] as THREE.Mesh;
        let disposed = false;
        mesh.geometry.dispose = () => { disposed = true; };
        builder.removeSiteworks(road().id);
        expect(scene.children).toHaveLength(0);
        expect(disposed).toBe(true);
    });

    it('removing an unknown id is a no-op, not a throw', () => {
        expect(() => builder.removeSiteworks('siteworks_nope')).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

/** A store with the one channel the seam uses. */
function fakeStore(initial: Siteworks[] = []) {
    const state = new Map<string, unknown>(initial.map((r) => [r.id, r]));
    let listener: ((d: any, s: ReadonlyMap<string, unknown>) => void) | null = null;
    return {
        getState: () => state,
        subscribeDirty(l: (d: any, s: ReadonlyMap<string, unknown>) => void) {
            listener = l;
            return () => { listener = null; };
        },
        emit(diff: { added?: string[]; updated?: string[]; removed?: string[] }) {
            listener?.({
                added: new Set(diff.added ?? []),
                updated: new Set(diff.updated ?? []),
                removed: new Set(diff.removed ?? []),
            }, state);
        },
        set(r: Siteworks) { state.set(r.id, r); },
        del(id: string) { state.delete(id); },
        get subscribed() { return listener !== null; },
    };
}

describe('attachSiteworksRender — ONE road into the scene (C116 §7)', () => {
    it('⭐ DRAWS WHAT IS ALREADY IN THE STORE — the initial pass is not optional', () => {
        // `restoreCompoundFamilies` runs on project open, BEFORE this. A subscriber
        // alone would leave every reloaded surface in the model and invisible.
        const store = fakeStore([road()]);
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 0,
        });
        expect(scene.children).toHaveLength(1);
    });

    it('draws on ADD, redraws on UPDATE, reaps on REMOVE', () => {
        const store = fakeStore();
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 0,
        });
        expect(scene.children).toHaveLength(0);

        store.set(road()); store.emit({ added: [road().id] });
        expect(scene.children).toHaveLength(1);

        store.set(road({ widthM: 14 })); store.emit({ updated: [road().id] });
        expect(scene.children).toHaveLength(1);
        const mesh = scene.children[0]!.children[0] as THREE.Mesh;
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox!.max.z - mesh.geometry.boundingBox!.min.z)
            .toBeCloseTo(14, 6);

        store.del(road().id); store.emit({ removed: [road().id] });
        expect(scene.children).toHaveLength(0);
    });

    it('the disposer unsubscribes AND clears the scene', () => {
        const store = fakeStore([road()]);
        const dispose = attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 0,
        });
        expect(store.subscribed).toBe(true);
        dispose();
        expect(store.subscribed).toBe(false);
        expect(scene.children).toHaveLength(0);
    });
});

describe('attachSiteworksRender — §CONTEXT-DATA-HONESTY at the datum', () => {
    it('⛔ an UNRESOLVED level elevation REFUSES to draw — it does NOT default to 0', () => {
        // "I do not know which storey this is" and "it is at 0 m" are different facts.
        // Defaulting would lay a road through whatever sits at zero, invisibly wrongly.
        const store = fakeStore([road()]);
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => null,
        });
        expect(scene.children).toHaveLength(0);
    });

    it('⛔ an EMPTY levelId refuses too — the §DIAG-WALL-LEVEL rule', () => {
        const store = fakeStore([road({ levelId: '' })]);
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 0,
        });
        expect(scene.children).toHaveLength(0);
    });

    it('a RESOLVED elevation draws, so the two arms above are not vacuous', () => {
        const store = fakeStore([road()]);
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 7,
        });
        expect(scene.children).toHaveLength(1);
        expect(scene.children[0]!.position.y).toBeCloseTo(7, 9);
    });

    it('registerElement is called with the record\'s own storey', () => {
        const seen: Array<[string, string]> = [];
        const store = fakeStore([road()]);
        attachSiteworksRender({
            store: store as unknown as DirtySiteworksStore,
            scene, levelElevation: () => 0,
            registerElement: (id, levelId) => { seen.push([id, levelId]); },
        });
        expect(seen).toEqual([[road().id, 'L0']]);
    });
});
