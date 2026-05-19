/**
 * @pryzm/ai-spend — public barrel.
 *
 * S65 work-item 7 per phase-doc-2 §S65.  Backend for the SPEC-28 §9
 * Workspace Admin AI Spend view served by `apps/api-gateway` at
 * `GET /v1/admin/ai-spend`.
 */

export {
  AiSpendEntrySchema,
  AI_SURFACES,
  ACTOR_KINDS,
  type AiSpendEntry,
  type AiSpendAggregateRow,
  type AiSpendQueryRange,
  type AiSpendTotals,
  type AiSurface,
  type ActorKind,
} from './types.js';

export {
  type AiSpendStore,
  InMemoryAiSpendStore,
  type InMemoryAiSpendStoreOptions,
  DuplicateSpendEntryError,
  InvalidSpendEntryError,
} from './store.js';

export {
  aggregateByWorkspace,
  aggregateByProject,
  aggregateByActor,
  aggregateBySurface,
  aggregateByDay,
  aggregateByModel,
  aggregateByWorkflow,
  computeTotals,
  utcDayKey,
} from './aggregations.js';
