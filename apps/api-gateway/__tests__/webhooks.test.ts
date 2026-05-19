import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startRig, authHeaders, type TestRig } from './helpers.js';
import {
  PRYZM_SIGNATURE_HEADER,
  WEBHOOK_EVENT_NAMES,
  type FetchLike,
} from '@pryzm/webhooks';

const ADMIN_HEADERS = {
  ...authHeaders({
    subject: 'u-admin',
    scopes: ['project:read', 'project:write'],
    roles: ['admin'],
  }),
  'x-test-workspace': 'ws-1',
  'content-type': 'application/json',
};

const READER_HEADERS = {
  ...authHeaders({
    subject: 'u-reader',
    scopes: ['project:read'],
    roles: ['viewer'],
  }),
  'x-test-workspace': 'ws-1',
  'content-type': 'application/json',
};

let rig: TestRig;

afterEach(async () => {
  if (rig) await rig.close();
});

describe('GET /v1/admin/webhooks/events', () => {
  beforeEach(async () => { rig = await startRig(); });

  it('returns the closed event-name catalogue', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/events`, {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual(WEBHOOK_EVENT_NAMES);
  });

  it('rejects non-admin role with 403', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/events`, {
      headers: READER_HEADERS,
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /v1/admin/webhooks (create)', () => {
  beforeEach(async () => { rig = await startRig(); });

  it('creates a subscription and returns secret EXACTLY ONCE', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['project.created', 'ai.workflow.completed'],
        description: 'demo subscriber',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^wh_test_/);
    expect(body.secret).toBe('k'.repeat(32));
    expect(body.workspaceId).toBe('ws-1');
    expect(body.active).toBe(true);
    expect(body.events).toEqual(['project.created', 'ai.workflow.completed']);
    expect(body.createdBy).toBe('u-admin');

    // Subsequent GET redacts the secret.
    const got = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${body.id}`, {
      headers: ADMIN_HEADERS,
    });
    expect(got.status).toBe(200);
    const view = await got.json();
    expect(view.secret).toBe('__redacted__');
  });

  it('rejects invalid url with 400', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ url: 'not-a-url', events: ['project.created'] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_body');
  });

  it('rejects unknown event name with 400', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        url: 'https://example.com/h',
        events: ['typo.event'],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-admin role with 403', async () => {
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks`, {
      method: 'POST',
      headers: READER_HEADERS,
      body: JSON.stringify({
        url: 'https://example.com/h',
        events: ['project.created'],
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /v1/admin/webhooks (list)', () => {
  beforeEach(async () => { rig = await startRig(); });

  it('returns only subscriptions belonging to the caller workspace', async () => {
    // Seed via store directly so we can stage two workspaces.
    rig.webhookStore.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    rig.webhookStore.create({
      workspaceId: 'ws-other',
      createdBy: 'u-other',
      body: { url: 'https://b.com/h', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks`, {
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.webhooks[0].workspaceId).toBe('ws-1');
    expect(body.webhooks[0].secret).toBe('__redacted__');
  });
});

describe('PUT /v1/admin/webhooks/:id/active', () => {
  beforeEach(async () => { rig = await startRig(); });

  it('flips active flag', async () => {
    const sub = rig.webhookStore.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${sub.id}/active`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
    expect(rig.webhookStore.get(sub.id)?.active).toBe(false);
  });

  it('returns 404 when subscription belongs to another workspace', async () => {
    const sub = rig.webhookStore.create({
      workspaceId: 'ws-other',
      createdBy: 'u-other',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${sub.id}/active`, {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/admin/webhooks/:id', () => {
  beforeEach(async () => { rig = await startRig(); });

  it('removes the subscription', async () => {
    const sub = rig.webhookStore.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${sub.id}`, {
      method: 'DELETE',
      headers: ADMIN_HEADERS,
    });
    expect(res.status).toBe(204);
    expect(rig.webhookStore.get(sub.id)).toBeUndefined();
  });
});

describe('POST /v1/admin/webhooks/:id/test (test fire)', () => {
  it('sends synthetic envelope with HMAC-signed body', async () => {
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
    const fetchImpl: FetchLike = async (url, init) => {
      captured = { url, headers: init.headers, body: init.body };
      return { status: 200, ok: true };
    };
    rig = await startRig({ webhookFetch: fetchImpl, webhookClock: () => 1700000000000 });
    const sub = rig.webhookStore.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: { url: 'https://example.com/hook', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${sub.id}/test`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delivery.status).toBe('ok');
    expect(body.envelope.event).toBe('project.created');
    expect(body.envelope.workspaceId).toBe('ws-1');
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://example.com/hook');
    expect(captured!.headers[PRYZM_SIGNATURE_HEADER]).toMatch(/^t=1700000000,v1=[a-f0-9]+/);
    expect(captured!.headers['pryzm-event']).toBe('project.created');
    expect(captured!.headers['pryzm-attempt']).toBe('1');
  });

  it('returns 502 + delivery=failed when receiver rejects', async () => {
    const fetchImpl: FetchLike = async () => ({ status: 500, ok: false });
    rig = await startRig({ webhookFetch: fetchImpl });
    const sub = rig.webhookStore.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: { url: 'https://example.com/hook', events: ['project.created'] },
    });
    const res = await fetch(`${rig.baseUrl}/v1/admin/webhooks/${sub.id}/test`, {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.delivery.status).toBe('failed');
    expect(body.delivery.httpStatus).toBe(500);
  });
});
