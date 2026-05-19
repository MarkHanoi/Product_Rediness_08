/**
 * @file TreePlanSymbolBuilder.ts
 *
 * Contract 48 §5 (extended for parametric outdoor trees).
 *
 * Injects clean 2D plan-view symbols for every parametric tree (the 25
 * Arbol T-NN species) into the active TechnicalDrawing AFTER the base 3D
 * edge projection completes.  Each species' meshes carry
 * `userData.skipInPlan = true` (set by ParametricTreeEngine) so the noisy
 * mesh-edge dump is suppressed and the architectural symbol below is the
 * only thing the plan view sees for the tree.
 *
 * Symbol design — mirrors the reference plate (Arbol T-1 … T-25):
 *   1. Ground shadow — a polygon outline offset down-left from the canopy,
 *      drawn with the same line weight (it reads as a lighter "drop" because
 *      the user perceives the offset, even though we only have one ink).
 *   2. Canopy outline — a closed polygon at the crown radius.
 *   3. Internal pattern — the per-archetype motif: radial spikes (T-1, T-6),
 *      scattered dots (T-3, T-11), concentric ring + crosshair (T-4, T-5),
 *      branchy star (T-12), star-burst needles (T-13, T-22), palm fronds
 *      (T-18, T-23), drooping streamers (T-14), flower flecks (T-9, T-21),
 *      multi-lobed blob (T-19), tall narrow ellipse (T-10, conifer column).
 *   4. Trunk dot — a small filled square at the centre.
 *
 * Mirrors the architecture of BedPlanSymbolBuilder / SofaPlanSymbolBuilder
 * (which mirrors KitchenPlanSymbolBuilder).
 *
 * Coordinate convention: tree origin is at trunk centre on the ground.
 * Linework is built in LOCAL space then transformed by the tree's
 * world-space position + rotation, projected to drawing space, and
 * registered for click selection by element id.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData } from '../FurnitureTypes';
import {
    TREE_SPECIES_TABLE,
    TreeSpeciesDef,
    isTreeSpeciesId,
} from '../TreeTypes';

const FURN_LAYER        = 'A-FURN';
const FURN_SHADOW_LAYER = 'A-FURN-SHADOW';

/**
 * Mid-grey for the offset ground-shadow outline. Reads as a softer
 * "drop" behind the canopy, matching the architectural reference plate
 * where the shadow is rendered noticeably lighter than the canopy ink.
 */
const SHADOW_LAYER_COLOR = 0xb0b0b0;

// ── Deterministic PRNG (mulberry32) — must match engine for visual parity ─

function _seedFromString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}
function _makePRNG(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Linework primitive helpers (work in plan XZ, emit as [x,0,z, x,0,z]) ─

class LineworkBuf {
    readonly segs: number[] = [];
    seg(ax: number, az: number, bx: number, bz: number): void {
        this.segs.push(ax, 0, az, bx, 0, bz);
    }
    /**
     * Wavy / lobed circle outline — N segments around (cx, cz) with a
     * sinusoidal radial perturbation reading as soft canopy edge.
     */
    bumpyCircle(
        cx: number, cz: number,
        radius: number,
        segments: number,
        bumpAmplitude: number,
        bumpFreq: number,
        phase: number = 0,
    ): void {
        let prevX = 0, prevZ = 0;
        for (let i = 0; i <= segments; i++) {
            const t  = i / segments;
            const a  = t * Math.PI * 2;
            const r  = radius + Math.sin(a * bumpFreq + phase) * bumpAmplitude;
            const x  = cx + Math.cos(a) * r;
            const z  = cz + Math.sin(a) * r;
            if (i > 0) this.seg(prevX, prevZ, x, z);
            prevX = x; prevZ = z;
        }
    }
    /** Smooth circle outline as a polyline. */
    circle(cx: number, cz: number, r: number, segments: number): void {
        let prevX = 0, prevZ = 0;
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const x = cx + Math.cos(a) * r;
            const z = cz + Math.sin(a) * r;
            if (i > 0) this.seg(prevX, prevZ, x, z);
            prevX = x; prevZ = z;
        }
    }
    /** Small filled square (tiny dot) — drawn as 4 outline edges. */
    smallDot(cx: number, cz: number, half: number): void {
        this.seg(cx - half, cz - half, cx + half, cz - half);
        this.seg(cx + half, cz - half, cx + half, cz + half);
        this.seg(cx + half, cz + half, cx - half, cz + half);
        this.seg(cx - half, cz + half, cx - half, cz - half);
    }
    /** Tiny + cross — used for scatter texture. */
    plusMark(cx: number, cz: number, half: number): void {
        this.seg(cx - half, cz, cx + half, cz);
        this.seg(cx, cz - half, cx, cz + half);
    }
    /** Short tick mark from (cx,cz) at angle a, length len. */
    tick(cx: number, cz: number, a: number, len: number): void {
        this.seg(cx, cz, cx + Math.cos(a) * len, cz + Math.sin(a) * len);
    }
}

