/**
 * ChairPlanSymbolBuilder — minimalist 2D plan symbol for chairs.
 *
 * Why this exists:
 *   The 3D ChairBuilder produces highly detailed meshes (curved oak posts,
 *   tufted Barcelona cushions, Cesca cantilever frames, splayed three-leg
 *   bases…). When EdgeProjectorService projects those meshes through
 *   THREE.EdgesGeometry the result in plan view is a dense scribble of
 *   stretchers, leg cross-sections, panel reveals, and tuft seams that is
 *   unreadable as an architectural plan.
 *
 *   AEC convention for chair plan symbols is the opposite: a clean rounded
 *   outline that reads as the seat footprint, plus a single soft arc that
 *   reads as the backrest, plus optional short side ticks that read as
 *   armrests for armchair types. See the user's reference image
 *   attached_assets/image_1777012389006.png.
 *
 *   Therefore: every chair-part mesh tags `userData.skipInPlan = true` (done
 *   in ChairBuilder) so EdgeProjectorService excludes it from plan
 *   projection, and this builder injects the clean 2D symbol on A-FURN
 *   instead, registered against the chair element id for selection.
 *
 * Local convention (matches every ChairBuilder.build* method):
 *   - origin is centred on the seat footprint
 *   - +X = right, -X = left  (chair width along X)
 *   - +Z = front, -Z = back  (chair length along Z)
 *
 * Scope:
 *   chair, dining_chair, chair_oak_solid, chair_oak_slim, chair_oak_curved_uph,
 *   chair_3leg_terracotta, chair_3leg_obejita_black, chair_4leg_obejita_wood,
 *   chair_barcelona_black, chair_barcelona_ottoman_black, chair_cesca_tan,
 *   chair_textile_wood_arm.
 *
 * Out of scope (ChairBuilder also routes these but they are sofas, not chairs):
 *   barcelona_sofa_1seat / 2seat / 3seat, barcelona_corner_sofa.
 *   These keep their default native edge projection until a sofa-style symbol
 *   is added.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData, FurnitureType } from '../FurnitureTypes';

const FURN_LAYER = 'A-FURN';

/** Chair types this builder owns (and that ChairBuilder tags with skipInPlan). */
export const CHAIR_PLAN_TYPES: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
    'chair',
    'dining_chair',
    'chair_oak_solid',
    'chair_oak_slim',
    'chair_oak_curved_uph',
    'chair_3leg_terracotta',
    'chair_3leg_obejita_black',
    'chair_4leg_obejita_wood',
    'chair_barcelona_black',
    'chair_barcelona_ottoman_black',
    'chair_cesca_tan',
    'chair_textile_wood_arm',
]);

/** Chair sub-style — controls which inner symbol details get drawn. */
type ChairStyle = 'armchair' | 'side-chair' | 'stool';

const STYLE_BY_TYPE: Partial<Record<string, ChairStyle>> = {
    // Visible armrests in the 3D model → render arm ticks in plan.
    chair:                       'armchair',
    chair_textile_wood_arm:      'armchair',
    chair_barcelona_black:       'armchair',
    chair_cesca_tan:             'armchair',
    chair_oak_curved_uph:        'armchair',
    // Backrest only, no arms.
    dining_chair:                'side-chair',
    chair_oak_solid:             'side-chair',
    chair_oak_slim:              'side-chair',
    chair_3leg_terracotta:       'side-chair',
    chair_3leg_obejita_black:    'side-chair',
    chair_4leg_obejita_wood:     'side-chair',
    // Backless (ottoman / stool).
    chair_barcelona_ottoman_black: 'stool',
};

/** Reasonable seat footprint used when FurnitureData is missing dimensions. */
const DEFAULT_SEAT = { w: 0.55, l: 0.55 };

export class ChairPlanSymbolBuilder {
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        const furnitureStore = window.furnitureStore as // TODO(TASK-08)
            | { getAll: () => FurnitureData[] }
            | undefined;
        if (!furnitureStore) return;

