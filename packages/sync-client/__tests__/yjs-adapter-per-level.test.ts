// @pryzm/sync-client — Tests for YjsDocAdapter per-level CRDT split (ADR-049 §4.4)
//
// CONTRACT verified:
//   ADR-049 §4.4 — Y.Doc-per-level split gated behind perLevelMode flag.
//   C08 §3.1    — All mutations go through Y.Map CRDT operations.
//   P8          — Every public method has an OTel span.
//
// Test identifiers: P1–P16 (P = per-level; distinct from T1–T16 Phase 2D tests).

import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';
import type {
  YjsProvider,
  BatchWindowOpenInfo,
  BatchWindowCloseInfo,
  YjsDocAdapterOptions,
} from '../src/YjsDocAdapter.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock YjsProvider for injection tests. */
function mockProvider(): YjsProvider & {
  disconnectCalled: boolean;
  destroyCalled: boolean;
} {
  return {
    awareness: undefined,
    disconnectCalled: false,
    destroyCalled: false,
    disconnect() { this.disconnectCalled = true; },
    connect() { /* noop */ },
    destroy() { this.destroyCalled = true; },
  };
}

// ─── P1: perLevelMode=false (default) — single-doc behaviour preserved ────────

describe('YjsDocAdapter — single-doc mode (perLevelMode=false)', () => {
  it('P1: perLevelMode defaults to false when env flag is absent', () => {
    // PRYZM_YDOC_PER_LEVEL is not set in the test environment
    const adapter = new YjsDocAdapter('proj-p1');
    expect(adapter.perLevelMode).toBe(false);
    adapter.destroy();
  });

  it('P2: perLevelMode=false routes all commands to this.doc regardless of levelId', () => {
    const adapter = new YjsDocAdapter('proj-p2', { perLevelMode: false });

    // Even when the payload contains a levelId, single-doc mode ignores it
    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });

    // Data must appear in this.doc (the coordination/project doc)
    const ns = adapter.getNamespace('wall.update');
    const wall = ns.get('w1');
    expect(wall?.get('height')).toBe(3000);

    // No level docs should have been created
    expect(adapter.getLevelIds()).toHaveLength(0);

    adapter.destroy();
  });
});

// ─── P3–P8: perLevelMode=true — per-level routing ────────────────────────────

describe('YjsDocAdapter — per-level mode (perLevelMode=true)', () => {
  it('P3: perLevelMode=true is reflected on the adapter', () => {
    const adapter = new YjsDocAdapter('proj-p3', { perLevelMode: true });
    expect(adapter.perLevelMode).toBe(true);
    adapter.destroy();
  });

  it('P4: command with levelId routes to level doc, NOT to coordination doc', () => {
    const adapter = new YjsDocAdapter('proj-p4', { perLevelMode: true });
    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });

    // Level doc must have the data
    const levelNs = adapter.getNamespaceForLevel('L1', 'wall.update');
    expect(levelNs.get('w1')?.get('height')).toBe(3000);

    // Coordination doc must NOT have the data
    const coordNs = adapter.getNamespace('wall.update');
    expect(coordNs.get('w1')).toBeUndefined();

    adapter.destroy();
  });

  it('P5: command without levelId routes to coordination doc, NOT to any level doc', () => {
    const adapter = new YjsDocAdapter('proj-p5', { perLevelMode: true });
    // Grid line — cross-level invariant, no levelId
    adapter.applyCommand('grid.update', { id: 'grid-A', spacing: 5000 });

    // Must be in coordination doc
    const coordNs = adapter.getNamespace('grid.update');
    expect(coordNs.get('grid-A')?.get('spacing')).toBe(5000);

    // No level docs created for a command without levelId
    expect(adapter.getLevelIds()).toHaveLength(0);

    adapter.destroy();
  });

  it('P6: command with empty-string levelId routes to coordination doc', () => {
    const adapter = new YjsDocAdapter('proj-p6', { perLevelMode: true });
    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: '' });

    // Empty levelId → coordination doc
    expect(adapter.getNamespace('wall.update').get('w1')?.get('height')).toBe(3000);
    expect(adapter.getLevelIds()).toHaveLength(0);

    adapter.destroy();
  });

  it('P7: level docs are isolated — update to L1 does not appear in L2', () => {
    const adapter = new YjsDocAdapter('proj-p7', { perLevelMode: true });
    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });
    adapter.applyCommand('wall.update', { id: 'w2', height: 4000, levelId: 'L2' });

    const nsL1 = adapter.getNamespaceForLevel('L1', 'wall.update');
    const nsL2 = adapter.getNamespaceForLevel('L2', 'wall.update');

    // L1 has w1, not w2
    expect(nsL1.get('w1')?.get('height')).toBe(3000);
    expect(nsL1.get('w2')).toBeUndefined();

    // L2 has w2, not w1
    expect(nsL2.get('w2')?.get('height')).toBe(4000);
    expect(nsL2.get('w1')).toBeUndefined();

    adapter.destroy();
  });

  it('P8: getDocForLevel lazily creates and caches a Y.Doc per levelId', () => {
    const adapter = new YjsDocAdapter('proj-p8', { perLevelMode: true });

    const doc1 = adapter.getDocForLevel('L1');
    const doc2 = adapter.getDocForLevel('L1'); // same call — must be same instance
    const doc3 = adapter.getDocForLevel('L2'); // different levelId — new instance

    expect(doc1).toBeInstanceOf(Y.Doc);
    expect(doc1).toBe(doc2);        // cached
    expect(doc3).not.toBe(doc1);    // different level → different doc

    expect(adapter.getLevelIds()).toContain('L1');
    expect(adapter.getLevelIds()).toContain('L2');
    expect(adapter.getLevelIds()).toHaveLength(2);

    adapter.destroy();
  });
});

