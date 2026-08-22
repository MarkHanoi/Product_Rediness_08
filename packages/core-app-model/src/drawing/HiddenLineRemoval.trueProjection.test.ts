/**
 * §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6010..L-6019)
 *
 * Founder, 2026-08-22, verbatim:
 *   *"i expanded the crop view (this works correctly) and then all of the sudden i saw many
 *    elements in hidden line — this is correct — but even the windows that should be seen in
 *    projection line — which are the **hosted windows on the main wall** in projection — are
 *    in hidden line — this is incorrect — i hope you understand the concept of **true
 *    projection**?"*
 *
 * ═══ WHAT "TRUE PROJECTION" MEANS, ENCODED ═══
 *
 * What the eye sees from the view direction is PROJECTION; what lies BEHIND a solid is HIDDEN.
 * A window hosted in the front wall is **part of the face the viewer is looking at**. It is not
 * behind that wall — it is IN it. The wall cannot be in front of its own aperture.
 *
 * ⚠ AND THE ENGINE HAD NO WAY TO KNOW THAT. `applyOcclusion` skipped only `o.uuid !== uuid` —
 * "an element never hides its own linework". A wall and the window it hosts are two different
 * uuids, so the guard did not reach: the wall's `:proj` occluder is nearer (its front face is
 * the outermost surface), the window's frame/glazing sits a few centimetres back inside the
 * reveal, `wallDepth < windowDepth - depthMargin` holds, and every hosted opening on the façade
 * demoted to the dashed `:hidden` pen. §L-5310's own family census recorded window and door as
 * "occludable by wall" with **no host exemption** — it was measured, and read as correct.
 *
 * ⭐ THE FIX IS SEMANTIC, NOT A DEPTH TWEAK. Widening `depthMargin` until the window scrapes
 * through would be a magic number that fails on the first deep reveal (§FEAT-WINDOW-REVEAL,
 * L-1920, makes the recess USER-AUTHORED — there is no safe margin). The relationship is
 * declared data: `Window.wallId` / `Door.wallId` (C15 hosted elements), carried to the drawing
 * as `userData.hostId`.
 *
 * ⛔ THE EXEMPTION IS HOST-SCOPED AND MUST STAY THAT WAY. §ELEV-FACADE-HIDES-INTERIOR (L-5300)
 * is the founder's OTHER named case — *"you would never be able to see a interior door hosted
 * on an internal partition wall … if the elevation was taken from outside"*. A blanket
 * "openings are never occluded" rule would re-open it. Case B below is that regression guard,
 * and it is the reason this file exists rather than a one-line diff.
 *
 * Coordinate convention (same as the sibling suites): drawing space x = H, z = raw vertical
 * (displayed V = -z), y unused. A south elevation maps world (x, y) -> drawing (x, -y).
 *
 * Maps C09 §4.6.5/§4.6.6 (occlusion is one engine, disposition is view intent),
 * C15 (hosted elements), C84 §host integrity.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { applyOcclusion } from './HiddenLineRemoval';

// ─── Harness — REAL solids through the REAL EdgesGeometry the projector uses ──

function makeFakeDrawing() {
    const three = new THREE.Group();
    const createdLayers = new Set<string>();
    const drawing = {
        three,
        layers: { create: (name: string) => { createdLayers.add(name); } },
        addProjectionLines: (lines: THREE.LineSegments) => { three.add(lines); },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three, createdLayers };
}

function projectSolid(geometry: THREE.BufferGeometry): number[] {
    const edges = new THREE.EdgesGeometry(geometry, 1);
    const p = edges.getAttribute('position') as THREE.BufferAttribute;
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) out.push(p.getX(i), 0, -p.getY(i));
    return out;
}

function boxSolid(
    w: number, h: number, d: number, cx: number, cy: number, cz: number,
): { geometry: THREE.BufferGeometry; depth: number } {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);
    g.computeBoundingBox();
    return { geometry: g, depth: -(g.boundingBox!.max.z) };
}

/** A box solid rotated about the vertical — the case that degrades to the vertical-span hull. */
function obliqueBoxSolid(
    w: number, h: number, d: number, cx: number, cy: number, cz: number, yawDeg: number,
): { geometry: THREE.BufferGeometry; depth: number } {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY((yawDeg * Math.PI) / 180);
    g.translate(cx, cy, cz);
    g.computeBoundingBox();
    return { geometry: g, depth: -(g.boundingBox!.max.z) };
}

