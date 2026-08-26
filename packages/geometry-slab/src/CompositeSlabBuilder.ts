/**
 * CompositeSlabBuilder — geometry for an ARTICULATED slab layer.
 *
 * §SLABTYPES117 (founder, 2026-08-26): *"a GLASS STRUCTURAL slab with METAL BEAMS in a
 * different colour"*. A plain slab layer is a solid poché the outline's thickness deep.
 * Two of the founder's rows are not that:
 *
 *   · `beam-grid`      — a grid of beams (or one-way joists) at a CONSTANT beam size,
 *                        with the COUNT derived from the span, a perimeter ring beam and
 *                        a trimmer around every opening. Resizing the slab adds beams; it
 *                        never fattens them (the §CARPET97 discipline).
 *   · `perimeter-band` — an annulus at the outline and around every opening only: a
 *                        brass inlay border, an opal edge strip.
 *
 * ── ONE MESH PER LAYER, ONE MATERIAL PER MESH ──────────────────────────────────
 * Every piece of one articulated layer is merged into ONE BufferGeometry (a single
 * `ExtrudeGeometry` over many shapes), so the layer costs one mesh and one draw
 * call, and — this is the part that matters for §SLAB116 — it is ONE material. The
 * restyle-in-place path swaps `mesh.material` per body mesh, and a beam grid that
 * was fifty meshes would have needed fifty swaps and a bespoke count rule. The
 * glass+beam row is therefore exactly two meshes: the plate and the grid.
 *
 * ── PURE, DETERMINISTIC, THREE ONLY AT THE LAST STEP ──────────────────────────
 * `planArticulation` is pure arithmetic over the ring and holes (no THREE), so the
 * beam-count-vs-span table is tested without a scene. `buildArticulatedLayerGeometry`
 * turns the plan into geometry. Same inputs, same vertex order, same bytes.
 *
 * ── COORDINATES ────────────────────────────────────────────────────────────────
 * The ring is the slab's BUILD polygon in world XZ, spelled `{x, y}` with `y` the
 * world Z — the same convention `SlabFragmentBuilder.createSlabMeshWithEdges` uses,
 * so the caller positions this mesh exactly where it positions a plain layer
 * (`childOffsetX`, `yBottom`, `childOffsetZ`). Geometry Y runs 0..depth (the layer
 * band), never absolute.
 *
 * ── WHY THE Z-BEAMS ARE SPLIT AT THE X-BEAMS ──────────────────────────────────
 * Two full-length beams crossing share a coplanar top face over the crossing square,
 * and two coplanar faces z-fight. Splitting the secondary beams into the bays between
 * the primary ones makes every top face tile the grid exactly — shared edges, zero
 * overlap — at the cost of a few more boxes. Interior beams likewise stop at the
 * ring beam's INNER face rather than running under it.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { stampMetreUvs } from '@pryzm/core-app-model/material-resolver';
import { outsetPolygon } from './SlabGeometryUtils';
import type { SlabLayerArticulation } from './SlabTypes';

/** A plan point: `x` is world X, `y` is world Z (the slab ring convention). */
export interface PlanPoint { x: number; y: number }

/** An axis-aligned beam footprint in plan, in metres. */
export interface BeamBox {
    x0: number; x1: number;
    z0: number; z1: number;
    /** The direction the beam RUNS along. */
    axis: 'x' | 'z';
}

/** An annulus: the region between `outer` and `inner`. */
export interface RingBand {
    outer: PlanPoint[];
    inner: PlanPoint[] | null;   // null ⇒ the band could not be inset and covers the whole outer
}

export interface ArticulationPlan {
    kind: SlabLayerArticulation['kind'];
    beams: BeamBox[];
    bands: RingBand[];
    /** Interior beam centrelines, by the axis the beams run ALONG. */
    lines: { alongX: number[]; alongZ: number[] };
    /** Bay counts the lines were derived from (`ceil(span / maxSpacing)`, min 1). */
    bays: { x: number; z: number };
}

type Interval = [number, number];

// ─── PURE PLAN ────────────────────────────────────────────────────────────────

function signedArea2(poly: readonly PlanPoint[]): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return a;
}

function bboxOf(poly: readonly PlanPoint[]): { xMin: number; xMax: number; zMin: number; zMax: number } {
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const p of poly) {
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.y < zMin) zMin = p.y; if (p.y > zMax) zMax = p.y;
    }
    return { xMin, xMax, zMin, zMax };
}

