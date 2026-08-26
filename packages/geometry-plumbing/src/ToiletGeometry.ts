/**
 * ToiletGeometry — LOD400 high-detail toilet families.
 *
 * Contract references:
 *   • 36-KITCHEN-CABINET-ELEMENT-CONTRACT.md (geometry parity §5)
 *     "Placement preview geometry and committed geometry must describe the same
 *      footprint." → Both PlumbingTool (preview) and PlumbingFragmentBuilder
 *      (committed) call createToiletGeometry() so the silhouette is identical.
 *   • 03-BIM-SEMANTIC-MODEL-CONTRACT.md → toiletVariant lives on the DTO; the
 *     root Group's userData carries the semantic id/elementType so selection,
 *     highlight, and projection orchestrate against the run, not the children.
 *   • 01-BIM-ENGINE-CORE-CONTRACT.md → geometry is rebuilt deterministically
 *     from DTO state on every updateFixture() call (no hidden mutable state).
 *
 * The four LOD400 families mirror the catalogue image:
 *   1. Wall-Hung Square         — concealed cistern, square-D seat
 *   2. Wall-Hung Round          — concealed cistern, full-round seat
 *   3. Close-Coupled Square     — visible square tank, dual flush buttons
 *   4. Close-Coupled Round      — visible rounded tank, single dome flush
 *
 * Local axes — ⭐ THE ONE CONVENTION, AND IT IS DECLARED IN `PlumbingFixtureFrame.ts`,
 * not here. Origin = the midpoint of the WALL-CONTACT EDGE, on the floor; local +Z runs
 * INTO THE ROOM (the front of the bowl); local +X runs ALONG the host wall; +Y is up.
 *
 * ⚠ THIS PARAGRAPH USED TO SAY EXACTLY THAT AND THE GEOMETRY DID NOT DO IT
 * (§PLUMBFRAME, founder 2026-08-26, L-11487). The cistern sat correctly at +Z while the
 * bowl body, the seat ring and the seat lid all extruded to −Z — measured, for
 * `close_coupled_round`: bowl `z[-0.742, 0.022]` against a declared footprint length of
 * 0.72. So the tank hugged the wall and the pan stuck through it, which is the founder's
 * *"in 3D it creates it 180° ROTATED"*. `faceExtrusionIntoTheRoom()` below is the fix
 * and carries the full measurement. ⛔ A header is not a measurement: the pin is
 * `__tests__/plumbingFixtureFrame.measure.test.ts`, which asks the built mesh.
 *
 *   The fixture is positioned by the caller; rotation is applied by the
 *   command/tool to align with the chosen wall.
 */

import * as THREE from '@pryzm/renderer-three/three';

export type ToiletVariant =
    | 'wall_hung_square'
    | 'wall_hung_round'
    | 'close_coupled_square'
    | 'close_coupled_round';

export const TOILET_VARIANTS: ToiletVariant[] = [
    'wall_hung_square',
    'wall_hung_round',
    'close_coupled_square',
    'close_coupled_round',
];

export const TOILET_VARIANT_LABELS: Record<ToiletVariant, string> = {
    wall_hung_square:     'Wall-Hung Square',
    wall_hung_round:      'Wall-Hung Round',
    close_coupled_square: 'Close-Coupled Square',
    close_coupled_round:  'Close-Coupled Round',
};

export const DEFAULT_TOILET_VARIANT: ToiletVariant = 'close_coupled_round';

export interface ToiletFootprint {
    /** Width across (x) in metres. */
    width: number;
    /** Depth from wall (z) in metres. */
    length: number;
    /** Total height from floor in metres (including tank/seat). */
    height: number;
}

export const TOILET_FOOTPRINTS: Record<ToiletVariant, ToiletFootprint> = {
    wall_hung_square:     { width: 0.36, length: 0.54, height: 0.42 },
    wall_hung_round:      { width: 0.38, length: 0.58, height: 0.42 },
    close_coupled_square: { width: 0.40, length: 0.68, height: 0.78 },
    close_coupled_round:  { width: 0.42, length: 0.72, height: 0.82 },
};

export interface ToiletGeometryOptions {
    /** Override ceramic colour (default: 0xffffff). */
    ceramicColor?: number;
    /** Override metal/button colour (default: 0xb8b8b8). */
    metalColor?: number;
    /** Render with translucent material (used by the placement preview). */
    transparent?: boolean;
    /** Opacity when transparent. */
    opacity?: number;
}

// ─── Shape helpers ────────────────────────────────────────────────────────────

