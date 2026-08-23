/**
 * ⭐⭐ §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944..L-9946) — THE BOUNDARY LINE
 * REACHES A **MESH**, AND THE FOUNDER CAN SEE IT.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ WHY A STORE TEST WOULD NOT HAVE DONE, AND DID NOT.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `boundaryLineHasOneStore.test.ts` is green and proves a real property: this family
 * has exactly ONE authority, so C84 EI-1 holds by construction. `boundaryLine.create`
 * validates, executes, mutates that store, returns a `PatchPair` and reports success.
 * AUDIT-B §2.5 measured what happened next:
 *
 *     boundaryLineSolid() production callers  ->  ZERO.
 *     case 'boundaryLine.*' in the bridge     ->  RC=1, zero matches.
 *     grep -c boundaryLine ProjectSerializer  ->  0 : 0.
 *
 * Three independent breaks in one verb. The extruder was written, tested, exported —
 * and never invoked, so even a relayed event would have found nothing to draw.
 * `[[committed-is-not-reachable]]`: for geometry, the layer the user experiences is
 * the MESH. Every assertion below reads a `THREE.Object3D` off a real scene, driven
 * through the PRODUCTION `BoundaryLineMeshBuilder` over the PRODUCTION
 * `@pryzm/geometry-boundary-line` resolvers.
 *
 * The pattern is `packages/geometry-lift/__tests__/LiftCompoundReachesTheMesh.test.ts`,
 * deliberately: copying the shape this repo already trusts is cheaper than inventing
 * a rival.
 *
 * ─── ⚠ WHAT THIS SUITE DOES **NOT** PROVE — stated, not implied ───────────────
 *  · That the record SURVIVES A RELOAD. It does not: `ProjectSerializer` still has no
 *    `boundaryLines` field (L-9947). This is the geometry half, stated as the
 *    geometry half.
 *  · That it appears in PLAN. There is no plan symbol builder for the family (L-9948).
 *  · That the bridge relays the command — that is the editor's bus suite, and the
 *    `case 'boundaryLine.*'` arm it exercises.
 *
 * ─── R-9 IS OBEYED THROUGHOUT ────────────────────────────────────────────────
 * ⛔ Not one case asserts a dimension EQUALS a documented default. Such a test goes
 * red on a deliberate change and green on a silently-ignored override. Every case
 * either passes a value EXPLICITLY and asserts it is HONOURED, or asserts a
 * RELATIONSHIP that must hold for any dimensions whatsoever.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { boundaryLineSegments } from '@pryzm/geometry-boundary-line';
import {
    BoundaryLineMeshBuilder,
    type BoundaryLineRenderInput,
} from '../src/engine/BoundaryLineMeshBuilder';

/** A material every arm can name, read from the master rather than transcribed. */
const MASTER_ID = MATERIAL_CATALOG[0]!.id;

/** Read from the master, NEVER transcribed. C100 §6.1. */
const masterHex = (id: string): string => {
    const rec = MATERIAL_CATALOG.find((r) => r.id === id);
    expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
    return rec!.color.toLowerCase();
};

const meshes = (g: THREE.Object3D): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
};
const lines = (g: THREE.Object3D): THREE.Line[] => {
    const out: THREE.Line[] = [];
    g.traverse((o) => { if ((o as THREE.Line).isLine) out.push(o as THREE.Line); });
    return out;
};
const hexOf = (m: THREE.Mesh): string =>
    '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString().toLowerCase();

/** An L-shaped open polyline — THREE vertices, so it has TWO segments and a
 *  segment-count assertion cannot be satisfied by an off-by-one. */
const VERTICES = [
    { x: 0, y: 0, z: 0 },
    { x: 6, y: 0, z: 0 },
    { x: 6, y: 0, z: 4 },
];

function lineworkLine(over: Partial<BoundaryLineRenderInput> = {}): BoundaryLineRenderInput {
    return {
        id: 'bl-probe',
        levelId: 'L0',
        vertices: VERTICES,
        closed: false,
        hasVolume: false,
        ...over,
    } as BoundaryLineRenderInput;
}

function solidLine(over: Partial<BoundaryLineRenderInput> = {}): BoundaryLineRenderInput {
    return lineworkLine({
        hasVolume: true,
        materialId: MASTER_ID,
        height: 2.4,
        thickness: 0.3,
        baseOffset: 0,
        ...over,
    });
}