/**
 * A stamped `LineSegments` exactly as `EdgeProjectorService` emits one — including the
 * `hostId` stamp this lane adds for hosted openings (C15).
 */
function node(
    uuid: string, layerName: string, depth: number | undefined, pos: number[], hostId?: string,
): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = uuid;
    if (depth !== undefined) ls.userData.viewDepth = depth;
    if (hostId !== undefined) ls.userData.hostId = hostId;
    return ls;
}

function solidNode(
    uuid: string, layerName: string, s: { geometry: THREE.BufferGeometry; depth: number }, hostId?: string,
): THREE.LineSegments {
    return node(uuid, layerName, s.depth, projectSolid(s.geometry), hostId);
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

const ELEVATION: Parameters<typeof applyOcclusion>[1] = { disposition: 'demote' };

// ═══ CASE A — THE FOUNDER'S CASE ═════════════════════════════════════════════

describe('§TRUE-PROJECTION — a window hosted IN the front wall stays :proj', () => {
    /**
     * The façade: 8 m x 3 m x 0.30 m, front face at z = 0, viewer at +Z looking along -Z.
     * The window: 1.4 m x 1.2 m, hosted in that wall, its glazing set back 0.10 m inside the
     * reveal (§FEAT-WINDOW-REVEAL) so its nearest depth is 0.10 — comfortably past the 0.05 m
     * co-planarity margin, which is exactly why the margin cannot be the fix.
     */
    function facadeWithHostedWindow() {
        const { drawing, three } = makeFakeDrawing();
        const facade = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);
        const window = boxSolid(1.4, 1.2, 0.08, -1.5, 1.4, -0.14);   // recessed inside the reveal
        three.add(solidNode('wall-facade', 'A-WALL:proj', facade));
        three.add(solidNode('win-1', 'A-GLAZ:proj', window, 'wall-facade'));
        return { drawing, three, facade, window };
    }

    it('THE ACCEPTANCE CASE — the hosted window is NOT demoted to :hidden', () => {
        const { drawing, three } = facadeWithHostedWindow();
        const before = segCount(find(three, 'win-1', 'A-GLAZ:proj'));
        expect(before).toBeGreaterThan(0);

        applyOcclusion(drawing, ELEVATION);

        // Its projection linework survives INTACT …
        expect(segCount(find(three, 'win-1', 'A-GLAZ:proj'))).toBe(before);
        // … and NOTHING of it was moved to the dashed hidden pen.
        expect(segCount(find(three, 'win-1', 'A-GLAZ:hidden'))).toBe(0);
    });

    it('the host is genuinely NEARER — so the exemption, not a depth accident, is what saves it', () => {
        // Guards against the test passing for the wrong reason. If the window were already the
        // nearer solid, Case A would be green with or without the fix and would prove nothing.
        const { facade, window } = facadeWithHostedWindow();
        expect(facade.depth).toBeLessThan(window.depth - 0.05);
    });

    it('the façade itself stays SOLID — occlusion must not eat the thing doing the occluding', () => {
        const { drawing, three } = facadeWithHostedWindow();
        const before = segCount(find(three, 'wall-facade', 'A-WALL:proj'));
        applyOcclusion(drawing, ELEVATION);
        expect(segCount(find(three, 'wall-facade', 'A-WALL:proj'))).toBe(before);
    });

    it('THE HULL CASE — an OBLIQUE host still does not hide its own opening', () => {
        // §HLR-VERTICAL-SPAN-DEGRADATION: a wall yawed to the picture plane canonicalises to a
        // T-junctioned edge set, even-odd is unsound over it, and the occluder degrades to the
        // vertical-span HULL — which is strictly LARGER than the solid and swallows any void
        // the silhouette would have let through. On the founder's pass 36 of 78 occluders were
        // in this state. The host exemption must hold there too, or the fix only works on the
        // walls that were never the problem.
        const { drawing, three } = makeFakeDrawing();
        const facade = obliqueBoxSolid(8, 3, 0.30, 0, 1.5, -0.15, 30);
        const window = boxSolid(1.4, 1.2, 0.08, -1.0, 1.4, -0.10);
        three.add(solidNode('wall-oblique', 'A-WALL:proj', facade));
        three.add(solidNode('win-2', 'A-GLAZ:proj', window, 'wall-oblique'));

        const before = segCount(find(three, 'win-2', 'A-GLAZ:proj'));
        const r = applyOcclusion(drawing, ELEVATION);

        expect(r.vspanFallbacks).toBeGreaterThan(0);          // the hull really is in play
        expect(segCount(find(three, 'win-2', 'A-GLAZ:proj'))).toBe(before);
        expect(segCount(find(three, 'win-2', 'A-GLAZ:hidden'))).toBe(0);
    });

    it('SYMMETRY — the hosted opening does not hide its host either', () => {
        // Both are on the face the viewer sees. Neither is behind the other. A one-way
        // exemption would leave the wall punched out around a window that projects proud of it
        // (a §FEAT-WINDOW-REVEAL projecting box does exactly that).
        const { drawing, three } = makeFakeDrawing();
        const facade = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);
        const proud = boxSolid(1.4, 1.2, 0.30, -1.5, 1.4, 0.14);   // projects OUT past the wall
        three.add(solidNode('wall-facade', 'A-WALL:proj', facade));
        three.add(solidNode('win-proud', 'A-GLAZ:proj', proud, 'wall-facade'));

        const before = segCount(find(three, 'wall-facade', 'A-WALL:proj'));
        applyOcclusion(drawing, ELEVATION);

        expect(segCount(find(three, 'wall-facade', 'A-WALL:proj'))).toBe(before);
        expect(segCount(find(three, 'wall-facade', 'A-WALL:hidden'))).toBe(0);
    });
});

