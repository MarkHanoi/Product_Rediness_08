/**
 * §DESK108 (founder, 2026-08-26) — the dining half of the lane: one LOD 300
 * extending table and three dining SETS, from the founder's five reference
 * images ("use an existing dining table and create those new sets — all
 * according to the contracts").
 *
 * ═══ WHAT A "SET" IS HERE — the decision, stated ══════════════════════════
 * Two live precedents exist: (a) the KITCHEN — ONE furniture element whose
 * sub-units are internal (C104); (b) separate elements placed together (what
 * the furnish engine does, §DINING-CHAIRS-ARE-ELEMENTS). The three table+chair
 * sets below follow (a): ONE `dining_set_*` element, chairs built INTO the
 * group by the set's own builder, chair count a PARAMETER
 * (`properties.chairCount`, clamped 1..12, defaults 4/6/8). Rationale: the
 * founder asked for "sets" as catalogue items — one card, one drop, one undo,
 * one element to move — and per-chair selection inside a set is the same
 * follow-up Tab-descend already owed to kitchens (named OPEN in the lane
 * report; it is NOT wired here, exactly as it is not wired for wardrobes).
 * This does NOT touch §DINING-CHAIRS-ARE-ELEMENTS: `dining_table` still
 * builds only the table and the furnish engine still places separate
 * `dining_chair` elements; the sets are ADDITIONAL catalogue items.
 * The founder's item 4 (mirror + table + chairs + rug composed block) crosses
 * hosting rules (a wall-hosted mirror inside a floor element) and is a
 * PLACEMENT MACRO, not a builder — deliberately NOT built here; see the lane
 * report / ISSUE-LOG row.
 *
 * ═══ Footprint convention ═════════════════════════════════════════════════
 * `data.width/length` are the TABLE footprint (what you size when you size a
 * dining table); tucked chairs overhang each long side by ~0.26 m. Selection
 * boxes derive from built geometry (Box3.setFromObject), so the chairs are
 * inside the selectable bounds.
 *
 * ═══ Perf (the founder's own emphasis: "maximum performance") ═════════════
 * One mesh per MATERIAL GROUP via `mergedPartKit` — a six-chair set's shells
 * are ONE mesh, its 24 dowel legs are ONE mesh:
 *   dining_table_extending — 2 meshes,  ~192 tris
 *   dining_set_rustic      — 3 meshes,  ~840 tris  (4 chairs default)
 *   dining_set_modern      — 5 meshes, ~1350 tris  (6 chairs default)
 *   dining_set_shell       — 3 meshes, ~1390 tris  (8 chairs default)
 *
 * ═══ Parametric rule ══════════════════════════════════════════════════════
 * Resizing scales the LAYOUT (top spans, leg positions, chair spacing), never
 * the MEMBERS (leg sections, top thickness, chair dimensions — a chair is a
 * standard-sized object whatever the table). Chair count changes geometry
 * linearly (tested: 8 shells carry exactly 2× the vertices of 4).
 *
 * C84 EI-9 (one vocabulary): the quilted shell chair of the modern set and
 * the grey moulded shell of the 8-seat set are ONE `shellChairParts()`
 * function — the grey shell is honestly a material + quilting variant of the
 * same silhouette, not a second builder.
 *
 * Staging in the founder's reference images (place settings, plants, pendant
 * luminaires) is scene dressing, NOT part of these families — its absence is
 * deliberate, not a defect.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { boxAt, cylAt, placeParts, mergePartsToMesh } from './mergedPartKit';

// ── Part-family colours (MaterialService keys — shared, cached) ──────────────
const COL_PAINTED   = 0x9b9b93;  // extending table — painted grey
const COL_PALE_OAK  = 0xd9c9a9;  // rustic set — pale timber
const COL_OAK       = 0xb08a5a;  // modern / shell tables + chair dowels
const COL_STEEL     = 0x1f1f1f;  // modern table's thin black frame
const COL_UPHOLSTER = 0x8f7f6a;  // quilted shell — warm taupe upholstery
const COL_QUILT     = 0x6d5f4e;  // quilting channel seams
const COL_GREY_PP   = 0x9aa0a3;  // grey moulded shell
// §FURN123 (founder, 2026-08-26) — cafe/bistro table palette.
const COL_LAMINATE  = 0xe8e4dc;  // square variant — white laminate top
const COL_CHROME    = 0xc9cdd0;  // square variant — chrome pedestal
const COL_MARBLE    = 0xd9d6d0;  // marble variant — grey-white stone-look top
const COL_MATTE_BLK = 0x1c1c1c;  // marble variant — matte black pedestal

/** Guard degenerate store values (not a resize clamp). */
function tableDims(data: FurnitureData): { W: number; L: number; H: number } {
    return {
        W: Math.max(data.width, 1.10),
        L: Math.max(data.length, 0.70),
        H: Math.max(data.height, 0.60),
    };
}

