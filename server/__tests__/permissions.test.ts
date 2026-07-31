/**
 * @file server/__tests__/permissions.test.ts
 *
 * C08 §2.1 — Server-side permission enforcement unit tests.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §C4, C08 §2.1):
 *   Every write route in server.js MUST enforce access control before reaching
 *   a DB write.  This file verifies the enforcement functions that all route
 *   handlers rely on, proving that anonymous callers are blocked.
 *
 * SCOPE:
 *   1. hasPermission() — ISO 19650 role-permission matrix gate.
 *   2. canUserAccessProject() — project membership verification.
 *   3. _httpCanAccess logic — anonymous users are always denied.
 *
 * EXECUTION:
 *   pnpm vitest run server/__tests__/permissions.test.ts
 *   (uses the root vitest config with happy-dom environment)
 *
 * NOTE: server.js is a monolithic Express app that does not export the app
 * instance, so full HTTP-level integration tests require a separate setup.
 * These unit tests verify the permission-enforcement functions that EVERY
 * write route delegates to — proving the enforcement layer works correctly.
 * Full HTTP-level coverage is part of the Phase 7 E2E suite.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hasPermission, ROLES } from '../permissions.js';
import { canUserAccessProject } from '../projectAccess.js';
import {
    scanWriteRoutes,
    extractPathConstants,
    reconcileExemptions,
    MIN_WRITE_ROUTES,
    type Exemption,
} from '../../tools/ga-gate/lib/writeRouteScan.js';

// ── §1 — hasPermission() tests ────────────────────────────────────────────────

describe('hasPermission() — ISO 19650 role-permission matrix (C08 §2.1)', () => {
    // Platform owner bypasses all role checks
    it('T01 — platform owner (isOwner=true) is permitted for any action and any role', () => {
        expect(hasPermission(null,             'edit_model',       true)).toBe(true);
        expect(hasPermission('viewer',         'move_to_published', true)).toBe(true);
        expect(hasPermission('appointing_party', 'edit_model',     true)).toBe(true);
    });

    // null role = no membership = deny
    it('T02 — null role (no membership) is denied for every action', () => {
        expect(hasPermission(null, 'edit_model',          false)).toBe(false);
        expect(hasPermission(null, 'invite_member',       false)).toBe(false);
        expect(hasPermission(null, 'move_to_published',   false)).toBe(false);
        expect(hasPermission(null, 'manage_project_settings', false)).toBe(false);
    });

    // viewer is read-only — cannot write
    it('T03 — viewer role cannot edit model or manage members', () => {
        expect(hasPermission('viewer', 'edit_model',      false)).toBe(false);
        expect(hasPermission('viewer', 'invite_member',   false)).toBe(false);
        expect(hasPermission('viewer', 'move_to_shared',  false)).toBe(false);
        expect(hasPermission('viewer', 'move_to_published', false)).toBe(false);
    });

    it('T04 — viewer can read shared and published versions', () => {
        expect(hasPermission('viewer', 'read_shared',     false)).toBe(true);
        expect(hasPermission('viewer', 'read_published',  false)).toBe(true);
    });

    it('T05 — team_member can edit model but cannot move to shared or manage members', () => {
        expect(hasPermission('team_member', 'edit_model',      false)).toBe(true);
        expect(hasPermission('team_member', 'move_to_shared',  false)).toBe(false);
        expect(hasPermission('team_member', 'invite_member',   false)).toBe(false);
    });

    it('T06 — team_manager can move to shared but not to published', () => {
        expect(hasPermission('team_manager', 'move_to_shared',    false)).toBe(true);
        expect(hasPermission('team_manager', 'move_to_published', false)).toBe(false);
    });

    it('T07 — lead_appointed can perform all core CDE operations', () => {
        expect(hasPermission('lead_appointed', 'edit_model',          false)).toBe(true);
        expect(hasPermission('lead_appointed', 'move_to_shared',      false)).toBe(true);
        expect(hasPermission('lead_appointed', 'move_to_published',   false)).toBe(true);
        expect(hasPermission('lead_appointed', 'invite_member',       false)).toBe(true);
        expect(hasPermission('lead_appointed', 'manage_project_settings', false)).toBe(true);
    });

    it('T08 — appointing_party can approve published but not edit model', () => {
        expect(hasPermission('appointing_party', 'approve_published', false)).toBe(true);
        expect(hasPermission('appointing_party', 'edit_model',        false)).toBe(false);
    });

    it('T09 — unknown action defaults to DENY for any role', () => {
        expect(hasPermission('lead_appointed', 'nonexistent_action', false)).toBe(false);
        expect(hasPermission('team_member',    'nonexistent_action', false)).toBe(false);
    });

    it('T10 — ROLES export contains all 5 ISO 19650 role keys', () => {
        expect(ROLES).toContain('appointing_party');
        expect(ROLES).toContain('lead_appointed');
        expect(ROLES).toContain('team_manager');
        expect(ROLES).toContain('team_member');
        expect(ROLES).toContain('viewer');
        expect(ROLES).toHaveLength(5);
    });
});

// ── §2 — canUserAccessProject() anonymous rejection tests ─────────────────────
//
// These tests prove that the enforcement function underlying _httpCanAccess
// (and therefore all 5 routes that call _httpCanAccess) rejects anonymous
// callers before any DB query is attempted.  This covers the C08 §2.1
// acceptance criterion: "No anonymous request reaches a DB write path."

describe('canUserAccessProject() — anonymous rejection (C08 §2.1)', () => {
    const projectsMap = new Map([['proj-123', { id: 'proj-123', ownerId: 'user-abc' }]]);
    const ctx = { supabase: null, pgPool: null, projectsMap };

    it('T11 — anonymous userId is always denied', async () => {
        const result = await canUserAccessProject('anonymous', 'proj-123', ctx);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/anonymous/i);
    });

    it('T12 — empty string userId is always denied', async () => {
        const result = await canUserAccessProject('', 'proj-123', ctx);
        expect(result.allowed).toBe(false);
    });

    it('T13 — null userId is always denied', async () => {
        const result = await canUserAccessProject(null as any, 'proj-123', ctx);
        expect(result.allowed).toBe(false);
    });

    it('T14 — undefined userId is always denied', async () => {
        const result = await canUserAccessProject(undefined as any, 'proj-123', ctx);
        expect(result.allowed).toBe(false);
    });

    it('T15 — invalid projectId (empty string) is denied', async () => {
        const result = await canUserAccessProject('user-abc', '', ctx);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/invalid/i);
    });

    it('T16 — authenticated owner is allowed in-memory fallback path', async () => {
        const result = await canUserAccessProject('user-abc', 'proj-123', ctx);
        expect(result.allowed).toBe(true);
    });

    it('T17 — authenticated non-owner is denied in-memory fallback path', async () => {
        const result = await canUserAccessProject('user-xyz', 'proj-123', ctx);
        expect(result.allowed).toBe(false);
    });

    it('T18 — project not found in in-memory map is denied', async () => {
        const result = await canUserAccessProject('user-abc', 'proj-nonexistent', ctx);
        expect(result.allowed).toBe(false);
    });
});

// ── §4 — §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE (L-136) ────────────────────────
//
// A transient DB error must FALL THROUGH to the other sources and, only when
// NO source can verify ownership because of a DB error, surface as a distinct
// RETRYABLE result — never a plain deny, and NEVER fail-open (allowed:true).

describe('canUserAccessProject() — transient DB error resilience (L-136)', () => {
    // A Supabase stub that always errors (simulates a saturated/degraded pooler).
    const erroringSupabase = {
        from() { return this; },
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: { message: 'pooler timeout' } }; },
    };
    // A PG pool stub that always throws (connection error).
    const erroringPgPool = {
        async query() { throw new Error('connection terminated unexpectedly'); },
    };

    it('T22 — Supabase error FALLS THROUGH to in-memory and allows the verified owner', async () => {
        const projectsMap = new Map([['proj-1', { id: 'proj-1', ownerId: 'user-abc' }]]);
        const result = await canUserAccessProject('user-abc', 'proj-1', {
            supabase: erroringSupabase, pgPool: null, projectsMap,
        });
        // Supabase blip must NOT deny the real owner — in-memory covers it.
        expect(result.allowed).toBe(true);
    });

    it('T23 — Supabase error + PG error, project only in-memory → owner still allowed', async () => {
        const projectsMap = new Map([['proj-1', { id: 'proj-1', ownerId: 'user-abc' }]]);
        const result = await canUserAccessProject('user-abc', 'proj-1', {
            supabase: erroringSupabase, pgPool: erroringPgPool, projectsMap,
        });
        expect(result.allowed).toBe(true);
    });

    it('T24 — ALL sources fail with DB errors → retryable, NOT a plain deny, and never fail-open', async () => {
        const projectsMap = new Map(); // project not in memory either
        const result = await canUserAccessProject('user-abc', 'proj-unverifiable', {
            supabase: erroringSupabase, pgPool: erroringPgPool, projectsMap,
        });
        expect(result.allowed).toBe(false);      // SECURITY: never grant on error
        expect(result.retryable).toBe(true);     // but flagged retryable, not permanent
    });

    it('T25 — DB error but a source VERIFIES not-owner → hard deny, NOT retryable', async () => {
        // In-memory authoritatively says the project belongs to someone else.
        const projectsMap = new Map([['proj-1', { id: 'proj-1', ownerId: 'someone-else' }]]);
        const result = await canUserAccessProject('user-abc', 'proj-1', {
            supabase: erroringSupabase, pgPool: null, projectsMap,
        });
        expect(result.allowed).toBe(false);
        expect(result.retryable).not.toBe(true);
    });

    it('T26 — no DB error + genuinely not found → hard deny (not retryable)', async () => {
        const projectsMap = new Map();
        const result = await canUserAccessProject('user-abc', 'proj-missing', {
            supabase: null, pgPool: null, projectsMap,
        });
        expect(result.allowed).toBe(false);
        expect(result.retryable).not.toBe(true);
        expect(result.reason).toMatch(/not found/i);
    });

    it('T27 — anonymous is still denied even when DB would error (no retry for anon)', async () => {
        const result = await canUserAccessProject('anonymous', 'proj-1', {
            supabase: erroringSupabase, pgPool: erroringPgPool, projectsMap: new Map(),
        });
        expect(result.allowed).toBe(false);
        expect(result.retryable).not.toBe(true);
    });
});

// ── §3 — Write-route auth coverage, DERIVED FROM SOURCE (L-406) ───────────────
//
// WHAT THIS REPLACES — and why the replacement is a different KIND of test.
//
// This section previously held a hand-typed "C08 §2.1 write route coverage
// matrix": a 37-entry array literal of { route, method, mechanism, exempt },
// whose three assertions were
//
//     it('T19 — audit matrix covers all 37 write routes', () =>
//         expect(auditMatrix).toHaveLength(37));
//     it('T20 — every non-exempt route has an explicit enforcement mechanism', …)
//     it('T21 — every route in the matrix has a non-empty route string', …)
//
// Every one of those assertions was about the literal declared four lines above
// it. The matrix was never compared to server.js. It was therefore GREEN BY
// CONSTRUCTION and could not, even in principle, detect an unprotected route.
//
// Two live consequences, both true on main when this was rewritten:
//
//   • The matrix declared `/api/event-log` `exempt: true` with the mechanism
//     "rate-limited, no project write". That route WAS L-406 — the P1
//     unauthenticated cross-tenant audit-write spoof. The audit whose job was
//     to catch L-406 is the document that certified it safe, and it still said
//     so after the route was fixed (065c23e2), because nothing connected the
//     two.
//   • The matrix claimed 37 write routes; server.js registers 46. Nine routes
//     had drifted in unaudited — /api/security/csp-report, /api/leads,
//     /api/overpass, /api/ai/cache/lookup, /api/ai/cache/store,
//     /marketplace/api/publishers/register-key and the three
//     /marketplace/api/plugins/:id/* writes — while the suite stayed green.
//
// The replacement enumerates only the EXCEPTIONS and derives the rest by
// scanning server.js, reconciling in both directions. A route added tomorrow
// without authMiddleware fails this test with no hand-maintenance at all.
//
// Deep parser specs live in tools/ga-gate/__tests__/writeRouteScan.spec.ts;
// the CI gate is tools/ga-gate/check-write-route-auth.ts.

describe('C08 §1.2/§2.1 — write-route auth coverage (scanned from server.js)', () => {
    const ROOT = process.cwd();
    const EXEMPTIONS_FILE = join(ROOT, 'tools', 'ga-gate', 'write-route-auth-exemptions.json');

    const constants: Record<string, string> = {};
    for (const f of readdirSync(join(ROOT, 'server'))) {
        if (!f.endsWith('.js')) continue;
        Object.assign(constants, extractPathConstants(readFileSync(join(ROOT, 'server', f), 'utf8')));
    }
    const { routes } = scanWriteRoutes(readFileSync(join(ROOT, 'server.js'), 'utf8'), constants);
    const declared: Exemption[] = JSON.parse(readFileSync(EXEMPTIONS_FILE, 'utf8')).exemptions;

    it('T28 — the scan actually read server.js (failure and empty are NOT the same value)', () => {
        // The predecessor matrix passed while reading nothing. This assertion is
        // the floor that makes every assertion below meaningful.
        expect(routes.length).toBeGreaterThanOrEqual(MIN_WRITE_ROUTES);
    });

    it('T29 — every mutating route is behind authMiddleware or declared-exempt with a rationale', () => {
        const { undeclared, unjustified } = reconcileExemptions(routes, declared);
        expect(undeclared.map(r => `${r.method} ${r.route} (server.js:${r.line})`)).toEqual([]);
        expect(unjustified.map(e => `${e.method} ${e.route}`)).toEqual([]);
    });

    it('T30 — the exemption list has not rotted: no stale or obsolete entries', () => {
        const { stale, obsolete } = reconcileExemptions(routes, declared);
        expect(stale.map(e => `${e.method} ${e.route}`)).toEqual([]);
        expect(obsolete.map(e => `${e.method} ${e.route}`)).toEqual([]);
    });

    it('T31 — L-406 REGRESSION: POST /api/event-log is behind authMiddleware', () => {
        const ev = routes.find(r => r.route === '/api/event-log' && r.method === 'POST');
        expect(ev, 'POST /api/event-log must be registered in server.js').toBeDefined();
        expect(ev!.authenticated).toBe(true);
    });

    it('T32 — every project-scoped write route is authenticated (§2.2 cross-tenant)', () => {
        const scoped = routes.filter(r => r.route.startsWith('/api/projects'));
        expect(scoped.length).toBeGreaterThan(0);
        expect(scoped.filter(r => !r.authenticated).map(r => `${r.method} ${r.route}`)).toEqual([]);
    });

    it('T33 — every marketplace write route is authenticated (UGC + purchase surface)', () => {
        const mk = routes.filter(r => r.route.startsWith('/marketplace/'));
        expect(mk.length).toBeGreaterThan(0);
        expect(mk.filter(r => !r.authenticated).map(r => `${r.method} ${r.route}`)).toEqual([]);
    });
});

