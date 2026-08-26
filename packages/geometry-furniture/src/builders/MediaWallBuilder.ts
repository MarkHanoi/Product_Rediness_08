// F1.3 (2026-05-30) — Media wall builders: tv + tv_unit
// (APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.2.3)
// §TVFURN114 (founder, 2026-08-26) — + tv_lowboard + tv_console_slat, the
// LOD 300 TV-furniture family from the founder's three reference images.
//
// Architectural intent:
//   • tv: wall-mounted flat panel — 1400 × 80 × 800 mm bezel-thin slab
//     hovering 1.2 m above the floor (eye level when seated on a 450 mm
//     sofa cushion ~1 m back).
//   • tv_unit: low media console — 1600 × 400 × 500 mm with two cabinet
//     bays + a centred AV shelf. Sits under the TV; the unit's TOP face
//     supports decor like the TV remote, a console gaming machine, etc.
//   • tv_lowboard: parametric MODULAR lowboard — a run of BAYS, each bay a
//     drawer stack / open shelf / cupboard door, on slim feet. Bay count and
//     bay width are parametric (`properties.bayCount` / `properties.bayWidth`,
//     see resolveLowboardBays); carcass + front materials are independently
//     changeable through the C100 §2.1 ladder (see build()). As
//     `tv_lowboard_tv` (a TYPE — placement resolves descriptor defaults BY
//     TYPE, so a same-type card could not carry the screen; `properties.withTv`
//     remains the parametric road) the SAME element carries a TV standing on
//     its top — composed by reusing TvBuilder's own geometry (C84 EI-9: one
//     TV silhouette in this repository, not a rival), the §DESK108
//     set-is-ONE-element precedent (a dining set carries its chairs; a media
//     unit carries its screen). A placement macro minting two elements was
//     rejected: every live placement route (carousel drag-drop, plan tool)
//     creates ONE FurnitureData, and one element = one undo entry for free.
//   • tv_console_slat: low console with ROUNDED ENDS wrapped in vertical
//     timber slats over a recessed plinth. Slat COUNT derives from the ring
//     perimeter at CONSTANT slat width (§CARPET97 discipline: resizing adds
//     slats, never stretches them — slatCountForPerimeter is the exported,
//     testable rule).
//
// One builder file, four variants discriminated on data.furnitureType
// (mirrors the F1.2 BookshelfBuilder pattern). §DESK108 mesh discipline for
// the two new pieces: ONE mesh per MATERIAL GROUP via mergedPartKit, members
// (panel gauges, slat section, foot section) constant under resize.

import * as THREE from '@pryzm/renderer-three/three';
import { markSharedGpuResource } from '@pryzm/renderer-three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { boxAt, cylAt, mergePartsToMesh } from './mergedPartKit';
import { resolveFurnitureColour } from '../furnitureMaterialColour';

/**
 * §TVFURN114 — module-shared TV screen material (emissive dark glass).
 * MaterialService.getMaterial() cannot carry emissive/metalness parameters, so
 * this special material lives in the blessed module-level shared cache
 * (markSharedGpuResource → the disposal seam never reaps it under an element).
 * ONE instance serves every TV and every lowboard-with-TV in the process.
 */
let _screenMat: THREE.MeshStandardMaterial | undefined;
function getSharedScreenMaterial(): THREE.MeshStandardMaterial {
    if (!_screenMat) {
        _screenMat = markSharedGpuResource(new THREE.MeshStandardMaterial({
            color: 0x0e1a26,
            emissive: 0x0a141e,
            emissiveIntensity: 0.05,
            roughness: 0.12,
            metalness: 0.55,
        }));
    }
    return _screenMat;
}

