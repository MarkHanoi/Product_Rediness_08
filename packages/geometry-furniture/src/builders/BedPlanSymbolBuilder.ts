/**
 * BedPlanSymbolBuilder — Contract 48 §5 (extended for beds)
 *
 * Injects a CLEAN 2D plan-view symbol for every bed into the active
 * TechnicalDrawing, after the base 3D-edge projection completes.
 *
 * Why this exists:
 *   The 3D bed builders (BedBuilder + BedEngine: platform/walnut/float/
 *   nordic/solid_wood) use box geometry, extruded shapes with bevels, and
 *   superquadric pillow ellipsoids so the 3D render reads as soft bedding.
 *   When EdgeProjectorService runs THREE.EdgesGeometry over those meshes
 *   the result in plan view is a dense scribble of mattress facets, pillow
 *   wireframes, and headboard reveals — unreadable as an architectural plan.
 *
 *   Standard architectural plan symbols for beds (per ISO 4068 / common AEC
 *   convention) are simple line diagrams: outer frame + mattress inner rect
 *   + pillow rectangles at the head + headboard line + optional nightstand
 *   boxes.
 *
 *   Therefore: every bed-part mesh tags `userData.skipInPlan = true` so
 *   EdgeProjectorService excludes it from plan projection, and this builder
 *   injects the clean 2D symbol instead.
 *
 * Mirrors the architecture of SofaPlanSymbolBuilder.
 *
 * Bed-local convention (matches BedEngine + BedBuilder):
 *   - origin on floor, centred on the bed footprint
 *   - long axis = +Z, head end at -Z, foot end at +Z
 *   - width along X
 *
 * Scope:
 *   bed (legacy), japanese_platform_bed, japanese_float_bed,
 *   japanese_walnut_bed, nordic_bed, solid_wood_bed.
 *
 * Out of scope (default behaviour preserved):
 *   kave_double_bed, kave_single_bed, kave_bunkbed (GLB imports — no
 *   skipInPlan tag, plan-view falls through to native edge projection).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData, FurnitureType } from '../FurnitureTypes';

const FURN_LAYER = 'A-FURN';

const HANDLED: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
    'bed',
    'japanese_platform_bed',
    'japanese_float_bed',
    'japanese_walnut_bed',
    'nordic_bed',
    'solid_wood_bed',
]);

/** Per-variant footprint metrics used by the plan symbol. */
interface BedPlanMetrics {
    /** Frame / deck width along X (sleeping deck — the outer outline). */
    frameW: number;
    /** Frame / deck length along Z (head→foot). */
    frameL: number;
    /** Mattress inset from each side of the frame (X). */
    mattInsetX: number;
    /** Mattress inset from the head end (-Z). */
    mattInsetHead: number;
    /** Mattress inset from the foot end (+Z). */
    mattInsetFoot: number;
    /** Optional integrated nightstand width along X (each side, head end). 0 = none. */
    nightstandW: number;
    /** Optional nightstand depth along Z. */
    nightstandD: number;
    /** Optional bedside-wing width along X (each side, head end). 0 = none. */
    wingW: number;
    /** Optional bedside-wing depth along Z. */
    wingL: number;
    /** Headboard total width along X (centred). */
    headboardW: number;
    /** Headboard thickness along Z (drawn just behind the frame head edge). */
    headboardT: number;
}

export class BedPlanSymbolBuilder {
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

        let injected = 0;

        for (const bed of furnitureStore.getAll()) {
            if (!HANDLED.has(bed.furnitureType)) continue;
            if (bed.levelId !== levelId) continue;

            const positions = this._buildLocalLinework(bed);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );

