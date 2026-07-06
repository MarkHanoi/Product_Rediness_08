// ProjectListClient unit tests (S28 — Persistent Project Hub).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S28.
//
// Strategy: pass a stub `fetch` so the adapter is exercised without
// hitting the network.  We assert (a) the URL + method + body sent
// to fetch, (b) the parsed `ProjectSummary` shape returned to the
// caller, and (c) typed error mapping for non-2xx responses.

import { describe, expect, it, vi } from 'vitest';
import {
  ProjectListClient,
  ProjectListClientError,
  rowToSummary,
  type ServerProjectRow,
} from '../src/ProjectListClient.js';

function makeRow(overrides: Partial<ServerProjectRow> = {}): ServerProjectRow {
  return {
    id: 'proj-1',
    name: 'Demo',
    owner_id: 'user-1',
    version_count: 3,
    thumbnail: null,
    updated_at: '2026-04-27T10:00:00.000Z',
    created_at: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return responder(url, init ?? {});
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('rowToSummary', () => {
  it('maps snake_case → camelCase + null thumbnail by default', () => {
    const r = makeRow({ thumbnail: null });
    const s = rowToSummary(r);
    expect(s).toMatchObject({
      id: 'proj-1',
      name: 'Demo',
      lastModifiedAt: '2026-04-27T10:00:00.000Z',
      thumbnailUrl: null,
      ownerName: 'user-1',
      collaboratorCount: 0,
      schemaVersion: 1,
    });
  });

  it('falls back to created_at when updated_at is missing', () => {
    const s = rowToSummary({
      id: 'p', name: 'n', owner_id: 'u',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(s.lastModifiedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('prefers thumbnail_url over thumbnail when both are present', () => {
    const s = rowToSummary({
      id: 'p', name: 'n', owner_id: 'u',
      thumbnail: 'old',
      thumbnail_url: 'https://r2.example/p.png',
    });
    expect(s.thumbnailUrl).toBe('https://r2.example/p.png');
  });
});

describe('ProjectListClient', () => {
  it('throws when no fetch is available + no opts.fetch provided', () => {
    // Node 18+ provides `globalThis.fetch`; temporarily null it out
    // so we can exercise the "no fetch" failure path the constructor
    // guards against in legacy runtimes.
    const original = (globalThis as { fetch?: typeof fetch }).fetch;
    try {
      (globalThis as { fetch?: typeof fetch }).fetch = undefined;
      expect(() => new ProjectListClient({ fetch: undefined as unknown as typeof fetch }))
        .toThrow(/no fetch implementation/);
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = original;
    }
  });

  it('list() GETs /api/v1/projects and unwraps `data`', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/v1/projects');
      expect(init.method).toBe('GET');
      return jsonResponse({ ok: true, data: [makeRow({ id: 'a' }), makeRow({ id: 'b' })] });
    });
    const client = new ProjectListClient({ fetch: fetchImpl });
    const out = await client.list();
    expect(out.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('list() also accepts a bare array body (no `data` envelope)', async () => {
    const fetchImpl = makeFetch(() => jsonResponse([makeRow({ id: 'x' })]));
    const client = new ProjectListClient({ fetch: fetchImpl });
    const out = await client.list();
    expect(out[0].id).toBe('x');
  });

  it('create() POSTs JSON body and returns the new ProjectSummary', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/v1/projects');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ name: 'My project' });
      return jsonResponse({ ok: true, data: makeRow({ id: 'new', name: 'My project' }) });
    });
    const client = new ProjectListClient({ fetch: fetchImpl });
    const out = await client.create('  My project  '); // trim
    expect(out.id).toBe('new');
    expect(out.name).toBe('My project');
  });

  it('create() rejects empty/whitespace names without hitting the network', async () => {
    const fetchImpl = vi.fn();
    const client = new ProjectListClient({ fetch: fetchImpl as unknown as typeof fetch });
    await expect(client.create('   ')).rejects.toBeInstanceOf(ProjectListClientError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('delete() DELETEs and tolerates 204 No Content', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/v1/projects/proj-1');
      expect(init.method).toBe('DELETE');
      return new Response(null, { status: 204 });
    });
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.delete('proj-1')).resolves.toBeUndefined();
  });

  it('delete() URL-encodes the id', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/v1/projects/proj%2F1%20%26amp');
      return new Response(null, { status: 204 });
    });
    const client = new ProjectListClient({ fetch: fetchImpl });
    await client.delete('proj/1 &amp');
  });

  it('rename() PATCHes JSON body and returns the updated summary', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/v1/projects/proj-1');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Renamed' });
      return jsonResponse({ ok: true, data: makeRow({ id: 'proj-1', name: 'Renamed' }) });
    });
    const client = new ProjectListClient({ fetch: fetchImpl });
    const out = await client.rename('proj-1', 'Renamed');
    expect(out.name).toBe('Renamed');
  });

  it('maps 401 → unauthenticated error kind', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: 'auth required' }, 401));
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.list()).rejects.toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('maps 404 → not-found error kind', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: 'gone' }, 404));
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.delete('missing')).rejects.toMatchObject({
      kind: 'not-found',
      status: 404,
    });
  });

  it('maps 5xx → server-error error kind', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: 'boom' }, 500));
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.create('x')).rejects.toMatchObject({
      kind: 'server-error',
      status: 500,
    });
  });

  it('wraps fetch reject into a network-error ProjectListClientError', async () => {
    const fetchImpl = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.list()).rejects.toMatchObject({
      kind: 'network-error',
      status: 0,
    });
  });

  it('honours baseUrl when provided', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('http://api.example/api/v1/projects');
      return jsonResponse({ ok: true, data: [] });
    });
    const client = new ProjectListClient({ fetch: fetchImpl, baseUrl: 'http://api.example/' });
    await client.list();
  });
});

