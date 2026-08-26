/**
 * §OPENING-PROFILE-FRAME (L-1521) — **THE ARCHED DOOR'S FRAME, IN THE SCENE.**
 *
 * The founder, in one sentence about both families: *"the opening [is] circular but not the frame
 * — the frame is a square frame. Same for arch — same for the door."* L-1251 shipped the CONTROL
 * that lets him ask for an arched door; `grep -c openingProfile DoorBuilder.ts` was **0**, so the
 * wall cut the arch and the frame drew a square head across it.
 *
 * ⭐ Every assertion is read off a BUILT SCENE GRAPH after a real `rebuild()`.
 *
 * ⚠ **MEMBER IDENTIFICATION IS BY GEOMETRY, NOT BY A NEW TAG.** `DoorBuilder` tags only
 * `doorLeaf` / `doorGlazing` / `doorHandle`, and `Door3dDetailLevel.test.ts` identifies frame
 * members precisely BY the absence of a role. Adding a `doorFrame` tag would silently empty that
 * sibling suite's filter, so this file selects the frame by its geometry type instead — the same
 * rule the L-957 slice adopted.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';
import { resolveDoorDimensions } from '../src/DoorDimensions';
import {
    openingOutlineLocal,
    openingSpringLineYLocal,
    insetOutlinePoints,
    openingProfilesFor,
    profiledBandGeometry,
} from '@pryzm/geometry-wall';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

const DOOR = {
    id: 'd1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameThickness: 0.05, frameDepth: 0.07, leafThickness: 0.04,
    frameColor: '#8b5a2b', leafColor: '#c8a165',
    handle: true, handleHeight: 1.05,
    threshold: true, thresholdHeight: 0.02, leafVisibleInPlan: false,
};

/** ⚠ The builder reads `ft` from `resolveDoorDimensions`, NOT from the record. Read it the same way. */
const FT = resolveDoorDimensions(undefined, 'single').frameThickness;

type Lod = 'coarse' | 'medium' | 'fine';

function buildGroup(door: Record<string, unknown> = DOOR, lod: Lod = 'fine'): THREE.Group {
    initDefaultViewsManager();
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const wallStoreStub = {
        getById: () => WALL,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, wallStoreStub);
    builder.setMeshConsolidation(false); // §MESH110 — this file pins the BUILD stage (per-part structure); the MERGE stage is pinned in DoorMeshConsolidation.test.ts
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(door);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === door.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

function meshes(group: THREE.Group): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); });
    return out;
}
const extruded = (g: THREE.Group): THREE.Mesh[] => meshes(g).filter(m => m.geometry.type === 'ExtrudeGeometry');
const boxes = (g: THREE.Group): THREE.Mesh[] => meshes(g).filter(m => m.geometry.type === 'BoxGeometry');
const byRole = (g: THREE.Group, role: string): THREE.Mesh[] => meshes(g).filter(m => m.userData?.role === role);

describe('§A — the RECTANGULAR door is untouched (PR-2)', () => {
    // The vertex-exact pin lives in `StraightHostDoorLeafByteIdentical.test.ts`, which hashes the
    // whole door against a constant captured before this feature. This is the structural half.
    it('builds only BOXES — no profiled solid appears anywhere', () => {
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            const g = buildGroup(DOOR, lod);
            expect(extruded(g).length).toBe(0);
            expect(boxes(g).length).toBeGreaterThan(3);
        }
    });

    it('an EXPLICIT `rectangular` matches an ABSENT one, mesh for mesh', () => {
        const a = meshes(buildGroup({ ...DOOR })).length;
        const b = meshes(buildGroup({ ...DOOR, id: 'd1b', openingProfile: 'rectangular' })).length;
        expect(b).toBe(a);
    });
});

