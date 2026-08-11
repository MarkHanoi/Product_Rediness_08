// W5-4 — PROBE: commands issued BEFORE the CRDT adapter exists.
//
// ─── THE DEFECT ──────────────────────────────────────────────────────────────
//
// `engineLauncher.bootstrap()` constructs the YjsDocAdapter behind
// `requestIdleCallback(..., { timeout: 4000 })` (fallback `setTimeout(1500)`),
// then calls `runtime.bus.setCrdtApplier(...)`.  Until that idle slot fires,
// `CommandBus._crdtApplier` is null and step 7 of `executeCommand` is skipped:
//
//     if (this._crdtApplier) { ... }        // ← null for the first ~1.5–4 s
//
// Every command executed in that window — which on this product is the whole of
// project load, hydration and any generate the user starts immediately — never
// reaches the Y.Doc.  No log, no counter, no refusal.  It is the SAME defect
// class as the `if (!elementId) return` drop W5-3 removed, one layer up: a
// mutation is discarded and the system reports success.
//
// A DEFERRED applier is not wrong; a LOSSY one is.  `DeferredCrdtApplier` keeps
// the perf win (no Y.Doc on the first-paint path) and makes the window
// non-lossy: commands are QUEUED and replayed in order on attach, and if the
// queue is exhausted the overflow is COUNTED and named — never dropped quietly.

import { describe, it, expect } from 'vitest';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';
import { DeferredCrdtApplier } from '../src/deferredCrdtApplier.js';

describe('W5-4 — the pre-adapter boot window must not lose commands', () => {
  it('PROBE: a command issued before the adapter exists still reaches the Y.Doc', () => {
    const deferred = new DeferredCrdtApplier();

    // ── boot window: the adapter does not exist yet ────────────────────────
    deferred.apply('wall.create', { id: 'wall-boot', levelId: 'L1', height: 3.0 });
    deferred.apply('wall.updateDimensions', { wallId: 'wall-boot', height: 5.0 });
    expect(deferred.stats.queued).toBe(2);
    expect(deferred.stats.forwarded).toBe(0);

    // ── the idle slot finally fires ────────────────────────────────────────
    const adapter = new YjsDocAdapter('proj-boot');
    deferred.attach((t, p) => adapter.applyCommand(t, p));

    // THE INVARIANT: the height the Y.Doc holds is the one the user set during
    // boot — 5.0.  The broken path holds NOTHING for this element at all, and
    // `undefined` here is the failure, not an empty result.
    expect(adapter.readElementProperty('wall-boot', 'height')).toBe(5.0);
    expect(deferred.stats.replayed).toBe(2);
    expect(deferred.stats.dropped).toBe(0);

    adapter.destroy();
  });

  it('ORDER: replay preserves dispatch order — create before update', () => {
    const deferred = new DeferredCrdtApplier();
    const seen: string[] = [];
    deferred.apply('wall.create', { id: 'w', height: 3.0 });
    deferred.apply('wall.updateDimensions', { wallId: 'w', height: 4.0 });
    deferred.apply('wall.updateDimensions', { wallId: 'w', height: 5.0 });
    deferred.attach((t, p) => { seen.push(`${t}:${String(p['height'])}`); });
    expect(seen).toEqual([
      'wall.create:3',
      'wall.updateDimensions:4',
      'wall.updateDimensions:5',
    ]);
  });

  it('PASS-THROUGH: after attach, commands go straight through, unqueued', () => {
    const deferred = new DeferredCrdtApplier();
    const seen: string[] = [];
    deferred.attach((t) => { seen.push(t); });
    deferred.apply('wall.create', { id: 'w' });
    expect(seen).toEqual(['wall.create']);
    expect(deferred.stats.queued).toBe(0);
    expect(deferred.stats.forwarded).toBe(1);
  });

  it('OVERFLOW IS COUNTED, NOT SILENT: the queue is bounded and says so', () => {
    const warnings: string[] = [];
    const deferred = new DeferredCrdtApplier({
      maxQueued: 3,
      onOverflow: (m) => { warnings.push(m); },
    });
    for (let i = 0; i < 10; i++) deferred.apply('wall.create', { id: `w${i}` });

    expect(deferred.stats.queued).toBe(3);
    expect(deferred.stats.dropped).toBe(7);
    // A drop that nobody can observe is the defect this file exists to remove.
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/dropped/i);

    // And the drop remains reportable AFTER attach — it does not reset to a
    // clean-looking zero once the adapter arrives.
    deferred.attach(() => {});
    expect(deferred.stats.dropped).toBe(7);
    expect(deferred.hasLostCommands).toBe(true);
  });

  it('DROPPED ≠ EMPTY: a never-used applier reports zero loss, distinctly', () => {
    const deferred = new DeferredCrdtApplier();
    expect(deferred.hasLostCommands).toBe(false);
    expect(deferred.stats).toEqual({
      queued: 0, forwarded: 0, replayed: 0, dropped: 0, applierErrors: 0,
    });
  });

  it('NON-FATAL: an applier that throws is counted and never breaks execution', () => {
    const deferred = new DeferredCrdtApplier();
    deferred.attach(() => { throw new Error('adapter exploded'); });
    expect(() => deferred.apply('wall.create', { id: 'w' })).not.toThrow();
    expect(deferred.stats.applierErrors).toBe(1);
  });
});
