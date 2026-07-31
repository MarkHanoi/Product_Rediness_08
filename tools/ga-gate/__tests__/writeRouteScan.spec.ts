/**
 * §WRITE-ROUTE-AUTH (L-406) — behavioural specs for the Express mutating-route
 * auth gate.
 *
 * These lock the two failure modes that let L-406 ship and stay shipped:
 *
 *   1. The predecessor "audit" (`permissions.test.ts` §3) asserted the length of
 *      its own hand-typed array and never opened `server.js`, so it could not
 *      see an unprotected route. Every spec here runs against SOURCE.
 *   2. A scan that reads nothing must never report a pass — failure and empty
 *      are not the same value (the batch-9 lesson from `check-xss-guards`).
 *
 * The keystone is §L-406-REGRESSION: it removes `authMiddleware` from the real
 * `server.js` event-log registration in memory and asserts the scan reports the
 * route as authless. If that spec ever passes trivially, the gate is blind.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  scanWriteRoutes,
  extractPathConstants,
  reconcileExemptions,
  splitCallArgs,
  chainIsAuthenticated,
  stripComments,
  MIN_WRITE_ROUTES,
  WRITE_METHODS,
  type Exemption,
} from '../lib/writeRouteScan.js';

// Vitest transforms this module, so `import.meta.url` is not a file: URL here —
// the repo root is the runner's cwd (matching `xssSinkScan.spec.ts`).
const ROOT = process.cwd().replace(/[\\/]$/, '');
const SERVER_FILE = join(ROOT, 'server.js');
const EXEMPTIONS_FILE = join(ROOT, 'tools', 'ga-gate', 'write-route-auth-exemptions.json');

function realConstants(): Record<string, string> {
  const consts: Record<string, string> = {};
  for (const f of readdirSync(join(ROOT, 'server'))) {
    if (!f.endsWith('.js')) continue;
    Object.assign(consts, extractPathConstants(readFileSync(join(ROOT, 'server', f), 'utf8')));
  }
  return consts;
}

// ── §1 — Argument splitting ──────────────────────────────────────────────────

describe('splitCallArgs — middleware chains are parsed, not guessed', () => {
  it('T01 — splits a flat chain at top-level commas', () => {
    const src = "app.post('/x', apiLimiter, authMiddleware, handler);";
    const args = splitCallArgs(src, src.indexOf('('))!;
    expect(args.map((a) => a.trim())).toEqual(["'/x'", 'apiLimiter', 'authMiddleware', 'handler']);
  });

  it('T02 — a comma inside a nested object/call does NOT split the chain', () => {
    const src = "app.post(P, makeHandler({ a: 1, b: 2 }), authMiddleware);";
    const args = splitCallArgs(src, src.indexOf('('))!;
    expect(args).toHaveLength(3);
    expect(args[1].trim()).toBe('makeHandler({ a: 1, b: 2 })');
  });

  it('T03 — a comma inside a string literal does NOT split the chain', () => {
    const src = "app.post('/a,b', mw);";
    const args = splitCallArgs(src, src.indexOf('('))!;
    expect(args).toHaveLength(2);
    expect(args[0].trim()).toBe("'/a,b'");
  });

  it('T04 — an unterminated call returns null (a scan failure, never "no args")', () => {
    const src = "app.post('/x', authMiddleware";
    expect(splitCallArgs(src, src.indexOf('('))).toBeNull();
  });

  it('T05 — multi-line registrations are handled (server.js registers event-log this way)', () => {
    const src = 'app.post(\n  EVENT_LOG_PATH,\n  apiLimiter,\n  authMiddleware,\n  makeEventLogHandler({ requireAccess }),\n);';
    const args = splitCallArgs(src, src.indexOf('('))!;
    expect(args.map((a) => a.trim()).filter(Boolean)).toEqual([
      'EVENT_LOG_PATH', 'apiLimiter', 'authMiddleware', 'makeEventLogHandler({ requireAccess })',
    ]);
  });
});

// ── §2 — Comments must not satisfy a security check ──────────────────────────

describe('stripComments / chainIsAuthenticated — prose is not protection', () => {
  it('T06 — a COMMENT mentioning authMiddleware does not authenticate the route', () => {
    expect(chainIsAuthenticated(['/* TODO: add authMiddleware here */ handler'])).toBe(false);
  });

  it('T07 — a real authMiddleware reference does authenticate the route', () => {
    expect(chainIsAuthenticated(['apiLimiter', 'authMiddleware', 'handler'])).toBe(true);
  });

  it('T08 — a look-alike identifier does not count', () => {
    expect(chainIsAuthenticated(['fakeAuthMiddlewareShim'])).toBe(false);
  });

  it('T09 — a commented-out registration is not scanned as a live route', () => {
    const src = "// app.post('/ghost', handler);\napp.post('/real', authMiddleware, handler);";
    const { routes } = scanWriteRoutes(src);
    expect(routes.map((r) => r.route)).toEqual(['/real']);
  });

  it('T10 — stripComments preserves string contents', () => {
    expect(stripComments(`const a = 'http://x'; // note`)).toContain(`'http://x'`);
  });
});

