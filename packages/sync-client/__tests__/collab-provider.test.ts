// @pryzm/sync-client — tests for connectCrdtProvider (L-391 Phase 0).
//
// CONTRACT verified:
//   L-391 Phase 0 — the CRDT websocket provider is GATED behind an explicit
//     flag (default OFF). Flag OFF ⇒ no provider constructed (solo/offline
//     behaviour is byte-identical to not wiring at all). Flag ON + URL ⇒ a
//     provider is constructed against the configured URL, registered on the
//     adapter, and the adapter's live Y.Doc receives remote ops.
//   P8 — connectCrdtProvider wraps its work in an OTel span (no-op tracer here).

import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';
import type { YjsProvider } from '../src/YjsDocAdapter.js';
import {
  connectCrdtProvider,
  type CollabProviderConfig,
  type WebsocketProviderFactory,
  type WebsocketProviderFactoryArgs,
} from '../src/collabProvider.js';

/** A minimal provider that satisfies YjsProvider without a real WebSocket. */
function makeMockProvider(): YjsProvider {
  return {
    awareness: { setLocalState: vi.fn() },
    disconnect: vi.fn(),
    connect: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('connectCrdtProvider (L-391 Phase 0)', () => {
  it('flag OFF → no provider constructed, adapter has no provider (solo path unchanged)', () => {
    const adapter = new YjsDocAdapter('proj-collab-off');
    const factory = vi.fn<WebsocketProviderFactory>(() => makeMockProvider());
    const connectSpy = vi.spyOn(adapter, 'connectWithProvider');

    const config: CollabProviderConfig = { enabled: false, room: 'proj-collab-off', url: 'wss://x' };
    const result = connectCrdtProvider(adapter, config, factory);

    expect(result).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
    // Solo status: never transitioned to 'connected'.
    expect(adapter.getStatus()).toBe('disconnected');
    adapter.destroy();
  });

  it('flag ON but URL missing → no-op (misconfigured degrades to solo)', () => {
    const adapter = new YjsDocAdapter('proj-collab-nourl');
    const factory = vi.fn<WebsocketProviderFactory>(() => makeMockProvider());

    const config: CollabProviderConfig = { enabled: true, room: 'proj-collab-nourl' };
    const result = connectCrdtProvider(adapter, config, factory);

    expect(result).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(adapter.getStatus()).toBe('disconnected');
    adapter.destroy();
  });

  it('flag ON + URL → provider constructed against the configured URL/room and registered', () => {
    const adapter = new YjsDocAdapter('proj-collab-on');
    let seen: WebsocketProviderFactoryArgs | undefined;
    const provider = makeMockProvider();
    const factory: WebsocketProviderFactory = (args) => {
      seen = args;
      return provider;
    };

    const config: CollabProviderConfig = {
      enabled: true,
      url: 'wss://sync.example.test',
      room: 'proj-collab-on',
      authToken: 'tok-123',
    };
    const result = connectCrdtProvider(adapter, config, factory);

    expect(result).toBe(provider);
    expect(seen?.url).toBe('wss://sync.example.test');
    expect(seen?.room).toBe('proj-collab-on');
    expect(seen?.authToken).toBe('tok-123');
    // The factory binds to the adapter's LIVE coordination doc.
    expect(seen?.doc).toBe(adapter.doc);
    // Registration transitions the adapter to 'connected'.
    expect(adapter.getStatus()).toBe('connected');
    adapter.destroy();
  });

  it('flag ON → adapter Y.Doc receives remote ops applied through the wired doc', () => {
    const adapter = new YjsDocAdapter('proj-collab-remote');
    const config: CollabProviderConfig = {
      enabled: true,
      url: 'wss://sync.example.test',
      room: 'proj-collab-remote',
    };
    // The factory receives the live doc — simulate a remote peer by encoding an
    // update from a second doc and applying it to the one handed to the factory
    // (this is exactly what WebsocketProvider does when a remote update arrives).
    const factory: WebsocketProviderFactory = (args) => {
      const remote = new Y.Doc();
      remote.getMap<Y.Map<unknown>>('wall.update').set(
        'w-remote',
        (() => { const m = new Y.Map<unknown>(); m.set('height', 4200); return m; })(),
      );
      Y.applyUpdate(args.doc, Y.encodeStateAsUpdate(remote));
      remote.destroy();
      return makeMockProvider();
    };

    connectCrdtProvider(adapter, config, factory);

    const wall = adapter.getNamespace('wall.update').get('w-remote');
    expect(wall?.get('height')).toBe(4200);
    adapter.destroy();
  });

  it('factory throw is isolated → returns null, never propagates (boot stays alive)', () => {
    const adapter = new YjsDocAdapter('proj-collab-throw');
    const factory: WebsocketProviderFactory = () => {
      throw new Error('transport blew up');
    };
    const config: CollabProviderConfig = {
      enabled: true,
      url: 'wss://sync.example.test',
      room: 'proj-collab-throw',
    };

    let result: YjsProvider | null = makeMockProvider();
    expect(() => {
      result = connectCrdtProvider(adapter, config, factory);
    }).not.toThrow();
    expect(result).toBeNull();
    adapter.destroy();
  });
});
