// §PROCEDURAL-PATTERNS (L-1801/L-1802) — THE NAMED GENERATORS.
//
// ⭐ EVERY DIMENSION HERE IS A REAL COMMERCIAL PRODUCT DIMENSION IN MILLIMETRES.
// Not a UV fraction, not a pixel count, not a number that looked right. 70×350
// herringbone blocks, 189 mm engineered boards, 600×600 porcelain, 200 mm hex,
// 200×100 metro — these are what a specifier writes on a drawing, and they are what
// makes the floor come out the size a floor is. A generator parameterised in pixels
// cannot be scaled correctly by any consumer, however careful.
//
// ⛔ NOTHING in this file is transcribed from the reference product. C100 §10's
// evidence document (PASCAL-FINISHES-RESEARCH §0.2) establishes that its 288 texture
// files carry ZERO statements of origin, and binds every downstream slice to
// TAXONOMY-AND-PARAMETERS-ONLY. We take the observation that a building editor needs
// eleven parquets; we author our own dimensions from trade product ranges and our
// own colours. No byte, and no numeric value, comes from there.

import type { ProceduralTextureSpec } from './generate.js';
import {
  ASH,
  CEMENT_GREY,
  MARBLE_WHITE,
  OAK,
  PORCELAIN_WHITE,
  SLATE_DARK,
  SMOKED_OAK,
  TERRACOTTA,
  WALNUT,
} from './shading/SurfaceProfile.js';

/**
 * Prefix marking a map source as GENERATED rather than fetched.
 *
 * ⭐ THIS SPELLING IS NOT FREE — IT IS MAT-1'S RESERVED SCHEME, ADOPTED VERBATIM.
 * `packages/core-app-model/src/materials/MaterialResolver.ts`'s
 * `registerTextureLoader` docstring reserves exactly this shape and says why the
 * branch behind it was left unwritten:
 *
 *   "A PROCEDURAL source (lane MAT-3) is deliberately NOT expressible here. An
 *    extension is a property of a FILE, and a generated texture has no file. The
 *    reserved shape for it is a `procedural:<generator-id>` scheme on the map path
 *    … that branch is UNWRITTEN on purpose: a scheme with no generator behind it
 *    is exactly the authored-but-unwired defect this repo keeps producing."
 *
 * This package is the generators that clause was waiting for. ⚠ An earlier draft
 * of this file spelt it `proc:` — a rival spelling for one concept, which is C100
 * §4's entire census in miniature. Read the resolver, never this comment, if the
 * two ever disagree.
 */
export const PROCEDURAL_ID_PREFIX = 'procedural:';

const spec = (
  family: 'parquet' | 'tile',
  id: string,
  label: string,
  layout: ProceduralTextureSpec['layout'],
  surface: ProceduralTextureSpec['surface'],
  seed: number,
  defaultResolution = 1024,
): ProceduralTextureSpec => ({
  id: PROCEDURAL_ID_PREFIX + id,
  label,
  family,
  layout,
  surface,
  seed,
  defaultResolution,
});

