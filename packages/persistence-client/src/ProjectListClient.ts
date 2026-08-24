/// <reference lib="dom" />
// ProjectListClient — REST adapter for the project hub (S28).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 D2 line 739 — "REST API GET /projects + POST /projects +
//   DELETE /projects/:id + PATCH /projects/:id/name".
//   §S28 D1 line 732 — "REST GET /projects on hub load (one-time
//   fetch), WebSocket projectList.thumbnailUpdate for live thumbnail
//   updates" — i.e. lifecycle is REST, not the sync protocol.
//
// Pure module — `fetch` is injected so the same adapter is used in
// the browser and in JSDOM tests with a stub.  Throws typed
// `ProjectListClientError` on non-2xx for easier UI mapping (the hub
// maps `kind === 'unauthenticated'` to a re-login banner, etc.).

import type { ProjectSummary } from '@pryzm/stores';
import type { ProjectPatch } from './ProjectListController.js';
import { AuthClient } from './AuthClient.js';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus(typeof window !== 'undefined' ? window : undefined);

export type ProjectListClientErrorKind =
  | 'unauthenticated'
  | 'not-found'
  | 'invalid-request'
  | 'server-error'
  | 'network-error'
  // §FIX-CREATE-TIMEOUT-RETRY (L-132) — distinct from `network-error` (fetch
  // rejected outright) so callers can tell "the server never answered in time"
  // (e.g. a Fly redeploy rollout) apart from "the connection failed". Both are
  // retriable; the UI copy differs slightly.
  | 'timeout'
  // §FIX-RETRY-MIGRATIONS-503 (L-134) — the server answered, but with an
  // explicit "I'm still booting" 503 (`code:'migrations_in_progress'`, see
  // server/api/v1/routes.js §SERVER-500-V1-MIGRATION-RACE). `req` rides this
  // out with a longer wall-clock budget; this kind is only surfaced once that
  // budget is exhausted, so the caller can tell "still starting up" apart from
  // a generic upstream 5xx. Retriable — the boot window is self-clearing.
  | 'migrations';

export class ProjectListClientError extends Error {
  readonly kind: ProjectListClientErrorKind;
  readonly status: number;
  readonly body: unknown;
  /**
   * §FIX-CREATE-TIMEOUT-RETRY (L-132) — true when the failure is transient and a
   * fresh attempt (or a user-driven retry) is worth showing. Lets the onboarding
   * loader / hub surface a "try again" affordance instead of a terminal error for
   * connectivity blips, while still treating 4xx (auth / validation) as final.
   */
  readonly retriable: boolean;

  constructor(kind: ProjectListClientErrorKind, status: number, body: unknown) {
    // §SERVER-500-CLIENT-VISIBILITY (DAILY-USE 2026-05-21, Round 39) —
    // Surface the server-side `errorId` + structured `code` in the error
    // MESSAGE so they appear in the architect's browser console
    // without having to open the Network tab + inspect the response body.
    //
    // Rounds 25-36 added `errorId` to every 500 / 503 response from the
    // server. The architect's console output previously showed only
    // `[ProjectListClient] server-error (HTTP 500)` because the
    // `body` field (which contains the errorId) was a property on the
    // error object but NOT part of the message string. The browser's
    // default console.error toString of the error showed only the
    // message → the diagnostic was effectively invisible without an
    // additional DevTools click. Now the message includes both fields
    // when present, so a single `console.error(err)` in user code
    // immediately surfaces the correlation key for support workflows.
    const bodyObj = (body && typeof body === 'object') ? body as { errorId?: string; code?: string } : null;
    const errorIdPart = bodyObj?.errorId ? ` errorId=${bodyObj.errorId}` : '';
    const codePart    = bodyObj?.code    ? ` code=${bodyObj.code}`     : '';
    super(`[ProjectListClient] ${kind} (HTTP ${status})${errorIdPart}${codePart}`);
    this.kind = kind;
    this.status = status;
    this.body = body;
    // Transient transport failures + upstream 5xx + a still-booting server are
    // worth a retry; 4xx (unauthenticated / not-found / invalid-request) are
    // deterministic and final.
    this.retriable = kind === 'network-error' || kind === 'timeout'
      || kind === 'server-error' || kind === 'migrations';
  }
}

