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

describe('§L-980 ARM 3 — pool / water are COVERED now (§POOL95, L-11350)', () => {
  const assigned = measureAssignedStoreGlobals();

  beforeEach(() => { installStoreGlobals(assigned); });
  afterEach(() => { clearStoreGlobals(assigned); });

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠ THIS ARM WAS INVERTED BY §POOL95 (L-11350), AND ITS CONTROLS DID NOT MOVE.
  // ═══════════════════════════════════════════════════════════════════════════
  // It used to assert `UNMAPPED_BUS_STORE_KEYS['pool']` was DEFINED with
  // `owner: 'nothing'`, and that `'pool' in buildUndoStoreMap()` was FALSE. Both
  // were correct pins on L-980's honest 2026-08-18 measurement: the family was
  // UNREACHABLE, so a declared gap was better than manufactured coverage reading
  // `window.poolStore`, a global nothing ever assigned.
  //
  // ⭐ THREE OF L-980's FOUR AXES HAVE SINCE BEEN CLOSED by other lanes —
  // `PluginRegistry` now builds `new PoolStore()` / `new WaterStore()`, both
  // storeKeys are declared, and `PoolPlanToolHandler` dispatches `pool.create`
  // from a live "Swimming Pool" palette button. The family became REACHABLE and
  // therefore actually STRANDED, and nothing re-read these rows: Ctrl+Z after
  // drawing a pool was a TOTAL no-op that left the void punched through the floor.
  //
  // ⛔ THE COVERAGE IS **NOT** THE `window.poolStore` FIX L-980 REFUSED. There is
  // still no such global and none is invented. `poolUndoAdapter` resolves
  // `runtime.stores.pool` / `.water` LAZILY at apply time — the boundaryLine
  // (L-11160) and lift (L-11340) shape — and THROWS BY NAME when the runtime is
  // absent. That is why the arm below can assert coverage without installing a
  // single new global.

  it('both are OUT of UNMAPPED_BUS_STORE_KEYS — the rows moved with the adapters', () => {
    for (const key of ['pool', 'water'] as const) {
      expect(
        UNMAPPED_BUS_STORE_KEYS[key],
        `${key} has a real adapter now, so declaring it unmapped would re-set the trap`,
      ).toBeUndefined();
    }
    // The table is NOT empty — so this cannot pass by everything having been
    // deleted from it. The genuinely stranded keys are still declared.
    expect(Object.keys(UNMAPPED_BUS_STORE_KEYS).length).toBeGreaterThan(3);
    expect(UNMAPPED_BUS_STORE_KEYS['structural'], 'a real gap is still declared').toBeDefined();
  });

  it('NEGATIVE CONTROL — a genuinely covered key is NOT in the table', () => {
    expect(UNMAPPED_BUS_STORE_KEYS['wall']).toBeUndefined();
    expect(UNMAPPED_BUS_STORE_KEYS['slab']).toBeUndefined();
  });

  it('pool and water ARE in the store map; the dead aliases and stairLanding still are not', () => {
    const map = buildUndoStoreMap();

    // ⭐ THE FLIPPED HALF — and it asserts a WORKING adapter, not mere presence.
    // `_covered()` checks `typeof map[s]?.applyPatch === 'function'`, so a key
    // present with an `undefined` value is exactly as dead as an absent one. That
    // distinction is what L-980 was written to expose; asserting `key in map`
    // would have missed it.
    for (const key of ['pool', 'water']) {
      expect(typeof map[key]?.applyPatch, `${key} must have a working adapter`).toBe('function');
    }

    // ⛔ THE PLURAL ALIASES STAY DEAD, DELIBERATELY. `pools` / `waters` read
    // globals that were never assigned; no handler declares them, and adding them
    // back would be manufactured coverage for a key with no traffic — the exact
    // "costume of a fix" L-980 named.
    for (const key of ['pools', 'waters', 'stairLanding']) {
      expect(key in map, `${key} must not claim coverage it does not have`).toBe(false);
    }

    // POSITIVE CONTROL on the same map, unchanged.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠ INVERTED BY §POOL95 (L-11350). This arm used to assert that a real
  // `pool.create` declaration STRANDS — "`wall` and `slab` ARE covered; `pool`
  // and `water` are not, and `_covered()` demands EVERY store — so the cursor
  // never moves and the keypress achieves nothing", with a toast naming both
  // families. That was a true and useful pin on a real gap, and the gap is closed:
  // the pool is no longer declined AT THE KEY.
  //
  // ⭐ WHAT REPLACES IT IS STRICTLY STRONGER, because the old arm could not tell
  // "declined for lack of an adapter" from "applied and failed". Both arms below
  // are kept so the two remain distinguishable:
  //   · with NO `runtime.stores`, coverage IS claimed, the apply IS attempted, and
  //     the absent store surfaces as a NAMED failure — never a silent no-op;
  //   · with the real stores present, the undo actually LANDS.
  // ═══════════════════════════════════════════════════════════════════════════

  it('a pool entry is COVERED now — it no longer strands on the `pool` key', async () => {
    installRingBuffer(['pool', 'wall', 'slab', 'water'], true);
    const out = performUndo();

    // ⛔ THE HARNESS DELIBERATELY SUPPLIES NO `runtime.stores` (`installRingBuffer`
    // installs only `runtime.bus.ringBuffer`), so `resolvePoolStoresFromWindow()`
    // returns null and the adapters THROW BY NAME. That is the designed behaviour
    // and it is the L-980 rule kept: an adapter that promised `_covered()` it could
    // apply, and then cannot, must SAY SO.
    const reason = out.status === 'stranded' ? out.reason : '';
    expect(
      reason,
      'the reason must no longer be "no applyPatch adapter for store(s) [pool, water]"',
    ).not.toMatch(/no applyPatch adapter/);
    expect(reason, 'it failed on APPLY, which is a different and louder failure').toContain('apply failed');
  });

  it('...and with the real plugin stores present, the pool undo LANDS', async () => {
    // ⭐ THE POSITIVE HALF — the assertion the founder's Ctrl+Z actually cares
    // about. `resolvePoolStoresFromWindow` reads `runtime.stores.pool` / `.water`,
    // so the harness supplies them exactly as `PluginRegistry` does in production.
    const poolRows = new Map<string, unknown>([['el-1', { id: 'el-1' }]]);
    const waterRows = new Map<string, unknown>();
    const patchable = (rows: Map<string, unknown>) => ({
      applyPatch: (patches: readonly { op: string; path: (string | number)[]; value?: unknown }[]) => {
        const removed = new Set<string>();
        const added = new Set<string>();
        for (const p of patches) {
          const id = String(p.path[0]);
          if (p.op === 'remove') { rows.delete(id); removed.add(id); }
          else { rows.set(id, p.value); added.add(id); }
        }
        return { added, updated: new Set<string>(), removed };
      },
      get: (id: string) => rows.get(id) as Record<string, unknown> | undefined,
    });

    // The other two stores in the declaration are LEGACY globals, read by
    // `buildUndoStoreMap()` off `window`. `_covered()` is all-or-nothing, so
    // without these the entry strands on `wall`/`slab` and this arm would be
    // measuring the harness rather than the pool — the same trap the NEGATIVE
    // CONTROL below installs `wallStore` to avoid.
    const legacy = { add: () => {}, remove: () => {}, update: () => {}, getById: () => undefined };
    (window as unknown as Record<string, unknown>).wallStore = legacy;
    (window as unknown as Record<string, unknown>).slabStore = legacy;

    // ⚠ THE PAIR IS BUILT HERE RATHER THAN BY `installRingBuffer`, AND THE REASON
    // IS THE ONE ADR-0124 §5 RECORDS. A MULTI-STORE patch routes by
    // `path[0] === storeKey`, so its ops MUST be store-key-prefixed
    // (`/pool/el-1`), while the shared helper mints single-store-shaped `/el-1`
    // ops. Feeding those to a four-store entry routes them to NOTHING and every
    // store reports zero applied — which is precisely the multi-store routing bug
    // ADR-0124 §5 had to fix in `produceMultiStoreCommand` before the pool could
    // undo at all. Using the helper here would re-create that bug inside the test
    // and read its symptom as a failure of this fix.
    const pair = {
      affectedStores: ['pool', 'wall', 'slab', 'water'],
      timestamp: Date.now(),
      gestureId: 'g-pool-covered',
      forward: { ops: [{ op: 'add', path: '/pool/el-1', value: { id: 'el-1' } }] },
      inverse: { ops: [{ op: 'remove', path: '/pool/el-1' }] },
    };
    const rt: Record<string, unknown> = {
      bus: {
        ringBuffer: {
          canUndo: () => true,
          canRedo: () => false,
          current: () => pair,
          peek: () => pair,
          undoPatch: () => pair.inverse,
          redoPatch: () => null,
        },
      },
      stores: { pool: patchable(poolRows), water: patchable(waterRows) },
    };
    (window as unknown as Record<string, unknown>).runtime = rt;

    const out = performUndo();

    expect(out.status, 'a fully covered pool entry undoes for real').toBe('undone');
    expect(poolRows.has('el-1'), 'the real adapter drove the real store').toBe(false);
    // Silence is the success signal: no error toast for an undo that worked.
    await new Promise(r => setTimeout(r, 20));
    expect(showToast).not.toHaveBeenCalled();
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
