/**
 * §ELEV-FACADE-HIDES-INTERIOR (L-5300) — THE FOUNDER'S NAMED ACCEPTANCE CASE.
 *
 * Founder, verbatim: *"if the elevation is facing a wall, whatever seats behind the wall is
 * with hidden lines (light grey dash by default) … you would never be able to see a interior
 * door hosted on an internal partition wall graphically with PROJECTION lines if the elevation
 * was taken from outside the building, although this is happening today."*
 *
 * ═══ WHY THIS SUITE EXISTS BESIDE `HiddenLineRemoval.elevationOcclusion.test.ts` ═══
 *
 * That suite passes. It has always passed. **And the behaviour it guards has never worked in a
 * real elevation** — which makes it the more interesting artefact of the two.
 *
 * Its fixtures hand-author each occluder as a SINGLE CLOSED RECTANGLE, four edges, traced once:
 *
 *     seg('wall-facade', 'A-WALL:proj', 0.0, [[0,0],[4,0], [4,0],[4,3], [4,3],[0,3], [0,3],[0,0]])
 *
 * **`EdgeProjectorService` does not produce that.** It produces
 * `new THREE.EdgesGeometry(mesh.geometry, angleDeg)` — the solid's full WIREFRAME — and then
 * flattens it to 2D. For a wall box seen face-on in an elevation, the twelve wireframe edges
 * project to FOUR ZERO-LENGTH EDGES (the depth edges, which collapse to points) plus the
 * rectangle outline **TRACED TWICE** — once by the front face, once by the back face, exactly
 * coincident. Even-odd point-in-polygon over a doubled boundary counts TWO crossings for every
 * ONE real transition, reads EVEN, and answers **OUTSIDE for every interior point**.
 *
 * So the façade registers as an occluder, is depth-ordered correctly, is selected as "nearer",
 * reaches `splitSegmentByOccluders()` — and then hides nothing at all. That is the founder's
 * report, and it is invisible to a fixture that hand-draws a clean rectangle.
 *
 * ⭐ **THEREFORE EVERY OCCLUDER IN THIS FILE IS BUILT FROM A REAL `THREE` SOLID** and projected
 * through the same `EdgesGeometry` the projector uses. The fixture is allowed to be inconvenient;
 * that is the whole point of it.
 *
 * ═══ WHAT THIS PINS (C09 §4.6.5 / §4.6.6) ═══
 *
 *   1. a face-on solid wall OCCLUDES  — the named door case;
 *   2. the façade itself stays SOLID `:proj` — occlusion must not eat the thing doing the occluding;
 *   3. a real VOID in that wall (a window opening cut through it) still reads as see-through;
 *   4. an L-shaped solid's notch still reads as see-through (no coarse-AABB over-claim);
 *   5. a solid OBLIQUE to the picture plane cannot produce a sound even-odd silhouette and is
 *      DEGRADED to its AABB — counted and logged, never silently skipped (Contract 23 §9).
 *
 * Coordinate convention — the drawing space `applyOcclusion` consumes:
 *   x = H (horizontal),  z = raw vertical (displayed as V = −z),  y unused.
 * A south elevation therefore maps world (x, y) → drawing (x, −y).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { applyOcclusion } from './HiddenLineRemoval';
import { suppressSymbolisedElementLinework } from './OpeningElevationSymbolBuilder';

// ─── Fixture harness — REAL solids, REAL EdgesGeometry, REAL projection ───────

/** Minimal TechnicalDrawing stand-in exposing the surface the pass touches. */
function makeFakeDrawing() {
    const three = new THREE.Group();
    const createdLayers = new Set<string>();
    const drawing = {
        three,
        layers: { create: (name: string) => { createdLayers.add(name); } },
        addProjectionLines: (lines: THREE.LineSegments, _layer: string) => { three.add(lines); },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three, createdLayers };
}

