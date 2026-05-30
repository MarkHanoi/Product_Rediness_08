/**
 * @file LightingTypes.ts
 *
 * Parametric lighting fixture types for PRYZM.
 *
 * Ceiling-mounted (pendant / surface):
 *   downlight          — Surface-mounted cylindrical canister (black/gold interior)
 *   pendant            — Pendant cylinder hanging from a cable (white/grey)
 *   linear_led         — Rectangular linear LED bar pendant (dark with LED strip)
 *   pendant_pebble     — Flat pebble/disc pendant (cream/beige, wide & low)
 *   pendant_ceramic_bell — Ceramic bell pendant (dark-red glazed, single cable)
 *   pendant_conical    — Conical/UFO pendant (cream/beige, wide brim)
 *
 * Floor-standing:
 *   floor_wood_post    — Wood-post floor lamp with drum shade
 *   floor_arc_brass    — Arched brass floor lamp with marble base
 *   floor_tripod_black — Black tripod floor lamp with drum shade
 *
 * Surface/table:
 *   table_terracotta   — Bedside table lamp — terracotta column + cone shade
 *
 * Design rules (contracts):
 *  - Pure DTO — no THREE.js, no store logic, no imports from engine.
 *  - Plain Point3D / EulerDTO for position / rotation (§3.4 DTO compliance).
 *  - Optional fields use `?` for additive-only schema changes (§3.4).
 *  - FLOOR_MOUNTED_FIXTURES set drives placement mode in LightingTool.
 */

import { Point3D, EulerDTO } from '../types/GeometryDTO';

// ── Fixture family ─────────────────────────────────────────────────────────

export type LightingFixtureType =
    | 'downlight'            // Surface-mounted cylindrical canister
    | 'pendant'              // Hanging pendant cylinder
    | 'linear_led'           // Linear LED bar pendant
    | 'pendant_pebble'       // Flat pebble/disc pendant (cream)
    | 'pendant_ceramic_bell' // Ceramic bell pendant (dark red)
    | 'pendant_conical'      // Conical/UFO pendant (cream)
    | 'floor_wood_post'      // Floor lamp — wood post + drum shade
    | 'floor_arc_brass'      // Floor lamp — brass arc + marble base
    | 'table_terracotta'     // Table lamp — terracotta column + cone shade
    | 'floor_tripod_black'   // Floor lamp — black tripod + drum shade
    | 'mirror_light';        // F1.5' (2026-05-30) — wall-mounted vanity light strip above bathroom mirror

/**
 * Fixture types that are placed on the floor / a surface rather than the
 * ceiling. LightingTool uses this to determine the Y placement plane.
 */
export const FLOOR_MOUNTED_FIXTURES: ReadonlySet<LightingFixtureType> = new Set<LightingFixtureType>([
    'floor_wood_post',
    'floor_arc_brass',
    'table_terracotta',
    'floor_tripod_black',
]);

// ── Parametric dimensions (all metres) ────────────────────────────────────

export interface DownlightParams {
    readonly radius:     number;  // outer canister radius (default 0.065)
    readonly height:     number;  // canister height (default 0.12)
    readonly color:      string;  // body color hex (default '#1a1a1a')
    readonly goldColor:  string;  // inner reflector hex (default '#c8a000')
}

export interface PendantParams {
    readonly radius:     number;  // cylinder radius (default 0.045)
    readonly height:     number;  // cylinder height (default 0.28)
    readonly cableLen:   number;  // cable drop length (default 0.60)
    readonly color:      string;  // body color hex (default '#d0d0d0')
}

export interface LinearLedParams {
    readonly width:      number;  // bar width (X, default 0.06)
    readonly height:     number;  // bar height (Y, default 0.05)
    readonly length:     number;  // bar length (Z, default 1.20)
    readonly cableLen:   number;  // cable drop length per end (default 0.40)
    readonly color:      string;  // bar body color (default '#2a2a2a')
    readonly ledColor:   string;  // LED strip emissive color (default '#fff8e7')
}

// ── New pendant types ─────────────────────────────────────────────────────

export interface PendantPebbleParams {
    readonly radius:    number;   // disc radius (default 0.18)
    readonly height:    number;   // disc height/thickness (default 0.09)
    readonly cableLen:  number;   // cable drop (default 0.50)
    readonly color:     string;   // body color hex (default '#e8e0d0')
}