export class TvBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // panel width along the wall
        const length = data.length;   // panel depth (thin)
        const height = data.height;   // panel vertical extent
        // A.21.D15 — FLOOR-RELATIVE geometry. The wall-mount eye-level height
        // (1.20 m, baseOffset on the tv footprint/payload) is applied ONCE on
        // the group root by FurnitureFragmentBuilder. Previously this hardcoded
        // 1.20 m INSIDE the geometry AND the root added the baseOffset, so the
        // TV floated at floor + 1.20 + 1.20 (+ the old position.y double-count).
        const PANEL_BOTTOM = 0;

        // Bezel + screen materials. The screen is the ONE special-parameter
        // material in this family (emissive glass); §TVFURN114 hoisted it from
        // a per-build mint (the L-11384/L-11421 per-instance leak class — every
        // TV used to mint its own) to the module-shared markSharedGpuResource
        // cache, the same pattern KitchenCabinetEngine/foliageCards use.
        const bezelMat = this.materialService.getMaterial(0x0a0a0a, 'standard') as THREE.MeshStandardMaterial;
        const screenMat = getSharedScreenMaterial();

        // Bezel slab.
        const bezelGeo = new THREE.BoxGeometry(width, height, length);
        const bezel = new THREE.Mesh(bezelGeo, bezelMat);
        bezel.position.set(0, PANEL_BOTTOM + height / 2, 0);
        group.add(bezel);

        // Inset screen slightly proud of the bezel front face.
        const SCREEN_INSET = 0.04;
        const screenW = width - SCREEN_INSET * 2;
        const screenH = height - SCREEN_INSET * 2;
        const screenGeo = new THREE.BoxGeometry(screenW, screenH, length * 0.4);
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, PANEL_BOTTOM + height / 2, length / 2 + length * 0.05);
        group.add(screen);

        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}

export class TvUnitBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;     // along the wall, e.g. 1.6 m
        const length = data.length;   // depth into the room, e.g. 0.4 m
        const height = data.height;   // unit top above floor, e.g. 0.5 m

        let frameColor = 0x5a3a1d;
        if (data.material === 'metal') frameColor = 0x404040;
        if (data.material === 'fabric') frameColor = 0x3a3a3a;
        const frameMat = this.materialService.getMaterial(frameColor, 'standard') as THREE.MeshStandardMaterial;
        const knobMat = this.materialService.getMaterial(0x9c8b6a, 'standard') as THREE.MeshStandardMaterial;

        const PANEL_THK = 0.02;

        // Main body — solid box, then knobs + a centre vertical divider painted
        // on the front face define the two cabinet bays.
        const bodyGeo = new THREE.BoxGeometry(width, height, length);
        const body = new THREE.Mesh(bodyGeo, frameMat);
        body.position.set(0, height / 2, 0);
        group.add(body);

        // Door reveals — thin recessed plates on the front face that read as
        // cabinet doors. Two bays split by a centred vertical divider.
        const doorH = height * 0.85;
        const doorW = (width - PANEL_THK * 3) / 2;
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, PANEL_THK);
        // Slightly darker than the body for subtle visual division.
        const doorMat = this.materialService.getMaterial(
            Math.max(0, frameColor - 0x101010), 'standard',
        ) as THREE.MeshStandardMaterial;
        for (const sx of [-1, 1]) {
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(
                sx * (doorW / 2 + PANEL_THK / 2),
                height / 2,
                length / 2 + PANEL_THK / 2,
            );
            group.add(door);
        }

        // Two small round knobs centred on the doors.
        const knobGeo = new THREE.SphereGeometry(0.018, 12, 10);
        for (const sx of [-1, 1]) {
            const knob = new THREE.Mesh(knobGeo, knobMat);
            knob.position.set(
                sx * (doorW * 0.35),
                height / 2,
                length / 2 + PANEL_THK + 0.01,
            );
            group.add(knob);
        }

        group.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
                o.userData = { ...o.userData, edgeAngleDeg: 30 };
            }
        });

        return group;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// §TVFURN114 (founder, 2026-08-26) — the LOD 300 TV-furniture family.
// ═════════════════════════════════════════════════════════════════════════════

// ── Members (metres) — CONSTANT under resize (§DESK108 rule) ─────────────────
const LB_PANEL    = 0.018;  // carcass panel gauge
const LB_TOP_T    = 0.022;  // top slab
const LB_FRONT_T  = 0.018;  // drawer/door front
const LB_REVEAL   = 0.004;  // shadow gap around fronts
const LB_FOOT_H   = 0.10;   // slim foot height
const LB_FOOT_SQ  = 0.035;  // foot cross-section
const LB_HANDLE_LEN = 0.11; // handle bar length
const LB_HANDLE_SQ  = 0.011;

