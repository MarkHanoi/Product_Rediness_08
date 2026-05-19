/**
 * BathroomAccessoryGeometry — LOD400 bathroom accessory family.
 *
 * Contract references:
 *   • 03-BIM-SEMANTIC-MODEL-CONTRACT.md      → accessoryVariant lives on the DTO;
 *     PlumbingFragmentBuilder rebuilds geometry deterministically from it.
 *   • 36 §5 / 39 §5 (geometry parity)        → Both PlumbingTool (preview) and
 *     PlumbingFragmentBuilder (committed) call createAccessoryGeometry() so the
 *     translucent preview silhouette matches the placed mesh.
 *   • 01-BIM-ENGINE-CORE-CONTRACT.md         → No hidden mutable state — the
 *     factory is pure, called fresh on every updateFixture().
 *   • 39-PLUMBING-FIXTURE-TYPE-PATTERN-CONTRACT.md §7 — Adding a new family.
 *
 * The six accessory variants migrated from the legacy BathroomEngine
 * (originally Kave-Home `/items/Bathroom/*`):
 *   1. washing_machine  — front-loading washing machine
 *   2. toilet_brush     — toilet brush in cylindrical holder
 *   3. toilet_paper     — wall-mount paper holder + roll
 *   4. laundry_bag      — fabric hamper with rope handles
 *   5. iron             — steam iron resting on its base
 *   6. ironing_board    — folding ironing board on splayed legs
 *
 * Local axes:
 *   • +Z points away from the back wall (into the room).
 *   • +Y is up. Origin sits on the floor at the back-centre.
 *   The fixture is positioned by the caller; rotation is applied by the
 *   command/tool to align the back face with the chosen wall.
 *
 * Determinism: no Math.random() — every dimension and angle is derived
 * from the variant and footprint constants. Reloads produce byte-identical
 * geometry (Contract 13).
 */

import * as THREE from '@pryzm/renderer-three/three';

export type BathroomAccessoryVariant =
    | 'washing_machine'
    | 'toilet_brush'
    | 'toilet_paper'
    | 'laundry_bag'
    | 'iron'
    | 'ironing_board';

export const ACCESSORY_VARIANTS: BathroomAccessoryVariant[] = [
    'washing_machine',
    'toilet_brush',
    'toilet_paper',
    'laundry_bag',
    'iron',
    'ironing_board',
];

export const ACCESSORY_VARIANT_LABELS: Record<BathroomAccessoryVariant, string> = {
    washing_machine: 'Washing Machine',
    toilet_brush:    'Toilet Brush',
    toilet_paper:    'Toilet Paper Holder',
    laundry_bag:     'Laundry Hamper',
    iron:            'Steam Iron',
    ironing_board:   'Ironing Board',
};

export const DEFAULT_ACCESSORY_VARIANT: BathroomAccessoryVariant = 'washing_machine';

export interface AccessoryFootprint {
    /** Width across (x) in metres. */
    width: number;
    /** Depth from wall (z) in metres. */
    length: number;
    /** Total height from floor in metres. */
    height: number;
}

export const ACCESSORY_FOOTPRINTS: Record<BathroomAccessoryVariant, AccessoryFootprint> = {
    washing_machine: { width: 0.60, length: 0.60, height: 0.85 },
    toilet_brush:    { width: 0.10, length: 0.10, height: 0.40 },
    toilet_paper:    { width: 0.18, length: 0.10, height: 0.12 },
    laundry_bag:     { width: 0.40, length: 0.40, height: 0.55 },
    iron:            { width: 0.26, length: 0.13, height: 0.18 },
    ironing_board:   { width: 0.40, length: 1.30, height: 0.85 },
};

export interface AccessoryGeometryOptions {
    /** Render with translucent material (used by the placement preview). */
    transparent?: boolean;
    /** Opacity when transparent. */
    opacity?: number;
}

// ─── Palette (stable, mirrors BathroomEngine's default palette) ──────────────

const PALETTE = {
    porcelain: 0xffffff,
    accent:    0xeeeeee,
    metal:     0xb8b8b8,
    glass:     0xcce5ff,
    fabric:    0xd9d2c0,
    plastic:   0xf5f5f5,
} as const;

// ─── Material helpers ────────────────────────────────────────────────────────

function mat(
    hex: number,
    opts: { roughness?: number; metalness?: number; transparent?: boolean; opacity?: number } = {},
    geomOpts?: AccessoryGeometryOptions,
): THREE.MeshStandardMaterial {
    const params: THREE.MeshStandardMaterialParameters = { color: hex };
    if (opts.roughness !== undefined) params.roughness = opts.roughness;
    if (opts.metalness !== undefined) params.metalness = opts.metalness;
    const isTransparent = opts.transparent || geomOpts?.transparent;
    if (isTransparent) {
        params.transparent = true;
        params.opacity = geomOpts?.opacity ?? opts.opacity ?? 0.55;
    }
    return new THREE.MeshStandardMaterial(params);
}

function addPart(
    parent: THREE.Group,
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    role: string,
    x = 0, y = 0, z = 0,
): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isBathroomPart: true, role };
    parent.add(mesh);
    return mesh;
}

