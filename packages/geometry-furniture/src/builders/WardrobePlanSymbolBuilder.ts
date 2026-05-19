/**
 * WardrobePlanSymbolBuilder — §07-WARDROBE-VIEW-CONTRACT
 *
 * Injects a CLEAN 2D plan-view symbol for every wardrobe (legacy + parametric)
 * into the active TechnicalDrawing, after the base 3D-edge projection completes.
 *
 * Why this exists:
 *   The wardrobe engines build full 3D mesh assemblies (carcass panels, doors,
 *   handles, hangers, shelves, drawers, top modules). When EdgeProjectorService
 *   runs THREE.EdgesGeometry over those meshes, the result is an unreadable
 *   mesh dump in plan view — concentric panel-edge ladders, projected door
 *   surfaces, interior items showing through carcass walls.
 *
 *   Standard architectural plan symbols for wardrobes are simple line
 *   diagrams: outer carcass rectangle + section dividers + door swing arcs
 *   (per AEC convention).
 *
 *   Therefore: every wardrobe-part mesh tags itself `userData.skipInPlan = true`
 *   so EdgeProjectorService excludes it from plan-view projection, and this
 *   builder injects the clean 2D symbol instead.
 *
 * Mirrors SofaPlanSymbolBuilder / BedPlanSymbolBuilder.
 *
 * Scope (HANDLED):
 *   wardrobe, wardrobe_glass_door, corner_wardrobe,
 *   wardrobe_straight, wardrobe_l_shape, wardrobe_u_shape,
 *   wardrobe_straight_tall, wardrobe_l_shape_tall, wardrobe_u_shape_tall.
 *
 * Out of scope: GLB-imported wardrobes (kave_closet, wip_white_wardrobe,
 * kave_storage_closet) fall through to native edge projection.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewDefinition } from '@pryzm/core-app-model';
import { registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData, FurnitureType } from '../FurnitureTypes';
import type {
    WardrobeConfig,
    WardrobeSection,
    DoorType,
} from '../WardrobeTypes';
import type {
    WardrobeCabinetConfig,
    WardrobeSectionConfig,
    WardrobeSectionDoorType,
} from '../WardrobeCabinetTypes';

const FURN_LAYER = 'A-FURN';

/** Wardrobe types this builder owns. Anything not listed falls through. */
const HANDLED: ReadonlySet<FurnitureType> = new Set<FurnitureType>([
    'wardrobe',
    'wardrobe_glass_door',
    'corner_wardrobe',
    'wardrobe_straight',
    'wardrobe_l_shape',
    'wardrobe_u_shape',
    'wardrobe_straight_tall',
    'wardrobe_l_shape_tall',
    'wardrobe_u_shape_tall',
]);

/** Door symbol tunables (metres, world units). */
const DOOR = {
    arcSegments:    8,        // tessellation per quarter-arc
    slidingOffset:  0.05,     // inward offset for second sliding panel
    slidingGap:     0.04,     // centre gap on the front edge for sliding
    glassOffset:    0.025,    // inward offset for second glass-edge line
    mirrorStroke:   0.10,     // diagonal hatch length for mirror
    openGapFrac:    0.50,     // fraction of section width left as gap for 'none'
    dividerDepthFrac: 0.70,   // how deep section-divider tickmarks reach
} as const;

/** Plus a couple of convenience aliases. */
type Seg = (ax: number, az: number, bx: number, bz: number) => void;

/** Adapter — both legacy DoorType and parametric door type collapse to a
 *  small enum the symbol drawer uses. */
type SymDoor = 'double-hinged' | 'hinged-left' | 'hinged-right'
             | 'sliding' | 'glass' | 'mirror' | 'none';

function adaptDoor(t: DoorType | WardrobeSectionDoorType | undefined): SymDoor {
    switch (t) {
        case 'double-hinged':       return 'double-hinged';
        case 'hinged-left':         return 'hinged-left';
        case 'hinged-right':        return 'hinged-right';
        case 'sliding':             return 'sliding';
        case 'glass':
        case 'translucent-glass':   return 'glass';
        case 'mirror':              return 'mirror';
        case 'none':                return 'none';
        default:                    return 'double-hinged';
    }
}

export class WardrobePlanSymbolBuilder {
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

