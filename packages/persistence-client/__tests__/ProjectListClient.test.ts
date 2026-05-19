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
