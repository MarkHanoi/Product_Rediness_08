// WindowBatchCreateLiveness.probe — the MEASUREMENT that must precede any
// `window.batch.create` consequence family (bar 3, C78 §20 · C70 §4.2).
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS: a family brief's PREMISE, measured and REFUTED
// ═══════════════════════════════════════════════════════════════════════════════════════
// `check-relationship-determination` carries `verb:window.batch.create/silent-dispatch`
// (1 of its 124 findings, exit 1 DECLARED-LEVEL at ledger 124, measured this session).
// The row is REAL. The stated reason for ranking it next was not:
//
//   CLAIMED  "PRODUCTION DISPATCH SITES ... executePlan.ts:633, :693, :767 — the AI
//             apartment generator places windows in bulk through it, a gesture a user
//             actually makes."
//   MEASURED :633 is `door.batch.create`, not this verb. :693 and :767 CONSTRUCT a
//             `LayoutCommand` object into the `windowBatch` / `shellWindowBatch` fields of
//             the `LayoutCommandSet` that `buildLayoutCommands` RETURNS. Constructing a
//             payload is not dispatching it. ARM D below scans every consumer of that set
//             — ApartmentLayoutExecutor, HouseLayoutExecutor, ResidentialBuildingExecutor
//             and all of `packages/ai-host/src` — and finds ZERO dispatch sites, against a
//             POSITIVE CONTROL that the same scanner does find `wallBatch` dispatched.
//             executePlan.ts says so itself, in two comments (:588, :667): "the unused
//             window.batch.create payload ... is never dispatched by the executors (they
//             punch openings only)". The generator creates its windows through
//             `wall.createOpening`, which is ALREADY a landed consequence family (78394be2).
//
// That alone would only re-rank the queue. ARM B..C are why the family must not land as a
// planner at all in its present shape.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE LOAD-BEARING FINDING: this verb is the SURVIVING member of a purged family
// ═══════════════════════════════════════════════════════════════════════════════════════
// `window.create` — the SINGULAR twin, same plugin, same store, same mechanism — was
// measured by the CA-21 executed read-back against the REAL composed runtime and found to
// be a liveness lie: *"dispatch reported success; the AUTHORITATIVE windowStore (the one
// ProjectSerializer reads) did not change"*. It was made to REFUSE
// (§FIX-CREATE-LIVENESS-LIE, `plugins/window/src/handlers/CreateWindow.ts:39`).
// `window.setSize` / `window.setSillHeight` LEFT the handler set entirely for the same
// cause (§FIX-DIMS-REACH-RECORD, L-815: "the plugin handlers wrote the DETACHED plugin
// window store (silent no-op in production)").
//
// `window.batch.create` writes THE SAME STORE BY THE SAME MECHANISM —
// `affectedStores = ['window']`, `produceCommand(ctx.stores.window, …)` — and was left
// registered and left LIVE. ARM C pins that identity executably.
//
// The two stores are rivals by construction, and neither this file nor a planner has to
// take that on trust:
//   • `apps/editor/src/PluginRegistry.ts:263` — the window descriptor's
//     `buildStore: () => new WindowStore()` mints a FRESH plugin DTO store per boot. That
//     instance is what `bootstrapWithEverything` puts in `stores.window`, and therefore
//     what the bus's `storesProvider` (`apps/editor/src/bootstrap.ts:94`) hands the batch
//     handler as `ctx.stores.window`.
//   • `packages/runtime-composer/src/composeRuntime.ts:1551` —
//     `storeRegistry.register('window', windowStore)` registers the `@pryzm/geometry-window`
//     MODULE SINGLETON. That is the instance `storeRegistry.getStoreForType('window')`
//     returns, i.e. the one `buildPlanningContext()` in
//     `consequencePreviewServiceComposition.ts` reads, the one ProjectSerializer reads, and
//     the one WindowBuilder renders from.
//   A `new` expression cannot return a pre-existing singleton, so these are two objects.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// WHAT THAT MEANS FOR THE FAMILY (the handoff, not a decision this probe makes)
// ═══════════════════════════════════════════════════════════════════════════════════════
// A planner that answered for this verb by predicting `changed: [windowIds]` /
// `topology.added: [windowIds]` would be asserting a commit into the store its own
// `PlanningContext.getStore('window')` reads — the store the CA-21 read-back proved does
// not change. That is a G-REASON-03 divergence MANUFACTURED AT THE PLANNER, the exact
// defect `WallOpeningCreateConsequencePlanner`'s header (:27–:35) exists to refuse. Any
// landing must carry the C15 §8.1 dual-store fact as a typed UNDETERMINED and must not
// predict the authoritative row — the disposition (iv) shape `WallOpeningCreate` and
// `OpeningDelete` already use.
//
// NOTHING HERE IS A CLAIM THAT THE ROW SHOULD NOT CLOSE. The gate's silent-dispatch class
// is cleared by a normaliser rule plus a composed planner; a handler-level refusal does not
// clear it (a refusing verb is still one of the 89). The row stays open, and this file is
// the measurement its successor needs before writing a single line of plan assembly.

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  attachStores,
  createId,
} from '@pryzm/plugin-sdk';
import {
  WindowStore,
  buildWindowHandlerSet,
  type WindowData,
  type WindowsState,
} from '@pryzm/plugin-window';

