/**
 * KitchenPlanSymbolBuilder — §36-KITCHEN-CABINET-ELEMENT-CONTRACT §4
 *                          + §02-BIM-SPATIAL-PROJECTION-CONTRACT
 *
 * Injects a CLEAN 2D plan-view symbol for every parametric kitchen run
 * (Straight / L / U / Island and the matching `_tall` variants) into the
 * active TechnicalDrawing, after the base 3D-edge projection completes.
 *
 * Why this exists:
 *   KitchenCabinetEngine builds full 3D mesh assemblies (carcass panels,
 *   doors, drawers, glass, handles, countertops, upper modules, appliances).
 *   When EdgeProjectorService runs THREE.EdgesGeometry over those meshes,
 *   the result is an unreadable mesh dump in plan view — overlapping
 *   panel-edge ladders, projected door surfaces, handle rebates, drawer
 *   front edges and countertop seams all stacking on top of each other.
 *
 *   Standard architectural plan symbols for kitchens are simple line
 *   diagrams: outer carcass rectangle per arm + per-unit dividers + a
 *   front-finish symbol per unit (per AEC convention). The countertop
 *   reads as a single thin parallel line offset in front of the cabinets.
 *
 *   Therefore: every kitchen-part mesh tags itself `userData.skipInPlan = true`
 *   so EdgeProjectorService excludes it from plan-view projection, and this
 *   builder injects the clean 2D symbol instead.
 *
 * Mirrors WardrobePlanSymbolBuilder / SofaPlanSymbolBuilder / BedPlanSymbolBuilder.
 *
 * Scope (HANDLED):
 *   kitchen_straight, kitchen_l_shape, kitchen_u_shape, kitchen_island,
 *   kitchen_straight_tall, kitchen_l_shape_tall, kitchen_u_shape_tall.
 *
 * Out of scope: GLB-imported kitchen items (kave_kitchen_*) fall through
 * to native edge projection.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData, FurnitureType } from '../FurnitureTypes';
import type {
    KitchenCabinetConfig,
    KitchenUnitConfig,
    KitchenUnitFront,
} from '../KitchenTypes';
import { KITCHEN_DEFAULTS, isTallKitchenLayout } from '../KitchenTypes';

const FURN_LAYER = 'A-FURN';

/** Kitchen types this builder owns. Anything not listed falls through. */
const HANDLED: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
    'kitchen_straight',
    'kitchen_l_shape',
    'kitchen_u_shape',
    'kitchen_island',
    'kitchen_straight_tall',
    'kitchen_l_shape_tall',
    'kitchen_u_shape_tall',
]);

/** Front-symbol tunables (metres, world units). */
const FRONT = {
    arcSegments:        8,        // tessellation per quarter-arc
    glassOffset:        0.025,    // inward offset for second glass-edge line
    framedGlassOffset:  0.040,    // slightly thicker double-line for framed glass
    countertopOffset:   0.020,    // overhang line offset in front of base run
    islandCountertopOv: 0.10,     // island countertop overhang (all sides)
    openGapFrac:        0.50,     // fraction of unit width left as gap for 'shelf'
    blankGapFrac:       0.75,     // wider gap for 'none' (appliance / blank slot)
    dividerDepthFrac:   0.70,     // how deep section-divider tickmarks reach
    drawerTickFrac:     0.18,     // length of drawer tick marks (frac of unit depth)
    // §KITCHEN-PLAN-PRO (founder #8, 2026-06-12) — wall (upper) cabinet dashing.
    dashLen:            0.08,     // dash length for wall-cabinet (dashed) lines
    dashGap:            0.05,     // gap length between dashes
    upperDepthDefault:  0.35,     // wall-cabinet projection when cfg omits it
} as const;

type Seg = (ax: number, az: number, bx: number, bz: number) => void;

export class KitchenPlanSymbolBuilder {
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

        for (const k of furnitureStore.getAll()) {
            if (!HANDLED.has(k.furnitureType)) continue;
            if (k.levelId !== levelId) continue;

            const positions = this._buildLocalLinework(k);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );

