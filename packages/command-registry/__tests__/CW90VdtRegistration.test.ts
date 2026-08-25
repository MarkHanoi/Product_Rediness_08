/**
 * §CW90 item 7 (§G3-STALE-FIX-CW — the COMMAND path) — the ViewDependencyTracker
 * learns a curtain wall's level BEFORE the store add, on the command path too.
 *
 * The bus mirror (initTools §P3.1-CW) has registered curtain walls in the VDT
 * before `add()` since OI-054 — because `add()` synchronously drives
 * `CurtainPanelSyncHandler`, which fires one storeEventBus event PER PANEL
 * (`<cwId>::row:col`), and the VDT attributes a panel to its parent only if the
 * PARENT is already registered. `CreateCurtainWallCommand` — the 3-D tool /
 * by-slab / project-load path — registered bimManager and elementRegistry but
 * NEVER the VDT, so every create through it produced the founder's
 * `[VDT] §G3-STALE-EVENT for unregistered element curtainwall_… — fallback to
 * store-type view only` storm, one warning per panel, and the affected views
 * were COARSE-marked instead of targeted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { CreateCurtainWallCommand } from '../src/curtainwall/CreateCurtainWallCommand';

function makeContext() {
  const curtainWallStore = new CurtainWallStore();
  return {
    stores: { curtainWallStore },
    bimManager: {
      registerElement: vi.fn(),
      unregisterElement: vi.fn(),
      getLevelById: () => ({ id: 'L0', elevation: 0 }),
    },
  } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('§CW90 item 7 — CreateCurtainWallCommand registers the wall with the VDT', () => {
  it('⭐ registerElement(id, levelId) is called BEFORE the store add (panel attribution needs the parent first)', () => {
    const calls: string[] = [];
    const reg = vi
      .spyOn(viewDependencyTracker, 'registerElement')
      .mockImplementation(() => { calls.push('vdt'); });

    const ctx = makeContext();
    const add = ctx.stores.curtainWallStore.add.bind(ctx.stores.curtainWallStore);
    vi.spyOn(ctx.stores.curtainWallStore, 'add').mockImplementation((rec: unknown) => {
      calls.push('add');
      return add(rec);
    });

    const cmd = new CreateCurtainWallCommand({
      id: 'curtainwall_01HZZZZZZZZZZZZZZZZZZZZZZZ',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 6, y: 0, z: 0 },
      height: 3,
      gridXSpacing: 1.2,
      gridYSpacing: 1.5,
      levelId: 'L0',
    } as any);
    const res = cmd.execute(ctx);

    expect(res.success).toBe(true);
    expect(reg).toHaveBeenCalledWith('curtainwall_01HZZZZZZZZZZZZZZZZZZZZZZZ', 'L0');
    // Ordering is the whole point: VDT first, THEN the add that mints panels.
    expect(calls.indexOf('vdt')).toBeLessThan(calls.indexOf('add'));
  });
});
