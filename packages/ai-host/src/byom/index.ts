// @pryzm/ai-host — BYOM ("Bring Your Own Model") public surface.
//
// ⚠ Do NOT confuse with C22 §1.4 / C08 §8 "BYOK", which is customer-managed
// ENCRYPTION keys. Different subsystem, different threat model, different
// contract. C105 §0.1 records the naming collision and why it was avoided.
//
// Re-exported from the package barrel (`src/index.ts`) so the editor imports
// `@pryzm/ai-host` like every other AI surface and no caller reaches into a
// deep path.

export {
  BYOM_PROVIDERS,
  byomConnectSrcOrigins,
  buildBody,
  buildHeaders,
  buildUrl,
  findProvider,
  parseResponse,
} from './ByomProviders.js';
export type {
  BrowserDirectVerdict,
  ByomAuthKind,
  ByomParsed,
  ByomProvider,
  ByomProviderId,
} from './ByomProviders.js';

export {
  assertNoSecret,
  looksLikeSecret,
  maskCredential,
  redactSecrets,
  ByomSecretLeakError,
} from './ByomRedaction.js';

export {
  assertDescriptorIsSafe,
  ByomVault,
  ByomVaultSet,
  BYOM_ACTIVE_KEY,
  BYOM_STORAGE_PREFIX,
} from './ByomVault.js';
export type {
  ByomCredential,
  ByomCredentialDescriptor,
  ByomStorage,
  ByomStorageArea,
} from './ByomVault.js';

export { createByomRelay, describeProviderError, ByomProviderError } from './ByomRelay.js';

export { resolveAiRoute, routeAttributionLine, routeProvenanceFields } from './ByomRoute.js';
export type { AiKeyClass, AiRoute, AiRouteReason } from './ByomRoute.js';
