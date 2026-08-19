// @vitest-environment happy-dom
/**
 * §SLAB-PARAM-EDIT-NO-DISPLACE (L-1177) — founder 2026-08-19, "a MAJOR bug":
 *
 *   "When I create a slab — normally BY REGION around the boundary of the parcel —
 *    and I change either the BOTTOM OFFSET or the THICKNESS, THE SLAB IS DISPLACED
 *    — IT MOVES."
 *
 * ── WHAT THIS GUARDS, and why it is at THIS coupling ────────────────────────────
 * The builder alone is CORRECT and lane SL2's probes measured it so: on the
 * founder's own ring (parcel-scale, 177 free edges, 164 curved, zero host walls)
 * a thickness change moves dTopY=0 / dCentreX=0 / dCentreZ=0. Neither of the two
 * standing hypotheses survived measurement:
 *
 *   (A) "anchored at the wrong surface" — REFUTED. `resolveWorldY` is literally
 *       `const topY = level.elevation + baseOffset; return topY - data.thickness;`
 *       The datum IS the top face, which is BIM-conventional (finished floor
 *       level) and is what C92 section 10 already declares. The founder's console
 *       line `[LevelPlaneConstraint] Locked model Y=-0.2000` is not a defect at
 *       all — it is the CORRECT root Y for a 0.2 m slab on a level at elevation 0.
 *   (B) "pivot and mesh read different rings" — REFUTED. dCentreX/dCentreZ are
 *       0.000000 on the founder's ring; `resolveBuildRing` reports one source.
 *
 * The defect is a THIRD thing, and it only appears when the slab is SELECTED —
 * which is always, because you must select a slab to edit its parameters.
 *
 * ROOT: `root.position.y` is a DERIVED value. Because the datum is the TOP face,
 * the root sits at `topY - thickness`, so it LEGITIMATELY changes on every
 * thickness or baseOffset edit. `LevelPlaneConstraint.attach()` latches that Y as
 * an immutable "level plane" and re-asserts it on every TransformControls
 * `change` event. `SelectionManager.clearHighlight()` ends with
 * `transformControls.detach()`, and in three's TransformControls `object` is a
 * `defineProperty` field whose setter dispatches `change` — so the re-highlight
 * that follows a rebuild fires a clamp while the constraint still holds the
 * PRE-EDIT Y, over a root the builder REUSES (`slabRoots.get(id)`). The builder's
 * correct write is destroyed, and the subsequent re-attach latches the corrupted
 * value as the new truth, making it permanent.
 *
 * Net: the slab ends up exactly dThickness ABOVE where it belongs. That is the
 * founder's "IT MOVES".
 *
 * ⚠ THE DOUBLE IS FAITHFUL ON THE ONE AXIS THAT MATTERS. Real
 * `TransformControls.detach()` contains no `dispatchEvent` call in its own body —
 * it dispatches through the shared `defineProperty` setter (three r183
 * `TransformControls.js:123-124`, props declared `:149` `object` / `:158` `axis`),
 * firing `change` exactly when the value actually changes. The double reproduces
 * that condition and nothing more. `dragging` is modelled because three sets it
 * `true` in `pointerDown:448` before any drag `change` (`pointerMove` returns at
 * `:473` unless `dragging === true`, and dispatches `change` at `:720`).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { LevelPlaneConstraint } from '../../input-host/src/LevelPlaneConstraint';

/** The founder's ring: parcel-scale, far from origin, 177 free (mostly curved) edges. */
function parcelRing(n = 177): { x: number; y: number }[] {
    const cx = 48.7, cz = -132.4, r = 41.0;
    const ring: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const rr = r * (1 + 0.18 * Math.sin(3 * t) + 0.07 * Math.cos(5 * t));
        ring.push({ x: cx + rr * Math.cos(t), y: cz + rr * Math.sin(t) });
    }
    return ring;
}
const RING = parcelRing();
const xs = RING.map(p => p.x), zs = RING.map(p => p.y);
const BB = { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };

function slabData(over: Record<string, unknown> = {}) {
    return {
        id: 'slab-parcel', type: 'slab', levelId: 'L0', parentId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        width: BB.w, depth: BB.d, thickness: 0.2, baseOffset: 0,
        polygon: RING.map(p => ({ ...p })),
        sketch: {
            outerLoop: {
                edges: RING.map((p, i) => ({
                    type: 'freeLine' as const, start: { x: p.x, y: p.y }, end: RING[(i + 1) % RING.length],
                })),
            },
        },
        properties: {}, ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
        ...over,
    } as never;
}

/**
 * Faithful stand-in. `object` mirrors three's `defineProperty` setter: assigning a
 * DIFFERENT value dispatches `change`; assigning the same value dispatches nothing.
 */
class TransformControlsDouble extends THREE.EventDispatcher<{ change: object }> {
    mode = 'translate';
    showY = true;
    dragging = false;
    private _object: THREE.Object3D | undefined;
    get object(): THREE.Object3D | undefined { return this._object; }
    set object(v: THREE.Object3D | undefined) {
        if (this._object !== v) { this._object = v; this.dispatchEvent({ type: 'change' }); }
    }
    attach(o: THREE.Object3D) { this.object = o; return this; }
    detach() { this.object = undefined; return this; }
}