            // Apply the kitchen run's world transform. Y is irrelevant for plan
            // projection (toDrawingSpace flattens), but we still apply it so
            // the LineSegments lives at the correct level.
            if (k.position) {
                lineSegments.position.set(
                    k.position.x,
                    (k.position.y ?? 0) + (k.baseOffset ?? 0),
                    k.position.z,
                );
            }
            if (k.rotation) {
                lineSegments.quaternion.setFromEuler(new THREE.Euler(
                    k.rotation.x,
                    k.rotation.y,
                    k.rotation.z,
                    (k.rotation.order || 'XYZ') as THREE.EulerOrder,
                ));
            }
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, k.id);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[KitchenPlanSymbolBuilder] Injected ${injected} kitchen symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Top-level dispatch ────────────────────────────────────────────────

    private _buildLocalLinework(k: FurnitureData): number[] {
        const cfg = (k as any).kitchenConfig as KitchenCabinetConfig | undefined;
        if (!cfg) return this._buildFromFurnitureFallback(k);

        switch (cfg.layoutType) {
            case 'kitchen_straight':
            case 'kitchen_straight_tall':
                return this._buildStraight(cfg);
            case 'kitchen_l_shape':
            case 'kitchen_l_shape_tall':
                return this._buildLShape(cfg);
            case 'kitchen_u_shape':
            case 'kitchen_u_shape_tall':
                return this._buildUShape(cfg);
            case 'kitchen_island':
                return this._buildIsland(cfg);
            default:
                return [];
        }
    }

    /** Defensive fallback when only top-level w.width / w.length are present
     *  (e.g. legacy kitchen records without kitchenConfig). Draws a single
     *  straight rectangle with default unit subdivisions. */
    private _buildFromFurnitureFallback(k: FurnitureData): number[] {
        const length = k.width  ?? KITCHEN_DEFAULTS.length;
        const depth  = k.length ?? KITCHEN_DEFAULTS.depth;
        const numUnits = Math.max(1, Math.round(length / KITCHEN_DEFAULTS.unitWidth));
        const cfg: KitchenCabinetConfig = {
            layoutType: 'kitchen_straight',
            depth, length, height: KITCHEN_DEFAULTS.height,
            numUnits,
        };
        return this._buildStraight(cfg);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Pushes a single line segment in flat [x,0,z, x,0,z] form. */
    private static _seg(out: number[], ax: number, az: number, bx: number, bz: number): void {
        out.push(ax, 0, az, bx, 0, bz);
    }

    /** Tessellates a quarter-arc from angle a0 to a1 around (cx,cz) at radius r. */
    private _arc(out: number[], cx: number, cz: number, r: number, a0: number, a1: number): void {
        const N = FRONT.arcSegments;
        for (let i = 0; i < N; i++) {
            const t0 = a0 + (a1 - a0) * (i / N);
            const t1 = a0 + (a1 - a0) * ((i + 1) / N);
            KitchenPlanSymbolBuilder._seg(
                out,
                cx + r * Math.cos(t0), cz + r * Math.sin(t0),
                cx + r * Math.cos(t1), cz + r * Math.sin(t1),
            );
        }
    }

    /** A full circle approximated by `n` segments (appliance basins / burners). */
    private _circle(out: number[], cx: number, cz: number, r: number, n = 12): void {
        for (let i = 0; i < n; i++) {
            const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
            KitchenPlanSymbolBuilder._seg(
                out,
                cx + r * Math.cos(t0), cz + r * Math.sin(t0),
                cx + r * Math.cos(t1), cz + r * Math.sin(t1),
            );
        }
    }

    /**
     * §KITCHEN-PLAN-PRO (founder #8, 2026-06-12) — a DASHED straight line from
     * (ax,az) to (bx,bz). The plan renderer draws one solid LineBasicMaterial, so a
     * "dashed" wall-cabinet line is emitted as evenly broken short SEGMENTS (dash +
     * gap) directly into the buffer. Architectural convention: WALL (upper) cabinets
     * are shown dashed (they sit above the worktop, hidden in a true horizontal cut).
     * Deterministic: fixed dash/gap lengths, no RNG.
     */
    private _dashed(out: number[], ax: number, az: number, bx: number, bz: number): void {
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) return;
        const ux = dx / len, uz = dz / len;
        const dash = FRONT.dashLen, gap = FRONT.dashGap, period = dash + gap;
        for (let s = 0; s < len - 1e-6; s += period) {
            const e = Math.min(s + dash, len);
            KitchenPlanSymbolBuilder._seg(out, ax + ux * s, az + uz * s, ax + ux * e, az + uz * e);
        }
    }

    /** A dashed rectangle (4 dashed edges) — the wall-cabinet plan outline. */
    private _dashedRect(out: number[], x0: number, z0: number, x1: number, z1: number): void {
        this._dashed(out, x0, z0, x1, z0);
        this._dashed(out, x1, z0, x1, z1);
        this._dashed(out, x1, z1, x0, z1);
        this._dashed(out, x0, z1, x0, z0);
    }

    /**
     * §KITCHEN-PLAN-PRO — draw the architectural plan SYMBOL of a built-in appliance
     * inside the unit's footprint (arm-local u∈[u0,u1], v∈[0,depth], front at v=depth):
     *   • sink   → basin rectangle inset from the unit edges + a small drain circle +
     *              a faucet tick at the back (the standard sink plan glyph).
     *   • hob    → square cooktop outline + four burner circles (2×2).
     *   • fridge → carcass rectangle + a single door-leaf line across the front (the
     *              fridge/appliance plan glyph; side-by-side gets a centre split too).
     *   • washing machine → carcass rectangle + a centred drum circle (front-loader).
     * Returns true when a symbol was drawn (so the caller skips the blank gap).
     */
    private _drawAppliance(
        out: number[], u0: number, u1: number, depth: number, appliance: string,
    ): boolean {
        const seg: Seg = (au, av, bu, bv) => KitchenPlanSymbolBuilder._seg(out, au, av, bu, bv);
        const cu = (u0 + u1) / 2;
        const w = u1 - u0;
        const frontV = depth;

        if (appliance.startsWith('sink')) {
            // Basin inset ~6 cm from the unit edges; drain + faucet glyphs.
            const ix = 0.06, iv = 0.08;
            const bx0 = u0 + ix, bx1 = u1 - ix, bv0 = iv, bv1 = depth - iv;
            seg(bx0, bv0, bx1, bv0); seg(bx1, bv0, bx1, bv1);
            seg(bx1, bv1, bx0, bv1); seg(bx0, bv1, bx0, bv0);
            this._circle(out, cu, (bv0 + bv1) / 2, Math.min(0.05, w * 0.12), 10);   // drain
            seg(cu, bv0, cu, bv0 - 0.05);                                          // faucet stem (toward back wall)
            return true;
        }
        if (appliance === 'hob') {
            // Cooktop square + 2×2 burners.
            const m = 0.07;
            const hx0 = u0 + m, hx1 = u1 - m, hv0 = m, hv1 = depth - m;
            seg(hx0, hv0, hx1, hv0); seg(hx1, hv0, hx1, hv1);
            seg(hx1, hv1, hx0, hv1); seg(hx0, hv1, hx0, hv0);
            const br = Math.min(0.07, w * 0.16);
            for (const bu of [hx0 + (hx1 - hx0) * 0.28, hx0 + (hx1 - hx0) * 0.72])
                for (const bv of [hv0 + (hv1 - hv0) * 0.28, hv0 + (hv1 - hv0) * 0.72])
                    this._circle(out, bu, bv, br, 10);
            return true;
        }
        if (appliance.startsWith('fridge')) {
            // Carcass + door-leaf line across the front (appliance convention).
            seg(u0, 0, u1, 0); seg(u1, 0, u1, frontV);
            seg(u1, frontV, u0, frontV); seg(u0, frontV, u0, 0);
            // Door swing-leaf hint: a short diagonal from a front corner.
            seg(u0 + 0.03, frontV - 0.03, u0 + Math.min(0.22, w * 0.5), frontV - 0.03);
            if (appliance.startsWith('fridge_side')) seg(cu, 0, cu, frontV);       // side-by-side split
            return true;
        }
        if (appliance.startsWith('washing_machine')) {
            // Carcass + circular drum (front-loader).
            seg(u0, 0, u1, 0); seg(u1, 0, u1, frontV);
            seg(u1, frontV, u0, frontV); seg(u0, frontV, u0, 0);
            this._circle(out, cu, depth / 2, Math.min(depth, w) * 0.32, 14);
            return true;
        }
        return false;
    }

    /**
     * Draws one rectangular cabinet arm in arm-local (u, v) coordinates,
     * where +u runs along the arm length and +v points toward the front
     * (door face). Origin is the back-left corner of the arm (u=0, v=0).
     *
     * After arm-local linework is built, opts.rotY rotates and (offsetU,
     * offsetV) translates the result, then it's pushed to `out` as
     * (root-local-X, root-local-Z) coordinates.
     *
     * Caller passes the engine's actual unit configs and unit count so the
     * dividers and per-unit symbols line up with the 3D mesh.
     */
    private _drawArm(
        out:        number[],
        runLen:     number,
        depth:      number,
        units:      KitchenUnitConfig[],
        numUnits:   number,
        opts: {
            offsetX?: number;
            offsetZ?: number;
            rotY?:    number;
            withCountertopOverhang?: boolean;
            /**
             * §KITCHEN-PLAN-SYMBOL (2026-05-23) — REFLECTION transform (x'=v, z'=u)
             * instead of a pure rotation. The L-shape LEFT arm in KitchenCabinetEngine
             * is placed as a reflection of the arm-local frame (run → +Z, front → +X),
             * which no rotation can reproduce (a pure +π/2 rotation gives run → −Z, so
             * the symbol's L pointed the OPPOSITE way to the 3-D mesh — "L-shape flipped").
             * When true, rotY is ignored.
             */
            swapUV?: boolean;
            /**
             * §KITCHEN-PLAN-PRO (founder #8, 2026-06-12) — when > 0, a DASHED wall
             * (upper) cabinet rectangle of this projection depth is drawn against the
             * back wall (v = 0 … upperDepth) over the run, per architectural convention
             * (wall cabinets shown dashed). Passed for the `_tall` layouts.
             */
            upperDepth?: number;
        } = {},
    ): void {
        const offsetX = opts.offsetX ?? 0;
        const offsetZ = opts.offsetZ ?? 0;
        const rotY    = opts.rotY    ?? 0;
        const swapUV  = opts.swapUV === true;
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);

        // Build arm-local segments first into a temp buffer, then transform.
        // Local frame: u in [0, runLen], v in [0, depth]. Front at v=depth.
        const tmp: number[] = [];
        const seg: Seg = (au, av, bu, bv) => KitchenPlanSymbolBuilder._seg(tmp, au, av, bu, bv);

        // ── Outer rectangle: back, left, right (front edge drawn per unit).
        seg(0,      0,     runLen, 0     );  // back edge
        seg(0,      0,     0,      depth );  // left end
        seg(runLen, 0,     runLen, depth );  // right end

        // ── Section dividers between units ─────────────────────────────
        const unitW = numUnits > 0 ? runLen / numUnits : runLen;
        for (let i = 1; i < numUnits; i++) {
            const u = i * unitW;
            const ddep = depth * FRONT.dividerDepthFrac;
            seg(u, depth, u, depth - ddep);
        }

        // ── Per-unit front symbol on the front edge ─────────────────────
        for (let i = 0; i < numUnits; i++) {
            const u0   = i * unitW;
            const u1   = u0 + unitW;
            const cfg  = units[i];
            // §KITCHEN-PLAN-PRO — an appliance unit draws its architectural plan
            // SYMBOL (sink basin / hob burners / fridge leaf / washer drum) instead of
            // the old blank gap, so the run reads professionally + the work triangle
            // (sink ↔ hob ↔ fridge) is legible. Falls back to the cabinet front symbol.
            if (cfg?.appliance && this._drawAppliance(tmp, u0, u1, depth, cfg.appliance)) continue;
            const front: KitchenUnitFront = cfg?.front ?? 'door';
            this._drawFront(tmp, u0, u1, depth, front, cfg);
        }

        // ── Optional countertop overhang line ───────────────────────────
        if (opts.withCountertopOverhang !== false) {
            const v = depth + FRONT.countertopOffset;
            seg(-FRONT.countertopOffset, v, runLen + FRONT.countertopOffset, v);
        }

        // ── §KITCHEN-PLAN-PRO — wall (upper) cabinets, DASHED ───────────
        // A dashed rectangle against the back wall (v = 0 … upperDepth) spanning the
        // run, with dashed dividers aligned to the base units. Drawn LAST in arm-local
        // space so the transform below carries it into root coords with the base run.
        const upperDepth = opts.upperDepth ?? 0;
        if (upperDepth > 0) {
            const ud = Math.min(upperDepth, depth);          // never deeper than the base
            this._dashedRect(tmp, 0, 0, runLen, ud);
            for (let i = 1; i < numUnits; i++) this._dashed(tmp, i * unitW, 0, i * unitW, ud);
        }

        // ── Apply arm-local rotation + translation, then push to out ─────
        for (let i = 0; i < tmp.length; i += 6) {
            // tmp is filled in 6-number tuples (x,y,z,x,y,z), so these indices are
            // always present; `?? 0` keeps the type `number` (noUncheckedIndexedAccess).
            const ax = tmp[i]     ?? 0, az = tmp[i + 2] ?? 0;
            const bx = tmp[i + 3] ?? 0, bz = tmp[i + 5] ?? 0;
            // §KITCHEN-PLAN-SYMBOL — swapUV is a REFLECTION (x'=v, z'=u): run → +Z,
            // front → +X, matching the engine's left arm. The pure-rotation branch
            // (x'=u·cos+v·sin, z'=−u·sin+v·cos) sent run → −Z for rotY=+π/2, which
            // pointed the L the opposite way to the 3-D mesh.
            const rxA = swapUV ? az :  ax * cosR + az * sinR;
            const rzA = swapUV ? ax : -ax * sinR + az * cosR;
            const rxB = swapUV ? bz :  bx * cosR + bz * sinR;
            const rzB = swapUV ? bx : -bx * sinR + bz * cosR;
            out.push(rxA + offsetX, 0, rzA + offsetZ,
                     rxB + offsetX, 0, rzB + offsetZ);
        }
    }

    /** Draws the front-edge symbol for one unit between local u = u0..u1
     *  at front v = frontV. Adds segments to `out`. */
    private _drawFront(
        out:    number[],
        u0:     number,
        u1:     number,
        frontV: number,
        front:  KitchenUnitFront,
        cfg?:   KitchenUnitConfig,
    ): void {
        const seg: Seg = (au, av, bu, bv) =>
            KitchenPlanSymbolBuilder._seg(out, au, av, bu, bv);
        const unitW = u1 - u0;

        switch (front) {
            case 'door': {
                // Solid front edge + 90° quarter-arc swing.
                seg(u0, frontV, u1, frontV);
                // Hinge at the left corner, swinging forward (+v) and right (+u).
                // In arm-local frame: x = cos, z = sin → arc from angle 0 (along +u)
                // to angle π/2 (along +v) reaches (u0 + unitW, frontV) → (u0, frontV + unitW).
                this._arc(out, u0, frontV, unitW, 0, Math.PI / 2);
                break;
            }
            case 'glass_door': {
                // Double parallel line at front (thin gap, 25 mm).
                seg(u0, frontV, u1, frontV);
                const v2 = frontV - FRONT.glassOffset;
                seg(u0, v2, u1, v2);
                break;
            }
            case 'framed_glass_door': {
                // Double parallel line at front (40 mm — wider for the frame).
                seg(u0, frontV, u1, frontV);
                const v2 = frontV - FRONT.framedGlassOffset;
                seg(u0, v2, u1, v2);
                // Two short side ticks marking the frame stiles.
                seg(u0, frontV, u0, v2);
                seg(u1, frontV, u1, v2);
                break;
            }
            case 'drawers': {
                // Solid front edge + horizontal tick(s) inside marking drawer
                // front divisions. Default 3 if not specified.
                seg(u0, frontV, u1, frontV);
                const n = Math.max(2, Math.min(4, cfg?.numDrawers ?? 3));
                const tickLen = unitW * 0.0;          // no horizontal length, ticks span unit
                void tickLen;
                // Ticks are drawn as short v-direction marks at the unit boundaries
                // and inside, parallel to the front edge but stepped backward to
                // suggest the stack.
                for (let d = 1; d < n; d++) {
                    // Inset the tick line inside the unit (between back and front).
                    // Use evenly spaced inward offsets — purely indicative.
                    const v = frontV - (d / n) * (FRONT.dividerDepthFrac * 0.4 * (frontV));
                    seg(u0 + 0.02, v, u1 - 0.02, v);
                }
                break;
            }
            case 'shelf': {
                // Open bay convention: front edge with a centred gap.
                const gap   = unitW * FRONT.openGapFrac;
                const halfG = gap / 2;
                const cu    = (u0 + u1) / 2;
                seg(u0,         frontV, cu - halfG, frontV);
                seg(cu + halfG, frontV, u1,         frontV);
                break;
            }
            case 'none':
            default: {
                // Blank panel / appliance slot: wider centred gap (75% of unit).
                const gap   = unitW * FRONT.blankGapFrac;
                const halfG = gap / 2;
                const cu    = (u0 + u1) / 2;
                seg(u0,         frontV, cu - halfG, frontV);
                seg(cu + halfG, frontV, u1,         frontV);
                break;
            }
        }
    }

    // ── Layout builders ───────────────────────────────────────────────────
    //
    // Engine local-frame reminder (after the engine's `-length/2` X recenter
    // applied at the end of KitchenCabinetEngine.create()):
    //
    //   • Straight / L / U: main arm spans x ∈ [-length/2, +length/2],
    //     z ∈ [-depth/2, +depth/2], with the door face at z = +depth/2.
    //   • L left arm: x ∈ [-length/2, -length/2 + depth],
    //     z ∈ [+depth/2, +depth/2 + leftLen], door face at +X.
    //   • U right arm: x ∈ [+length/2 - depth, +length/2],
    //     z ∈ [+depth/2, +depth/2 + rightLen], door face at -X.
    //   • Island front row: x ∈ [-length/2, +length/2], z ∈ [-depth, 0],
    //     door face at z = -depth.  Back row: z ∈ [0, +depth], face +depth.
    //
    // We replicate these placements exactly so the symbol overlays the mesh
    // in plan view.

    /** §KITCHEN-PLAN-PRO — the wall-cabinet plan depth for a layout: 0 for the base
     *  (non-tall) families, else the configured upper-cabinet depth (default 0.35). */
    private _upperDepth(cfg: KitchenCabinetConfig): number {
        return isTallKitchenLayout(cfg.layoutType)
            ? (cfg.upperCabinetDepth ?? FRONT.upperDepthDefault)
            : 0;
    }

    private _buildStraight(cfg: KitchenCabinetConfig): number[] {
        const out: number[] = [];
        const length = cfg.length;
        const depth  = cfg.depth;
        const units  = (cfg.units ?? []).filter(u => u.arm === 'main');
        const n      = cfg.numUnits;
        const upperDepth = this._upperDepth(cfg);

        // Arm-local origin = back-left corner. Main arm back-left in root coords:
        //   x = -length/2,  z = -depth/2.   No rotation.  +u → +X, +v → +Z.
        this._drawArm(out, length, depth, units, n, {
            offsetX: -length / 2,
            offsetZ: -depth  / 2,
            rotY:     0,
            withCountertopOverhang: true,
            upperDepth,
        });
        return out;
    }

    private _buildLShape(cfg: KitchenCabinetConfig): number[] {
        const out: number[] = [];
        const length  = cfg.length;
        const depth   = cfg.depth;
        const leftLen = cfg.lengthLeft  ?? 0;
        const numL    = cfg.numUnitsLeft ?? 0;
        const mainUnits = (cfg.units ?? []).filter(u => u.arm === 'main');
        const leftUnits = (cfg.units ?? []).filter(u => u.arm === 'left');
        const upperDepth = this._upperDepth(cfg);

        // Main arm
        this._drawArm(out, length, depth, mainUnits, cfg.numUnits, {
            offsetX: -length / 2,
            offsetZ: -depth  / 2,
            rotY:     0,
            withCountertopOverhang: true,
            upperDepth,
        });

        // Left arm: REFLECTED (swapUV: x'=v, z'=u) so arm-local +u (run) → root +Z
        // and arm-local +v (front) → root +X. Back-left corner (u=0, v=0) sits at
        // (root x = -length/2, root z = +depth/2). NB: a pure +π/2 rotation sent the
        // run to −Z, which mirrored the L vs the 3-D mesh (§KITCHEN-PLAN-SYMBOL).
        if (leftLen > 0 && numL > 0) {
            this._drawArm(out, leftLen, depth, leftUnits, numL, {
                offsetX: -length / 2,
                offsetZ:  depth  / 2,
                swapUV:   true,
                withCountertopOverhang: true,
                upperDepth,
            });
        }
        return out;
    }

    private _buildUShape(cfg: KitchenCabinetConfig): number[] {
        const out: number[] = [];
        const length   = cfg.length;
        const depth    = cfg.depth;
        const leftLen  = cfg.lengthLeft   ?? 0;
        const rightLen = cfg.lengthRight  ?? 0;
        const numL     = cfg.numUnitsLeft  ?? 0;
        const numR     = cfg.numUnitsRight ?? 0;
        const mainUnits  = (cfg.units ?? []).filter(u => u.arm === 'main');
        const leftUnits  = (cfg.units ?? []).filter(u => u.arm === 'left');
        const rightUnits = (cfg.units ?? []).filter(u => u.arm === 'right');
        const upperDepth = this._upperDepth(cfg);

        // Main arm
        this._drawArm(out, length, depth, mainUnits, cfg.numUnits, {
            offsetX: -length / 2,
            offsetZ: -depth  / 2,
            rotY:     0,
            withCountertopOverhang: true,
            upperDepth,
        });

        // Left arm: same as L-shape.
        if (leftLen > 0 && numL > 0) {
            this._drawArm(out, leftLen, depth, leftUnits, numL, {
                offsetX: -length / 2,
                offsetZ:  depth  / 2,
                swapUV:   true,
                withCountertopOverhang: true,
                upperDepth,
            });
        }

        // Right arm: rotated -π/2 so arm-local +u (run) → root +Z and arm-local
        // +v (front) → root -X.  Back-left corner (u=0, v=0) sits at
        // (root x = +length/2, root z = +depth/2).
        if (rightLen > 0 && numR > 0) {
            this._drawArm(out, rightLen, depth, rightUnits, numR, {
                offsetX:  length / 2,
                offsetZ:  depth  / 2,
                rotY:    -Math.PI / 2,
                withCountertopOverhang: true,
                upperDepth,
            });
        }
        return out;
    }

    private _buildIsland(cfg: KitchenCabinetConfig): number[] {
        const out: number[] = [];
        const length    = cfg.length;
        const cabDepth  = cfg.depth;
        const mainUnits = (cfg.units ?? []).filter(u => u.arm === 'main');
        const backUnits = (cfg.units ?? []).filter(u => u.arm === 'left');
        const n         = cfg.numUnits;

        // Front row: faces -Z. Back-left in root coords = (-length/2, -cabDepth).
        // Arm-local +u → root +X, +v → root +Z (no rotation), front at v=cabDepth.
        // To make the front face -Z, rotate π so +v → -Z. Rotation by π also
        // mirrors +u → -X, so back-left after rotation = (+length/2, 0).
        // Equivalent simpler approach: build the row with no rotation but flip
        // the Z origin so the door face ends up at z=-cabDepth (the outward side).
        //
        // We do the latter: run the arm with rotY=π and offset back-left to
        // (+length/2, 0) so the resulting front face lands on z = -cabDepth.
        this._drawArm(out, length, cabDepth, mainUnits, n, {
            offsetX:  length / 2,
            offsetZ:  0,
            rotY:     Math.PI,
            withCountertopOverhang: false,
        });

        // Back row: faces +Z. No rotation. Back-left = (-length/2, 0), front at z=+cabDepth.
        // Use back-arm units if defined, else mirror front row.
        const back = backUnits.length > 0 ? backUnits : mainUnits;
        this._drawArm(out, length, cabDepth, back, n, {
            offsetX: -length / 2,
            offsetZ:  0,
            rotY:     0,
            withCountertopOverhang: false,
        });

        // Island countertop outline: a single rectangle with 10 cm overhang on
        // all four sides (matches engine's islandCountertopOverhang).
        const ov   = FRONT.islandCountertopOv;
        const xMin = -length / 2 - ov;
        const xMax =  length / 2 + ov;
        const zMin = -cabDepth   - ov;
        const zMax =  cabDepth   + ov;
        const seg: Seg = (ax, az, bx, bz) =>
            KitchenPlanSymbolBuilder._seg(out, ax, az, bx, bz);
        seg(xMin, zMin, xMax, zMin);
        seg(xMax, zMin, xMax, zMax);
        seg(xMax, zMax, xMin, zMax);
        seg(xMin, zMax, xMin, zMin);

        return out;
    }
}

/**
 * Singleton — imported by EdgeProjectorService and called once per plan view
 * after the base mesh-edge projection completes.
 */
export const kitchenPlanSymbolBuilder = new KitchenPlanSymbolBuilder();
