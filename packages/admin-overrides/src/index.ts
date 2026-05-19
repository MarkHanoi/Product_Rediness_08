/**
 * @pryzm/admin-overrides — public barrel.
 *
 * S65 work-item 8 per phase-doc-2 §S65.  Backend for the ADR-028 Part E
 * Enterprise Admin override surface served by `apps/api-gateway` at
 * `GET/PUT/DELETE /v1/admin/overrides`.
 */

export {
  PLANS,
  ROLES,
  SUBJECT_KINDS,
  OverrideRecordSchema,
  overrideKey,
  type Plan,
  type Role,
  type SubjectKind,
  type OverrideRecord,
} from './types.js';

export {
  type OverrideStore,
  InMemoryOverrideStore,
  type InMemoryOverrideStoreOptions,
  InvalidOverrideError,
} from './store.js';

export {
  resolveEffective,
  type ResolveInput,
  type ResolvedSubject,
} from './resolution.js';
