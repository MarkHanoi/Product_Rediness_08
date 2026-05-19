/**
 * FurnitureGeometryBuildersB.ts
 *
 * Furniture thumbnail geometry builders (Part B):
 * Parametric tables, beds (Nordic/Japanese/Solid Wood/parametric),
 * wardrobes, lamps, plants, straight sofas, carpets, and fallback box.
 * Extracted from FurnitureGeometryFactory.ts (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure geometry module — no engine, store, or UI imports.
 *  - All builders exported so FurnitureGeometryFactory can call them.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { mat, mk, addBox, addCyl } from './FurnitureGeometryHelpers';


// ─── Parametric table thumbnails ──────────────────────────────────────────────
//
// Each function mirrors the corresponding method in TableBuilder.ts so the
// carousel preview matches the placed 3D model. Geometry is built at the
// registry default dimensions; normalise() (called by buildFurnitureGeometry)
// scales the whole group so the largest dimension fits the carousel cell.
//
// Materials are intentionally distinct (cream marble, smoked glass, light/dark
// oak, white ceramic) so all five tables read as different objects at a glance,
// per Contract 48-style "iconic recognition at carousel scale".

/** Marble disc on a black tapered metal cone — mirrors buildMarbleCone(). */
export function buildTableMarbleConeThumb(g: THREE.Group): void {
    const W = 1.15, H = 0.74;
    const radius = W * 0.5;
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.30, metalness: 0.0 });
    const veinMat   = new THREE.MeshStandardMaterial({ color: 0xb7b1aa, roughness: 0.40 });
    const metalMat  = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.32, metalness: 0.85 });

    // Top slab (disc)
    addCyl(g, marbleMat, radius, radius, 0.075, 0, H - 0.075, 0, 64);
    // A few veins on the top surface
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI;
        const vein = mk(new THREE.BoxGeometry(radius * 1.25, 0.004, 0.006), veinMat);
        vein.position.set(Math.cos(angle) * radius * 0.10, H + 0.001, Math.sin(angle * 1.7) * radius * 0.12);
        vein.rotation.y = angle + 0.35;
        g.add(vein);
    }
    // Tapered cone column (wider at top, narrower at bottom).
    const colH = H - 0.075 - 0.035;
    addCyl(g, metalMat, radius * 0.42, radius * 0.18, colH, 0, 0.035, 0, 48);
    // Foot disc at floor.
    addCyl(g, metalMat, radius * 0.32, radius * 0.32, 0.035, 0, 0, 0, 48);
}

/** Smoked-glass corrugated disc on a fluted wood column — mirrors buildGlassWoodCylinder(). */
export function buildTableGlassWoodCylinderThumb(g: THREE.Group): void {
    const W = 1.10, H = 0.74;
    const radius = W * 0.5;
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x8b5e34, roughness: 0.10, metalness: 0.0, transparent: true, opacity: 0.55,
    });
    const woodMat  = new THREE.MeshStandardMaterial({ color: 0x70421f, roughness: 0.55 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4b2814, roughness: 0.60 });

    // Smoked-glass top disc
    addCyl(g, glassMat, radius, radius, 0.055, 0, H - 0.055, 0, 64);
    // Radial ribs on top to read as the corrugated/fluted underside
    for (let i = 0; i < 18; i++) {
        const rib = mk(new THREE.BoxGeometry(0.012, 0.014, radius * 1.55), glassMat);
        rib.position.y = H + 0.005;
        rib.rotation.y = (i / 18) * Math.PI;
        g.add(rib);
    }
    // Wood column
    const colR = radius * 0.27;
    const colH = H - 0.055 - 0.04;
    addCyl(g, woodMat, colR, colR, colH, 0, 0.04, 0, 32);
    // Vertical grooves around the column
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const groove = mk(new THREE.BoxGeometry(0.012, colH * 0.92, 0.018), darkWood);
        groove.position.set(Math.cos(a) * (colR + 0.004), 0.04 + colH * 0.5, Math.sin(a) * (colR + 0.004));
        groove.rotation.y = -a;
        g.add(groove);
    }
    // Foot disc
    addCyl(g, woodMat, colR * 1.25, colR * 1.4, 0.035, 0, 0, 0, 32);
}