/** Shape returned by the server.  Keep loose here — the client's job
 *  is to forward what the server sent; field-level validation lives
 *  in the schema layer downstream of this adapter.  Phase C §16.3
 *  added `is_archived` / `is_starred` / `description` (project hub
 *  card chips); they are optional so older REST responses that do
 *  not project them still parse cleanly. */
export interface ServerProjectRow {
  readonly id: string;
  readonly name: string;
  readonly owner_id: string;
  readonly version_count?: number;
  readonly thumbnail?: string | null;
  readonly thumbnail_url?: string | null;
  readonly updated_at?: string;
  readonly created_at?: string;
  readonly is_archived?: boolean;
  readonly is_starred?: boolean;
  readonly description?: string | null;
}

/** Map a server row → store DTO.  Server uses `snake_case` (Postgres
 *  default), the store uses `camelCase` per S28 line 669.
 *
 *  `version_count`, `is_archived`, `is_starred`, and `description` are
 *  forwarded when present so the typed `ProjectSummary` stays
 *  loss-less against the server projection — the Project Hub card
 *  reads `versionCount` for its per-project version-count chip
 *  (chunks/22 §22.1 step 1.5 leg). */
export function rowToSummary(row: ServerProjectRow): ProjectSummary {
  const summary: {
    -readonly [K in keyof ProjectSummary]: ProjectSummary[K];
  } = {
    id: row.id,
    name: row.name,
    lastModifiedAt: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    thumbnailUrl: row.thumbnail_url ?? row.thumbnail ?? null,
    ownerName: row.owner_id,
    collaboratorCount: 0,
    schemaVersion: 1,
  };
  if (typeof row.version_count === 'number') summary.versionCount = row.version_count;
  if (typeof row.is_archived === 'boolean') summary.isArchived = row.is_archived;
  if (typeof row.is_starred === 'boolean') summary.isStarred = row.is_starred;
  if (row.description !== undefined) summary.description = row.description;
  return summary;
}

export interface ProjectListClientOptions {
  /** Defaults to `globalThis.fetch`. */
  readonly fetch?: typeof fetch;
  /** Defaults to `''` (relative URLs — the page is same-origin with
   *  the API).  Tests pass `'http://api.example/'`. */
  readonly baseUrl?: string;
  /** Returns the bearer token to attach as `Authorization: Bearer <jwt>`
   *  on every request.  Defaults to reading
   *  `localStorage['bim-platform-token']` per the legacy auth contract
   *  (W3 wireup, see `PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md` §4.3).
   *  Tests inject a stub.  Return `null` to omit the header. */
  readonly getAuthToken?: () => string | null;
  /** Optional pre-constructed AuthClient instance. When omitted, the
   *  ProjectListClient owns its own AuthClient instance built with the
   *  shared `fetch` + `baseUrl` + the canonical localStorage backend. */
  readonly auth?: AuthClient;
}

/** W3 (PRYZM2-FINAL-WIREUP-AUDIT §4.3) — read the legacy token from
 *  localStorage so REST calls inherit the same auth as PRYZM 1.  Wrapped
 *  in try/catch because some test runtimes (sandboxed iframes, certain
 *  privacy modes) throw on `localStorage` access. */
function defaultGetAuthToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('bim-platform-token');
  } catch {
    return null;
  }
}

