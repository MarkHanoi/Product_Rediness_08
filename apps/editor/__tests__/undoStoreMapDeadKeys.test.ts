// @vitest-environment happy-dom
//
// §L-980 — A MAP KEY WHOSE ADAPTER IS PERMANENTLY `undefined` IS A LIE, NOT A GAP.
//
// THE DEFECT THIS PINS. `buildUndoStoreMap()` reads twenty-one `window.*Store`
// globals. `adaptElementStoreMap` produces an adapter for a store that is
// PRESENT and `undefined` for one that is not — so a key whose global is never
// assigned in production sits in the map looking mapped, while `_covered()`
// reads it as uncovered and `performUndo` falls through to `commandManager`.
// The map's own comment warned against exactly that route for pool, while the
// entry it was defending had been `undefined` since the day it was written.
//
// The reason this survived is measurable and worth naming: the sibling gate
// (`undoStoreCoverageAndStrandedVisibility.test.ts` ARM 1) built its `mapped`
// set from `Object.keys(buildUndoStoreMap())` — KEY PRESENCE, not adapter
// existence — so `pool: undefined` satisfied it. And
// `performUndoRedo.test.ts` stubbed `poolStore` / `waterStore` /
// `stairLandingStore` onto `window` by hand, which is a fixture MORE CAPABLE
// than production: it manufactures the very globals whose absence is the bug.
// This is the L-977 lesson repeating — a fake built from the claim cannot
// falsify the claim. Both have been corrected alongside this file.
//
// FOUR ARMS:
//
//   ARM 1 — NO DEAD KEYS. Measure which `window.*Store =` assignments production
//     actually performs (read out of the real init sources, not hand-copied),
//     install exactly those, and require EVERY entry in `buildUndoStoreMap()` to
//     resolve to a working `applyPatch`. Measured RED before L-980's fix on
//     exactly `pool`, `pools`, `water`, `waters` and `stairLanding` — and on
//     nothing else, which is also the answer to "are there other dead keys?".
//
//   ARM 2 — THE ARM CAN FAIL. Withhold ONE global that production does assign
//     and prove ARM 1 goes red for exactly that key's aliases, then restore it.
//     Without this, a green ARM 1 could mean "the assertion never looks".
//
//   ARM 3 — THE GAP IS DECLARED. `pool` / `water` are declared by handlers that
//     ARE registered in production (`engineLauncher.ts:550`), so removing them
//     from the map obliges a `UNMAPPED_BUS_STORE_KEYS` entry. Paired with a
//     NEGATIVE control on the same table: a genuinely covered key must NOT be in
//     it, or "everything is declared" would be satisfiable by declaring
//     everything.
//
//   ARM 4 — WHAT ACTUALLY HAPPENS. The real `performUndo`, on the real
//     `['pool','wall','slab','water']` declaration, read rather than reasoned
//     about. Measured: the keypress STRANDS (wall and slab are covered; pool and
//     water are not, and `_covered()` demands every one), and — only because the
//     gap is now DECLARED — the toast names the two families instead of the
//     pre-fix generic "Undo found a pending change it could not revert (no
//     applyPatch adapter for store(s) [pool,wall,slab,water])". Carries its own
//     negative control on a fully covered entry.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted so the dynamic `import('@app/ui/platform/PlatformToastSystem')` inside
// `_reportStranded` resolves to this spy (ARM 4).
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@app/ui/platform/PlatformToastSystem', () => ({ showToast }));

import { buildUndoStoreMap, performUndo, UNMAPPED_BUS_STORE_KEYS } from '../src/engine/undo/performUndoRedo.js';
import {
  measureAssignedStoreGlobals,
  installStoreGlobals,
  clearStoreGlobals,
} from './support/productionStoreGlobals.js';

function deadKeys(): string[] {
  return Object.entries(buildUndoStoreMap())
    .filter(([, adapter]) => typeof adapter?.applyPatch !== 'function')
    .map(([k]) => k)
    .sort();
}

