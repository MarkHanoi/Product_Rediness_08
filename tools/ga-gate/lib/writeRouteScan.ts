/**
 * @file tools/ga-gate/lib/writeRouteScan.ts
 *
 * §WRITE-ROUTE-AUTH (L-406) — the pure, testable core of the Express
 * mutating-route auth scan.
 *
 * Contract C08 §1.2 + §2.1/§2.2 — `authMiddleware` populates `req.auth` and
 * NEVER rejects, so every mutating route decides for itself whether anonymous
 * access is permitted. A write route that is mounted OUTSIDE the auth chain
 * therefore has no `req.auth` at all and cannot make that decision: it is
 * structurally unable to attribute or authorise the write.
 *
 * Why this file exists (the defect it replaces)
 * ─────────────────────────────────────────────────────────────────────────────
 * `server/__tests__/permissions.test.ts` §3 carried a "C08 §2.1 write route
 * coverage matrix" whose three assertions were:
 *
 *     it('T19 — audit matrix covers all 37 write routes', () =>
 *         expect(auditMatrix).toHaveLength(37));
 *
 * …against a hand-typed array literal declared four lines above. The matrix was
 * never compared to `server.js`. It asserted its own length, so it was green by
 * construction and could not detect an unprotected route — the audit had no
 * connection to the artefact it claimed to audit.
 *
 * Two concrete consequences, both live on `main` when this scan was written:
 *
 *   1. The matrix declared `/api/event-log` `exempt: true`, mechanism
 *      "rate-limited, no project write". That route WAS the L-406 P1
 *      cross-tenant audit-write spoof. The audit meant to catch L-406 is the
 *      document that certified it safe, and it still said so after the route
 *      was fixed.
 *   2. The matrix listed 37 routes; `server.js` registers 46. Nine routes
 *      (`/api/security/csp-report`, `/api/leads`, `/api/overpass`,
 *      `/api/ai/cache/lookup`, `/api/ai/cache/store`,
 *      `/marketplace/api/publishers/register-key`, and the three
 *      `/marketplace/api/plugins/:id/*` writes) drifted in unaudited, silently,
 *      while the test stayed green.
 *
 * The replacement inverts the enumeration. A hand-list of EVERY route drifts;
 * a hand-list of only the EXCEPTIONS cannot, because the exception list is
 * checked against a scan of the real source in both directions:
 *
 *   • every authless write route found in source MUST be declared, with a
 *     rationale, in `write-route-auth-exemptions.json`; and
 *   • every declared exemption MUST still exist in source and MUST still be
 *     authless (a route that gained `authMiddleware` has to leave the list).
 *
 * Protected routes need no declaration at all — the scan proves them.
 *
 * This module is deliberately dependency-free and I/O-free so it can be unit
 * tested directly (see `tools/ga-gate/__tests__/writeRouteScan.spec.ts`).
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** HTTP verbs that mutate state. `GET`/`HEAD`/`OPTIONS` are out of scope. */
export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const WRITE_METHODS: readonly WriteMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

export interface WriteRoute {
  /** Resolved route path, e.g. `/api/event-log`. */
  route: string;
  method: WriteMethod;
  /** 1-based line of the registration in the scanned source. */
  line: number;
  /** The identifier used in source (`'/api/x'` literal, or `EVENT_LOG_PATH`). */
  pathToken: string;
  /**
   * Middleware identifiers between the path and the handler, in order —
   * e.g. `['apiLimiter', 'authMiddleware']`. A handler expressed inline
   * (`async (req,res) => {`) is not a middleware and is excluded.
   */
  middleware: string[];
  /** True when `authMiddleware` appears in the chain (directly or via a factory arg). */
  authenticated: boolean;
}

/** A route mounted via `app.use(prefix, ...middleware, router)`. */
export interface RouterMount {
  prefix: string;
  line: number;
  middleware: string[];
  authenticated: boolean;
}

export interface ScanResult {
  routes: WriteRoute[];
  routerMounts: RouterMount[];
  /** `const NAME = '/path'` values discovered in the supplied constant sources. */
  resolvedConstants: Record<string, string>;
}

// ── Constant resolution ──────────────────────────────────────────────────────

