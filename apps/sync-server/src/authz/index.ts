// apps/sync-server/authz/index.ts — barrel (W-03 / ADR-0040).

export type { Authz, AuthzAction, AuthzActor, AuthzContext } from './Authz.js';
export { ANONYMOUS_USER_ID } from './Authz.js';
export { MemoryAuthz, type AuthzDecision, type MemoryAuthzOptions } from './MemoryAuthz.js';
export { createAuthz, type AuthzMode, type CreateAuthzOptions, type CreateAuthzResult } from './policies.js';
