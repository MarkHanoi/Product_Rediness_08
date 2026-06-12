// ST.1 — Interior Style System · StyleRegistry (pure data).
//
// SPEC: docs/03-execution/specs/SPEC-INTERIOR-STYLE-SYSTEM.md (§2–§6).
//
// ONE style selector drives all finishes. This module is the single source of
// truth for the SIX founder styles — Nordic · Mediterranean · Classic ·
// Countryside/Farmhouse · Japanese · Industrial — as a pure `StyleDescriptor`
// each (furniture wood/upholstery slots, a floor finish key, a numeric
// `glazingBias`, door/window finish hints, lighting + feature hints).
//
// `resolveStyle(input)` absorbs the LEGACY alias maps so saved briefs +
// existing tests keep resolving identically:
//   • `styleFinish.ts` ALIASES (modern/minimal/minimalist/warm/...)
//   • `floorFinish.ts` normaliseFloorStyle synonyms (rustic/cozy/scandi/...)
// The founder list has no "Minimalist" — the legacy `minimal`/`modern`/
// `minimalist`/`contemporary` chips fold onto **japanese** (the clean-line read,
// per SPEC §4); `warm`/`cozy`/`rustic` fold onto the warm earthy styles.
//
// PURITY (P5-grade): ZERO I/O, ZERO THREE, ZERO DOM, no random — same purity as
// `styleFinish.ts`. The descriptor SUPPLIES the slots `styleFinish.ts` consumes
// and the floor key `floorFinish.ts` keys off; it never imports either (no
// cross-package cycle). Deterministic.

/** The SIX canonical founder style ids (SPEC §2–§3). */
export type StyleId =
    | 'nordic'
    | 'mediterranean'
    | 'classic'
    | 'farmhouse'
    | 'japanese'
    | 'industrial';

/** Material finishes the geometry-furniture builders understand (mirrors the
 *  `FurnishFinish` union in styleFinish.ts). */
export type StyleFinish = 'fabric' | 'wood' | 'metal' | 'glass' | 'mirror';

/** One palette slot: a hex colour + a builder-understood material finish. Shape
 *  identical to the `Slot` styleFinish.ts already reads (`data.color` +
 *  `data.material`). */
export interface StyleSlot {
    readonly color: string;
    readonly material: StyleFinish;
}

/** The furniture finish slots a style supplies to styleFinish.ts (one per
 *  finish CATEGORY). `soft`/`neutral`/`mirror` round out the categories the
 *  furniture builders read; `upholstery`/`wood`/`table`/`metal` are the four
 *  SPEC §2 slots. */
export interface StyleFurnitureSlots {
    readonly upholstery: StyleSlot;
    readonly wood: StyleSlot;
    readonly table: StyleSlot;
    readonly metal: StyleSlot;
    readonly soft: StyleSlot;
    readonly neutral: StyleSlot;
    readonly mirror: StyleSlot;
}