/** `properties.chairCount` override, clamped 1..12; else the set's default. */
export function chairCountOf(data: FurnitureData, dflt: number): number {
    const raw = data.properties?.['chairCount'];
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : dflt;
    return Math.min(12, Math.max(1, n));
}

/**
 * Deterministic seat placement around a W × L table: chairs split evenly
 * along the two long sides (an odd remainder takes the +x head), tucked so
 * the seat front sits under the table edge. Local chair convention: built at
 * the origin FACING +z; rotY turns that facing toward the table.
 */
export function chairPlacements(
    count: number, tableW: number, tableL: number,
): ReadonlyArray<{ x: number; z: number; rotY: number }> {
    const out: Array<{ x: number; z: number; rotY: number }> = [];
    const perSide = Math.floor(count / 2);
    const usable = Math.max(0.6, tableW - 0.5);
    for (let i = 0; i < perSide; i++) {
        const x = -usable / 2 + usable * (i + 0.5) / perSide;
        out.push({ x, z: -(tableL / 2 + 0.05), rotY: 0 });        // far side faces +z
        out.push({ x, z: +(tableL / 2 + 0.05), rotY: Math.PI });  // near side faces −z
    }
    if (count % 2 === 1) {
        out.push({ x: tableW / 2 + 0.05, z: 0, rotY: -Math.PI / 2 }); // head faces −x
    }
    return out;
}

// ── Chair bodies (local space, origin between the legs, facing +z) ───────────
// Fixed member sizes: a chair does not grow when the table does.

const rotYZ = (y: number, z: number, theta: number): { y: number; z: number } => ({
    y: y * Math.cos(theta) - z * Math.sin(theta),
    z: y * Math.sin(theta) + z * Math.cos(theta),
});

/**
 * The shell chair (C84 EI-9 — ONE function, two reads):
 *  • quilted=true  — upholstered shell + 3 quilting channel seams (modern set)
 *  • quilted=false — plain moulded shell (grey 8-seat set)
 * Returns geometry batches per material family; caller places + merges.
 */
export function shellChairParts(quilted: boolean): {
    shell: THREE.BufferGeometry[]; seams: THREE.BufferGeometry[]; legs: THREE.BufferGeometry[];
} {
    const TILT = -0.10;                       // backrest lean
    const shell: THREE.BufferGeometry[] = [
        boxAt(0.46, 0.05, 0.42, 0, 0.44, 0),                       // seat pan
        boxAt(0.46, 0.42, 0.05, 0, 0.65, -0.185, { x: TILT }),      // backrest
    ];
    const seams: THREE.BufferGeometry[] = [];
    if (quilted) {
        for (const dy of [-0.12, 0, 0.12]) {
            const off = rotYZ(dy, 0.0335, TILT);                    // on the back's front face
            seams.push(boxAt(0.40, 0.014, 0.012, 0, 0.65 + off.y, -0.185 + off.z, { x: TILT }));
        }
    }
    const legs: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            legs.push(cylAt(0.011, 0.014, 0.44, sx * 0.19, 0.226, sz * 0.16, 8,
                { x: -sz * 0.07, z: sx * 0.07 }));                  // splayed dowels
        }
    }
    return { shell, seams, legs };
}