// ─── Variant builders ────────────────────────────────────────────────────────

function buildWashingMachine(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, length: L, height: H } = ACCESSORY_FOOTPRINTS.washing_machine;
    const body  = mat(PALETTE.plastic, { roughness: 0.55 }, opts);
    const dark  = mat(0x222222,        { roughness: 0.80 }, opts);
    const glass = mat(PALETTE.glass,   { roughness: 0.05, metalness: 0.10, transparent: true, opacity: 0.55 }, opts);
    const trim  = mat(PALETTE.metal,   { roughness: 0.30, metalness: 0.70 }, opts);

    addPart(g, new THREE.BoxGeometry(W, H, L), body, 'shell', 0, H / 2, 0);
    addPart(g, new THREE.BoxGeometry(W * 0.96, 0.04, L * 0.40), dark,
        'control-panel', 0, H - 0.02 + 0.002, -L / 2 + L * 0.20 + 0.01);

    const knobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
    for (const sx of [-0.18, 0.18]) {
        addPart(g, knobGeo, trim, 'knob', sx, H + 0.012, -L / 2 + L * 0.20);
    }

    const doorR = Math.min(W, H) * 0.32;
    addPart(g, new THREE.TorusGeometry(doorR, 0.025, 12, 32), trim,
        'door-ring', 0, H * 0.50, L / 2 + 0.001);
    addPart(g, new THREE.CylinderGeometry(doorR - 0.02, doorR - 0.02, 0.02, 32), glass,
        'door-window', 0, H * 0.50, L / 2 + 0.011)
        .rotation.x = Math.PI / 2;
    addPart(g, new THREE.CylinderGeometry(doorR - 0.03, doorR - 0.03, 0.04, 32), dark,
        'drum', 0, H * 0.50, L / 2 - 0.020)
        .rotation.x = Math.PI / 2;

    const footGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12);
    for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
        addPart(g, footGeo, dark, 'foot',
            sx * (W / 2 - 0.05), 0.02, sz * (L / 2 - 0.05));
    }
}

function buildToiletBrush(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, length: L, height: H } = ACCESSORY_FOOTPRINTS.toilet_brush;
    const r = Math.min(W, L) / 2;
    const holderM = mat(PALETTE.plastic, { roughness: 0.55 }, opts);
    const handleM = mat(PALETTE.metal,   { roughness: 0.25, metalness: 0.70 }, opts);
    const bristle = mat(0x303030,        { roughness: 0.85 }, opts);

    const holderH = H * 0.85;
    addPart(g, new THREE.CylinderGeometry(r, r, holderH, 24), holderM,
        'holder', 0, holderH / 2, 0);
    addPart(g, new THREE.TorusGeometry(r, 0.008, 8, 24), holderM,
        'rim', 0, holderH, 0)
        .rotation.x = Math.PI / 2;

    addPart(g, new THREE.CylinderGeometry(0.008, 0.008, H * 0.55, 12), handleM,
        'handle', 0, H * 0.85 + (H * 0.55) / 2 - 0.05, 0);
    addPart(g, new THREE.SphereGeometry(r * 0.55, 12, 10), bristle,
        'bristles', 0, H - r * 0.4, 0);
}

function buildToiletPaper(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, height: H } = ACCESSORY_FOOTPRINTS.toilet_paper;
    const chrome = mat(PALETTE.metal,  { roughness: 0.20, metalness: 0.80 }, opts);
    const paper  = mat(0xfafafa,       { roughness: 0.85 }, opts);
    const inner  = mat(PALETTE.accent, { roughness: 0.85 }, opts);

    addPart(g, new THREE.BoxGeometry(0.04, 0.06, 0.06), chrome,
        'wall-plate', -W / 2 + 0.02, H * 0.50, 0);

    const arm = addPart(g, new THREE.CylinderGeometry(0.008, 0.008, W * 0.85, 12), chrome,
        'arm', 0, H * 0.50, 0);
    arm.rotation.z = Math.PI / 2;

    const rollR = H * 0.35;
    const rollD = W * 0.65;
    const roll = addPart(g, new THREE.CylinderGeometry(rollR, rollR, rollD, 24), paper,
        'roll', W * 0.05, H * 0.50, 0);
    roll.rotation.z = Math.PI / 2;

    const tube = addPart(g, new THREE.CylinderGeometry(rollR * 0.30, rollR * 0.30, rollD + 0.005, 16), inner,
        'tube', W * 0.05, H * 0.50, 0);
    tube.rotation.z = Math.PI / 2;
}