/**
 * Project a world-space solid the way `EdgeProjectorService` does:
 * `EdgesGeometry(geometry, 1°)` then drop the view axis → drawing space (H = x, z = −y).
 * Returns a flat position array ready for a `LineSegments`.
 *
 * The 1° threshold is the projector's own default (`userData.edgeAngleDeg ?? 1`).
 */
function projectSolid(geometry: THREE.BufferGeometry): number[] {
    const edges = new THREE.EdgesGeometry(geometry, 1);
    const p = edges.getAttribute('position') as THREE.BufferAttribute;
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) out.push(p.getX(i), 0, -p.getY(i));
    return out;
}

/** A box solid placed in world space. Returns the geometry AND its nearest view depth. */
function boxSolid(
    w: number, h: number, d: number, cx: number, cy: number, cz: number,
): { geometry: THREE.BufferGeometry; depth: number } {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);
    g.computeBoundingBox();
    // Viewer stands at +Z looking toward −Z (a south elevation of a building laid out at z ≤ 0).
    // Nearest depth along the view direction = −(max z).
    return { geometry: g, depth: -(g.boundingBox!.max.z) };
}

/** A wall solid with a rectangular opening cut clean through it (a real void, C15). */
function walledOpeningSolid(
    halfW: number, h: number, d: number,
    hole: { x0: number; x1: number; y0: number; y1: number },
    frontZ: number,
): { geometry: THREE.BufferGeometry; depth: number } {
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0); shape.lineTo(halfW, 0); shape.lineTo(halfW, h); shape.lineTo(-halfW, h);
    shape.closePath();
    const path = new THREE.Path();
    path.moveTo(hole.x0, hole.y0); path.lineTo(hole.x1, hole.y0);
    path.lineTo(hole.x1, hole.y1); path.lineTo(hole.x0, hole.y1);
    path.closePath();
    shape.holes.push(path);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    g.translate(0, 0, frontZ - d);            // front face at z = frontZ
    g.computeBoundingBox();
    return { geometry: g, depth: -(g.boundingBox!.max.z) };
}

/** Build a stamped `LineSegments` exactly as `EdgeProjectorService` emits one. */
function node(uuid: string, layerName: string, depth: number | undefined, pos: number[]): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = uuid;
    if (depth !== undefined) ls.userData.viewDepth = depth;
    return ls;
}

/** Convenience: emit a solid as a stamped `:proj` node. */
function solidNode(
    uuid: string, layerName: string, s: { geometry: THREE.BufferGeometry; depth: number },
): THREE.LineSegments {
    return node(uuid, layerName, s.depth, projectSolid(s.geometry));
}

function find(three: THREE.Object3D, uuid: string, layerName: string): THREE.LineSegments | undefined {
    let f: THREE.LineSegments | undefined;
    three.traverse((o) => {
        if (o instanceof THREE.LineSegments &&
            o.userData?.elementUUID === uuid &&
            o.userData?.layerName === layerName) f = o;
    });
    return f;
}

function segCount(ls: THREE.LineSegments | undefined): number {
    if (!ls) return 0;
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    return p ? p.count / 2 : 0;
}

/** Horizontal spans of every sub-segment on a node, as [lo, hi] pairs. */
function xSpans(ls: THREE.LineSegments | undefined): Array<[number, number]> {
    if (!ls) return [];
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!p) return [];
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < p.count; i += 2) {
        out.push([Math.min(p.getX(i), p.getX(i + 1)), Math.max(p.getX(i), p.getX(i + 1))]);
    }
    return out;
}

// ─── The named acceptance case ────────────────────────────────────────────────

