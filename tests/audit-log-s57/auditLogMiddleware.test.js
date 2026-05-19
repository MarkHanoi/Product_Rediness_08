/**
 * Audit log middleware unit tests (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S57 + ADR-028 Part G.
 * Mocks the pg pool — no live DB required.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildAuditRow,
  writeAuditRow,
  createAuditLogMiddleware,
  querySoc2Evidence,
} from '../../server/auditLogMiddleware.js';

function makePool(impl = async () => ({ rows: [] })) {
  return { query: vi.fn(impl) };
}

describe('buildAuditRow', () => {
  it('returns the canonical shape for a valid row', () => {
    const row = buildAuditRow({
      actor: { id: 'user-1', kind: 'user' },
      workspaceId: 'ws-1',
      projectId: 'p-1',
      action: 'project.create',
      resource: { kind: 'project', id: 'p-1' },
      outcome: 'ok',
      permissionUsed: 'project:write',
      traceId: 'trace-x',
      metadata: { foo: 1 },
    });
    expect(row).toEqual({
      actor_id: 'user-1',
      actor_kind: 'user',
      workspace_id: 'ws-1',
      project_id: 'p-1',
      action: 'project.create',
      resource_kind: 'project',
      resource_id: 'p-1',
      outcome: 'ok',
      permission_used: 'project:write',
      trace_id: 'trace-x',
      metadata: { foo: 1 },
    });
  });

  it('rejects bad actor kind', () => {
    expect(() => buildAuditRow({
      actor: { id: 'x', kind: 'admin' },
      workspaceId: 'ws-1',
      action: 'a',
      resource: { kind: 'r' },
      outcome: 'ok',
    })).toThrow(/actor.kind/);
  });

  it('rejects bad outcome', () => {
    expect(() => buildAuditRow({
      actor: { id: 'x', kind: 'user' },
      workspaceId: 'ws-1',
      action: 'a',
      resource: { kind: 'r' },
      outcome: 'pending',
    })).toThrow(/outcome/);
  });

  it('rejects missing workspaceId', () => {
    expect(() => buildAuditRow({
      actor: { id: 'x', kind: 'user' },
      action: 'a',
      resource: { kind: 'r' },
      outcome: 'ok',
    })).toThrow(/workspaceId/);
  });
});

describe('writeAuditRow', () => {
  it('inserts via pool.query and returns true on success', async () => {
    const pool = makePool(async () => ({ rows: [] }));
    const ok = await writeAuditRow(pool, {
      actor_id: 'u', actor_kind: 'user', workspace_id: 'w',
      project_id: null, action: 'a', resource_kind: 'r', resource_id: null,
      outcome: 'ok', permission_used: null, trace_id: null, metadata: { x: 1 },
    });
    expect(ok).toBe(true);
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_log/);
    expect(params).toHaveLength(11);
    expect(params[10]).toBe(JSON.stringify({ x: 1 }));
  });

  it('returns false on DB error and never throws', async () => {
    const pool = makePool(async () => { throw new Error('boom'); });
    const ok = await writeAuditRow(pool, {
      actor_id: 'u', actor_kind: 'user', workspace_id: 'w',
      project_id: null, action: 'a', resource_kind: 'r', resource_id: null,
      outcome: 'error', permission_used: null, trace_id: null, metadata: null,
    });
    expect(ok).toBe(false);
  });

  it('returns false when pool is null (in-memory mode)', async () => {
    const ok = await writeAuditRow(null, {
      actor_id: 'u', actor_kind: 'user', workspace_id: 'w',
      project_id: null, action: 'a', resource_kind: 'r', resource_id: null,
      outcome: 'ok', permission_used: null, trace_id: null, metadata: null,
    });
    expect(ok).toBe(false);
  });
});

describe('createAuditLogMiddleware', () => {
  function fakeReqRes() {
    const req = {
      method: 'POST', path: '/v1/projects', headers: {}, params: {}, body: { projectId: 'p-1' },
      user: { id: 'u-1', workspaceId: 'ws-1' },
    };
    let endCb = null;
    const res = {
      statusCode: 201,
      end: function (...args) { endCb && endCb(...args); },
    };
    res._setEnd = (cb) => { endCb = cb; };
    return { req, res };
  }

  it('writes one row after res.end with outcome=ok for 2xx', async () => {
    const pool = makePool();
    const mw = createAuditLogMiddleware({ pool });
    const { req, res } = fakeReqRes();
    res._setEnd(() => {});
    res.statusCode = 200;

    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);

    res.end();
    await new Promise((r) => setImmediate(r));
    expect(pool.query).toHaveBeenCalledOnce();
    const [, params] = pool.query.mock.calls[0];
    expect(params[7]).toBe('ok');
  });

  it('records outcome=denied for 401/403', async () => {
    const pool = makePool();
    const mw = createAuditLogMiddleware({ pool });
    const { req, res } = fakeReqRes();
    res._setEnd(() => {});
    res.statusCode = 403;
    mw(req, res, () => {});
    res.end();
    await new Promise((r) => setImmediate(r));
    expect(pool.query.mock.calls[0][1][7]).toBe('denied');
  });

  it('records outcome=error for 5xx', async () => {
    const pool = makePool();
    const mw = createAuditLogMiddleware({ pool });
    const { req, res } = fakeReqRes();
    res._setEnd(() => {});
    res.statusCode = 500;
    mw(req, res, () => {});
    res.end();
    await new Promise((r) => setImmediate(r));
    expect(pool.query.mock.calls[0][1][7]).toBe('error');
  });

  it('honours skip()', async () => {
    const pool = makePool();
    const mw = createAuditLogMiddleware({ pool, skip: () => true });
    const { req, res } = fakeReqRes();
    res._setEnd(() => {});
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    res.end();
    await new Promise((r) => setImmediate(r));
    expect(nextCalled).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('still calls original res.end (does not break response delivery)', async () => {
    const pool = makePool();
    const mw = createAuditLogMiddleware({ pool });
    const { req, res } = fakeReqRes();
    let endArgs = null;
    res._setEnd((...args) => { endArgs = args; });
    mw(req, res, () => {});
    res.end('payload');
    await new Promise((r) => setImmediate(r));
    expect(endArgs).toEqual(['payload']);
  });
});

describe('querySoc2Evidence', () => {
  it('issues a grouped count query and returns the rows', async () => {
    const expectedRows = [{ action: 'project.create', outcome: 'ok', count: 5 }];
    const pool = makePool(async () => ({ rows: expectedRows }));
    const out = await querySoc2Evidence(pool, {
      workspaceId: 'ws-1',
      sinceIso: '2026-01-01T00:00:00Z',
      untilIso: '2026-04-01T00:00:00Z',
    });
    expect(out).toEqual(expectedRows);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY action, outcome/);
    expect(params).toEqual(['ws-1', '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z']);
  });

  it('returns [] when pool is null', async () => {
    const rows = await querySoc2Evidence(null, { workspaceId: 'w', sinceIso: 'a', untilIso: 'b' });
    expect(rows).toEqual([]);
  });
});