// ── §3 — Path-constant resolution ────────────────────────────────────────────

describe('extractPathConstants — constant-registered routes are not invisible', () => {
  it('T11 — resolves an exported path constant', () => {
    expect(extractPathConstants(`export const EVENT_LOG_PATH = '/api/event-log';`))
      .toEqual({ EVENT_LOG_PATH: '/api/event-log' });
  });

  it('T12 — an UNRESOLVABLE path token throws rather than silently mis-auditing', () => {
    expect(() => scanWriteRoutes("app.post(MYSTERY_PATH, handler);", {}))
      .toThrow(/could not be resolved/);
  });

  it('T13 — a resolvable constant yields the real route name', () => {
    const { routes } = scanWriteRoutes('app.post(EVENT_LOG_PATH, authMiddleware, h);', { EVENT_LOG_PATH: '/api/event-log' });
    expect(routes[0].route).toBe('/api/event-log');
  });
});

// ── §4 — Method coverage ─────────────────────────────────────────────────────

describe('scanWriteRoutes — every mutating verb is in scope', () => {
  it('T14 — POST/PUT/PATCH/DELETE are all scanned', () => {
    const src = WRITE_METHODS.map((m) => `app.${m.toLowerCase()}('/r-${m}', handler);`).join('\n');
    const { routes } = scanWriteRoutes(src);
    expect(routes.map((r) => r.method).sort()).toEqual([...WRITE_METHODS].sort());
    expect(routes.every((r) => !r.authenticated)).toBe(true);
  });

  it('T15 — GET is NOT treated as a mutating route', () => {
    expect(scanWriteRoutes("app.get('/read', handler);").routes).toHaveLength(0);
  });

  it('T16 — router mounts record their own auth chain', () => {
    const { routerMounts } = scanWriteRoutes("app.use('/api/v1', apiLimiter, authMiddleware, v1Router);");
    expect(routerMounts[0]).toMatchObject({ prefix: '/api/v1', authenticated: true });
  });
});

// ── §5 — Reconciliation is bidirectional ─────────────────────────────────────

describe('reconcileExemptions — a hand-list that only grows is how the old matrix rotted', () => {
  const routes = scanWriteRoutes(
    "app.post('/pub', h);\napp.post('/safe', authMiddleware, h);",
  ).routes;

  it('T17 — an authless route with no declared exemption is reported', () => {
    const { undeclared } = reconcileExemptions(routes, []);
    expect(undeclared.map((r) => r.route)).toEqual(['/pub']);
  });

  it('T18 — a declared authless route is accepted', () => {
    const ex: Exemption[] = [{ route: '/pub', method: 'POST', rationale: 'public by design' }];
    expect(reconcileExemptions(routes, ex).undeclared).toHaveLength(0);
  });

  it('T19 — an exemption for a route that no longer exists is STALE', () => {
    const ex: Exemption[] = [{ route: '/gone', method: 'POST', rationale: 'x' }];
    expect(reconcileExemptions(routes, ex).stale.map((e) => e.route)).toEqual(['/gone']);
  });

  it('T20 — an exemption for a route that GAINED auth is OBSOLETE', () => {
    const ex: Exemption[] = [{ route: '/safe', method: 'POST', rationale: 'x' }];
    expect(reconcileExemptions(routes, ex).obsolete.map((e) => e.route)).toEqual(['/safe']);
  });

  it('T21 — an exemption with a blank rationale is UNJUSTIFIED', () => {
    const ex: Exemption[] = [{ route: '/pub', method: 'POST', rationale: '   ' }];
    expect(reconcileExemptions(routes, ex).unjustified).toHaveLength(1);
  });

  it('T22 — method is part of the identity (POST /x exempt does not exempt DELETE /x)', () => {
    const rs = scanWriteRoutes("app.post('/x', h);\napp.delete('/x', h);").routes;
    const ex: Exemption[] = [{ route: '/x', method: 'POST', rationale: 'ok' }];
    expect(reconcileExemptions(rs, ex).undeclared.map((r) => r.method)).toEqual(['DELETE']);
  });
});

