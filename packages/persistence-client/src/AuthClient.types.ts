/**
 * @pryzm/persistence-client/AuthClient.types — types & constants only.
 *
 * Split from `AuthClient.ts` so consumers (e.g. the bench harness, the
 * runtime-composer typed handle) can import the types without pulling
 * the runtime class + DOM dependencies.
 */

/** Subscription tier — string union mirrored from `src/monetization/PlanConfig`.
 *  Kept as a string union here (not an enum imported from src/) to preserve
 *  the L0 layer rule (packages/persistence-client must not import from src/). */
export type Plan = 'free' | 'starter' | 'pro' | 'studio' | 'enterprise';

/** Subscription status — string union mirrored from `src/monetization/PlanConfig`. */
export type PlanStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

/** Canonical user shape returned by /api/auth/* endpoints + carried in
 *  `bim-platform-user` localStorage. Consumers in `src/` may extend this
 *  to a richer `PlatformUser` (e.g. typed `Plan` enum) but must not
 *  narrow the required fields. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: number;
  readonly plan?: Plan;
  readonly planStatus?: PlanStatus;
}

/** Result of a successful sign-in / sign-up. */
export interface AuthResult {
  readonly user: AuthUser;
  readonly token: string;
}

/** Error kinds for `AuthClientError`. Mirrors `ProjectListClientErrorKind`'s
 *  switchable shape so callers can branch on `err.kind` uniformly. */
export type AuthClientErrorKind =
  | 'invalid-request'
  | 'unauthenticated'
  | 'network-error'
  | 'server-error'
  | 'no-window'
  | 'popup-blocked'
  | 'oauth-failed'
  | 'oauth-cancelled';

/** PostMessage payload schema sent by the OAuth callback page back to
 *  the AuthClient popup-opener. The legacy server-side OAuth callback
 *  (under `server/auth/`) posts this shape unchanged. */
export interface PryzmOAuthMessage {
  readonly type: typeof PRYZM_OAUTH_MESSAGE_TYPE;
  readonly payload?: {
    readonly token?: string;
    readonly user?: AuthUser;
    readonly error?: string;
  };
}

/** Canonical localStorage key for the JWT bearer token. Matches
 *  `chunks/02 §3.8` line 223 + the W3 wireup contract. */
export const AUTH_TOKEN_KEY = 'bim-platform-token' as const;

/** Canonical localStorage key for the cached user profile. */
export const AUTH_USER_KEY = 'bim-platform-user' as const;

/** Global CustomEvent name dispatched on sign-out so AuthModal re-shows. */
export const AUTH_SIGNED_OUT_EVENT = 'pryzm:auth:signedOut' as const;

/** Discriminator for the OAuth-callback postMessage payload. */
export const PRYZM_OAUTH_MESSAGE_TYPE = 'pryzm-oauth' as const;