describe('§ELEV-FACADE-HIDES-INTERIOR (L-5300) — a REAL face-on wall must occlude', () => {
    /**
     * The founder's exact scenario, in metres:
     *   • FAÇADE — 8 m × 3 m × 0.3 m, front face at z = 0. The elevation looks straight at it.
     *   • PARTITION — an internal 0.12 m partition 4 m inside the building.
     *   • DOOR — a 0.9 m × 2.1 m leaf hosted in that partition.
     * Every one of the door's edges lies inside the façade's projected rectangle.
     */
    function buildFounderScene() {
        const { drawing, three, createdLayers } = makeFakeDrawing();
        const facade    = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);      // front face z = 0
        const partition = boxSolid(6, 3, 0.12, 0, 1.5, -4.0);
        const doorLeaf  = boxSolid(0.9, 2.1, 0.05, -1.2, 1.05, -4.0);
        three.add(solidNode('facade',    'A-WALL:proj', facade));
        three.add(solidNode('partition', 'A-WALL:proj', partition));
        three.add(solidNode('door',      'A-DOOR:proj', doorLeaf));
        return { drawing, three, createdLayers };
    }

    it('⭐ an interior door behind the façade is NOT drawn with projection lines', () => {
        const { drawing, three } = buildFounderScene();

        const doorProjBefore = segCount(find(three, 'door', 'A-DOOR:proj'));
        expect(doorProjBefore).toBeGreaterThan(0);   // the fixture really does draw the door

        const r = applyOcclusion(drawing, { disposition: 'demote' });

        // The façade must have been REGISTERED as an occluder…
        expect(r.occluders).toBeGreaterThanOrEqual(3);
        // …and it must have actually HIDDEN something.
        expect(r.demoted).toBeGreaterThan(0);

        // THE INVARIANT: no edge of the door survives on the PROJECTION layer.
        expect(segCount(find(three, 'door', 'A-DOOR:proj'))).toBe(0);
        // …every one of them is on the dashed HIDDEN sibling instead.
        expect(segCount(find(three, 'door', 'A-DOOR:hidden'))).toBe(doorProjBefore);
    });

    it('the interior PARTITION behind the façade is hidden too — the rule is per-solid, not per-family', () => {
        const { drawing, three } = buildFounderScene();
        const partitionBefore = segCount(find(three, 'partition', 'A-WALL:proj'));
        applyOcclusion(drawing, { disposition: 'demote' });
        // The partition is fully inside the 8 m façade in projection ⇒ fully hidden.
        expect(segCount(find(three, 'partition', 'A-WALL:hidden'))).toBeGreaterThan(0);
        expect(segCount(find(three, 'partition', 'A-WALL:proj'))).toBeLessThan(partitionBefore);
    });

    it('the FAÇADE itself stays solid :proj — occlusion must not eat the occluder', () => {
        const { drawing, three } = buildFounderScene();
        const before = segCount(find(three, 'facade', 'A-WALL:proj'));
        applyOcclusion(drawing, { disposition: 'demote' });
        expect(segCount(find(three, 'facade', 'A-WALL:proj'))).toBe(before);
        expect(find(three, 'facade', 'A-WALL:hidden')).toBeUndefined();
    });

    it('disposition remove DELETES the same spans instead of dashing them (section convention)', () => {
        const { drawing, three } = buildFounderScene();
        const r = applyOcclusion(drawing, { disposition: 'remove' });
        expect(r.clipped).toBeGreaterThan(0);
        expect(segCount(find(three, 'door', 'A-DOOR:proj'))).toBe(0);
        expect(find(three, 'door', 'A-DOOR:hidden')).toBeUndefined();
    });
});

// ─── Voids, notches and the honest degradation ────────────────────────────────

