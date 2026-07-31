// @pryzm/ordinance-extraction — per-jurisdiction grammar adapters barrel.
//
// A grammar is the ONLY per-country surface of the text-parse path: field
// matchers (patterns + field map + interpretation), reject patterns, a number
// locale, and an optional § finder. The shared core consumes any of these.
//   - German (`GERMAN_GRAMMAR`) — the first, proven on the Berlin corpus.
//
// A jurisdiction also supplies a legal-regime TABLE (`gates/regimeGate.ts`), which
// decides whether numeric extraction may be attempted at all. It lives here too,
// because it is the same per-country adapter surface — one place per jurisdiction.
export * from './german.js';
export * from './germanRegimes.js';