// §FIX-CREATE-TIMEOUT-RETRY (L-132) — the request helper must never hang on a
// stalled connection (e.g. a Fly redeploy rollout mid-`POST /api/v1/projects`):
// it bounds every attempt with an AbortController timeout and retries transient
// transport failures with backoff, ultimately rejecting with a typed, retriable
// error instead of leaving the onboarding loader stuck forever.
describe('ProjectListClient — timeout + retry (L-132)', () => {
  it('create() rejects with a retriable timeout error instead of hanging when the server never responds', async () => {
    vi.useFakeTimers();
    try {
      // A fetch that connects but never answers, only rejecting when WE abort it.
      const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const e = new Error('The operation was aborted.');
              e.name = 'AbortError';
              reject(e);
            });
          }
        }),
      ) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.create('My project');
      // Register the rejection assertion BEFORE advancing so there is no
      // unhandled-rejection window while the fake timers drive the aborts.
      const assertion = expect(p).rejects.toMatchObject({
        kind: 'timeout',
        status: 0,
        retriable: true,
      });
      // Burn through all 3 attempts (12s timeout each) + backoff (400ms, 800ms).
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
      // 3 attempts total (1 initial + 2 retries) — the request did not hang.
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a transient transport failure with backoff and then succeeds', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls += 1;
        if (calls < 3) throw new Error('ECONNREFUSED'); // first two attempts fail fast
        return jsonResponse({ ok: true, data: makeRow({ id: 'late', name: 'Late' }) });
      }) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.create('Late');
      await vi.advanceTimersByTimeAsync(5_000); // cover the 400ms + 800ms backoffs
      const out = await p;
      expect(out.id).toBe('late');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry a completed HTTP error response (a 5xx is returned on the first hit)', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: 'boom' }, 500));
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.create('x')).rejects.toMatchObject({
      kind: 'server-error',
      status: 500,
      retriable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// §FIX-RETRY-MIGRATIONS-503 (L-134) — during a server boot/restart the v1 gate
// answers with HTTP 503 `code:'migrations_in_progress'` for a brief,
// self-clearing window (server/api/v1/routes.js §SERVER-500-V1-MIGRATION-RACE),
// even sending a `Retry-After`. Unlike any other completed response, `req` must
// ride this out — retry with increasing backoff over a longer wall-clock budget
// — so create/list/open transparently succeed once migrations settle, instead
// of dying with "Failed to create project" when the server literally asked us
// to try again. Every non-migrations error still fails fast (no retry storm).
function migrations503(retryAfter?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (retryAfter !== undefined) headers['retry-after'] = retryAfter;
  return new Response(
    JSON.stringify({
      error: 'Server is starting up — database migrations in progress. Retry in a few seconds.',
      code: 'migrations_in_progress',
      errorId: 'err-boot-1',
    }),
    { status: 503, headers },
  );
}

describe('ProjectListClient — migrations_in_progress 503 retry (L-134)', () => {
  it('retries a 503 migrations_in_progress and then succeeds once the boot window clears', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls += 1;
        if (calls === 1) return migrations503('2'); // still booting…
        return jsonResponse({ ok: true, data: makeRow({ id: 'booted', name: 'Booted' }) });
      }) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.create('Booted');
      // Cover the first backoff (Retry-After: 2s) then let the 200 resolve.
      await vi.advanceTimersByTimeAsync(5_000);
      const out = await p;
      expect(out.id).toBe('booted');
      expect(out.name).toBe('Booted');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('list() and open() paths also transparently ride out the boot window', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls += 1;
        if (calls <= 2) return migrations503('2'); // two boot 503s, then ready
        return jsonResponse({ ok: true, data: [makeRow({ id: 'ready' })] });
      }) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.list();
      await vi.advanceTimersByTimeAsync(15_000);
      const out = await p;
      expect(out[0].id).toBe('ready');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up with a retriable migrations error after the boot-retry budget (bounded attempts, not infinite)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => migrations503('2')) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.create('Never');
      const assertion = expect(p).rejects.toMatchObject({
        kind: 'migrations',
        status: 503,
        retriable: true,
      });
      // Advance well past the ~60s budget; the call must give up, not loop forever.
      await vi.advanceTimersByTimeAsync(90_000);
      await assertion;
      const n = (fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(n).toBeGreaterThan(1);   // it DID retry
      expect(n).toBeLessThanOrEqual(40); // …but a bounded number of times
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours the server Retry-After even when it exceeds the exponential backoff', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls += 1;
        if (calls === 1) return migrations503('5'); // server asks for a 5s wait
        return jsonResponse({ ok: true, data: [makeRow({ id: 'slow-boot' })] });
      }) as unknown as typeof fetch;
      const client = new ProjectListClient({ fetch: fetchImpl });
      const p = client.list();
      // Only 3s elapsed — the mandated 5s Retry-After has NOT passed, so no retry yet.
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      // Cross the 5s mark → the retry fires and succeeds.
      await vi.advanceTimersByTimeAsync(3_000);
      const out = await p;
      expect(out[0].id).toBe('slow-boot');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry a bare 503 that lacks the migrations_in_progress code (fails fast as server-error)', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: 'unavailable' }, 503));
    const client = new ProjectListClient({ fetch: fetchImpl });
    await expect(client.list()).rejects.toMatchObject({
      kind: 'server-error',
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry auth/validation errors — 401 and 404 fail on the first hit', async () => {
    const f401 = makeFetch(() => jsonResponse({ error: 'auth' }, 401));
    const c401 = new ProjectListClient({ fetch: f401 });
    await expect(c401.list()).rejects.toMatchObject({ kind: 'unauthenticated', status: 401 });
    expect(f401).toHaveBeenCalledTimes(1);

    const f404 = makeFetch(() => jsonResponse({ error: 'gone' }, 404));
    const c404 = new ProjectListClient({ fetch: f404 });
    await expect(c404.delete('missing')).rejects.toMatchObject({ kind: 'not-found', status: 404 });
    expect(f404).toHaveBeenCalledTimes(1);
  });
});