export interface PendantCeramicBellParams {
    readonly topRadius:    number; // top (narrow) radius (default 0.045)
    readonly botRadius:    number; // bottom (wide) radius (default 0.11)
    readonly height:       number; // bell height (default 0.14)
    readonly cableLen:     number; // cable drop (default 0.45)
    readonly color:        string; // glaze color (default '#7a1c1c')
    readonly innerColor:   string; // inner rim color (default '#f2f2f2')
}

export interface PendantConicalParams {
    readonly topRadius:    number; // narrow top radius (default 0.045)
    readonly botRadius:    number; // wide bottom brim (default 0.22)
    readonly height:       number; // cone height (default 0.11)
    readonly cableLen:     number; // cable drop (default 0.48)
    readonly color:        string; // body color hex (default '#d4cfc0')
}

// ── New floor-standing types ──────────────────────────────────────────────

export interface FloorWoodPostParams {
    readonly postHeight:   number; // total post height (default 1.55)
    readonly postColor:    string; // wood color (default '#9c6834')
    readonly shadeRadius:  number; // drum shade radius (default 0.22)
    readonly shadeHeight:  number; // drum shade height (default 0.20)
    readonly shadeColor:   string; // shade color (default '#e8e8e8')
}

export interface FloorArcBrassParams {
    readonly postHeight:   number; // vertical post height (default 1.80)
    readonly arcRadius:    number; // arc reach (default 0.95)
    readonly color:        string; // brass color (default '#c8a020')
    readonly baseRadius:   number; // marble disc radius (default 0.22)
    readonly shadeRadius:  number; // dome shade radius (default 0.17)
}

export interface TableTerracottaParams {
    readonly bodyHeight:   number; // column body height (default 0.42)
    readonly bodyRadius:   number; // column radius (default 0.055)
    readonly bodyColor:    string; // terracotta color (default '#c46a4a')
    readonly shadeTopR:    number; // cone top radius (default 0.055)
    readonly shadeBotR:    number; // cone bottom radius (default 0.165)
    readonly shadeHeight:  number; // cone shade height (default 0.22)
    readonly shadeColor:   string; // shade color (default '#e8e0d0')
}

export interface FloorTripodBlackParams {
    readonly legHeight:    number; // leg length (default 1.45)
    readonly color:        string; // tripod color (default '#1a1a1a')
    readonly shadeRadius:  number; // drum shade radius (default 0.25)
    readonly shadeHeight:  number; // drum shade height (default 0.22)
    readonly shadeColor:   string; // shade color (default '#1a1a1a')
}

/**
 * F1.5' MirrorLightParams — wall-mounted bathroom-mirror task light.
 * Horizontal slim bar (typ. 600 × 50 × 35 mm) with an emissive front
 * face. Mounted above the bathroom_mirror at vanity-mirror height
 * (architectural default ~1.85 m AFL — 1.10 m mirror baseOffset + 0.70 m
 * mirror height + 0.05 m gap).
 */
export interface MirrorLightParams {
    readonly width:       number;  // bar length along the wall (default 0.60)
    readonly height:      number;  // bar height (Y, default 0.05)
    readonly depth:       number;  // bar projection out from the wall (default 0.035)
    readonly bodyColor:   string;  // bar body color (default '#c0c0c0' — brushed steel)
    readonly ledColor:    string;  // LED strip emissive color (default '#fff4e0' — warm white)
}

// ── Emission config (night-mode) ────────────────────────────────────────────

export interface LightEmissionConfig {
    readonly color:      string;   // THREE hex color string (default '#fff3d0')
    readonly intensity:  number;   // light intensity (default 1.2)
    readonly distance:   number;   // attenuation distance in metres (default 5.0)
    readonly decay:      number;   // physically-based decay exponent (default 2)
}

// ── Lighting element DTO ────────────────────────────────────────────────────

export interface LightingData {
    readonly id:          string;
    readonly type:        'lighting';
    readonly levelId:     string;
    readonly fixtureType: LightingFixtureType;
    readonly position:    Point3D;
    readonly rotation?:   EulerDTO;

    // ── Ceiling pendants / surface ──────────────────────────────────────────
    /** Parametric dims — exactly one of these is populated per fixtureType */
    readonly downlightParams?:          Partial<DownlightParams>;
    readonly pendantParams?:            Partial<PendantParams>;
    readonly linearLedParams?:          Partial<LinearLedParams>;
    readonly pendantPebbleParams?:      Partial<PendantPebbleParams>;
    readonly pendantCeramicBellParams?: Partial<PendantCeramicBellParams>;
    readonly pendantConicalParams?:     Partial<PendantConicalParams>;

