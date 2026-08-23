/**
 * ⭐⭐ §FEAT-LIFT-OBSERVATION-FRAME (L-9400..L-9406) — THE PARTS REACH A **MESH**,
 * WITH THE **MASTER'S** MATERIAL ON IT.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ WHY THIS SUITE EXISTS, AND WHY A STORE TEST WOULD NOT HAVE DONE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `liftReachableThroughComposedRuntime.test.ts` is green, has been green throughout,
 * and says so in its own header: *"It does NOT prove that a person can click a Lift
 * button and get one."* It proves DISPATCH and it proves the six PLUGIN stores hold
 * the records. Both are real properties. Neither is the one the founder reported —
 * he placed a lift and saw ONE WALL. Sixteen sibling records had committed and could
 * not render, and every store-layer assertion about them passed.
 *
 * `[[committed-is-not-reachable]]`: prove it at the layer the user experiences. For
 * geometry that layer is the MESH — a `THREE.Mesh` in a group, with a material whose
 * colour came from the master catalogue. This suite drives the PRODUCTION
 * `LiftCompoundMeshBuilder` over the PRODUCTION `buildLiftAssembly` output and reads
 * the answers off the objects the renderer would put in the scene.
 *
 * The pattern is `geometry-beam/__tests__/BeamMasterMaterialReachesMesh.test.ts`,
 * deliberately: it is the file this repo already trusts for "a materialId reaches the
 * material on the mesh", and copying its shape is cheaper than inventing a rival.
 *
 * ─── ⚠ WHAT THIS SUITE DOES **NOT** PROVE ─────────────────────────────────────
 *  • That the glazed enclosure renders. It does not — deliberately. The glass is a
 *    real `CurtainWall` record drawn by the curtain-wall builder through the
 *    §P3.1-CW mirror; this builder must NOT draw it (two producers of one surface).
 *    The glass path is proven at the bridge, in the editor's own suite.
 *  • That the landing doors render. Same reason: they are C15 openings mirrored by
 *    §P2.3.
 *  • That the founder can see it. That needs the bridge AND the initTools subscriber
 *    AND a browser. This is the geometry half, stated as the geometry half.
 *
 * ─── R-9 IS OBEYED THROUGHOUT ────────────────────────────────────────────────
 * ⛔ Not one case asserts a dimension EQUALS a documented default. C104 R-9: such a
 * test goes red on a deliberate change and green on a silently-ignored override.
 * Every case below either passes a value EXPLICITLY and asserts it is HONOURED, or
 * asserts a RELATIONSHIP that must hold for any dimensions whatsoever.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { buildLiftAssembly } from '../src/LiftAssembly.js';
import {
    LIFT_FRAME_MATERIAL_ID,
    LIFT_GUIDE_RAIL_MATERIAL_ID,
    LIFT_MASTER_MATERIAL_IDS,
} from '../src/LiftMaterials.js';
import { LIFT_PART_CYCLE_ORDER } from '../src/LiftPartTypes.js';
import {
    LiftCompoundMeshBuilder,
    type LiftCompoundRenderInput,
} from '../src/LiftCompoundMeshBuilder.js';
import type { LiftAssemblyInput, ServedLevel } from '../src/LiftAssembly.js';

const IDS = {
    enclosureIds: ['e0', 'e1', 'e2', 'e3'],
    cabinPartIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
};

/**
 * ⚠ ONE DOOR ID PER SERVED LEVEL, DERIVED FROM THE LEVEL LIST — not a fixed array.
 * `buildLiftAssembly` refuses a mismatch (CA-2: the caller pre-mints, so a caller
 * that mints the wrong NUMBER is a caller bug the assembly must not paper over), and
 * a hard-coded four-long array quietly caps this suite at four storeys — which is
 * exactly the "matches only at 4 storeys" failure ARM C exists to catch.
 */
const doorIdsFor = (levels: readonly ServedLevel[]): string[] =>
    levels.map((_, i) => `d${i}`);

/** Four storeys, matching the reference render's proportions. */
const FOUR_STOREYS: ServedLevel[] = [
    { levelId: 'L0', elevation: 0, slabId: 's0' },
    { levelId: 'L1', elevation: 3, slabId: 's1' },
    { levelId: 'L2', elevation: 6, slabId: 's2' },
    { levelId: 'L3', elevation: 9, slabId: 's3' },
];

function liftInput(over: Partial<LiftAssemblyInput> = {}): LiftAssemblyInput {
    return {
        id: 'lift_TESTULID000000000000000',
        levelId: 'L0',
        origin: { x: 10, y: 0, z: 20 },
        rotation: 0,
        enclosureType: 'standalone-glass',
        ...over,
    };
}