export class ProjectListClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly tokenProvider: () => string | null;
  /**
   * Typed auth surface — the canonical `runtime.persistence.client.auth.*`
   * leg referenced by `chunks/22 §22.1` step 1.2 (Flow 1 — Landing →
   * Signup → Hub). Owned by ProjectListClient via composition so the
   * canonical access path resolves without modifying chunks/02 §3.2's
   * `client: ProjectListClient` typed handle.
   *
   * Wraps the legacy auth mechanism (popup OAuth + postMessage +
   * `bim-platform-token` localStorage) — see `AuthClient.ts` header for
   * the canonical-source reconciliation note.
   */
  readonly auth: AuthClient;

  constructor(opts: ProjectListClientOptions = {}) {
    const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      throw new Error(
        '[ProjectListClient] no fetch implementation available; ' +
        'pass `opts.fetch` (e.g. node-fetch in tests).',
      );
    }
    this.fetchImpl = f.bind(globalThis);
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '');
    this.tokenProvider = opts.getAuthToken ?? defaultGetAuthToken;
    this.auth = opts.auth ?? new AuthClient({ fetch: f, baseUrl: this.baseUrl });
  }

  /** GET /api/v1/projects → ProjectSummary[]. */
  async list(): Promise<ProjectSummary[]> {
    return (await this.listPage()).projects;
  }

  /**
   * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — one page, WITH the server's own
   * statement about whether more rows exist.
   *
   * `list()` above has always returned at most 50 rows and never said so, and
   * `ProjectHub.syncFromServer()` read that page as the user's complete project
   * list — concluding that every local project missing from it was absent from
   * the server. On the founder's account the page came back saturated at 50 and
   * fifty further projects were reported as existing only in the browser.
   *
   * `hasMore` is `undefined` against a server that predates the change; that is
   * a THIRD state and must not be read as `false`. The caller decides what an
   * unanswered question means — see `serverListCompleteness.ts`.
   */
  async listPage(opts?: { limit?: number; offset?: number }): Promise<{
    readonly projects: ProjectSummary[];
    readonly limit?: number;
    readonly offset?: number;
    readonly hasMore?: boolean;
  }> {
    const q: string[] = [];
    if (typeof opts?.limit === 'number') q.push(`limit=${encodeURIComponent(String(opts.limit))}`);
    if (typeof opts?.offset === 'number') q.push(`offset=${encodeURIComponent(String(opts.offset))}`);
    const path = q.length > 0 ? `/api/v1/projects?${q.join('&')}` : '/api/v1/projects';

    const json = await this.req<
      { data: ServerProjectRow[]; limit?: number; offset?: number; hasMore?: boolean } | ServerProjectRow[]
    >('GET', path);

    if (Array.isArray(json)) return { projects: json.map(rowToSummary) };
    return {
      projects: json.data.map(rowToSummary),
      limit: typeof json.limit === 'number' ? json.limit : undefined,
      offset: typeof json.offset === 'number' ? json.offset : undefined,
      hasMore: typeof json.hasMore === 'boolean' ? json.hasMore : undefined,
    };
  }

  /**
   * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — enumerate EVERY project, and
   * report honestly when the enumeration could not be completed.
   *
   * ⛔ `complete: false` is a real outcome, not an error to swallow. It happens
   * against an old server (no `hasMore`, so a saturated page proves nothing) and
   * when the page budget below is exhausted. A caller that treats an incomplete
   * enumeration as complete re-creates the exact defect this method exists to
   * remove, which is why the flag is returned rather than logged.
   *
   * ⚠ BOUNDED BY DESIGN. `maxPages` caps the request count so a paging bug on
   * either side (a server that always says `hasMore`, an offset that stops
   * advancing) degrades into "incomplete", never into an unbounded request loop
   * against the founder's own API on hub load.
   */
  async listAll(opts?: { pageSize?: number; maxPages?: number }): Promise<{
    readonly projects: ProjectSummary[];
    readonly complete: boolean;
    readonly pagesFetched: number;
    readonly reason: 'server-declared-no-more' | 'short-page' | 'page-budget-exhausted' | 'server-does-not-paginate';
  }> {
    // ⚠ 50, NOT the server's 200 ceiling, and the reason is payload size rather
    // than politeness. `GET /api/v1/projects` selects `p.thumbnail` inline
    // (`server/projectStore.js:418`), and a thumbnail is a base64 data URL that
    // `ProjectRepository`'s own §HUB-THUMBNAIL-STORAGE note measures at
    // "~5–500 KB" each. A 200-row page would therefore be up to FOUR TIMES the
    // JSON the hub already downloads per request. Enumerating in 50-row pages
    // keeps every individual response exactly the size it is today and pays for
    // completeness in request COUNT, which is the cheap axis. ⛔ Do not raise this
    // to 200 without first moving thumbnails out of the list row (L-10405).
    const pageSize = opts?.pageSize ?? 50;
    const maxPages = opts?.maxPages ?? 40;

    const seen = new Set<string>();
    const projects: ProjectSummary[] = [];
    let offset = 0;

    for (let page = 0; page < maxPages; page++) {
      const res = await this.listPage({ limit: pageSize, offset });

      for (const p of res.projects) {
        // De-duplicate across pages. Rows can shift between requests (a project
        // saved mid-enumeration moves to the top of an `updated_at DESC` order),
        // and a duplicate would inflate counts the hub renders.
        if (!seen.has(p.id)) { seen.add(p.id); projects.push(p); }
      }

      // The server does not paginate at all (pre-L-10400). It answered with
      // whatever its own default was; a full page proves nothing either way.
      if (res.hasMore === undefined) {
        const saturated = res.projects.length >= (res.limit ?? pageSize);
        return {
          projects,
          complete: !saturated,
          pagesFetched: page + 1,
          reason: saturated ? 'server-does-not-paginate' : 'short-page',
        };
      }

      if (!res.hasMore) {
        return { projects, complete: true, pagesFetched: page + 1, reason: 'server-declared-no-more' };
      }

      // ⚠ Guard against a server that says `hasMore` while returning nothing —
      // otherwise the offset never advances and this loops until `maxPages`.
      if (res.projects.length === 0) {
        return { projects, complete: false, pagesFetched: page + 1, reason: 'page-budget-exhausted' };
      }
      offset += res.projects.length;
    }

    return { projects, complete: false, pagesFetched: maxPages, reason: 'page-budget-exhausted' };
  }

  /** POST /api/v1/projects { name } → ProjectSummary. */
  async create(name: string): Promise<ProjectSummary> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ProjectListClientError('invalid-request', 0, { error: 'name required' });
    }
    const json = await this.req<{ data: ServerProjectRow } | ServerProjectRow>(
      'POST', '/api/v1/projects', { name: trimmed },
    );
    const row = 'data' in json ? json.data : json;
    return rowToSummary(row);
  }

  /** DELETE /api/v1/projects/:id → void. */
  async delete(id: string): Promise<void> {
    await this.req<unknown>('DELETE', `/api/v1/projects/${encodeURIComponent(id)}`);
  }

  /** PATCH /api/v1/projects/:id { name } → ProjectSummary. */
  async rename(id: string, name: string): Promise<ProjectSummary> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ProjectListClientError('invalid-request', 0, { error: 'name required' });
    }
    const json = await this.req<{ data: ServerProjectRow } | ServerProjectRow>(
      'PATCH', `/api/v1/projects/${encodeURIComponent(id)}`, { name: trimmed },
    );
    const row = 'data' in json ? json.data : json;
    return rowToSummary(row);
  }

  /** PATCH /api/v1/projects/:id { name?, isArchived?, isStarred?, description? }
   *  → ProjectSummary.  Spec: §16.3 sub-phases C.4.01 (rename), C.4.03
   *  (archive), C.4.04 (star), C.4.05 (description). */
  async patch(id: string, patch: ProjectPatch): Promise<ProjectSummary> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (trimmed.length === 0) {
        throw new ProjectListClientError('invalid-request', 0, { error: 'name required' });
      }
      body.name = trimmed;
    }
    if (patch.isArchived !== undefined) body.isArchived = patch.isArchived;
    if (patch.isStarred !== undefined) body.isStarred = patch.isStarred;
    if (patch.description !== undefined) body.description = patch.description;
    if (Object.keys(body).length === 0) {
      throw new ProjectListClientError('invalid-request', 0, { error: 'patch must include at least one field' });
    }
    const json = await this.req<{ data: ServerProjectRow } | ServerProjectRow>(
      'PATCH', `/api/v1/projects/${encodeURIComponent(id)}`, body,
    );
    const row = 'data' in json ? json.data : json;
    return rowToSummary(row);
  }

  /** POST /api/v1/projects/:id/duplicate { newName? } → ProjectSummary.
   *  Spec: §16.3 sub-phase C.4.06. */
  async duplicate(id: string, newName?: string): Promise<ProjectSummary> {
    const body: Record<string, unknown> = {};
    if (newName !== undefined) {
      const trimmed = newName.trim();
      if (trimmed.length > 0) body.newName = trimmed;
    }
    const json = await this.req<{ data: ServerProjectRow } | ServerProjectRow>(
      'POST', `/api/v1/projects/${encodeURIComponent(id)}/duplicate`, body,
    );
    const row = 'data' in json ? json.data : json;
    return rowToSummary(row);
  }

  /** Sign-out — clears the local auth token + dispatches a global
   *  `pryzm:auth:signedOut` CustomEvent so AuthModal can re-show.
   *
   *  Spec: §16.3 sub-phase C.10.04.  The PRYZM JWT is stateless
   *  (server-side it is just verified per-request, not tracked) so no
   *  server endpoint is invoked — clearing the token client-side is
   *  sufficient.  When a session-revocation endpoint lands later this
   *  method is the single place to wire the POST. */
  async signOut(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('bim-platform-token');
      }
    } catch { /* sandbox / private mode — no-op */ }
    try {
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        _bus.emit('pryzm:auth:signedOut', {}); // F.events.18
      }
    } catch { /* no DOM — no-op */ }
  }

  /** Returns the current bearer token (or `null`).  Exposed so the
   *  runtime.persistence slot can answer questions like "are we
   *  authenticated?" without callers reaching into localStorage. */
  getAuthToken(): string | null {
    return this.tokenProvider();
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async req<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    // W3 — inject the bearer token from localStorage on every request so
    // the v1 API recognises us as the JWT-authenticated user (otherwise
    // `req.auth.userId` is missing and every route returns 401).
    const headers: Record<string, string> = body !== undefined
      ? { 'content-type': 'application/json', accept: 'application/json' }
      : { accept: 'application/json' };
    const token = this.getAuthToken();
    if (token !== null && token.length > 0) {
      headers.authorization = `Bearer ${token}`;
    }
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    // §FIX-CREATE-TIMEOUT-RETRY (L-132) — bound every request with an
    // AbortController-driven timeout and a small backoff retry. Before this,
    // a stalled connection (e.g. the founder's push→deploy→test loop hitting a
    // Fly rollout window mid-`POST /api/v1/projects`) left the fetch pending
    // forever, hanging the onboarding loader on "PREPARING WORKSPACE" with no
    // escape. Now the request either completes, or rejects with a typed,
    // `retriable` error the UI can surface.
    //
    // Retry policy: two distinct transient failures are re-attempted; anything
    // else is returned to the caller on the FIRST hit so we never hammer the
    // server on a deterministic error.
    //
    //  1. TRANSPORT failures (fetch rejected or our timeout fired) — the socket
    //     never carried a completed HTTP response. Short linear backoff, a
    //     small fixed budget (MAX_TRANSPORT_RETRIES). During a redeploy the
    //     failure is typically a fast connection-refused resolving within
    //     ~1-2s; the per-attempt timeout only bites if the socket connects but
    //     never answers.
    //  2. §FIX-RETRY-MIGRATIONS-503 (L-134) — a COMPLETED HTTP 503 whose body
    //     carries `code:'migrations_in_progress'`. The server opens its
    //     listening socket BEFORE boot migrations finish (server/api/v1/
    //     routes.js §SERVER-500-V1-MIGRATION-RACE) and, for that brief window,
    //     explicitly asks us to wait + retry (it even sends `Retry-After`).
    //     Before L-134 we threw on the first 503 and onboarding died with
    //     "Failed to create project" even though the server literally requested
    //     a retry. Because a boot/migration window can outlast the transport
    //     budget, this path gets its own LONGER wall-clock budget
    //     (MIGRATIONS_RETRY_BUDGET_MS) with increasing backoff — each attempt
    //     still bounded by the same per-request AbortController timeout.
    //
    // Every OTHER completed response — 4xx (auth/validation) and any 5xx that
    // is NOT a migrations_in_progress 503 — is thrown on the first hit: no
    // retry storm. On budget exhaustion we throw a typed, `retriable` error so
    // the L-132 onboarding/PlatformRouter UI shows a retry affordance.
    //
    // NOTE (idempotency): re-attempting a non-idempotent POST (create/duplicate)
    // could in principle double-create if the server processed the first request
    // but the response was lost. For the connection-refused redeploy case the
    // server never saw it; for the migrations 503 the gate runs BEFORE the route
    // handler so no row is ever written — both retries are safe. We accept the
    // small response-lost edge over an indefinite hang.
    let lastErr: ProjectListClientError | null = null;
    let transportAttempts = 0;   // transport failures consumed (fetch reject / timeout)
    let migrationsAttempts = 0;  // consecutive migrations_in_progress 503s ridden out
    const startedAt = Date.now(); // wall-clock anchor for the migrations retry budget
    // Provably-bounded loop: the wall-clock budget is the real ceiling; this
    // hard cap is a belt-and-suspenders against a pathological zero-length sleep
    // and keeps the loop condition non-constant.
    for (let attempt = 0; attempt < MAX_TOTAL_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      // Don't keep the Node event loop alive for the timer in test/SSR runtimes.
      if (timer && typeof timer === 'object' && 'unref' in timer
        && typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
      }
      let res: Response;
      try {
        const init: RequestInit = {
          method,
          credentials: 'same-origin',
          headers,
          signal: controller.signal,
        };
        if (payload !== undefined) init.body = payload;
        res = await this.fetchImpl(url, init);
      } catch (err) {
        // Distinguish "our timeout aborted it" from a genuine transport reject.
        const aborted = controller.signal.aborted
          || (err as { name?: string })?.name === 'AbortError';
        lastErr = aborted
          ? new ProjectListClientError('timeout', 0, {
              cause: `request timed out after ${REQUEST_TIMEOUT_MS}ms`, url, method,
            })
          : new ProjectListClientError('network-error', 0, { cause: String(err), url, method });
        // Transient transport failure — retry up to the transport budget, else throw.
        if (transportAttempts >= MAX_TRANSPORT_RETRIES) throw lastErr;
        transportAttempts += 1;
        await delay(RETRY_BASE_DELAY_MS * transportAttempts);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const errBody = await safeJson(res);
        // §FIX-RETRY-MIGRATIONS-503 (L-134) — the one completed response we ride
        // out: HTTP 503 `code:'migrations_in_progress'`. The server is asking us
        // to wait for the self-clearing boot window; retry with backoff until the
        // wall-clock budget is spent, then surface a typed retriable error.
        if (isMigrationsInProgress(res.status, errBody)) {
          lastErr = new ProjectListClientError('migrations', res.status, errBody);
          const elapsed = Date.now() - startedAt;
          const remaining = MIGRATIONS_RETRY_BUDGET_MS - elapsed;
          if (remaining <= 0) throw lastErr; // budget spent — give up (retriable)
          // Increasing backoff (honouring the server's Retry-After), clamped so
          // the total wall-clock never overshoots the budget by more than one sleep.
          const backoff = Math.min(migrationsBackoffMs(migrationsAttempts, res), remaining);
          migrationsAttempts += 1;
          await delay(backoff);
          continue;
        }
        // Every other 4xx/5xx is deterministic — fail fast, no retry.
        throw new ProjectListClientError(mapStatus(res.status), res.status, errBody);
      }
      if (res.status === 204) return undefined as T;
      return (await safeJson(res)) as T;
    }
    throw lastErr ?? new ProjectListClientError('network-error', 0, { cause: 'request failed', url, method });
  }
}

