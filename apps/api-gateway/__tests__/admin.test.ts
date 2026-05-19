import { describe, it, expect, afterEach } from 'vitest';
import { startRig, authHeaders, type TestRig } from './helpers.js';
import type { AiSpendEntry, OverrideRecord } from '@pryzm/admin-overrides';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

function spend(o: Partial<AiSpendEntry> = {}): AiSpendEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2)}`,
    workspaceId: 'ws-acme',
    projectId: 'p-1',
    actorId: 'u-alice',
    actorKind: 'user',
    surface: 'editor',
    workflowId: 'plan.critique',
    model: 'anthropic.claude-sonnet-4',
    ts: Date.UTC(2026, 3, 1, 12, 0, 0),
    costUsd: 0.05,
    ...o,
  } as AiSpendEntry;
}

const adminH = authHeaders({
  subject: 'u-admin',
  scopes: ['project:read', 'project:write'],
  roles: ['admin'],
});

describe('GET /v1/admin/ai-spend', () => {
  it('requires admin role (403 otherwise)', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend`, {
      headers: authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('admin_required');
  });

  it('requires project:read scope (403 otherwise)', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend`, {
      headers: authHeaders({ subject: 'u-admin', roles: ['admin'] }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('insufficient_scope');
  });

  it('returns totals + day-grouped rows by default', async () => {
    rig = await startRig({
      seedSpend: [
        spend({ id: 'a', costUsd: 0.10 }),
        spend({ id: 'b', costUsd: 0.20, ts: Date.UTC(2026, 3, 2) }),
      ],
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend`, { headers: adminH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groupBy).toBe('day');
    expect(body.totals).toMatchObject({ count: 2, totalCostUsd: 0.30 });
    expect(body.rows).toHaveLength(2);
  });

  it('respects ?groupBy=workspace', async () => {
    rig = await startRig({
      seedSpend: [
        spend({ id: 'a', workspaceId: 'ws-1' }),
        spend({ id: 'b', workspaceId: 'ws-2' }),
        spend({ id: 'c', workspaceId: 'ws-1' }),
      ],
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend?groupBy=workspace`, { headers: adminH });
    const body = await res.json();
    expect(body.groupBy).toBe('workspace');
    expect(body.rows).toHaveLength(2);
  });

  it('respects ?workspaceId filter', async () => {
    rig = await startRig({
      seedSpend: [
        spend({ id: 'a', workspaceId: 'ws-1' }),
        spend({ id: 'b', workspaceId: 'ws-2' }),
      ],
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend?workspaceId=ws-1`, { headers: adminH });
    const body = await res.json();
    expect(body.totals.count).toBe(1);
  });

  it('rejects unknown groupBy value with 400', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/ai-spend?groupBy=galactic`, { headers: adminH });
    expect(res.status).toBe(400);
  });
});

function override(o: Partial<OverrideRecord> = {}): OverrideRecord {
  return {
    subjectKind: 'workspace',
    subjectId: 'ws-acme',
    plan: 'enterprise',
    setBy: 'admin@pryzm.com',
    setAt: Date.UTC(2026, 3, 1),
    reason: 'Q2 trial',
    ...o,
  } as OverrideRecord;
}

describe('PUT /v1/admin/overrides/:kind/:id', () => {
  it('upserts a valid override and returns 200', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/ws-acme`, {
      method: 'PUT',
      headers: { ...adminH, 'content-type': 'application/json' },
      body: JSON.stringify({
        plan: 'enterprise',
        setBy: 'admin@pryzm.com',
        setAt: Date.UTC(2026, 3, 1),
        reason: 'trial',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjectKind).toBe('workspace');
    expect(body.subjectId).toBe('ws-acme');
    expect(body.plan).toBe('enterprise');
  });

  it('rejects invalid body (missing reason) with 400', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/ws-acme`, {
      method: 'PUT',
      headers: { ...adminH, 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise', setBy: 'admin@pryzm.com', setAt: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid kind in path with 400', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides/galactic/x`, {
      method: 'PUT',
      headers: { ...adminH, 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise', setBy: 'a', setAt: 1, reason: 'r' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/admin/overrides + /:kind/:id', () => {
  it('lists empty when none', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides`, { headers: adminH });
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.overrides).toEqual([]);
  });

  it('list reflects upserts in stable sorted order', async () => {
    rig = await startRig();
    rig.overrideStore.set(override({ subjectId: 'ws-2' }));
    rig.overrideStore.set(override({ subjectId: 'ws-1' }));
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides`, { headers: adminH });
    const body = await res.json();
    expect(body.overrides.map((o: any) => o.subjectId)).toEqual(['ws-1', 'ws-2']);
  });

  it('GET single returns 404 when missing', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/none`, { headers: adminH });
    expect(res.status).toBe(404);
  });

  it('GET single returns the record when present', async () => {
    rig = await startRig();
    rig.overrideStore.set(override());
    const res = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/ws-acme`, { headers: adminH });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toBe('enterprise');
  });
});

describe('DELETE /v1/admin/overrides/:kind/:id', () => {
  it('204 on success, 404 on missing', async () => {
    rig = await startRig();
    rig.overrideStore.set(override());
    const ok = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/ws-acme`, {
      method: 'DELETE',
      headers: adminH,
    });
    expect(ok.status).toBe(204);
    const miss = await fetch(`${rig.baseUrl}/v1/admin/overrides/workspace/ws-acme`, {
      method: 'DELETE',
      headers: adminH,
    });
    expect(miss.status).toBe(404);
  });
});
