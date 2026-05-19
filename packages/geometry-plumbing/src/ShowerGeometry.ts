/**
 * ShowerGeometry — LOD400 high-detail shower families.
 *
 * Contract references:
 *   • 03-BIM-SEMANTIC-MODEL-CONTRACT.md      → showerVariant lives on the DTO;
 *     PlumbingFragmentBuilder rebuilds geometry deterministically from it.
 *   • 36 §5 / 39 §5 (geometry parity)        → Both PlumbingTool (preview) and
 *     PlumbingFragmentBuilder (committed) call createShowerGeometry() so the
 *     translucent preview silhouette matches the placed mesh.
 *   • 01-BIM-ENGINE-CORE-CONTRACT.md         → No hidden mutable state — the
 *     factory is pure, called fresh on every updateFixture().
 *   • 39-PLUMBING-FIXTURE-TYPE-PATTERN-CONTRACT.md §7 — Adding a new family.
 *
 * The four LOD400 families mirror the catalogue images:
 *   1. shower_system_shelf  — wall column, round rain-head, shelf with bottles,
 *                             handheld shower & mixer below.
 *   2. shower_system_simple — wall column, round rain-head, thermostat bar,
 *                             handheld shower (no shelf).
 *   3. shower_cabinet_sliding — square glass enclosure with sliding door,
 *                               low ceramic tray.
 *   4. shower_cabinet_open    — open glass enclosure (no door), low tray.
 *
 * Local axes:
 *   • +Z points away from the back wall (into the room).
 *   • +Y is up. Origin sits on the floor at the back-centre (against the wall).
 *   The fixture is positioned by the caller; rotation is applied by the
 *   command/tool to align the back face with the chosen wall.
 */

import * as THREE from '@pryzm/renderer-three/three';

export type ShowerVariant =
    | 'shower_system_shelf'
    | 'shower_system_simple'
    | 'shower_cabinet_sliding'
    | 'shower_cabinet_open';

export const SHOWER_VARIANTS: ShowerVariant[] = [
    'shower_system_shelf',
    'shower_system_simple',
    'shower_cabinet_sliding',
    'shower_cabinet_open',
];

export const SHOWER_VARIANT_LABELS: Record<ShowerVariant, string> = {
    shower_system_shelf:    'Rain System with Shelf',
    shower_system_simple:   'Rain System (Simple)',
    shower_cabinet_sliding: 'Glass Cabinet — Sliding Door',
    shower_cabinet_open:    'Glass Cabinet — Open',
};

export const DEFAULT_SHOWER_VARIANT: ShowerVariant = 'shower_system_shelf';

export interface ShowerFootprint {
    /** Width across (x) in metres. */
    width: number;
    /** Depth from wall (z) in metres. */
    length: number;
    /** Total height from floor in metres (rain-head / cabinet top). */
    height: number;
}

/**
 * Footprints chosen to match real catalogue dimensions:
 *   • Systems are slim columns ~12 cm wide × 35-40 cm deep (rain-head reach)
 *     and ~2.10 m tall.
 *   • Cabinets are 90 × 90 cm enclosures, 2.00 m tall.
 */
export const SHOWER_FOOTPRINTS: Record<ShowerVariant, ShowerFootprint> = {
    shower_system_shelf:    { width: 0.30, length: 0.40, height: 2.10 },
    shower_system_simple:   { width: 0.28, length: 0.36, height: 2.10 },
    shower_cabinet_sliding: { width: 0.90, length: 0.90, height: 2.00 },
    shower_cabinet_open:    { width: 0.90, length: 0.90, height: 2.00 },
};

export interface ShowerGeometryOptions {
    /** Override metal/chrome colour (default: 0x222222 — matt black per refs). */
    metalColor?: number;
    /** Override glass colour (default: 0xc8d8e0). */
    glassColor?: number;
    /** Override ceramic/tray colour (default: 0xffffff). */
    ceramicColor?: number;
    /** Render with translucent material (used by the placement preview). */
    transparent?: boolean;
    /** Opacity when transparent. */
    opacity?: number;
}

// ─── Material helpers ─────────────────────────────────────────────────────────

function makeMetal(opts: ShowerGeometryOptions): THREE.Material {
    return new THREE.MeshStandardMaterial({
        color:       opts.metalColor ?? 0x222222,
        roughness:   0.30,
        metalness:   0.85,
        transparent: !!opts.transparent,
        opacity:     opts.transparent ? (opts.opacity ?? 0.55) : 1,
    });
}

function makeGlass(opts: ShowerGeometryOptions): THREE.Material {
    // Even when "transparent" preview mode is off, glass is always semi-transparent.
    const previewing = !!opts.transparent;
    return new THREE.MeshStandardMaterial({
        color:       opts.glassColor ?? 0xc8d8e0,
        roughness:   0.05,
        metalness:   0.05,
        transparent: true,
        opacity:     previewing ? (opts.opacity ?? 0.55) : 0.28,
        side:        THREE.DoubleSide,
    });
}