/** Oak disc on stacked double cones with a dark waist band — mirrors buildWoodDoubleConic(). */
export function buildTableWoodDoubleConicThumb(g: THREE.Group): void {
    const W = 1.20, H = 0.75;
    const radius = W * 0.5;
    const oakMat     = new THREE.MeshStandardMaterial({ color: 0xb67a3d, roughness: 0.50 });
    const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x7b4b22, roughness: 0.60 });

    // Top slab
    addCyl(g, oakMat, radius, radius, 0.075, 0, H - 0.075, 0, 64);
    // Plank seams (parallel lines across the top)
    for (let i = 0; i < 5; i++) {
        const line = mk(new THREE.BoxGeometry(radius * 1.30, 0.003, 0.006), darkOakMat);
        line.position.y = H + 0.001;
        line.position.z = -radius * 0.45 + (i / 4) * radius * 0.9;
        g.add(line);
    }
    // Upper inverted cone (wider near top slab, narrowing to the waist)
    const upperH = H * 0.36;
    addCyl(g, oakMat, radius * 0.34, radius * 0.13, upperH, 0, H * 0.32, 0, 48);
    // Lower cone (narrow at the waist, flaring to the foot)
    const lowerH = H * 0.40;
    addCyl(g, oakMat, radius * 0.13, radius * 0.36, lowerH, 0, 0, 0, 48);
    // Dark waist band where the two cones meet
    addCyl(g, darkOakMat, radius * 0.14, radius * 0.14, 0.05, 0, H * 0.32 - 0.025, 0, 32);
}

/** Rectangular oak top with apron and four splayed turned legs — mirrors buildWoodFourLeg(). */
export function buildTableWoodFourLegThumb(g: THREE.Group): void {
    const W = 1.60, L = 0.90, H = 0.75;
    const oakMat     = new THREE.MeshStandardMaterial({ color: 0xbc8244, roughness: 0.50 });
    const darkOakMat = new THREE.MeshStandardMaterial({ color: 0x81501f, roughness: 0.62 });

    // Top
    addBox(g, oakMat, W, 0.08, L, 0, H - 0.08, 0);

    // Aprons (long-edge pair + short-edge pair) just under the top
    addBox(g, darkOakMat, W * 0.86, 0.07, 0.05, 0, H - 0.16,  L * 0.40);
    addBox(g, darkOakMat, W * 0.86, 0.07, 0.05, 0, H - 0.16, -L * 0.40);
    addBox(g, darkOakMat, 0.05, 0.07, L * 0.78,  W * 0.42, H - 0.16, 0);
    addBox(g, darkOakMat, 0.05, 0.07, L * 0.78, -W * 0.42, H - 0.16, 0);

    // Tapered legs — slightly splayed (visual cue is the bottom radius < top)
    const legH = H - 0.16;
    const legPositions: [number, number][] = [
        [ W * 0.42,  L * 0.40],
        [-W * 0.42,  L * 0.40],
        [ W * 0.42, -L * 0.40],
        [-W * 0.42, -L * 0.40],
    ];
    for (const [x, z] of legPositions) {
        addCyl(g, oakMat, 0.030, 0.045, legH, x, 0, z, 12);
    }
}