export const SLAT_WIDTH = 0.038;  // one timber slat — never stretches
export const SLAT_PITCH = 0.052;  // slat width + constant gap
const SLAT_T    = 0.018;          // slat thickness (into the body)
const SC_TOP_T  = 0.025;          // console top slab
const SC_PLINTH_H = 0.05;         // recessed plinth height
const SC_PLINTH_INSET = 0.03;     // plinth setback behind the slat face

// ── Part-family default colours (MaterialService keys — shared, cached) ──────
const COL_LOWBOARD_OAK = 0xb08a5a; // same oak family as §DESK108
const COL_CONSOLE_TEAK = 0x9a7448; // warm slat timber
const COL_CONSOLE_CORE = 0x241f19; // dark core + plinth behind the slats
const COL_TV_DARK      = 0x0a0a0a; // TV bezel / stand black (TvBuilder's own)

/** '#rrggbb' → number, or the fallback when absent/unparseable. */
function hexToInt(hex: string | undefined, fallback: number): number {
    if (!hex) return fallback;
    const n = parseInt(hex.replace('#', ''), 16);
    return Number.isFinite(n) ? n : fallback;
}

/** The lowboard type that SEEDS the incorporated screen (typed `string` so the
 *  comparison is valid whether or not the union has been minted yet). */
const LOWBOARD_WITH_TV_TYPE: string = 'tv_lowboard_tv';

/** What one lowboard bay is fronted with. */
export type LowboardBayKind = 'drawer' | 'open' | 'door';

/**
 * §TVFURN114 — THE BAY RULE, exported so tests pin it as data.
 *
 * `properties.bayWidth` (metres) OUTRANKS `properties.bayCount`: when a bay
 * width is given the count DERIVES from the inner run at that width (the same
 * derive-count-from-length shape as the slat rule below); otherwise
 * `properties.bayCount` is used directly. Both clamp to 2..8. The realised bay
 * width is always `innerWidth / count` — bays fill the run exactly.
 *
 * `properties.bayPattern` is a string over {d, o, c} (drawer / open / cupboard
 * door), cycled to the bay count; unknown characters read as 'd'. Default
 * pattern: "doc" cycled — a 4-bay unit reads drawer, open, door, drawer.
 */
export function resolveLowboardBays(
    innerWidth: number,
    properties: Readonly<Record<string, string | number | boolean | null>>,
): LowboardBayKind[] {
    const clamp = (n: number): number => Math.min(8, Math.max(2, Math.round(n)));
    const bayWidth = typeof properties['bayWidth'] === 'number' ? properties['bayWidth'] as number : 0;
    const bayCount = typeof properties['bayCount'] === 'number' ? properties['bayCount'] as number : 0;
    const count = bayWidth > 0.05
        ? clamp(innerWidth / bayWidth)
        : clamp(bayCount > 0 ? bayCount : 4);

    const raw = typeof properties['bayPattern'] === 'string' && (properties['bayPattern'] as string).length > 0
        ? (properties['bayPattern'] as string).toLowerCase()
        : 'doc';
    const kinds: LowboardBayKind[] = [];
    for (let i = 0; i < count; i++) {
        const ch = raw[i % raw.length];
        kinds.push(ch === 'o' ? 'open' : ch === 'c' ? 'door' : 'drawer');
    }
    return kinds;
}

/**
 * §TVFURN114 — THE SLAT RULE (§CARPET97 discipline), exported for tests.
 * The slat ring is walked at the slat CENTRELINE; its perimeter for a
 * width × depth stadium console is `2·(w − d) + π·(d − SLAT_T)`. Count =
 * `max(8, round(perimeter / SLAT_PITCH))` — resizing changes the COUNT at
 * constant slat width, it never stretches a slat.
 */
