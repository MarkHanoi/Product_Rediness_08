import { describe, it, expect, afterEach } from 'vitest';
import { startRig, authHeaders, tinyZipBytes, type TestRig } from './helpers.js';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

describe('GET /v1/projects/:projectId/export.pryzm', () => {
  it('returns the ZIP bytes with correct headers when auth + scope + project present', async () => {
    rig = await startRig();
    const bytes = tinyZipBytes();
    rig.projects.put('p-1', bytes);

    const res = await fetch(`${rig.baseUrl}/v1/projects/p-1/export.pryzm`, {
      headers: authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('etag')).toBeTruthy();
    expect(res.headers.get('content-disposition')).toMatch(/attachment.*p-1\.pryzm/);
    const ab = await res.arrayBuffer();
    expect(new Uint8Array(ab)).toEqual(bytes);
  });

  it('returns 304 when If-None-Match matches the etag', async () => {
    rig = await startRig();
    rig.projects.put('p-cache', tinyZipBytes(), { etag: '"abc123"' });

    const res = await fetch(`${rig.baseUrl}/v1/projects/p-cache/export.pryzm`, {
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
        'if-none-match': '"abc123"',
      },
    });
    expect(res.status).toBe(304);
  });

  it('returns 404 for an unknown project', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/never-existed/export.pryzm`, {
      headers: authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('project_not_found');
  });

  it('returns 400 for an invalid projectId', async () => {
    rig = await startRig();
    // Inject a slash via path encoding — Express treats this as a different route.
    const res = await fetch(`${rig.baseUrl}/v1/projects/bad%20id/export.pryzm`, {
      headers: authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when scope is missing (insufficient_scope)', async () => {
    rig = await startRig();
    rig.projects.put('p-1', tinyZipBytes());
    const res = await fetch(`${rig.baseUrl}/v1/projects/p-1/export.pryzm`, {
      headers: authHeaders({ subject: 'u-1' /* no scopes */ }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('insufficient_scope');
    expect(res.headers.get('www-authenticate')).toMatch(/insufficient_scope/);
  });
});

describe('POST /v1/projects/import', () => {
  it('imports a valid ZIP, returns 201 + Location + project id', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:write'] }),
        'content-type': 'application/zip',
      },
      body: tinyZipBytes(),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/^\/v1\/projects\/imported-/);
    const body = await res.json();
    expect(body.projectId).toMatch(/^imported-/);
    expect(body.name).toMatch(/^Imported project/);
    expect(typeof body.createdAt).toBe('string');
  });

  it('returns 415 when Content-Type is not application/zip', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:write'] }),
        'content-type': 'application/json',
      },
      body: '{"hi":1}',
    });
    expect(res.status).toBe(415);
  });

  it('returns 400 on empty body', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:write'] }),
        'content-type': 'application/zip',
      },
      body: new Uint8Array(0),
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 when the body is not a ZIP archive', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:write'] }),
        'content-type': 'application/zip',
      },
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });
    expect(res.status).toBe(422);
  });

  it('returns 403 without project:write', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
        'content-type': 'application/zip',
      },
      body: tinyZipBytes(),
    });
    expect(res.status).toBe(403);
  });

  it('round-trips: import bytes, then export the new project returns the same bytes', async () => {
    rig = await startRig();
    const original = tinyZipBytes();
    const importRes = await fetch(`${rig.baseUrl}/v1/projects/import`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:write'] }),
        'content-type': 'application/zip',
      },
      body: original,
    });
    expect(importRes.status).toBe(201);
    const { projectId } = await importRes.json();

    const exportRes = await fetch(`${rig.baseUrl}/v1/projects/${projectId}/export.pryzm`, {
      headers: authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
    });
    expect(exportRes.status).toBe(200);
    const ab = await exportRes.arrayBuffer();
    expect(new Uint8Array(ab)).toEqual(original);
  });
});
