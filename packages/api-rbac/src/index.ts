/**
 * `@pryzm/api-rbac` — OAuth2 scope catalogue + scope-check primitives
 * for the PRYZM Public API.
 *
 * Source authority:
 *   - SPEC-26 §8 (public REST surface for .pryzm import/export)
 *   - packages/api-spec/openapi.yaml (canonical OAuth2 scope declarations)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S63 D3
 *   - ADR-0039 §A (S63 D2-D3 follow-on)
 *
 * Why a separate package: the scope catalogue is consumed by THREE
 * distinct surfaces — the public REST API server (express middleware),
 * the OAuth2 token endpoint (issuer-side scope validation), and the
 * documentation site's auto-generated scope tables.  Centralising the
 * catalogue here avoids drift between those three surfaces.
 *
 * IMPORTANT — namespace separation: `ai:invoke` here is the OAUTH2
 * SCOPE for the public REST API. The plugin SDK has NO `ai:invoke`
 * permission; plugin AI invocation is gated by the plugin permission
 * `write:project` (per ADR-0038 §A — the plugin permission set is
 * locked at 7).  The two namespaces share a string but are unrelated.
 */

// ──────────────────────────────────────────────────────────────────────
//  Scope catalogue (single source of truth)
// ──────────────────────────────────────────────────────────────────────

/**
 * The canonical OAuth2 scopes the PRYZM Public API understands.
 * Mirrored verbatim in `packages/api-spec/openapi.yaml` under
 * `components.securitySchemes.oauth2.flows.authorizationCode.scopes`.
 *
 * To add a scope: add it here, add it to the YAML, bump the YAML's
 * pinned SHA-256, and amend ADR-0039.
 */
export const ALL_API_SCOPES = ['project:read', 'project:write', 'ai:invoke'] as const;

export type ApiScope = (typeof ALL_API_SCOPES)[number];

/** Human-readable scope descriptions (mirrors openapi.yaml verbatim). */
export const API_SCOPE_DESCRIPTIONS: Readonly<Record<ApiScope, string>> = Object.freeze({
  'project:read': 'Read project state',
  'project:write': 'Create/update projects',
  'ai:invoke': 'Invoke AI workflows',
});

/** Type guard — is `s` a known API scope? */
export function isApiScope(s: unknown): s is ApiScope {
  return typeof s === 'string' && (ALL_API_SCOPES as readonly string[]).includes(s);
}

// ──────────────────────────────────────────────────────────────────────
//  Scope-string parsing (RFC 6749 §3.3)
// ──────────────────────────────────────────────────────────────────────

/**
 * Parse a scope string from a token response or `Authorization` header.
 * RFC 6749 §3.3 says scopes are space-delimited.  Unknown scopes are
 * dropped silently — they may be present from a different issuer or a
 * future-version token.
 */
export function parseScopeString(scope: string | null | undefined): readonly ApiScope[] {
  if (!scope || typeof scope !== 'string') return [];
  const out: ApiScope[] = [];
  const seen = new Set<string>();
  for (const part of scope.split(/\s+/)) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    if (isApiScope(part)) out.push(part);
  }
  return out;
}

/** Inverse of `parseScopeString`. */
export function formatScopeString(scopes: readonly ApiScope[]): string {
  // De-dupe + sort for stable output (helpful for token logs and tests).
  const unique = Array.from(new Set(scopes)).sort();
  return unique.join(' ');
}

// ──────────────────────────────────────────────────────────────────────
//  Scope-check primitives (used by middleware)
// ──────────────────────────────────────────────────────────────────────

/** True iff `granted` covers EVERY scope in `required`. */
export function hasAllScopes(
  granted: readonly ApiScope[],
  required: readonly ApiScope[],
): boolean {
  if (required.length === 0) return true;
  const set = new Set<ApiScope>(granted);
  for (const r of required) if (!set.has(r)) return false;
  return true;
}

/** True iff `granted` covers AT LEAST ONE scope in `required`. */
export function hasAnyScope(
  granted: readonly ApiScope[],
  required: readonly ApiScope[],
): boolean {
  if (required.length === 0) return true;
  const set = new Set<ApiScope>(granted);
  for (const r of required) if (set.has(r)) return true;
  return false;
}

/** Returns the missing-scope list (empty when `granted` covers all of `required`). */
export function missingScopes(
  granted: readonly ApiScope[],
  required: readonly ApiScope[],
): readonly ApiScope[] {
  const set = new Set<ApiScope>(granted);
  return required.filter((r) => !set.has(r));
}