/** Oval ceramic top on a hand-thrown lathed pedestal — mirrors buildCeramicCurve(). */
export function buildTableCeramicCurveThumb(g: THREE.Group): void {
    const W = 1.35, L = 0.85, H = 0.74;
    const radius = W * 0.5;
    const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xe4ded3, roughness: 0.36, metalness: 0.0 });

    // Oval top — built as a cylinder then squashed in Z to give the oval profile
    const top = mk(new THREE.CylinderGeometry(radius, radius, 0.07, 64), ceramicMat);
    top.position.y = H - 0.035;
    top.scale.z = L / W;
    g.add(top);

    // Lathed pedestal body (waist + bell silhouette)
    const points = [
        new THREE.Vector2(radius * 0.20, 0),
        new THREE.Vector2(radius * 0.34, H * 0.12),
        new THREE.Vector2(radius * 0.24, H * 0.38),
        new THREE.Vector2(radius * 0.38, H * 0.66),
        new THREE.Vector2(radius * 0.22, H * 0.92),
    ];
    const pedestal = mk(new THREE.LatheGeometry(points, 48), ceramicMat);
    pedestal.scale.z = 0.72;
    g.add(pedestal);

    // Foot disc
    const foot = mk(new THREE.CylinderGeometry(radius * 0.34, radius * 0.40, 0.035, 48), ceramicMat);
    foot.position.y = 0.018;
    foot.scale.z = 0.72;
    g.add(foot);
}

export function buildBed(g: THREE.Group, width: number): void {
    const M = mat();
    addBox(g, M.wood,     width + 0.10, 0.22, 2.10,  0, 0,    0);
    addBox(g, M.mattress, width,        0.18, 1.95,  0, 0.22, -0.02);
    addBox(g, M.wood,     width + 0.10, 0.85, 0.08,  0, 0.22, -0.99);
    // Pillows
    const cols = width > 1.2 ? 2 : 1;
    const pW   = width / cols * 0.82;
    for (let i = 0; i < cols; i++) {
        const px = cols > 1 ? (i === 0 ? -width * 0.25 : width * 0.25) : 0;
        addBox(g, M.white, pW, 0.09, 0.35, px, 0.40, -0.70);
    }
}

// ── Parametric bed thumbnails (Japanese / Nordic / Solid Wood collection) ──
//
// Each function below produces a distinct, recognisable silhouette that
// matches the actual 3D BedEngine variant — same palette, same proportions,
// same accent geometry (nightstands, wings, headboard style, throw colour).
// Goal: iconic recognition at carousel scale; the thumbnail is a faithful
// miniature of the placed bed, not a generic beige rectangle.
//
// Convention (matches BedEngine):
//   origin on floor, +X = width, +Z = length, head at -Z, foot at +Z.

interface BedThumbPalette {
    wood:    number;
    sheet:   number;
    pillow:  number;
    accent:  number;
    throw_?: number;
}

interface BedThumbOpts {
    width:          number;
    length:         number;
    /** 'none' | 'low' (~0.55) | 'tall' (~0.95) | 'paneled' (tall + grooves). */
    headboardStyle: 'none' | 'low' | 'tall' | 'paneled';
    /** Visible base detail. */
    legStyle:       'none' | 'splay' | 'turned' | 'plinth_recessed' | 'floating';
    /** Throw blanket across the foot half of the mattress. */
    throwOnFoot:    boolean;
    /** Two integrated nightstand boxes flush at sides, head end. */
    nightstands?:   boolean;
    /** Two flat bedside-wing surfaces flush with the deck, head end. */
    wings?:         boolean;
    /** Width inset of the mattress vs the deck (per side). Default 0.04. */
    mattressInsetX?: number;
}

