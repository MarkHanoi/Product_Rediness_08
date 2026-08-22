/**
 * L-7100 / L-7101 — §WALL-EDGE-OVERLAY-FRAME. THE STRAY LINEWORK.
 *
 * ── THE REPORT ──────────────────────────────────────────────────────────────────────
 *
 * *"check this bug — I feel like it is with edit profile walls."* Two screenshots: the
 * solid walls render, and black wireframe linework has flown far off the geometry — long
 * thin crossings reaching past the footprint and a closed polygon floating clear of the
 * model to the right. One wall carries a raked/sloped top, which is why the profile
 * editor was suspected. **The console said "3 groups, 3 occluders". No error. No warning.**
 *
 * ── WHAT IT ACTUALLY WAS ────────────────────────────────────────────────────────────
 *
 * Not the rake, not the instanced arm, not a rectangle-assuming builder. The profiled
 * BODY is correct at every baseline. What was wrong is that its EDGE OVERLAY was added
 * to the wall group at IDENTITY while the body mesh carries `rotation.y = −angle`
 * (`WallFragmentBuilder.ts:2197-2198`, pre-fix). Two objects derived from one geometry,
 * placed in two different frames.
 *
 * ⭐ AND THE +X CASE PASSED, WHICH IS WHY IT SHIPPED. On a wall running due east the two
 *   frames coincide EXACTLY and every assertion anyone would think to write comes back
 *   green. §(A) below is that case, kept as the control precisely because it cannot fail
 *   — its job is to show that the discriminators in §(B) are measuring the ORIENTATION
 *   and not merely "an overlay exists".
 *
 * ── WHY THE EXISTING BASELINE COULD NOT SEE IT ──────────────────────────────────────
 *
 * `WallProfileNonRegressionBaseline.test.ts`'s `digest()` opens with
 * `if (mesh.isMesh !== true) return;`. A `THREE.LineSegments` sets `isLine` /
 * `isLineSegments`, never `isMesh`. **The whole seven-path geometry baseline is blind to
 * edge overlays**, and has been since it was written. That is not a criticism of the
 * baseline — it pins BODIES and says so — it is the reason this file asserts on
 * `matrixWorld` and on the LINE objects by name.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import {
    buildWallEdgeOverlay,
    attachWallEdgeOverlay,
    auditWallEdgeOverlayFrames,
    __resetWallEdgeStrayLogBudget,
} from '../src/WallEdgeOverlayBuilder';
import type { WallData } from '../src/WallTypes';

const LEVEL_ID = 'L0';
const HEIGHT = 3;
const THICK = 0.2;

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface MkOpts {
    readonly id?: string;
    readonly start?: [number, number];
    readonly end?: [number, number];
    readonly profile?: boolean;
    readonly rake?: number;
    readonly layers?: number[];
    readonly openings?: boolean;
}

/**
 * The founder's shape: a wall whose far end steps down — the raked/sloped top in the
 * screenshot. Authored in the wall's own (u, v) frame, u along the baseline.
 */
function ringFor(length: number) {
    return [
        { u: 0, v: 0 },
        { u: length, v: 0 },
        { u: length, v: 1 },
        { u: length / 2, v: 2 },
        { u: 0, v: HEIGHT },
    ];
}

function mk(o: MkOpts = {}): WallData {
    const start = o.start ?? [0, 0];
    const end = o.end ?? [6, 0];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const layers = o.layers;
    return {
        id: o.id ?? 'w-1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: HEIGHT,
        thickness: layers ? layers.reduce((a, b) => a + b, 0) : THICK,
        baseOffset: 0,
        openings: o.openings
            ? [{
                id: 'op-1', type: 'window', elementId: 'win-1',
                offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
            }]
            : [],
        ...(layers ? { layers: layers.map((t, i) => ({ name: `l${i}`, thickness: t })) } : {}),
        ...(o.rake === undefined ? {} : { rakeAngleDeg: o.rake }),
        ...(o.profile === false ? {} : { wallProfile: { ring: ringFor(length) } }),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

/** Build through the REAL builder with REAL join data and return the wall's root group. */
function buildRoot(walls: WallData[], target = 'w-1'): THREE.Object3D {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, makeLevelProvider());
    builder.refreshV2Cache([]);
    const joins = WallJoinResolver.resolveLevel(walls.map(w => ({ ...w })), { snapRadius: 0.5 });
    for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);
    const root = scene.children.find(c => (c as THREE.Object3D).userData?.id === target);
    expect(root, `the builder produced a group for wall "${target}"`).toBeTruthy();
    root!.updateMatrixWorld(true);
    return root!;
}