function makeBuilder() {
    const scene = new THREE.Scene();
    return new SlabFragmentBuilder(scene, {
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never);
}

/**
 * Displacement tolerance, in `toBeCloseTo` digits: 6 => |diff| < 5e-7 m (half a
 * micrometre).
 *
 * NOT tuned until green. The geometry buffers are float32 and this ring sits ~180 m
 * from the world origin, so face positions carry a few NANOmetres of accumulated
 * round-off (measured: 3e-9 m). That is arithmetic, not displacement. The defect
 * this file guards was 0.200 m — 400,000x this tolerance — and the pre-fix RED run
 * is re-measured at THIS tolerance, not at a looser one, so nothing real hides here.
 */
const TOL = 6;

function faces(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root);
    return {
        top: b.max.y, bot: b.min.y,
        cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2,
        minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z,
    };
}

/**
 * The PRODUCTION re-highlight, in `SelectionManager`'s real order:
 *   applyHighlight() -> clearHighlight() -> transformControls.detach()   [:3208]
 *                    -> transformControls.attach(obj)                    [:2179]
 *                    -> levelPlaneConstraint.detach() -> .attach(obj)    [:2182-2185]
 * The gizmo is touched BEFORE the constraint is released — that ordering is the
 * whole defect, so the harness must not tidy it up.
 */
function reHighlight(tc: TransformControlsDouble, lpc: LevelPlaneConstraint, obj: THREE.Object3D) {
    tc.detach();          // clearHighlight() — fires `change` with the STALE lock live
    tc.attach(obj);       // mesh path re-attach — fires `change` again
    lpc.detach();
    lpc.attach(obj);
}

describe('SLAB-PARAM-EDIT-NO-DISPLACE (L-1177) — a selected slab must not move when its parameters change', () => {
    it('THICKNESS 0.2 -> 0.4 : plan position identical, TOP face pinned to the datum, only the BOTTOM drops', () => {
        const b = makeBuilder();
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        b.updateSlab(slabData());
        const root = b.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const before = faces(root);

        b.updateSlab(slabData({ thickness: 0.4 }));
        reHighlight(tc, lpc, root);
        const after = faces(root);

        // Plan position — the founder's "IT MOVES" in X/Z.
        expect(after.cx).toBeCloseTo(before.cx, TOL);
        expect(after.cz).toBeCloseTo(before.cz, TOL);
        expect(after.minX).toBeCloseTo(before.minX, TOL);
        expect(after.maxZ).toBeCloseTo(before.maxZ, TOL);

        // C92 section 10 — the datum is the TOP face. It must not move at all.
        expect(after.top).toBeCloseTo(before.top, TOL);
        // Only the intended face moves, and by exactly the thickness delta.
        expect(after.bot).toBeCloseTo(before.bot - 0.2, TOL);
    });

    it('BASE OFFSET 0 -> 0.5 : plan position identical, the whole slab rises by exactly 0.5', () => {
        const b = makeBuilder();
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        b.updateSlab(slabData());
        const root = b.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const before = faces(root);

        b.updateSlab(slabData({ baseOffset: 0.5 }));
        reHighlight(tc, lpc, root);
        const after = faces(root);

        expect(after.cx).toBeCloseTo(before.cx, TOL);
        expect(after.cz).toBeCloseTo(before.cz, TOL);
        expect(after.top).toBeCloseTo(before.top + 0.5, TOL);
        expect(after.bot).toBeCloseTo(before.bot + 0.5, TOL);
    });

    it('the corruption must not become PERMANENT — a second edit still lands correctly', () => {
        const b = makeBuilder();
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        b.updateSlab(slabData());
        const root = b.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const before = faces(root);

        // Three consecutive edits, each followed by the production re-highlight.
        for (const t of [0.4, 0.6, 0.3]) {
            b.updateSlab(slabData({ thickness: t }));
            reHighlight(tc, lpc, root);
        }
        const after = faces(root);

        expect(after.cx).toBeCloseTo(before.cx, TOL);
        expect(after.cz).toBeCloseTo(before.cz, TOL);
        expect(after.top).toBeCloseTo(before.top, TOL);   // datum never drifts
        expect(after.bot).toBeCloseTo(before.top - 0.3, TOL);
    });

    it('the vertical DRAG lock is NOT weakened — a real gizmo drag is still refused', () => {
        const b = makeBuilder();
        const tc = new TransformControlsDouble();
        const lpc = new LevelPlaneConstraint(tc as never, () => 0);

        b.updateSlab(slabData());
        const root = b.getRootById('slab-parcel')!;
        tc.attach(root);
        lpc.attach(root);
        const lockedY = root.position.y;

        // A real drag: three sets `dragging = true` in pointerDown BEFORE any
        // pointerMove `change`, so this is the production condition.
        tc.dragging = true;
        root.position.y = lockedY + 1.5;
        tc.dispatchEvent({ type: 'change' });
        expect(root.position.y).toBeCloseTo(lockedY, TOL);

        // …and the drag-end `enforce()` remains a hard guarantee.
        root.position.y = lockedY - 4.0;
        tc.dragging = false;
        lpc.enforce();
        expect(root.position.y).toBeCloseTo(lockedY, TOL);
    });
});