describe('§ELEV-FACADE-HIDES-INTERIOR (L-5301) — voids stay see-through, obliques degrade honestly', () => {
    it('a real window opening cut through the façade lets the geometry behind it stay :proj', () => {
        const { drawing, three } = makeFakeDrawing();
        // Façade 8 × 3 × 0.3 with a 2 m × 1 m opening at x ∈ [−1,1], y ∈ [1,2].
        const facade = walledOpeningSolid(4, 3, 0.3, { x0: -1, x1: 1, y0: 1, y1: 2 }, 0);
        three.add(solidNode('facade', 'A-WALL:proj', facade));

        // A horizontal run 4 m behind at y = 1.5 → drawing z = −1.5, spanning the whole façade.
        // Only the x ∈ [−1,1] part is seen THROUGH the opening and must stay solid.
        three.add(node('run', 'A-WALL:proj', 4.0, [-5, 0, -1.5, 5, 0, -1.5]));

        applyOcclusion(drawing, { disposition: 'demote' });

        const visible = xSpans(find(three, 'run', 'A-WALL:proj'));
        const sawOpeningSpan = visible.some(([lo, hi]) => lo > -1.01 && hi < 1.01 && hi - lo > 1.5);
        expect(sawOpeningSpan).toBe(true);
        // …and the parts outside the opening must be hidden.
        expect(segCount(find(three, 'run', 'A-WALL:hidden'))).toBeGreaterThan(0);
    });

    it('an L-shaped solid does NOT over-claim its notch (no coarse-AABB fallback for it)', () => {
        const { drawing, three } = makeFakeDrawing();
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(4, 0); shape.lineTo(4, 1.5);
        shape.lineTo(2, 1.5); shape.lineTo(2, 3); shape.lineTo(0, 3); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
        g.translate(0, 0, -0.3);
        three.add(node('massing', 'A-WALL:proj', 0, projectSolid(g)));

        // A run at y = 2.2 (drawing z = −2.2) crossing the notch band.
        three.add(node('run', 'A-WALL:proj', 4.0, [-1, 0, -2.2, 5, 0, -2.2]));

        const r = applyOcclusion(drawing, { disposition: 'demote' });
        expect(r.aabbFallbacks).toBe(0);            // a genuine silhouette, not a box

        const visible = xSpans(find(three, 'run', 'A-WALL:proj'));
        // Visible through the recess: a span that starts at the column edge (x=2) and runs right.
        expect(visible.some(([lo, hi]) => lo > 1.99 && hi > 4.5)).toBe(true);
        expect(segCount(find(three, 'run', 'A-WALL:hidden'))).toBeGreaterThan(0);
    });

    /**
     * ⚠ **This assertion was written against `aabbFallbacks` and CHANGED, in this lane, once the
     * measurement came back.** The oblique box's canonical edge set has 12 edges and 8 degree-3
     * vertices: it is not too small to bound a region (the AABB rung's condition), it is not a
     * union of closed curves. Those are different failures and they deserve different rungs, so
     * the fix degrades to the strictly-tighter VERTICAL-SPAN hull and counts it separately. The
     * test now asserts the rung the engine actually uses. Recorded rather than quietly rewritten
     * — the original expectation is above it in the commit history for this file.
     */
    it('a solid OBLIQUE to the picture plane still occludes — by an explicitly COUNTED vertical-span degradation', () => {
        const { drawing, three } = makeFakeDrawing();
        const g = new THREE.BoxGeometry(6, 3, 0.3);
        g.translate(0, 1.5, -0.15);
        g.rotateY(Math.PI / 6);                       // 30° to the picture plane
        g.computeBoundingBox();
        three.add(node('oblique', 'A-WALL:proj', -(g.boundingBox!.max.z), projectSolid(g)));

        // A run 4 m behind, wholly inside the oblique wall's projected extent.
        three.add(node('run', 'A-WALL:proj', 4.0, [-1, 0, -1.5, 1, 0, -1.5]));

        const r = applyOcclusion(drawing, { disposition: 'demote' });
        // The engine MUST say out loud that it could not build a sound silhouette here…
        expect(r.vspanFallbacks).toBeGreaterThanOrEqual(1);
        // …and it must NOT have taken the coarser rung when a tighter one applies.
        expect(r.aabbFallbacks).toBe(0);
        // …and it must still hide, not silently skip — which is what HEAD did.
        expect(segCount(find(three, 'run', 'A-WALL:hidden'))).toBeGreaterThan(0);
        expect(segCount(find(three, 'run', 'A-WALL:proj'))).toBe(0);
    });
});