// ── §6 — Against the REAL server.js (the specs the old matrix could not have) ─

describe('§L-406-REGRESSION — the gate reads the real server.js', () => {
  const constants = realConstants();
  const source = readFileSync(SERVER_FILE, 'utf8');
  const { routes } = scanWriteRoutes(source, constants);

  it('T23 — the scan sees a realistic route surface (failure ≠ empty)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(MIN_WRITE_ROUTES);
  });

  it('T24 — POST /api/event-log exists and IS behind authMiddleware (L-406 closed)', () => {
    const ev = routes.find((r) => r.route === '/api/event-log' && r.method === 'POST');
    expect(ev, 'POST /api/event-log must exist in server.js').toBeDefined();
    expect(ev!.authenticated).toBe(true);
    expect(ev!.middleware).toContain('authMiddleware');
  });

  it('T25 — MUTATION PROOF: removing authMiddleware from the event-log registration is DETECTED', () => {
    const mutated = source.replace(
      /(EVENT_LOG_PATH,\s*\r?\n\s*apiLimiter,\s*\r?\n)\s*authMiddleware,\s*\r?\n/,
      '$1',
    );
    // If this fails, the mutation did not apply and the assertion below would be
    // vacuous — exactly the false-green this whole gate exists to prevent.
    expect(mutated, 'mutation must actually change the source').not.toBe(source);

    const ev = scanWriteRoutes(mutated, constants).routes
      .find((r) => r.route === '/api/event-log' && r.method === 'POST');
    expect(ev!.authenticated).toBe(false);

    const { undeclared } = reconcileExemptions(
      scanWriteRoutes(mutated, constants).routes,
      JSON.parse(readFileSync(EXEMPTIONS_FILE, 'utf8')).exemptions,
    );
    expect(undeclared.map((r) => r.route)).toContain('/api/event-log');
  });

  it('T26 — every authless write route in server.js is declared with a rationale', () => {
    expect(existsSync(EXEMPTIONS_FILE)).toBe(true);
    const declared: Exemption[] = JSON.parse(readFileSync(EXEMPTIONS_FILE, 'utf8')).exemptions;
    const { undeclared, stale, obsolete, unjustified } = reconcileExemptions(routes, declared);
    expect({
      undeclared: undeclared.map((r) => `${r.method} ${r.route}`),
      stale:      stale.map((e) => `${e.method} ${e.route}`),
      obsolete:   obsolete.map((e) => `${e.method} ${e.route}`),
      unjustified: unjustified.map((e) => `${e.method} ${e.route}`),
    }).toEqual({ undeclared: [], stale: [], obsolete: [], unjustified: [] });
  });

  it('T27 — every project-scoped write route is authenticated', () => {
    const projectScoped = routes.filter((r) => r.route.startsWith('/api/projects'));
    expect(projectScoped.length).toBeGreaterThan(0);
    expect(projectScoped.filter((r) => !r.authenticated)).toEqual([]);
  });

  it('T28 — every marketplace write route is authenticated (UGC + purchase surface)', () => {
    const mk = routes.filter((r) => r.route.startsWith('/marketplace/'));
    expect(mk.length).toBeGreaterThan(0);
    expect(mk.filter((r) => !r.authenticated).map((r) => r.route)).toEqual([]);
  });
});