/**
 * Inset (`amount < 0`) or outset (`amount > 0`) a ring, refusing a result that is
 * not a ring any more: fewer than three points, or an inset that flipped the
 * winding (the offset edges crossed — the polygon was narrower than 2·|amount|).
 */
function offsetRing(poly: readonly PlanPoint[], amount: number): PlanPoint[] | null {
    if (poly.length < 3) return null;
    const out = outsetPolygon(poly as PlanPoint[], amount);
    if (!out || out.length < 3) return null;
    const a0 = signedArea2(poly), a1 = signedArea2(out);
    if (a0 === 0 || Math.sign(a1) !== Math.sign(a0)) return null;
    if (amount < 0 && Math.abs(a1) >= Math.abs(a0)) return null;
    if (amount > 0 && Math.abs(a1) <= Math.abs(a0)) return null;
    return out;
}

/** The X-intervals where the horizontal line z = `z` lies INSIDE `poly` (even-odd). */
function intervalsAtZ(poly: readonly PlanPoint[], z: number): Interval[] {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        // Half-open rule: an edge counts iff exactly one endpoint is at or below z,
        // so a line through a vertex is never counted twice.
        if ((p.y <= z) !== (q.y <= z)) {
            const t = (z - p.y) / (q.y - p.y);
            xs.push(p.x + t * (q.x - p.x));
        }
    }
    xs.sort((a, b) => a - b);
    const out: Interval[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
    return out;
}

/** The Z-intervals where the vertical line x = `x` lies INSIDE `poly` (even-odd). */
function intervalsAtX(poly: readonly PlanPoint[], x: number): Interval[] {
    return intervalsAtZ(poly.map(p => ({ x: p.y, y: p.x })), x);
}

/** `ints` minus every interval in `cuts`. Both sorted-disjoint in, sorted-disjoint out. */
function subtractIntervals(ints: Interval[], cuts: Interval[]): Interval[] {
    let current = ints;
    for (const [c0, c1] of cuts) {
        const next: Interval[] = [];
        for (const [a, b] of current) {
            if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
            if (c0 > a) next.push([a, c0]);
            if (c1 < b) next.push([c1, b]);
        }
        current = next;
    }
    return current;
}

/** Interior line positions: `bays - 1` lines at equal spacing strictly inside [lo, hi]. */
function interiorLines(lo: number, hi: number, maxSpacing: number): { lines: number[]; bays: number } {
    const span = hi - lo;
    if (!(span > 0) || !(maxSpacing > 0)) return { lines: [], bays: 1 };
    // A hair of tolerance so a span that is an exact multiple does not gain a bay
    // from floating-point noise (12 / 1.2 = 10.000000000000002).
    const bays = Math.max(1, Math.ceil(span / maxSpacing - 1e-9));
    const step = span / bays;
    const lines: number[] = [];
    for (let i = 1; i < bays; i++) lines.push(lo + i * step);
    return { lines, bays };
}

/**
 * Plan an articulated layer over `ring` (the slab's build polygon) with `holes`
 * (openings). Pure and deterministic.
 */
