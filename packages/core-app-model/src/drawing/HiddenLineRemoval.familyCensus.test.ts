/**
 * §ELEV-OCCLUSION-FAMILY-CENSUS (L-5310) — ONE ROW PER ELEMENT FAMILY, MEASURED.
 *
 * Founder: *"this should be reviewed for **every possible element**."*
 *
 * A spot fix for walls would have satisfied his screenshot and left the question open. This
 * file answers it as a CENSUS instead: for each family, does its linework **occlude**, and is
 * it **occludable**, driven through the real `applyOcclusion` with a representative solid
 * pushed through the same `EdgesGeometry` the projector uses.
 *
 * ═══ WHAT THE ENGINE ACTUALLY KEYS ON — AND WHY THE CENSUS HAS TWO HALVES ═══
 *
 * `applyOcclusion` has never heard of a wall. It keys on exactly four things:
 *
 *   1. the layer tag's ZONE suffix (`drawingZoneFromLayerName`) — `:cut` / `:proj` occlude,
 *      `:proj` / `:beyond` are occludable, and a layer with **no zone at all** is neither;
 *   2. `userData.elementUUID`  — so an element never hides its own linework;
 *   3. `userData.viewDepth`    — an unstamped `:proj` node is refused as an occluder;
 *   4. the geometry itself     — see `canonicaliseEdges` and the `OccluderTest` ladder.
 *
 * So a family's verdict is decided by **how its linework is EMITTED**, not by what it is. This
 * file measures (1) and (4) — the parts reachable from the drawing layer. The emission half
 * (which builder writes which layer, with which stamps) is measured by reading the emitters
 * and is recorded in ISSUE-LOG §L-5310, because it lives in `EdgeProjectorService` and in the
 * per-family symbol builders, not here.
 *
 * ⭐ **THE ROWS THAT MATTER ARE THE FALSE ONES.** Three families reach the drawing on a layer
 * carrying NO zone suffix, and are therefore invisible to occlusion in both directions. That
 * is not a bug in this engine — it is a fact about the emitter — and pinning it here is what
 * stops it being rediscovered as "occlusion is broken for X".
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { applyOcclusion } from './HiddenLineRemoval';

// ─── Harness ──────────────────────────────────────────────────────────────────

function makeFakeDrawing() {
    const three = new THREE.Group();
    const drawing = {
        three,
        layers: { create: () => { /* noop */ } },
        addProjectionLines: (lines: THREE.LineSegments) => { three.add(lines); },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three };
}

/** `EdgesGeometry(geo, 1°)` → south-elevation drawing space (H = x, z = −y). */
function projectSolid(geometry: THREE.BufferGeometry): number[] {
    const edges = new THREE.EdgesGeometry(geometry, 1);
    const p = edges.getAttribute('position') as THREE.BufferAttribute;
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) out.push(p.getX(i), 0, -p.getY(i));
    return out;
}

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

// ─── Representative solids, at the sizes these families really are ────────────

function box(w: number, h: number, d: number, cx = 0, cy = h / 2, cz = -d / 2): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);
    return g;
}

/** An extruded profile — the shape a roof, a stair or a shaped massing really projects as. */
function prism(points: Array<[number, number]>, depth: number): THREE.BufferGeometry {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth);
    return g;
}

/** A stepped stair profile — five treads and risers, the classic concave elevation silhouette. */
function stairProfile(): THREE.BufferGeometry {
    const pts: Array<[number, number]> = [[0, 0]];
    for (let i = 0; i < 5; i++) {
        pts.push([i * 0.28, (i + 1) * 0.18]);
        pts.push([(i + 1) * 0.28, (i + 1) * 0.18]);
    }
    pts.push([5 * 0.28, 0]);
    return prism(pts, 1.0);
}

// ─── THE CENSUS ───────────────────────────────────────────────────────────────

