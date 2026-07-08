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