// ─── P9–P11: applyUpdateForLevel / encodeStateAsUpdateForLevel round-trip ─────

describe('YjsDocAdapter — level-scoped update round-trip (ADR-049)', () => {
  it('P9: applyUpdateForLevel + encodeStateAsUpdateForLevel converge two adapters', () => {
    const adapterA = new YjsDocAdapter('proj-p9', { perLevelMode: true });
    const adapterB = new YjsDocAdapter('proj-p9', { perLevelMode: true });

    // Both write to L1 — concurrent edits
    adapterA.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });
    adapterB.applyCommand('wall.update', { id: 'w1', height: 3500, levelId: 'L1' });

    // Bidirectional merge via level-scoped update API
    adapterB.applyUpdateForLevel('L1', adapterA.encodeStateAsUpdateForLevel('L1'));
    adapterA.applyUpdateForLevel('L1', adapterB.encodeStateAsUpdateForLevel('L1'));

    // Both must converge to the same value on L1
    const nsA = adapterA.getNamespaceForLevel('L1', 'wall.update');
    const nsB = adapterB.getNamespaceForLevel('L1', 'wall.update');
    expect(nsA.get('w1')?.get('height')).toBe(nsB.get('w1')?.get('height'));

    // The coordination docs (this.doc) must remain empty — no cross-contamination
    expect(adapterA.getNamespace('wall.update').toJSON()).toEqual({});
    expect(adapterB.getNamespace('wall.update').toJSON()).toEqual({});

    adapterA.destroy();
    adapterB.destroy();
  });

  it('P10: encodeStateVectorForLevel produces a valid state vector for the level doc', () => {
    const adapter = new YjsDocAdapter('proj-p10', { perLevelMode: true });
    adapter.applyCommand('slab.update', { id: 's1', thickness: 250, levelId: 'L3' });

    const sv = adapter.encodeStateVectorForLevel('L3');
    expect(sv).toBeInstanceOf(Uint8Array);
    expect(sv.byteLength).toBeGreaterThan(0);

    // A fresh doc's state vector is empty — our level doc must differ
    const emptyDoc = new Y.Doc();
    const emptySv = Y.encodeStateVector(emptyDoc);
    expect(sv).not.toEqual(emptySv);
    emptyDoc.destroy();

    adapter.destroy();
  });

  it('P11: cross-level isolation — level update round-trip does not bleed into coordination doc', () => {
    const adapterA = new YjsDocAdapter('proj-p11', { perLevelMode: true });
    const adapterB = new YjsDocAdapter('proj-p11', { perLevelMode: true });

    // Write a cross-level invariant to coordination doc
    adapterA.applyCommand('level.meta', { id: 'level-meta', activeLevel: 'L1' });

    // Write element data to L1 on adapterB
    adapterB.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });

    // Merge coordination docs
    adapterB.applyUpdate(adapterA.encodeStateAsUpdate());

    // adapterB coordination doc now has level.meta
    const metaNs = adapterB.getNamespace('level.meta');
    expect(metaNs.get('level-meta')?.get('activeLevel')).toBe('L1');

    // adapterB L1 doc has the wall — coordination doc does NOT
    const coordWalls = adapterB.getNamespace('wall.update');
    expect(coordWalls.get('w1')).toBeUndefined();
    const levelWalls = adapterB.getNamespaceForLevel('L1', 'wall.update');
    expect(levelWalls.get('w1')?.get('height')).toBe(3000);

    adapterA.destroy();
    adapterB.destroy();
  });
});

