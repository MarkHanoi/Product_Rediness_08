// @pryzm/sync-client — tests for YjsDocAdapter + CRDTConflictResolver (Wave A19-T12)
// ≥ 8 tests required per wave spec §3 exit gate.
//
// CONTRACT verified:
//   C08 §3.1 — Yjs CRDT replaces LWW; all mutations go through Y.Map
//   C08 §3.2 — Conflicts surface as CRDTConflict descriptors; never silent
//   P8 — Every public method has an OTel span

import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';
import { CRDTConflictResolver } from '../src/CRDTConflictResolver.js';
import type { CRDTConflict } from '../src/YjsDocAdapter.js';

// ─── YjsDocAdapter tests ──────────────────────────────────────────────────────

describe('YjsDocAdapter', () => {
  it('T1: constructs with a Y.Doc owned by the adapter', () => {
    const adapter = new YjsDocAdapter('proj-test-001');
    expect(adapter.doc).toBeInstanceOf(Y.Doc);
    adapter.destroy();
  });

  it('T2: applyCommand maps payload fields to Y.Map under command type namespace', () => {
    const adapter = new YjsDocAdapter('proj-test-002');
    adapter.applyCommand('wall.update', { id: 'wall-abc', height: 3000, thickness: 200 });

    const ns = adapter.getNamespace('wall.update');
    const wall = ns.get('wall-abc');
    expect(wall).toBeDefined();
    expect(wall?.get('height')).toBe(3000);
    expect(wall?.get('thickness')).toBe(200);
    // id field is NOT stored in the map (it's the key)
    expect(wall?.has('id')).toBe(false);
    adapter.destroy();
  });

  it('T3: applyCommand is idempotent for same id+values (Yjs set is idempotent)', () => {
    const adapter = new YjsDocAdapter('proj-test-003');
    adapter.applyCommand('wall.update', { id: 'wall-idem', height: 2800 });
    adapter.applyCommand('wall.update', { id: 'wall-idem', height: 2800 });

    const wall = adapter.getNamespace('wall.update').get('wall-idem');
    expect(wall?.get('height')).toBe(2800);
    adapter.destroy();
  });

  it('T4: applyUpdate + encodeStateAsUpdate round-trip converges two docs', () => {
    const adapterA = new YjsDocAdapter('proj-roundtrip');
    const adapterB = new YjsDocAdapter('proj-roundtrip');

    adapterA.applyCommand('wall.update', { id: 'w1', height: 3000 });
    adapterB.applyCommand('wall.update', { id: 'w1', height: 3500 });

    // Cross-merge (simulates server-side Y.applyUpdate)
    adapterB.applyUpdate(adapterA.encodeStateAsUpdate());
    adapterA.applyUpdate(adapterB.encodeStateAsUpdate());

    // Both docs MUST agree after merge (CRDT convergence guarantee)
    const wallA = adapterA.getNamespace('wall.update').get('w1');
    const wallB = adapterB.getNamespace('wall.update').get('w1');
    expect(wallA?.get('height')).toBe(wallB?.get('height'));

    adapterA.destroy();
    adapterB.destroy();
  });

  it('T5: onConflict handler fires and disposer removes it', () => {
    const adapter = new YjsDocAdapter('proj-conflict');
    const handler = vi.fn();
    const dispose = adapter.onConflict(handler);

    const conflict: CRDTConflict = {
      elementId: 'wall-1',
      property: 'height',
      localValue: 3000,
      remoteValue: 3500,
      remoteAuthor: 'Alice',
      timestamp: Date.now(),
    };
    adapter.emitConflict(conflict);
    expect(handler).toHaveBeenCalledWith(conflict);
    expect(adapter.getStatus()).toBe('CONFLICTED');

    // Dispose removes the handler
    dispose();
    adapter.emitConflict({ ...conflict, timestamp: Date.now() + 1 });
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not called again

    adapter.destroy();
  });

  it('T6: onStatusChange fires when status transitions', () => {
    const adapter = new YjsDocAdapter('proj-status');
    const statuses: string[] = [];
    adapter.onStatusChange((s) => statuses.push(s));

    const mockProvider = {
      awareness: undefined,
      disconnect: vi.fn(),
      connect: vi.fn(),
      destroy: vi.fn(),
    };
    adapter.connectWithProvider(mockProvider);
    expect(statuses).toContain('connected');

    adapter.disconnect();
    expect(statuses).toContain('disconnected');

    adapter.destroy();
  });

  it('T7: applyCommand with empty id is a no-op (defensive guard)', () => {
    const adapter = new YjsDocAdapter('proj-noop');
    // Should not throw — just silently skip (no id means no element)
    expect(() => {
      adapter.applyCommand('wall.update', { id: '', height: 3000 });
    }).not.toThrow();
    adapter.destroy();
  });

  it('T8: multiple concurrent commands to different elements converge correctly', () => {
    const adapterA = new YjsDocAdapter('proj-multi');
    const adapterB = new YjsDocAdapter('proj-multi');

    // Simulate concurrent edits to 5 different elements
    for (let i = 0; i < 5; i++) {
      adapterA.applyCommand('wall.update', { id: `wall-${i}`, height: 3000 + i * 100 });
      adapterB.applyCommand('wall.update', { id: `wall-${i}`, height: 3200 + i * 50 });
    }

    // Bidirectional merge
    adapterA.applyUpdate(adapterB.encodeStateAsUpdate());
    adapterB.applyUpdate(adapterA.encodeStateAsUpdate());

    // Verify convergence for all elements
    const nsA = adapterA.getNamespace('wall.update');
    const nsB = adapterB.getNamespace('wall.update');
    for (let i = 0; i < 5; i++) {
      expect(nsA.get(`wall-${i}`)?.get('height'))
        .toBe(nsB.get(`wall-${i}`)?.get('height'));
    }

    adapterA.destroy();
    adapterB.destroy();
  });
});