/** The rustic slatted timber chair — slat seat, 2-slat back, square posts. */
export function slattedChairParts(): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const POST = 0.035;
    for (const sx of [-1, 1]) {
        parts.push(boxAt(POST, 0.45, POST, sx * 0.19, 0.225, 0.17));   // front posts
        parts.push(boxAt(POST, 0.88, POST, sx * 0.19, 0.44, -0.17));   // rear posts (rise to the back)
        parts.push(boxAt(POST, 0.05, 0.34, sx * 0.19, 0.40, 0));       // seat side rails
        parts.push(boxAt(0.02, 0.03, 0.34, sx * 0.19, 0.15, 0));       // lower stretchers
    }
    for (const z of [-0.128, -0.043, 0.043, 0.128]) {
        parts.push(boxAt(0.44, 0.018, 0.076, 0, 0.445, z));            // 4 seat slats
    }
    parts.push(boxAt(0.44, 0.075, 0.018, 0, 0.62, -0.17));             // back slat low
    parts.push(boxAt(0.44, 0.075, 0.018, 0, 0.76, -0.17));             // back slat high
    return parts;
}

/** Stamp one chair's part batches into every placement, concatenated. */
function stampChairs<K extends string>(
    makeParts: () => Record<K, THREE.BufferGeometry[]>,
    placements: ReadonlyArray<{ x: number; z: number; rotY: number }>,
    keys: readonly K[],
): Record<K, THREE.BufferGeometry[]> {
    const out = {} as Record<K, THREE.BufferGeometry[]>;
    for (const k of keys) out[k] = [];
    for (const p of placements) {
        const parts = makeParts();
        for (const k of keys) {
            out[k].push(...placeParts(parts[k], p.rotY, p.x, p.z));
        }
    }
    return out;
}

/**
 * Item 1 — extending frame table (`dining_table_extending`), default
 * 1.8 × 0.9 × 0.76 m, painted grey. Three-segment top (leaf + centre + leaf,
 * 5 mm visible seams), stout 65 mm square legs, apron, and an H-stretcher
 * frame — lower rails all round plus a mid rail — merged to ONE geometry
 * (the founder's own emphasis: not twelve boxes). Table only, no chairs.
 */
export class ExtendingDiningTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = tableDims(data);
        const mat = this.materialService.getMaterial(COL_PAINTED, 'standard');

        const TOPT = 0.035, SEAM = 0.005;
        const leafW = W * 0.27;
        const centreW = W - 2 * leafW - 2 * SEAM;
        const topY = H - TOPT / 2;
        group.add(mergePartsToMesh([
            boxAt(centreW, TOPT, L, 0, topY, 0),
            boxAt(leafW, TOPT, L,  (centreW / 2 + SEAM + leafW / 2), topY, 0),
            boxAt(leafW, TOPT, L, -(centreW / 2 + SEAM + leafW / 2), topY, 0),
        ], mat, 'top'));

        const LEG = 0.065, STR = 0.030;
        const legX = W / 2 - 0.10, legZ = L / 2 - 0.09;
        const legH = H - TOPT;
        const frame: THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                frame.push(boxAt(LEG, legH, LEG, sx * legX, legH / 2, sz * legZ));
            }
        }
        const apronY = H - TOPT - 0.045;
        for (const sz of [-1, 1]) {   // long aprons + long lower rails + mid rail
            frame.push(boxAt(2 * legX - LEG, 0.09, 0.024, 0, apronY, sz * legZ));
            frame.push(boxAt(2 * legX - LEG, STR, STR, 0, 0.14, sz * legZ));
        }
        for (const sx of [-1, 1]) {   // short aprons + short lower rails
            frame.push(boxAt(0.024, 0.09, 2 * legZ - LEG, sx * legX, apronY, 0));
            frame.push(boxAt(STR, STR, 2 * legZ - LEG, sx * legX, 0.14, 0));
        }
        frame.push(boxAt(2 * legX - LEG, STR, STR, 0, 0.14, 0)); // mid rail of the H
        group.add(mergePartsToMesh(frame, mat, 'frame'));

        group.userData = { role: 'dining_table', variant: 'extending', chairCount: 0 };
        return group;
    }
}