describe('§B — ⛔ A DOOR MAY NOT BE CIRCULAR (L-1251), and the frame arm respects it', () => {
    it('the family declaration is consulted, not restated', () => {
        // Non-vacuity for the whole section: if this ever starts listing `circular`, the fallback
        // below stops being a refusal and becomes a bug.
        expect(openingProfilesFor('door')).toEqual(['rectangular', 'round-arch', 'segmental-arch']);
        expect(openingProfilesFor('window')).toContain('circular');
    });

    it('a record holding `circular` is built as a RECTANGLE — the wall does the same', () => {
        // Chat, a batch generator or a hand-edited file can still write one. A circle has no jamb
        // feet for the wall's notch walk to traverse, so both sides fall back together and the
        // frame still equals the void.
        const g = buildGroup({ ...DOOR, id: 'd-circ', openingProfile: 'circular' });
        expect(extruded(g).length).toBe(0);
        expect(byRole(g, 'doorGlazing').length).toBe(0);   // …and no fanlight is invented
    });
});

describe('§C — the ARCHED door: curved head, transom, fanlight, and a leaf that fits under it', () => {
    const ARCHES: ReadonlyArray<readonly [string]> = [['round-arch'], ['segmental-arch']];

    it.each(ARCHES)('%s — the frame is ONE profiled band, and the head is not square', (kind) => {
        const g = buildGroup({ ...DOOR, id: `d-${kind}`, openingProfile: kind });
        // Exactly TWO extruded solids: the frame band and the fanlight. Everything else — posts,
        // transom, threshold, leaf, ironmongery — is still a box.
        const ex = extruded(g);
        expect(ex.length).toBe(2);
        expect(byRole(g, 'doorGlazing').length).toBe(1);   // the fanlight
    });

    it.each(ARCHES)('%s — ⭐ EVERY frame vertex is a point of the OUTLINE or its INSET', (kind) => {
        // C86 §10.1 PR-1 as an assertion: there is no third source those vertices could have come
        // from, so the frame cannot have re-derived the arc. 1e-5 m, because THREE stores
        // positions as Float32 and the outline is sampled to a 2 mm chord height.
        const g = buildGroup({ ...DOOR, id: `d-v-${kind}`, openingProfile: kind });
        const outline = openingOutlineLocal(kind, DOOR.width, DOOR.height)!;
        const inner = insetOutlinePoints(outline.points, FT)!;
        const allowed = [...outline.points, ...inner];
        const frame = extruded(g).filter(m => m.userData?.role !== 'doorGlazing');
        expect(frame.length).toBe(1);
        const pos = frame[0]!.geometry.getAttribute('position');
        expect(pos.count).toBeGreaterThan(50);
        let worst = 0;
        for (let i = 0; i < pos.count; i++) {
            let best = Infinity;
            for (const p of allowed) best = Math.min(best, Math.hypot(pos.getX(i) - p.x, pos.getY(i) - p.y));
            worst = Math.max(worst, best);
        }
        expect(worst).toBeLessThan(1e-5);
    });

    it('⛔ NO CILL ACROSS THE THRESHOLD — the band is opened along its base edge', () => {
        // A door frame has two posts and a head; a CLOSED RING would lay a 50 mm bar across the
        // doorway at floor level for people to trip on. Measured in the band where such a cill
        // would live — the bottom `ft` of the opening: **all frame material there must be in the
        // POSTS**, i.e. no nearer the centreline than `w/2 − ft`.
        const g = buildGroup({ ...DOOR, id: 'd-nocill', openingProfile: 'round-arch' });
        const frame = extruded(g).filter(m => m.userData?.role !== 'doorGlazing')[0]!;
        const pos = frame.geometry.getAttribute('position');
        const baseY = -DOOR.height / 2;
        const postInner = DOOR.width / 2 - FT;
        let inCillBand = 0;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) > baseY + FT + 1e-4) continue;
            inCillBand++;
            expect(Math.abs(pos.getX(i))).toBeGreaterThan(postInner - 1e-3);
        }
        // NON-VACUITY: the loop above really visited the threshold zone.
        expect(inCillBand).toBeGreaterThan(4);

        // ⭐ THE CONTROL, and the FIRST VERSION OF IT WAS VACUOUS — recorded because the mistake
        // is instructive. It counted RING vertices near the centreline at floor level, expecting
        // some. There are NONE: the ring's cill is a single EDGE from (−w/2, y0) to (+w/2, y0)
        // with no intermediate vertices, so a vertex census cannot see a bar it is made of. **A
        // test that samples vertices cannot detect a face.**
        //
        // The decisive comparison is the SOLID: the ring's contour closes across the base and
        // carries the extra cill, so it triangulates to strictly more geometry than the ∩-band
        // built from the identical outline and inset.
        const outline = openingOutlineLocal('round-arch', DOOR.width, DOOR.height)!;
        const inner = insetOutlinePoints(outline.points, FT)!;
        const ring = profiledBandGeometry(outline.points, inner, 0.09, false)!;
        const rp = ring.getAttribute('position');
        const band = profiledBandGeometry(outline.points, inner, 0.09, true)!;
        expect(band.getAttribute('position').count).toBeLessThan(rp.count);
    });

    it('the LEAF stops at the SPRINGING, and a TRANSOM sits above it', () => {
        // ⭐ THE ARCHITECTURAL DECISION, ASSERTED. An arched doorway is a rectangular leaf under a
        // straight transom with a fixed light in the head — not an arched leaf (which would mean
        // discarding the whole rail/stile/panel construction) and not an open tympanum.
        const kind = 'round-arch';
        const spring = openingSpringLineYLocal(kind, DOOR.width, DOOR.height)!;
        const headUnder = spring - FT;

        const g = buildGroup({ ...DOOR, id: 'd-leaf', openingProfile: kind }, 'coarse');
        const leaf = byRole(g, 'doorLeaf');
        expect(leaf.length).toBe(1);                 // coarse = one slab, so the top is unambiguous
        leaf[0]!.geometry.computeBoundingBox();
        const bb = leaf[0]!.geometry.boundingBox!;
        const topLocal = leaf[0]!.position.y + bb.max.y;
        expect(topLocal).toBeCloseTo(headUnder, 4);

        // NON-VACUITY: the rectangular door's leaf is TALLER, and reaches `h/2 − ft`.
        const gr = buildGroup({ ...DOOR, id: 'd-leaf-r' }, 'coarse');
        const leafR = byRole(gr, 'doorLeaf')[0]!;
        leafR.geometry.computeBoundingBox();
        const topR = leafR.position.y + leafR.geometry.boundingBox!.max.y;
        expect(topR).toBeCloseTo(DOOR.height / 2 - FT, 6);
        expect(topR).toBeGreaterThan(topLocal + 0.05);
    });

    it('the FANLIGHT lives entirely ABOVE the springing and inside the arch', () => {
        const kind = 'round-arch';
        const spring = openingSpringLineYLocal(kind, DOOR.width, DOOR.height)!;
        const g = buildGroup({ ...DOOR, id: 'd-fan', openingProfile: kind });
        const fan = byRole(g, 'doorGlazing')[0]!;
        expect(fan.geometry.type).toBe('ExtrudeGeometry');
        const pos = fan.geometry.getAttribute('position');
        const r = DOOR.width / 2 - FT;
        for (let i = 0; i < pos.count; i++) {
            expect(pos.getY(i)).toBeGreaterThanOrEqual(spring - 1e-4);
            // Above the springing the light's boundary is the inset arch, so nothing may escape it.
            if (pos.getY(i) > spring + 1e-4) {
                expect(Math.hypot(pos.getX(i), pos.getY(i) - spring)).toBeLessThanOrEqual(r + 1e-4);
            }
        }
    });

    it('the THRESHOLD is unchanged — the profiles differ only in the HEAD', () => {
        // Below the springing an arched outline IS the rectangle's, so the threshold plate is the
        // same correct plate and must not have been perturbed.
        const wide = (g: THREE.Group): THREE.Mesh | undefined =>
            boxes(g).find(m => {
                const p = m.geometry as THREE.BoxGeometry;
                return Math.abs((p.parameters.width ?? 0) - DOOR.width) < 1e-9
                    && Math.abs((p.parameters.height ?? 0) - DOOR.thresholdHeight) < 1e-9;
            });
        const a = wide(buildGroup({ ...DOOR, id: 'd-th-a', openingProfile: 'round-arch' }));
        const r = wide(buildGroup({ ...DOOR, id: 'd-th-r' }));
        expect(a).toBeTruthy();
        expect(r).toBeTruthy();
        expect(a!.position.y).toBeCloseTo(r!.position.y, 12);
    });
});