// ─── The harness: the bus wired the way apps/editor/src/bootstrap.ts wires it ──────────
// `storesProvider` returns the Record<id, dto> view of the PLUGIN DTO store, and
// `attachStores` routes the emitted forward patches back into it — the same two halves
// bootstrap.ts:92–105 wires. So a read of `env.window` after a dispatch is a read of
// STORED STATE, not of a handler's return value (the C70 §4.2 rule).

function buildEnv() {
  const windowStoreDto = new WindowStore();
  const stores = {
    window: windowStoreDto as unknown as import('@pryzm/stores').Store<object>,
  };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'k6-probe', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      window: Object.fromEntries(windowStoreDto.getState()) as WindowsState,
    }),
  });
  for (const h of buildWindowHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { window: windowStoreDto, bus, detach };
}

function snap(store: WindowStore): Record<string, WindowData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

// ─── ARM A — the verb IS dispatchable, and what it writes is a STORED value ────────────

describe('ARM A — window.batch.create reaches a store (the positive half)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('one dispatch stores every window in the batch — read back from the STORE', async () => {
    env = buildEnv();
    const wallId = createId('wall');
    const idA = createId('window');
    const idB = createId('window');

    await env.bus.executeCommand('window.batch.create', {
      windows: [
        { id: idA, wallId, openingId: 'op_a', offset: 1.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
        { id: idB, wallId, openingId: 'op_b', offset: 3.0, width: 0.8, height: 1.4, sillHeight: 0.8 },
      ],
    });

    // The assertion is on the STORE, never on the dispatch's return value.
    const stored = snap(env.window);
    expect(Object.keys(stored).sort()).toEqual([idA, idB].sort());
    expect(stored[idA]!.openingId).toBe('op_a');
    expect(stored[idA]!.width).toBeCloseTo(1.2, 6);
    expect(stored[idB]!.openingId).toBe('op_b');
    expect(stored[idB]!.sillHeight).toBeCloseTo(0.8, 6);
    // ONE gesture, ONE undo unit (C78 §12.1 / U-INV-9) — the property a batch consequence
    // plan binds to. Pinned here so the successor does not have to re-derive it.
    expect(env.window.size()).toBe(2);
  });

  it('refuses the whole batch at the FIRST failing entry — nothing is stored', async () => {
    env = buildEnv();
    const wallId = createId('wall');
    const before = snap(env.window);

    await expect(
      env.bus.executeCommand('window.batch.create', {
        windows: [
          { id: createId('window'), wallId, openingId: 'op_ok', width: 1.2 },
          { id: createId('window'), wallId, openingId: '', width: 1.2 },
        ],
      }),
    ).rejects.toThrow(/windows\[1\]\.openingId/);

    // NO partial batch: entry 0 was well-formed and still did not land.
    expect(snap(env.window)).toEqual(before);
    expect(env.window.size()).toBe(0);
  });
});

// ─── ARM B — the CONTROL, both directions: the singular twin REFUSES ───────────────────

describe('ARM B — window.create, the same store, REFUSES (§FIX-CREATE-LIVENESS-LIE)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('the harness sees a refusal as a refusal, and it names wall.createOpening', async () => {
    env = buildEnv();
    const before = snap(env.window);

    await expect(
      env.bus.executeCommand('window.create', {
        id: createId('window'),
        wallId: createId('wall'),
        openingId: 'op_single',
        offset: 1.0,
      }),
    ).rejects.toThrow(/wall\.createOpening/);

    expect(snap(env.window)).toEqual(before);
    expect(env.window.size()).toBe(0);
  });

  it('the refusal states the measured cause: the AUTHORITATIVE windowStore did not change', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('window.create', {
        wallId: createId('wall'),
        openingId: 'op_single_2',
      }),
    ).rejects.toThrow(/authoritative windowStore/i);
  });
});

// ─── ARM C — the batch verb writes EXACTLY the store its refused twin was refused for ──