/** Single shared helper — keeps every parametric bed thumb consistent. */
export function buildParametricBedThumb(
    g: THREE.Group,
    palette: BedThumbPalette,
    opts: BedThumbOpts,
): void {
    const W = opts.width;
    const L = opts.length;

    const woodMat   = new THREE.MeshStandardMaterial({ color: palette.wood,   roughness: 0.62, metalness: 0.04 });
    const accentMat = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.70, metalness: 0.04 });
    const sheetMat  = new THREE.MeshStandardMaterial({ color: palette.sheet,  roughness: 0.92, metalness: 0.00 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: palette.pillow, roughness: 0.95, metalness: 0.00 });
    const throwMat  = palette.throw_ !== undefined
        ? new THREE.MeshStandardMaterial({ color: palette.throw_, roughness: 0.90, metalness: 0.00 })
        : null;

    // ── Base / legs ────────────────────────────────────────────────────────
    let baseY = 0;
    const frameH = 0.10;

    if (opts.legStyle === 'splay') {
        baseY = 0.14;
        const inset = 0.10;
        for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
                const x = sx * (W / 2 - inset);
                const z = sz * (L / 2 - inset);
                const leg = mk(new THREE.CylinderGeometry(0.025, 0.018, baseY, 8), woodMat);
                leg.position.set(x, baseY / 2, z);
                leg.rotation.x = sz > 0 ? -0.18 : 0.18;
                leg.rotation.z = sx > 0 ?  0.18 : -0.18;
                g.add(leg);
            }
        }
    } else if (opts.legStyle === 'turned') {
        baseY = 0.16;
        const inset = 0.08;
        for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
                addCyl(g, woodMat, 0.024, 0.036, baseY,
                    sx * (W / 2 - inset), 0, sz * (L / 2 - inset), 12);
            }
        }
    } else if (opts.legStyle === 'plinth_recessed' || opts.legStyle === 'floating') {
        // Hidden recessed dark base — gives the floating-deck look.
        baseY = 0.08;
        addBox(g, accentMat, Math.max(0.40, W - 0.50), baseY, Math.max(0.40, L - 0.50), 0, baseY / 2, 0);
    }
    // 'none' → deck sits flat on the floor (Japanese platform style)

    // ── Deck / frame ───────────────────────────────────────────────────────
    addBox(g, woodMat, W, frameH, L, 0, baseY + frameH / 2, 0);
    const deckTopY = baseY + frameH;

    // ── Bedside wings (deck-level surfaces at the head end) ────────────────
    const wingW = 0.40;
    const wingL = 0.55;
    if (opts.wings) {
        for (const sx of [-1, 1] as const) {
            const xc = sx * (W / 2 + wingW / 2);
            const zc = -L / 2 + wingL / 2;
            addBox(g, woodMat, wingW, frameH, wingL, xc, baseY + frameH / 2, zc);
        }
    }

    // ── Integrated nightstand boxes at the head end (platform style) ──────
    const nsW = 0.50;
    const nsD = 0.50;
    const nsH = deckTopY + 0.18;       // flush with mattress top
    if (opts.nightstands) {
        for (const sx of [-1, 1] as const) {
            const xc = sx * (W / 2 + nsW / 2);
            const zc = -L / 2 + nsD / 2;
            addBox(g, woodMat, nsW, nsH, nsD, xc, nsH / 2, zc);
        }
    }

    // ── Mattress ───────────────────────────────────────────────────────────
    const insetX = opts.mattressInsetX ?? 0.04;
    const mW = Math.max(0.40, W - 2 * insetX);
    const mL = L - 0.10;
    const mH = 0.18;
    const mY = deckTopY;
    addBox(g, sheetMat, mW, mH, mL, 0, mY + mH / 2, 0.02);

    // ── Pillows (two side-by-side, head end) ──────────────────────────────
    const pillowY = mY + mH;
    const pillowW = mW * 0.42;
    const pillowZ = -L / 2 + 0.28;
    addBox(g, pillowMat, pillowW, 0.09, 0.34, -mW * 0.22, pillowY + 0.045, pillowZ);
    addBox(g, pillowMat, pillowW, 0.09, 0.34,  mW * 0.22, pillowY + 0.045, pillowZ);

    // ── Throw blanket across the foot ──────────────────────────────────────
    if (opts.throwOnFoot && throwMat) {
        addBox(g, throwMat, mW * 0.95, 0.04, mL * 0.30, 0, pillowY + 0.022, L * 0.18);
    }

    // ── Headboard ──────────────────────────────────────────────────────────
    // The headboard spans the deck plus any wings or nightstands.
    const sideExt = opts.nightstands ? nsW : (opts.wings ? wingW : 0);
    const hbW = W + 2 * sideExt + 0.04;
    const hbZ = -L / 2 - 0.04;

    if (opts.headboardStyle === 'low') {
        addBox(g, woodMat, hbW, 0.55, 0.06, 0, baseY + 0.275, hbZ);
    } else if (opts.headboardStyle === 'tall') {
        addBox(g, woodMat, hbW, 0.95, 0.06, 0, baseY + 0.475, hbZ);
    } else if (opts.headboardStyle === 'paneled') {
        addBox(g, woodMat, hbW, 1.05, 0.08, 0, baseY + 0.525, hbZ);
        // Vertical groove panels in a slightly darker accent tone.
        const grooveCount = 3;
        for (let i = 1; i <= grooveCount; i++) {
            const gx = -hbW / 2 + (hbW * i) / (grooveCount + 1);
            addBox(g, accentMat, 0.015, 0.85, 0.005, gx, baseY + 0.55, hbZ + 0.042);
        }
    }
    // 'none' → no headboard (Japanese platform variant)
}