export function slatRingPerimeter(width: number, depth: number): number {
    const d = Math.min(depth, width);
    return 2 * (width - d) + Math.PI * (d - SLAT_T);
}

export function slatCountForPerimeter(perimeter: number): number {
    return Math.max(8, Math.round(perimeter / SLAT_PITCH));
}

/**
 * §TVFURN114 piece 1+2 — "Modular Lowboard" (`tv_lowboard`), default
 * 2.0 × 0.42 × 0.55 m. A run of parametric BAYS between 18 mm carcass panels
 * on slim feet; fronts sit PROUD of the carcass exactly as the ancestor
 * TvUnitBuilder's doors do. Meshes: carcass / fronts / handles (≤3), plus
 * tv-stand / bezel / screen (≤6 total) as `tv_lowboard_tv` or when
 * `properties.withTv === true` (an explicit boolean outranks the type's seed).
 *
 * MATERIAL SLOTS (both changeable, one ladder — C100 §2.1):
 *   carcass — `data.color`, which FurnitureFragmentBuilder has ALREADY pushed
 *             through the resolveFurnitureColour ladder (materialId → colour);
 *   front   — `properties.frontMaterialId` / `properties.frontColor`, pushed
 *             through the SAME resolveFurnitureColour authority here (no second
 *             ladder is minted; an unresolvable id paints C100 §5 magenta).
 *             Absent both, the front derives from the carcass exactly as the
 *             ancestor TvUnitBuilder derives its door tint (−0x101010).
 */