/**
 * Item 2 — rustic gateleg set (`dining_set_rustic`), default table
 * 2.0 × 1.0 × 0.75 m + 4 slatted timber chairs, all pale timber. Drop-leaf
 * top (centre + two leaves, visible seams) on a trestle pedestal with
 * fold-out gate legs under each leaf.
 */
export class RusticDiningSetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = tableDims(data);
        const mat = this.materialService.getMaterial(COL_PALE_OAK, 'standard');

        const TOPT = 0.03, SEAM = 0.005;
        const centreW = W * 0.50;
        const leafW = (W - centreW - 2 * SEAM) / 2;
        const topY = H - TOPT / 2;
        group.add(mergePartsToMesh([
            boxAt(centreW, TOPT, L, 0, topY, 0),
            boxAt(leafW, TOPT, L,  (centreW / 2 + SEAM + leafW / 2), topY, 0),
            boxAt(leafW, TOPT, L, -(centreW / 2 + SEAM + leafW / 2), topY, 0),
        ], mat, 'top'));

        // Trestle pedestal + gate legs.
        const plankX = W * 0.18;
        const plankH = H - TOPT - 0.05 - 0.04;   // between foot and bearer
        const base: THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1]) {
            base.push(boxAt(0.055, plankH, L * 0.55, sx * plankX, 0.05 + plankH / 2, 0)); // plank leg
            base.push(boxAt(0.075, 0.05, L * 0.62, sx * plankX, 0.025, 0));               // foot
            base.push(boxAt(0.075, 0.04, L * 0.55, sx * plankX, H - TOPT - 0.02, 0));     // bearer
            // Gate leg under each leaf — swung ~26°, with its short gate rail.
            base.push(boxAt(0.038, H - TOPT - 0.01, 0.038, sx * W * 0.34, (H - TOPT - 0.01) / 2, 0, { y: 0.45 }));
            base.push(boxAt(0.03, 0.03, 0.26, sx * W * 0.34, H * 0.55, 0, { y: 0.45 }));
        }
        base.push(boxAt(2 * plankX - 0.055, 0.035, 0.055, 0, 0.30, 0));                   // centre stretcher
        group.add(mergePartsToMesh(base, mat, 'base'));

        // Chairs — slatted, parametric count (default 4), merged to ONE mesh.
        const count = chairCountOf(data, 4);
        const stamped = stampChairs(
            () => ({ timber: slattedChairParts() }),
            chairPlacements(count, W, L),
            ['timber'],
        );
        group.add(mergePartsToMesh(stamped.timber, mat, 'chairs'));

        group.userData = { role: 'dining_set', variant: 'rustic', chairCount: count };
        return group;
    }
}

/**
 * Item 3 — modern dining set (`dining_set_modern`), default table
 * 2.2 × 1.0 × 0.75 m + 6 QUILTED shell chairs. Oak top on a thin black metal
 * apron frame with turned (tapering) timber legs; chairs are the upholstered
 * shell on splayed oak dowels, quilting read as three channel seams.
 */
