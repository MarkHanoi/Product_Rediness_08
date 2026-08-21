// @pryzm/procedural-textures — parquet and tile PATTERNS generated in code.
//
// ⭐ ZERO downloaded assets. Everything this package produces is arithmetic, which is
// why it is not blocked on C100 §10.6's unsolved asset-hosting dependency the way
// §10.7 S28 is. See `generate.ts` for the (a)/(b)/(c) architecture decision and the
// reason it is (a).
//
// LAYER L0 — no THREE, no DOM, no I/O, no dependencies. It takes numbers and returns
// `Uint8ClampedArray`s. Turning those into a GPU texture is the renderer's job and
// happens above; that is what keeps this testable in node and reusable at build time.

export type { Piece, PatternLayout, HalfPlane } from './core/Piece.js';
export {
  polygonArea,
  halfPlanes,
  rectPiece,
  mitredPiece,
  hexPiece,
  polyPiece,
  rotatePiece,
} from './core/Piece.js';
export { clipConvex, clipPiece, insetPolygon, regionPlanes } from './core/clip.js';
export { hash32, hash2, hash3, rand01, randSigned, valueNoise2D, fbm2D } from './core/rng.js';

export type { PieceField, RasterOptions } from './raster/PieceField.js';
export { rasterizeLayout } from './raster/PieceField.js';

export type { RunningBondParams } from './layouts/runningBond.js';
export { runningBondLayout, rowPeriod } from './layouts/runningBond.js';
export type { HerringboneParams } from './layouts/herringbone.js';
export { herringboneLayout } from './layouts/herringbone.js';
export type { ChevronParams } from './layouts/chevron.js';
export { chevronLayout } from './layouts/chevron.js';
export type { BasketWeaveParams } from './layouts/basketWeave.js';
export { basketWeaveLayout } from './layouts/basketWeave.js';
export type { HexagonParams } from './layouts/hexagon.js';
export { hexagonLayout } from './layouts/hexagon.js';
export type { VersaillesParams } from './layouts/versailles.js';
export { versaillesLayout } from './layouts/versailles.js';

export type { SurfaceProfile } from './shading/SurfaceProfile.js';
export {
  parseHex,
  OAK,
  WALNUT,
  ASH,
  SMOKED_OAK,
  PORCELAIN_WHITE,
  TERRACOTTA,
  MARBLE_WHITE,
  SLATE_DARK,
  CEMENT_GREY,
} from './shading/SurfaceProfile.js';
export type { TextureMap, ShadedMaps } from './shading/shade.js';
export { shadeField } from './shading/shade.js';

export type { PatternSpec, ProceduralTextureSpec, GeneratedTextureSet } from './generate.js';
export {
  buildLayout,
  rasterizeSpec,
  generateProceduralTexture,
  proceduralRealWorldSizeM,
} from './generate.js';

export {
  PROCEDURAL_ID_PREFIX,
  PROCEDURAL_TEXTURE_SPECS,
  isProceduralId,
  findProceduralSpec,
} from './presets.js';

export type { ProceduralDescriptor } from './resolve.js';
export {
  describeProceduralGenerator,
  proceduralTilingFor,
  listProceduralGenerators,
  getProceduralTexture,
  clearProceduralCache,
} from './resolve.js';
