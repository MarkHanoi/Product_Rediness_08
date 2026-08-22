// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — public surface (lane JURIS11, L-4400..L-4460).
//
// A minimum habitable area is a LEGAL statement. Everything exported here carries the
// instrument behind its number, or says in the same breath that nothing does.
//
// Read first: SPEC-HABITABILITY-MINIMA.md · ADR-0352 · C83 §11 · C20 §7.
//
// ⚠ NO BARREL ACCESS AT MODULE LOAD from a consumer that this barrel can reach back
// into. `standards.ts` reads `ROOM_RULES` from `../programRules.js` at module scope to
// derive the named fallback, so the edge is habitability → programRules and MUST STAY
// ONE-WAY. `programRules.ts` must never import from here (a circular barrel resolves
// to `undefined` at load and produces the white screen this repo has already paid for).

export type {
    HabitabilityBinding,
    HabitabilityBindingness,
    HabitabilityConfidence,
    HabitabilityCoverageForm,
    HabitabilityCoverageRow,
    HabitabilityExtent,
    HabitabilityMatchTier,
    HabitabilityStandard,
    ResolvedRoomMinimum,
    RoomMinimum,
    RoomMinimumProvenance,
} from './types.js';
export { HABITABILITY_EXTENTS } from './types.js';

export {
    ES_CATALUNYA_DECRET_141_2012,
    ES_MALAGA_PGOU_2018,
    GB_ENG_NDSS_2015,
    HABITABILITY_STANDARDS,
    PRYZM_BASELINE,
} from './standards.js';

export { HABITABILITY_COVERAGE, coverageFor, structuredCountryCount } from './coverage.js';

export {
    authorityLabel,
    habitabilityChain,
    provenanceSentence,
    resolveRoomMinimum,
    roomMinima,
} from './resolve.js';