/** A full style descriptor — the SPEC §2 `Style` + `StylePalette`, pure data. */
export interface StyleDescriptor {
    readonly id: StyleId;
    /** Human label for the picker (ST.7). */
    readonly label: string;
    /** Mood phrase (bright/calm, warm/sun-drenched, …). */
    readonly mood: string;
    /** Furniture slots consumed by styleFinish.ts. */
    readonly furniture: StyleFurnitureSlots;
    /** Interior wall paint (ST.3 target) + optional accent. */
    readonly wallPaint: string;
    readonly wallAccent: string;
    /** Floor finish KEY — the floorFinish.ts FloorStyle this style maps to. The
     *  floor colour/pattern authority stays in floorFinish.ts; this is the key
     *  the generator passes to `floorFinishFor(occ, key)`. */
    readonly floorFinishKey: StyleId;
    /** Dominant floor tone hint (descriptive; the real per-room finish lives in
     *  floorFinish.ts). */
    readonly floorColor: string;
    /** Door finish (ST.4 target). */
    readonly doorFinish: { readonly frameColor: string; readonly leafColor: string };
    /** Window finish (ST.4 target). */
    readonly windowFinish: { readonly frameColor: string };
    /** Lighting fixtures + warm/cool tone (ST.6 target). */
    readonly lighting: { readonly fixtures: readonly string[]; readonly toneKelvin: number };
    /** Architectural feature hints (descriptive; future feature emitters). */
    readonly features: readonly string[];
    /** ST.5 — glazing-size bias: multiplies emitted window width/height. 1.0 =
     *  neutral; >1 bigger windows; <1 smaller. Composes multiplicatively with the
     *  climate factor in emitWindows.ts. */
    readonly glazingBias: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SIX DESCRIPTORS (SPEC §3 founder palettes).
//
// The three already-shipped styles (Nordic · Mediterranean · Classic) reuse the
// EXACT hexes from styleFinish.ts PALETTE_TABLE so back-compat is byte-identical;
// Farmhouse · Japanese · Industrial are authored fresh from the founder palettes.
// ─────────────────────────────────────────────────────────────────────────────

const nordic: StyleDescriptor = {
    id: 'nordic',
    label: 'Nordic / Scandinavian',
    mood: 'bright, calm, hygge',
    furniture: {
        upholstery: { color: '#D9D6CE', material: 'fabric' }, // soft linen grey-white
        wood:       { color: '#E2D6BE', material: 'wood'   }, // pale ash / birch
        table:      { color: '#D8C9A8', material: 'wood'   }, // light oak
        metal:      { color: '#9FA4A8', material: 'metal'  }, // brushed matte steel
        soft:       { color: '#C7CCC9', material: 'fabric' }, // cool wool grey
        neutral:    { color: '#ECEAE4', material: 'metal'  }, // white-grey
        mirror:     { color: '#EEF2F4', material: 'mirror' }, // silver mirror
    },
    wallPaint: '#F3F1EC', // off-white / cream
    wallAccent: '#F3F1EC',
    floorFinishKey: 'nordic',
    floorColor: '#E2D6BE', // light oak / whitewashed plank
    doorFinish:   { frameColor: '#E2D6BE', leafColor: '#ECE6D8' }, // whitewashed / light wood
    windowFinish: { frameColor: '#ECE6D8' },
    lighting: { fixtures: ['pendant', 'candle', 'floor-lamp'], toneKelvin: 2700 },
    features: ['large windows', 'minimal clutter', 'cozy textiles'],
    glazingBias: 1.20, // founder "large windows", maximise daylight
};

const mediterranean: StyleDescriptor = {
    id: 'mediterranean',
    label: 'Mediterranean',
    mood: 'warm, sun-drenched',
    furniture: {
        upholstery: { color: '#C7A36B', material: 'fabric' }, // sand / ochre linen
        wood:       { color: '#9C6B3C', material: 'wood'   }, // warm honey wood / cane
        table:      { color: '#8A5A33', material: 'wood'   }, // warm walnut-brown
        metal:      { color: '#3B352E', material: 'metal'  }, // wrought iron (dark)
        soft:       { color: '#7A8450', material: 'fabric' }, // olive green textile
        neutral:    { color: '#C97B4A', material: 'wood'   }, // terracotta
        mirror:     { color: '#EEEAE0', material: 'mirror' }, // warm silver mirror
    },
    wallPaint: '#EFE3CE', // lime plaster / cream
    wallAccent: '#1F4E6B', // deep blue accent
    floorFinishKey: 'mediterranean',
    floorColor: '#C8794D', // terracotta tile
    doorFinish:   { frameColor: '#8A5A33', leafColor: '#9C6B3C' }, // warm/solid wood + iron
    windowFinish: { frameColor: '#3B352E' }, // wrought-iron-dark frame
    lighting: { fixtures: ['iron-chandelier', 'lantern', 'wall-sconce'], toneKelvin: 2700 },
    features: ['arches', 'exposed beams', 'indoor-outdoor', 'textured walls', 'big windows'],
    glazingBias: 1.25, // founder "big windows", indoor-outdoor — biggest
};

const classic: StyleDescriptor = {
    id: 'classic',
    label: 'Classic (Traditional European)',
    mood: 'elegant, timeless',
    furniture: {
        upholstery: { color: '#6E2230', material: 'fabric' }, // deep burgundy
        wood:       { color: '#5A3A22', material: 'wood'   }, // dark walnut / mahogany
        table:      { color: '#4E3320', material: 'wood'   }, // mahogany
        metal:      { color: '#B08D3C', material: 'metal'  }, // brass / bronze
        soft:       { color: '#1F3A5F', material: 'fabric' }, // deep navy
        neutral:    { color: '#7D6A4A', material: 'wood'   }, // aged brass-brown
        mirror:     { color: '#E8EAEC', material: 'mirror' }, // antiqued silver mirror
    },
    wallPaint: '#E7E0D2', // cream / ivory / taupe
    wallAccent: '#1F3A5F', // navy / burgundy / forest-green accents
    floorFinishKey: 'classic',
    floorColor: '#5A3A22', // dark herringbone hardwood
    doorFinish:   { frameColor: '#4E3320', leafColor: '#5A3A22' }, // mahogany / walnut + brass
    windowFinish: { frameColor: '#4E3320' },
    lighting: { fixtures: ['crystal-chandelier', 'wall-sconce', 'table-lamp'], toneKelvin: 2700 },
    features: ['crown moldings', 'trim', 'symmetry', 'detailed woodwork'],
    glazingBias: 1.05,
};

// ── NEW founder styles (SPEC §3) ──────────────────────────────────────────────

const farmhouse: StyleDescriptor = {
    id: 'farmhouse',
    label: 'Countryside / Farmhouse',
    mood: 'comfortable, rustic',
    furniture: {
        upholstery: { color: '#E3DCCB', material: 'fabric' }, // slipcovered cotton/linen cream
        wood:       { color: '#7E5A3C', material: 'wood'   }, // reclaimed / solid pine-oak
        table:      { color: '#6E4F33', material: 'wood'   }, // solid wood farm table
        metal:      { color: '#5C5750', material: 'metal'  }, // aged wrought iron / pewter
        soft:       { color: '#8FA0A6', material: 'fabric' }, // dusty blue / sage textile
        neutral:    { color: '#D8C9B0', material: 'wood'   }, // weathered cream wood
        mirror:     { color: '#ECECE4', material: 'mirror' }, // soft warm mirror
    },
    wallPaint: '#F2EDE1', // warm white / cream
    wallAccent: '#9CAE9A', // sage / dusty blue
    floorFinishKey: 'farmhouse',
    floorColor: '#8B6A47', // wide-plank / reclaimed wood
    doorFinish:   { frameColor: '#7E5A3C', leafColor: '#8B6A47' }, // reclaimed / natural wood
    windowFinish: { frameColor: '#EDE7D8' }, // painted cream timber
    lighting: { fixtures: ['lantern', 'rustic-pendant', 'warm-led'], toneKelvin: 2700 },
    features: ['exposed beams', 'open shelving', 'vintage cabinets'],
    glazingBias: 1.05,
};

const japanese: StyleDescriptor = {
    id: 'japanese',
    label: 'Japanese',
    mood: 'peaceful, minimalist, nature',
    furniture: {
        upholstery: { color: '#CFC6B4', material: 'fabric' }, // natural linen
        wood:       { color: '#B89B6E', material: 'wood'   }, // natural oak / bamboo
        table:      { color: '#9E8458', material: 'wood'   }, // low-profile oak
        metal:      { color: '#3A3A38', material: 'metal'  }, // matte charcoal
        soft:       { color: '#BFB6A4', material: 'fabric' }, // muted beige
        neutral:    { color: '#D8CFBE', material: 'wood'   }, // pale tatami straw
        mirror:     { color: '#EDEEEC', material: 'mirror' }, // soft neutral mirror
    },
    wallPaint: '#EFE9DC', // warm white / beige / taupe
    wallAccent: '#3A3A38', // charcoal accent
    floorFinishKey: 'japanese',
    floorColor: '#C9B98F', // tatami / natural oak / bamboo
    doorFinish:   { frameColor: '#9E8458', leafColor: '#EFE9DC' }, // cedar/oak frame + paper-screen leaf
    windowFinish: { frameColor: '#9E8458' }, // cedar/oak
    lighting: { fixtures: ['paper-lantern', 'indirect-led', 'hidden-led'], toneKelvin: 3000 },
    features: ['clean lines', 'empty space (ma)', 'sliding panels'],
    glazingBias: 1.00,
};

const industrial: StyleDescriptor = {
    id: 'industrial',
    label: 'Industrial',
    mood: 'urban, raw, warehouse',
    furniture: {
        upholstery: { color: '#5A3A2C', material: 'fabric' }, // brown leather (fabric slot keeps builder compat)
        wood:       { color: '#4A3B2E', material: 'wood'   }, // reclaimed dark wood
        table:      { color: '#3E342B', material: 'wood'   }, // reclaimed-wood + steel
        metal:      { color: '#2A2A2C', material: 'metal'  }, // black metal / steel
        soft:       { color: '#6E6A66', material: 'fabric' }, // grey textile
        neutral:    { color: '#3A3A3C', material: 'metal'  }, // dark steel
        mirror:     { color: '#DDE0E2', material: 'mirror' }, // cool steel mirror
    },
    wallPaint: '#9A938C', // microcement / gray
    wallAccent: '#3A3A3C', // charcoal / exposed-brick
    floorFinishKey: 'industrial',
    floorColor: '#8C8884', // polished concrete / microcement
    doorFinish:   { frameColor: '#2A2A2C', leafColor: '#3A3A3C' }, // black-metal / steel
    windowFinish: { frameColor: '#2A2A2C' }, // black steel frames
    lighting: { fixtures: ['exposed-bulb', 'black-metal-pendant', 'track-light'], toneKelvin: 3000 },
    features: ['exposed pipes', 'brick walls', 'open layouts'],
    glazingBias: 0.95, // slightly smaller punched openings vs the raw shell
};

/** The single source of truth — six founder styles keyed by StyleId. */
export const STYLE_REGISTRY: Readonly<Record<StyleId, StyleDescriptor>> = {
    nordic,
    mediterranean,
    classic,
    farmhouse,
    japanese,
    industrial,
};

/** The six canonical style ids, for UI / validation. */
export const STYLE_IDS: readonly StyleId[] = [
    'nordic', 'mediterranean', 'classic', 'farmhouse', 'japanese', 'industrial',
];

/** The canonical default when the brief value is unknown / absent. Matches the
 *  styleFinish.ts / floorFinish.ts DEFAULT_STYLE so absent style is byte-identical. */
export const DEFAULT_STYLE_ID: StyleId = 'nordic';

// ─────────────────────────────────────────────────────────────────────────────
// ALIASES — absorb BOTH legacy maps (styleFinish.ts ALIASES + floorFinish.ts
// normaliseFloorStyle synonyms) so saved briefs keep resolving. The founder list
// has no "Minimalist": the legacy minimal/modern/minimalist/contemporary chips
// fold onto JAPANESE (the clean-line read, SPEC §4); warm/cozy/rustic onto the
// warm earthy styles.
// ─────────────────────────────────────────────────────────────────────────────
const ALIASES: Readonly<Record<string, StyleId>> = {
    // canonical ids (self-map)
    nordic: 'nordic',
    mediterranean: 'mediterranean',
    classic: 'classic',
    farmhouse: 'farmhouse',
    japanese: 'japanese',
    industrial: 'industrial',
    // Nordic synonyms
    scandinavian: 'nordic',
    scandi: 'nordic',
    // Classic synonyms
    traditional: 'classic',
    // Mediterranean synonyms (legacy "warm" chip + warm-earthy free-text)
    warm: 'mediterranean',
    rustic: 'farmhouse',     // rustic reads as countryside/farmhouse (SPEC §3)
    cozy: 'mediterranean',
    cosy: 'mediterranean',
    // Farmhouse synonyms
    countryside: 'farmhouse',
    country: 'farmhouse',
    // Japanese synonyms + the legacy "minimal/modern/minimalist" clean-line chips
    japandi: 'japanese',
    zen: 'japanese',
    minimalist: 'japanese',
    minimal: 'japanese',
    modern: 'japanese',
    contemporary: 'japanese',
    // Industrial synonyms
    warehouse: 'industrial',
    loft: 'industrial',
};

/**
 * Normalise an arbitrary brief value to a canonical StyleId. Accepts the six
 * ids, both legacy alias maps, and free-text synonyms; anything else →
 * DEFAULT_STYLE_ID ('nordic'). Deterministic.
 */
export function resolveStyleId(input: unknown): StyleId {
    if (typeof input !== 'string') return DEFAULT_STYLE_ID;
    return ALIASES[input.toLowerCase().trim()] ?? DEFAULT_STYLE_ID;
}

/**
 * Resolve an arbitrary brief value to a full StyleDescriptor. Deterministic;
 * never throws (unknown → nordic).
 */
export function resolveStyle(input: unknown): StyleDescriptor {
    return STYLE_REGISTRY[resolveStyleId(input)];
}

/**
 * The glazing-size bias for a brief style — the one number ST.5 multiplies the
 * emitted window width/height by. Absent / unknown style → nordic's bias. To get
 * a NEUTRAL 1.0 (byte-identical legacy emission), pass nothing to the emitter
 * rather than calling this. Deterministic.
 */
export function glazingBiasFor(input: unknown): number {
    return resolveStyle(input).glazingBias;
}