            // Apply bed's world transform (Y irrelevant for plan flatten).
            if (bed.position) {
                lineSegments.position.set(
                    bed.position.x,
                    (bed.position.y ?? 0) + (bed.baseOffset ?? 0),
                    bed.position.z,
                );
            }
            if (bed.rotation) {
                lineSegments.quaternion.setFromEuler(new THREE.Euler(
                    bed.rotation.x,
                    bed.rotation.y,
                    bed.rotation.z,
                    (bed.rotation.order || 'XYZ') as THREE.EulerOrder,
                ));
            }
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, bed.id);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[BedPlanSymbolBuilder] Injected ${injected} bed symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────────

    private _metricsFor(bed: FurnitureData): BedPlanMetrics {
        const t = bed.furnitureType;
        const W = bed.width  ?? 1.8;
        const L = bed.length ?? 2.0;

        switch (t) {
            case 'japanese_platform_bed': {
                // BedEngine.buildPlatform: deck = max(1.40,W) × max(1.80,L);
                // mattress inset 0.15 sides / 0.05 head / 0.20 foot;
                // two integrated nightstands (0.50 × 0.50) flush at sides, head end.
                const frameW = Math.max(1.40, W);
                const frameL = Math.max(1.80, L);
                return {
                    frameW, frameL,
                    mattInsetX: 0.15, mattInsetHead: 0.05, mattInsetFoot: 0.20,
                    nightstandW: 0.50, nightstandD: 0.50,
                    wingW: 0, wingL: 0,
                    headboardW: frameW + 2 * 0.50,
                    headboardT: 0.06,
                };
            }
            case 'japanese_walnut_bed': {
                // BedEngine.buildWalnut: hard-coded queen 1.60×2.10 mattress,
                // 0.25 deck overhang on every side → deck 2.10 × 2.60;
                // bedside wings 0.40 × 0.55 at head end.
                const frameW = 2.10;
                const frameL = 2.60;
                return {
                    frameW, frameL,
                    mattInsetX: 0.25, mattInsetHead: 0.25, mattInsetFoot: 0.25,
                    nightstandW: 0, nightstandD: 0,
                    wingW: 0.40, wingL: 0.55,
                    headboardW: frameW + 2 * 0.40,
                    headboardT: 0.06,
                };
            }
            case 'japanese_float_bed': {
                // BedEngine.buildFloat: hard-coded queen 1.60×2.10 mattress,
                // 0.20 overhang sides + foot, head flush → deck 2.00 × 2.30;
                // bedside wings 0.45 × 0.55 at head end.
                const frameW = 2.00;
                const frameL = 2.30;
                return {
                    frameW, frameL,
                    mattInsetX: 0.20, mattInsetHead: 0.0, mattInsetFoot: 0.20,
                    nightstandW: 0, nightstandD: 0,
                    wingW: 0.45, wingL: 0.55,
                    headboardW: frameW + 2 * 0.45,
                    headboardT: 0.06,
                };
            }
            case 'nordic_bed': {
                // BedEngine.buildNordic: queen 1.60×2.10 mattress + 0.05 rail
                // → frame 1.70 × 2.20; tall headboard slightly wider than frame.
                const frameW = 1.70;
                const frameL = 2.20;
                return {
                    frameW, frameL,
                    mattInsetX: 0.05, mattInsetHead: 0.05, mattInsetFoot: 0.05,
                    nightstandW: 0, nightstandD: 0,
                    wingW: 0, wingL: 0,
                    headboardW: frameW + 0.30,
                    headboardT: 0.05,
                };
            }
            case 'solid_wood_bed': {
                // BedEngine.buildSolidWood: parametric queen, frame ≈ mattress + rail.
                const frameW = Math.max(1.50, W);
                const frameL = Math.max(2.00, L);
                return {
                    frameW, frameL,
                    mattInsetX: 0.05, mattInsetHead: 0.05, mattInsetFoot: 0.05,
                    nightstandW: 0, nightstandD: 0,
                    wingW: 0, wingL: 0,
                    headboardW: frameW + 0.10,
                    headboardT: 0.05,
                };
            }
            case 'bed':
            default: {
                // Legacy BedBuilder: frame W × L, mattress 0.95×0.95 of frame.
                const frameW = W;
                const frameL = L;
                const inX = frameW * 0.025;
                const inZ = frameL * 0.025;
                return {
                    frameW, frameL,
                    mattInsetX: inX, mattInsetHead: inZ, mattInsetFoot: inZ,
                    nightstandW: 0, nightstandD: 0,
                    wingW: 0, wingL: 0,
                    headboardW: frameW,
                    headboardT: 0.05,
                };
            }
        }
    }

    /**
     * Builds the 2D linework for one bed in LOCAL space.
     * Origin is centred on the bed footprint; +X = width, +Z = length
     * (head at -Z, foot at +Z).  Returns flat [x,0,z, x,0,z, ...] segs.
     */
    private _buildLocalLinework(bed: FurnitureData): number[] {
        const m = this._metricsFor(bed);

        const segs: number[] = [];
        const seg = (ax: number, az: number, bx: number, bz: number): void => {
            segs.push(ax, 0, az, bx, 0, bz);
        };
        const rect = (x0: number, z0: number, x1: number, z1: number): void => {
            seg(x0, z0, x1, z0);
            seg(x1, z0, x1, z1);
            seg(x1, z1, x0, z1);
            seg(x0, z1, x0, z0);
        };

        const halfW = m.frameW / 2;
        const halfL = m.frameL / 2;
        const headZ = -halfL;
        const footZ =  halfL;

        // ── 1. Outer frame / deck outline ──────────────────────────────────
        rect(-halfW, headZ, halfW, footZ);

        // ── 2. Mattress inner rectangle (slight inset reads as the mattress) ─
        const mx0 = -halfW + m.mattInsetX;
        const mx1 =  halfW - m.mattInsetX;
        const mz0 = headZ + m.mattInsetHead;
        const mz1 = footZ - m.mattInsetFoot;
        if (mx1 - mx0 > 0.20 && mz1 - mz0 > 0.40) {
            rect(mx0, mz0, mx1, mz1);
        }

        // ── 3. Two pillow rectangles at the head end ───────────────────────
        const matW = mx1 - mx0;
        const pillowGap = 0.05;
        const pillowW = (matW - pillowGap) / 2;
        const pillowL = 0.45;
        const pillowZ0 = mz0 + 0.04;
        const pillowZ1 = pillowZ0 + pillowL;
        if (pillowW > 0.20 && pillowZ1 < mz1) {
            rect(mx0,                      pillowZ0, mx0 + pillowW, pillowZ1);
            rect(mx0 + pillowW + pillowGap, pillowZ0, mx1,           pillowZ1);
        }

        // ── 4. Diagonal "hatch" in the bottom 2/3 of mattress (duvet seam) ─
        // A single short diagonal line across the mattress foot — standard
        // AEC convention indicating the head/foot orientation of the bed.
        if (mx1 - mx0 > 0.40 && mz1 - pillowZ1 > 0.50) {
            seg(mx0, pillowZ1 + 0.05, mx1, mz1 - 0.05);
        }

        // ── 5. Headboard line (just outside the frame, at the head end) ───
        // Drawn as a thin rectangle behind the frame so it reads as a panel.
        const hbHalf = m.headboardW / 2;
        const hbZ0   = headZ - m.headboardT;
        const hbZ1   = headZ;
        rect(-hbHalf, hbZ0, hbHalf, hbZ1);

        // ── 6. Optional integrated nightstands (platform variant) ──────────
        // Platform nightstands sit OUTSIDE the deck on each side, head-end,
        // with their back face flush with the headboard line.
        if (m.nightstandW > 0 && m.nightstandD > 0) {
            const nsBackZ  = headZ;
            const nsFrontZ = nsBackZ + m.nightstandD;
            rect(-halfW - m.nightstandW, nsBackZ, -halfW, nsFrontZ);
            rect( halfW,                 nsBackZ,  halfW + m.nightstandW, nsFrontZ);
        }

        // ── 7. Optional bedside wings (walnut + float variants) ────────────
        if (m.wingW > 0 && m.wingL > 0) {
            const wBack  = headZ;
            const wFront = wBack + m.wingL;
            rect(-halfW - m.wingW, wBack, -halfW, wFront);
            rect( halfW,           wBack,  halfW + m.wingW, wFront);
        }

        return segs;
    }
}

/** Singleton — imported by EdgeProjectorService and called once per plan view. */
export const bedPlanSymbolBuilder = new BedPlanSymbolBuilder();
