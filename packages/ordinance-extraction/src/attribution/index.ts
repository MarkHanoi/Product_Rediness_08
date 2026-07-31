// @pryzm/ordinance-extraction — the LEGAL ATTRIBUTION LAYER, public surface.
//
// Decides WHICH correctly-read value binds. See `types.ts` for why that is a
// different problem from reading the value, and `standards/LEGAL-ATTRIBUTION-MODEL.md`
// for the full design, the per-jurisdiction tables, and the honest limits.
//
// ⚠ DELIBERATELY WIRED TO NOTHING. `toEnvelopeParameters` is unchanged and no
// producer emits `ParameterEvidence` yet: the German grammar emits `ExtractedRule`,
// which has a citation but NO instrument attribution (WP1-WP6 §10 KNOWN-OPEN #1). A
// bridge would stamp `kind: 'unknown'` on every Berlin rule and stage 1 would turn
// every Berlin parameter `unknown` — correct, and useless. This layer is what a real
// Layer-4 section parser will feed. See LEGAL-ATTRIBUTION-MODEL.md §7.1/§8.

export * from './types.js';
export * from './priority.js';
export * from './tables/index.js';
export * from './resolve.js';
