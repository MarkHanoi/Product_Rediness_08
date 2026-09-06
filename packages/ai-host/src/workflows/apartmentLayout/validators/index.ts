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

// ── NOT MEASURED (§L-909(b)) — a rule that cannot compute its precondition ──
export { notMeasuredNote } from './not-measured.js';
export type { NotMeasuredField, NotMeasuredNote } from './not-measured.js';

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

// ── §R4-R5-PROJECTION — SHIPPED LayoutOption → the two validator DTOs ───────
// The hop `layout-adapter.ts` deferred as "a future slice". Without it the 16
// validators above were reachable only from their own tests.
export {
    projectLayoutOption,
    planDimensionsOf,
    FRAMEWORK_TYPE_OF,
    TOPOLOGY_CLASS_GRAPH,
    RECT_FILL_FLOOR,
} from './layoutOptionAdapter.js';
export type {
    LayoutOptionProjection,
    PlanDimensionQuality,
} from './layoutOptionAdapter.js';

// ── Combined one-call surface (adapter + orchestrator + formatter) ──────────
export { validateAndFormatLayout } from './validate-and-format.js';
export type {
    ValidateAndFormatOptions,
    ValidateAndFormatResult,
} from './validate-and-format.js';