// §FIX-CREATE-TIMEOUT-RETRY (L-132) — request robustness knobs.
// 12s per attempt keeps a hung socket from stranding the UI while still
// tolerating a slow-but-alive server; 2 retries (3 attempts total) rides out a
// brief redeploy blip without user action.
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_TRANSPORT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400; // linear backoff: 400ms, then 800ms

// §FIX-RETRY-MIGRATIONS-503 (L-134) — the still-booting server (HTTP 503
// `migrations_in_progress`) window can outlast the short transport budget, so
// it gets its own longer wall-clock budget with increasing backoff. 60s of
// wall clock across a handful of attempts comfortably rides out the typical
// 200ms-3s migration window (and even a slower cold DB) without spinning
// forever. Each attempt is still bounded by REQUEST_TIMEOUT_MS.
const MIGRATIONS_RETRY_BUDGET_MS = 60_000; // total wall-clock across all retries
const MIGRATIONS_BASE_DELAY_MS = 1_000;    // 1s, then 2s, 4s, 8s…
const MIGRATIONS_MAX_DELAY_MS = 8_000;     // per-sleep cap for the exponential term
// Hard iteration ceiling — the wall-clock budget is the real bound; this only
// guards against a pathological zero-length backoff and keeps the loop bounded.
const MAX_TOTAL_ATTEMPTS = 128;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatus(status: number): ProjectListClientErrorKind {
  if (status === 401 || status === 403) return 'unauthenticated';
  if (status === 404) return 'not-found';
  if (status >= 400 && status < 500) return 'invalid-request';
  return 'server-error';
}