export const PROCEDURAL_TEXTURE_SPECS: readonly ProceduralTextureSpec[] = [
  // ── PARQUET ────────────────────────────────────────────────────────────────
  // 70 × 350 blocks: the standard commercial herringbone block, ratio 5.
  spec('parquet', 'parquet-oak-herringbone', 'Parquet · Oak Herringbone (70 × 350)',
    { pattern: 'herringbone', params: { staveWidthMm: 70, lengthRatio: 5, jointMm: 0.3, staveLengthMm: 350 } },
    OAK, 0x0a11),
  spec('parquet', 'parquet-walnut-herringbone', 'Parquet · Walnut Herringbone (70 × 280)',
    { pattern: 'herringbone', params: { staveWidthMm: 70, lengthRatio: 4, jointMm: 0.3, staveLengthMm: 280 } },
    WALNUT, 0x0a12),
  spec('parquet', 'parquet-smoked-oak-herringbone-wide', 'Parquet · Smoked Oak Herringbone (100 × 500)',
    { pattern: 'herringbone', params: { staveWidthMm: 100, lengthRatio: 5, jointMm: 0.4, staveLengthMm: 500 } },
    SMOKED_OAK, 0x0a13),
  // Chevron and Hungarian point are ONE joinery at two mitre angles — see chevron.ts.
  spec('parquet', 'parquet-oak-chevron-45', 'Parquet · Oak Chevron 45° (90 × 600)',
    { pattern: 'chevron', params: { staveWidthMm: 90, staveLengthMm: 600, angleDeg: 45, jointMm: 0.3, repeatX: 1, repeatY: 3 } },
    OAK, 0x0a14),
  spec('parquet', 'parquet-oak-hungarian-point-60', 'Parquet · Oak Hungarian Point 60° (90 × 600)',
    { pattern: 'chevron', params: { staveWidthMm: 90, staveLengthMm: 600, angleDeg: 60, jointMm: 0.3, repeatX: 1, repeatY: 3 } },
    OAK, 0x0a15),
  spec('parquet', 'parquet-walnut-chevron-45', 'Parquet · Walnut Chevron 45° (70 × 490)',
    { pattern: 'chevron', params: { staveWidthMm: 70, staveLengthMm: 490, angleDeg: 45, jointMm: 0.3, repeatX: 1, repeatY: 4 } },
    WALNUT, 0x0a16),
  spec('parquet', 'parquet-oak-basket-weave', 'Parquet · Oak Basket Weave (3 × 70)',
    { pattern: 'basket-weave', params: { staveWidthMm: 70, staveCount: 3, jointMm: 0.3, staveLengthMm: 210 } },
    OAK, 0x0a17),
  spec('parquet', 'parquet-ash-basket-weave-double', 'Parquet · Ash Basket Weave (2 × 90)',
    { pattern: 'basket-weave', params: { staveWidthMm: 90, staveCount: 2, jointMm: 0.3, staveLengthMm: 180 } },
    ASH, 0x0a18),
  spec('parquet', 'parquet-oak-versailles', 'Parquet · Oak Versailles Panel (900 mm)',
    { pattern: 'versailles', params: { panelSizeMm: 900, frameWidthMm: 80, staveWidthMm: 60, lengthRatio: 4, jointMm: 0.6 } },
    OAK, 0x0a19, 1536),
  // Engineered board floors. 189 mm and 220 mm are the common wide-plank widths.
  spec('parquet', 'floor-oak-plank-wide', 'Timber Floor · Oak Plank 189 × 1860 (1/3 bond)',
    { pattern: 'running-bond', params: { lengthMm: 1860, widthMm: 189, jointMm: 0.6, offsetNum: 1, offsetDen: 3, repeatX: 1, repeatY: 2 } },
    OAK, 0x0a1a),
  spec('parquet', 'floor-ash-plank-narrow', 'Timber Floor · Ash Board 120 × 1200 (1/2 bond)',
    { pattern: 'running-bond', params: { lengthMm: 1200, widthMm: 120, jointMm: 0.6, offsetNum: 1, offsetDen: 2, repeatX: 1, repeatY: 3 } },
    ASH, 0x0a1b),
  spec('parquet', 'floor-smoked-oak-plank', 'Timber Floor · Smoked Oak Plank 220 × 2200 (1/4 bond)',
    { pattern: 'running-bond', params: { lengthMm: 2200, widthMm: 220, jointMm: 0.6, offsetNum: 1, offsetDen: 4, repeatX: 1, repeatY: 2 } },
    SMOKED_OAK, 0x0a1c),

  // ── TILE ───────────────────────────────────────────────────────────────────
  spec('tile', 'tile-porcelain-600-stack', 'Tile · Porcelain 600 × 600, stack bond, 3 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 603, widthMm: 603, jointMm: 3, offsetNum: 0, offsetDen: 1, repeatX: 2, repeatY: 2 } },
    PORCELAIN_WHITE, 0x0b11),
  spec('tile', 'tile-marble-600-stack', 'Tile · Marble 600 × 600, stack bond, 2 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 602, widthMm: 602, jointMm: 2, offsetNum: 0, offsetDen: 1, repeatX: 2, repeatY: 2 } },
    MARBLE_WHITE, 0x0b12),
  spec('tile', 'tile-slate-300-offset', 'Tile · Slate 600 × 300, half bond, 4 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 604, widthMm: 304, jointMm: 4, offsetNum: 1, offsetDen: 2, repeatX: 2, repeatY: 1 } },
    SLATE_DARK, 0x0b13),
  spec('tile', 'tile-metro-white-subway', 'Tile · Metro 200 × 100 white, half bond, 3 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 203, widthMm: 103, jointMm: 3, offsetNum: 1, offsetDen: 2, repeatX: 2, repeatY: 2 } },
    PORCELAIN_WHITE, 0x0b14),
  spec('tile', 'tile-metro-white-third', 'Tile · Metro 200 × 100 white, third bond, 3 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 203, widthMm: 103, jointMm: 3, offsetNum: 1, offsetDen: 3, repeatX: 1, repeatY: 2 } },
    PORCELAIN_WHITE, 0x0b15),
  // ⭐ Herringbone in ceramic costs NOTHING, because layout and profile are separate.
  spec('tile', 'tile-metro-herringbone', 'Tile · Metro 103 × 309 herringbone, 3 mm grout',
    { pattern: 'herringbone', params: { staveWidthMm: 103, lengthRatio: 3, jointMm: 3 } },
    PORCELAIN_WHITE, 0x0b16),
  spec('tile', 'tile-terracotta-basket-weave', 'Tile · Terracotta basket weave (2 × 150), 5 mm grout',
    { pattern: 'basket-weave', params: { staveWidthMm: 155, staveCount: 2, jointMm: 5 } },
    TERRACOTTA, 0x0b17),
  spec('tile', 'tile-hexagon-200-white', 'Tile · Hexagon 200 mm white, 3 mm grout',
    { pattern: 'hexagon', params: { acrossFlatsMm: 203, groutMm: 3, repeatX: 2, repeatY: 1 } },
    PORCELAIN_WHITE, 0x0b18),
  spec('tile', 'tile-hexagon-100-cement', 'Tile · Hexagon 100 mm cement grey, 2 mm grout',
    { pattern: 'hexagon', params: { acrossFlatsMm: 102, groutMm: 2, repeatX: 3, repeatY: 2 } },
    CEMENT_GREY, 0x0b19),
  spec('tile', 'tile-terracotta-300-stack', 'Tile · Terracotta 300 × 300, stack bond, 6 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 306, widthMm: 306, jointMm: 6, offsetNum: 0, offsetDen: 1, repeatX: 3, repeatY: 3 } },
    TERRACOTTA, 0x0b1a),
  spec('tile', 'tile-cement-200-stack', 'Tile · Cement 200 × 200, stack bond, 2 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 202, widthMm: 202, jointMm: 2, offsetNum: 0, offsetDen: 1, repeatX: 4, repeatY: 4 } },
    CEMENT_GREY, 0x0b1b),
  spec('tile', 'tile-mosaic-50-white', 'Tile · Mosaic 50 × 50 white, 2 mm grout',
    { pattern: 'running-bond', params: { lengthMm: 52, widthMm: 52, jointMm: 2, offsetNum: 0, offsetDen: 1, repeatX: 8, repeatY: 8 } },
    PORCELAIN_WHITE, 0x0b1c),
];

const BY_ID = new Map(PROCEDURAL_TEXTURE_SPECS.map((s) => [s.id, s] as const));

/** Is this map source a GENERATOR id rather than a path? The resolver's fork. */
export function isProceduralId(id: string): boolean {
  return BY_ID.has(id);
}

export function findProceduralSpec(id: string): ProceduralTextureSpec | undefined {
  return BY_ID.get(id);
}