// ── TreePlanSymbolBuilder ────────────────────────────────────────────────

export class TreePlanSymbolBuilder {

    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        const furnitureStore = (window as unknown as {
            furnitureStore?: { getAll: () => FurnitureData[] };
        }).furnitureStore;
        if (!furnitureStore) return;

        if (!drawing.layers.has(FURN_LAYER)) {
            drawing.layers.create(FURN_LAYER);
        }
        if (!drawing.layers.has(FURN_SHADOW_LAYER)) {
            drawing.layers.create(FURN_SHADOW_LAYER);
        }
        // Force the shadow layer's shared material to mid-grey every inject
        // pass — survives layer recreation and matches the architectural
        // reference where the offset shadow reads visibly lighter than ink.
        const shadowLayer = drawing.layers.get(FURN_SHADOW_LAYER);
        if (shadowLayer?.material) {
            shadowLayer.material.color.setHex(SHADOW_LAYER_COLOR);
        }

        let injected = 0;

        for (const tree of furnitureStore.getAll()) {
            if (!isTreeSpeciesId(tree.furnitureType)) continue;
            if (tree.levelId !== levelId) continue;

            const def = TREE_SPECIES_TABLE[tree.furnitureType];
            if (!def) continue;

            const linework = this._buildLocalLinework(def);
            if (linework.main.length === 0 && linework.shadow.length === 0) continue;

            // Helper — builds a positioned LineSegments for one bucket of
            // segs, applies the tree transform, and emits projected lines on
            // the requested layer.  Uses the same registerSegmentUUID id for
            // both buckets so picking on either the canopy or the shadow
            // resolves to the same FurnitureData record.
            const emit = (segs: number[], layer: string): void => {
                if (segs.length === 0) return;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
                const lineSegments = new THREE.LineSegments(
                    geo,
                    new THREE.LineBasicMaterial({ color: 0x000000 }),
                );
                if (tree.position) {
                    lineSegments.position.set(
                        tree.position.x,
                        (tree.position.y ?? 0) + (tree.baseOffset ?? 0),
                        tree.position.z,
                    );
                }
                if (tree.rotation) {
                    lineSegments.quaternion.setFromEuler(new THREE.Euler(
                        tree.rotation.x,
                        tree.rotation.y,
                        tree.rotation.z,
                        (tree.rotation.order || 'XYZ') as THREE.EulerOrder,
                    ));
                }
                lineSegments.updateWorldMatrix(true, false);
                const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
                drawing.addProjectionLines(projected, layer);
                registerSegmentUUID(drawing, projected, tree.id);
            };

            // Emit shadow first so the canopy ink visually overlays it.
            emit(linework.shadow, FURN_SHADOW_LAYER);
            emit(linework.main,   FURN_LAYER);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[TreePlanSymbolBuilder] Injected ${injected} tree symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Per-archetype linework ────────────────────────────────────────────

    /**
     * Returns two separate linework buckets per species:
     *  - `shadow` — the offset ground-shadow outline, drawn on the
     *    `A-FURN-SHADOW` layer in mid-grey so it reads as a soft drop.
     *  - `main`   — the bumpy canopy outline + per-archetype interior
     *    pattern + central trunk dot, drawn in black on `A-FURN`.
     */
    private _buildLocalLinework(def: TreeSpeciesDef): {
        shadow: number[];
        main:   number[];
    } {
        const shadow = new LineworkBuf();
        const main   = new LineworkBuf();
        const r      = def.crownRadius;

        // Ground shadow — offset outline (down-left), slightly larger than
        // the canopy.  Lives on its own grey layer so it visibly differs
        // from the canopy ink (matches the architectural reference plate).
        const shOff = r * 0.18;
        shadow.bumpyCircle(-shOff, shOff, r * 1.05, 48, r * 0.04, 7);

        // Canopy + per-archetype interior — black ink layer.
        switch (def.archetype) {
            case 'round_dense':       this._drawRoundDense(main, def);       break;
            case 'round_open':        this._drawRoundOpen(main, def);        break;
            case 'round_dotted':      this._drawRoundDotted(main, def);      break;
            case 'topiary':           this._drawTopiary(main, def);          break;
            case 'branchy':           this._drawBranchy(main, def);          break;
            case 'conifer_columnar':  this._drawConiferColumnar(main, def);  break;
            case 'conifer_pyramid':   this._drawConiferPyramid(main, def);   break;
            case 'conifer_starburst': this._drawConiferStarburst(main, def); break;
            case 'palm':              this._drawPalm(main, def);             break;
            case 'willow':            this._drawWillow(main, def);           break;
            case 'flowering':         this._drawFlowering(main, def);        break;
            case 'multi_lobed':       this._drawMultiLobed(main, def);       break;
        }

        // Trunk indicator — small filled square at centre.
        main.smallDot(0, 0, Math.max(0.04, def.trunkRadius * 0.6));

        return { shadow: shadow.segs, main: main.segs };
    }

    // ── Per-archetype symbol drawers ──────────────────────────────────────

    private _drawRoundDense(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        // Bumpy canopy outline
        buf.bumpyCircle(0, 0, r, 64, r * 0.05, 9);
        // Radial branch spikes from centre to ~80% of crown
        const N = Math.round(14 * (def.density ?? 1));
        const rng = _makePRNG(_seedFromString(def.id + ':spikes'));
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2 + rng() * 0.25;
            const len = r * (0.55 + rng() * 0.35);
            buf.tick(0, 0, a, len);
        }
    }

