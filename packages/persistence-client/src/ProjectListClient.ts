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
  | 'network-error';

export class ProjectListClientError extends Error {
  readonly kind: ProjectListClientErrorKind;
  readonly status: number;
  readonly body: unknown;

  constructor(kind: ProjectListClientErrorKind, status: number, body: unknown) {
    super(`[ProjectListClient] ${kind} (HTTP ${status})`);
    this.kind = kind;
    this.status = status;
    this.body = body;
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
    const json = await this.req<{ data: ServerProjectRow[] } | ServerProjectRow[]>(
      'GET', '/api/v1/projects',
    );
    const rows = Array.isArray(json) ? json : json.data;
    return rows.map(rowToSummary);
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
    let res: Response;
    try {
      const init: RequestInit = {
        method,
        credentials: 'same-origin',
        headers,
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      res = await this.fetchImpl(url, init);
    } catch (err) {
      throw new ProjectListClientError('network-error', 0, { cause: String(err) });
    }
    if (!res.ok) {
      const errBody = await safeJson(res);
      throw new ProjectListClientError(mapStatus(res.status), res.status, errBody);
    }
    if (res.status === 204) return undefined as T;
    return (await safeJson(res)) as T;
  }
}

function mapStatus(status: number): ProjectListClientErrorKind {
  if (status === 401 || status === 403) return 'unauthenticated';
  if (status === 404) return 'not-found';
  if (status >= 400 && status < 500) return 'invalid-request';
  return 'server-error';
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); }
  catch { return null; }
}
