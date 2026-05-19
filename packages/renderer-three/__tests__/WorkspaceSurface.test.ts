// PR 4.A.4 (Wave 4 Track A) — WorkspaceSurface unit test.
//
// Covers the typed `WorkspaceSurface` lifecycle handle end-to-end:
//
//   * `mount()`              — attach a typed host, idempotent on the
//                              same host, rejected on a disposed surface.
//   * `mounted` getter       — true after mount, false before, false
//                              after dispose.
//   * `host` getter          — returns the exact attached instance,
//                              null before mount, null after dispose.
//   * `setProjectContext()`  — delegates `(id, name, opts?)` to the
//                              host VERBATIM, awaits Promise hosts,
//                              throws typed `WorkspaceSurfaceNotMountedError`
//                              before mount, throws typed
//                              `WorkspaceSurfaceDisposedError` after
//                              dispose.
//   * `dispose()`            — idempotent, terminal (mount/setProjectContext
//                              throw afterward), nulls host.
//   * Re-mount-different-host — implicit detach + re-attach; subsequent
//                              calls hit the new host only.
//   * `buildWorkspaceSurface()` — returns a fresh, unmounted instance
//                              every call.
//
// Track A exit-gate metric: contributes 1 of 14 slot adapter test
// suites that must be exhaustively unit-tested before the wave closes.
// See `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3.A`.

import { describe, expect, it, vi } from 'vitest';

import {
  WorkspaceSurface,
  buildWorkspaceSurface,
  WorkspaceSurfaceNotMountedError,
  WorkspaceSurfaceDisposedError,
  type WorkspaceSurfaceHost,
} from '../src/WorkspaceSurface.js';

/** Minimal typed host — just enough to satisfy `WorkspaceSurfaceHost`. */
function makeHost(opts: { async?: boolean } = {}): WorkspaceSurfaceHost & {
  calls: Array<[string, string, { isNewProject?: boolean } | undefined]>;
} {
  const calls: Array<[string, string, { isNewProject?: boolean } | undefined]> = [];
  return {
    calls,
    setProjectContext(id, name, hostOpts) {
      calls.push([id, name, hostOpts]);
      return opts.async ? Promise.resolve() : undefined;
    },
  };
}

describe('PR 4.A.4 — WorkspaceSurface', () => {
  // ── construction & default state ────────────────────────────────────────
  describe('initial state', () => {
    it('is unmounted, undisposed, host=null when freshly constructed', () => {
      const s = new WorkspaceSurface();
      expect(s.mounted).toBe(false);
      expect(s.disposed).toBe(false);
      expect(s.host).toBeNull();
    });

    it('buildWorkspaceSurface() returns a fresh instance every call', () => {
      const a = buildWorkspaceSurface();
      const b = buildWorkspaceSurface();
      expect(a).not.toBe(b);
      expect(a.mounted).toBe(false);
      expect(b.mounted).toBe(false);
    });
  });

  // ── mount() ─────────────────────────────────────────────────────────────
  describe('mount()', () => {
    it('attaches the host and flips `mounted` to true', () => {
      const s = new WorkspaceSurface();
      const host = makeHost();
      s.mount(host);
      expect(s.mounted).toBe(true);
      expect(s.host).toBe(host);
    });

    it('is idempotent for the same host instance (no error, no side effect)', () => {
      const s = new WorkspaceSurface();
      const host = makeHost();
      s.mount(host);
      s.mount(host);
      s.mount(host);
      expect(s.host).toBe(host);
      expect(s.mounted).toBe(true);
    });

    it('replaces the prior host when a different host is mounted', () => {
      const s = new WorkspaceSurface();
      const a = makeHost();
      const b = makeHost();
      s.mount(a);
      s.mount(b);
      expect(s.host).toBe(b);
    });

    it('throws WorkspaceSurfaceDisposedError when called on a disposed surface', () => {
      const s = new WorkspaceSurface();
      s.dispose();
      expect(() => s.mount(makeHost())).toThrow(WorkspaceSurfaceDisposedError);
    });
  });

  // ── setProjectContext() ─────────────────────────────────────────────────
  describe('setProjectContext()', () => {
    it('throws WorkspaceSurfaceNotMountedError before mount()', async () => {
      const s = new WorkspaceSurface();
      await expect(s.setProjectContext('p1', 'Project 1')).rejects.toBeInstanceOf(
        WorkspaceSurfaceNotMountedError,
      );
    });

    it('delegates (id, name, opts) verbatim to the host', async () => {
      const s = new WorkspaceSurface();
      const host = makeHost();
      s.mount(host);
      await s.setProjectContext('p1', 'Project 1', { isNewProject: true });
      await s.setProjectContext('p2', 'Project 2');
      expect(host.calls).toEqual([
        ['p1', 'Project 1', { isNewProject: true }],
        ['p2', 'Project 2', undefined],
      ]);
    });

    it('awaits the host when its setProjectContext returns a Promise', async () => {
      const s = new WorkspaceSurface();
      let resolved = false;
      const host: WorkspaceSurfaceHost = {
        setProjectContext: () =>
          new Promise<void>(resolve =>
            setTimeout(() => {
              resolved = true;
              resolve();
            }, 5),
          ),
      };
      s.mount(host);
      await s.setProjectContext('p1', 'P1');
      expect(resolved).toBe(true);
    });

    it('routes calls to the most recently mounted host (re-mount semantics)', async () => {
      const s = new WorkspaceSurface();
      const a = makeHost();
      const b = makeHost();
      s.mount(a);
      await s.setProjectContext('p1', 'P1');
      s.mount(b);
      await s.setProjectContext('p2', 'P2');
      expect(a.calls).toEqual([['p1', 'P1', undefined]]);
      expect(b.calls).toEqual([['p2', 'P2', undefined]]);
    });

    it('propagates host-thrown errors to the caller', async () => {
      const s = new WorkspaceSurface();
      const host: WorkspaceSurfaceHost = {
        setProjectContext: () => {
          throw new Error('host blew up');
        },
      };
      s.mount(host);
      await expect(s.setProjectContext('p1', 'P1')).rejects.toThrow('host blew up');
    });

    it('throws WorkspaceSurfaceDisposedError after dispose()', async () => {
      const s = new WorkspaceSurface();
      s.mount(makeHost());
      s.dispose();
      await expect(s.setProjectContext('p1', 'P1')).rejects.toBeInstanceOf(
        WorkspaceSurfaceDisposedError,
      );
    });
  });

  // ── dispose() ───────────────────────────────────────────────────────────
  describe('dispose()', () => {
    it('flips `disposed` to true, `mounted` to false, host to null', () => {
      const s = new WorkspaceSurface();
      s.mount(makeHost());
      s.dispose();
      expect(s.disposed).toBe(true);
      expect(s.mounted).toBe(false);
      expect(s.host).toBeNull();
    });

    it('is idempotent — calling twice is harmless', () => {
      const s = new WorkspaceSurface();
      s.mount(makeHost());
      s.dispose();
      expect(() => s.dispose()).not.toThrow();
      expect(s.disposed).toBe(true);
    });

    it('does not call into the host', () => {
      const host = makeHost();
      const spy = vi.spyOn(host, 'setProjectContext');
      const s = new WorkspaceSurface();
      s.mount(host);
      s.dispose();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