export function planArticulation(
    ring: readonly PlanPoint[],
    holes: readonly (readonly PlanPoint[])[],
    art: SlabLayerArticulation,
): ArticulationPlan {
    const plan: ArticulationPlan = {
        kind: art.kind, beams: [], bands: [],
        lines: { alongX: [], alongZ: [] }, bays: { x: 1, z: 1 },
    };
    if (ring.length < 3) return plan;

    const width = art.kind === 'beam-grid' ? art.beamWidth : art.bandWidth;
    if (!(width > 0)) return plan;

    const validHoles = holes.filter(h => h.length >= 3);

    // ── Bands: the perimeter ring and a trimmer around every opening ──────────
    const perimeter = art.kind === 'perimeter-band' ? true : (art.perimeter ?? true);
    if (perimeter) {
        plan.bands.push({ outer: [...ring], inner: offsetRing(ring, -width) });
        for (const h of validHoles) {
            const outer = offsetRing(h, +width);
            if (outer) plan.bands.push({ outer, inner: [...h] });
        }
    }
    if (art.kind === 'perimeter-band') return plan;

    // ── Interior beams: clipped to the ring INSIDE the perimeter beam ─────────
    const innerRing = perimeter ? offsetRing(ring, -width) : [...ring];
    if (!innerRing) return plan;   // too narrow for anything but the ring beam
    const box = bboxOf(innerRing);
    // Every footprint interior beams must stay out of: the trimmer around each hole
    // (or the hole itself when there is no perimeter).
    const exclusions: PlanPoint[][] = validHoles.map(h =>
        (perimeter ? offsetRing(h, +width) : null) ?? [...h],
    );
    const half = width / 2;
    const direction = art.direction ?? 'both';

    const alongX = direction === 'z' ? { lines: [] as number[], bays: 1 } : interiorLines(box.zMin, box.zMax, art.maxSpacing);
    const alongZ = direction === 'x' ? { lines: [] as number[], bays: 1 } : interiorLines(box.xMin, box.xMax, art.maxSpacing);
    plan.lines = { alongX: alongX.lines, alongZ: alongZ.lines };
    plan.bays = { x: alongZ.bays, z: alongX.bays };

    // Beams running ALONG X sit at constant Z.
    for (const z of alongX.lines) {
        let ints = intervalsAtZ(innerRing, z);
        for (const ex of exclusions) ints = subtractIntervals(ints, intervalsAtZ(ex, z));
        for (const [x0, x1] of ints) {
            if (x1 - x0 <= width) continue;   // a sliver shorter than it is wide
            plan.beams.push({ x0, x1, z0: z - half, z1: z + half, axis: 'x' });
        }
    }
    // Beams running ALONG Z sit at constant X — split at every X-beam band.
    const xBeamBands: Interval[] = alongX.lines.map(z => [z - half, z + half]);
    for (const x of alongZ.lines) {
        let ints = intervalsAtX(innerRing, x);
        for (const ex of exclusions) ints = subtractIntervals(ints, intervalsAtX(ex, x));
        ints = subtractIntervals(ints, xBeamBands);
        for (const [z0, z1] of ints) {
            if (z1 - z0 <= width) continue;
            plan.beams.push({ x0: x - half, x1: x + half, z0, z1, axis: 'z' });
        }
    }
    return plan;
}

// ─── GEOMETRY ─────────────────────────────────────────────────────────────────

function rectShape(b: BeamBox): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(b.x0, b.z0); s.lineTo(b.x1, b.z0); s.lineTo(b.x1, b.z1); s.lineTo(b.x0, b.z1); s.closePath();
    return s;
}

function ringShape(band: RingBand): THREE.Shape {
    const s = new THREE.Shape(band.outer.map(p => new THREE.Vector2(p.x, p.y)));
    if (band.inner) s.holes.push(new THREE.Path(band.inner.map(p => new THREE.Vector2(p.x, p.y))));
    return s;
}

/**
 * ONE BufferGeometry for the whole articulated layer, `depth` metres tall with its
 * bottom at Y = 0, XZ in the ring's world coordinates, UVs in metres (stamped).
 * An empty plan yields an empty geometry, never a throw.
 */
export function buildArticulatedLayerGeometry(
    ring: readonly PlanPoint[],
    holes: readonly (readonly PlanPoint[])[],
    art: SlabLayerArticulation,
    depth: number,
): THREE.BufferGeometry {
    const plan = planArticulation(ring, holes, art);
    const shapes: THREE.Shape[] = [
        ...plan.bands.map(ringShape),
        ...plan.beams.map(rectShape),
    ];
    if (shapes.length === 0 || !(depth > 0)) {
        const empty = new THREE.BufferGeometry();
        stampMetreUvs(empty);
        return empty;
    }
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
    // Shape (x, y) with y = world Z, extruded along +Z. Rotate +90° about X so the
    // extrusion runs down -Y and the shape's y lands on world Z, then lift by `depth`
    // so the band occupies Y ∈ [0, depth] like every other slab layer.
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, depth, 0);
    // ExtrudeGeometry's cap and side UVs are the shape coordinates — metres — so the
    // master's tiling applies at real-world scale, exactly as on a plain layer.
    stampMetreUvs(geometry);
    return geometry;
}

/** The mesh for one articulated layer. Material is the caller's (one per layer). */
export function createArticulatedLayerMesh(
    ring: readonly PlanPoint[],
    holes: readonly (readonly PlanPoint[])[],
    art: SlabLayerArticulation,
    depth: number,
    material: THREE.Material,
): THREE.Mesh {
    const mesh = new THREE.Mesh(buildArticulatedLayerGeometry(ring, holes, art, depth), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Triangle count of a geometry — for budgets and reports, never for behaviour. */
export function triangleCountOf(geometry: THREE.BufferGeometry): number {
    const index = geometry.getIndex();
    if (index) return index.count / 3;
    const pos = geometry.getAttribute('position');
    return pos ? pos.count / 3 : 0;
}
