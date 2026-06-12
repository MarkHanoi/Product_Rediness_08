// A.21.D4 → A.21.D19 — Style → furniture finish.
//
// A.21.D4 introduced the brief's style chip (modern/classic/minimal/warm) as a
// per-category {color, material} finish. A.21.D19 ("different materials depending
// on the style") REPLACES the 4 coarse chips with FOUR architecturally-grounded
// styles — Nordic · Mediterranean · Minimalist · Classic — each driving a DISTINCT
// material + colour per furniture CATEGORY. The old ids stay as aliases
// (see ALIASES below) so existing briefs + tests keep working.
//
// Pure + deterministic; ZERO imports. The editor's furniture builders read
// `data.color` (hex) + `data.material` ('fabric'|'wood'|'metal'|'glass') — see the
// geometry-furniture builders (e.g. WhiteSofaBuilder, ChairBuilder) — so a coherent
// per-style, per-category palette here makes the style chip visibly change the
// result.
//
// CATEGORY DOCTRINE (which furniture takes which palette slot):
//   upholstery → seating + beds (sofa, chairs, beds, benches, stools)  → 'fabric'
//   wood       → case-goods + storage (wardrobe, dresser, sideboard…)  → 'wood'
//   table      → tables + desks + consoles                             → wood/metal/glass
//   metal      → metal/hardware-forward pieces (frames, shelving)      → 'metal'
//   soft       → soft furnishings hint (rugs, cushions — future)       → 'fabric'
//   neutral    → appliances, fixtures, misc                            → style default
//
// The PALETTE_TABLE below is the design of record (see
// docs/03-execution/specs/SPEC-FURNISHING-STYLES.md). Keep it the single source.

// ST.3 (SPEC-INTERIOR-STYLE-SYSTEM) — the only import: the pure StyleRegistry
// LEAF module (zero imports itself), source of the three NEW founder styles'
// furniture slots. The legacy 4-style path below is unchanged (byte-identical).
import { STYLE_REGISTRY } from './style/StyleRegistry.js';

/** The four CANONICAL furnishing styles (A.21.D19). */
export type CanonicalStyle = 'nordic' | 'mediterranean' | 'minimalist' | 'classic';

/**
 * Accepted brief style values: the four canonical ids + the legacy A.21.D4 chips
 * kept as aliases. Anything else falls back to 'nordic' (the light, broadly-liked
 * default). NOTE: 'classic' is BOTH a canonical id and a legacy chip — same target.
 */
export type FurnishStyle = CanonicalStyle | 'modern' | 'minimal' | 'warm';

/** Material finishes the geometry-furniture builders understand.
 *  §63.1 / bedroom-mirror (2026-06-11): + 'mirror' — a reflective surface for the
 *  mirror kinds (wall_mirror / bathroom_mirror / wc_mirror). The mirror builders
 *  render this as a high-metalness / low-roughness polished plane (see
 *  geometry-furniture/builders/MirrorMaterial.ts). */
export type FurnishFinish = 'fabric' | 'wood' | 'metal' | 'glass' | 'mirror';

/** Furniture finish CATEGORIES — the columns of the palette table.
 *  §63.1: + 'mirror' — the reflective-glass category for mirror kinds. */
export type FinishCategory = 'upholstery' | 'wood' | 'table' | 'metal' | 'soft' | 'neutral' | 'mirror';

/** One palette slot: a colour + the builder-understood material finish. */
interface Slot {
    readonly color: string;
    readonly material: FurnishFinish;
}