export class ModernDiningSetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = tableDims(data);
        const oakMat   = this.materialService.getMaterial(COL_OAK, 'standard');
        const steelMat = this.materialService.getMaterial(COL_STEEL, 'standard');
        const uphMat   = this.materialService.getMaterial(COL_UPHOLSTER, 'standard');
        const quiltMat = this.materialService.getMaterial(COL_QUILT, 'standard');

        // Timber: top + 4 turned legs (taper 38 → 24 mm), one merged mesh.
        const TOPT = 0.028;
        const legH = H - TOPT;
        const timber: THREE.BufferGeometry[] = [
            boxAt(W, TOPT, L, 0, H - TOPT / 2, 0),
        ];
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                timber.push(cylAt(0.038, 0.024, legH, sx * (W / 2 - 0.12), legH / 2, sz * (L / 2 - 0.10), 10));
            }
        }
        group.add(mergePartsToMesh(timber, oakMat, 'timber'));

        // Thin black metal apron frame.
        const apronY = H - TOPT - 0.0225;
        group.add(mergePartsToMesh([
            boxAt(W - 0.24 - 0.076, 0.045, 0.018, 0, apronY,  (L / 2 - 0.10)),
            boxAt(W - 0.24 - 0.076, 0.045, 0.018, 0, apronY, -(L / 2 - 0.10)),
            boxAt(0.018, 0.045, L - 0.20 - 0.076,  (W / 2 - 0.12), apronY, 0),
            boxAt(0.018, 0.045, L - 0.20 - 0.076, -(W / 2 - 0.12), apronY, 0),
        ], steelMat, 'frame'));

        // Chairs — quilted shells (default 6), merged per material family.
        const count = chairCountOf(data, 6);
        const stamped = stampChairs(
            () => shellChairParts(true),
            chairPlacements(count, W, L),
            ['shell', 'seams', 'legs'],
        );
        group.add(mergePartsToMesh(stamped.shell, uphMat, 'shells'));
        group.add(mergePartsToMesh(stamped.seams, quiltMat, 'quilting'));
        group.add(mergePartsToMesh(stamped.legs, oakMat, 'chair_legs'));

        group.userData = { role: 'dining_set', variant: 'modern', chairCount: count };
        return group;
    }
}

/**
 * Item 5 — 8-seat shell set (`dining_set_shell`), default table
 * 2.6 × 1.1 × 0.75 m + 8 GREY moulded shell chairs. Long oak top on four
 * splayed round timber legs; the chair is the SAME shell silhouette as the
 * modern set's (one function — C84 EI-9), un-quilted, in grey.
 */
export class ShellDiningSetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const { W, L, H } = tableDims(data);
        const oakMat   = this.materialService.getMaterial(COL_OAK, 'standard');
        const shellMat = this.materialService.getMaterial(COL_GREY_PP, 'standard');

        // Timber: long top + 4 splayed legs, one merged mesh.
        const TOPT = 0.032;
        const TILT = 0.10;                                    // splay per axis
        const legLen = (H - TOPT) / Math.cos(TILT * Math.SQRT2);
        const timber: THREE.BufferGeometry[] = [
            boxAt(W, TOPT, L, 0, H - TOPT / 2, 0),
        ];
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                timber.push(cylAt(0.024, 0.030, legLen,
                    // +8 mm so the tilted foot's low corner stays ON the floor;
                    // the leg top hides inside the 32 mm slab either way.
                    sx * (W / 2 - 0.18), (H - TOPT) / 2 + 0.008, sz * (L / 2 - 0.12), 10,
                    { x: -sz * TILT, z: sx * TILT }));
            }
        }
        group.add(mergePartsToMesh(timber, oakMat, 'timber'));

        // Chairs — plain grey shells (default 8), merged per material family.
        const count = chairCountOf(data, 8);
        const stamped = stampChairs(
            () => shellChairParts(false),
            chairPlacements(count, W, L),
            ['shell', 'seams', 'legs'],
        );
        group.add(mergePartsToMesh(stamped.shell, shellMat, 'shells'));
        // seams is empty for the un-quilted shell — deliberately not merged
        // (mergePartsToMesh refuses zero parts; an empty mesh would be a lie).
        group.add(mergePartsToMesh(stamped.legs, oakMat, 'chair_legs'));

        group.userData = { role: 'dining_set', variant: 'shell', chairCount: count };
        return group;
    }
}