describe('§FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE — a boundary line reaches the scene', () => {
    let builder: BoundaryLineMeshBuilder;
    let scene: THREE.Scene;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new BoundaryLineMeshBuilder(scene);
    });

    /**
     * ARM 1 — ⭐ THE FOUNDER'S DEFECT, INVERTED. A linework boundary line — the
     * DEFAULT (`hasVolume` defaults to `false`) and what a setting-out line usually is
     * — must put something in the scene. Drawing nothing for it would reproduce the
     * exact defect this whole lane closes: a record that commits and cannot be seen.
     */
    it('ARM 1 — a LINEWORK line lands in the scene as a real polyline', () => {
        const outcome = builder.updateBoundaryLine(lineworkLine());

        expect(outcome.drew).toBe('linework');
        const group = builder.getGroup('bl-probe');
        expect(group, 'nothing in the scene is the bug, not the baseline').toBeDefined();
        expect(scene.children).toContain(group);
        expect(lines(group!).length).toBe(1);

        const pos = (lines(group!)[0]!.geometry as THREE.BufferGeometry)
            .getAttribute('position') as THREE.BufferAttribute;
        expect(pos.count, 'an OPEN line has exactly its own vertices — no closing point').toBe(3);
        // The polyline must trace the AUTHORED vertices, in world XZ.
        expect([pos.getX(0), pos.getZ(0)]).toEqual([0, 0]);
        expect([pos.getX(2), pos.getZ(2)]).toEqual([6, 4]);
    });

    /**
     * ARM 2 — a CLOSED line closes. `closed` is AUTHORED, never derived (C106), so a
     * builder that ignored it would silently draw every site boundary with a gap in it.
     */
    it('ARM 2 — a CLOSED line draws the return leg', () => {
        builder.updateBoundaryLine(lineworkLine({ closed: true }));
        const pos = (lines(builder.getGroup('bl-probe')!)[0]!.geometry as THREE.BufferGeometry)
            .getAttribute('position') as THREE.BufferAttribute;
        expect(pos.count).toBe(4);
        expect([pos.getX(3), pos.getZ(3)], 'the ring must return to its first vertex')
            .toEqual([0, 0]);
    });

    /**
     * ARM 3 — ⭐ THE VOLUME, AND THE FIRST PRODUCTION CALL `boundaryLineSolid()` HAS
     * EVER HAD. One prism per SEGMENT, and the count is asserted against the pure
     * function's own segmentation rather than against a literal — so a change to what
     * counts as a segment moves both together instead of silently disagreeing.
     */
    it('ARM 3 — a line WITH VOLUME becomes one extruded prism PER SEGMENT', () => {
        const line = solidLine();
        const outcome = builder.updateBoundaryLine(line);

        expect(outcome.drew).toBe('solid');
        const group = builder.getGroup('bl-probe')!;
        const segs = boundaryLineSegments(line as never).length;
        expect(segs, 'an L of three vertices is two segments').toBe(2);
        expect(meshes(group).length, 'one prism per segment').toBe(segs);
        // ⛔ AND NO POLYLINE. Drawing both would put two producers of one edge in the
        // scene — z-fighting, and one id meaning two objects (C84 EI-9).
        expect(lines(group).length).toBe(0);
    });

    /**
     * ARM 4 — ⛔ THE ONE THING A READER SHOULD CHECK: THE SIGN ON `z`.
     *
     * `ExtrudeGeometry` extrudes along +Z and `rotateX(-π/2)` maps `(x,y,z) → (x,z,-y)`,
     * so a shape point written as `(px, pz)` lands at world `-pz` — the footprint
     * MIRRORED about the X axis. A boundary line of the right shape in the wrong place
     * is the hardest kind of wrong to notice, and no count assertion can see it.
     *
     * The probe geometry makes it unmissable: every authored vertex has `z >= 0`, so a
     * correctly-placed solid has a bounding box that does not reach far into negative Z
     * (only half the thickness), and a mirrored one is centred on `z = -4`.
     */
    it('ARM 4 — the extruded footprint lands on the AUTHORED side of the Z axis', () => {
        builder.updateBoundaryLine(solidLine({ thickness: 0.3 }));
        const box = new THREE.Box3().setFromObject(builder.getGroup('bl-probe')!);

        expect(box.max.z, 'the L reaches z = 4; a mirrored prism would top out near 0')
            .toBeGreaterThan(3.5);
        expect(box.min.z, 'nothing may reach beyond half a thickness into negative Z')
            .toBeGreaterThan(-0.5);
        expect(box.max.x).toBeGreaterThan(5.5);
    });

    /**
     * ARM 5 — the vertical seat. `baseOffset` and `height` are HONOURED rather than
     * compared to a default (R-9), and `levelElevation` is added on top — because it
     * is resolved by the CALLER and handed down, never looked up by the builder.
     */
    it('ARM 5 — the solid stands at levelElevation + baseOffset and is exactly `height` tall', () => {
        builder.updateBoundaryLine(solidLine({ height: 3.7, baseOffset: 0.5 }), 12);
        const box = new THREE.Box3().setFromObject(builder.getGroup('bl-probe')!);

        // ⚠ 4 places, not 6: `BufferAttribute` positions are Float32, so a 3.7 m
        // extrusion reads back as 3.700000762939453. Asserting to Float64 precision
        // here would be asserting a property of the assertion, not of the mesh.
        expect(box.min.y).toBeCloseTo(12 + 0.5, 4);
        expect(box.max.y - box.min.y).toBeCloseTo(3.7, 4);
    });

    /**
     * ARM 6 — C100 §6.1: the colour on the mesh is the MASTER's, read from the
     * catalogue rather than transcribed here.
     */
    it('ARM 6 — a solid wears the MASTER material colour, and carries the id it claims', () => {
        builder.updateBoundaryLine(solidLine());
        const m = meshes(builder.getGroup('bl-probe')!)[0]!;
        expect(hexOf(m)).toBe(masterHex(MASTER_ID));
        expect(m.userData['materialId'], 'the record must be able to say what it is made OF, not just what colour it is')
            .toBe(MASTER_ID);
    });

    /**
     * ARM 7 — ⛔ C100 §5, AND THE BEHAVIOUR THIS FAMILY REFUSES TO COPY.
     *
     * `HandrailFragmentBuilder` ships every balcony with *"3 handrails have NO
     * RESOLVABLE MATERIAL … the colour on screen is NOT these elements' material"* —
     * and paints them anyway. A volume that cannot name a material is drawn as
     * LINEWORK here, with the resolver's own sentence returned to the caller. The
     * record stays VISIBLE (it is still a real setting-out line) and nothing on screen
     * lies about what it is made of.
     */
    it('ARM 7 — volume with an UNRESOLVABLE material draws linework and REFUSES BY NAME — never a believable grey', () => {
        const outcome = builder.updateBoundaryLine(
            lineworkLine({ hasVolume: true, height: 2.4, thickness: 0.3 }),
        );

        expect(outcome.drew).toBe('linework-material-refused');
        expect(outcome.drew === 'linework-material-refused' && outcome.reason)
            .toContain('material');
        const group = builder.getGroup('bl-probe')!;
        expect(meshes(group).length, 'a surface painted a guess is worse than no surface').toBe(0);
        expect(lines(group).length, 'and the line itself must still be visible').toBe(1);
    });

    /**
     * ARM 8 — ⭐ THE `.updated` HALF. Redrawing must REPLACE, not accumulate.
     *
     * This is the first `*.updated` mirror this codebase has (`check-mirror-completeness`
     * measured the census at `0` on 2026-08-23), and the failure mode a new update
     * channel invites is a leak that presents as z-fighting: N groups for one id after
     * N edits. Asserted at the SCENE, which is where it would show.
     */
    it('ARM 8 — an UPDATE replaces the group; ten edits leave ONE object in the scene', () => {
        builder.updateBoundaryLine(lineworkLine());
        for (let i = 1; i <= 10; i++) {
            builder.updateBoundaryLine(solidLine({ height: 2 + i * 0.1 }));
        }
        expect(builder.ids()).toEqual(['bl-probe']);
        expect(scene.children.filter((c) => c.name === 'boundary-line:bl-probe').length).toBe(1);

        // And the LAST edit is what is on screen — a replace that kept the first
        // version would pass the count assertion above.
        const box = new THREE.Box3().setFromObject(builder.getGroup('bl-probe')!);
        expect(box.max.y - box.min.y).toBeCloseTo(3.0, 4);
    });

    /**
     * ARM 9 — deletion, and the three-valued answer. "Gone" and "was never drawn" are
     * different facts (§context-data-honesty), so `removeBoundaryLine` reports which.
     */
    it('ARM 9 — DELETE removes the group from the scene and distinguishes gone from never-there', () => {
        builder.updateBoundaryLine(solidLine());
        expect(builder.removeBoundaryLine('bl-probe')).toBe(true);
        expect(builder.getGroup('bl-probe')).toBeUndefined();
        expect(scene.children.filter((c) => c.name === 'boundary-line:bl-probe').length).toBe(0);
        expect(builder.removeBoundaryLine('bl-probe'), 'a second delete found nothing — and says so').toBe(false);
    });

    /**
     * ARM 10 — a degenerate record draws NOTHING and says why, rather than adding an
     * empty group. An empty group in the scene is a record that claims to render and
     * does not — the same class of lie as a command that reports success.
     */
    it('ARM 10 — a one-vertex line draws nothing and returns a reason', () => {
        const outcome = builder.updateBoundaryLine(
            lineworkLine({ vertices: [{ x: 0, y: 0, z: 0 }] }),
        );
        expect(outcome.drew).toBe('nothing');
        expect(outcome.drew === 'nothing' && outcome.reason).toContain('at least 2');
        expect(builder.getGroup('bl-probe')).toBeUndefined();
    });

    /**
     * ARM 11 — the group is IDENTIFIABLE. Nothing registers these meshes with the
     * picker yet (stated as open in the builder's header), and when something does it
     * will key on exactly this — so the contract is pinned now rather than discovered
     * later.
     */
    it('ARM 11 — the group carries the element id, kind and storey for a later picker', () => {
        builder.updateBoundaryLine(solidLine({ levelId: 'L3' }));
        const g = builder.getGroup('bl-probe')!;
        expect(g.userData['elementId']).toBe('bl-probe');
        expect(g.userData['elementType']).toBe('boundaryLine');
        expect(g.userData['levelId']).toBe('L3');
    });
});