interface CensusRow {
    /** The architectural family, in the founder's vocabulary. */
    family: string;
    /** The layer tag its linework arrives on, as the emitter writes it. */
    layer: string;
    /** A representative solid at a realistic size, or `null` for symbol/annotation linework. */
    solid: (() => THREE.BufferGeometry) | null;
    /** Flat linework (a symbol polyline, a grid line) when `solid` is null. */
    flat?: number[];
    occludes: boolean;
    occludable: boolean;
    /** Why, when the answer is FALSE. A false row with no reason is a defect, not a census entry. */
    why?: string;
}

const CENSUS: readonly CensusRow[] = [
    // ── Zone-suffixed solid linework: occludes AND is occludable. ──
    { family: 'wall',            layer: 'A-WALL:proj', solid: () => box(8, 3, 0.30),        occludes: true, occludable: true },
    { family: 'curtain wall',    layer: 'A-WALL:proj', solid: () => box(8, 3, 0.15),        occludes: true, occludable: true },
    { family: 'slab / floor',    layer: 'A-FLOR:proj', solid: () => box(8, 0.30, 6),        occludes: true, occludable: true },
    { family: 'ceiling',         layer: 'A-CEIL:proj', solid: () => box(8, 0.10, 6),        occludes: true, occludable: true },
    { family: 'roof',            layer: 'A-ROOF:proj', solid: () => prism([[-4, 0], [4, 0], [0, 2.2]], 6), occludes: true, occludable: true },
    { family: 'column',          layer: 'A-COLS:proj', solid: () => box(0.40, 3, 0.40),     occludes: true, occludable: true },
    { family: 'beam',            layer: 'A-BEAM:proj', solid: () => box(6, 0.40, 0.30),     occludes: true, occludable: true },
    { family: 'stair',           layer: 'A-STRS:proj', solid: () => stairProfile(),          occludes: true, occludable: true },
    { family: 'handrail',        layer: 'A-STRS:proj', solid: () => box(0.05, 1.0, 0.05),   occludes: true, occludable: true },
    { family: 'door leaf',       layer: 'A-DOOR:proj', solid: () => box(0.90, 2.1, 0.05),   occludes: true, occludable: true },
    { family: 'window',          layer: 'A-GLAZ:proj', solid: () => box(1.20, 1.4, 0.10),   occludes: true, occludable: true },
    { family: 'curtain panel',   layer: 'A-GLAZ:proj', solid: () => box(1.20, 2.4, 0.05),   occludes: true, occludable: true },
    { family: 'furniture',       layer: 'A-FURN:proj', solid: () => box(1.60, 0.75, 0.80),  occludes: true, occludable: true },
    { family: 'plumbing (solid)',layer: 'A-PLMB:proj', solid: () => box(0.40, 0.80, 0.60),  occludes: true, occludable: true },
    // An element type absent from `ELEMENT_TYPE_TO_PROJECTION_LAYER` still gets a ZONE — the
    // fallback base name is pre-interned through `layerForZone` like every other. Being
    // unmapped costs it its ISO layer and its pen, NOT its place in the occlusion system.
    { family: 'unmapped native type', layer: 'projection-visible:proj', solid: () => box(2, 2, 0.3), occludes: true, occludable: true },

    // ── ZONE-LESS linework: neither, and each for a NAMED reason. ──
    {
        family: 'plumbing (elevation symbol)', layer: 'A-PLMB', solid: null,
        flat: [-0.4, 0, -0.4, 0.4, 0, -0.4, 0.4, 0, -0.4, 0.4, 0, -1.2, 0.4, 0, -1.2, -0.4, 0, -1.2, -0.4, 0, -1.2, -0.4, 0, -0.4],
        occludes: false, occludable: false,
        why: 'PlumbingElevationSymbolBuilder injects onto the FLAT `A-PLMB` (packages/geometry-plumbing/'
           + 'src/PlumbingElevationSymbolBuilder.ts:33,72) — no zone suffix. Its fixtures also carry '
           + '`skipInElevation`, so the raw solid never projects either. A WC in elevation is therefore '
           + 'outside the occlusion system in BOTH directions.',
    },
    {
        family: 'grid / annotation', layer: 'A-GRID', solid: null,
        flat: [-6, 0, -1.5, 6, 0, -1.5],
        occludes: false, occludable: false,
        why: 'A datum is not a solid and must not be hidden by one — a grid line reading as broken '
           + 'behind a wall would be a drafting error, not a fix. CORRECT as it stands.',
    },
    {
        family: 'IFC fallback linework', layer: 'projection-visible', solid: null,
        flat: [-2, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0, -2, 2, 0, -2, -2, 0, -2, -2, 0, -2, -2, 0, 0],
        occludes: false, occludable: false,
        why: 'EdgeProjectorService `addIfcLayer` (:3592) writes the flat base name with no zone '
           + 'suffix, no `elementUUID` and no `viewDepth`. An imported IFC model is invisible to '
           + 'occlusion. This one is a REAL GAP, not a convention — see ISSUE-LOG L-5311.',
    },
];

