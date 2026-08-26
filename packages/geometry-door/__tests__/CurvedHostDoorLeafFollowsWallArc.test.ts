/**
 * §FEAT-CURVED-DOOR-LEAF (L-957) — SLICE 1: THE LEAF AND ITS GLAZED LIGHT FOLLOW
 * THE WALL'S OWN ARC.
 *
 * The founder asked for curved windows, then for doors to get the same treatment,
 * *"whatever is most architecturally sound"*. His spec for the window has three
 * clauses and the binding one is the third: *"the same precised curved than the
 * wall."* Not an arc that resembles the wall's — the wall's. So the assertion
 * that carries this file is not "the leaf is bowed" (a leaf bowed on an
 * independently-computed arc would pass that and still show a seam where it meets
 * the reveal). It is:
 *
 *     EVERY VERTEX OF THE LEAF EQUALS A POINT THE WALL'S OWN RESOLVER RETURNS.
 *
 * The expected values are computed here by calling `hostedElementFrame()` from
 * `@pryzm/geometry-wall` — the same function `WallFragmentBuilder`'s carve, the
 * plan symbol and the snap providers position from — and compared to the built
 * scene graph. If `DoorBuilder` ever grows its own Bézier, its own radius or its
 * own `atan2` over the baseline, the two stop agreeing and this file says so.
 * That is the C84 EI-9 defect this feature exists to avoid, made observable.
 *
 * ── THE ONE PLACE A DOOR IS NOT A WINDOW, AND WHY IT DOES NOT BITE ───────────
 * A door has a leaf that opens. Measured before designing: it is NEVER modelled
 * open in 3D. `DoorBuilder` contains exactly one rotation — `group.rotation.y`,
 * the group's heading on the wall — and every sub-mesh is placed by
 * `position.set` with no rotation of its own. There is no swing angle, no open
 * state and no hinge transform in the 3D path. The 90°-open leaf exists only in
 * `DoorPlanSymbolBuilder`, where §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST already
 * settled it as RIGID about one hinge station and this lane does not touch it.
 * The final `it` below pins that measurement, so the day someone adds a 3D open
 * state, this file is what tells them the leaf must ROTATE as a rigid body about
 * a hinge axis seated on the arc, and must never be re-swept at the open angle.
 *
 * COMMITTED ≠ REACHABLE: every number below is read off `matrixWorld` after a
 * real `rebuild()`, never off a pure function's return.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';
import { hostedElementFrame, wallCentreline, arcLengthAtPointXZ } from '@pryzm/geometry-wall';

/**
 * A 6 m-chord wall bowed toward −Z. `segments: 16` is what the leaf must inherit;
 * the control point is well off the chord so the sagitta is centimetres, not noise.
 */
const CURVED_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: -2.4 }, segments: 16 },
    openings: [{ elementId: 'd1', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 }],
};

const STRAIGHT_WALL = {
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

type Lod = 'coarse' | 'medium' | 'fine';

function buildOn(wall: unknown, lod: Lod = 'coarse', door: Record<string, unknown> = DOOR): THREE.Group {
    initDefaultViewsManager();
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const wallStoreStub = {
        getById: () => wall,
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

function byRole(group: THREE.Group, role: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh && o.userData?.role === role) out.push(o); });
    return out;
}

/** True when the mesh is a plain `BoxGeometry` — i.e. NOT swept. */
const isBox = (m: THREE.Mesh): boolean =>
    (m.geometry as unknown as { parameters?: unknown }).parameters !== undefined;

