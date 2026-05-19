// editor.bootstrap.data — smoke test (S07 cleanup).
//
// Acceptance:
//   • bootstrapWithWalls() builds without throw.
//   • runtime.stores.wall is a WallStore — wall.* patches route through
//     attachStores end-to-end.
//   • runtime.wallSystemTypes is a WallSystemTypeStore seeded with the
//     built-in catalogue.
//   • Catalogue validation kicks in: wall.create with an unknown
//     systemTypeId is rejected; a known id is accepted.
//   • Caller-supplied stores + handlers compose without overwriting the
//     wall wiring.
//   • In Node (no `window`), the dev handle is NOT installed.
//   • When `window === globalThis`, the dev handle IS installed and
//     detached on tearDown().
//   • tearDown() is idempotent.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CubeStore } from '@pryzm/stores';
import { WallStore, WallSystemTypeStore } from '@pryzm/plugin-wall';
import { createId } from '@pryzm/schemas';
import { bootstrapWithWalls } from '../src/bootstrap.data.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

describe('editor.bootstrap.data — bootstrapWithWalls (S07 cleanup)', () => {
  it('builds with the wall plugin pre-wired', () => {
    const rt = bootstrapWithWalls({ audit: AUDIT });
    expect(rt.stores.wall).toBeInstanceOf(WallStore);
    expect(rt.wallSystemTypes).toBeInstanceOf(WallSystemTypeStore);
    expect(rt.wallSystemTypes.has('wt-monolithic')).toBe(true);
    expect(typeof rt.tearDown).toBe('function');
    rt.tearDown();
  });

  it('routes wall.create patches through attachStores into runtime.stores.wall', async () => {
    const rt = bootstrapWithWalls({ audit: AUDIT });
    const id = createId('wall');
    await rt.bus.executeCommand('wall.create', { id, levelId: 'lvl_test' });
    const wall = (rt.stores.wall as unknown as WallStore).get(id);
    expect(wall).toBeDefined();
    expect(wall?.id).toBe(id);
    rt.tearDown();
  });

  it('rejects wall.create with an unknown systemTypeId at the gate', async () => {
    const rt = bootstrapWithWalls({ audit: AUDIT });
    await expect(
      rt.bus.executeCommand('wall.create', {
        id: createId('wall'),
        levelId: 'lvl_test',
        systemTypeId: 'wt-DOES-NOT-EXIST',
      }),
    ).rejects.toThrow(/unknown systemTypeId/);
    expect((rt.stores.wall as unknown as WallStore).size()).toBe(0);
    rt.tearDown();
  });

  it('accepts a built-in systemTypeId', async () => {
    const rt = bootstrapWithWalls({ audit: AUDIT });
    const id = createId('wall');
    await rt.bus.executeCommand('wall.create', {
      id,
      levelId: 'lvl_test',
      systemTypeId: 'wt-monolithic',
    });
    expect((rt.stores.wall as unknown as WallStore).get(id)?.systemTypeId).toBe(
      'wt-monolithic',
    );
    rt.tearDown();
  });

  it('layers caller-supplied stores on top without dropping the wall store', () => {
    const cube = new CubeStore();
    const rt = bootstrapWithWalls({
      audit: AUDIT,
      stores: { cube },
    });
    expect(rt.stores.wall).toBeInstanceOf(WallStore);
    expect(rt.stores.cube).toBe(cube);
    rt.tearDown();
  });

  it('does NOT install the dev handle in Node (no window)', () => {
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    const rt = bootstrapWithWalls({ audit: AUDIT });
    expect((globalThis as { __pryzm2DevHandle?: unknown }).__pryzm2DevHandle).toBeUndefined();
    rt.tearDown();
  });

  describe('with a polyfilled window', () => {
    beforeEach(() => {
      (globalThis as { window?: unknown }).window = globalThis;
    });
    afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
      delete (globalThis as { __pryzm2DevHandle?: unknown }).__pryzm2DevHandle;
    });

    it('installs the dev handle and detaches it on tearDown', () => {
      const rt = bootstrapWithWalls({ audit: AUDIT });
      const handle = (globalThis as { __pryzm2DevHandle?: { runtime: unknown; bus: unknown } })
        .__pryzm2DevHandle;
      expect(handle).toBeDefined();
      expect(handle?.runtime).toBe(rt);
      expect(handle?.bus).toBe(rt.bus);
      rt.tearDown();
      expect(
        (globalThis as { __pryzm2DevHandle?: unknown }).__pryzm2DevHandle,
      ).toBeUndefined();
    });

    it('tearDown() is idempotent', () => {
      const rt = bootstrapWithWalls({ audit: AUDIT });
      rt.tearDown();
      expect(() => rt.tearDown()).not.toThrow();
    });
  });
});