export class LowboardBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = Math.max(data.width, 0.80);
        const L = Math.max(data.length, 0.30);
        const H = Math.max(data.height, 0.35);

        const carcassCol = hexToInt(data.color, COL_LOWBOARD_OAK);
        const frontResolved = resolveFurnitureColour({
            materialId: typeof data.properties['frontMaterialId'] === 'string'
                ? data.properties['frontMaterialId'] as string : undefined,
            color: typeof data.properties['frontColor'] === 'string'
                ? data.properties['frontColor'] as string : undefined,
        });
        const frontCol = frontResolved !== undefined
            ? hexToInt(frontResolved, COL_LOWBOARD_OAK)
            : Math.max(0, carcassCol - 0x101010);   // the TvUnitBuilder door tint
        const carcassMat = this.materialService.getMaterial(carcassCol, 'standard');
        const frontMat   = this.materialService.getMaterial(frontCol, 'standard');
        const handleMat  = this.materialService.getMaterial(0, 'handle');

        const bodyH  = Math.max(H - LB_FOOT_H, 0.20);
        const footH  = H - bodyH;                 // degenerate heights shrink the feet, not the body
        const innerW = W - 2 * LB_PANEL;
        const innerH = bodyH - LB_TOP_T - LB_PANEL;
        const innerY = footH + LB_PANEL + innerH / 2;

        const kinds = resolveLowboardBays(innerW, data.properties);
        const bayW  = innerW / kinds.length;

        // ── Carcass — ONE merged mesh ────────────────────────────────────────
        const carcass: THREE.BufferGeometry[] = [
            boxAt(W, LB_TOP_T, L, 0, H - LB_TOP_T / 2, 0),                          // top
            boxAt(W, LB_PANEL, L, 0, footH + LB_PANEL / 2, 0),                      // bottom
            boxAt(LB_PANEL, innerH, L,  (W - LB_PANEL) / 2, innerY, 0),             // side R
            boxAt(LB_PANEL, innerH, L, -(W - LB_PANEL) / 2, innerY, 0),             // side L
            boxAt(innerW, innerH, LB_PANEL, 0, innerY, -(L - LB_PANEL) / 2),        // back
        ];
        for (let k = 1; k < kinds.length; k++) {                                    // dividers
            carcass.push(boxAt(LB_PANEL, innerH, L - LB_PANEL,
                -innerW / 2 + k * bayW, innerY, LB_PANEL / 2));
        }
        kinds.forEach((kind, i) => {                                                // open-bay shelves
            if (kind !== 'open') return;
            carcass.push(boxAt(bayW - LB_PANEL, LB_PANEL, L - LB_PANEL,
                -innerW / 2 + (i + 0.5) * bayW, innerY, LB_PANEL / 2));
        });
        // Slim feet — corner pairs, plus a centre pair on long runs. The foot
        // SECTION is a member (constant); the COUNT derives from the width.
        const footXs = [-(W / 2 - 0.06), W / 2 - 0.06];
        if (W > 1.6) footXs.push(0);
        for (const fx of footXs) {
            for (const fz of [-(L / 2 - 0.05), L / 2 - 0.05]) {
                carcass.push(boxAt(LB_FOOT_SQ, footH, LB_FOOT_SQ, fx, footH / 2, fz));
            }
        }
        group.add(mergePartsToMesh(carcass, carcassMat, 'carcass'));

        // ── Fronts + handles — one merged mesh each ─────────────────────────
        const fronts: THREE.BufferGeometry[] = [];
        const handles: THREE.BufferGeometry[] = [];
        const frontZ  = L / 2 + LB_FRONT_T / 2;                 // proud, like the ancestor's doors
        const handleZ = L / 2 + LB_FRONT_T + LB_HANDLE_SQ / 2;
        kinds.forEach((kind, i) => {
            const cx = -innerW / 2 + (i + 0.5) * bayW;
            const fw = bayW - LB_REVEAL;
            if (kind === 'drawer') {
                const fh = (innerH - 3 * LB_REVEAL) / 2;
                for (const row of [0, 1]) {
                    const fy = innerY - innerH / 2 + LB_REVEAL + fh / 2 + row * (fh + LB_REVEAL);
                    fronts.push(boxAt(fw, fh, LB_FRONT_T, cx, fy, frontZ));
                    handles.push(boxAt(LB_HANDLE_LEN, LB_HANDLE_SQ, LB_HANDLE_SQ,
                        cx, fy + fh / 2 - 0.025, handleZ));
                }
            } else if (kind === 'door') {
                fronts.push(boxAt(fw, innerH - 2 * LB_REVEAL, LB_FRONT_T, cx, innerY, frontZ));
                handles.push(boxAt(LB_HANDLE_SQ, LB_HANDLE_LEN, LB_HANDLE_SQ,
                    cx + fw / 2 - 0.03, innerY, handleZ));
            }
        });
        if (fronts.length > 0)  group.add(mergePartsToMesh(fronts, frontMat, 'fronts'));
        if (handles.length > 0) group.add(mergePartsToMesh(handles, handleMat, 'handles'));

        // ── The incorporated TV (piece 2) — TvBuilder's OWN geometry ────────
        // `tv_lowboard_tv` is the carousel's road to this composition (a TYPE:
        // placement resolves descriptor defaults BY TYPE — the first card
        // registered for a type wins — so a same-type card carrying
        // `withTv: true` would have placed WITHOUT its screen). The parametric
        // road is `properties.withTv` (inspector / RAC); an explicit boolean
        // wins over the type's seed either way.
        const withTv = typeof data.properties['withTv'] === 'boolean'
            ? data.properties['withTv'] as boolean
            : data.furnitureType === LOWBOARD_WITH_TV_TYPE;
        if (withTv) {
            const tvW = Math.min(1.4, W * 0.62);
            const tvH = tvW * 0.58;               // 16:9 panel + bezel margin
            const STAND_H = 0.09;
            const darkMat = this.materialService.getMaterial(COL_TV_DARK, 'standard');
            group.add(mergePartsToMesh([
                boxAt(0.34, 0.012, 0.20, 0, H + 0.006, 0),          // foot plate
                boxAt(0.10, STAND_H, 0.045, 0, H + STAND_H / 2, 0), // column
            ], darkMat, 'tv-stand'));

            const tv = new TvBuilder(this.materialService).build({
                ...data,
                furnitureType: 'tv',
                width: tvW, height: tvH, length: 0.08,
                properties: {},
            });
            tv.position.set(0, H + STAND_H, 0);
            group.add(tv);
        }

        group.userData = {
            role: 'tv_furniture', variant: 'lowboard',
            withTv,
            bayCount: kinds.length,
        };
        return group;
    }
}