export function buildJapanesePlatformBed(g: THREE.Group): void {
    // Light-oak deck flat on the floor, two integrated oak nightstand cubes
    // flush at sides, full-width oak headboard over them, terracotta throw.
    buildParametricBedThumb(g, {
        wood:   0xc8a878,
        sheet:  0xf2ead7,
        pillow: 0xece4d2,
        accent: 0x6b4a2b,
        throw_: 0xc88a5a,
    }, {
        width: 1.60, length: 2.10,
        headboardStyle: 'tall',
        legStyle: 'none',
        nightstands: true,
        throwOnFoot: true,
        mattressInsetX: 0.10,
    });
}

export function buildJapaneseFloatBed(g: THREE.Group): void {
    // Medium-walnut floating deck with bedside wings, tall headboard,
    // crisp white duvet, navy pillows.
    buildParametricBedThumb(g, {
        wood:   0x6b3f25,
        sheet:  0xfafafa,
        pillow: 0x3b5a8a,
        accent: 0x14100c,
    }, {
        width: 1.60, length: 2.30,
        headboardStyle: 'tall',
        legStyle: 'floating',
        wings: true,
        throwOnFoot: false,
        mattressInsetX: 0.20,
    });
}

export function buildJapaneseWalnutBed(g: THREE.Group): void {
    // Dark-walnut floating deck with wide bedside wings, low panel headboard,
    // off-white sheet, terracotta throw.  Wide deck overhang per BedEngine.
    buildParametricBedThumb(g, {
        wood:   0x4a2e1d,
        sheet:  0xf7f4ec,
        pillow: 0xe8e0cb,
        accent: 0x2a1a10,
        throw_: 0x8a4b2c,
    }, {
        width: 1.60, length: 2.10,
        headboardStyle: 'low',
        legStyle: 'floating',
        wings: true,
        throwOnFoot: true,
        mattressInsetX: 0.25,
    });
}

export function buildNordicBed(g: THREE.Group): void {
    // Warm walnut frame on turned cylindrical legs, low rounded headboard,
    // crisp white sheet, camel throw with a hanging drape.
    buildParametricBedThumb(g, {
        wood:   0x6b4023,
        sheet:  0xfafafa,
        pillow: 0xece4d2,
        accent: 0xb78a64,
        throw_: 0xc69773,
    }, {
        width: 1.70, length: 2.20,
        headboardStyle: 'low',
        legStyle: 'turned',
        throwOnFoot: true,
        mattressInsetX: 0.05,
    });
}