function buildLaundryBag(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, length: L, height: H } = ACCESSORY_FOOTPRINTS.laundry_bag;
    const r = Math.min(W, L) / 2;
    const fabricM = mat(PALETTE.fabric, { roughness: 0.95 }, opts);
    const rope    = mat(0xb39870,       { roughness: 0.85 }, opts);

    addPart(g, new THREE.CylinderGeometry(r, r * 0.95, H * 0.95, 24), fabricM,
        'body', 0, H * 0.95 / 2, 0);

    addPart(g, new THREE.TorusGeometry(r * 0.95, 0.012, 8, 24), rope,
        'drawstring', 0, H * 0.92, 0)
        .rotation.x = Math.PI / 2;

    for (const sx of [-1, 1]) {
        const h = addPart(g, new THREE.TorusGeometry(0.06, 0.008, 6, 16), rope,
            'handle', sx * (r * 0.95), H * 0.78, 0);
        h.rotation.y = Math.PI / 2;
    }
}

function buildIron(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, length: L, height: H } = ACCESSORY_FOOTPRINTS.iron;
    const body   = mat(PALETTE.plastic, { roughness: 0.55 }, opts);
    const sole   = mat(PALETTE.metal,   { roughness: 0.20, metalness: 0.80 }, opts);
    const handle = mat(0x222222,        { roughness: 0.65 }, opts);
    const tank   = mat(PALETTE.glass,   { roughness: 0.10, transparent: true, opacity: 0.65 }, opts);

    addPart(g, new THREE.BoxGeometry(W * 0.95, 0.02, L * 0.95), sole,
        'soleplate', 0, 0.01, 0);
    addPart(g, new THREE.BoxGeometry(W * 0.85, H * 0.40, L * 0.80), tank,
        'tank', 0, 0.02 + H * 0.20, 0);
    addPart(g, new THREE.BoxGeometry(W * 0.75, H * 0.30, L * 0.70), body,
        'body', 0, 0.02 + H * 0.55, 0);

    addPart(g, new THREE.BoxGeometry(0.025, H * 0.30, 0.04), handle,
        'handle-front', W * 0.20, 0.02 + H * 0.85, 0);
    addPart(g, new THREE.BoxGeometry(0.025, H * 0.30, 0.04), handle,
        'handle-back', -W * 0.20, 0.02 + H * 0.85, 0);
    addPart(g, new THREE.BoxGeometry(W * 0.45, 0.025, 0.04), handle,
        'handle-grip', 0, H + 0.005, 0);

    addPart(g, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), handle,
        'cable-hub', -W * 0.45, 0.02 + H * 0.55, 0)
        .rotation.z = Math.PI / 2;
}

function buildIroningBoard(g: THREE.Group, opts?: AccessoryGeometryOptions): void {
    const { width: W, length: L, height: H } = ACCESSORY_FOOTPRINTS.ironing_board;
    const cover = mat(PALETTE.fabric, { roughness: 0.95 }, opts);
    const metal = mat(PALETTE.metal,  { roughness: 0.30, metalness: 0.70 }, opts);

    const topT = 0.025;
    const tipL = L * 0.20;
    addPart(g, new THREE.BoxGeometry(W * 0.95, topT, L - tipL), cover,
        'top-main', 0, H - topT / 2, -tipL / 2);
    addPart(g, new THREE.BoxGeometry(W * 0.55, topT, tipL), cover,
        'top-nose', 0, H - topT / 2, (L - tipL) / 2);

    const legR = 0.012;
    const legLen = Math.hypot(W * 0.40, H);
    const legGeo = new THREE.CylinderGeometry(legR, legR, legLen, 12);
    const legAngle = Math.atan2(W * 0.40, H);

    for (const sx of [-1, 1]) {
        const leg = addPart(g, legGeo, metal, 'leg-front',
            sx * W * 0.20, (H - topT) / 2, -L * 0.10);
        leg.rotation.z = sx * legAngle;
    }
    for (const sx of [-1, 1]) {
        const leg = addPart(g, legGeo, metal, 'leg-back',
            sx * W * 0.20, (H - topT) / 2, L * 0.20);
        leg.rotation.z = -sx * legAngle;
    }

    addPart(g, new THREE.BoxGeometry(W * 0.60, 0.012, 0.012), metal,
        'cross-brace', 0, H * 0.45, 0);
}

// ─── Public factory ──────────────────────────────────────────────────────────

/**
 * Build a bathroom accessory group from a variant slug. Pure: no mutation
 * outside the returned Group; safe to call from preview, thumbnail, and
 * fragment-builder paths (Contract 36 §5 parity).
 */
export function createAccessoryGeometry(
    variant: BathroomAccessoryVariant,
    opts?: AccessoryGeometryOptions,
): THREE.Group {
    const group = new THREE.Group();
    group.name = `bathroom-accessory-${variant}`;
    group.userData = { role: 'bathroom-accessory', variant };

    switch (variant) {
        case 'washing_machine': buildWashingMachine(group, opts); break;
        case 'toilet_brush':    buildToiletBrush(group, opts);    break;
        case 'toilet_paper':    buildToiletPaper(group, opts);    break;
        case 'laundry_bag':     buildLaundryBag(group, opts);     break;
        case 'iron':            buildIron(group, opts);           break;
        case 'ironing_board':   buildIroningBoard(group, opts);   break;
        default: {
            const exhaustive: never = variant;
            throw new Error(`[BathroomAccessoryGeometry] Unknown variant '${exhaustive as string}'`);
        }
    }
    return group;
}
