/**
 * §CAPS-ARE-EARCUT-NOT-A-FAN (founder 2026-09-09 · L-13271 · C58 · C114 §2b)
 *
 * THE ASK, VERBATIM:
 *   *"pLEASE REVIEW THE ENVELOPE - IT IS NICELY CREATED 3D SITE VIEW - BUT ON PRYZM
 *     (CHECK THE FITST PHOTO) IS NOT WELL DESIGNS - CHECK THE GEOMTRY"*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ ONE RULE, TWO TRIANGULATORS — AND HE WAS LOOKING AT THE WRONG ONE
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Both views consume the SAME `SpaceEnvelope` record, the SAME ring, in the SAME order.
 * They differed in exactly one algorithm:
 *
 *   · 3D Site  → `Cesium.PolygonHierarchy` → **earcut** → correct for any simple ring.
 *   · PRYZM 3D → `_faceGeometry` → **a triangle fan from vertex 0** → correct for a CONVEX
 *     ring only.
 *
 * That is [[same-rule-two-implementations]] in its purest form, and it is why the founder
 * could photograph a clean envelope and a mangled one in the same session and be right twice.
 *
 * ⛔ WHY THIS SUITE ROTATES THE START VERTEX. A vertex-0 fan is accidentally CORRECT when
 * vertex 0 happens to lie in the polygon's kernel. A spec that fixtured one ring orientation
 * would therefore have had a real chance of being a **false green**, and green-but-blind is
 * the failure this repo keeps repeating ([[gate-blind-on-the-wrong-axis]]). Every rotation
 * is asserted.
 *
 * ✅ ESTABLISHES: for a concave ring, at EVERY start rotation, (1) every cap triangle lies
 *    inside the footprint, and (2) the cap's total area equals the footprint area — i.e. the
 *    cap tiles the polygon exactly, neither spilling outside nor overlapping itself.
 * ⛔ DOES NOT ESTABLISH: that any pixel is drawn. No renderer is constructed.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { footprintAreaM2, pointInRing } from '@pryzm/geometry-space-envelope';
import { SpaceEnvelopeMeshBuilder } from '../SpaceEnvelopeMeshBuilder';

// ⚠ `EnvelopePoint` carries a `y`, so the ring literals below declare one. The cap only
// ever reads x/z — the prism's own `baseOffset`/`height` own the vertical — but the geometry
// package's helpers take the full point type, and widening them here would be a fixture that
// is more permissive than the real caller ([[fake-more-capable-than-real]]).
type Pt = { readonly x: number; readonly y: number; readonly z: number };

/**
 * A 6-vertex L — the smallest ring that is concave, and the shape a real buildable inset
 * degenerates to. The founder's own case is a 20-corner inset (his console says so); the
 * defect mechanism is identical and an L makes the arithmetic checkable by hand.
 *
 * Area = 20×10 + 8×14 = 200 + 112 = 312 m².
 */
