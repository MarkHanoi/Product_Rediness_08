// PR 4.A.3 (Wave 4 Track A) — workspaceMode slot adapter unit test.
//
// Covers `buildWorkspaceModeController()` end-to-end against a real
// `EventBus`:
//
//   * Default mode      — `'3d'` (BIM-canonical opening mode).
//   * `initial` option  — overrides the default.
//   * `set()`           — mutates `mode`, fans out to per-slot
//                         subscribers, and emits the typed
//                         `'workspace.modeChanged'` event with both
//                         the new mode and the `previous` mode.
//   * No-op contract    — `set()` to the current mode is a no-op:
//                         neither subscribers nor the event fire.
//   * `subscribe()`     — disposer removes the listener; thrown
//                         listeners do not break siblings or block
//                         the event emit (loud-fail-soft).
//   * Slot independence — the `'workspace.surfaceChanged'` topic
//                         (owned by the separate `workspace` slot)
//                         is NOT fired by this slot.
//
// Track A exit-gate metric: contributes 1 of 14 slot adapters that
// must be exhaustively unit-tested before the wave closes.  See
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3.A`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '../src/EventBus.js';
import { buildWorkspaceModeController } from '../src/workspace/WorkspaceModeController.js';
import type { WorkspaceMode } from '../src/types.js';

describe('PR 4.A.3 — buildWorkspaceModeController', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // ── default & initial ───────────────────────────────────────────────────
  describe('initial mode', () => {
    it('defaults to "3d"', () => {
      const slot = buildWorkspaceModeController(new EventBus());
      expect(slot.mode).toBe('3d');
    });

    it('honours the `initial` option', () => {
      const slot = buildWorkspaceModeController(new EventBus(), {
        initial: 'plan',
      });
      expect(slot.mode).toBe('plan');
    });
  });

  // ── set() ───────────────────────────────────────────────────────────────
  describe('set()', () => {
    it('mutates `mode` to the new value', () => {
      const slot = buildWorkspaceModeController(new EventBus());
      slot.set('plan');
      expect(slot.mode).toBe('plan');
    });

    it('fans out to per-slot subscribers in registration order', () => {
      const slot = buildWorkspaceModeController(new EventBus());
      const seenA: WorkspaceMode[] = [];
      const seenB: WorkspaceMode[] = [];
      slot.subscribe(m => seenA.push(m));
      slot.subscribe(m => seenB.push(m));

      slot.set('section');
      slot.set('plan');

      expect(seenA).toEqual(['section', 'plan']);
      expect(seenB).toEqual(['section', 'plan']);
    });

    it("emits the typed 'workspace.modeChanged' event with mode + previous", () => {
      const events = new EventBus();
      const slot = buildWorkspaceModeController(events);
      const heard: Array<{ mode: WorkspaceMode; previous: WorkspaceMode }> = [];
      events.on('workspace.modeChanged', payload => heard.push(payload));

      slot.set('plan');
      slot.set('section');

      expect(heard).toEqual([
        { mode: 'plan', previous: '3d' },
        { mode: 'section', previous: 'plan' },
      ]);
    });

    it('is a no-op when set to the current mode (no subs, no event)', () => {
      const events = new EventBus();
      const slot = buildWorkspaceModeController(events); // default '3d'
      const sub = vi.fn();
      const listener = vi.fn();
      slot.subscribe(sub);
      events.on('workspace.modeChanged', listener);

      slot.set('3d');

      expect(slot.mode).toBe('3d');
      expect(sub).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── subscribe() ─────────────────────────────────────────────────────────
  describe('subscribe()', () => {
    it("disposer removes the listener so it stops firing", () => {
      const slot = buildWorkspaceModeController(new EventBus());
      const listener = vi.fn();
      const disp = slot.subscribe(listener);

      slot.set('plan');
      expect(listener).toHaveBeenCalledTimes(1);

      disp.dispose();
      slot.set('section');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("a thrown listener does NOT break siblings (loud-fail-soft)", () => {
      const slot = buildWorkspaceModeController(new EventBus());
      const sibling = vi.fn();
      slot.subscribe(() => { throw new Error('boom'); });
      slot.subscribe(sibling);

      slot.set('plan');

      expect(sibling).toHaveBeenCalledWith('plan');
      expect(errorSpy).toHaveBeenCalled();
    });

    it("a thrown listener does NOT block the event emit", () => {
      const events = new EventBus();
      const slot = buildWorkspaceModeController(events);
      const heard = vi.fn();
      slot.subscribe(() => { throw new Error('boom'); });
      events.on('workspace.modeChanged', heard);

      slot.set('section');

      expect(heard).toHaveBeenCalledWith({
        mode: 'section',
        previous: '3d',
      });
    });
  });

  // ── slot independence ───────────────────────────────────────────────────
  describe('slot independence', () => {
    it("does NOT emit the 'workspace.surfaceChanged' topic (owned by the workspace slot)", () => {
      const events = new EventBus();
      const slot = buildWorkspaceModeController(events);
      const surfaceListener = vi.fn();
      events.on('workspace.surfaceChanged', surfaceListener);

      slot.set('plan');
      slot.set('section');

      expect(surfaceListener).not.toHaveBeenCalled();
    });
  });
});