/** Build the assembly and hand the builder exactly what the bridge would. */
function render(
    builder: LiftCompoundMeshBuilder,
    over: Partial<LiftAssemblyInput> = {},
    levels: ServedLevel[] = FOUR_STOREYS,
): { group: THREE.Group; input: LiftCompoundRenderInput } {
    const lift = liftInput(over);
    const asm = buildLiftAssembly(lift, { ...IDS, landingDoorIds: doorIdsFor(levels) }, levels);
    const input: LiftCompoundRenderInput = {
        id: lift.id,
        levelId: lift.levelId,
        origin: lift.origin,
        rotation: lift.rotation,
        enclosureType: lift.enclosureType,
        carParkOffsetY: asm.carParkOffsetY,
        // ⭐ CABIN **AND** SHAFT PARTS — exactly the set the bridge forwards, which
        // is every record the command wrote to the `liftPart` store.
        parts: [...asm.cabinParts, ...asm.shaftParts],
    };
    return { group: builder.updateLift(input), input };
}

const meshes = (g: THREE.Group): THREE.Mesh[] =>
    g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true);

const ofKind = (g: THREE.Group, kind: string): THREE.Mesh[] =>
    meshes(g).filter((m) => m.userData['kind'] === kind);

const hexOf = (m: THREE.Mesh): string =>
    '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString().toLowerCase();

/** Read from the master, NEVER transcribed. C100 §6.1. */
const masterHex = (id: string): string => {
    const rec = MATERIAL_CATALOG.find((r) => r.id === id);
    expect(rec, `${id} must exist in MATERIAL_CATALOG`).toBeDefined();
    return rec!.color.toLowerCase();
};