export function buildSolidWoodBed(g: THREE.Group): void {
    // Mid-walnut frame on splayed legs, tall paneled headboard with grooves,
    // white quilted duvet — mirrors BedEngine.buildSolidWood.
    buildParametricBedThumb(g, {
        wood:   0x8a5a3a,
        sheet:  0xfafafa,
        pillow: 0xfafafa,
        accent: 0x5a3923,
    }, {
        width: 1.75, length: 2.20,
        headboardStyle: 'paneled',
        legStyle: 'splay',
        throwOnFoot: false,
        mattressInsetX: 0.05,
    });
}

export function buildWardrobe(g: THREE.Group): void {
    const M = mat();
    addBox(g, M.wood,  1.60, 2.20, 0.60, 0, 0, 0);
    addBox(g, M.white, 0.75, 2.10, 0.02, -0.40, 0.05, 0.31);
    addBox(g, M.white, 0.75, 2.10, 0.02,  0.40, 0.05, 0.31);
    addCyl(g, M.metal, 0.015, 0.015, 0.12, -0.06, 1.10, 0.32, 8);
    addCyl(g, M.metal, 0.015, 0.015, 0.12,  0.06, 1.10, 0.32, 8);
}


export function buildFloorLamp(g: THREE.Group): void {
    const M = mat();
    addCyl(g, M.metal, 0.20, 0.22, 0.04, 0, 0,    0, 16);  // base
    addCyl(g, M.metal, 0.018, 0.018, 1.65, 0, 0.04, 0, 8); // pole
    // Shade (open cone) — approximate with a flat cylinder
    addCyl(g, M.fabric, 0.22, 0.28, 0.32, 0, 1.69, 0, 16);
}


export function buildWallSconce(g: THREE.Group): void {
    const M = mat();
    addBox(g, M.metal,  0.08, 0.40, 0.08, 0, 0, 0);
    addCyl(g, M.fabric, 0.10, 0.14, 0.20, 0, 0.40, 0, 12);
}

export function buildBookshelf(g: THREE.Group): void {
    const M      = mat();
    const bookColors = [M.red, M.blue, M.wood, M.yellow, M.fabric];
    // Sides
    addBox(g, M.wood, 0.035, 2.00, 0.35, -0.48, 0, 0);
    addBox(g, M.wood, 0.035, 2.00, 0.35,  0.48, 0, 0);
    // Shelves (5 horizontal)
    for (let i = 0; i <= 4; i++) {
        addBox(g, M.wood, 0.96, 0.025, 0.35, 0, i * 0.45, 0);
    }
    // Books on shelves 1–3
    for (let shelf = 1; shelf < 4; shelf++) {
        let bx = -0.38;
        for (let b = 0; b < 5; b++) {
            const w = 0.055 + (b % 3) * 0.022;
            const m = bookColors[b % bookColors.length];
            addBox(g, m, w, 0.28, 0.28, bx + w * 0.5, shelf * 0.45 + 0.025, 0);
            bx += w + 0.018;
        }
    }
}

export function buildMirror(g: THREE.Group): void {
    const M = mat();
    addBox(g, M.wood,  0.80, 1.40, 0.04, 0, 0, 0);
    addBox(g, M.glass, 0.72, 1.32, 0.01, 0, 0.04, 0.025);
    addBox(g, M.wood,  0.08, 0.12, 0.32, 0, 0, 0.18);  // stand
}

export function buildPlant(g: THREE.Group): void {
    const M = mat();
    addCyl(g, M.fabric, 0.14, 0.11, 0.24, 0, 0,     0, 12);  // pot
    addCyl(g, M.soil,   0.135, 0.135, 0.03, 0, 0.24, 0, 12); // soil
    addCyl(g, M.green,  0.025, 0.025, 0.65, 0, 0.27, 0, 8);  // stem
    // Leaf clusters
    const sphere1 = mk(new THREE.SphereGeometry(0.28, 12, 8), M.green);
    sphere1.position.set(0, 1.02, 0);
    sphere1.castShadow = true;
    g.add(sphere1);
    const sphere2 = mk(new THREE.SphereGeometry(0.18, 8, 6), M.green);
    sphere2.position.set(0.18, 0.84, 0.10);
    sphere2.castShadow = true;
    g.add(sphere2);
    const sphere3 = mk(new THREE.SphereGeometry(0.15, 8, 6), M.green);
    sphere3.position.set(-0.14, 0.80, 0.08);
    sphere3.castShadow = true;
    g.add(sphere3);
}

