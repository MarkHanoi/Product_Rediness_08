// A.21.D4 — Style → furniture finish (the brief's modern/classic/minimal/warm
// chip, previously a no-op, now drives furniture COLOUR + MATERIAL finish).
//
// Pure + deterministic; ZERO imports. The editor's furniture builders read
// `data.color` (hex) + `data.material` ('fabric'|'wood'|'metal'|'glass') — see
// geometry-furniture builders (e.g. WhiteSofaBuilder) — so a coherent per-style,
// per-category palette here makes the style chip visibly change the result.
//
// Mapping doctrine: upholstered pieces take the style's UPHOLSTERY colour as
// 'fabric'; case-goods / tables take the WOOD tone as 'wood'; everything else
// takes a NEUTRAL tone. Coarse-but-coherent — a full per-kind material system is
// a later refinement.

/** The brief style chips. Unknown / absent falls back to 'modern'. */
export type FurnishStyle = 'modern' | 'classic' | 'minimal' | 'warm';

/** Material finishes the geometry-furniture builders understand. */
export type FurnishFinish = 'fabric' | 'wood' | 'metal';

interface StylePalette {
    readonly upholstery: string; // sofas, chairs, beds, benches
    readonly wood: string;       // tables, cabinets, shelves, wardrobes
    readonly neutral: string;    // appliances, fixtures, misc
    readonly neutralFinish: FurnishFinish;
}

const STYLE_PALETTES: Readonly<Record<FurnishStyle, StylePalette>> = {
    // Cool greys + charcoal — contemporary.
    modern:  { upholstery: '#9aa0a6', wood: '#3c3c40', neutral: '#b0b3b8', neutralFinish: 'metal' },
    // Warm browns + cream — traditional.
    classic: { upholstery: '#7d5a4f', wood: '#6b4a2f', neutral: '#8a7a5c', neutralFinish: 'wood' },
    // Off-white + pale oak — pared-back.
    minimal: { upholstery: '#e8e2d5', wood: '#cfc6b8', neutral: '#dcdcdc', neutralFinish: 'metal' },
    // Terracotta + walnut — earthy/warm.
    warm:    { upholstery: '#c97b4a', wood: '#8a5a33', neutral: '#a8825c', neutralFinish: 'wood' },
};

const UPHOLSTERED = new Set<string>([
    'sofa', 'lounge_chair', 'bed', 'dining_chair', 'desk_chair', 'entry_bench', 'vanity_stool',
]);

const WOOD_KINDS = new Set<string>([
    'dining_table', 'coffee_table', 'bookshelf', 'bookshelf_glass', 'wardrobe', 'dresser',
    'sideboard', 'buffet', 'console_table', 'shoe_cabinet', 'tv_unit', 'pantry_cabinet',
    'bedside_table', 'desk', 'entrance_table', 'table', 'vanity_table',
]);

/** Normalise an arbitrary brief value to a known style (default 'modern'). */
export function normaliseStyle(s: unknown): FurnishStyle {
    return s === 'classic' || s === 'minimal' || s === 'warm' ? s : 'modern';
}

/**
 * Resolve the {color, material} finish for a furniture `kind` under `style`.
 * Returns hex colour + a builder-understood material finish. Deterministic.
 */
export function styleFinishFor(
    style: FurnishStyle,
    kind: string,
): { readonly color: string; readonly material: FurnishFinish } {
    const p = STYLE_PALETTES[style] ?? STYLE_PALETTES.modern;
    if (UPHOLSTERED.has(kind)) return { color: p.upholstery, material: 'fabric' };
    if (WOOD_KINDS.has(kind)) return { color: p.wood, material: 'wood' };
    return { color: p.neutral, material: p.neutralFinish };
}