/**
 * §FURN123 (founder, 2026-08-26) — "Cafe tables. Sofas. Soft furniture,
 * shelves." AUDIT found nothing covering small bistro-style tables (the
 * closest neighbours are the full-size dining tables/sets above and the
 * accent `coffee_table`/`entrance_table` — neither is the round/square
 * ~0.6-0.8 m pedestal table this item asks for), so this is genuinely new,
 * built here rather than a rival file because it shares this file's table
 * vocabulary and colour-constant convention (C84 EI-9).
 *
 * Three variants, ONE class (the §DESK108 per-type-spec-lookup pattern —
 * see WhiteSofaBuilder's DEFAULT_WIDTHS for the precedent):
 *   'cafe_table_round'  — round oak top, black steel pedestal.   Ø 0.70 m.
 *   'cafe_table_square' — square white-laminate top, chrome pedestal. 0.65 m side.
 *   'cafe_table_marble' — round marble-look top, matte-black pedestal. Ø 0.60 m.
 *
 * Construction: a round/square TOP (one mesh) on a weighted-disc-foot +
 * tapered-column PEDESTAL BASE (one merged mesh) — the classic bistro-table
 * silhouette, not a 4-leg frame. 2 meshes total, well inside the ≤3-6 budget.
 * `data.width` is read as the diameter (round) / side (square); `data.length`
 * is unused (the footprint is square in plan either way) — mirrors how the
 * round carpets ignore their unused second axis.
 */
interface CafeTableSpec {
    shape: 'round' | 'square';
    size: number;    // diameter (round) or side length (square), metres
    height: number;
    topColor: number;
    baseColor: number;
}

const CAFE_TABLE_SPECS: Readonly<Record<string, CafeTableSpec>> = {
    cafe_table_round:  { shape: 'round',  size: 0.70, height: 0.75, topColor: COL_OAK,    baseColor: COL_STEEL },
    cafe_table_square: { shape: 'square', size: 0.65, height: 0.75, topColor: COL_LAMINATE, baseColor: COL_CHROME },
    cafe_table_marble: { shape: 'round',  size: 0.60, height: 0.75, topColor: COL_MARBLE, baseColor: COL_MATTE_BLK },
};

/** Guard degenerate store values (not a resize clamp) — mirrors tableDims(). */
function cafeTableDims(data: FurnitureData, spec: CafeTableSpec): { size: number; H: number } {
    return {
        size: Math.max(data.width || spec.size, 0.40),
        H:    Math.max(data.height || spec.height, 0.55),
    };
}

export class CafeTableBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const spec = CAFE_TABLE_SPECS[data.furnitureType] ?? CAFE_TABLE_SPECS['cafe_table_round'];
        const { size, H } = cafeTableDims(data, spec);

        const topMat  = this.materialService.getMaterial(spec.topColor, 'standard');
        const baseMat = this.materialService.getMaterial(spec.baseColor, 'standard');

        // ── Top — ONE mesh, round (32-segment cylinder) or square (slab) ────
        const TOPT = spec.shape === 'round' ? 0.04 : 0.035;
        const topY = H - TOPT / 2;
        const topPart = spec.shape === 'round'
            ? cylAt(size / 2, size / 2, TOPT, 0, topY, 0, 32)
            : boxAt(size, TOPT, size, 0, topY, 0);
        group.add(mergePartsToMesh([topPart], topMat, 'top'));

        // ── Pedestal base — weighted foot disc + tapered column + a small
        // mounting collar under the top, ONE merged mesh (metal) ───────────
        const footR   = Math.max(size * 0.5 * 0.55, 0.16);
        const footH   = 0.03;
        const colRTop = 0.035;
        const colRBot = 0.045;
        const colH    = H - TOPT - footH;
        const base: THREE.BufferGeometry[] = [
            cylAt(footR, footR, footH, 0, footH / 2, 0, 24),                    // weighted foot disc
            cylAt(colRTop, colRBot, colH, 0, footH + colH / 2, 0, 16),          // tapered column
            cylAt(0.065, 0.065, 0.012, 0, H - TOPT - 0.006, 0, 24),             // mounting collar
        ];
        group.add(mergePartsToMesh(base, baseMat, 'base'));

        // ── userData (§27 §3.1) ───────────────────────────────────────────
        group.userData.id            = data.id;
        group.userData.elementType   = 'furniture';
        group.userData.furnitureType = data.furnitureType;
        group.userData.width         = size;
        group.userData.length        = size;
        group.userData.height        = H;
        group.userData.role          = 'cafe_table';
        group.userData.variant       = data.furnitureType;

        return group;
    }
}
