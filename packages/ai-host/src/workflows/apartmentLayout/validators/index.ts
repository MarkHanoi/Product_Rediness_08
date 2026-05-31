// Root barrel for the apartment-layout validators tree.
//
// Re-exports the orchestrator + its types, plus convenience re-exports of the
// per-discipline barrels so a downstream caller can pull every public symbol
// from this one path:
//
//   import {
//       validateApartmentLayout,
//       passesLegality,
//       validateAreaMax,             // (still exported from ./dimensional/)
//       validateMandatoryAdjacency,  // (still exported from ./topology/)
//   } from '@pryzm/ai-host/.../validators';
//
// The per-discipline barrels (`./dimensional/index.ts`, `./topology/index.ts`)
// remain the canonical surface for callers that only want one slice.

// ── Orchestrator (aggregates all 11 validators) ─────────────────────────────
export {
    validateApartmentLayout,
    passesLegality,
    summarise,
} from './orchestrator.js';
export type {
    ApartmentLayoutRoom,
    ApartmentLayoutForValidation,
    AggregatedViolationReport,
} from './orchestrator-types.js';

// ── Convenience re-exports from the per-discipline barrels ──────────────────
export * from './dimensional/index.js';
export * from './topology/index.js';

// ── Layout adapter (D-TGL DTO → ApartmentLayoutForValidation) ───────────────
export { toValidationInput } from './layout-adapter.js';
export type {
    DtglLayoutDto,
    DtglLayoutRoom,
    DtglLayoutEdge,
    AdapterOptions,
} from './layout-adapter.js';