// ═══ CASE B — THE REGRESSION GUARD ═══════════════════════════════════════════

describe('§ELEV-FACADE-HIDES-INTERIOR must NOT regress — the exemption is HOST-SCOPED', () => {
    it('a door hosted on an INTERIOR partition behind the façade is STILL demoted', () => {
        // The founder's earlier named case (L-5300), verbatim: *"you would never be able to see
        // a interior door hosted on an internal partition wall graphically with PROJECTION
        // lines if the elevation was taken from outside the building."* The door declares a
        // host — the PARTITION — and the façade is not it, so the façade still hides it.
        const { drawing, three } = makeFakeDrawing();
        const facade    = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);
        const partition = boxSolid(6, 3, 0.12, 0, 1.5, -4.0);
        const doorLeaf  = boxSolid(0.9, 2.1, 0.05, -1.2, 1.05, -4.0);
        three.add(solidNode('facade', 'A-WALL:proj', facade));
        three.add(solidNode('partition', 'A-WALL:proj', partition, undefined));
        three.add(solidNode('door-int', 'A-DOOR:proj', doorLeaf, 'partition'));

        applyOcclusion(drawing, ELEVATION);

        expect(segCount(find(three, 'door-int', 'A-DOOR:proj'))).toBe(0);
        expect(segCount(find(three, 'door-int', 'A-DOOR:hidden'))).toBeGreaterThan(0);
    });

    it('an UNHOSTED element in front of another is unaffected — the ordinary case is untouched', () => {
        const { drawing, three } = makeFakeDrawing();
        const facade = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);
        const behind = boxSolid(1, 1, 0.2, 0, 1.5, -3.0);
        three.add(solidNode('facade', 'A-WALL:proj', facade));
        three.add(solidNode('col-behind', 'A-COLS:proj', behind));

        applyOcclusion(drawing, ELEVATION);

        expect(segCount(find(three, 'col-behind', 'A-COLS:proj'))).toBe(0);
        expect(segCount(find(three, 'col-behind', 'A-COLS:hidden'))).toBeGreaterThan(0);
    });

    it('a SIBLING opening in the SAME host does not hide its sibling', () => {
        // Two windows in one wall are both on the visible face. Neither is behind the other,
        // and their AABBs can overlap in a bay assembly.
        const { drawing, three } = makeFakeDrawing();
        const facade = boxSolid(8, 3, 0.30, 0, 1.5, -0.15);
        const a = boxSolid(1.4, 1.2, 0.08, -1.5, 1.4, -0.10);
        const b = boxSolid(1.4, 1.2, 0.08, -1.5, 1.4, -0.20);   // deeper, same H/V footprint
        three.add(solidNode('wall-facade', 'A-WALL:proj', facade));
        three.add(solidNode('win-a', 'A-GLAZ:proj', a, 'wall-facade'));
        three.add(solidNode('win-b', 'A-GLAZ:proj', b, 'wall-facade'));

        const beforeB = segCount(find(three, 'win-b', 'A-GLAZ:proj'));
        applyOcclusion(drawing, ELEVATION);

        expect(segCount(find(three, 'win-b', 'A-GLAZ:proj'))).toBe(beforeB);
        expect(segCount(find(three, 'win-b', 'A-GLAZ:hidden'))).toBe(0);
    });
});