    private _drawRoundOpen(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        // Light ragged outline (more bumps, smaller amplitude)
        buf.bumpyCircle(0, 0, r, 80, r * 0.07, 13);
        // Scattered open dots
        const rng = _makePRNG(_seedFromString(def.id + ':dots'));
        const N   = Math.round(32 * (def.density ?? 1));
        for (let i = 0; i < N; i++) {
            const a = rng() * Math.PI * 2;
            const rr = r * (0.15 + rng() * 0.85);
            buf.smallDot(Math.cos(a) * rr, Math.sin(a) * rr, 0.04);
        }
        // A few thin radial branches
        for (let i = 0; i < 5; i++) {
            const a = rng() * Math.PI * 2;
            buf.tick(0, 0, a, r * (0.4 + rng() * 0.4));
        }
    }

    private _drawRoundDotted(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.bumpyCircle(0, 0, r, 80, r * 0.04, 6);
        // Uniform dot grid clipped to circle
        const step = Math.max(0.18, r * 0.10);
        const half = Math.ceil(r / step);
        for (let i = -half; i <= half; i++) {
            for (let j = -half; j <= half; j++) {
                const x = i * step + (j % 2 === 0 ? 0 : step * 0.5);
                const z = j * step;
                if (x * x + z * z < r * r * 0.95) {
                    buf.smallDot(x, z, 0.03);
                }
            }
        }
        // Centre cross
        buf.plusMark(0, 0, r * 0.10);
    }

