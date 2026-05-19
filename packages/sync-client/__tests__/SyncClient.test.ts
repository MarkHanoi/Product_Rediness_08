// SyncClient — lifecycle + status surface (S43 D1).
//
// These tests use a MockProvider so the suite runs in Node without a real
// WebSocket.  The default y-websocket provider wiring lands at S43 D1's
// transport task (see SyncClient.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  SyncClient,
  type EventLog,
  type SyncCommandBus,
  type ProviderLike,
  type ProviderFactory,
} from '../src/index.js';

// ─── Test doubles ──────────────────────────────────────────────────────────

function makeMockEventLog(): EventLog & { _entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    _entries: entries,
    has: (id) => entries.has(id),
    appendInbound: (id, payload) => { entries.set(id, payload); },
  };
}

function makeMockCommandBus(): SyncCommandBus & {
  _committed: Array<(e: { id: string; type: string; actorId: string; payload: unknown }) => void>;
  _patchOnlyCalls: unknown[];
} {
  const listeners: Array<(e: { id: string; type: string; actorId: string; payload: unknown }) => void> = [];
  const patchOnlyCalls: unknown[] = [];
  return {
    _committed: listeners,
    _patchOnlyCalls: patchOnlyCalls,
    onCommitted: (listener) => {
      listeners.push(listener);
      return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); };
    },
    applyPatchOnly: (payload) => { patchOnlyCalls.push(payload); },
  };
}

function makeMockProvider(): ProviderLike & { _emit: (event: string, payload: unknown) => void } {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    wsconnected: false,
    wsconnecting: false,
    on: (event, fn) => {
      let s = handlers.get(event);
      if (!s) { s = new Set(); handlers.set(event, s); }
      s.add(fn as (p: unknown) => void);
    },
    off: (event, fn) => { handlers.get(event)?.delete(fn as (p: unknown) => void); },
    destroy: () => { handlers.clear(); },
    _emit: (event, payload) => { for (const fn of handlers.get(event) ?? []) fn(payload); },
  };
}

const baseOpts = (overrides: Partial<ConstructorParameters<typeof SyncClient>[0]> = {}) => {
  const provider = makeMockProvider();
  const factory: ProviderFactory = () => provider;
  return {
    opts: {
      projectId: 'PRJ-TEST-01',
      url: 'wss://test.local/projects/PRJ-TEST-01',
      authToken: 'jwt-test-token',
      eventLog: makeMockEventLog(),
      commandBus: makeMockCommandBus(),
      doc: new Y.Doc(),
      providerFactory: factory,
      ...overrides,
    },
    provider,
  };
};

let activeClients: SyncClient[] = [];
afterEach(() => {
  for (const c of activeClients) {
    try { c.dispose(); } catch { /* ignore */ }
  }
  activeClients = [];
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SyncClient — construction', () => {
  it('throws when projectId is missing', () => {
    const { opts } = baseOpts();
    expect(() => new SyncClient({ ...opts, projectId: '' })).toThrow(/projectId is required/);
  });

  it('throws when url is missing', () => {
    const { opts } = baseOpts();
    expect(() => new SyncClient({ ...opts, url: '' })).toThrow(/url is required/);
  });

  it('throws when authToken is missing', () => {
    const { opts } = baseOpts();
    expect(() => new SyncClient({ ...opts, authToken: '' })).toThrow(/authToken is required/);
  });

  it('starts in idle status', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    expect(c.getStatus()).toBe('idle');
  });

  it('does NOT instantiate the provider until connect() is called', () => {
    const factory = vi.fn(() => makeMockProvider());
    const { opts } = baseOpts({ providerFactory: factory });
    const c = new SyncClient({ ...opts, providerFactory: factory });
    activeClients.push(c);
    expect(factory).toHaveBeenCalledTimes(0);
  });

  it('throws if commandBus.applyPatchOnly is missing (S43 hard dependency)', () => {
    const badBus = { onCommitted: () => () => {} } as unknown as SyncCommandBus;
    const { opts } = baseOpts({ commandBus: badBus });
    expect(() => new SyncClient(opts)).toThrow(/applyPatchOnly is missing/);
  });
});

describe('SyncClient — lifecycle', () => {
  it('idle → connecting on connect()', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    c.connect();
    expect(c.getStatus()).toBe('connecting');
  });

  it('connecting → open when provider emits status=connected', () => {
    const { opts, provider } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    c.connect();
    provider._emit('status', { status: 'connected' });
    expect(c.getStatus()).toBe('open');
  });

  it('open → reconnecting when provider emits status=disconnected (not closed by us)', () => {
    const { opts, provider } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    c.connect();
    provider._emit('status', { status: 'connected' });
    provider._emit('status', { status: 'disconnected' });
    expect(c.getStatus()).toBe('reconnecting');
  });

  it('disconnect() → closed', () => {
    const { opts, provider } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    c.connect();
    provider._emit('status', { status: 'connected' });
    c.disconnect();
    expect(c.getStatus()).toBe('closed');
  });

  it('connect() is idempotent (second call does not re-instantiate provider)', () => {
    const factory = vi.fn(() => makeMockProvider());
    const { opts } = baseOpts({ providerFactory: factory });
    const c = new SyncClient({ ...opts, providerFactory: factory });
    activeClients.push(c);
    c.connect();
    c.connect();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('connection-error → error status with reason', () => {
    const { opts, provider } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    let lastReason: string | undefined;
    c.onStatusChanged((_s, reason) => { if (reason) lastReason = reason; });
    c.connect();
    provider._emit('connection-error', new Error('auth failed'));
    expect(c.getStatus()).toBe('error');
    expect(lastReason).toContain('auth failed');
  });
});

describe('SyncClient — status listeners', () => {
  it('fires immediately with current status on subscribe', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    const seen: string[] = [];
    c.onStatusChanged((s) => seen.push(s));
    expect(seen).toEqual(['idle']);
  });

  it('fires on each transition', () => {
    const { opts, provider } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    const seen: string[] = [];
    c.onStatusChanged((s) => seen.push(s));
    c.connect();
    provider._emit('status', { status: 'connected' });
    c.disconnect();
    expect(seen).toEqual(['idle', 'connecting', 'open', 'closed']);
  });

  it('disposer removes the listener', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts); activeClients.push(c);
    const seen: string[] = [];
    const off = c.onStatusChanged((s) => seen.push(s));
    off();
    c.connect();
    expect(seen).toEqual(['idle']);  // only the initial fire-on-subscribe
  });
});

describe('SyncClient — dispose', () => {
  it('dispose() throws on subsequent connect()', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts);
    c.dispose();
    expect(() => c.connect()).toThrow(/disposed/);
  });

  it('dispose() is idempotent', () => {
    const { opts } = baseOpts();
    const c = new SyncClient(opts);
    c.dispose();
    expect(() => c.dispose()).not.toThrow();
  });
});
