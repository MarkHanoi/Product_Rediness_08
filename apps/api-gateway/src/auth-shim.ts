/**
 * @pryzm/api-gateway — default test auth shim.
 *
 * Production replaces this with a real OAuth2 resource-server adapter
 * (introspect bearer + map to subject + scopes + tier).  In tests we
 * trust three header inputs:
 *
 *   X-Test-Subject  — the subject id (user id / API-key id)
 *   X-Test-Scopes   — space-delimited scopes (RFC 6749 §3.3)
 *   X-Test-Roles    — space-delimited admin roles (`admin`, `owner`)
 *
 * Mirrors the marketplace-api pattern verbatim so the two packages
 * stay symmetric for testing.  See ADR-0041 §D for the production
 * wiring contract.
 */

import type { Request, Response, NextFunction } from 'express';
import { ALL_API_SCOPES } from '@pryzm/api-rbac';

export interface GatewayAuthContext {
  readonly subject: string;
  readonly scopes: readonly string[];
  readonly roles: readonly string[];
  readonly tier: 'free' | 'paid';
}

export interface GatewayAuthedRequest {
  auth?: GatewayAuthContext;
}

export const ADMIN_ROLES = ['admin', 'owner'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(s: string): s is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(s);
}

/** Default test shim — production wires a real OAuth2 resource server. */
export function defaultTestAuthShim(req: Request, _res: Response, next: NextFunction): void {
  const subject = (req.header('x-test-subject') ?? req.ip ?? 'anonymous').trim() || 'anonymous';
  const scopesHeader = (req.header('x-test-scopes') ?? '').trim();
  const rolesHeader = (req.header('x-test-roles') ?? '').trim();
  const tierHeader = (req.header('x-test-tier') ?? 'free').trim();
  const tier: 'free' | 'paid' = tierHeader === 'paid' ? 'paid' : 'free';

  const knownScopes = new Set<string>(ALL_API_SCOPES as readonly string[]);
  const scopes = scopesHeader
    .split(/\s+/)
    .filter((s) => s.length > 0 && knownScopes.has(s));

  const roles = rolesHeader
    .split(/\s+/)
    .filter((s) => s.length > 0);

  (req as Request & GatewayAuthedRequest).auth = Object.freeze({
    subject,
    scopes: Object.freeze(scopes),
    roles: Object.freeze(roles),
    tier,
  });
  next();
}

/** Express middleware: 403 unless the request carries an admin role. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as Request & GatewayAuthedRequest).auth;
  const roles = auth?.roles ?? [];
  if (roles.some((r) => isAdminRole(r))) {
    next();
    return;
  }
  res.status(403).json({
    error: 'admin_required',
    error_description: 'route requires an admin role (admin|owner)',
    granted_roles: roles,
  });
}
