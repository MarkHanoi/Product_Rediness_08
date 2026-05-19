import { describe, it, expect, vi } from 'vitest';
import {
  NullInputHost,
  createNullInputHost,
  type InputHost,
  type InputChannel,
  type InputPointerEvent,
} from '../src/index.js';

describe('@pryzm/input-host — Phase 1A NullInputHost', () => {
  describe('contract conformance', () => {
    it('createNullInputHost() returns an InputHost', () => {
      const host: InputHost = createNullInputHost();
      expect(typeof host.isReady).toBe('function');
      expect(typeof host.getModifiers).toBe('function');
      expect(typeof host.subscribe).toBe('function');
      expect(typeof host.dispose).toBe('function');
    });

    it('NullInputHost is a constructible class', () => {
      expect(new NullInputHost()).toBeInstanceOf(NullInputHost);
    });
  });

  describe('isReady()', () => {
    it('always returns false for the Null backend', () => {
      const host = createNullInputHost();
      expect(host.isReady()).toBe(false);
    });
  });

  describe('getModifiers()', () => {
    it('returns the all-false mask', () => {
      const host = createNullInputHost();
      const m = host.getModifiers();
      expect(m).toEqual({ shift: false, ctrl: false, alt: false, meta: false });
    });

    it('returns the SAME frozen object across calls (no GC churn)', () => {
      const host = createNullInputHost();
      expect(host.getModifiers()).toBe(host.getModifiers());
    });

    it('the returned mask is frozen', () => {
      const host = createNullInputHost();
      const m = host.getModifiers();
      expect(Object.isFrozen(m)).toBe(true);
    });
  });

  describe('subscribe()', () => {
    const channels: readonly InputChannel[] = [
      'pointerdown',
      'pointerup',
      'pointermove',
      'wheel',
      'keydown',
      'keyup',
    ];

    it('accepts a handler for each of the 6 input channels', () => {
      const host = createNullInputHost();
      for (const channel of channels) {
        const disposer = host.subscribe(channel, () => {});
        expect(typeof disposer.dispose).toBe('function');
      }
    });

    it('records subscribers per channel (NullInputHost.subscriberCount)', () => {
      const host = new NullInputHost();
      host.subscribe('pointerdown', () => {});
      host.subscribe('pointerdown', () => {});
      host.subscribe('keyup', () => {});
      expect(host.subscriberCount('pointerdown')).toBe(2);
      expect(host.subscriberCount('keyup')).toBe(1);
      expect(host.subscriberCount('wheel')).toBe(0);
    });

    it('NEVER fires the handler — Phase 1A is a no-op pump', async () => {
      const host = createNullInputHost();
      const handler = vi.fn();
      host.subscribe('pointerdown', handler);
      // Wait a macrotask just to be sure no async dispatch happened.
      await new Promise<void>((r) => setTimeout(r, 5));
      expect(handler).not.toHaveBeenCalled();
    });

    it('disposer removes the handler from the subscriber set', () => {
      const host = new NullInputHost();
      const d1 = host.subscribe('pointermove', () => {});
      const d2 = host.subscribe('pointermove', () => {});
      expect(host.subscriberCount('pointermove')).toBe(2);
      d1.dispose();
      expect(host.subscriberCount('pointermove')).toBe(1);
      d2.dispose();
      expect(host.subscriberCount('pointermove')).toBe(0);
    });

    it('disposer is idempotent', () => {
      const host = new NullInputHost();
      const d = host.subscribe('keydown', () => {});
      expect(host.subscriberCount('keydown')).toBe(1);
      d.dispose();
      d.dispose();
      d.dispose();
      expect(host.subscriberCount('keydown')).toBe(0);
    });

    it('typed channel narrowing — pointerdown handler receives InputPointerEvent (compile-time check via runtime shape)', () => {
      const host = createNullInputHost();
      // The handler signature is statically-typed; we assert the runtime
      // shape is what subscribers can rely on (channel field + button + buttons).
      let received: InputPointerEvent | null = null;
      const d = host.subscribe('pointerdown', (ev) => {
        received = ev;
      });
      // Phase 1A never fires, so received stays null — but the call typechecked.
      expect(received).toBeNull();
      d.dispose();
    });
  });

  describe('dispose() lifecycle', () => {
    it('is idempotent', () => {
      const host = createNullInputHost();
      host.dispose();
      expect(() => host.dispose()).not.toThrow();
      expect(() => host.dispose()).not.toThrow();
    });

    it('clears all subscribers', () => {
      const host = new NullInputHost();
      host.subscribe('pointerdown', () => {});
      host.subscribe('keyup', () => {});
      expect(host.subscriberCount('pointerdown')).toBe(1);
      host.dispose();
      expect(host.subscriberCount('pointerdown')).toBe(0);
      expect(host.subscriberCount('keyup')).toBe(0);
    });

    it('post-dispose subscribe() throws a NAMED error (no silent undefined behaviour)', () => {
      const host = createNullInputHost();
      host.dispose();
      expect(() => host.subscribe('pointerdown', () => {})).toThrow(/disposed NullInputHost/);
    });

    it('post-dispose getModifiers() does NOT throw (callers may probe before deciding to recreate)', () => {
      const host = createNullInputHost();
      host.dispose();
      expect(() => host.getModifiers()).not.toThrow();
      expect(host.getModifiers()).toEqual({ shift: false, ctrl: false, alt: false, meta: false });
    });

    it('post-dispose isReady() returns false without throwing', () => {
      const host = createNullInputHost();
      host.dispose();
      expect(() => host.isReady()).not.toThrow();
      expect(host.isReady()).toBe(false);
    });
  });

  describe('isolation', () => {
    it('two factory calls return independent instances', () => {
      const a = new NullInputHost();
      const b = new NullInputHost();
      expect(a).not.toBe(b);
      a.subscribe('pointerdown', () => {});
      expect(a.subscriberCount('pointerdown')).toBe(1);
      expect(b.subscriberCount('pointerdown')).toBe(0);
      a.dispose();
      // b must still be usable
      expect(() => b.subscribe('keydown', () => {})).not.toThrow();
    });
  });
});