describe('§L-980 ARM 1 — no buildUndoStoreMap() key is permanently undefined', () => {
  let assigned: ReadonlySet<string>;

  beforeEach(() => { assigned = measureAssignedStoreGlobals(); installStoreGlobals(assigned); });
  afterEach(() => { clearStoreGlobals(assigned); });

  it('the source sweep actually measured something (a vacuous sweep proves nothing)', () => {
    // Failure and emptiness are the same value unless you check: if the regex or
    // the paths rot, ARM 1 would pass by installing nothing and finding no
    // adapters to check.
    expect(assigned.size, 'no window.*Store assignments found in the init sources').toBeGreaterThan(15);
    // Two anchors from different files, so one moved file cannot blind the sweep.
    expect(assigned.has('wallStore'), 'initBuilders.ts:552 assigns window.wallStore').toBe(true);
    expect(assigned.has('roofStore'), 'engineLauncher.ts:341 assigns window.roofStore').toBe(true);
    // The three L-980 globals must NOT appear — if one is ever wired, this line
    // fails and whoever wired it must put its map key back in the same change.
    for (const absent of ['poolStore', 'waterStore', 'stairLandingStore']) {
      expect(assigned.has(absent), `${absent} is not assigned in production (L-980)`).toBe(false);
    }
  });

  it('every key the map exposes resolves to a working applyPatch adapter', () => {
    const map = buildUndoStoreMap();
    // POSITIVE CONTROL on the SAME expression the negative assertion reads: the
    // map must actually be populated, or "no dead keys" is satisfied by an empty map.
    expect(Object.keys(map).length, 'buildUndoStoreMap() returned no keys at all').toBeGreaterThan(20);
    expect(typeof map['wall']?.applyPatch, 'wall is the canonical covered key').toBe('function');
    expect(typeof map['stairRailing']?.applyPatch, 'stairRailing IS assigned, at initBuilders.ts:942').toBe('function');

    expect(
      deadKeys(),
      'These keys sit in buildUndoStoreMap() but no production code assigns their ' +
      'backing window store, so the adapter is permanently `undefined`. `_covered()` ' +
      'reads them as uncovered and undo falls through to commandManager — the route ' +
      "performUndoRedo.ts's own header warns against (L-980). Wire the store if the " +
      'family is live, or remove the entry and declare the gap in UNMAPPED_BUS_STORE_KEYS.',
    ).toEqual([]);
  });
});

describe('§L-980 ARM 2 — the arm above can fail (deliberate break, then restore)', () => {
  const assigned = measureAssignedStoreGlobals();

  afterEach(() => { clearStoreGlobals(assigned); });

  it('withholding ONE assigned global makes exactly that key dead', () => {
    installStoreGlobals([...assigned].filter(n => n !== 'wallStore'));
    const broken = deadKeys();
    // `wall` and `walls` are the two aliases that read `window.wallStore`.
    expect(broken).toContain('wall');
    expect(broken).toContain('walls');
    // …and nothing else broke, so the arm is specific, not blanket-red.
    expect(broken.filter(k => k !== 'wall' && k !== 'walls')).toEqual([]);
  });

  it('restoring the global makes it green again', () => {
    installStoreGlobals(assigned);
    expect(deadKeys()).toEqual([]);
  });
});