    private _drawTopiary(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.circle(0, 0, r, 64);
        buf.circle(0, 0, r * 0.70, 56);
        buf.circle(0, 0, r * 0.40, 40);
        // Crosshairs
        buf.seg(-r, 0, r, 0);
        buf.seg(0, -r, 0, r);
        // 8-point star ticks at outer ring
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            buf.tick(Math.cos(a) * r * 0.70, Math.sin(a) * r * 0.70, a, r * 0.30);
        }
    }

    private _drawBranchy(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.bumpyCircle(0, 0, r, 70, r * 0.05, 11);
        // Main branches: a 5-arm star with sub-branches
        const rng = _makePRNG(_seedFromString(def.id + ':branchy'));
        const main = 5;
        for (let i = 0; i < main; i++) {
            const a   = (i / main) * Math.PI * 2 + rng() * 0.3;
            const tx  = Math.cos(a) * r * 0.85;
            const tz  = Math.sin(a) * r * 0.85;
            buf.seg(0, 0, tx, tz);
            // Two sub-branches near the tip
            const subOff = 0.4;
            const sx = Math.cos(a) * r * 0.55;
            const sz = Math.sin(a) * r * 0.55;
            buf.seg(sx, sz, sx + Math.cos(a + subOff) * r * 0.30, sz + Math.sin(a + subOff) * r * 0.30);
            buf.seg(sx, sz, sx + Math.cos(a - subOff) * r * 0.30, sz + Math.sin(a - subOff) * r * 0.30);
        }
        // Light dot texture
        for (let i = 0; i < 18; i++) {
            const a  = rng() * Math.PI * 2;
            const rr = r * (0.3 + rng() * 0.65);
            buf.smallDot(Math.cos(a) * rr, Math.sin(a) * rr, 0.03);
        }
    }

    private _drawConiferColumnar(buf: LineworkBuf, def: TreeSpeciesDef): void {
        // Narrow tall ellipse — crownRadius is the small axis; long axis along Z.
        const rx = def.crownRadius;
        const rz = def.crownRadius * 2.4;
        const N  = 64;
        let prevX = 0, prevZ = 0;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const a = t * Math.PI * 2;
            // Slight bumps for a foliage feel
            const er = 1 + Math.sin(a * 14) * 0.03;
            const x = Math.cos(a) * rx * er;
            const z = Math.sin(a) * rz * er;
            if (i > 0) buf.seg(prevX, prevZ, x, z);
            prevX = x; prevZ = z;
        }
        // Vertical centre line + horizontal ticks suggesting tiered foliage
        buf.seg(0, -rz * 0.9, 0, rz * 0.9);
        for (let i = 0; i < 6; i++) {
            const z = -rz * 0.7 + (i / 5) * rz * 1.4;
            buf.seg(-rx * 0.5, z, rx * 0.5, z);
        }
    }

    private _drawConiferPyramid(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.circle(0, 0, r, 48);
        // Inner pyramid suggested by 4-arm radial
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            buf.tick(0, 0, a, r * 0.85);
        }
        // Concentric inner circle
        buf.circle(0, 0, r * 0.45, 32);
    }

    private _drawConiferStarburst(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        // Light outer outline
        buf.bumpyCircle(0, 0, r, 64, r * 0.04, 9);
        // Many radial needle ticks — pine star
        const N = 60;
        const rng = _makePRNG(_seedFromString(def.id + ':needles'));
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.06;
            const r0  = r * (0.10 + rng() * 0.10);
            const r1  = r * (0.85 + rng() * 0.15);
            buf.seg(Math.cos(a) * r0, Math.sin(a) * r0,
                    Math.cos(a) * r1, Math.sin(a) * r1);
        }
        // Small inner ring
        buf.circle(0, 0, r * 0.12, 18);
    }

    private _drawPalm(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        // Big fronds — 9 long radial ellipses suggested by line + tip-arc
        const N = 9;
        const rng = _makePRNG(_seedFromString(def.id + ':fronds'));
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2 + rng() * 0.15;
            const tx = Math.cos(a) * r;
            const tz = Math.sin(a) * r;
            // Frond spine
            buf.seg(0, 0, tx, tz);
            // Side leaflets along the spine
            const perp = a + Math.PI / 2;
            for (let k = 1; k <= 4; k++) {
                const t  = k / 4 * 0.85;
                const px = Math.cos(a) * r * t;
                const pz = Math.sin(a) * r * t;
                const ll = r * 0.10 * (1 - t * 0.4);
                buf.seg(px, pz, px + Math.cos(perp) * ll, pz + Math.sin(perp) * ll);
                buf.seg(px, pz, px - Math.cos(perp) * ll, pz - Math.sin(perp) * ll);
            }
        }
        // Inner crown ring
        buf.circle(0, 0, r * 0.14, 16);
    }

    private _drawWillow(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.bumpyCircle(0, 0, r, 80, r * 0.06, 9);
        // Drooping streamers as elongated leaf shapes around the perimeter
        const rng = _makePRNG(_seedFromString(def.id + ':drape'));
        const N   = 26;
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2;
            const len = r * (0.18 + rng() * 0.14);
            const cx  = Math.cos(a) * r * 0.85;
            const cz  = Math.sin(a) * r * 0.85;
            // Leaf-shape: small narrow ellipse oriented radially
            const ax = Math.cos(a) * len;
            const az = Math.sin(a) * len;
            const bx = -Math.sin(a) * len * 0.25;
            const bz =  Math.cos(a) * len * 0.25;
            // Quad outline
            buf.seg(cx - ax, cz - az, cx + bx, cz + bz);
            buf.seg(cx + bx, cz + bz, cx + ax, cz + az);
            buf.seg(cx + ax, cz + az, cx - bx, cz - bz);
            buf.seg(cx - bx, cz - bz, cx - ax, cz - az);
        }
    }

    private _drawFlowering(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        buf.bumpyCircle(0, 0, r, 70, r * 0.05, 9);
        const rng = _makePRNG(_seedFromString(def.id + ':flowers'));
        // Branch armature (faint)
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + rng() * 0.3;
            buf.tick(0, 0, a, r * 0.75);
        }
        // Flower flecks — small clusters of 3-dot triangles
        const C = 18;
        for (let i = 0; i < C; i++) {
            const a   = rng() * Math.PI * 2;
            const rr  = r * (0.25 + rng() * 0.7);
            const cx  = Math.cos(a) * rr;
            const cz  = Math.sin(a) * rr;
            buf.smallDot(cx, cz, 0.05);
            buf.smallDot(cx + 0.08, cz + 0.06, 0.04);
            buf.smallDot(cx - 0.08, cz + 0.06, 0.04);
        }
    }

    private _drawMultiLobed(buf: LineworkBuf, def: TreeSpeciesDef): void {
        const r = def.crownRadius;
        // Three overlapping bumpy circles forming a lobed outline
        buf.bumpyCircle(-r * 0.40, -r * 0.10, r * 0.65, 56, r * 0.04, 7, 0.5);
        buf.bumpyCircle( r * 0.40,  r * 0.10, r * 0.65, 56, r * 0.04, 7, 1.2);
        buf.bumpyCircle( 0,         r * 0.45, r * 0.55, 50, r * 0.04, 7, 2.1);
        buf.bumpyCircle( 0,        -r * 0.45, r * 0.50, 50, r * 0.04, 7, 0.0);
        // Light interior dots
        const rng = _makePRNG(_seedFromString(def.id + ':lobes'));
        for (let i = 0; i < 22; i++) {
            const a  = rng() * Math.PI * 2;
            const rr = r * (0.1 + rng() * 0.8);
            buf.smallDot(Math.cos(a) * rr, Math.sin(a) * rr, 0.03);
        }
    }
}

/** Singleton — imported by EdgeProjectorService and called once per plan view. */
export const treePlanSymbolBuilder = new TreePlanSymbolBuilder();

