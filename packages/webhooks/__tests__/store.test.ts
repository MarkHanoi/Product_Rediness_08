import { describe, it, expect } from 'vitest';
import {
  InMemoryWebhookStore,
  InvalidSubscriptionError,
  SubscriptionNotFoundError,
} from '../src/index.js';

function fixedClock(t = 1700000000000): () => number {
  let n = t;
  return () => n++;
}

describe('InMemoryWebhookStore — create()', () => {
  it('creates a subscription with server-assigned id + secret + createdAt', () => {
    const store = new InMemoryWebhookStore({
      clock: fixedClock(1700000000000),
      idFactory: () => 'wh_TEST',
      secretFactory: () => 'a'.repeat(32),
    });
    const sub = store.create({
      workspaceId: 'ws-1',
      createdBy: 'u-admin',
      body: {
        url: 'https://example.com/hook',
        events: ['project.created', 'project.deleted'],
      },
    });
    expect(sub.id).toBe('wh_TEST');
    expect(sub.secret.length).toBeGreaterThanOrEqual(16);
    expect(sub.workspaceId).toBe('ws-1');
    expect(sub.createdBy).toBe('u-admin');
    expect(sub.createdAt).toBe(1700000000000);
    expect(sub.active).toBe(true);
    expect(sub.lastDeliveryStatus).toBe('never');
  });

  it('rejects invalid url with InvalidSubscriptionError', () => {
    const store = new InMemoryWebhookStore();
    expect(() =>
      store.create({
        workspaceId: 'ws-1',
        createdBy: 'u-admin',
        body: { url: 'not-a-url', events: ['project.created'] },
      }),
    ).toThrow(InvalidSubscriptionError);
  });

  it('rejects empty events array', () => {
    const store = new InMemoryWebhookStore();
    expect(() =>
      store.create({
        workspaceId: 'ws-1',
        createdBy: 'u-admin',
        body: { url: 'https://x.com/h', events: [] },
      }),
    ).toThrow(InvalidSubscriptionError);
  });

  it('rejects unknown event names', () => {
    const store = new InMemoryWebhookStore();
    expect(() =>
      store.create({
        workspaceId: 'ws-1',
        createdBy: 'u-admin',
        body: { url: 'https://x.com/h', events: ['typo.event'] },
      }),
    ).toThrow(InvalidSubscriptionError);
  });
});

describe('InMemoryWebhookStore — list/get/delete', () => {
  it('list() returns subscriptions sorted by createdAt', () => {
    const clock = fixedClock(1000);
    let n = 0;
    const store = new InMemoryWebhookStore({
      clock,
      idFactory: () => `wh_${++n}`,
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    store.create({
      workspaceId: 'ws-2',
      createdBy: 'u',
      body: { url: 'https://b.com/h', events: ['project.deleted'] },
    });
    const all = store.list();
    expect(all.map((s) => s.id)).toEqual(['wh_1', 'wh_2']);
  });

  it('list({workspaceId}) filters', () => {
    const store = new InMemoryWebhookStore({
      idFactory: (() => { let n = 0; return () => `wh_${++n}`; })(),
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    store.create({
      workspaceId: 'ws-2',
      createdBy: 'u',
      body: { url: 'https://b.com/h', events: ['project.created'] },
    });
    expect(store.list({ workspaceId: 'ws-1' })).toHaveLength(1);
    expect(store.list({ workspaceId: 'ws-2' })).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
  });

  it('delete() returns true on hit, false on miss', () => {
    const store = new InMemoryWebhookStore({
      idFactory: () => 'wh_X',
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    expect(store.delete('wh_X')).toBe(true);
    expect(store.delete('wh_X')).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('setActive() throws when subscription is missing', () => {
    const store = new InMemoryWebhookStore();
    expect(() => store.setActive('wh_missing', false)).toThrow(SubscriptionNotFoundError);
  });

  it('setActive(false) flips active flag', () => {
    const store = new InMemoryWebhookStore({
      idFactory: () => 'wh_A',
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    const flipped = store.setActive('wh_A', false);
    expect(flipped.active).toBe(false);
    expect(store.get('wh_A')?.active).toBe(false);
  });
});

describe('InMemoryWebhookStore — matching()', () => {
  it('returns active subscriptions in workspace that subscribe to event', () => {
    let n = 0;
    const store = new InMemoryWebhookStore({
      idFactory: () => `wh_${++n}`,
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://b.com/h', events: ['project.deleted'] },
    });
    store.create({
      workspaceId: 'ws-2',
      createdBy: 'u',
      body: { url: 'https://c.com/h', events: ['project.created'] },
    });
    const matched = store.matching('ws-1', 'project.created');
    expect(matched).toHaveLength(1);
    expect(matched[0]!.url).toBe('https://a.com/h');
  });

  it('skips inactive subscriptions', () => {
    const store = new InMemoryWebhookStore({
      idFactory: () => 'wh_A',
      secretFactory: () => 'x'.repeat(32),
    });
    store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    store.setActive('wh_A', false);
    expect(store.matching('ws-1', 'project.created')).toHaveLength(0);
  });
});

describe('InMemoryWebhookStore — recordDelivery()', () => {
  it('updates lastDeliveryAt + lastDeliveryStatus', () => {
    const store = new InMemoryWebhookStore({
      idFactory: () => 'wh_X',
      secretFactory: () => 'x'.repeat(32),
    });
    const sub = store.create({
      workspaceId: 'ws-1',
      createdBy: 'u',
      body: { url: 'https://a.com/h', events: ['project.created'] },
    });
    store.recordDelivery(sub.id, 'ok', 1700000000000);
    const got = store.get(sub.id)!;
    expect(got.lastDeliveryAt).toBe(1700000000000);
    expect(got.lastDeliveryStatus).toBe('ok');
  });

  it('is a no-op for unknown id (does not throw)', () => {
    const store = new InMemoryWebhookStore();
    expect(() => store.recordDelivery('wh_missing', 'ok', 1)).not.toThrow();
  });
});