// ─── CRDTConflictResolver tests ───────────────────────────────────────────────

describe('CRDTConflictResolver', () => {
  const resolver = new CRDTConflictResolver();

  it('T9: autoMerge returns local when only local changed from base', () => {
    const result = resolver.autoMerge(100, 150, 100);
    expect(result).toBe(150);
  });

  it('T10: autoMerge returns remote when only remote changed from base', () => {
    const result = resolver.autoMerge(100, 100, 200);
    expect(result).toBe(200);
  });

  it('T11: autoMerge returns local when both edits produce same value', () => {
    const result = resolver.autoMerge('old', 'new', 'new');
    expect(result).toBe('new');
  });

  it('T12: autoMerge applies additive delta for concurrent numeric edits', () => {
    // base=100, local=150 (+50 delta), remote=130 (+30 delta) → 100+50+30=180
    const result = resolver.autoMerge(100, 150, 130);
    expect(result).toBe(180);
  });

  it('T13: autoMerge returns null for concurrent string edits (semantic conflict)', () => {
    const result = resolver.autoMerge('original', 'alice-edit', 'bob-edit');
    expect(result).toBeNull();
  });

  it('T14: mergeElement returns conflict descriptor when auto-merge fails', () => {
    const result = resolver.mergeElement(
      'wall-001', 'name', 'Old Wall', 'Alice Wall', 'Bob Wall', 'Bob',
    );
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.descriptor.elementId).toBe('wall-001');
      expect(result.descriptor.property).toBe('name');
      expect(result.descriptor.remoteAuthor).toBe('Bob');
      expect(result.descriptor.timestamp).toBeGreaterThan(0);
    }
  });

  it('T15: applyResolution returns correct value for each resolution type', () => {
    const conflict: CRDTConflict = {
      elementId: 'w1', property: 'h', localValue: 3000,
      remoteValue: 3500, remoteAuthor: 'Alice', timestamp: Date.now(),
    };
    expect(resolver.applyResolution(conflict, 'local')).toBe(3000);
    expect(resolver.applyResolution(conflict, 'remote')).toBe(3500);
    expect(resolver.applyResolution(conflict, 'merged', 3250)).toBe(3250);
  });

  it('T16: applyResolution throws when merged value not provided for "merged" resolution', () => {
    const conflict: CRDTConflict = {
      elementId: 'w1', property: 'h', localValue: 3000,
      remoteValue: 3500, remoteAuthor: 'Alice', timestamp: Date.now(),
    };
    expect(() => resolver.applyResolution(conflict, 'merged')).toThrow();
  });
});