    // ── Floor / table ───────────────────────────────────────────────────────
    readonly floorWoodPostParams?:      Partial<FloorWoodPostParams>;
    readonly floorArcBrassParams?:      Partial<FloorArcBrassParams>;
    readonly tableTerracottaParams?:    Partial<TableTerracottaParams>;
    readonly floorTripodBlackParams?:   Partial<FloorTripodBlackParams>;

    // ── F1.5' (2026-05-30) — wall-mounted bathroom vanity light ─────────────
    readonly mirrorLightParams?:        Partial<MirrorLightParams>;

    /** Emission override — if absent uses defaults for the fixtureType */
    readonly emission?: Partial<LightEmissionConfig>;

    readonly properties?: Record<string, string | number | boolean | null>;

    // ── Spatial / hierarchy bindings (additive — Contract 03 §3.4) ──────────
    /** Room that contains this fixture's plan position; resolved at placement. */
    readonly roomId?:  string;
    /** Optional host element (e.g., a furniture surface this fixture sits on). */
    readonly hostId?:  string;
    /** Free-form tags for project-browser filtering / search. */
    readonly tags?:    string[];
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DOWNLIGHT_DEFAULTS: DownlightParams = {
    radius:    0.065,
    height:    0.12,
    color:     '#1a1a1a',
    goldColor: '#c8a000',
};

export const PENDANT_DEFAULTS: PendantParams = {
    radius:   0.045,
    height:   0.28,
    cableLen: 0.60,
    color:    '#d4d4d4',
};

export const LINEAR_LED_DEFAULTS: LinearLedParams = {
    width:    0.06,
    height:   0.05,
    length:   1.20,
    cableLen: 0.40,
    color:    '#2a2a2a',
    ledColor: '#fff8e7',
};

export const PENDANT_PEBBLE_DEFAULTS: PendantPebbleParams = {
    radius:   0.18,
    height:   0.09,
    cableLen: 0.50,
    color:    '#e8e0d0',
};

export const PENDANT_CERAMIC_BELL_DEFAULTS: PendantCeramicBellParams = {
    topRadius:  0.045,
    botRadius:  0.11,
    height:     0.14,
    cableLen:   0.45,
    color:      '#7a1c1c',
    innerColor: '#f2f2f2',
};

export const PENDANT_CONICAL_DEFAULTS: PendantConicalParams = {
    topRadius: 0.045,
    botRadius: 0.22,
    height:    0.11,
    cableLen:  0.48,
    color:     '#d4cfc0',
};

export const FLOOR_WOOD_POST_DEFAULTS: FloorWoodPostParams = {
    postHeight:  1.55,
    postColor:   '#9c6834',
    shadeRadius: 0.22,
    shadeHeight: 0.20,
    shadeColor:  '#e8e8e8',
};

export const FLOOR_ARC_BRASS_DEFAULTS: FloorArcBrassParams = {
    postHeight:  1.80,
    arcRadius:   0.95,
    color:       '#c8a020',
    baseRadius:  0.22,
    shadeRadius: 0.17,
};

export const TABLE_TERRACOTTA_DEFAULTS: TableTerracottaParams = {
    bodyHeight:  0.42,
    bodyRadius:  0.055,
    bodyColor:   '#c46a4a',
    shadeTopR:   0.055,
    shadeBotR:   0.165,
    shadeHeight: 0.22,
    shadeColor:  '#e8e0d0',
};

export const FLOOR_TRIPOD_BLACK_DEFAULTS: FloorTripodBlackParams = {
    legHeight:   1.45,
    color:       '#1a1a1a',
    shadeRadius: 0.25,
    shadeHeight: 0.22,
    shadeColor:  '#1a1a1a',
};

/** F1.5' MirrorLight defaults — slim warm-LED bar above bathroom mirror. */
export const MIRROR_LIGHT_DEFAULTS: MirrorLightParams = {
    width:     0.60,
    height:    0.05,
    depth:     0.035,
    bodyColor: '#c0c0c0',
    ledColor:  '#fff4e0',
};

export const DEFAULT_EMISSION: LightEmissionConfig = {
    color:     '#fff3d0',
    intensity: 1.5,
    distance:  6.0,
    decay:     2,
};