function makeCeramic(opts: ShowerGeometryOptions): THREE.Material {
    return new THREE.MeshStandardMaterial({
        color:       opts.ceramicColor ?? 0xffffff,
        roughness:   0.20,
        metalness:   0.05,
        transparent: !!opts.transparent,
        opacity:     opts.transparent ? (opts.opacity ?? 0.55) : 1,
    });
}

// ─── Sub-assembly builders ────────────────────────────────────────────────────

/** Wall-mounted vertical riser pipe. */
function buildRiserPipe(
    height: number, mat: THREE.Material,
    radius = 0.018,
): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(0, height / 2, 0.025);
    return m;
}

/** Top elbow + horizontal arm reaching out for the rain-head. */
function buildRainArm(
    yTop: number, reach: number, mat: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    const tubeR = 0.018;

    // Vertical short stub (after riser elbow)
    const stub = new THREE.Mesh(
        new THREE.CylinderGeometry(tubeR, tubeR, 0.06, 16),
        mat,
    );
    stub.position.set(0, yTop - 0.03, 0.025);
    g.add(stub);

    // Horizontal arm
    const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(tubeR, tubeR, reach, 16),
        mat,
    );
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, yTop, 0.025 + reach / 2);
    g.add(arm);

    return g;
}

/** Round rain shower head (flat cylindrical disc). */
function buildRainHead(
    radius: number, yTop: number, zReach: number,
    mat: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    // Disc body
    const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.92, 0.022, 32),
        mat,
    );
    disc.position.set(0, yTop - 0.012, zReach);
    g.add(disc);
    // Connector hub on top
    const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.030, 0.018, 16),
        mat,
    );
    hub.position.set(0, yTop + 0.006, zReach);
    g.add(hub);
    return g;
}

/** Cylindrical mid-mount slider holder for the handheld. */
function buildHandheldHolder(
    yMount: number, mat: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    // Slider clamp
    const clamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.06, 16),
        mat,
    );
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(0.04, yMount, 0.025);
    g.add(clamp);
    // Handheld body
    const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.016, 0.20, 16),
        mat,
    );
    handle.position.set(0.10, yMount - 0.06, 0.06);
    handle.rotation.z = -Math.PI / 8;
    g.add(handle);
    // Spray head
    const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.038, 0.022, 24),
        mat,
    );
    head.position.set(0.13, yMount + 0.025, 0.07);
    head.rotation.z = -Math.PI / 8;
    g.add(head);
    return g;
}

/** Horizontal shelf below the slider clamp (for variant `shower_system_shelf`). */
function buildShelf(
    width: number, depth: number, yShelf: number,
    metal: THREE.Material, ceramic: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    // Shelf tray
    const tray = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.01, depth),
        metal,
    );
    tray.position.set(0, yShelf, 0.025 + depth / 2);
    g.add(tray);
    // Two decorative bottles (whitewash) — purely visual.
    for (let i = 0; i < 2; i++) {
        const bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.028, 0.10, 12),
            ceramic,
        );
        bottle.position.set((i === 0 ? -1 : 1) * width * 0.20,
                            yShelf + 0.06,
                            0.025 + depth / 2);
        g.add(bottle);
    }
    return g;
}

/** Lower thermostatic mixer block with two control knobs. */
function buildMixer(
    yMixer: number, metal: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    // Crossbar between hot and cold
    const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.22, 16),
        metal,
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, yMixer, 0.030);
    g.add(bar);
    // Two end knobs
    for (let i = 0; i < 2; i++) {
        const knob = new THREE.Mesh(
            new THREE.CylinderGeometry(0.030, 0.030, 0.030, 16),
            metal,
        );
        knob.rotation.z = Math.PI / 2;
        knob.position.set((i === 0 ? -1 : 1) * 0.115, yMixer, 0.030);
        g.add(knob);
    }
    // Spout (downward angled)
    const spout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.10, 16),
        metal,
    );
    spout.position.set(0, yMixer - 0.06, 0.060);
    g.add(spout);
    return g;
}

/** Low ceramic shower tray (90 × 90 cm × 5 cm). */
function buildShowerTray(
    width: number, length: number, mat: THREE.Material,
): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, 0.05, length);
    const m   = new THREE.Mesh(geo, mat);
    // Anchored at back-centre; tray centred along x and pushed forward in z.
    m.position.set(0, 0.025, length / 2);
    return m;
}

/** Vertical glass panel anchored at one corner of the tray. */
function buildGlassPanel(
    width: number, height: number,
    centreX: number, centreZ: number, rotY: number,
    mat: THREE.Material,
): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, 0.008);
    const m   = new THREE.Mesh(geo, mat);
    m.rotation.y = rotY;
    m.position.set(centreX, height / 2 + 0.05, centreZ);
    return m;
}