/**
 * Centre of a projected linework's own 2D extent.
 *
 * ⚠ The probe MUST be derived from the subject's geometry, not written as a literal. The first
 * cut of this file used a fixed probe at `(0, −0.30)` and reported `ceiling` and `stair` as
 * NOT OCCLUDING. Both were fixture errors, not engine findings: a 100 mm ceiling slab spans
 * drawing z ∈ [−0.10, 0] so the probe sat below it entirely, and the stair profile starts at
 * x = 0 so the probe sat exactly ON its left boundary, where an even-odd verdict is undefined.
 * A census whose FALSE rows are its own arithmetic is worse than no census.
 */
function centreOf(pos: number[]): { x: number; z: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i + 2 < pos.length; i += 3) {
        const x = pos[i], z = pos[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/** Project a solid LIFTED clear of the ground, so no edge lands on the façade's own boundary. */
function projectLifted(geo: THREE.BufferGeometry, dy: number): number[] {
    geo.translate(0, dy, 0);
    return projectSolid(geo);
}

describe('§ELEV-OCCLUSION-FAMILY-CENSUS (L-5310) — does this family OCCLUDE?', () => {
    for (const row of CENSUS) {
        it(`${row.family} (${row.layer}) — occludes: ${row.occludes}`, () => {
            const { drawing, three } = makeFakeDrawing();
            const pos = row.solid ? projectSolid(row.solid()) : row.flat!;
            // The family's own linework, at the FRONT of the view.
            three.add(node('subject', row.layer, 0, pos));
            // A probe run 9 m behind, threaded through the CENTRE of the subject's own extent.
            const c = centreOf(pos);
            three.add(node('probe', 'A-WALL:proj', 9, [c.x - 0.004, 0, c.z, c.x + 0.004, 0, c.z]));

            applyOcclusion(drawing, { disposition: 'demote' });

            const hid = segCount(find(three, 'probe', 'A-WALL:hidden')) > 0;
            expect(hid, row.why ?? 'a zone-suffixed solid must occlude').toBe(row.occludes);
        });
    }
});

describe('§ELEV-OCCLUSION-FAMILY-CENSUS (L-5310) — is this family OCCLUDABLE?', () => {
    for (const row of CENSUS) {
        it(`${row.family} (${row.layer}) — occludable: ${row.occludable}`, () => {
            const { drawing, three } = makeFakeDrawing();
            // A 20 x 12 m façade at the front — big enough to swallow every representative solid.
            three.add(node('facade', 'A-WALL:proj', 0, projectSolid(box(20, 12, 0.30))));
            // …and the subject lifted 2 m clear of the ground, so not one of its edges lies ON
            // the façade's own boundary, where an even-odd verdict is undefined by construction.
            const pos = row.solid ? projectLifted(row.solid(), 2) : row.flat!;
            three.add(node('subject', row.layer, 6, pos));

            applyOcclusion(drawing, { disposition: 'demote' });

            const survivingProj = segCount(find(three, 'subject', row.layer));
            const hidden = segCount(find(three, 'subject', row.layer.replace(/:proj$/, ':hidden')));
            expect(hidden > 0 && survivingProj === 0,
                row.why ?? 'a zone-suffixed solid must be occludable').toBe(row.occludable);
        });
    }
});

// ─── The zone-level rules the census rows inherit ─────────────────────────────

describe('§ELEV-OCCLUSION-FAMILY-CENSUS (L-5310) — the ZONE rules, which are family-blind', () => {
    it('a `:beyond` segment is NOT hidden by a projected solid — the deliberate asymmetry (C09 §4.6.5(c)1)', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('facade', 'A-WALL:proj', 0, projectSolid(box(20, 8, 0.30))));
        three.add(node('far', 'A-WALL:beyond', 14, [-2, 0, -2, 2, 0, -2]));

        applyOcclusion(drawing, { disposition: 'demote' });

        // Unchanged: `beyond` is geometry the view DELIBERATELY keeps showing, and a plan's floor
        // slab is a projected solid spanning the whole plate. Letting projected solids clip
        // `beyond` would delete the entire below-storey band the view range was set up to include.
        expect(segCount(find(three, 'far', 'A-WALL:beyond'))).toBe(1);
        expect(find(three, 'far', 'A-WALL:hidden')).toBeUndefined();
    });

    it('…but a CUT solid DOES hide a `:beyond` segment — you do not see through a poché', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('facade', 'A-WALL:cut', undefined, projectSolid(box(20, 8, 0.30))));
        three.add(node('far', 'A-WALL:beyond', 14, [-2, 0, -2, 2, 0, -2]));

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'far', 'A-WALL:beyond'))).toBe(0);
        expect(segCount(find(three, 'far', 'A-WALL:hidden'))).toBe(1);
    });

    it('a `:cut` segment is never a TARGET — it IS the poché boundary', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('facade', 'A-WALL:proj', 0, projectSolid(box(20, 8, 0.30))));
        three.add(node('sliced', 'A-COLS:cut', undefined, [-1, 0, -2, 1, 0, -2]));

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'sliced', 'A-COLS:cut'))).toBe(1);
        expect(find(three, 'sliced', 'A-COLS:hidden')).toBeUndefined();
    });

    it('an element never hides its OWN linework, however many layers it spans', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('w', 'A-WALL:proj', 0, projectSolid(box(8, 3, 0.30))));
        // Same uuid, a second layer, set back — e.g. a wall's own opening jamb linework.
        three.add(node('w', 'A-WALL-SYM:proj', 4, [-1, 0, -1, 1, 0, -1]));

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'w', 'A-WALL-SYM:proj'))).toBe(1);
        expect(find(three, 'w', 'A-WALL-SYM:hidden')).toBeUndefined();
    });

    it('an occluder FARTHER than its target never hides it — depth ordering is real', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('behind', 'A-WALL:proj', 9, projectSolid(box(20, 8, 0.30))));
        three.add(node('front', 'A-DOOR:proj', 0, [-1, 0, -1, 1, 0, -1]));

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'front', 'A-DOOR:proj'))).toBe(1);
        expect(find(three, 'front', 'A-DOOR:hidden')).toBeUndefined();
    });

    it('CO-PLANAR solids do not hide each other — the depth margin holds at 50 mm', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(node('facade', 'A-WALL:proj', 0, projectSolid(box(20, 8, 0.30))));
        // A window flush in that façade, 20 mm back — inside the margin.
        three.add(node('flush', 'A-GLAZ:proj', 0.02, [-1, 0, -1, 1, 0, -1]));

        applyOcclusion(drawing, { disposition: 'demote' });

        expect(segCount(find(three, 'flush', 'A-GLAZ:proj'))).toBe(1);
        expect(find(three, 'flush', 'A-GLAZ:hidden')).toBeUndefined();
    });
});
