/**
 * §ELEV-LINEWEIGHT-02 (L-190) + §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) —
 * OCCLUSION → the HIDDEN zone (dashed). NOT the BEYOND zone.
 *
 * Fixture reproduces the founder's South Elevation wall run:
 *   • a FAÇADE wall at the front (nearest view depth 0) — the visible silhouette; stays
 *     solid `:proj`.
 *   • a WINDOW flush in that façade (depth 0) — must remain solid/visible `:proj` (L-190
 *     Bug A ⇒ windows appear; here we prove the occlusion pass does NOT dash them away).
 *   • an interior wall SET BACK behind the façade (depth 0.5) whose linework is fully
 *     inside the façade silhouette — it is genuinely OCCLUDED, so it is demoted to the
 *     `:hidden` dashed pen.
 *
 * L-277 CHANGED THE DESTINATION, AND THAT IS THE POINT OF THIS SUITE NOW. Occluded spans
 * used to be moved to `:beyond` — the same layer the DEPTH classifier fills with everything
 * farther than ~12 m. Occlusion and distance shared one bucket and the bucket was dashed,
 * so a wall that was merely FAR drew exactly like a wall that was BEHIND something. They go
 * to `:hidden` now — the ONE zone that dashes — and `:beyond` is solid and lighter.
 *
 * The pass is driven entirely by the `userData.viewDepth` stamps EdgeProjectorService writes.
 * A drawing with no stamps has no depth-orderable projection occluder and is untouched
 * (asserted) — an unordered projection occluder could hide geometry that is actually NEARER
 * than it, so the engine refuses to guess.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { applyOcclusion } from './HiddenLineRemoval';

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

/** Build a LineSegments in drawing space (H = x, V = z), stamped like EdgeProjectorService. */
function seg(
    uuid: string,
    layerName: string,
    depth: number | undefined,
    points: Array<[number, number]>, // [x, z] pairs — consumed 2-at-a-time as segments
): THREE.LineSegments {
    const pos: number[] = [];
    for (const [x, z] of points) pos.push(x, 0, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = uuid;
    if (depth !== undefined) ls.userData.viewDepth = depth;
    return ls;
}

function countSegments(ls: THREE.LineSegments): number {
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute;
    return p ? p.count / 2 : 0;
}

function findNode(three: THREE.Object3D, uuid: string, layerName: string): THREE.LineSegments | undefined {
    let found: THREE.LineSegments | undefined;
    three.traverse((o) => {
        if (o instanceof THREE.LineSegments &&
            o.userData?.elementUUID === uuid &&
            o.userData?.layerName === layerName) {
            found = o;
        }
    });
    return found;
}

/** Extract sub-segments of a LineSegments as [[x0,z0],[x1,z1]] pairs (drawing space). */
function segmentsOf(ls: THREE.LineSegments): Array<[[number, number], [number, number]]> {
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out: Array<[[number, number], [number, number]]> = [];
    for (let i = 0; i + 1 < p.count; i += 2) {
        out.push([[p.getX(i), p.getZ(i)], [p.getX(i + 1), p.getZ(i + 1)]]);
    }
    return out;
}

/** Horizontal span [xMin,xMax] of a horizontal (constant-z) sub-segment. */
function xSpan(s: [[number, number], [number, number]]): [number, number] {
    return [Math.min(s[0][0], s[1][0]), Math.max(s[0][0], s[1][0])];
}

describe('§ELEV-LINEWEIGHT-02 / §FEAT-REVIT-LINE-TYPE-SEMANTICS — occlusion demotes to the HIDDEN zone', () => {
    it('dashes a set-back wall (moves it to :hidden) while façade + window stay solid :proj', () => {
        const { drawing, three } = makeFakeDrawing();

        // Façade wall — box outline [0,4]×[0,3], nearest depth 0 (the silhouette).
        three.add(seg('wall-facade', 'A-WALL:proj', 0.0, [
            [0, 0], [4, 0],
            [4, 0], [4, 3],
            [4, 3], [0, 3],
            [0, 3], [0, 0],
        ]));

        // Window flush in the façade — inside the silhouette, same depth 0.
        three.add(seg('win-1', 'A-GLAZ:proj', 0.0, [
            [1, 1], [2, 1],
            [2, 1], [2, 2],
        ]));

        // Interior wall set back 0.5 m behind the façade — fully inside the
        // silhouette, so it is occluded and must be dashed.
        three.add(seg('wall-setback', 'A-WALL:proj', 0.5, [
            [2, 0.5], [2, 2.5],
        ]));

        const moved = applyOcclusion(drawing, { disposition: 'demote' }).demoted;

        // One occluded segment reclassified.
        expect(moved).toBe(1);

        // Set-back wall's :proj node is now empty …
        const setbackProj = findNode(three, 'wall-setback', 'A-WALL:proj')!;
        expect(countSegments(setbackProj)).toBe(0);

        // … and its segment now lives on the dashed :hidden sibling layer (NOT :beyond — L-277).
        const setbackHidden = findNode(three, 'wall-setback', 'A-WALL:hidden');
        expect(setbackHidden).toBeDefined();
        expect(countSegments(setbackHidden!)).toBe(1);

        // Façade silhouette untouched (stays solid).
        expect(countSegments(findNode(three, 'wall-facade', 'A-WALL:proj')!)).toBe(4);

        // Window stays solid/visible — occlusion must NOT dash a flush façade opening.
        expect(countSegments(findNode(three, 'win-1', 'A-GLAZ:proj')!)).toBe(2);
        expect(findNode(three, 'win-1', 'A-GLAZ:hidden')).toBeUndefined();
    });

    // ── §ELEV-LINEWEIGHT-03 (L-196) — per-SEGMENT (partial) occlusion ──────────────
    it('splits a partially-occluded wall run: solid where visible + dashed where hidden', () => {
        const { drawing, three } = makeFakeDrawing();

        // Nearer massing occupying the LEFT half only — outline rect [0,2]×[0,3], depth 0.
        three.add(seg('massing', 'A-WALL:proj', 0.0, [
            [0, 0], [2, 0],
            [2, 0], [2, 3],
            [2, 3], [0, 3],
            [0, 3], [0, 0],
        ]));

        // Far wall run — one long horizontal edge z=1.5 from x=−1 to x=5, set back (depth 0.5).
        // Only the x∈[0,2] portion lies behind the massing; the rest is genuinely visible.
        three.add(seg('wall-run', 'A-WALL:proj', 0.5, [[-1, 1.5], [5, 1.5]]));

        const moved = applyOcclusion(drawing, { disposition: 'demote' }).demoted;
        expect(moved).toBe(1); // exactly one hidden sub-segment

        // Visible remainder stays solid :proj — TWO sub-segments split at the massing edges.
        const proj = findNode(three, 'wall-run', 'A-WALL:proj')!;
        const visible = segmentsOf(proj).map(xSpan).sort((a, b) => a[0] - b[0]);
        expect(visible.length).toBe(2);
        expect(visible[0][0]).toBeCloseTo(-1, 6);
        expect(visible[0][1]).toBeCloseTo(0, 6);   // transition at massing's left edge
        expect(visible[1][0]).toBeCloseTo(2, 6);   // transition at massing's step-back edge
        expect(visible[1][1]).toBeCloseTo(5, 6);

        // Hidden portion → dashed :hidden, exactly the covered span [0,2].
        const beyond = findNode(three, 'wall-run', 'A-WALL:hidden')!;
        const hidden = segmentsOf(beyond).map(xSpan);
        expect(hidden.length).toBe(1);
        expect(hidden[0][0]).toBeCloseTo(0, 6);
        expect(hidden[0][1]).toBeCloseTo(2, 6);
    });

    it('respects an L-shaped massing NOTCH — edge stays visible through the recess (true silhouette, not AABB)', () => {
        const { drawing, three } = makeFakeDrawing();

        // L-shaped massing, depth 0. Solid = bottom band [0,4]×[0,1.5] + left column [0,2]×[0,3];
        // the top-right recess [2,4]×[1.5,3] is EMPTY. Its AABB is the whole [0,4]×[0,3] rect —
        // a coarse-AABB test would wrongly dash geometry seen through the notch.
        three.add(seg('massing-L', 'A-WALL:proj', 0.0, [
            [0, 0], [4, 0],
            [4, 0], [4, 1.5],
            [4, 1.5], [2, 1.5],
            [2, 1.5], [2, 3],
            [2, 3], [0, 3],
            [0, 3], [0, 0],
        ]));

        // Far wall run at z=2.2 (inside the recess band) from x=−1 to x=5, depth 0.5.
        // Hidden only behind the left column [0,2]; visible left of 0 AND through the notch [2,5].
        three.add(seg('wall-run', 'A-WALL:proj', 0.5, [[-1, 2.2], [5, 2.2]]));

        const moved = applyOcclusion(drawing, { disposition: 'demote' }).demoted;
        expect(moved).toBe(1);

        const proj = findNode(three, 'wall-run', 'A-WALL:proj')!;
        const visible = segmentsOf(proj).map(xSpan).sort((a, b) => a[0] - b[0]);
        expect(visible.length).toBe(2);
        expect(visible[0][1]).toBeCloseTo(0, 6);   // hidden starts at left column edge
        // Crux: the notch strip [2,4] is VISIBLE — coarse AABB would have hidden it to x=4.
        expect(visible[1][0]).toBeCloseTo(2, 6);
        expect(visible[1][1]).toBeCloseTo(5, 6);

        const beyond = findNode(three, 'wall-run', 'A-WALL:hidden')!;
        const hidden = segmentsOf(beyond).map(xSpan);
        expect(hidden.length).toBe(1);
        expect(hidden[0][0]).toBeCloseTo(0, 6);
        expect(hidden[0][1]).toBeCloseTo(2, 6);    // NOT 4 — the notch is not occluded
    });

    it('is a no-op on drawings with no viewDepth stamps — an unorderable occluder is refused, not guessed', () => {
        const { drawing, three } = makeFakeDrawing();

        // Same geometry but NO viewDepth stamp → no depth-orderable projection occluder.
        three.add(seg('wall-facade', 'A-WALL:proj', undefined, [
            [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
        ]));
        three.add(seg('wall-setback', 'A-WALL:proj', undefined, [[2, 0.5], [2, 2.5]]));

        const moved = applyOcclusion(drawing, { disposition: 'demote' }).demoted;

        expect(moved).toBe(0);
        expect(countSegments(findNode(three, 'wall-setback', 'A-WALL:proj')!)).toBe(1);
        expect(findNode(three, 'wall-setback', 'A-WALL:hidden')).toBeUndefined();
    });
});