/**
 * §PLUMBFRAME (founder, 2026-08-26 · L-11487) — THE HALF-TURN THAT MAKES A D-EXTRUSION
 * OBEY `PlumbingFixtureFrame`.
 *
 * ⛔ MEASURED, NOT REASONED. `dShape` lays its flat back at shape-y 0 and its round
 * front at shape-y +length. `ExtrudeGeometry` extrudes along +Z, and `rotateX(-π/2)`
 * — needed to stand the extrusion up so its DEPTH becomes height — maps shape +Y to
 * world-local **−Z**. So every D part came out with its front at −Z while the CISTERN
 * (a plain rounded box, no D) sat correctly at +Z. Dumped extents for
 * `close_coupled_round` (fp.length 0.72), before this fix:
 *
 *     cistern    z[-0.022, 0.238]   ← correctly against the wall
 *     bowl body  z[-0.742,  0.022]  ⛔ through the wall
 *     seat ring  z[-0.740,  0.006]  ⛔
 *     seat lid   z[-0.742,  0.008]  ⛔
 *     basin      z[ 0.117,  0.563]  ← the recess was already in the right place,
 *                                     floating in front of a pan that was behind it
 *
 * That is the founder's *"in 3D it creates it 180° ROTATED"* exactly: the tank hugs the
 * wall and the pan sticks through it.
 *
 * ⭐ WHY A GEOMETRY ROTATION AND NOT A REDRAWN SILHOUETTE. `rotateY(π)` about the
 * fixture's own local Y is a proper rotation: normals rotate with it and winding is
 * preserved, so the bevels, the carved seat aperture and the D's asymmetry are
 * untouched. Mirroring the shape in its own Y would flip the winding of the outer
 * contour and its hole independently, which is how a carved aperture becomes a solid.
 * The D is symmetric in x, so the accompanying x-mirror is a no-op on the silhouette.
 */
function faceExtrusionIntoTheRoom(geo: THREE.BufferGeometry): void {
    geo.rotateY(Math.PI);
}

/**
 * Build a "D" silhouette: flat back at y=0, rounded front.
 * `frontness` shapes the front: 0 = nearly square, 1 = full round.
 */
function dShape(width: number, length: number, frontness: number): THREE.Shape {
    const hw   = width / 2;
    const r    = Math.min(hw, length) * (0.30 + 0.55 * frontness);
    const sideStraight = Math.max(0, length - r);

    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo( hw, 0);
    s.lineTo( hw, sideStraight);
    s.absarc( hw - r, sideStraight, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, length);
    s.absarc(-hw + r, sideStraight, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, 0);
    return s;
}

/** Inset version of the D silhouette (used to carve seat / rim apertures). */
function dShapeInset(width: number, length: number, frontness: number, inset: number): THREE.Path {
    const hw   = Math.max(0.001, width / 2 - inset);
    const len  = Math.max(0.001, length - inset);
    const r    = Math.min(hw, len) * (0.30 + 0.55 * frontness);
    const sideStraight = Math.max(0, len - r);
    const yOffset = inset; // shift forward so back edge stays parallel

    const p = new THREE.Path();
    p.moveTo(-hw, yOffset);
    p.lineTo( hw, yOffset);
    p.lineTo( hw, sideStraight + yOffset);
    p.absarc( hw - r, sideStraight + yOffset, r, 0, Math.PI / 2, false);
    p.lineTo(-hw + r, len + yOffset);
    p.absarc(-hw + r, sideStraight + yOffset, r, Math.PI / 2, Math.PI, false);
    p.lineTo(-hw, yOffset);
    return p;
}

/** Build a chamfered-corner rounded box silhouette. */
function roundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
    const hw = width / 2;
    const hd = depth / 2;
    const r  = Math.min(radius, hw, hd);
    const s  = new THREE.Shape();
    s.moveTo(-hw + r, -hd);
    s.lineTo( hw - r, -hd);
    s.absarc( hw - r, -hd + r, r, -Math.PI / 2, 0, false);
    s.lineTo( hw,  hd - r);
    s.absarc( hw - r,  hd - r, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r,  hd);
    s.absarc(-hw + r,  hd - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, -hd + r);
    s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
}

// ─── Material helpers ─────────────────────────────────────────────────────────

function makeCeramic(opts: ToiletGeometryOptions): THREE.Material {
    return new THREE.MeshStandardMaterial({
        color:      opts.ceramicColor ?? 0xffffff,
        roughness:  0.12,
        metalness:  0.05,
        transparent: !!opts.transparent,
        opacity:     opts.transparent ? (opts.opacity ?? 0.55) : 1,
    });
}