/**
 * §TVFURN114 piece 3 — "Slat Console" (`tv_console_slat`), default
 * 1.5 × 0.4 × 0.45 m. A stadium-plan (fully ROUNDED ENDS) low console wrapped
 * in vertical timber slats over a recessed dark plinth, dark core behind the
 * slat gaps, timber top. Meshes: top / slats (timber) + core / plinth (dark)
 * = 4. Slat count follows slatCountForPerimeter — the §CARPET97 rule.
 *
 * Material: `data.color` (ladder-resolved upstream) drives the TIMBER read
 * (top + slats); core and plinth stay the dark shadow family.
 */
export class SlatConsoleBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = Math.max(data.width, 0.60);
        const D = Math.min(Math.max(data.length, 0.30), W);   // rounded ends need D ≤ W
        const H = Math.max(data.height, 0.30);

        const timberMat = this.materialService.getMaterial(
            hexToInt(data.color, COL_CONSOLE_TEAK), 'standard');
        const darkMat = this.materialService.getMaterial(COL_CONSOLE_CORE, 'standard');

        const R  = D / 2;               // end radius
        const S  = W - D;               // straight run
        const Rc = R - SLAT_T / 2;      // slat centreline radius
        const slatH = H - SC_TOP_T - SC_PLINTH_H;
        const slatY = SC_PLINTH_H + slatH / 2;

        // ── Slat ring — ONE merged mesh, count from the exported rule ───────
        const perim = slatRingPerimeter(W, D);
        const n     = slatCountForPerimeter(perim);
        const pitch = perim / n;
        const arc   = Math.PI * Rc;     // one rounded end, centreline
        const slats: THREE.BufferGeometry[] = [];
        for (let i = 0; i < n; i++) {
            const s = (i + 0.5) * pitch;
            let x: number, z: number, yaw: number;
            if (s < S) {                                   // front run
                x = -S / 2 + s; z = Rc; yaw = 0;
            } else if (s < S + arc) {                      // right end
                const phi = (s - S) / Rc;
                x = S / 2 + Rc * Math.sin(phi); z = Rc * Math.cos(phi); yaw = phi;
            } else if (s < 2 * S + arc) {                  // back run
                x = S / 2 - (s - S - arc); z = -Rc; yaw = Math.PI;
            } else {                                       // left end
                const phi = (s - 2 * S - arc) / Rc;
                x = -S / 2 - Rc * Math.sin(phi); z = -Rc * Math.cos(phi); yaw = Math.PI + phi;
            }
            slats.push(boxAt(SLAT_WIDTH, slatH, SLAT_T, x, slatY, z, { y: yaw }));
        }
        group.add(mergePartsToMesh(slats, timberMat, 'slats'));

        // ── Top slab — stadium: centre box + two rounded ends ───────────────
        const stadium = (
            width: number, height: number, radius: number, y: number,
        ): THREE.BufferGeometry[] => {
            const parts: THREE.BufferGeometry[] = [];
            const run = width - 2 * radius;
            if (run > 1e-6) parts.push(boxAt(run, height, radius * 2, 0, y, 0));
            for (const sx of [-1, 1]) {
                parts.push(cylAt(radius, radius, height, sx * run / 2, y, 0, 24));
            }
            return parts;
        };
        group.add(mergePartsToMesh(
            stadium(W, SC_TOP_T, R, H - SC_TOP_T / 2), timberMat, 'top'));

        // ── Dark core behind the slat gaps + recessed plinth ────────────────
        group.add(mergePartsToMesh(
            stadium(W - 2 * SLAT_T - 0.006, slatH, R - SLAT_T - 0.003, slatY),
            darkMat, 'core'));
        group.add(mergePartsToMesh(
            stadium(
                W - 2 * (SLAT_T + SC_PLINTH_INSET), SC_PLINTH_H,
                R - SLAT_T - SC_PLINTH_INSET, SC_PLINTH_H / 2,
            ),
            darkMat, 'plinth'));

        group.userData = { role: 'tv_furniture', variant: 'slat_console', slatCount: n };
        return group;
    }
}