/**
 * Extract `export const NAME = '/some/path';` bindings from a module source.
 * Route paths in `server/*.js` are exported as constants (`EVENT_LOG_PATH`,
 * `LEADS_PATH`, …) and registered by identifier, so a scanner that only
 * understands string literals would silently MISS every one of them — reporting
 * a smaller, cleaner route surface than actually exists. That is the same
 * failure-as-empty shape this gate exists to prevent, so unresolved identifiers
 * are surfaced rather than skipped (see {@link scanWriteRoutes}).
 */
export function extractPathConstants(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:_PATH|_ROUTE|_PREFIX))\s*=\s*(['"`])(\/[^'"`]*)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out[m[1]] = m[3];
  return out;
}

// ── Argument splitting ───────────────────────────────────────────────────────

/**
 * Split the argument list of a call at top-level commas, honouring nesting and
 * string/template/comment context. Returns the raw argument texts.
 *
 * `openIndex` must point at the `(` of the call. Returns `null` when the call
 * is unterminated (truncated source), which callers MUST treat as a scan
 * failure rather than "no arguments".
 */
export function splitCallArgs(source: string, openIndex: number): string[] | null {
  if (source[openIndex] !== '(') return null;
  const args: string[] = [];
  let depth = 0;
  let start = openIndex + 1;
  let i = openIndex;
  let quote: string | null = null;

  for (; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];

    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { args.push(source.slice(start, i)); return args; }
      continue;
    }
    if (ch === ',' && depth === 1) { args.push(source.slice(start, i)); start = i + 1; }
  }
  return null; // unterminated
}

// ── Middleware classification ────────────────────────────────────────────────

/** An inline handler, not a named middleware reference. */
function isInlineHandler(arg: string): boolean {
  return /=>/.test(arg) || /^\s*(async\s+)?function\b/.test(arg);
}

/**
 * Reduce an argument to the middleware identifier it references.
 * `apiLimiter` → `apiLimiter`; `renderUpload.single('image')` → `renderUpload.single`;
 * `makeEventLogHandler({…})` → `makeEventLogHandler`.
 */