function findByTag(root: THREE.Object3D, tag: string): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse(o => { if ((o.userData as { elementType?: string })?.elementType === tag) out.push(o); });
    return out;
}

/** World-space AABB of an object's own geometry — the thing the founder can SEE. */
function worldBox(o: THREE.Object3D): THREE.Box3 {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const bb = new THREE.Box3().makeEmpty();
    for (let i = 0; i < pos.count; i++) bb.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    return bb;
}

const round = (n: number) => Number(n.toFixed(3));
const boxStr = (b: THREE.Box3) =>
    `[${round(b.min.x)},${round(b.min.y)},${round(b.min.z)} .. ${round(b.max.x)},${round(b.max.y)},${round(b.max.z)}]`;

/** The profiled body and its overlay, from a built group. */
function profileBodyAndOverlay(root: THREE.Object3D) {
    const bodies = findByTag(root, 'WallPart').filter(
        o => (o.userData as { profileBody?: boolean }).profileBody === true,
    );
    expect(bodies.length, 'exactly one profiled body was built').toBe(1);
    const overlays = findByTag(root, 'WallEdges');
    expect(overlays.length, 'exactly one edge overlay was built for it').toBe(1);
    return { body: bodies[0]!, overlay: overlays[0]! };
}

// ─────────────────────────────────────────────────────────────────────────────
// §(A) THE CONTROL THAT CANNOT FAIL — and that is the finding, not a weakness
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-EDGE-OVERLAY-FRAME §(A) — the axis-aligned case hid the bug', () => {
    it('a profiled wall running due EAST puts its linework on its solid — before AND after', () => {
        const { body, overlay } = profileBodyAndOverlay(buildRoot([mk({ start: [0, 0], end: [6, 0] })]));
        // Pre-fix this passed too. Recorded so nobody reads §(B) as over-testing: at
        // angle 0 the wall-local frame and the group frame are the same frame, so the
        // missing rotation is the identity and the defect is invisible.
        expect(boxStr(worldBox(overlay))).toBe(boxStr(worldBox(body)));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §(B) THE DEFECT — a profiled wall that does not run due east
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-EDGE-OVERLAY-FRAME §(B) — the linework rides its solid at every bearing', () => {
    /**
     * Where the overlay WOULD land under the pre-fix code: the same geometry under the
     * GROUP's world matrix with an identity local transform.
     *
     * ⚠ COMPUTED, NOT QUOTED. The first draft of this file hard-coded three "measured"
     * pre-fix boxes and the due-WEST one was a GUESS that happened to read plausibly and
     * was wrong — it collided with the CORRECT box and turned the discriminator into a
     * tautology that failed for the wrong reason. That is C84 EI-8a in miniature (a
     * hand-copied constant standing in for a derivation), caught by the suite rather than
     * by review, and it is recorded here instead of being quietly deleted.
     */
    function preFixOverlayBox(root: THREE.Object3D, overlay: THREE.Object3D): THREE.Box3 {
        const ghost = new THREE.Object3D();
        (ghost as unknown as { geometry: THREE.BufferGeometry }).geometry =
            (overlay as THREE.LineSegments).geometry as THREE.BufferGeometry;
        root.add(ghost);                       // identity local transform — the defect
        root.updateMatrixWorld(true);
        const box = worldBox(ghost);
        root.remove(ghost);
        return box;
    }

    const cases: Array<[string, [number, number], [number, number]]> = [
        ['due NORTH (+Z)', [0, 0], [0, 6]],
        ['diagonal 3-4-5', [0, 0], [4, 3]],
        ['due WEST (−X)', [6, 0], [0, 0]],
    ];

    for (const [name, start, end] of cases) {
        it(`${name}: the overlay's world box equals the body's, and is NOT the identity-frame box`, () => {
            const root = buildRoot([mk({ start, end })]);
            const { body, overlay } = profileBodyAndOverlay(root);
            const b = worldBox(body);
            const o = worldBox(overlay);
            // THE DISCRIMINATOR — what the founder sees. Pre-fix the overlay was drawn from
            // the wall-LOCAL extrusion at identity: a closed elevation silhouette floating
            // clear of the building.
            expect(boxStr(o), `overlay box must equal body box ${boxStr(b)}`).toBe(boxStr(b));
            const ghost = preFixOverlayBox(root, overlay);
            expect(
                boxStr(o),
                `the overlay must not sit at the identity-frame box ${boxStr(ghost)}`,
            ).not.toBe(boxStr(ghost));
        });

        it(`${name}: the overlay's WORLD MATRIX is the body's, exactly`, () => {
            // The box comparison above is what the founder SEES; this is the MECHANISM,
            // and it is the stronger instrument of the two. An AABB is orientation-blind:
            // a 180° error maps a symmetric box onto itself, so the due-WEST wall would
            // pass a box check while drawing its linework mirrored end-for-end. Exact
            // matrix equality — not a tolerance — is what actually pins the frame, because
            // both objects are placed from ONE source transform and any difference at all
            // is a second frame creeping back.
            const { body, overlay } = profileBodyAndOverlay(buildRoot([mk({ start, end })]));
            expect(Array.from(overlay.matrixWorld.elements)).toEqual(
                Array.from(body.matrixWorld.elements),
            );
        });
    }

    it('§(B4) PROFILE × RAKE COMPOSE — the shear moves the linework with the solid', () => {
        // `_applyRakeShearToChildren` premultiplies its shear onto every DIRECT child of
        // the group. The overlay is a sibling of the body, so it must carry the body's
        // own local transform for the two to land in the same place after the shear —
        // `S·R` on both. Pre-fix the overlay carried the identity, so the shear was
        // applied to an already-misoriented object and the linework leaned somewhere
        // else again.
        const { body, overlay } = profileBodyAndOverlay(
            buildRoot([mk({ start: [0, 0], end: [4, 3], rake: 75 })]),
        );
        expect(Array.from(overlay.matrixWorld.elements)).toEqual(
            Array.from(body.matrixWorld.elements),
        );
        // CONTROL: the shear really fired — a vertical wall's matrix has no off-diagonal
        // term, so if this were 0 the assertion above would be about nothing.
        expect(Math.abs(body.matrixWorld.elements[4]!) + Math.abs(body.matrixWorld.elements[6]!))
            .toBeGreaterThan(0.1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §(C) THE TRIPWIRE — the half that was missing, watched failing
// ─────────────────────────────────────────────────────────────────────────────
//
// C84 §5: a control that cannot fail is not a control. The audit is therefore driven
// from a hand-built group in the exact broken shape, so the RED proof lives here rather
// than in a git revert nobody re-runs.

describe('§WALL-EDGE-OVERLAY-FRAME §(C) — a wall whose linework left its solid SAYS SO', () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        __resetWallEdgeStrayLogBudget();
        spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { spy.mockRestore(); });

    /** A wall group in the pre-fix shape: rotated body, overlay at identity. */
    function brokenGroup(): THREE.Group {
        const g = new THREE.Group();
        const geo = new THREE.BoxGeometry(6, HEIGHT, THICK);
        geo.translate(3, HEIGHT / 2, 0);                 // local-x along the wall from the start
        const mesh = new THREE.Mesh(geo);
        mesh.userData = { elementType: 'WallPart', role: 'geometry' };
        mesh.rotation.set(0, -Math.PI / 2, 0);           // the wall runs due north
        g.add(mesh);
        g.add(buildWallEdgeOverlay(geo, 'w-broken'));    // …and the overlay does not
        return g;
    }

    it('C1 — RED: the audit finds the stray overlay and names both boxes', () => {
        const g = brokenGroup();
        expect(auditWallEdgeOverlayFrames(g, 'w-broken')).toBe(1);
        expect((g.userData as { strayEdgeOverlays?: number }).strayEdgeOverlays).toBe(1);
        expect(spy).toHaveBeenCalledTimes(1);
        const msg = String(spy.mock.calls[0]![0]);
        expect(msg).toContain('§WALL-EDGE-OVERLAY-FRAME');
        expect(msg).toContain('w-broken');
        expect(msg, 'the message must carry the distance, not just a verdict').toMatch(/\d+\.\d+ m OUTSIDE/);
    });

    it('C2 — GREEN: the same group with the overlay attached through the chokepoint is clean', () => {
        // The control that makes C1 mean something: identical geometry, identical body,
        // one difference — how the overlay was attached.
        const g = new THREE.Group();
        const geo = new THREE.BoxGeometry(6, HEIGHT, THICK);
        geo.translate(3, HEIGHT / 2, 0);
        const mesh = new THREE.Mesh(geo);
        mesh.userData = { elementType: 'WallPart', role: 'geometry' };
        mesh.rotation.set(0, -Math.PI / 2, 0);
        g.add(mesh);
        attachWallEdgeOverlay(g, mesh, geo, 'w-fixed');
        expect(auditWallEdgeOverlayFrames(g, 'w-fixed')).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('C3 — the audit runs on EVERY buildWall, not only the profile arm', () => {
        // The seam is in `buildWall` itself, so the stamp exists on every wall root. A
        // future arm that misplaces an overlay is caught without anyone remembering to
        // add a check to it.
        for (const w of [
            mk({ profile: false, start: [0, 0], end: [4, 3] }),
            mk({ profile: false, start: [0, 0], end: [4, 3], layers: [0.1, 0.05, 0.1] }),
            mk({ profile: false, start: [0, 0], end: [4, 3], openings: true }),
            mk({ start: [0, 0], end: [4, 3] }),
        ]) {
            const root = buildRoot([w]);
            expect(
                (root.userData as { strayEdgeOverlays?: number }).strayEdgeOverlays,
                'every wall root carries the audit stamp',
            ).toBe(0);
        }
    });

    it('C5 — the tripwire catches the FOUNDER\'S OWN CASE, which the first metric missed', () => {
        // ⚠ THE CORRECTION THAT MATTERS, PINNED SO IT CANNOT BE UNDONE.
        //
        // The first version of `auditWallEdgeOverlayFrames` measured the overlay's CENTRE
        // against the solid, and it was watched failing exactly here: a profiled wall on a
        // (0,0)→(4,3) baseline has its stray outline running along world +X with its centre
        // at (2.5, 1.5, 0) — INSIDE the solid's axis-aligned box. Centre distance 0.00 m.
        // The wall reported CLEAN while its linework crossed the building.
        //
        // A rotation about a point near the wall's middle barely moves a centre and throws
        // the ENDS metres out. The audit therefore measures the REACH — the furthest corner
        // — and this case is the reason.
        const g = new THREE.Group();
        const geo = new THREE.BoxGeometry(5, HEIGHT, THICK);
        geo.translate(2.5, HEIGHT / 2, 0);
        const mesh = new THREE.Mesh(geo);
        mesh.userData = { elementType: 'WallPart', role: 'geometry' };
        mesh.rotation.set(0, -Math.atan2(3, 4), 0);      // the 3-4-5 diagonal
        g.add(mesh);
        g.add(buildWallEdgeOverlay(geo, 'w-diag'));      // …overlay left at identity

        // The centre-based metric would return 0 here. State that, so the assertion below
        // is legibly a DIFFERENT measurement and not a tightened tolerance.
        g.updateMatrixWorld(true);
        const solid = new THREE.Box3().setFromObject(mesh);
        const strayBox = new THREE.Box3().setFromObject(g.children[1]!);
        const centre = strayBox.getCenter(new THREE.Vector3());
        expect(
            centre.distanceTo(solid.clampPoint(centre, new THREE.Vector3())),
            'the CENTRE of the stray outline is inside the solid — this is why the first metric was blind',
        ).toBe(0);

        expect(auditWallEdgeOverlayFrames(g, 'w-diag'), 'the REACH metric sees it').toBe(1);
        expect(String(spy.mock.calls[0]![0])).toMatch(/reaches \d+\.\d+ m OUTSIDE/);
    });

    it('C6 — an ACUTE mitred join is not a false positive', () => {
        // The tolerance's worst legitimate case: a mitred outline reaches past its body's
        // box by `(t/2)·cot(θ/2)`. A muted tripwire is worse than none, so the sharpest
        // join the join resolver will actually produce must stay silent.
        buildRoot([
            mk({ id: 'w-1', profile: false, start: [0, 0], end: [6, 0] }),
            mk({ id: 'w-2', profile: false, start: [6, 0], end: [0.5, 1.4] }),
        ]);
        expect(
            spy.mock.calls.map(c => String(c[0])).filter(m => m.includes('§WALL-EDGE-OVERLAY-FRAME')),
            'an acute mitre is not stray linework',
        ).toEqual([]);
    });

    it('C4 — the tripwire does NOT fire on the arms that were already correct', () => {
        // A noisy tripwire gets muted, and a muted tripwire is worse than none. Mitred
        // corners, layered bands, curved walls and opening-bearing bodies all place their
        // overlays by their own (correct) route; none may be reported.
        expect(spy).not.toHaveBeenCalled();
        buildRoot([
            mk({ id: 'w-1', profile: false, start: [0, 0], end: [6, 0] }),
            mk({ id: 'w-2', profile: false, start: [6, 0], end: [6, 5] }),
        ]);
        buildRoot([mk({ profile: false, start: [0, 0], end: [4, 3], layers: [0.1, 0.05, 0.1], rake: 75 })]);
        buildRoot([mk({ profile: false, start: [0, 0], end: [4, 3], openings: true })]);
        expect(
            spy.mock.calls.map(c => String(c[0])).filter(m => m.includes('§WALL-EDGE-OVERLAY-FRAME')),
            'no pre-existing arm may be reported as stray',
        ).toEqual([]);
    });
});