function makeMetal(opts: ToiletGeometryOptions): THREE.Material {
    return new THREE.MeshStandardMaterial({
        color:      opts.metalColor ?? 0xb8b8b8,
        roughness:  0.25,
        metalness:  0.85,
        transparent: !!opts.transparent,
        opacity:     opts.transparent ? (opts.opacity ?? 0.55) : 1,
    });
}

// ─── Sub-assembly builders ────────────────────────────────────────────────────

/** Wall mount plate hidden against the back wall (z = ~0). */
function buildWallPlate(width: number, height: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, 0.012);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(0, height / 2 + 0.05, -0.006);
    return m;
}

/**
 * Build a contoured bowl body extruded from a D-shaped silhouette,
 * with a sloped underside achieved via bevels.
 */
function buildBowlBody(
    width: number, length: number, height: number,
    frontness: number, mat: THREE.Material,
    floorClearance: number,
): THREE.Mesh {
    const shape = dShape(width, length, frontness);
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize:    0.022,
        bevelThickness: 0.022,
        curveSegments: 24,
    });
    // Extrude is along +Z; we want height along Y, depth along Z (front).
    geo.rotateX(-Math.PI / 2);
    // §PLUMBFRAME (L-11487) — …and that rotation puts the D's FRONT at −Z. See
    // `faceExtrusionIntoTheRoom` for the measured extents this corrects.
    faceExtrusionIntoTheRoom(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = floorClearance;
    return m;
}

/** Concave inner basin carved visually by a recessed inverted ellipsoid. */
function buildBowlBasin(
    width: number, length: number, depth: number,
    yTop: number, mat: THREE.Material, frontShift = 0,
): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const m   = new THREE.Mesh(geo, mat);
    m.scale.set(width * 0.78, depth, length * 0.62);
    m.rotation.x = Math.PI; // open upward → bowl
    m.position.set(0, yTop - 0.005, length / 2 + frontShift);
    return m;
}

/** Toilet seat ring (extruded annulus with a D outer + D inner hole). */
function buildSeatRing(
    width: number, length: number, frontness: number,
    yBase: number, mat: THREE.Material,
): THREE.Mesh {
    const outer = dShape(width * 1.04, length * 1.02, frontness);
    const hole  = dShapeInset(width * 1.04, length * 1.02, frontness, 0.075);
    outer.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(outer, {
        depth: 0.022,
        bevelEnabled: true,
        bevelSize: 0.006,
        bevelThickness: 0.006,
        bevelSegments: 2,
        curveSegments: 24,
    });
    geo.rotateX(-Math.PI / 2);
    faceExtrusionIntoTheRoom(geo); // §PLUMBFRAME (L-11487)
    const m = new THREE.Mesh(geo, mat);
    m.position.y = yBase;
    return m;
}

/** Toilet lid (closed cover) sitting on top of the seat ring. */
function buildSeatLid(
    width: number, length: number, frontness: number,
    yBase: number, mat: THREE.Material,
): THREE.Mesh {
    const shape = dShape(width * 1.04, length * 1.02, frontness);
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.018,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.006,
        bevelSegments: 3,
        curveSegments: 24,
    });
    geo.rotateX(-Math.PI / 2);
    faceExtrusionIntoTheRoom(geo); // §PLUMBFRAME (L-11487)
    const m = new THREE.Mesh(geo, mat);
    m.position.y = yBase + 0.024;
    return m;
}

/** Cylindrical pedestal connecting bowl underside to floor. */
function buildPedestal(
    width: number, depth: number, height: number,
    mat: THREE.Material,
): THREE.Mesh {
    const shape = roundedRectShape(width, depth, Math.min(width, depth) * 0.35);
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 3,
        curveSegments: 16,
    });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 0, depth / 2 + 0.04);
    return m;
}

/** Square close-coupled tank: rounded-corner box with chamfered top. */
function buildSquareTank(
    width: number, height: number, depth: number,
    yBase: number, mat: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();

    // Body
    const bodyShape = roundedRectShape(width, depth, 0.04);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: height,
        bevelEnabled: true,
        bevelSize: 0.014,
        bevelThickness: 0.014,
        bevelSegments: 3,
        curveSegments: 16,
    });
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, yBase, depth / 2);
    g.add(body);

    return g;
}

