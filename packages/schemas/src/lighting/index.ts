// §FEAT-LOD200-LUMINAIRES (L-1330) / §FIX-LIGHTING-VOCABULARY (L-1331)
//
// The LOD-200 luminaire matrix, at L0 so `elements/Lighting.ts` can DERIVE its
// accepted fixture vocabulary from it instead of transcribing one. See the file
// header for why that move closes C96 §9.1 / EI-3 rather than merely relocating code.
export * from './Lod200FixtureCatalogue.js';
export * from './fixtureVocabulary.js';