/**
 * Straight sofa thumbnail — single run, two arms, seat + back cushions.
 * Used for white_sofa_1seat / 2seat / 3seat in the carousel.
 * All variants use the cream palette matching white_corner_sofa.
 */
export function buildStraightSofa(g: THREE.Group, seatCount: number, fabricHex: number = 0xd6cdbd): void {
    const fabric  = new THREE.MeshStandardMaterial({ color: fabricHex, roughness: 0.85 });
    const cushC   = new THREE.Color(fabricHex).multiplyScalar(1.08).getHex();
    const cushion = new THREE.MeshStandardMaterial({ color: cushC, roughness: 0.9 });
    const legMat  = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.5 });

    const seatWidths: Record<number, number> = { 1: 0.56, 2: 1.05, 3: 1.50 };
    const W       = seatWidths[seatCount] ?? 1.05;
    const D       = 0.60;
    const plinthH = 0.14;
    const cushThk = 0.13;
    const backH   = 0.28;   // back panel above plinth (halved for low silhouette)
    const backThk = 0.09;
    const armW    = 0.11;
    const legH    = 0.07;
    // Arms span from atop the legs to the top of the back panel, matching the
    // real CornerSofaBuilder so the thumbnail reads as a single solid shell
    // rather than fragmented blocks.
    const armH    = plinthH + backH;

    // Centre the group at origin
    const inner = new THREE.Group();

    // Plinth
    addBox(inner, fabric, W, plinthH, D, W / 2, legH + plinthH / 2, D / 2);

    // Back panel — extends down to top of legs (overlapping plinth) so the
    // rear silhouette reads as one solid shell rather than floating above.
    const backTotalH = plinthH + backH;
    const backY      = legH + backTotalH / 2;
    addBox(inner, fabric, W, backTotalH, backThk, W / 2, backY, backThk / 2);

    // Arms — sit on top of legs, rise to top of back panel for a clean shell.
    const armY = legH + armH / 2;
    addBox(inner, fabric, armW, armH, D, armW / 2,     armY, D / 2);
    addBox(inner, fabric, armW, armH, D, W - armW / 2, armY, D / 2);

    // Seat cushions
    const innerW = W - armW * 2;
    const count  = Math.max(1, seatCount);
    const cW     = innerW / count;
    const seatY  = legH + plinthH + cushThk / 2;
    const seatZ  = backThk + (D - backThk) / 2;
    const seatD  = D - backThk - 0.02;
    for (let i = 0; i < count; i++) {
        const cx = armW + cW * (i + 0.5);
        addBox(inner, cushion, cW * 0.92, cushThk, seatD, cx, seatY, seatZ);
    }

    // Back cushions (one per seat)
    const backCushY   = legH + plinthH + cushThk + backH * 0.44;
    const backCushThk = backThk * 1.4;
    const backCushZ   = backThk + 0.03 + backCushThk / 2;
    for (let i = 0; i < count; i++) {
        const cx = armW + cW * (i + 0.5);
        addBox(inner, cushion, cW * 0.90, backH * 0.82, backCushThk, cx, backCushY, backCushZ);
    }

    // Legs (4 corners)
    const inset = 0.04;
    const legPositions: [number, number][] = [
        [inset,     inset],
        [W - inset, inset],
        [W - inset, D - inset],
        [inset,     D - inset],
    ];
    for (const [lx, lz] of legPositions) {
        addBox(inner, legMat, 0.045, legH, 0.045, lx, legH / 2, lz);
    }

    inner.position.set(-W / 2, 0, -D / 2);
    g.add(inner);
}