// ──────────────────────────────────────────────────────────────────────
//  ScopeCheckError + assertScopes (throwing variant)
// ──────────────────────────────────────────────────────────────────────

/**
 * Thrown by `assertScopes` when the granted token is missing one or
 * more required scopes.  Carries `requiredScopes` + `grantedScopes` +
 * `missingScopes` so HTTP middleware can render an RFC 6750 §3.1 error
 * (`error="insufficient_scope"`) without re-computing.
 */
export class ScopeCheckError extends Error {
  public readonly name = 'ScopeCheckError';
  public readonly requiredScopes: readonly ApiScope[];
  public readonly grantedScopes: readonly ApiScope[];
  public readonly missingScopes: readonly ApiScope[];
  /** HTTP status to map to (RFC 6750 §3.1 → 403). */
  public readonly httpStatus = 403;
  /** Suggested `WWW-Authenticate` header value per RFC 6750 §3.1. */
  public readonly wwwAuthenticate: string;

  constructor(opts: {
    required: readonly ApiScope[];
    granted: readonly ApiScope[];
  }) {
    const missing = missingScopes(opts.granted, opts.required);
    super(
      `insufficient scope — required=[${opts.required.join(' ')}] ` +
      `granted=[${opts.granted.join(' ')}] missing=[${missing.join(' ')}]`,
    );
    this.requiredScopes = opts.required;
    this.grantedScopes = opts.granted;
    this.missingScopes = missing;
    this.wwwAuthenticate =
      `Bearer error="insufficient_scope", scope="${opts.required.join(' ')}"`;
  }
}

/** Throw `ScopeCheckError` if `granted` does NOT cover every scope in `required`. */
export function assertScopes(
  granted: readonly ApiScope[],
  required: readonly ApiScope[],
): void {
  if (!hasAllScopes(granted, required)) {
    throw new ScopeCheckError({ granted, required });
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Express-style middleware factory
// ──────────────────────────────────────────────────────────────────────

/**
 * The narrow shape this middleware reads from `req`. Frameworks that
 * extract the bearer token + introspect it earlier in the chain are
 * expected to set `req.auth.scopes` to the granted-scope array.
 */
export interface AuthenticatedRequest {
  readonly auth?: {
    readonly scopes?: readonly string[];
  };
}

/** The narrow shape this middleware writes on the response. */
export interface ResponseLike {
  status(code: number): this;
  setHeader(name: string, value: string): this | unknown;
  json(body: unknown): unknown;
}

/** Express-style next handler. */
export type NextLike = (err?: unknown) => void;

/**
 * Express-compatible middleware factory.  Usage:
 *
 *   app.get('/v1/projects/:id/export.pryzm', requireScopes(['project:read']), handler);
 *
 * The middleware reads `req.auth.scopes` (set by upstream auth
 * middleware), filters to known `ApiScope`s, and either calls `next()`
 * or responds 403 + `WWW-Authenticate: Bearer error="insufficient_scope"`.
 *
 * Implementation note: this package does NOT introspect bearer tokens.
 * Token validation belongs upstream (the OAuth resource-server adapter).
 * Co-locating the two concerns would couple the scope catalogue to the
 * token format and prevent reuse from the OAuth issuer side.
 */
export function requireScopes(
  required: readonly ApiScope[],
): (req: AuthenticatedRequest, res: ResponseLike, next: NextLike) => void {
  // Snapshot the array so caller mutations don't change behaviour.
  const requiredCopy: readonly ApiScope[] = Object.freeze([...required]);

  return function requireScopesMiddleware(req, res, next) {
    const granted = parseGrantedFromReq(req);
    if (hasAllScopes(granted, requiredCopy)) {
      next();
      return;
    }
    const err = new ScopeCheckError({ required: requiredCopy, granted });
    res.setHeader('WWW-Authenticate', err.wwwAuthenticate);
    res.status(err.httpStatus).json({
      error: 'insufficient_scope',
      error_description: err.message,
      required: err.requiredScopes,
      granted: err.grantedScopes,
      missing: err.missingScopes,
    });
  };
}

function parseGrantedFromReq(req: AuthenticatedRequest): readonly ApiScope[] {
  const raw = req.auth?.scopes;
  if (!Array.isArray(raw)) return [];
  const out: ApiScope[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (typeof s !== 'string' || seen.has(s)) continue;
    seen.add(s);
    if (isApiScope(s)) out.push(s);
  }
  return out;
}
