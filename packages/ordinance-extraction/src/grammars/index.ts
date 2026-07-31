// @pryzm/ordinance-extraction — per-jurisdiction grammar adapters barrel.
//
// A grammar is the ONLY per-country surface of the text-parse path: field
// matchers (patterns + field map + interpretation), reject patterns, a number
// locale, and an optional § finder. The shared core consumes any of these.
//   - German (`GERMAN_GRAMMAR`) — the first, proven on the Berlin corpus.
export * from './german.js';