export function buildDefaultBox(g: THREE.Group): void {
    addBox(g, mat().fabric, 0.70, 0.70, 0.70, 0, 0, 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a normalised THREE.Group for the given furniture type.
 *
 * The returned group:
 *   - Has its base at y = 0.
 *   - Fits within ~1.0 unit in its tallest dimension.
 *   - Has `castShadow = true` on all child meshes.
 *
 * Callers are responsible for disposing geometries when done.
 * Module-level materials are shared and must NOT be disposed here.
 */
// ─── Parametric carpet thumbnails ────────────────────────────────────────────
// Compact flat-rug geometries with the same pattern style as the runtime
// builders, so the carousel cards visually match the rugs you place in the
// scene. Texture canvases are intentionally low-res — these are 256 px previews.

function makeCarpetSlab(): { geom: THREE.PlaneGeometry; w: number; l: number } {
    // Aspect 3:2 — same default as the carousel registry.
    return { geom: new THREE.PlaneGeometry(0.9, 0.6), w: 0.9, l: 0.6 };
}

export function buildChevronCarpetThumb(g: THREE.Group): void {
    const { geom, w, l } = makeCarpetSlab();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = Math.round(256 * (l / w));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const peaks = 18, rows = 12;
    const pw = canvas.width / peaks, rh = canvas.height / rows;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = rh * 0.55; ctx.lineJoin = 'miter'; ctx.miterLimit = 6;
    for (let r = 0; r < rows; r += 2) {
        const y = r * rh + rh / 2;
        ctx.beginPath();
        for (let i = 0; i <= peaks; i++) {
            const x = i * pw, yy = y + (i % 2 === 0 ? -rh * 0.25 : rh * 0.25);
            if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    mat.addEventListener('dispose', () => tex.dispose());
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
}

export function buildPatchworkCarpetThumb(g: THREE.Group): void {
    const { geom, w, l } = makeCarpetSlab();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = Math.round(256 * (l / w));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f1ead8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cols = 14, rows = 10;
    const palette = [
        '#c98a7a', '#d9a86a', '#e0c98a', '#a8b78a', '#8ab0a8',
        '#7a98b0', '#a890b0', '#c0a090', '#d4c0a0', '#f0e6cc',
        '#b88a8a', '#a8c0c0', '#c8a890', '#9ab098', '#b89ab0',
    ];
    const pick = (c: number, r: number) => {
        const h = (c * 73856093) ^ (r * 19349663);
        return palette[Math.abs(h) % palette.length];
    };
    const tw = canvas.width / cols, th = canvas.height / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.fillStyle = pick(c, r);
        const x0 = Math.round(c * tw), y0 = Math.round(r * th);
        ctx.fillRect(x0, y0, Math.round((c + 1) * tw) - x0 + 1, Math.round((r + 1) * th) - y0 + 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    mat.addEventListener('dispose', () => tex.dispose());
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
}

export function buildStripeCarpetThumb(g: THREE.Group): void {
    const { geom, w, l } = makeCarpetSlab();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = Math.round(256 * (l / w));
    const ctx = canvas.getContext('2d')!;
    const palette = [
        '#a83a2a', '#c8843a', '#d9b04a', '#e0c98a', '#5d7a3a',
        '#3a6b6b', '#2f4a6b', '#5b3a6b', '#8a5a4a', '#bda37a',
        '#7a3a3a', '#6b8a8a', '#a86b3a', '#4a5a3a', '#9a6b8a',
    ];
    const bands = 18;
    const bw = canvas.width / bands;
    for (let i = 0; i < bands; i++) {
        const x0 = i * bw, x1 = (i + 1) * bw;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, palette[i % palette.length]);
        grad.addColorStop(1, palette[(i + 1) % palette.length]);
        ctx.fillStyle = grad;
        ctx.fillRect(Math.round(x0), 0, Math.ceil(bw) + 1, canvas.height);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
    mat.addEventListener('dispose', () => tex.dispose());
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
}