/** Every vertex of `mesh`, in WORLD space, de-duplicated to 1e-9 m. */
function worldVerts(mesh: THREE.Mesh): Array<{ x: number; y: number; z: number }> {
    const pos = mesh.geometry.getAttribute('position');
    const seen = new Set<string>();
    const out: Array<{ x: number; y: number; z: number }> = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        const k = `${v.x.toFixed(9)}|${v.y.toFixed(9)}|${v.z.toFixed(9)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ x: v.x, y: v.y, z: v.z });
    }
    return out;
}

// The COARSE leaf is ONE slab spanning the full clear opening — the unambiguous
// case for "the leaf". Its span is restated from the builder's own derivation
// (`innerW = w − 2·ft`, no sidelight on a typeless door), never from a literal.
const FT = DOOR.frameThickness;
const LEAF_W = DOOR.width - 2 * FT;
const LEAF_T = DOOR.leafThickness;

describe('§FEAT-CURVED-DOOR-LEAF slice 1 — the leaf on the host wall\'s own arc', () => {
    it('THE SPEC: every leaf vertex is a point the WALL\'S OWN resolver returns', () => {
        const leaves = byRole(buildOn(CURVED_WALL, 'coarse'), 'doorLeaf');
        expect(leaves).toHaveLength(1);                 // the coarse slab
        const got = worldVerts(leaves[0]!);

        // The expected surface, from the canonical resolver — the SAME call the
        // wall's carve and the plan symbol make. Two concentric runs at ±half the
        // leaf thickness, over the leaf's own span.
        const hf = hostedElementFrame(CURVED_WALL, DOOR.offset, DOOR.width);
        const expected: Array<{ x: number; z: number }> = [];
        for (const n of [-LEAF_T / 2, LEAF_T / 2]) expected.push(...hf.run(-LEAF_W / 2, LEAF_W / 2, n));

        // Every built vertex's XZ must BE one of them. (Y is the leaf's own two
        // levels, asserted separately — the host curve has no Y component at all.)
        //
        // ⚠ The comparison is to 1e-5 m and that is not slack, it is the storage.
        // `BufferGeometry` positions are FLOAT32: at these coordinates one ulp is
        // ~2.4e-7 m, and the world transform compounds a few of them. The wall
        // body's own vertices go through exactly the same float32 attribute, so
        // this is the precision at which leaf and reveal can agree AT ALL. What
        // the assertion pins is the SOURCE of the numbers: an independently
        // computed arc — a different Bézier, a fitted radius, a chord — misses by
        // millimetres to centimetres here, three to five orders of magnitude out.
        const TOL = 1e-5;
        const builtXZ = new Map<string, { x: number; z: number }>();
        for (const p of got) builtXZ.set(`${p.x.toFixed(6)}|${p.z.toFixed(6)}`, p);
        expect(builtXZ.size).toBe(expected.length);

        let worst = 0;
        for (const p of builtXZ.values()) {
            let best = Infinity;
            for (const e of expected) best = Math.min(best, Math.hypot(p.x - e.x, p.z - e.z));
            worst = Math.max(worst, best);
        }
        expect(worst).toBeLessThan(TOL);
    });

    it('inherits the HOST\'S segment count and stations — not a resolution of its own', () => {
        const leaf = byRole(buildOn(CURVED_WALL, 'coarse'), 'doorLeaf')[0]!;
        const stations = new Set(worldVerts(leaf).map(p => p.x.toFixed(9)));

        // Interior stations of the HOST centreline that fall strictly inside the
        // leaf's span, plus its two ends. Anything else means the leaf picked its
        // own tessellation, and leaf and reveal would meet on different polylines.
        const cl = wallCentreline(CURVED_WALL);
        const centreS = DOOR.offset + DOOR.width / 2;
        const lo = centreS - LEAF_W / 2;
        const hi = centreS + LEAF_W / 2;
        const interior = cl.cum.filter(c => c > lo && c < hi).length;
        expect(interior).toBeGreaterThan(0);          // non-vacuity: it really spans chords

        const hf = hostedElementFrame(CURVED_WALL, DOOR.offset, DOOR.width);
        expect(hf.run(-LEAF_W / 2, LEAF_W / 2, 0)).toHaveLength(interior + 2);
        expect(stations.size).toBeGreaterThanOrEqual(interior + 2);
    });

    it('THE LEAF ACTUALLY BOWS: its mid-span is off the chord by a real sagitta', () => {
        // Guards against the pin above passing on a leaf that is technically built
        // from resolver points but has collapsed to two of them.
        const leaf = byRole(buildOn(CURVED_WALL, 'coarse'), 'doorLeaf')[0]!;
        const vs = worldVerts(leaf).filter(p => Math.abs(p.y - (DOOR.height / 2 - FT / 2)) < 1.2);
        const xs = vs.map(p => p.x);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const end0 = vs.find(p => Math.abs(p.x - xMin) < 1e-9)!;
        const end1 = vs.find(p => Math.abs(p.x - xMax) < 1e-9)!;
        const mid = vs.reduce((best, p) =>
            Math.abs(p.x - (xMin + xMax) / 2) < Math.abs(best.x - (xMin + xMax) / 2) ? p : best, vs[0]!);
        const dx = end1.x - end0.x, dz = end1.z - end0.z;
        const L = Math.hypot(dx, dz);
        const sagitta = Math.abs((mid.x - end0.x) * dz - (mid.z - end0.z) * dx) / L;
        expect(sagitta).toBeGreaterThan(0.002);       // millimetres, not float noise
    });

    it('the leaf is a swept BufferGeometry — a BoxGeometry cannot be curved', () => {
        const leaf = byRole(buildOn(CURVED_WALL, 'coarse'), 'doorLeaf')[0]!;
        expect(isBox(leaf)).toBe(false);
        expect(leaf.geometry.getAttribute('position').count).toBeGreaterThan(24);
        // …and it carries authored normals, not `computeVertexNormals()` averages
        // that would round the 90° edge between leaf face and reveal.
        expect(leaf.geometry.getAttribute('normal')).toBeTruthy();
    });

    it('A GLAZED LIGHT follows the arc too, on the HOST OWN CENTRELINE stations', () => {
        // `dt-glazed-aluminium` is a built-in type whose leaf is ONE full-height
        // glass light. A light in a curved wall must read as one curved surface
        // with the leaf around it, exactly as a window pane does.
        const glazed = { ...DOOR, id: 'd3', systemTypeId: 'dt-glazed-aluminium' };
        const panes = byRole(buildOn(CURVED_WALL, 'medium', glazed), 'doorGlazing');
        expect(panes.length).toBeGreaterThan(0);       // non-vacuity: real glass exists
        for (const pane of panes) expect(isBox(pane)).toBe(false);

        // THE DISCRIMINATING CLAIM, and the reason it is stated as STATIONS rather
        // than as a distance: the pane's span is the type's, not the record's, so
        // an expected-surface comparison would have to restate the builder's own
        // layout arithmetic and would then agree with it by construction. What
        // cannot be faked is WHICH stations the pane is tessellated at. Every
        // distinct arc length its vertices occupy must be either one of the HOST
        // centreline's own stations or one of the pane's two ends. An
        // independently-derived arc — a different Bézier, a fitted radius, a denser
        // sampling — lands between them, and pane and reveal then meet on two
        // different polylines. `arcLengthAtPointXZ` is the wall's own inverse
        // mapping, so even this check re-derives nothing.
        const cl = wallCentreline(CURVED_WALL);
        for (const pane of panes) {
            const ss = worldVerts(pane).map(p => arcLengthAtPointXZ(CURVED_WALL, p.x, p.z, cl).s);
            const lo = Math.min(...ss), hi = Math.max(...ss);
            expect(hi - lo).toBeGreaterThan(0.1);      // it really spans the opening
            const allowed = [...cl.cum, lo, hi];
            let worst = 0;
            for (const s of ss) {
                worst = Math.max(worst, Math.min(...allowed.map(a => Math.abs(a - s))));
            }
            // ⚠ 5e-3 m, and the number is the PROJECTION's, not the geometry's.
            // `arcLengthAtPointXZ` finds the closest point on the centreline
            // POLYLINE. For a vertex sitting `n` off the centreline — the pane's
            // faces are at n = ±12.5 mm — the perpendicular foot shifts along the
            // polyline by up to `n·tan(half the per-segment turn)`, which on this
            // wall (~6° per segment) measures 1.2 mm. That is an artefact of asking
            // the question at an offset point, not a departure from the arc.
            // The DISCRIMINATING scale is the station spacing: the interior host
            // stations here are ~0.38 m apart, so a pane on a tessellation of its
            // own lands ~0.19 m away — 38× outside this bound. The assertion still
            // separates "the host's stations" from "any other stations" by two
            // orders of magnitude.
            expect(worst).toBeLessThan(5e-3);
            // …and there is at least one INTERIOR station, or "inherits the host's
            // stations" would be satisfied by a flat pane with only two ends.
            const interior = ss.filter(s => s > lo + 1e-6 && s < hi - 1e-6);
            expect(interior.length).toBeGreaterThan(0);
        }
    });

    // ── THE DOOR'S ONE DIFFERENCE FROM A WINDOW ─────────────────────────────
    it('THE LEAF IS NEVER MODELLED OPEN IN 3D — so a curved leaf is a leaf in its frame', () => {
        // This is the measurement that made the door safe to treat as a window.
        // A swung leaf is a RIGID body: it may be re-seated and rotated, never
        // re-swept. If this ever fails, the leaf has acquired an open state and
        // `CurvedLeafGeometry`'s header describes what must happen instead.
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            const g = buildOn(CURVED_WALL, lod);
            const rotated: string[] = [];
            g.traverse(o => {
                if (!(o instanceof THREE.Mesh)) return;
                // A SEATED member carries the host's local turn about Y, which is
                // the wall's heading, not a swing. X and Z rotation would be a leaf
                // tilting or swinging out of plane, and there is none.
                if (Math.abs(o.rotation.x) > 0 || Math.abs(o.rotation.z) > 0) {
                    rotated.push(String(o.userData?.role ?? 'frame'));
                }
            });
            expect(rotated, `unexpected out-of-plane rotation at lod=${lod}`).toEqual([]);
        }
        // …and on a STRAIGHT host nothing is rotated at all — the pre-feature model.
        const flat = buildOn(STRAIGHT_WALL, 'fine');
        flat.traverse(o => {
            if (!(o instanceof THREE.Mesh)) return;
            expect(o.rotation.y).toBe(0);
        });
    });

    // ── NON-VACUITY ─────────────────────────────────────────────────────────
    it('on a STRAIGHT host the leaf is still a plain BoxGeometry', () => {
        const leaf = byRole(buildOn(STRAIGHT_WALL, 'coarse'), 'doorLeaf')[0]!;
        const params = (leaf.geometry as unknown as { parameters?: { width: number; depth: number } }).parameters;
        expect(params).toBeDefined();
        expect(params!.width).toBeCloseTo(LEAF_W, 9);
        expect(params!.depth).toBeCloseTo(LEAF_T, 9);
    });

    it('the escape hatch restores the flat leaf on a curved host', () => {
        // `__pryzmHostedOnCurvedWall = false` is the switch the whole
        // §FEAT-HOSTED-ON-CURVED-WALL family is governed by. The curved LEAF must
        // obey it too, or turning it off leaves a bowed leaf in a chorded hole.
        const g = globalThis as { __pryzmHostedOnCurvedWall?: boolean };
        g.__pryzmHostedOnCurvedWall = false;
        try {
            const off = byRole(buildOn(CURVED_WALL, 'coarse'), 'doorLeaf')[0]!;
            expect(isBox(off)).toBe(true);
        } finally {
            delete g.__pryzmHostedOnCurvedWall;
        }
    });

    it('a RAKED curved host is REFUSED by name, and falls back to a FLAT leaf', () => {
        // `curvedLeafRefusal` is CONSULTED by the builder, not restated. A wall
        // cannot legally hold both a rake and a curve (WallRake.ts: ILL-POSED,
        // enforced in WallDataSchema and WallStore), so this is a DEFENCE against
        // an upstream guard failing — and a silently-wrong leaf is the worst
        // possible response to that. The reason must be REACHABLE, i.e. stamped
        // where a panel can show it.
        const raked = { ...CURVED_WALL, rakeAngleDeg: 75 };
        const g = buildOn(raked, 'coarse');
        const reason = (g.userData as { curvedLeafRefusal?: string }).curvedLeafRefusal;
        expect(typeof reason).toBe('string');
        expect(reason).toContain('door');            // the noun is the DOOR's, not the window's
        expect(reason).toContain('raked');
        // …and the leaf really did fall back to flat, rather than the refusal being
        // a label on curved geometry that shipped anyway.
        expect(isBox(byRole(g, 'doorLeaf')[0]!)).toBe(true);
    });

    it('an ORDINARY curved door carries NO refusal on its userData', () => {
        // Non-vacuity for the assertion above: if the field were always present,
        // "it is stamped when refused" would mean nothing.
        const g = buildOn(CURVED_WALL, 'coarse');
        expect((g.userData as { curvedLeafRefusal?: string }).curvedLeafRefusal).toBeUndefined();
    });
});