/** A full per-style palette (one Slot per category) + floor/wall accent hints. */
interface StylePalette {
    readonly upholstery: Slot; // sofas, chairs, beds, benches, stools
    readonly wood: Slot;       // wardrobes, dressers, sideboards, shelving (case-goods)
    readonly table: Slot;      // dining/coffee/console tables, desks
    readonly metal: Slot;      // metal/hardware-forward pieces
    readonly soft: Slot;       // soft furnishings (rugs, cushions) — future use
    readonly neutral: Slot;    // appliances, fixtures, misc fallback
    readonly mirror: Slot;     // §63.1 — mirror kinds (reflective silver glass)
    /** Floor finish hint (the canonical floor mapping lives in floorFinish.ts). */
    readonly floorColor: string;
    /** Wall accent hint (no wall-finish pipeline yet — see SPEC follow-up). */
    readonly wallAccent: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PALETTE TABLE — style × category → {color, material}. Design of record.
// ─────────────────────────────────────────────────────────────────────────────
const PALETTE_TABLE: Readonly<Record<CanonicalStyle, StylePalette>> = {
    // NORDIC — pale ash/birch/light-oak wood, white + soft cool greys, light
    // linen/wool upholstery, matte finishes, light wood floor.
    nordic: {
        upholstery: { color: '#D9D6CE', material: 'fabric' }, // soft linen grey-white
        wood:       { color: '#E2D6BE', material: 'wood'   }, // pale ash / birch
        table:      { color: '#D8C9A8', material: 'wood'   }, // light oak
        metal:      { color: '#9FA4A8', material: 'metal'  }, // brushed matte steel
        soft:       { color: '#C7CCC9', material: 'fabric' }, // cool wool grey
        neutral:    { color: '#ECEAE4', material: 'metal'  }, // white-grey
        mirror:     { color: '#EEF2F4', material: 'mirror' }, // §63.1 — silver mirror
        floorColor: '#E2D6BE',
        wallAccent: '#F3F1EC', // off-white
    },
    // MEDITERRANEAN — warm terracotta + lime-plaster walls, olive/ochre/sand
    // accents, ceramic/terracotta tile floor, rattan/cane + warm wood, wrought iron.
    mediterranean: {
        upholstery: { color: '#C7A36B', material: 'fabric' }, // sand / ochre linen
        wood:       { color: '#9C6B3C', material: 'wood'   }, // warm honey wood / cane
        table:      { color: '#8A5A33', material: 'wood'   }, // warm walnut-brown
        metal:      { color: '#3B352E', material: 'metal'  }, // wrought iron (dark)
        soft:       { color: '#7A8450', material: 'fabric' }, // olive green textile
        neutral:    { color: '#C97B4A', material: 'wood'   }, // terracotta
        mirror:     { color: '#EEEAE0', material: 'mirror' }, // §63.1 — warm silver mirror
        floorColor: '#C8794D', // terracotta tile
        wallAccent: '#EFE3CE', // lime plaster
    },
    // MINIMALIST — monochrome white/grey/black, lacquer + glass, hidden hardware,
    // polished concrete / large-format pale tile floor, low-contrast.
    minimalist: {
        upholstery: { color: '#C9C9C9', material: 'fabric' }, // mid grey
        wood:       { color: '#E8E8E8', material: 'wood'   }, // white lacquer
        table:      { color: '#DADADA', material: 'glass'  }, // glass / pale lacquer
        metal:      { color: '#4A4A4A', material: 'metal'  }, // matte black accent
        soft:       { color: '#B5B5B5', material: 'fabric' }, // low-contrast grey
        neutral:    { color: '#DFDFDF', material: 'metal'  }, // light grey
        mirror:     { color: '#F0F3F5', material: 'mirror' }, // §63.1 — cool silver mirror
        floorColor: '#DCDCDC', // polished concrete / pale tile
        wallAccent: '#F4F4F4', // near-white
    },
    // CLASSIC — dark walnut/mahogany case-goods, brass/bronze hardware, deep rich
    // upholstery (burgundy/navy/forest), marble + dark herringbone wood floor.
    classic: {
        upholstery: { color: '#6E2230', material: 'fabric' }, // deep burgundy
        wood:       { color: '#5A3A22', material: 'wood'   }, // dark walnut / mahogany
        table:      { color: '#4E3320', material: 'wood'   }, // mahogany
        metal:      { color: '#B08D3C', material: 'metal'  }, // brass / bronze
        soft:       { color: '#1F3A5F', material: 'fabric' }, // deep navy
        neutral:    { color: '#7D6A4A', material: 'wood'   }, // aged brass-brown
        mirror:     { color: '#E8EAEC', material: 'mirror' }, // §63.1 — antiqued silver mirror
        floorColor: '#5A3A22', // dark herringbone wood
        wallAccent: '#E7E0D2', // warm parchment / marble
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Back-compat: legacy A.21.D4 chips → canonical A.21.D19 styles.
//   modern  → minimalist  (cool, contemporary, low-contrast)
//   minimal → minimalist
//   warm    → mediterranean (earthy, terracotta, warm wood)
//   classic → classic       (unchanged — same id, richer palette)
// ─────────────────────────────────────────────────────────────────────────────
const ALIASES: Readonly<Record<string, CanonicalStyle>> = {
    modern: 'minimalist',
    minimal: 'minimalist',
    minimalist: 'minimalist',
    warm: 'mediterranean',
    mediterranean: 'mediterranean',
    classic: 'classic',
    nordic: 'nordic',
    // Friendly synonyms the RAC / free-text might emit.
    scandinavian: 'nordic',
    scandi: 'nordic',
    traditional: 'classic',
    rustic: 'mediterranean',
    cozy: 'mediterranean',
    cosy: 'mediterranean',
    contemporary: 'minimalist',
};

/** The canonical default when the brief value is unknown / absent. */
const DEFAULT_STYLE: CanonicalStyle = 'nordic';

// Category membership — which furniture kind reads which palette slot.
const UPHOLSTERED = new Set<string>([
    'sofa', 'lounge_chair', 'bed', 'dining_chair', 'desk_chair', 'entry_bench',
    'vanity_stool', 'armchair', 'bench', 'ottoman', 'stool',
    // §67.2 / §67.3 (2026-06-11) — the L-shape corner sofa + the integrated bed
    // variants read the upholstery palette (fabric), like the straight sofa/bed.
    'corner_sofa', 'nordic_bed', 'solid_wood_bed',
]);

// §67.1 (2026-06-11) — soft furnishings (rugs). Read the 'soft' palette slot →
// a fabric finish in a soft accent colour, distinct from upholstery.
const SOFT_KINDS = new Set<string>([
    'rug',
]);

const TABLE_KINDS = new Set<string>([
    'dining_table', 'coffee_table', 'console_table', 'desk', 'entrance_table',
    'table', 'vanity_table', 'side_table', 'bedside_table',
]);

const WOOD_KINDS = new Set<string>([
    'bookshelf', 'bookshelf_glass', 'wardrobe', 'dresser', 'sideboard', 'buffet',
    'shoe_cabinet', 'tv_unit', 'pantry_cabinet', 'cabinet', 'shelf', 'shelving',
]);

// §63.1 / bedroom-mirror (2026-06-11) — the mirror kinds. These read the 'mirror'
// palette slot so the editor assigns the reflective MIRROR material instead of
// 'metal' (which rendered the glass dark/black) or 'glass' (transparent).
const MIRROR_KINDS = new Set<string>([
    'wall_mirror', 'bathroom_mirror', 'wc_mirror',
]);

/**
 * Normalise an arbitrary brief value to a CANONICAL style. Accepts the four
 * canonical ids, the legacy A.21.D4 chips, and a few free-text synonyms; anything
 * else → DEFAULT_STYLE ('nordic'). Deterministic.
 */
export function normaliseStyle(s: unknown): CanonicalStyle {
    if (typeof s !== 'string') return DEFAULT_STYLE;
    return ALIASES[s.toLowerCase().trim()] ?? DEFAULT_STYLE;
}

/** Map a furniture `kind` to its finish category. */
function categoryFor(kind: string): FinishCategory {
    if (MIRROR_KINDS.has(kind)) return 'mirror';
    if (SOFT_KINDS.has(kind)) return 'soft';
    if (UPHOLSTERED.has(kind)) return 'upholstery';
    if (TABLE_KINDS.has(kind)) return 'table';
    if (WOOD_KINDS.has(kind)) return 'wood';
    return 'neutral';
}

// ─────────────────────────────────────────────────────────────────────────────
// ST.3 (SPEC-INTERIOR-STYLE-SYSTEM) — furniture finish extended to the SIX
// founder styles. The LEGACY four (nordic/mediterranean/minimalist/classic) and
// EVERY legacy alias (modern/minimal/warm/…) keep resolving through the
// unchanged `normaliseStyle` + PALETTE_TABLE path above → BYTE-IDENTICAL output.
// The THREE NEW styles (farmhouse · japanese · industrial) and their UNIQUE
// synonyms — none of which were previously legacy aliases — resolve from the
// pure StyleRegistry. Additive: no legacy input changes meaning.
// ─────────────────────────────────────────────────────────────────────────────

/** New-style ids + their UNIQUE synonyms (disjoint from the legacy ALIASES keys
 *  so no existing brief value is re-pointed). Maps to the StyleRegistry id. */
const NEW_STYLE_INPUTS: Readonly<Record<string, 'farmhouse' | 'japanese' | 'industrial'>> = {
    farmhouse: 'farmhouse',
    countryside: 'farmhouse',
    country: 'farmhouse',
    japanese: 'japanese',
    japandi: 'japanese',
    zen: 'japanese',
    industrial: 'industrial',
    warehouse: 'industrial',
    loft: 'industrial',
};

/** When `style` names one of the three NEW founder styles, return its
 *  StyleRegistry furniture slots; otherwise null (caller uses the legacy path).
 *  StyleRegistry is a LEAF module (zero imports) so a static import has no cycle. */
function newStyleSlots(
    style: unknown,
    category: FinishCategory,
): { readonly color: string; readonly material: FurnishFinish } | null {
    if (typeof style !== 'string') return null;
    const id = NEW_STYLE_INPUTS[style.toLowerCase().trim()];
    if (!id) return null;
    const slot = STYLE_REGISTRY[id].furniture[category];
    return { color: slot.color, material: slot.material as FurnishFinish };
}

/**
 * Resolve the {color, material} finish for a furniture `kind` under `style`.
 * `style` may be a canonical id, a legacy chip, or any string (normalised).
 * Returns a hex colour + a builder-understood material finish. Deterministic.
 *
 * Return SHAPE is unchanged from A.21.D4 so buildFurnishCommands consumes it
 * untouched.
 */
export function styleFinishFor(
    style: FurnishStyle | string,
    kind: string,
): { readonly color: string; readonly material: FurnishFinish } {
    const category = categoryFor(kind);
    // ST.3 — the three NEW founder styles resolve from the StyleRegistry; every
    // legacy id/alias falls through to the unchanged PALETTE_TABLE path below.
    const ns = newStyleSlots(style, category);
    if (ns) return ns;
    const canonical = normaliseStyle(style);
    const palette = PALETTE_TABLE[canonical];
    const slot = palette[category];
    return { color: slot.color, material: slot.material };
}

/**
 * The floor + wall accent hints for a style (consumed by the SPEC + any future
 * wall-finish pipeline; the canonical FLOOR mapping lives in
 * command-registry floorFinish.ts). Deterministic.
 */
export function styleAccentsFor(
    style: FurnishStyle | string,
): { readonly floorColor: string; readonly wallAccent: string } {
    // ST.3 — new founder styles resolve their accents from the StyleRegistry.
    if (typeof style === 'string') {
        const id = NEW_STYLE_INPUTS[style.toLowerCase().trim()];
        if (id) {
            const d = STYLE_REGISTRY[id];
            return { floorColor: d.floorColor, wallAccent: d.wallAccent };
        }
    }
    const p = PALETTE_TABLE[normaliseStyle(style)];
    return { floorColor: p.floorColor, wallAccent: p.wallAccent };
}

/** The four canonical style ids, for UI / validation. */
export const CANONICAL_STYLES: readonly CanonicalStyle[] = [
    'nordic', 'mediterranean', 'minimalist', 'classic',
];