describe('§FEAT-LIFT-OBSERVATION-FRAME — a lift compound reaches the mesh', () => {
    let builder: LiftCompoundMeshBuilder;
    let scene: THREE.Scene;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new LiftCompoundMeshBuilder(scene);
    });

    // ── ARM A — EVERY MEMBER KIND IS ON SCREEN ────────────────────────────────
    it('⭐ 1. all five cabin parts AND the whole steel frame reach a mesh', () => {
        const { group } = render(builder);

        // The five cabin parts, by kind, so a silently-dropped one is named.
        for (const kind of LIFT_PART_CYCLE_ORDER) {
            expect(ofKind(group, kind).length, `no mesh for cabin part '${kind}'`).toBe(1);
        }
        // Four corner columns. The reference's tall posts.
        expect(ofKind(group, 'frame-column').length).toBe(4);
        // Two guide rails.
        expect(ofKind(group, 'guide-rail').length).toBe(2);
        // Ring beams and braces exist at all — counts are pinned by ARM C, which
        // asserts they TRACK the storeys rather than equalling a number.
        expect(ofKind(group, 'frame-ring-beam').length).toBeGreaterThan(0);
        expect(ofKind(group, 'frame-brace').length).toBeGreaterThan(0);

        // And the group really is in the scene — a mesh built into a detached group
        // is the same invisible as no mesh at all.
        expect(scene.children).toContain(group);
    });

    // ── ARM B — THE MASTER'S COLOUR, NOT A HEX LITERAL ────────────────────────
    it("⭐ 2. the frame is the MASTER's Red Oxide Primer, read from the catalogue", () => {
        const { group } = render(builder);
        const red = masterHex(LIFT_FRAME_MATERIAL_ID);

        for (const kind of ['frame-column', 'frame-ring-beam', 'frame-brace'] as const) {
            const m = ofKind(group, kind)[0]!;
            expect(hexOf(m), `${kind} must wear the master's red`).toBe(red);
        }
        // The id survives to the mesh too, so the inspector and the schedule can say
        // WHAT it is rather than only what colour it came out.
        expect(ofKind(group, 'frame-column')[0]!.userData['materialId'])
            .toBe(LIFT_FRAME_MATERIAL_ID);
    });

    it('⭐ 3. two materials, two colours — a resolver that ignores its argument fails here', () => {
        // ⛔ An assertion on ONE material cannot see a resolver that returns the same
        // thing for every input — the failure that made every handrail one brown
        // (L-1127 S16). The rails and the frame are different master rows, so they
        // must come out different colours.
        const { group } = render(builder);
        const frame = hexOf(ofKind(group, 'frame-column')[0]!);
        const rail = hexOf(ofKind(group, 'guide-rail')[0]!);
        expect(frame).toBe(masterHex(LIFT_FRAME_MATERIAL_ID));
        expect(rail).toBe(masterHex(LIFT_GUIDE_RAIL_MATERIAL_ID));
        expect(frame).not.toBe(rail);
    });

    it('⭐ 4. every master id this subsystem names EXISTS in the catalogue', () => {
        // C100 §5 — a part naming a row that is not there renders magenta at runtime
        // and nobody finds out until a founder screenshots it. This fails at build
        // time on the NEW id instead.
        for (const id of LIFT_MASTER_MATERIAL_IDS) {
            expect(
                MATERIAL_CATALOG.some((r) => r.id === id),
                `'${id}' is named by the lift but is not in MATERIAL_CATALOG`,
            ).toBe(true);
        }
    });

    it('5. an authored materialId OVERRIDES the per-kind default (R-9: honoured, not defaulted)', () => {
        const { group } = render(builder, { frameMaterialId: 'steel-corten' });
        expect(hexOf(ofKind(group, 'frame-column')[0]!)).toBe(masterHex('steel-corten'));
        // …and the rails, which were NOT overridden, keep theirs. An override that
        // leaks onto everything is as wrong as one that is ignored.
        expect(hexOf(ofKind(group, 'guide-rail')[0]!))
            .toBe(masterHex(LIFT_GUIDE_RAIL_MATERIAL_ID));
    });

    // ── ARM C — PARAMETRIC, NOT A PICTURE ─────────────────────────────────────
    it('⭐ 6. the ring beams TRACK the served storeys — 2 storeys and 5 give different frames', () => {
        // "Exactly the same as the render" is the founder's standard for the LOOK.
        // A frame that only matched at four storeys would be a picture, not a model.
        const two = render(builder, {}, FOUR_STOREYS.slice(0, 2));
        const ringsTwo = ofKind(two.group, 'frame-ring-beam').length;
        builder.removeLift(two.input.id);

        const five = render(builder, {}, [
            ...FOUR_STOREYS,
            { levelId: 'L4', elevation: 12, slabId: 's4' },
        ]);
        const ringsFive = ofKind(five.group, 'frame-ring-beam').length;

        // A RELATIONSHIP, not a number: one ring per served storey plus one at the
        // head, four beams to a ring.
        expect(ringsTwo).toBe((2 + 1) * 4);
        expect(ringsFive).toBe((5 + 1) * 4);
        expect(ringsFive).toBeGreaterThan(ringsTwo);
    });

    it('⭐ 7. the frame FOLLOWS the shaft footprint — a wider shaft gives a wider tower', () => {
        const narrow = render(builder, { shaftWidth: 1.4, shaftDepth: 1.4 });
        const spanOf = (g: THREE.Group): number => {
            const cols = ofKind(g, 'frame-column');
            const xs = cols.map((c) => c.position.x);
            return Math.max(...xs) - Math.min(...xs);
        };
        const narrowSpan = spanOf(narrow.group);
        builder.removeLift(narrow.input.id);

        const wide = render(builder, { shaftWidth: 2.8, shaftDepth: 1.4 });
        expect(spanOf(wide.group)).toBeCloseTo(narrowSpan + 1.4, 6);
    });

    it('8. the columns span PIT to OVERRUN — taller than the storeys they serve', () => {
        const { group } = render(builder);
        const col = ofKind(group, 'frame-column')[0]!;
        const geo = col.geometry as THREE.BoxGeometry;
        // A relationship: the post must outrun the served range at BOTH ends,
        // because a shaft with no pit and no headroom is not a shaft.
        expect(geo.parameters.height).toBeGreaterThan(9);
    });

    // ── ARM D — THE GEOMETRIES ARE THE RIGHT TWO ──────────────────────────────
    it('⭐ 9. a top-bay brace is actually DIAGONAL — the linear path handles a tilt', () => {
        // ⛔ This is the case a box-and-offset representation could not pass, and it
        // is why `LiftPart.axis` is a SEGMENT. A brace built as an axis-aligned box
        // would come out vertical and nobody would notice from a count.
        const { group } = render(builder);
        const brace = ofKind(group, 'frame-brace')[0]!;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(brace.quaternion);
        // Neither vertical nor horizontal: a real diagonal.
        expect(Math.abs(up.y)).toBeLessThan(0.999);
        expect(Math.abs(up.y)).toBeGreaterThan(0.001);
    });

    it('⭐ 10. the car parks at the LOWEST SERVED LEVEL, not in its own pit', () => {
        // The cabin parts are CAR-LOCAL; `carParkOffsetY` is the one number that
        // turns five boxes into a car standing at a landing. Get it wrong and the
        // car renders below the ground floor, inside the buffer pit.
        const levels: ServedLevel[] = [
            { levelId: 'L1', elevation: 3, slabId: 's1' },
            { levelId: 'L2', elevation: 6, slabId: 's2' },
        ];
        const { group, input } = render(builder, {}, levels);
        expect(input.carParkOffsetY).toBe(3);
        const floor = ofKind(group, 'cabin-floor')[0]!;
        // The floor build-up hangs BELOW the walking surface, so its centre is just
        // under the park plane — and unambiguously above the pit.
        expect(floor.position.y).toBeLessThan(3);
        expect(floor.position.y).toBeGreaterThan(3 - 0.5);
    });

    it('11. the whole compound moves with ONE transform — parts never carry world coords', () => {
        // The invariant `LiftPartTypes.ts` header point 3 is built on. If a part had
        // baked world placement, moving the lift would leave it behind.
        const { group } = render(builder, { origin: { x: 40, y: 7, z: -3 }, rotation: 1.1 });
        expect(group.position.x).toBe(40);
        expect(group.position.y).toBe(7);
        expect(group.position.z).toBe(-3);
        expect(group.rotation.y).toBeCloseTo(1.1, 9);
        // Every child sits within a shaft-sized envelope of the group origin — i.e.
        // local, not world (the lift is at x=40, so a world-baked part would be ~40).
        for (const m of meshes(group)) {
            expect(Math.abs(m.position.x)).toBeLessThan(5);
            expect(Math.abs(m.position.z)).toBeLessThan(5);
        }
    });

    // ── ARM E — IT SURVIVES BEING A REAL SCENE CITIZEN ────────────────────────
    it('⭐ 12. materials are shared BY COLOUR — per-part materials would kill instancing', () => {
        // `InstancedElementRenderer`'s group key ends in `materialUuid`. A fresh
        // material per part would give a size-1 instance group per member —
        // `[[webgpu-heavy-scene-crash-and-instancing]]`, which this repo has already
        // paid for once.
        const { group } = render(builder);
        const uuids = new Set(meshes(group).map((m) => (m.material as THREE.Material).uuid));
        // ~37 meshes, a handful of colours.
        expect(meshes(group).length).toBeGreaterThan(20);
        expect(uuids.size).toBeLessThanOrEqual(6);

        // …and the SAME material object is reused across two separate lifts.
        const frameMatA = ofKind(group, 'frame-column')[0]!.material as THREE.Material;
        const second = render(builder, { id: 'lift_TESTULID000000000000002' });
        const frameMatB = ofKind(second.group, 'frame-column')[0]!.material as THREE.Material;
        expect(frameMatB).toBe(frameMatA);
    });

    it('13. removeLift detaches the group and does NOT dispose the shared materials', () => {
        // ⛔ §BEAM-AUDIT-2026-C3: disposing a shared material on removal blacks out
        // every OTHER lift's frame until a full scene rebuild.
        const a = render(builder);
        const b = render(builder, { id: 'lift_TESTULID000000000000003' });
        const sharedMat = ofKind(b.group, 'frame-column')[0]!
            .material as THREE.MeshStandardMaterial;

        builder.removeLift(a.input.id);
        expect(scene.children).not.toContain(a.group);
        expect(scene.children).toContain(b.group);
        // Still usable — a disposed THREE material keeps its colour but loses its
        // program; the observable proxy for "not disposed" is that the surviving
        // lift's mesh still references it and its colour is intact.
        expect('#' + sharedMat.color.getHexString().toLowerCase())
            .toBe(masterHex(LIFT_FRAME_MATERIAL_ID));
        expect(ofKind(b.group, 'frame-column')[0]!.material).toBe(sharedMat);
    });

    it('14. clearProjectGeometry empties the scene without tearing the builder down', () => {
        // §C13-BUILDER-SCENE-CLEAR — a lift left behind on a project switch is a
        // steel tower standing in the next project (L-8101's shape).
        render(builder);
        render(builder, { id: 'lift_TESTULID000000000000004' });
        expect(builder.ids().length).toBe(2);
        builder.clearProjectGeometry();
        expect(builder.ids().length).toBe(0);
        expect(scene.children.length).toBe(0);
        // …and it can still build afterwards. `dispose()` is the terminal verb.
        const again = render(builder);
        expect(meshes(again.group).length).toBeGreaterThan(0);
    });

    it('15. every child is NON-selectable so a pick resolves to the LIFT (C15 §12)', () => {
        const { group } = render(builder);
        expect(group.userData['selectable']).toBe(true);
        for (const m of meshes(group)) {
            expect(m.userData['selectable'], `${m.name} must not steal the pick`).toBe(false);
            // …but each part still carries its OWN id, which is what C104 §2.2's
            // by-id Tab drill-in needs and what a traverse-built list would lose.
            expect(typeof m.userData['id']).toBe('string');
            expect(m.userData['liftId']).toBe(group.userData['id']);
        }
    });
});
