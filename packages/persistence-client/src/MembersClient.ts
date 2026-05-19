// MembersClient — REST adapter for the project members API.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 — sub-phases
// C.8.01 (paint members), C.8.02 (invite), C.8.03 (remove), C.8.04
// (change role).  All calls go through the legacy `/api/projects/:id/members*`
// surface (the v1 API does not own members yet — pre-existing endpoints
// from S44 still serve the workspace pages).
//
// Pure module — `fetch` is injected the same way `ProjectListClient`
// does so the same adapter is used in browser + JSDOM tests.

import { ProjectListClientError, type ProjectListClientErrorKind } from './ProjectListClient.js';

export type ProjectMemberRole = 'viewer' | 'editor' | 'admin' | 'owner';

export interface MemberRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: ProjectMemberRole;
  readonly addedAt: string;
}

/** Loose shape — server may return either snake_case (Postgres) or
 *  camelCase (in-memory store) depending on the backend in play. */
export interface ServerMemberRow {
  readonly user_id?: string;
  readonly userId?: string;
  readonly email: string;
  readonly display_name?: string | null;
  readonly displayName?: string | null;
  readonly name?: string | null;
  readonly role?: ProjectMemberRole;
  readonly added_at?: string;
  readonly addedAt?: string;
}

export function rowToMember(row: ServerMemberRow): MemberRecord {
  const role = row.role ?? 'viewer';
  return {
    userId: row.userId ?? row.user_id ?? '',
    email: row.email,
    displayName: row.displayName ?? row.display_name ?? row.name ?? null,
    role,
    addedAt: row.addedAt ?? row.added_at ?? new Date(0).toISOString(),
  };
}

export interface MembersClientOptions {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  readonly getAuthToken?: () => string | null;
}

function defaultGetAuthToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('bim-platform-token');
  } catch {
    return null;
  }
}

export class MembersClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly getAuthToken: () => string | null;

  constructor(opts: MembersClientOptions = {}) {
    const f = opts.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      throw new Error('[MembersClient] no fetch implementation available; pass `opts.fetch`.');
    }
    this.fetchImpl = f.bind(globalThis);
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '');
    this.getAuthToken = opts.getAuthToken ?? defaultGetAuthToken;
  }

  /** GET /api/projects/:id/members → MemberRecord[]. */
  async list(projectId: string): Promise<MemberRecord[]> {
    const json = await this.req<{ members?: ServerMemberRow[]; data?: ServerMemberRow[] } | ServerMemberRow[]>(
      'GET', `/api/projects/${encodeURIComponent(projectId)}/members`,
    );
    const rows = Array.isArray(json) ? json : json.members ?? json.data ?? [];
    return rows.map(rowToMember);
  }

  /** POST /api/projects/:id/members { email, role } → MemberRecord. */
  async invite(projectId: string, email: string, role: ProjectMemberRole): Promise<MemberRecord> {
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      throw new ProjectListClientError('invalid-request', 0, { error: 'email required' });
    }
    const json = await this.req<{ member?: ServerMemberRow } | ServerMemberRow>(
      'POST',
      `/api/projects/${encodeURIComponent(projectId)}/members`,
      { email: trimmed, role },
    );
    const row = 'member' in json && json.member ? json.member : (json as ServerMemberRow);
    return rowToMember(row);
  }

  /** DELETE /api/projects/:id/members/:userId → void. */
  async remove(projectId: string, userId: string): Promise<void> {
    await this.req<unknown>(
      'DELETE',
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    );
  }

  /** PATCH /api/projects/:id/members/:userId { role } → MemberRecord. */
  async setRole(projectId: string, userId: string, role: ProjectMemberRole): Promise<MemberRecord> {
    const json = await this.req<{ member?: ServerMemberRow } | ServerMemberRow>(
      'PATCH',
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      { role },
    );
    const row = 'member' in json && json.member ? json.member : (json as ServerMemberRow);
    return rowToMember(row);
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async req<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = body !== undefined
      ? { 'content-type': 'application/json', accept: 'application/json' }
      : { accept: 'application/json' };
    const token = this.getAuthToken();
    if (token !== null && token.length > 0) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      const init: RequestInit = {
        method,
        credentials: 'same-origin',
        headers,
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (err) {
      throw new ProjectListClientError('network-error', 0, { cause: String(err) });
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const kind: ProjectListClientErrorKind =
        res.status === 401 || res.status === 403 ? 'unauthenticated'
        : res.status === 404 ? 'not-found'
        : res.status >= 400 && res.status < 500 ? 'invalid-request'
        : 'server-error';
      throw new ProjectListClientError(kind, res.status, errBody);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json().catch(() => null)) as T;
  }
}