// ─── The SECOND root cause: a symbolised wall stops being an occluder ─────────

describe('§ELEV-SYMBOL-KEEPS-THE-DEPTH (L-5303) — an authored wall symbol must inherit the solid it replaces', () => {
    /**
     * §ELEV-SYMBOL-WALL (L-1242) replaces a wall's raw elevation wireframe with an AUTHORED
     * symbol on `A-WALL-SYM:proj`, then `suppressSymbolisedElementLinework()` deletes the raw
     * linework. `OpeningElevationSymbolBuilder._emit()` stamps `layerName` and `elementUUID`
     * on the symbol — and **not** `viewDepth`.
     *
     * `buildOccluderList()` refuses an unstamped `:proj` node as an occluder, deliberately and
     * correctly: an unordered projection occluder could hide geometry that is actually NEARER
     * than it. So the façade's SOLID occluder is deleted and its replacement cannot become one.
     * **A symbolised façade wall occludes nothing** — a second, independent cause of the
     * founder's report, and one the silhouette fix alone does not touch.
     *
     * The builder's own header records this as *"NOT MEASURED — the occlusion consequence"*
     * and reasons that *"the host WALL's occluder is untouched"*. That mitigation is real for
     * an OPENING symbol. It does not hold for a WALL symbol, where the host IS the thing whose
     * linework was just deleted.
     */
    function symbolisedFacadeScene() {
        const { drawing, three } = makeFakeDrawing();
        const facade = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);

        // The wall's RAW solid linework, as the projector emits it.
        three.add(solidNode('facade', 'A-WALL:proj', facade));
        // The AUTHORED symbol that replaces it: same uuid, zone-suffixed layer, NO depth stamp.
        three.add(node('facade', 'A-WALL-SYM:proj', undefined, [
            -4, 0, 0, 4, 0, 0,
            4, 0, 0, 4, 0, -3,
            4, 0, -3, -4, 0, -3,
            -4, 0, -3, -4, 0, 0,
        ]));
        // An interior door 4 m behind, wholly inside the façade.
        three.add(solidNode('door', 'A-DOOR:proj', boxSolid(0.9, 2.1, 0.05, -1.2, 1.05, -4.0)));
        return { drawing, three };
    }

    it('⭐ the door stays hidden after the façade wall is replaced by its symbol', () => {
        const { drawing, three } = symbolisedFacadeScene();
        const doorBefore = segCount(find(three, 'door', 'A-DOOR:proj'));

        suppressSymbolisedElementLinework(drawing, new Set(['facade']));
        // The raw solid is gone; only the symbol remains for that element.
        expect(find(three, 'facade', 'A-WALL:proj')).toBeUndefined();
        expect(find(three, 'facade', 'A-WALL-SYM:proj')).toBeDefined();

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'door', 'A-DOOR:proj'))).toBe(0);
        expect(segCount(find(three, 'door', 'A-DOOR:hidden'))).toBe(doorBefore);
    });

    it('the transferred stamp is the SOLID nearest depth, not a guess', () => {
        const { drawing, three } = symbolisedFacadeScene();
        const solidDepth = find(three, 'facade', 'A-WALL:proj')!.userData.viewDepth as number;
        suppressSymbolisedElementLinework(drawing, new Set(['facade']));
        expect(find(three, 'facade', 'A-WALL-SYM:proj')!.userData.viewDepth).toBe(solidDepth);
    });

    it('a symbol whose element had NO stamp stays unstamped — the engine still refuses to guess', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('x', 'A-WALL:proj', undefined, [0, 0, 0, 4, 0, 0, 4, 0, 0, 4, 0, -3]));
        three.add(node('x', 'A-WALL-SYM:proj', undefined, [0, 0, 0, 4, 0, 0]));
        suppressSymbolisedElementLinework(drawing, new Set(['x']));
        expect(find(three, 'x', 'A-WALL-SYM:proj')!.userData.viewDepth).toBeUndefined();
    });
});