/** Slim metal cap framing the top of a glass panel. */
function buildPanelTopRail(
    width: number, height: number,
    centreX: number, centreZ: number, rotY: number,
    mat: THREE.Material,
): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, 0.025, 0.02);
    const m   = new THREE.Mesh(geo, mat);
    m.rotation.y = rotY;
    m.position.set(centreX, height + 0.05 + 0.013, centreZ);
    return m;
}

/** Vertical handle on the sliding door panel. */
function buildSlidingHandle(
    yMid: number, x: number, z: number,
    rotY: number, mat: THREE.Material,
): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.30, 16);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(x, yMid, z);
    m.rotation.y = rotY;
    return m;
}

// ─── Family builders ──────────────────────────────────────────────────────────

function buildShowerSystem(
    variant: 'shower_system_shelf' | 'shower_system_simple',
    fp: ShowerFootprint,
    metal: THREE.Material,
    ceramic: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();
    const totalH    = fp.height;
    const headRadius = variant === 'shower_system_shelf' ? 0.13 : 0.11;
    const armReach   = Math.max(0.20, fp.length - 0.10);

    // Vertical riser stops short of the elbow so the arm sits proud.
    g.add(buildRiserPipe(totalH - 0.08, metal));

    // Top arm + rain-head
    g.add(buildRainArm(totalH - 0.04, armReach, metal));
    g.add(buildRainHead(headRadius, totalH - 0.04, 0.025 + armReach, metal));

    // Mid-height handheld holder + handheld
    const yHandheldMount = 1.40;
    g.add(buildHandheldHolder(yHandheldMount, metal));

    if (variant === 'shower_system_shelf') {
        const yShelf = 1.05;
        g.add(buildShelf(fp.width * 0.85, 0.16, yShelf, metal, ceramic));
    }

    // Lower mixer / thermostat block
    const yMixer = 0.95;
    g.add(buildMixer(yMixer, metal));

    return g;
}

function buildShowerCabinet(
    variant: 'shower_cabinet_sliding' | 'shower_cabinet_open',
    fp: ShowerFootprint,
    metal: THREE.Material,
    glass: THREE.Material,
    ceramic: THREE.Material,
): THREE.Group {
    const g = new THREE.Group();

    const w = fp.width;
    const d = fp.length;
    const panelH = fp.height - 0.05; // panels rest on the tray

    // Tray (centred in x, anchored at back wall)
    g.add(buildShowerTray(w, d, ceramic));

    // Side panel (left): runs along x = -w/2, depth d, parallel to wall normal.
    g.add(buildGlassPanel(d, panelH, -w / 2, d / 2, Math.PI / 2, glass));
    g.add(buildPanelTopRail(d, panelH, -w / 2, d / 2, Math.PI / 2, metal));

    // Side panel (right)
    g.add(buildGlassPanel(d, panelH,  w / 2, d / 2, Math.PI / 2, glass));
    g.add(buildPanelTopRail(d, panelH,  w / 2, d / 2, Math.PI / 2, metal));

    // Front panel (faces +z, away from wall)
    if (variant === 'shower_cabinet_sliding') {
        // Two overlapping front panels (left half + sliding right half).
        const halfW = w / 2;
        // Static left half
        g.add(buildGlassPanel(halfW, panelH, -halfW / 2, d - 0.005, 0, glass));
        // Sliding right half (offset slightly forward in z to imply overlap track)
        g.add(buildGlassPanel(halfW, panelH,  halfW / 2, d + 0.010, 0, glass));
        // Top rail spans full width
        g.add(buildPanelTopRail(w, panelH, 0, d, 0, metal));
        // Vertical handle on the sliding (right) panel
        g.add(buildSlidingHandle(panelH * 0.55 + 0.05, halfW * 0.85, d + 0.020, 0, metal));
    } else {
        // Open cabinet: front rail only (no glass), entry void.
        g.add(buildPanelTopRail(w, panelH, 0, d, 0, metal));
    }

    return g;
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Build a complete shower group for a given LOD400 variant.
 *
 * The returned Group is anchored at floor level, with +Z facing into the room
 * (away from the wall) and the back of the fixture touching the wall plane.
 *
 * Geometry parity (Contracts 36 §5 / 39 §5):
 *   The placement preview (PlumbingTool) and committed mesh
 *   (PlumbingFragmentBuilder) both call this function so the silhouette and
 *   sub-assembly positions match exactly.
 */
export function createShowerGeometry(
    variant: ShowerVariant,
    opts: ShowerGeometryOptions = {},
): THREE.Group {
    const fp      = SHOWER_FOOTPRINTS[variant];
    const metal   = makeMetal(opts);
    const ceramic = makeCeramic(opts);
    const glass   = makeGlass(opts);

    if (variant === 'shower_system_shelf' || variant === 'shower_system_simple') {
        return buildShowerSystem(variant, fp, metal, ceramic);
    }
    return buildShowerCabinet(variant, fp, metal, glass, ceramic);
}