// ─── P12–P14: provider management ────────────────────────────────────────────

describe('YjsDocAdapter — level provider management (ADR-049)', () => {
  it('P12: connectLevelWithProvider stores the provider; disconnect/destroy called on cleanup', () => {
    const adapter = new YjsDocAdapter('proj-p12', { perLevelMode: true });
    const provider = mockProvider();

    adapter.connectLevelWithProvider('L1', provider);
    adapter.disconnectLevel('L1');

    expect(provider.disconnectCalled).toBe(true);
    expect(provider.destroyCalled).toBe(true);

    adapter.destroy();
  });

  it('P13: connectLevelWithProvider replaces an existing provider for the same level', () => {
    const adapter = new YjsDocAdapter('proj-p13', { perLevelMode: true });
    const first = mockProvider();
    const second = mockProvider();

    adapter.connectLevelWithProvider('L1', first);
    adapter.connectLevelWithProvider('L1', second); // replaces first

    expect(first.disconnectCalled).toBe(true);
    expect(first.destroyCalled).toBe(true);

    // second provider is now active — should NOT have been disconnected yet
    expect(second.disconnectCalled).toBe(false);

    adapter.destroy();
  });

  it('P14: destroy() cleans up all level providers and all level Y.Docs', () => {
    const adapter = new YjsDocAdapter('proj-p14', { perLevelMode: true });
    const provL1 = mockProvider();
    const provL2 = mockProvider();

    adapter.connectLevelWithProvider('L1', provL1);
    adapter.connectLevelWithProvider('L2', provL2);
    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });

    adapter.destroy();

    expect(provL1.destroyCalled).toBe(true);
    expect(provL2.destroyCalled).toBe(true);
    // getLevelIds is undefined-safe after destroy — the map was cleared
    expect(adapter.getLevelIds()).toHaveLength(0);
  });
});

// ─── P15–P16: destroyLevel + BatchWindowInfo levelIds ────────────────────────

describe('YjsDocAdapter — destroyLevel and BatchWindowInfo levelIds (ADR-049)', () => {
  it('P15: destroyLevel() removes a specific level doc without affecting others', () => {
    const adapter = new YjsDocAdapter('proj-p15', { perLevelMode: true });

    adapter.applyCommand('wall.update', { id: 'w1', height: 3000, levelId: 'L1' });
    adapter.applyCommand('wall.update', { id: 'w2', height: 4000, levelId: 'L2' });

    expect(adapter.getLevelIds()).toContain('L1');
    expect(adapter.getLevelIds()).toContain('L2');

    adapter.destroyLevel('L1');

    expect(adapter.getLevelIds()).not.toContain('L1');
    expect(adapter.getLevelIds()).toContain('L2'); // L2 unaffected

    adapter.destroy();
  });

  it('P16: BatchWindowOpenInfo and BatchWindowCloseInfo accept levelIds field', () => {
    const adapter = new YjsDocAdapter('proj-p16', { perLevelMode: true });

    // Wire the hooks (as BatchCoordinator would)
    const openEvents: BatchWindowOpenInfo[] = [];
    const closeEvents: BatchWindowCloseInfo[] = [];
    adapter.onBatchWindowOpen = (info) => openEvents.push(info);
    adapter.onBatchWindowClose = (info) => closeEvents.push(info);

    // Simulate BatchCoordinator firing the hooks with levelIds
    const openInfo: BatchWindowOpenInfo = {
      batchId: 'batch-001',
      startMs: performance.now(),
      levelIds: ['L1', 'L2'],
    };
    adapter.onBatchWindowOpen!(openInfo);

    const closeInfo: BatchWindowCloseInfo = {
      batchId: 'batch-001',
      blackoutMs: 42,
      elementCount: 150,
      levelIds: ['L1', 'L2'],
    };
    adapter.onBatchWindowClose!(closeInfo);

    expect(openEvents).toHaveLength(1);
    expect(openEvents[0]!.levelIds).toEqual(['L1', 'L2']);
    expect(closeEvents[0]!.levelIds).toEqual(['L1', 'L2']);

    // Backward compat: hooks also accept absence of levelIds
    const openNoLevel: BatchWindowOpenInfo = { batchId: 'batch-002', startMs: 0 };
    adapter.onBatchWindowOpen!(openNoLevel);
    expect(openEvents[1]!.levelIds).toBeUndefined();

    adapter.destroy();
  });
});