describe('§L-980 ARM 3 — pool / water are DECLARED gaps, not silent ones', () => {
  const assigned = measureAssignedStoreGlobals();

  beforeEach(() => { installStoreGlobals(assigned); });
  afterEach(() => { clearStoreGlobals(assigned); });

  it('both are in UNMAPPED_BUS_STORE_KEYS, owned by nothing, with a reason', () => {
    for (const key of ['pool', 'water'] as const) {
      const entry = UNMAPPED_BUS_STORE_KEYS[key];
      expect(entry, `${key} must be declared — its handler IS registered in production`).toBeDefined();
      expect(entry!.owner).toBe('nothing');
      expect(entry!.reason.length).toBeGreaterThan(30);
    }
  });

  it('NEGATIVE CONTROL — a genuinely covered key is NOT in the table', () => {
    expect(UNMAPPED_BUS_STORE_KEYS['wall']).toBeUndefined();
    expect(UNMAPPED_BUS_STORE_KEYS['slab']).toBeUndefined();
  });

  it('neither pool nor water nor stairLanding is in the store map any more', () => {
    const map = buildUndoStoreMap();
    for (const key of ['pool', 'pools', 'water', 'waters', 'stairLanding']) {
      expect(key in map, `${key} must not claim coverage it does not have`).toBe(false);
    }
    // POSITIVE CONTROL on the same map: the keys that DO belong are still there,
    // so "removed" cannot be satisfied by having removed everything.
    expect('slab' in map).toBe(true);
    expect('stairRailing' in map).toBe(true);
  });

  it('stairLanding is NOT declared as a stranded gap — no handler ever names it', () => {
    // The honest asymmetry with pool/water: `UNMAPPED_BUS_STORE_KEYS` enumerates
    // BUS STORE KEYS that are unmapped. `stairLanding` is not a bus store key at
    // all — nothing declares `affectedStores: ['stairLanding']` anywhere — so
    // declaring it there would invent a gap rather than record one.
    expect(UNMAPPED_BUS_STORE_KEYS['stairLanding']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM 4 — WHAT UNDO ACTUALLY DOES for the pool declaration, through the REAL
// `performUndo`. The map's old comment asserted a CONSEQUENCE ("a pool undo
// silently falls through to commandManager") that nobody had executed. This arm
// executes it: the four-store declaration `pool.create` really carries
// (`['pool','wall','slab','water']`, CreatePool.ts:118) is put on the ring
// buffer, `performUndo()` runs for real, and the outcome is READ rather than
// reasoned about — including whether the user is told anything.
// ─────────────────────────────────────────────────────────────────────────────

function installRingBuffer(affectedStores: readonly string[], applicable: boolean): void {
  const pair = {
    affectedStores,
    timestamp: Date.now(),
    gestureId: 'g-pool',
    forward: { ops: [] as unknown[] },
    inverse: { ops: [{ op: 'remove', path: '/el-1' }] as unknown[] },
  };
  (window as unknown as Record<string, unknown>).runtime = {
    bus: {
      ringBuffer: {
        canUndo: () => true,
        canRedo: () => false,
        current: () => pair,
        peek: () => pair,
        undoPatch: () => (applicable ? pair.inverse : null),
        redoPatch: () => null,
      },
    },
  };
}

describe('§L-980 ARM 4 — the REAL performUndo, on the REAL pool.create declaration', () => {
  const assigned = measureAssignedStoreGlobals();

  beforeEach(() => {
    showToast.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete (globalThis as Record<string, unknown>).commandManager;
    installStoreGlobals(assigned);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearStoreGlobals(assigned);
    delete (window as unknown as Record<string, unknown>).runtime;
  });

  it("a pool entry strands, and the toast NAMES pool and water — it no longer says only 'could not revert'", async () => {
    installRingBuffer(['pool', 'wall', 'slab', 'water'], true);
    const out = performUndo();

    // The measured consequence. `wall` and `slab` ARE covered; `pool` and `water`
    // are not, and `_covered()` demands EVERY store — so the cursor never moves,
    // commandManager holds nothing, and the keypress achieves nothing.
    expect(out.status).toBe('stranded');
    expect(out.status === 'stranded' && out.reason).toContain('pool');

    await vi.waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    const [msg, kind] = showToast.mock.calls[0]!;
    // THIS is what the UNMAPPED_BUS_STORE_KEYS entries buy: `_reportStranded`
    // only names stores whose declared owner is 'nothing'. Before L-980 pool and
    // water were in neither table, so `dead` was empty and the user got the
    // generic "found a pending change it could not revert" with no family named.
    expect(msg).toContain('pool');
    expect(msg).toContain('water');
    expect(msg).toContain('still there');
    expect(kind).toBe('error');
  });

  it('NEGATIVE CONTROL — the same harness with a fully covered entry undoes and says nothing', async () => {
    // Same expression, opposite verdict: if the message fired here too, the
    // assertion above would be measuring the harness, not the declaration.
    const el = { id: 'el-1' };
    const rows = new Map([['el-1', el]]);
    (window as unknown as Record<string, unknown>).wallStore = {
      add: (e: { id: string }) => rows.set(e.id, e),
      remove: (id: string) => { rows.delete(id); },
      update: () => { /* no-op */ },
      getById: (id: string) => rows.get(id),
    };
    installRingBuffer(['wall'], true);
    const out = performUndo();
    expect(out.status).toBe('undone');
    expect(rows.has('el-1'), 'the real adapter drove the real remove()').toBe(false);
    await new Promise(r => setTimeout(r, 20));
    expect(showToast).not.toHaveBeenCalled();
  });
});