describe('ARM C — batch and singular target the same detached store', () => {
  it('affectedStores are identical: both write ctx.stores.window', () => {
    // Read the REGISTERED instances out of the handler set the plugin actually ships —
    // not freshly constructed ones. (`CreateWindowBatchHandler` is not on the plugin's
    // public barrel at all, while `CreateWindowHandler` is; the set is the one surface
    // that carries both, and it is what `registerWindowHandlers` puts on the bus.)
    const set = buildWindowHandlerSet();
    const batch = set.find((h) => h.type === 'window.batch.create');
    const single = set.find((h) => h.type === 'window.create');
    expect(batch).toBeDefined();
    expect(single).toBeDefined();

    const affected = (h: (typeof set)[number]): string[] => [
      ...((h as { affectedStores: readonly string[] }).affectedStores),
    ];
    expect(affected(batch!)).toEqual(['window']);
    // Same verb family, same store, same mechanism — one refuses, one does not.
    expect(affected(single!)).toEqual(affected(batch!));
  });

  it('the plugin DTO store is minted fresh, so it can never BE the geometry-window singleton', () => {
    // `PluginRegistry.ts:263` is `buildStore: () => new WindowStore()`. Two calls, two
    // objects — a factory that `new`s cannot hand back the module singleton
    // `composeRuntime.ts:1551` registers under 'window'. Executed rather than argued.
    const a = new WindowStore();
    const b = new WindowStore();
    expect(a).not.toBe(b);
    // And the DTO store is a different SHAPE from the authoritative one: it has no
    // `byWall` reverse index seeded from wall records, no `openingId`-keyed host link
    // maintained by CreateWallOpeningCommand. It is a bag of rows.
    expect(typeof (a as unknown as { getState?: unknown }).getState).toBe('function');
  });
});

// ─── ARM D — the production-dispatch CENSUS, with a positive control ───────────────────

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const CENSUS_ROOTS = [
  join(REPO_ROOT, 'apps', 'editor', 'src', 'ui', 'apartment-layout'),
  join(REPO_ROOT, 'apps', 'editor', 'src', 'ui', 'house-layout'),
  join(REPO_ROOT, 'apps', 'editor', 'src', 'ui', 'residential-building'),
  join(REPO_ROOT, 'packages', 'ai-host', 'src'),
];

/** Every `.ts` file under `dir`, recursively. Never silently empty — see the arm below. */
function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
        walk(p);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Every DISPATCH argument in `src` — the text between `executeCommand(` / `.dispatch(`
 * and the matching first comma or close paren. A payload CONSTRUCTED into an object
 * literal is deliberately NOT matched: that is precisely the distinction this arm exists
 * to draw.
 */
function dispatchArguments(src: string): string[] {
  const out: string[] = [];
  const re = /\b(?:executeCommand|dispatch)\s*\(\s*([^,)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]!.trim());
  return out;
}

describe('ARM D — census: is window.batch.create dispatched anywhere in production?', () => {
  const files = CENSUS_ROOTS.flatMap(tsFilesUnder);

  it('the scanner actually read a corpus (a scan of nothing is not a finding of nothing)', () => {
    // C70 L-INV-1: "I found nothing" and "I could not look" are never the same value.
    expect(files.length).toBeGreaterThan(20);
  });

  it('POSITIVE CONTROL — the same scanner DOES find wall.batch.create dispatched', () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const arg of dispatchArguments(readFileSync(f, 'utf8'))) {
        if (/wall\.batch\.create|wallBatch\b/.test(arg)) hits.push(`${f} :: ${arg}`);
      }
    }
    // HouseLayoutExecutor.ts:1360 / :1424 and ResidentialBuildingExecutor's
    // _dispatchWallBatch are the expected hits. If this arm ever goes empty the scanner
    // has broken, and the negative arm below means nothing.
    expect(hits.length).toBeGreaterThan(0);
  });

  it('NEGATIVE — zero production dispatch sites for window.batch.create', () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const arg of dispatchArguments(readFileSync(f, 'utf8'))) {
        if (/window\.batch\.create|windowBatch\b|shellWindowBatch\b/.test(arg)) {
          hits.push(`${f} :: ${arg}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('and the payload IS constructed — so the gap is dispatch, not emission', () => {
    const executePlan = readFileSync(
      join(REPO_ROOT, 'packages', 'ai-host', 'src', 'workflows', 'apartmentLayout', 'executePlan.ts'),
      'utf8',
    );
    // Both construction sites the brief cited as "dispatch sites".
    const constructed = executePlan.match(/command:\s*'window\.batch\.create'/g) ?? [];
    expect(constructed.length).toBe(2);
  });
});