/** §FIX-RETRY-MIGRATIONS-503 (L-134) — true only for the server's explicit
 *  "still booting, retry me" signal: HTTP 503 with a JSON body carrying
 *  `code:'migrations_in_progress'`. Deliberately narrow — a bare 503 (or any
 *  other 5xx) is NOT treated as retriable here, so we never retry-storm a
 *  genuinely unavailable upstream. */
function isMigrationsInProgress(status: number, body: unknown): boolean {
  return status === 503
    && !!body && typeof body === 'object'
    && (body as { code?: unknown }).code === 'migrations_in_progress';
}

/** Backoff for the migrations retry path: an increasing exponential term
 *  (1s → 2s → 4s → 8s, capped), taken as the max with any `Retry-After` the
 *  server advertised so we never poll faster than it asked. */
function migrationsBackoffMs(attempt: number, res: Response): number {
  const exp = Math.min(MIGRATIONS_BASE_DELAY_MS * 2 ** attempt, MIGRATIONS_MAX_DELAY_MS);
  const retryAfter = parseRetryAfterMs(res);
  return retryAfter !== null ? Math.max(exp, retryAfter) : exp;
}

/** Parse an HTTP `Retry-After` header → milliseconds, supporting both the
 *  delta-seconds form (`Retry-After: 2`) and the HTTP-date form. Returns
 *  `null` when absent or unparseable (caller falls back to its own backoff). */
function parseRetryAfterMs(res: Response): number | null {
  let raw: string | null = null;
  try { raw = res.headers.get('retry-after'); } catch { raw = null; }
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const secs = Number(trimmed);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); }
  catch { return null; }
}