const L_RING: readonly Pt[] = [
    { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, { x: 20, y: 0, z: 10 },
    { x: 8, y: 0, z: 10 }, { x: 8, y: 0, z: 24 }, { x: 0, y: 0, z: 24 },
];

const rotate = (ring: readonly Pt[], k: number): Pt[] =>
    ring.map((_, i) => ring[(i + k) % ring.length]!);

/** Reach the one private method under test. The public entry needs a canvas for its label. */
function capGeometry(ring: readonly Pt[], kind: 'top' | 'bottom'): THREE.BufferGeometry {
    const builder = new SpaceEnvelopeMeshBuilder(new THREE.Group());
    const geo = (builder as unknown as {
        _faceGeometry(
            prism: { footprint: readonly Pt[]; baseOffset: number; height: number },
            face: { kind: string },
        ): THREE.BufferGeometry | null;
    })._faceGeometry({ footprint: ring, baseOffset: 3, height: 3 }, { kind });
    expect(geo, `${kind} cap must produce geometry`).not.toBeNull();
    return geo!;
}

/** Every triangle in the cap, as scene-space XZ triples. */
function triangles(geo: THREE.BufferGeometry): { a: Pt; b: Pt; c: Pt; y: number }[] {
    const pos = geo.getAttribute('position');
    const out: { a: Pt; b: Pt; c: Pt; y: number }[] = [];
    const idx = geo.getIndex();
    const count = idx ? idx.count : pos.count;
    const at = (i: number): number => (idx ? idx.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
        const i0 = at(i);
        const i1 = at(i + 1);
        const i2 = at(i + 2);
        out.push({
            a: { x: pos.getX(i0), y: 0, z: pos.getZ(i0) },
            b: { x: pos.getX(i1), y: 0, z: pos.getZ(i1) },
            c: { x: pos.getX(i2), y: 0, z: pos.getZ(i2) },
            y: pos.getY(i0),
        });
    }
    return out;
}

const triArea = (t: { a: Pt; b: Pt; c: Pt }): number =>
    Math.abs((t.b.x - t.a.x) * (t.c.z - t.a.z) - (t.c.x - t.a.x) * (t.b.z - t.a.z)) / 2;

describe('§CAPS-ARE-EARCUT-NOT-A-FAN — a concave storey cap tiles its own footprint', () => {
    for (let k = 0; k < L_RING.length; k += 1) {
        const ring = rotate(L_RING, k);

        it(`⭐ start vertex ${k}: no cap triangle escapes the footprint`, () => {
            // THE FOUNDER-VISIBLE FACT. Under the fan, triangles spanning the L's reflex
            // corner lay OUTSIDE the plot — purple wedges hanging in space next to a
            // side-face fence that was perfectly correct.
            for (const t of triangles(capGeometry(ring, 'top'))) {
                if (triArea(t) < 1e-9) continue; // earcut may emit slivers; they cover nothing
                const centroid = {
                    x: (t.a.x + t.b.x + t.c.x) / 3,
                    z: (t.a.z + t.b.z + t.c.z) / 3,
                };
                expect(pointInRing(centroid, ring), `triangle at ${JSON.stringify(centroid)}`).toBe(true);
            }
        });

        it(`start vertex ${k}: the cap covers the footprint exactly — no gaps, no overlap`, () => {
            // Containment alone is not enough: a cap could sit inside the ring and still
            // miss a limb, or double-cover one. Total area pins both at once.
            const total = triangles(capGeometry(ring, 'top')).reduce((s, t) => s + triArea(t), 0);
            expect(total).toBeCloseTo(footprintAreaM2(ring), 6);
            expect(footprintAreaM2(ring)).toBeCloseTo(312, 6); // the hand-checked value
        });
    }

    it('⛔ the cap is NOT mirrored — §PARCEL-SHADE-NOT-MIRRORED (L-10740) shipped this exact idiom backwards once', () => {
        // `rotateX(+π/2)` would reflect every vertex about the scene X axis. On this ring
        // that lands the whole cap at negative z, where `pointInRing` is false everywhere —
        // but `DoubleSide` would hide the flipped normals, so nothing else would notice.
        const zs = triangles(capGeometry(L_RING, 'top')).flatMap((t) => [t.a.z, t.b.z, t.c.z]);
        expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-9);
        expect(Math.max(...zs)).toBeCloseTo(24, 6);
    });

    it('top and bottom sit at the storey height apart, and the ring is unchanged between them', () => {
        // The caps carry the prism's vertical extent; the fix must not disturb it, because
        // the face-index convention, the drag controller and `spaceEnvelope.moveFace` key on it.
        const top = triangles(capGeometry(L_RING, 'top'));
        const bottom = triangles(capGeometry(L_RING, 'bottom'));
        expect(top[0]!.y).toBeCloseTo(6, 6);    // baseOffset 3 + height 3
        expect(bottom[0]!.y).toBeCloseTo(3, 6);
        expect(top.reduce((s, t) => s + triArea(t), 0))
            .toBeCloseTo(bottom.reduce((s, t) => s + triArea(t), 0), 6);
    });

    it('a convex ring still works — the fix must not regress the case the fan handled', () => {
        const rect: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }];
        const total = triangles(capGeometry(rect, 'top')).reduce((s, t) => s + triArea(t), 0);
        expect(total).toBeCloseTo(24, 6);
    });

    it('a degenerate ring returns null rather than a malformed cap', () => {
        const builder = new SpaceEnvelopeMeshBuilder(new THREE.Group());
        const geo = (builder as unknown as {
            _faceGeometry(p: unknown, f: unknown): THREE.BufferGeometry | null;
        })._faceGeometry(
            { footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], baseOffset: 0, height: 3 },
            { kind: 'top' },
        );
        expect(geo).toBeNull();
    });
});
