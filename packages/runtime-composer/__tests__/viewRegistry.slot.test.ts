// PR 4.A.1 (Wave 4 Track A) — viewRegistry slot adapter unit test.
//
// Covers the typed `buildViewRegistrySlot()` adapter end-to-end against
// a real `ViewRegistry` from `@pryzm/view-state`:
//
//   * `list()`          — projects `ViewRegistry.getState()` snapshot to
//                         the `ViewRegistrySummary` shape, mapping the
//                         current `ViewKind` enum to slot kinds.
//   * `activate()`      — mirrors `activeViewId`, fans out to subscribers,
//                         emits the typed `'viewRegistry.activate'` event,
//                         no-ops on unchanged ids, and treats `''` as
//                         clear-to-`null`.
//   * `subscribe()`     — disposer removes the listener; thrown listeners
//                         do not break siblings (loud-fail-soft).
//   * Type wiring       — the adapter's `registry` parameter is a real
//                         `ViewRegistry` (no `unknown`); compile-time
//                         coverage is the test file's mere existence.
//
// Track A exit-gate metric: contributes 1 of 14 slot adapters that must
// be exhaustively unit-tested before the wave closes.  See
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3.A`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Patch } from 'immer';
import { ViewRegistry, Default3DView, LevelOverview } from '@pryzm/view-state';

import { EventBus } from '../src/EventBus.js';
import { buildViewRegistrySlot, mapViewKind } from '../src/buildViewRegistrySlot.js';

describe('PR 4.A.1 — buildViewRegistrySlot', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── mapViewKind ─────────────────────────────────────────────────────────
  describe('mapViewKind()', () => {
    it('folds both 3D ViewKinds to "3d"', () => {
      expect(mapViewKind('3d-perspective')).toBe('3d');
      expect(mapViewKind('3d-orthographic')).toBe('3d');
    });
  });

  // ── list() ──────────────────────────────────────────────────────────────
  describe('list()', () => {
    it('returns an empty array when the underlying registry is empty', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      expect(slot.list()).toEqual([]);
    });

    it('projects ViewDefinition rows to the ViewRegistrySummary shape', () => {
      const reg = new ViewRegistry();
      reg.applyPatch([
        { op: 'add', path: [Default3DView.id], value: Default3DView } as Patch,
        { op: 'add', path: [LevelOverview.id], value: LevelOverview } as Patch,
      ]);
      const slot = buildViewRegistrySlot(reg, new EventBus());
      const list = slot.list();
      expect(list).toHaveLength(2);

      const byId = new Map(list.map((v) => [v.id, v]));
      const d = byId.get(Default3DView.id);
      const l = byId.get(LevelOverview.id);
      expect(d).toBeDefined();
      expect(l).toBeDefined();
      expect(d!.name).toBe(Default3DView.name);
      expect(l!.name).toBe(LevelOverview.name);
      expect(d!.kind).toBe('3d');  // 3d-perspective → '3d'
      expect(l!.kind).toBe('3d');  // 3d-orthographic → '3d'
    });

    it('reflects mutations to the underlying registry on subsequent calls', () => {
      const reg = new ViewRegistry();
      const slot = buildViewRegistrySlot(reg, new EventBus());
      expect(slot.list()).toHaveLength(0);

      reg.applyPatch([
        { op: 'add', path: [Default3DView.id], value: Default3DView } as Patch,
      ]);
      expect(slot.list()).toHaveLength(1);

      reg.applyPatch([{ op: 'remove', path: [Default3DView.id] } as Patch]);
      expect(slot.list()).toHaveLength(0);
    });
  });

  // ── activate() ──────────────────────────────────────────────────────────
  describe('activate()', () => {
    it('starts with activeViewId === null', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      expect(slot.activeViewId).toBeNull();
    });

    it('mirrors activeViewId and emits a typed viewRegistry.activate event', async () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: ({ viewId: string | null })[] = [];
      events.on('viewRegistry.activate', (p) => seen.push(p));

      await slot.activate(Default3DView.id);

      expect(slot.activeViewId).toBe(Default3DView.id);
      expect(seen).toEqual([{ viewId: Default3DView.id }]);
    });

    it("treats activate('') as clear-to-null", async () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: ({ viewId: string | null })[] = [];
      events.on('viewRegistry.activate', (p) => seen.push(p));

      await slot.activate(Default3DView.id);
      await slot.activate('');

      expect(slot.activeViewId).toBeNull();
      expect(seen).toEqual([
        { viewId: Default3DView.id },
        { viewId: null },
      ]);
    });

    it('no-ops when activate() is called with the current viewId', async () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: ({ viewId: string | null })[] = [];
      events.on('viewRegistry.activate', (p) => seen.push(p));

      await slot.activate(Default3DView.id);
      await slot.activate(Default3DView.id);  // same id — must not re-emit
      await slot.activate(Default3DView.id);

      expect(seen).toHaveLength(1);
    });

    it('fires a one-shot D.11-prep stub warning on the first activate() only', async () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      await slot.activate(Default3DView.id);
      await slot.activate(LevelOverview.id);
      await slot.activate('');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('D.11-prep stub');
    });
  });

    // ── Wave 6 panel-binding API ──────────────────────────────────────────────
  // Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2
  // wave-6-b-d1 exit gate: activatePanel / deactivatePanel / getActivePanelIds
  //                         / subscribePanelChange — full happy-path + idempotency
  //                         + loud-fail-soft for subscriber errors.

  describe('activatePanel()', () => {
    it('starts with an empty active-panel set', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      expect(slot.getActivePanelIds().size).toBe(0);
    });

    it('adds the panelId to getActivePanelIds() after activation', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      slot.activatePanel('property-panel');
      expect(slot.getActivePanelIds().has('property-panel')).toBe(true);
    });

    it('emits the typed ui.panel.activated event on first activation', () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: { panelId: string }[] = [];
      events.on('ui.panel.activated', (p) => seen.push(p));

      slot.activatePanel('layer-panel', { label: 'Layer Panel' });

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ panelId: 'layer-panel' });
    });

    it('is idempotent — second call for the same panelId is a no-op', () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: { panelId: string }[] = [];
      events.on('ui.panel.activated', (p) => seen.push(p));

      slot.activatePanel('property-inspector');
      slot.activatePanel('property-inspector'); // duplicate — must be ignored
      slot.activatePanel('property-inspector');

      expect(seen).toHaveLength(1);
      expect(slot.getActivePanelIds().size).toBe(1);
    });

    it('can activate multiple distinct panels', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      slot.activatePanel('property-panel');
      slot.activatePanel('layer-panel');
      slot.activatePanel('property-inspector');
      const ids = slot.getActivePanelIds();
      expect(ids.has('property-panel')).toBe(true);
      expect(ids.has('layer-panel')).toBe(true);
      expect(ids.has('property-inspector')).toBe(true);
    });
  });

  describe('deactivatePanel()', () => {
    it('removes the panelId from getActivePanelIds()', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      slot.activatePanel('property-panel');
      slot.deactivatePanel('property-panel');
      expect(slot.getActivePanelIds().has('property-panel')).toBe(false);
    });

    it('emits the typed ui.panel.deactivated event', () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: { panelId: string }[] = [];
      events.on('ui.panel.deactivated', (p) => seen.push(p));

      slot.activatePanel('layer-panel');
      slot.deactivatePanel('layer-panel');

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ panelId: 'layer-panel' });
    });

    it('is idempotent — deactivating a panel that is not active is a no-op', () => {
      const events = new EventBus();
      const slot = buildViewRegistrySlot(new ViewRegistry(), events);
      const seen: { panelId: string }[] = [];
      events.on('ui.panel.deactivated', (p) => seen.push(p));

      slot.deactivatePanel('property-panel'); // not active — must not emit
      slot.deactivatePanel('property-panel');

      expect(seen).toHaveLength(0);
    });

    it('deactivating one panel leaves others active', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      slot.activatePanel('property-panel');
      slot.activatePanel('layer-panel');
      slot.deactivatePanel('property-panel');
      expect(slot.getActivePanelIds().has('property-panel')).toBe(false);
      expect(slot.getActivePanelIds().has('layer-panel')).toBe(true);
    });
  });

  describe('subscribePanelChange()', () => {
    it('fires the listener synchronously after activatePanel()', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const snapshots: ReadonlySet<string>[] = [];
      slot.subscribePanelChange((ids) => snapshots.push(ids));

      slot.activatePanel('property-panel');
      slot.activatePanel('layer-panel');

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]?.has('property-panel')).toBe(true);
      expect(snapshots[1]?.has('layer-panel')).toBe(true);
    });

    it('fires the listener synchronously after deactivatePanel()', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const snapshots: ReadonlySet<string>[] = [];
      slot.activatePanel('property-panel');
      slot.subscribePanelChange((ids) => snapshots.push(ids));
      slot.deactivatePanel('property-panel');

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.has('property-panel')).toBe(false);
    });

    it('disposer removes the listener for subsequent changes', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const snapshots: ReadonlySet<string>[] = [];
      const sub = slot.subscribePanelChange((ids) => snapshots.push(ids));

      slot.activatePanel('property-panel');
      sub.dispose();
      slot.activatePanel('layer-panel'); // after dispose — must not fire

      expect(snapshots).toHaveLength(1);
    });

    it('a thrown panel subscriber does not break siblings (loud-fail-soft)', () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const seen: ReadonlySet<string>[] = [];
      slot.subscribePanelChange(() => { throw new Error('panel-sub boom'); });
      slot.subscribePanelChange((ids) => seen.push(ids));

      slot.activatePanel('property-panel');

      expect(seen).toHaveLength(1);
      expect(seen[0]?.has('property-panel')).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('panel subscriber threw');
    });
  });

  // ── subscribe() ─────────────────────────────────────────────────────────
  describe('subscribe()', () => {
    it('fires the listener on every activate() with the new activeViewId', async () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const seen: (string | null)[] = [];
      slot.subscribe((id) => seen.push(id));

      await slot.activate(Default3DView.id);
      await slot.activate(LevelOverview.id);
      await slot.activate('');

      expect(seen).toEqual([Default3DView.id, LevelOverview.id, null]);
    });

    it('disposer removes the listener for subsequent activates', async () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const seen: (string | null)[] = [];
      const sub = slot.subscribe((id) => seen.push(id));

      await slot.activate(Default3DView.id);
      sub.dispose();
      await slot.activate(LevelOverview.id);

      expect(seen).toEqual([Default3DView.id]);
    });

    it('a thrown listener does not break siblings (loud-fail-soft)', async () => {
      const slot = buildViewRegistrySlot(new ViewRegistry(), new EventBus());
      const seen: (string | null)[] = [];
      slot.subscribe(() => { throw new Error('subscriber boom'); });
      slot.subscribe((id) => seen.push(id));

      await slot.activate(Default3DView.id);

      expect(seen).toEqual([Default3DView.id]);
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('subscriber threw');
    });
  });
});