        if (!drawing.layers.has(FURN_LAYER)) {
            drawing.layers.create(FURN_LAYER);
        }

        let injected = 0;

        for (const chair of furnitureStore.getAll()) {
            if (!CHAIR_PLAN_TYPES.has(chair.furnitureType)) continue;
            if (chair.levelId !== levelId) continue;

            const positions = this._buildLocalLinework(chair);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );

            // Apply the chair's world transform. Y is irrelevant for plan
            // projection (toDrawingSpace flattens to the drawing plane), but
            // we still set it so the LineSegments lives at the correct level.
            if (chair.position) {
                lineSegments.position.set(
                    chair.position.x,
                    (chair.position.y ?? 0) + (chair.baseOffset ?? 0),
                    chair.position.z,
                );
            }
            if (chair.rotation) {
                lineSegments.quaternion.setFromEuler(new THREE.Euler(
                    chair.rotation.x,
                    chair.rotation.y,
                    chair.rotation.z,
                    (chair.rotation.order || 'XYZ') as THREE.EulerOrder,
                ));
            }
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, chair.id);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[ChairPlanSymbolBuilder] Injected ${injected} chair symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────────

    /**
     * Builds the 2D linework for ONE chair in LOCAL space.
     * Returns a flat [x, 0, z, x, 0, z, ...] LineSegments position array.
     */
    private _buildLocalLinework(chair: FurnitureData): number[] {
        const w = chair.width  ?? DEFAULT_SEAT.w;
        const l = chair.length ?? DEFAULT_SEAT.l;
        const style: ChairStyle = STYLE_BY_TYPE[chair.furnitureType] ?? 'side-chair';

        const segs: number[] = [];
        const seg = (ax: number, az: number, bx: number, bz: number): void => {
            segs.push(ax, 0, az, bx, 0, bz);
        };

        // ── Outer rounded-rectangle outline ──────────────────────────────
        // Soft chamfered footprint reads as "seat" without leg/stretcher noise.
        // r is capped at 28 % of the smaller side to avoid the rectangle
        // collapsing into an oval for narrow seats.
        const r = Math.min(w, l) * 0.22;
        this._addRoundedRect(seg, w, l, r);

        // Stools have no further details — just the outline.
        if (style === 'stool') return segs;

        // ── Backrest arc ─────────────────────────────────────────────────
        // A shallow inward arc just inside the back edge (-Z) reads as the
        // backrest. Spans the central 70 % of the width (or 86 % for armchairs
        // where the arms cap the ends). Bows toward the back wall by ~30 % of
        // its overall depth so it reads as a soft cushion fold.
        const backDepth   = Math.min(l * 0.22, 0.18);
        const backSpanFrac = style === 'armchair' ? 0.86 : 0.70;
        const innerW = w * backSpanFrac;
        this._addBackArc(seg, innerW, l, backDepth);

        // ── Armrest ticks (armchairs only) ───────────────────────────────
        // Two short curved ticks at the back-left and back-right read as the
        // tops of the arms. Drawn just inside the outline so the chair still
        // "feels" enclosed without the leg/stretcher dump of native projection.
        if (style === 'armchair') {
            this._addArmTicks(seg, w, l, backDepth);
        }

        return segs;
    }

    /**
     * Pushes a rounded-rectangle outline (centred on origin, w × l, corner
     * radius r) onto the segment buffer. Each 90° corner is approximated with
     * 6 short line segments for a clean curved read at typical plan scales.
     */
    private _addRoundedRect(
        seg: (ax: number, az: number, bx: number, bz: number) => void,
        w:   number,
        l:   number,
        r:   number,
    ): void {
        const hw = w / 2;
        const hl = l / 2;
        const cr = Math.max(0, Math.min(r, hw, hl));

        // Four straight edges between the corner arcs.
        seg(-hw + cr, -hl,       hw - cr, -hl      );  // back edge   (-Z)
        seg( hw,     -hl + cr,    hw,      hl - cr );  // right edge  (+X)
        seg( hw - cr,  hl,      -hw + cr,  hl      );  // front edge  (+Z)
        seg(-hw,      hl - cr,  -hw,     -hl + cr  );  // left edge   (-X)

        if (cr <= 1e-4) return;

        // Four 90° corner arcs (centre, start angle in radians sweeping CCW).
        const ARC_STEPS = 6;
        const corners: Array<{ cx: number; cz: number; a0: number }> = [
            { cx: -hw + cr, cz: -hl + cr, a0: Math.PI       }, // back-left
            { cx:  hw - cr, cz: -hl + cr, a0: 1.5 * Math.PI }, // back-right
            { cx:  hw - cr, cz:  hl - cr, a0: 0             }, // front-right
            { cx: -hw + cr, cz:  hl - cr, a0: 0.5 * Math.PI }, // front-left
        ];
        for (const c of corners) {
            let prevX = c.cx + cr * Math.cos(c.a0);
            let prevZ = c.cz + cr * Math.sin(c.a0);
            for (let i = 1; i <= ARC_STEPS; i++) {
                const a = c.a0 + (Math.PI / 2) * (i / ARC_STEPS);
                const x = c.cx + cr * Math.cos(a);
                const z = c.cz + cr * Math.sin(a);
                seg(prevX, prevZ, x, z);
                prevX = x;
                prevZ = z;
            }
        }
    }

    /**
     * Pushes a shallow backrest arc onto the segment buffer. The arc spans
     * `innerW` along X, sits `backDepth` in front of the back edge (-Z), and
     * bows toward the back wall by ~30 % of `backDepth`.
     */
    private _addBackArc(
        seg: (ax: number, az: number, bx: number, bz: number) => void,
        innerW:    number,
        l:         number,
        backDepth: number,
    ): void {
        const hl       = l / 2;
        const startX   = -innerW / 2;
        const endX     =  innerW / 2;
        const baseZ    = -hl + backDepth;            // arc endpoints sit here
        const peakZ    = -hl + backDepth * 0.30;     // arc midpoint pulls toward back
        const ARC_STEPS = 14;

        let px = startX;
        let pz = baseZ;
        for (let i = 1; i <= ARC_STEPS; i++) {
            const t = i / ARC_STEPS;
            const x = startX + (endX - startX) * t;
            // Parabolic blend: 0 at endpoints, 1 at midpoint → smooth shallow arc.
            const blend = 4 * t * (1 - t);
            const z = baseZ + (peakZ - baseZ) * blend;
            seg(px, pz, x, z);
            px = x;
            pz = z;
        }
    }

    /**
     * Pushes two short armrest ticks (one per side) onto the segment buffer.
     * Each tick is a short straight line just inside the outline running from
     * the back edge forward by ~half of the side length, marking the arm.
     */
    private _addArmTicks(
        seg: (ax: number, az: number, bx: number, bz: number) => void,
        w:         number,
        l:         number,
        backDepth: number,
    ): void {
        const hw = w / 2;
        const hl = l / 2;
        const armInset  = Math.min(w * 0.10, 0.07);  // arm thickness in plan
        const armStartZ = -hl + backDepth;           // begin where back arc ends
        const armEndZ   =  hl - Math.min(l * 0.18, 0.12);

        seg(-hw + armInset, armStartZ, -hw + armInset, armEndZ);  // left arm
        seg( hw - armInset, armStartZ,  hw - armInset, armEndZ);  // right arm
    }
}

/**
 * Singleton — imported by EdgeProjectorService and called once per plan view
 * after the base mesh-edge projection completes (mirrors the SofaPlanSymbolBuilder
 * / BedPlanSymbolBuilder / WardrobePlanSymbolBuilder pattern).
 */
export const chairPlanSymbolBuilder = new ChairPlanSymbolBuilder();