function middlewareName(arg: string): string {
  const trimmed = arg.trim();
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(trimmed);
  return m ? m[1] : trimmed.split(/\s|\(/)[0];
}

/**
 * True when the argument list authenticates the request. `authMiddleware` may
 * appear as a bare middleware OR nested inside a composed chain, so the whole
 * argument text is searched — but only as a whole word, so a comment mentioning
 * the name in prose does not count (comments are stripped first).
 */
export function chainIsAuthenticated(args: string[]): boolean {
  return args.some((a) => /\bauthMiddleware\b/.test(stripComments(a)));
}

/** Remove `//` and block comments so prose cannot satisfy a security check. */
export function stripComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      out += ch;
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl;
      out += '\n';
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

// ── The scan ─────────────────────────────────────────────────────────────────

const REGISTRATION_RE = /\bapp\.(post|put|patch|delete)\s*\(/g;
const USE_RE = /\bapp\.use\s*\(/g;

/**
 * Scan an Express server source for mutating-route registrations.
 *
 * @param source        The server source text (e.g. `server.js`).
 * @param constants     Path constants resolved from the route modules, so
 *                      `app.post(EVENT_LOG_PATH, …)` resolves to `/api/event-log`.
 * @throws when a registration's argument list is unterminated, or when a path
 *   token can be resolved to neither a literal nor a known constant. Both are
 *   scan failures; reporting them as "nothing found" is exactly the
 *   failure-equals-empty bug this gate replaces.
 */
export function scanWriteRoutes(source: string, constants: Record<string, string> = {}): ScanResult {
  // Comments are stripped BEFORE matching so a commented-out `app.post(` or a
  // JSDoc example does not register as a live route.
  const clean = stripComments(source);
  const lineAt = (idx: number) => clean.slice(0, idx).split('\n').length;

  const routes: WriteRoute[] = [];
  const unresolved: string[] = [];

  REGISTRATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REGISTRATION_RE.exec(clean)) !== null) {
    const method = m[1].toUpperCase() as WriteMethod;
    const openIndex = clean.indexOf('(', m.index + 'app.'.length);
    const args = splitCallArgs(clean, openIndex);
    const line = lineAt(m.index);
    if (args === null || args.length === 0) {
      throw new Error(`writeRouteScan: unterminated app.${m[1]}( at line ${line} — refusing to report a partial scan.`);
    }

    const rawPath = args[0].trim();
    const literal = /^(['"`])(\/[^'"`]*)\1$/.exec(rawPath);
    let route: string;
    if (literal) {
      route = literal[2];
    } else if (Object.prototype.hasOwnProperty.call(constants, rawPath)) {
      route = constants[rawPath];
    } else {
      unresolved.push(`${rawPath} (line ${line})`);
      route = rawPath;
    }

    const rest = args.slice(1);
    const middleware = rest.filter((a) => !isInlineHandler(a)).map(middlewareName).filter(Boolean);

    routes.push({
      route,
      method,
      line,
      pathToken: rawPath,
      middleware,
      authenticated: chainIsAuthenticated(rest),
    });
  }

  if (unresolved.length > 0) {
    throw new Error(
      `writeRouteScan: ${unresolved.length} route path(s) could not be resolved to a literal or a known ` +
      `constant: ${unresolved.join(', ')}. Add the defining module to the constant sources — an unresolved ` +
      'path would otherwise be audited under the wrong name.',
    );
  }

  // ── Router mounts ──────────────────────────────────────────────────────────
  const routerMounts: RouterMount[] = [];
  USE_RE.lastIndex = 0;
  while ((m = USE_RE.exec(clean)) !== null) {
    const openIndex = clean.indexOf('(', m.index + 'app.'.length);
    const args = splitCallArgs(clean, openIndex);
    if (args === null || args.length < 2) continue; // app.use(mw) — no prefix, not a mount
    const lit = /^(['"`])(\/[^'"`]*)\1$/.exec(args[0].trim());
    if (!lit) continue;
    const rest = args.slice(1);
    routerMounts.push({
      prefix: lit[2],
      line: lineAt(m.index),
      middleware: rest.filter((a) => !isInlineHandler(a)).map(middlewareName).filter(Boolean),
      authenticated: chainIsAuthenticated(rest),
    });
  }

  return { routes, routerMounts, resolvedConstants: constants };
}

// ── Exemption reconciliation ─────────────────────────────────────────────────

export interface Exemption {
  route: string;
  method: WriteMethod;
  /** Why this write is safe without a session. Required and non-empty. */
  rationale: string;
}

export interface ReconcileResult {
  /** Authless write routes found in source with no declared exemption. */
  undeclared: WriteRoute[];
  /** Declared exemptions whose route no longer exists in source. */
  stale: Exemption[];
  /** Declared exemptions whose route now HAS authMiddleware — remove them. */
  obsolete: Exemption[];
  /** Exemptions with a missing/blank rationale. */
  unjustified: Exemption[];
  /** Routes proven authenticated by the scan (no hand-maintenance needed). */
  authenticated: WriteRoute[];
}

const key = (r: { route: string; method: string }) => `${r.method} ${r.route}`;

/**
 * Reconcile a scan against the declared authless-route exemptions, in BOTH
 * directions. One-directional checking is how the previous matrix rotted: it
 * could never notice a route that had appeared, only one it already knew about.
 */
export function reconcileExemptions(routes: WriteRoute[], exemptions: Exemption[]): ReconcileResult {
  const byKey = new Map(routes.map((r) => [key(r), r]));
  const exemptKeys = new Set(exemptions.map(key));

  const undeclared = routes.filter((r) => !r.authenticated && !exemptKeys.has(key(r)));
  const stale = exemptions.filter((e) => !byKey.has(key(e)));
  const obsolete = exemptions.filter((e) => byKey.get(key(e))?.authenticated === true);
  const unjustified = exemptions.filter((e) => !e.rationale || !e.rationale.trim());
  const authenticated = routes.filter((r) => r.authenticated);

  return { undeclared, stale, obsolete, unjustified, authenticated };
}

/**
 * Coverage floor. `server.js` registers 46 write routes today; a scan that
 * finds fewer than this many has almost certainly failed to read or parse the
 * file, and MUST NOT be reported as a pass. Raise it as the surface grows.
 */
export const MIN_WRITE_ROUTES = 40;
