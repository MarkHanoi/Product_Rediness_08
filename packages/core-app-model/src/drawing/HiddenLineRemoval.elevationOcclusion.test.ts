/**
 * §ELEV-LINEWEIGHT-02 (L-190 Bug B) — elevation occlusion → hidden/dashed.
 *
 * Fixture reproduces the founder's South Elevation wall run:
 *   • a FAÇADE wall at the front (nearest projection depth 0) — the visible
 *     silhouette; stays solid `:proj`.
 *   • a WINDOW flush in that façade (depth 0) — must remain solid/visible
 *     `:proj` (L-190 Bug A ⇒ windows appear; here we prove the occlusion pass
 *     does NOT dash them away).
 *   • an interior wall SET BACK behind the façade (depth 0.5) whose linework is
 *     fully inside the façade silhouette — must be reclassified from solid
 *     `:proj` to the light dashed `:beyond` pen (the founder's "renders solid,
 *     should be dashed" defect).
 *
 * The pass is driven entirely by the `userData.elevationDepth` stamps that
 * EdgeProjectorService writes for elevation views, so plan/section drawings —
 * which carry no such stamp — early-return untouched (asserted).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { reclassifyOccludedElevationLines } from './HiddenLineRemoval';

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
    if (depth !== undefined) ls.userData.elevationDepth = depth;
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

describe('§ELEV-LINEWEIGHT-02 — elevation occlusion reclassification', () => {
    it('dashes a set-back wall (moves it to :beyond) while façade + window stay solid :proj', () => {
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

        const moved = reclassifyOccludedElevationLines(drawing);

        // One occluded segment reclassified.
        expect(moved).toBe(1);

        // Set-back wall's :proj node is now empty …
        const setbackProj = findNode(three, 'wall-setback', 'A-WALL:proj')!;
        expect(countSegments(setbackProj)).toBe(0);

        // … and its segment now lives on the dashed :beyond sibling layer.
        const setbackBeyond = findNode(three, 'wall-setback', 'A-WALL:beyond');
        expect(setbackBeyond).toBeDefined();
        expect(countSegments(setbackBeyond!)).toBe(1);

        // Façade silhouette untouched (stays solid).
        expect(countSegments(findNode(three, 'wall-facade', 'A-WALL:proj')!)).toBe(4);

        // Window stays solid/visible — occlusion must NOT dash a flush façade opening.
        expect(countSegments(findNode(three, 'win-1', 'A-GLAZ:proj')!)).toBe(2);
        expect(findNode(three, 'win-1', 'A-GLAZ:beyond')).toBeUndefined();
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

        const moved = reclassifyOccludedElevationLines(drawing);
        expect(moved).toBe(1); // exactly one hidden sub-segment

        // Visible remainder stays solid :proj — TWO sub-segments split at the massing edges.
        const proj = findNode(three, 'wall-run', 'A-WALL:proj')!;
        const visible = segmentsOf(proj).map(xSpan).sort((a, b) => a[0] - b[0]);
        expect(visible.length).toBe(2);
        expect(visible[0][0]).toBeCloseTo(-1, 6);
        expect(visible[0][1]).toBeCloseTo(0, 6);   // transition at massing's left edge
        expect(visible[1][0]).toBeCloseTo(2, 6);   // transition at massing's step-back edge
        expect(visible[1][1]).toBeCloseTo(5, 6);

        // Hidden portion → dashed :beyond, exactly the covered span [0,2].
        const beyond = findNode(three, 'wall-run', 'A-WALL:beyond')!;
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

        const moved = reclassifyOccludedElevationLines(drawing);
        expect(moved).toBe(1);

        const proj = findNode(three, 'wall-run', 'A-WALL:proj')!;
        const visible = segmentsOf(proj).map(xSpan).sort((a, b) => a[0] - b[0]);
        expect(visible.length).toBe(2);
        expect(visible[0][1]).toBeCloseTo(0, 6);   // hidden starts at left column edge
        // Crux: the notch strip [2,4] is VISIBLE — coarse AABB would have hidden it to x=4.
        expect(visible[1][0]).toBeCloseTo(2, 6);
        expect(visible[1][1]).toBeCloseTo(5, 6);

        const beyond = findNode(three, 'wall-run', 'A-WALL:beyond')!;
        const hidden = segmentsOf(beyond).map(xSpan);
        expect(hidden.length).toBe(1);
        expect(hidden[0][0]).toBeCloseTo(0, 6);
        expect(hidden[0][1]).toBeCloseTo(2, 6);    // NOT 4 — the notch is not occluded
    });

    it('is a no-op on drawings without elevationDepth stamps (plan/section untouched)', () => {
        const { drawing, three } = makeFakeDrawing();

        // Same geometry but NO elevationDepth stamp → not an elevation drawing.
        three.add(seg('wall-facade', 'A-WALL:proj', undefined, [
            [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
        ]));
        three.add(seg('wall-setback', 'A-WALL:proj', undefined, [[2, 0.5], [2, 2.5]]));

        const moved = reclassifyOccludedElevationLines(drawing);

        expect(moved).toBe(0);
        expect(countSegments(findNode(three, 'wall-setback', 'A-WALL:proj')!)).toBe(1);
        expect(findNode(three, 'wall-setback', 'A-WALL:beyond')).toBeUndefined();
    });
});