        for (const w of furnitureStore.getAll()) {
            if (!HANDLED.has(w.furnitureType)) continue;
            if (w.levelId !== levelId) continue;

            const positions = this._buildLocalLinework(w);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );

            // Apply the wardrobe's world transform. Y is irrelevant for plan
            // projection (toDrawingSpace flattens), but we still apply it so
            // the LineSegments lives at the correct level.
            if (w.position) {
                lineSegments.position.set(
                    w.position.x,
                    (w.position.y ?? 0) + (w.baseOffset ?? 0),
                    w.position.z,
                );
            }
            if (w.rotation) {
                lineSegments.quaternion.setFromEuler(new THREE.Euler(
                    w.rotation.x,
                    w.rotation.y,
                    w.rotation.z,
                    (w.rotation.order || 'XYZ') as THREE.EulerOrder,
                ));
            }
            lineSegments.updateWorldMatrix(true, false);

            const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, w.id);
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[WardrobePlanSymbolBuilder] Injected ${injected} wardrobe symbol(s) ` +
                `into view ${viewDef.id} (level ${levelId})`,
            );
        }
    }

    // ── Top-level dispatch ────────────────────────────────────────────────

    private _buildLocalLinework(w: FurnitureData): number[] {
        const t = w.furnitureType;

        // Parametric layouts
        if (t === 'wardrobe_straight'      || t === 'wardrobe_straight_tall' ||
            t === 'wardrobe_l_shape'       || t === 'wardrobe_l_shape_tall'  ||
            t === 'wardrobe_u_shape'       || t === 'wardrobe_u_shape_tall') {
            return this._buildParametric(w);
        }

        // Legacy corner
        if (t === 'corner_wardrobe') {
            return this._buildCorner(w);
        }

        // Legacy line wardrobes
        return this._buildLegacyLine(w);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Pushes a single line segment in flat [x,0,z, x,0,z] form. */
    private static _seg(out: number[], ax: number, az: number, bx: number, bz: number): void {
        out.push(ax, 0, az, bx, 0, bz);
    }

    /** Tessellates a quarter-arc from angle a0 to a1 around (cx,cz) at radius r,
     *  in line-segment pairs.  Both angles in radians (z-up plane: x = cos, z = sin). */
    private _arc(out: number[], cx: number, cz: number, r: number, a0: number, a1: number): void {
        const N = DOOR.arcSegments;
        for (let i = 0; i < N; i++) {
            const t0 = a0 + (a1 - a0) * (i / N);
            const t1 = a0 + (a1 - a0) * ((i + 1) / N);
            WardrobePlanSymbolBuilder._seg(
                out,
                cx + r * Math.cos(t0), cz + r * Math.sin(t0),
                cx + r * Math.cos(t1), cz + r * Math.sin(t1),
            );
        }
    }

    /**
     * Draws a single arm rectangle with section dividers and door symbols.
     *
     * Local frame (arm-local): origin at arm centre, +X = run, +Z = front.
     * Caller may then apply an additional translation/rotation if the arm
     * is offset from the element root (used by L/U/corner layouts).
     */
    private _drawArm(
        out:        number[],
        runLen:     number,
        depth:      number,
        sections:   { width: number; door: SymDoor }[],
        opts: {
            offsetX?: number;
            offsetZ?: number;
            rotY?:    number;
        } = {},
    ): void {
        const offsetX = opts.offsetX ?? 0;
        const offsetZ = opts.offsetZ ?? 0;
        const rotY    = opts.rotY    ?? 0;
        const cosR = Math.cos(rotY);
        const sinR = Math.sin(rotY);

        // Build arm-local segments first into a temp buffer, then transform.
        const tmp: number[] = [];
        const seg: Seg = (ax, az, bx, bz) => WardrobePlanSymbolBuilder._seg(tmp, ax, az, bx, bz);

        const W = runLen;
        const D = depth;
        const halfW = W / 2;
        const halfD = D / 2;

        // ── Outer rectangle: back, right, left.  Front edge is replaced
        // by per-section door symbols below (see _drawFront).
        seg(-halfW, -halfD,  halfW, -halfD); // back
        seg( halfW, -halfD,  halfW,  halfD); // right end
        seg(-halfW, -halfD, -halfW,  halfD); // left end

        // ── Section dividers ───────────────────────────────────────────
        let cursorX = -halfW;
        for (let i = 0; i < sections.length - 1; i++) {
            cursorX += sections[i].width;
            const ddep = D * DOOR.dividerDepthFrac;
            seg(cursorX,  halfD,  cursorX,  halfD - ddep);
        }

        // ── Per-section door symbol on the front edge ─────────────────
        cursorX = -halfW;
        for (const sec of sections) {
            const x0 = cursorX;
            const x1 = cursorX + sec.width;
            this._drawFront(tmp, x0, x1, halfD, sec.door);
            cursorX = x1;
        }

        // ── Apply arm-local rotation/translation, then push to out ─────
        for (let i = 0; i < tmp.length; i += 6) {
            const ax = tmp[i],   az = tmp[i + 2];
            const bx = tmp[i + 3], bz = tmp[i + 5];
            const rxA =  ax * cosR + az * sinR;
            const rzA = -ax * sinR + az * cosR;
            const rxB =  bx * cosR + bz * sinR;
            const rzB = -bx * sinR + bz * cosR;
            out.push(rxA + offsetX, 0, rzA + offsetZ,
                     rxB + offsetX, 0, rzB + offsetZ);
        }
    }

    /** Draws the front-edge symbol for one section between local X = x0..x1
     *  at front Z = frontZ.  Adds segments to `out`. */
    private _drawFront(
        out:    number[],
        x0:     number,
        x1:     number,
        frontZ: number,
        door:   SymDoor,
    ): void {
        const seg: Seg = (ax, az, bx, bz) => WardrobePlanSymbolBuilder._seg(out, ax, az, bx, bz);
        const secW = x1 - x0;

        switch (door) {
            case 'double-hinged': {
                // Front edge solid + two 90° quarter-arcs swinging forward.
                seg(x0, frontZ, x1, frontZ);
                // Left door: hinge at (x0, frontZ), radius = secW/2.
                // Closed = along +X at angle 0; opens 90° toward +Z (front).
                this._arc(out, x0, frontZ, secW / 2, 0, Math.PI / 2);
                // Right door: hinge at (x1, frontZ), radius = secW/2.
                // Closed = along -X at angle π; opens 90° toward +Z.
                this._arc(out, x1, frontZ, secW / 2, Math.PI, Math.PI / 2);
                break;
            }
            case 'hinged-left': {
                seg(x0, frontZ, x1, frontZ);
                // Single arc from left hinge, full section width.
                this._arc(out, x0, frontZ, secW, 0, Math.PI / 2);
                break;
            }
            case 'hinged-right': {
                seg(x0, frontZ, x1, frontZ);
                // Single arc from right hinge, full section width.
                this._arc(out, x1, frontZ, secW, Math.PI, Math.PI / 2);
                break;
            }
            case 'sliding': {
                // Front edge with centre gap + offset second panel inside.
                const gap = Math.min(DOOR.slidingGap, secW * 0.4);
                const midL = (x0 + x1) / 2 - gap / 2;
                const midR = (x0 + x1) / 2 + gap / 2;
                seg(x0,   frontZ, midL, frontZ);
                seg(midR, frontZ, x1,   frontZ);
                // Second bypass panel offset inward.
                const z2 = frontZ - DOOR.slidingOffset;
                seg(x0, z2, x1, z2);
                break;
            }
            case 'glass': {
                // Double parallel line at the front.
                seg(x0, frontZ, x1, frontZ);
                const z2 = frontZ - DOOR.glassOffset;
                seg(x0, z2, x1, z2);
                break;
            }
            case 'mirror': {
                // Front edge solid + a small diagonal hatch at section centre.
                seg(x0, frontZ, x1, frontZ);
                const cx = (x0 + x1) / 2;
                const h  = DOOR.mirrorStroke / 2;
                seg(cx - h, frontZ - h, cx + h, frontZ + h);
                break;
            }
            case 'none': {
                // Open bay: front edge with a centred gap.
                const gap   = secW * DOOR.openGapFrac;
                const halfG = gap / 2;
                const cx    = (x0 + x1) / 2;
                seg(x0,         frontZ, cx - halfG, frontZ);
                seg(cx + halfG, frontZ, x1,         frontZ);
                break;
            }
        }
    }

    // ── Family builders ──────────────────────────────────────────────────

    /** Legacy line wardrobes (`wardrobe`, `wardrobe_glass_door`).
     *  Engine local frame: origin = element centre, +X = run, +Z = front.
     *  Single section. */
    private _buildLegacyLine(w: FurnitureData): number[] {
        const cfg = w.wardrobeConfig as WardrobeConfig | undefined;
        const runLen = cfg?.width  ?? w.width  ?? 1.0;
        const depth  = cfg?.depth  ?? w.length ?? 0.6;

        // Glass-door wardrobes default to 'glass' if no config supplied.
        const fallbackDoor: SymDoor =
            w.furnitureType === 'wardrobe_glass_door' ? 'glass' : 'double-hinged';

        const sections = (cfg?.sections && cfg.sections.length > 0)
            ? cfg.sections.map((s: WardrobeSection) => ({
                width: s.width,
                door:  adaptDoor(s.doorType),
            }))
            : [{ width: runLen, door: fallbackDoor }];

        // Re-scale section widths if they don't sum to runLen (defensive).
        const sumW = sections.reduce((a, s) => a + s.width, 0);
        if (sumW > 0 && Math.abs(sumW - runLen) > 1e-3) {
            const k = runLen / sumW;
            sections.forEach(s => { s.width *= k; });
        }

        const out: number[] = [];
        this._drawArm(out, runLen, depth, sections);
        return out;
    }

    /** Corner wardrobe (`corner_wardrobe`).
     *  Element `position` = startPoint, rotation = identity.  Branches are
     *  laid out in world-relative coordinates from start. */
    private _buildCorner(w: FurnitureData): number[] {
        const cfg = w.wardrobeConfig as WardrobeConfig | undefined;
        if (!cfg) return [];

        const startP  = (w as any).startPoint  ?? cfg ? (cfg as any).startPoint : null;
        const cornerP = (w as any).cornerPoint ?? cfg.cornerPoint;
        const endP    = (w as any).endPoint    ?? (cfg as any).endPoint;
        if (!startP || !cornerP || !endP) return [];

        const start  = new THREE.Vector3(startP.x,  0, startP.z);
        const corner = new THREE.Vector3(cornerP.x, 0, cornerP.z);
        const end    = new THREE.Vector3(endP.x,    0, endP.z);

        const dir1 = new THREE.Vector3().subVectors(corner, start).normalize();
        const dir2 = new THREE.Vector3().subVectors(end, corner).normalize();

        const dist1 = start.distanceTo(corner);
        const dist2 = corner.distanceTo(end);
        const d1 = cfg.depth;
        const d2 = cfg.widthBranchTwo ?? cfg.depth;

        const out: number[] = [];

        // Branch 1: from start to corner, depth = d1.
        // Position = midpoint(start, corner) - start  (local to element root).
        const mid1 = new THREE.Vector3().addVectors(start, corner).multiplyScalar(0.5).sub(start);
        const rot1 = Math.atan2(dir1.x, dir1.z) + Math.PI / 2;
        const sec1 = (cfg.sections && cfg.sections.length > 0)
            ? cfg.sections.map((s: WardrobeSection) => ({
                width: s.width, door: adaptDoor(s.doorType),
            }))
            : [{ width: dist1, door: 'double-hinged' as SymDoor }];
        const sumS1 = sec1.reduce((a, s) => a + s.width, 0);
        if (sumS1 > 0) sec1.forEach(s => { s.width *= dist1 / sumS1; });
        this._drawArm(out, dist1, d1, sec1, {
            offsetX: mid1.x, offsetZ: mid1.z, rotY: rot1,
        });

        // Branch 2: from corner to end, depth = d2.
        const mid2 = new THREE.Vector3().addVectors(corner, end).multiplyScalar(0.5).sub(start);
        const rot2 = Math.atan2(dir2.x, dir2.z) + Math.PI / 2;
        const sideSecs = (cfg as any).sideSections as WardrobeSection[] | undefined;
        const sec2 = (sideSecs && sideSecs.length > 0)
            ? sideSecs.map(s => ({ width: s.width, door: adaptDoor(s.doorType) }))
            : [{ width: dist2, door: 'double-hinged' as SymDoor }];
        const sumS2 = sec2.reduce((a, s) => a + s.width, 0);
        if (sumS2 > 0) sec2.forEach(s => { s.width *= dist2 / sumS2; });
        this._drawArm(out, dist2, d2, sec2, {
            offsetX: mid2.x, offsetZ: mid2.z, rotY: rot2,
        });

        // Optional corner module (small square at the inside corner) for
        // 'corner-module' behaviour.  Drawn relative to the corner point.
        if (cfg.cornerBehavior === 'corner-module') {
            const cm = new THREE.Vector3().subVectors(corner, start);
            const seg: Seg = (ax, az, bx, bz) =>
                WardrobePlanSymbolBuilder._seg(out, ax, az, bx, bz);
            const half1 = d1 / 2, half2 = d2 / 2;
            // Square footprint d1 × d2 centred on the corner point.
            seg(cm.x - half2, cm.z - half1, cm.x + half2, cm.z - half1);
            seg(cm.x + half2, cm.z - half1, cm.x + half2, cm.z + half1);
            seg(cm.x + half2, cm.z + half1, cm.x - half2, cm.z + half1);
            seg(cm.x - half2, cm.z + half1, cm.x - half2, cm.z - half1);
        }

        return out;
    }

    /** Parametric cabinet layouts.
     *  Engine local frame: origin = root, main arm along ±X with back at -Z.
     *  Left arm rotated +π/2 about Y, positioned at (-mainLen/2 + dep/2,
     *  0, dep/2 + leftLen/2).  Right arm rotated -π/2 about Y, positioned
     *  at (mainLen/2 - dep/2, 0, dep/2 + rightLen/2).  We replicate that
     *  exact placement here. */
    private _buildParametric(w: FurnitureData): number[] {
        const cfg = w.wardrobeCabinetConfig as WardrobeCabinetConfig | undefined;
        if (!cfg) return [];

        const dep    = cfg.depth;
        const mainW  = cfg.length;
        const layout = cfg.layoutType;
        const isL    = layout === 'wardrobe_l_shape' || layout === 'wardrobe_l_shape_tall';
        const isU    = layout === 'wardrobe_u_shape' || layout === 'wardrobe_u_shape_tall';
        const hasLeft  = isL || isU;
        const hasRight = isU;

        const allSecs = cfg.sections ?? [];
        const mainSecCfgs  = allSecs.filter(s => s.arm === 'main');
        const leftSecCfgs  = allSecs.filter(s => s.arm === 'left');
        const rightSecCfgs = allSecs.filter(s => s.arm === 'right');

        const mkSecs = (
            cfgs:  WardrobeSectionConfig[],
            count: number,
            armW:  number,
        ): { width: number; door: SymDoor }[] => {
            const n = Math.max(1, count);
            const sectionWidth = armW / n;
            const result: { width: number; door: SymDoor }[] = [];
            for (let i = 0; i < n; i++) {
                const sc = cfgs[i];
                result.push({
                    width: sectionWidth,
                    door:  adaptDoor(sc?.doorType),
                });
            }
            return result;
        };

        const out: number[] = [];

        // ── Main arm ─────────────────────────────────────────────────────
        const mainSecs = mkSecs(mainSecCfgs, cfg.numSections, mainW);
        this._drawArm(out, mainW, dep, mainSecs);

        // ── Left arm ─────────────────────────────────────────────────────
        if (hasLeft && cfg.lengthLeft) {
            const leftLen = cfg.lengthLeft;
            const leftN   = cfg.numSectionsLeft ?? 2;
            const leftSecs = mkSecs(leftSecCfgs, leftN, leftLen);
            this._drawArm(out, leftLen, dep, leftSecs, {
                offsetX: -mainW / 2 + dep / 2,
                offsetZ:  dep / 2 + leftLen / 2,
                rotY:     Math.PI / 2,
            });
        }

        // ── Right arm ────────────────────────────────────────────────────
        if (hasRight && cfg.lengthRight) {
            const rightLen = cfg.lengthRight;
            const rightN   = cfg.numSectionsRight ?? 2;
            const rightSecs = mkSecs(rightSecCfgs, rightN, rightLen);
            this._drawArm(out, rightLen, dep, rightSecs, {
                offsetX:  mainW / 2 - dep / 2,
                offsetZ:  dep / 2 + rightLen / 2,
                rotY:    -Math.PI / 2,
            });
        }

        return out;
    }
}

/**
 * Singleton — imported by EdgeProjectorService and called once per plan view
 * after the base mesh-edge projection completes.
 */
export const wardrobePlanSymbolBuilder = new WardrobePlanSymbolBuilder();
