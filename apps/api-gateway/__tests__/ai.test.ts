import { describe, it, expect, afterEach } from 'vitest';
import { startRig, authHeaders, type TestRig } from './helpers.js';
import { StubAiInvokePort } from '../src/index.js';

let rig: TestRig | undefined;
afterEach(async () => { await rig?.close(); rig = undefined; });

describe('GET /v1/ai/workflows', () => {
  it('returns the public catalog (no auth required)', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.workflows).toHaveLength(2);
    expect(body.workflows[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      kind: expect.any(String),
      estimatedCostUsd: expect.any(Number),
    });
    // Internal-only fields are NEVER on the wire.
    expect(body.workflows[0]).not.toHaveProperty('impl');
  });
});

describe('GET /v1/ai/workflows/:id', () => {
  it('returns single descriptor', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/plan.critique`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('plan.critique');
  });

  it('returns 404 for unknown workflow', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/no.such.workflow`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id format', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/UPPER%20case`);
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/ai/workflows/:id/invoke', () => {
  it('returns 202 + queued result for valid invocation with ai:invoke scope', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/plan.critique/invoke`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['ai:invoke'] }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId: 'p-1', input: { sheetId: 's-7' } }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({
      runId: expect.any(String),
      workflowId: 'plan.critique',
      status: 'queued',
      estimatedCostUsd: 0.05,
    });
  });

  it('returns 403 without ai:invoke scope', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/plan.critique/invoke`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['project:read'] }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId: 'p-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid body', async () => {
    rig = await startRig();
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/plan.critique/invoke`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['ai:invoke'] }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ /* missing projectId */ }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 when port rejects pre-flight (e.g. budget exceeded)', async () => {
    // Wire a rig whose AI port returns `status: rejected` for any submit.
    // We can't do this through the standard helper, so build the gateway
    // directly here.
    const { createApiGatewayApp, InMemoryProjectStore, InMemoryWsEventBus } =
      await import('../src/index.js');
    const { InMemoryAiSpendStore } = await import('@pryzm/ai-spend');
    const { InMemoryOverrideStore } = await import('@pryzm/admin-overrides');
    const { buildCatalogWithBuiltins } = await import('@pryzm/formula-library');
    const { createServer } = await import('node:http');

    const projects = new InMemoryProjectStore();
    const wsBus = new InMemoryWsEventBus();
    const aiPort = new StubAiInvokePort({
      workflows: [{ id: 'plan.critique', title: 'PC', kind: 'pc', estimatedCostUsd: 0.05 }],
      submit: async (req) => ({
        runId: 'rej-1',
        workflowId: req.workflowId,
        status: 'rejected',
        estimatedCostUsd: 0.05,
        reason: 'daily budget exceeded',
      }),
    });
    const formulaCatalog = buildCatalogWithBuiltins();
    formulaCatalog.freeze();
    const { app } = createApiGatewayApp({
      exportPort: projects,
      importPort: projects,
      aiPort,
      spendStore: new InMemoryAiSpendStore(),
      overrideStore: new InMemoryOverrideStore(),
      formulaCatalog,
      wsBus,
    });
    const server = createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/v1/ai/workflows/plan.critique/invoke`, {
        method: 'POST',
        headers: {
          ...authHeaders({ subject: 'u-1', scopes: ['ai:invoke'] }),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectId: 'p-1' }),
      });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body).toMatchObject({
        error: 'workflow_rejected',
        reason: 'daily budget exceeded',
      });
    } finally {
      await new Promise<void>((r, e) => server.close((err) => (err ? e(err) : r())));
    }
  });

  it('returns 422 when targeting a workflow that the port does not know', async () => {
    rig = await startRig({ workflows: [] }); // empty registry
    const res = await fetch(`${rig.baseUrl}/v1/ai/workflows/plan.critique/invoke`, {
      method: 'POST',
      headers: {
        ...authHeaders({ subject: 'u-1', scopes: ['ai:invoke'] }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId: 'p-1' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.reason).toBe('workflow not registered');
  });
});