/** Rounded close-coupled tank: oval cross-section using a lathed profile. */
function buildRoundedTank(
    width: number, height: number, depth: number,
    yBase: number, mat: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();

    // Use a slightly more rounded silhouette (larger corner radius).
    const r = Math.min(width, depth) * 0.45;
    const bodyShape = roundedRectShape(width, depth, r);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: height,
        bevelEnabled: true,
        bevelSize: 0.022,
        bevelThickness: 0.022,
        bevelSegments: 4,
        curveSegments: 24,
    });
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, yBase, depth / 2);
    g.add(body);

    return g;
}

/** Two square flush buttons on top of the tank lid. */
function buildDualFlushButtons(
    tankWidth: number, yTop: number, tankDepth: number,
    metal: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    const w = tankWidth * 0.16;
    const h = w * 0.6;
    for (let i = 0; i < 2; i++) {
        const geo = new THREE.BoxGeometry(w, 0.008, h);
        const m   = new THREE.Mesh(geo, metal);
        m.position.set((i === 0 ? -1 : 1) * w * 0.65, yTop + 0.005, tankDepth * 0.55);
        g.add(m);
    }
    return g;
}

/** Single dome flush button on top of a rounded tank. */
function buildDomeFlushButton(
    tankWidth: number, yTop: number, tankDepth: number,
    metal: THREE.Material,
): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(tankWidth * 0.12, tankWidth * 0.13, 0.012, 32);
    const m   = new THREE.Mesh(geo, metal);
    m.position.set(0, yTop + 0.008, tankDepth * 0.55);
    return m;
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Build a complete toilet group for a given LOD400 variant.
 *
 * The returned Group is anchored at floor level, with +Z facing into the room
 * (away from the wall) and the back of the fixture touching the wall plane.
 *
 * Geometry parity:
 *   The placement preview (PlumbingTool) and committed mesh
 *   (PlumbingFragmentBuilder) both call this function so the silhouette and
 *   sub-assembly positions match exactly.
 */
export function createToiletGeometry(
    variant: ToiletVariant,
    opts: ToiletGeometryOptions = {},
): THREE.Group {
    const group = new THREE.Group();
    const ceramic = makeCeramic(opts);
    const metal   = makeMetal(opts);

    const fp = TOILET_FOOTPRINTS[variant];

    if (variant === 'wall_hung_square' || variant === 'wall_hung_round') {
        const isRound   = variant === 'wall_hung_round';
        const frontness = isRound ? 0.95 : 0.35;
        const wallMountY = 0.40; // bowl base elevation (floor clearance)
        const bowlH      = 0.34;

        group.add(buildWallPlate(fp.width * 0.92, 0.55, ceramic));
        group.add(buildBowlBody(fp.width, fp.length, bowlH, frontness, ceramic, wallMountY));
        group.add(buildBowlBasin(fp.width, fp.length, 0.22, wallMountY + bowlH, ceramic, -0.02));
        group.add(buildSeatRing(fp.width, fp.length, frontness, wallMountY + bowlH + 0.005, ceramic));
        group.add(buildSeatLid (fp.width, fp.length, frontness, wallMountY + bowlH + 0.005, ceramic));
        return group;
    }

    // Close-coupled families
    const isRound   = variant === 'close_coupled_round';
    const frontness = isRound ? 0.95 : 0.45;

    const pedestalH    = 0.06;
    const pedestalW    = fp.width * 0.55;
    const pedestalD    = fp.length * 0.32;
    const bowlBaseY    = pedestalH;
    const bowlH        = 0.34;
    const tankBaseY    = bowlBaseY + bowlH - 0.02;
    const tankH        = isRound ? 0.46 : 0.42;
    const tankW        = fp.width * 1.05;
    const tankD        = fp.length * 0.30;

    group.add(buildPedestal(pedestalW, pedestalD, pedestalH, ceramic));
    group.add(buildBowlBody(fp.width, fp.length, bowlH, frontness, ceramic, bowlBaseY));
    group.add(buildBowlBasin(fp.width, fp.length, 0.22, bowlBaseY + bowlH, ceramic, -0.02));
    group.add(buildSeatRing(fp.width, fp.length, frontness, bowlBaseY + bowlH + 0.005, ceramic));
    group.add(buildSeatLid (fp.width, fp.length, frontness, bowlBaseY + bowlH + 0.005, ceramic));

    if (isRound) {
        group.add(buildRoundedTank(tankW, tankH, tankD, tankBaseY, ceramic));
        group.add(buildDomeFlushButton(tankW, tankBaseY + tankH, tankD, metal));
    } else {
        group.add(buildSquareTank(tankW, tankH, tankD, tankBaseY, ceramic));
        group.add(buildDualFlushButtons(tankW, tankBaseY + tankH, tankD, metal));
    }

    return group;
}
