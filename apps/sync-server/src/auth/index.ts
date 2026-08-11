// apps/sync-server/src/auth/index.ts — barrel (L-391 R-B).

export {
  REFUSAL_HEADER,
  WS_AUTH_REFUSAL_STATUS,
  refuseUpgrade,
  type RefusableSocket,
  type WsAuthRefusalReason,
} from './refusals.js';
export {
  CLOCK_SKEW_SECONDS,
  verifySessionToken,
  type SessionClaims,
  type VerifyResult,
} from './verifySessionToken.js';
export {
  createWsAuthGate,
  extractToken,
  projectIdFromRoom,
  type CreateWsAuthGateOptions,
  type CreateWsAuthGateResult,
  type WsAuthGate,
  type WsAuthMode,
  type WsAuthPrincipal,
  type WsAuthRequestLike,
  type WsAuthResult,
} from './WsAuthGate.js';
export {
  signSessionToken,
  signTokenWithoutExp,
  type SignSessionTokenOptions,
} from './signSessionToken.js';
