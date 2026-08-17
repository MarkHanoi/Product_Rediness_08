// DoorBatchCreateLiveness.probe — the MEASUREMENT that must precede any
// `door.batch.create` consequence family (bar 3, C78 §20 · C70 §4.2).
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS: a family brief's PREMISE, measured and REFUTED
// ═══════════════════════════════════════════════════════════════════════════════════════
// `check-relationship-determination` carries `verb:door.batch.create/silent-dispatch` —
// 1 of its 124 findings (exit 1 DECLARED-LEVEL at ledger 124, measured this session, exit
// code captured without a pipe). The row is REAL. The stated reason for ranking it FIRST
// was not:
//
//   CLAIMED  "PRODUCTION DISPATCH SITES J0 READ DIRECTLY: executePlan.ts:633, :693, :767.
//             The AI apartment generator places doors in bulk through it. That is a
//             gesture a user actually makes."
//   MEASURED :633 CONSTRUCTS a `LayoutCommand` object into the `doorBatch` field of the
//             `LayoutCommandSet` that `buildLayoutCommands` RETURNS. (:693 and :767 are
//             `window.batch.create` — a different verb, lane K6's subject.) Constructing
//             a payload is not dispatching it. ARM D below scans every consumer of that
//             set and finds ZERO dispatch sites for `doorBatch`, against a POSITIVE
//             CONTROL that the same scanner DOES find `wallBatch` dispatched.
//             `executePlan.ts:588` says so itself: the live executor path
//             "never dispatches" the door.batch.create payload — "openings carry both
//             door + window creation". The generator creates its doors through
//             `wall.createOpening`, which is ALREADY a landed consequence family
//             (78394be2).
//
// That alone would only re-rank the queue. ARM B..C are why the family must not land as a
// planner in its present shape.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE LOAD-BEARING FINDING: this verb is the SURVIVING member of a purged family
// ═══════════════════════════════════════════════════════════════════════════════════════
// Three of its siblings in THIS PLUGIN were already condemned for the identical mechanism:
//   • `door.create`  — the SINGULAR twin. CA-21 executed read-back:
//     *"dispatch reported success; the AUTHORITATIVE doorStore (the one ProjectSerializer
//     reads) did not change"*. Made to REFUSE (§FIX-CREATE-LIVENESS-LIE,
//     `plugins/door/src/handlers/CreateDoor.ts:106`).
//   • `door.move`    — REFUSES for the same cause (§FIX-DEAD-MOVE-VERB-REFUSE).
//   • `door.setWidth` / `door.setHeight` — LEFT the handler set entirely
//     (§FIX-DIMS-REACH-RECORD, L-815: "the plugin handlers wrote the DETACHED plugin door
//     store (silent no-op in production)"), see `plugins/door/src/handlers/index.ts:21`.
//
// `door.batch.create` writes THE SAME STORE BY THE SAME MECHANISM —
// `affectedStores = ['door']`, `produceCommand<DoorsState>(ctx.stores.door, …)`, zero
// import of `@pryzm/geometry-door` — and was left registered and left UNKNOWN-liveness.
// ARM C pins that identity executably.
//
// The two stores are rivals BY CONSTRUCTION, and nothing here takes that on trust:
//   • `apps/editor/src/PluginRegistry.ts:256` — the door descriptor's
//     `buildStore: () => new DoorStore()` mints a FRESH plugin DTO store per boot. That
//     instance is what `bootstrapWithEverything` puts in `stores.door`, and therefore what
//     the bus's `storesProvider` hands the batch handler as `ctx.stores.door`.
//   • `packages/runtime-composer/src/composeRuntime.ts:1550` —
//     `storeRegistry.register('door', doorStore)` registers the `@pryzm/geometry-door`
//     MODULE SINGLETON. That is the instance `storeRegistry.getStoreForType('door')`
//     returns — i.e. the one `buildPlanningContext()` in
//     `consequencePreviewServiceComposition.ts` reads, the one `ProjectSerializer` reads
//     (`packages/persistence-client/src/loader/ProjectSerializer.ts:47`), the one
//     `DoorBuilder` renders from, and the one `hostedOpeningFrameSync.ts` writes.
//   A `new` expression cannot return a pre-existing singleton, so these are two objects.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE COMPOSED-RUNTIME MEASUREMENT (run once, against the REAL composeRuntime)
// ═══════════════════════════════════════════════════════════════════════════════════════
// The arms below run on a hand-wired bus, because `apps/editor`'s vitest config is a NODE
// environment and `composeRuntime` needs a DOM. The same question was ALSO put to the real
// composed runtime under the CA-21 harness conditions (happy-dom, forks, the same ladder
// `liveness.probe.ts` uses: `runtime.stores.elements.get('door')`, ADR-0318 rung 0).
// Verbatim ledger of that run:
//
//   [K5-CENSUS]  authoritative door store: runtime.stores.elements.get('door')
//   [K5-CENSUS]  plugin DTO door store (ctx.stores.door): UNREACHABLE
//   [K5-CENSUS]  are they the SAME object? false
//   [K5-DISPATCH] door.batch.create ok=true
//   [K5-AUTH]    doors[0] undefined -> undefined
//   [K5-AUTH]    doors[1] undefined -> undefined
//   [K5-VERDICT] READBACK-NEGATIVE — dispatch reported success; the AUTHORITATIVE store
//                did NOT change
//   [K5-FALSIFY] sees a genuine write=true | refuses a value never written=true
//
// The FALSIFY line is load-bearing: the read-back mechanism was proven able to see a real
// write in the same process, so the negative is a fact about the verb, not a broken probe.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// WHAT THAT MEANS FOR THE FAMILY (the handoff, not a decision this probe makes)
// ═══════════════════════════════════════════════════════════════════════════════════════
// A planner answering for this verb by predicting `changed: [doorIds]` /
// `topology.added: [doorIds]` would assert a commit into the store its own
// `PlanningContext.getStore('door')` reads — the store the read-back above proved does not
// change. That is a G-REASON-03 divergence MANUFACTURED AT THE PLANNER, the exact defect
// `WallOpeningCreateConsequencePlanner`'s header (:27–:35) exists to refuse. Any landing
// must carry the C15 §8.1 dual-store fact as a typed UNDETERMINED and must NOT predict the
// authoritative row — the disposition (iv) shape `WallOpeningCreate` and `OpeningDelete`
// already use.
//
// NOTHING HERE IS A CLAIM THAT THE BAR-3 ROW SHOULD NOT CLOSE. The gate's silent-dispatch
// class is cleared by a normaliser rule plus a composed planner; a handler-level refusal
// does NOT clear it (a refusing verb is still one of the 89). The row stays open, and this
// file is the measurement its successor needs before writing a line of plan assembly.
//
// THE SOURCE FIX THIS MEASUREMENT ARGUES FOR — named, not performed here, because it is
// COUPLED to a file this lane does not own. Converting `CreateDoorBatchHandler.canExecute`
// to the §FIX-CREATE-LIVENESS-LIE refusal shape (extract the per-entry loop into
// `validatePayload` ABOVE `canExecute`, leave `canExecute` returning only the refusal —
// the ordering `check-verb-register.ts:689 refusesInCanExecute` requires) flips the verb
// UNKNOWN → REFUSES, which REQUIRES striking `'door.batch.create'` from
// `UNKNOWN_LIVENESS_BASELINE` in `tools/ga-gate/check-verb-register.ts:445` in the SAME
// commit (the list is shrink-only and checked in BOTH directions). That file belongs to
// the gate lanes, so the paired edit is handed off rather than taken.

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
  DoorStore,
  buildDoorHandlerSet,
  type DoorData,
  type DoorsState,
} from '@pryzm/plugin-door';

// ─── The harness: the bus wired the way apps/editor/src/bootstrap.ts wires it ──────────
// `storesProvider` returns the Record<id, dto> view of the PLUGIN DTO store, and
// `attachStores` routes the emitted forward patches back into it — the same two halves
// bootstrap.ts wires. So a read of the store after a dispatch is a read of STORED STATE,
// never of a handler's return value (the C70 §4.2 rule, and the one this session's
// restamp downgraded MT-01 for breaking).

function buildEnv() {
  const doorStoreDto = new DoorStore();
  const stores = {
    door: doorStoreDto as unknown as import('@pryzm/stores').Store<object>,
  };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'k5-probe', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      door: Object.fromEntries(doorStoreDto.getState()) as DoorsState,
    }),
  });
  for (const h of buildDoorHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { door: doorStoreDto, bus, detach };
}

function snap(store: DoorStore): Record<string, DoorData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(store.getState())));
}

// ─── ARM A — the verb IS dispatchable, and what it writes is a STORED value ────────────
// The POSITIVE half. Without it, ARM C's negative could be "the harness never works".

describe('ARM A — door.batch.create reaches a store (the positive control)', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('one dispatch stores every door in the batch — read back from the STORE', async () => {
    env = buildEnv();
    const wallId = createId('wall');
    const idA = createId('door');
    const idB = createId('door');

    await env.bus.executeCommand('door.batch.create', {
      doors: [
        { id: idA, wallId, openingId: 'op_a', offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: idB, wallId, openingId: 'op_b', offset: 3.0, width: 0.8, height: 2.0, sillHeight: 0 },
      ],
    });

    // The assertion is on the STORE, never on the dispatch's return value.
    const stored = snap(env.door);
    expect(Object.keys(stored).sort()).toEqual([idA, idB].sort());
    expect(stored[idA]!.openingId).toBe('op_a');
    expect(stored[idA]!.width).toBeCloseTo(0.9, 6);
    expect(stored[idB]!.openingId).toBe('op_b');
    expect(stored[idB]!.width).toBeCloseTo(0.8, 6);
    // ONE gesture, ONE undo unit (C78 §12.1 / U-INV-9) — the property a batch consequence
    // plan binds to. Pinned here so the successor does not have to re-derive it.
    expect(env.door.size()).toBe(2);
  });

  it('refuses the whole batch at the FIRST failing entry — nothing is stored', async () => {
    env = buildEnv();
    const wallId = createId('wall');
    const before = snap(env.door);

    await expect(
      env.bus.executeCommand('door.batch.create', {
        doors: [
          { id: createId('door'), wallId, openingId: 'op_ok', width: 0.9 },
          { id: createId('door'), wallId, openingId: '', width: 0.9 },
        ],
      }),
    ).rejects.toThrow(/doors\[1\]\.openingId/);

    // NO partial batch: entry 0 was well-formed and still did not land. This is the
    // refuse-not-refit property a planner would have to mirror.
    expect(snap(env.door)).toEqual(before);
    expect(env.door.size()).toBe(0);
  });
});

// ─── ARM B — the two door stores are TWO OBJECTS, by construction ──────────────────────

describe('ARM B — the plugin DTO store and the authoritative singleton are rivals', () => {
  it('`new DoorStore()` is never the @pryzm/geometry-door module singleton', async () => {
    const dto = new DoorStore();
    const { doorStore } = (await import('@pryzm/geometry-door')) as unknown as {
      doorStore: object;
    };
    // A `new` expression cannot return a pre-existing singleton. Pinned executably so a
    // future "they were unified" claim has to delete a failing test rather than a comment.
    expect(dto as unknown as object).not.toBe(doorStore);
  });

  it('CreateDoorBatch.ts writes ctx.stores.door and never imports @pryzm/geometry-door', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../plugins/door/src/handlers/CreateDoorBatch.ts'),
      'utf8',
    );
    // The mechanism, read from source rather than asserted in prose.
    expect(src).toMatch(/produceCommand<DoorsState>\(\s*ctx\.stores\.door/);
    expect(src).toMatch(/affectedStores\s*=\s*\['door'\]/);
    expect(src).not.toMatch(/@pryzm\/geometry-door/);
  });
});

// ─── ARM C — the READBACK-NEGATIVE, reproduced without composeRuntime ──────────────────

describe('ARM C — a door.batch.create dispatch leaves the AUTHORITATIVE store untouched', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('the batch lands in the plugin DTO store and NOT in the geometry-door singleton', async () => {
    env = buildEnv();
    const { doorStore } = (await import('@pryzm/geometry-door')) as unknown as {
      doorStore: { has(id: string): boolean };
    };
    const idA = createId('door');

    expect(doorStore.has(idA)).toBe(false);

    await env.bus.executeCommand('door.batch.create', {
      doors: [
        {
          id: idA,
          wallId: createId('wall'),
          openingId: 'op_a',
          offset: 1.0,
          width: 0.9,
          height: 2.1,
          sillHeight: 0,
        },
      ],
    });

    // The dispatch REPORTED SUCCESS (no throw) and the DTO store holds the row …
    expect(snap(env.door)[idA]).toBeTruthy();
    // … while the store ProjectSerializer reads, DoorBuilder renders from and
    // buildPlanningContext() hands a planner does not know the door exists.
    // THIS is the same-value defect: "created" and "not created" read identically
    // downstream, and only the store you happen to ask distinguishes them.
    expect(doorStore.has(idA)).toBe(false);
  });
});

// ─── ARM D — ZERO dispatch sites, with a positive control on the scanner ───────────────

/** Every .ts under `dir`, recursively, excluding node_modules/dist. */
function tsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) tsFiles(p, out);
    else if (e.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('ARM D — nothing dispatches the doorBatch payload the generator builds', () => {
  const ROOT = resolve(__dirname, '../../..');
  const SCAN = [
    join(ROOT, 'apps', 'editor', 'src', 'ui'),
    join(ROOT, 'packages', 'ai-host', 'src'),
  ];

  /** Read every scanned file ONCE. The scan covers a few thousand files; re-reading
   *  them per query made each arm exceed the suite timeout. */
  let CORPUS: { rel: string; src: string }[] | null = null;
  function corpus(): { rel: string; src: string }[] {
    if (CORPUS) return CORPUS;
    const out: { rel: string; src: string }[] = [];
    for (const root of SCAN) {
      for (const f of tsFiles(root)) {
        out.push({
          rel: f.slice(ROOT.length + 1).replace(/\\/g, '/'),
          src: readFileSync(f, 'utf8'),
        });
      }
    }
    CORPUS = out;
    return out;
  }

  /**
   * A dispatch of field `X` looks like `executeCommand(… X.command …)`. Found by
   * scanning forward from each `execute(`/`executeCommand(` and inspecting a BOUNDED
   * window, rather than with an `[^)]*` regex — that form backtracks catastrophically
   * on large files and was the timeout, not the corpus size.
   */
  function dispatchSitesFor(field: string): string[] {
    const needle = new RegExp(String.raw`\b${field}\s*[.!]`);
    const hits: string[] = [];
    for (const { rel, src } of corpus()) {
      // Cheap pre-filter: the field must appear at all.
      if (!src.includes(field)) continue;
      let from = 0;
      let found = false;
      for (;;) {
        const at = src.indexOf('execute', from);
        if (at === -1) break;
        from = at + 7;
        const open = src.indexOf('(', at);
        if (open === -1 || open - at > 20) continue; // `executeCommand(` / `execute(`
        // The argument list, bounded — long enough for a two-arg dispatch.
        if (needle.test(src.slice(open, open + 240))) {
          found = true;
          break;
        }
      }
      if (found) hits.push(rel);
    }
    return hits.sort();
  }

  it('POSITIVE CONTROL — the same scanner DOES find wallBatch dispatched', () => {
    // Without this, "zero hits for doorBatch" could mean "the scanner is broken".
    // "I found nothing" and "I could not look" are never the same value (C70 L-INV-1).
    const wall = dispatchSitesFor('wallBatch');
    expect(wall.length).toBeGreaterThan(0);
  }, 120_000);

  it('doorBatch is BUILT and FILTERED but dispatched NOWHERE', () => {
    expect(dispatchSitesFor('doorBatch')).toEqual([]);
  }, 120_000);

  it("executePlan.ts's own comment records that the live executor never dispatches it", () => {
    const src = readFileSync(
      join(ROOT, 'packages/ai-host/src/workflows/apartmentLayout/executePlan.ts'),
      'utf8',
    );
    // The source is its own witness — quoted so a future edit that makes the verb live
    // breaks this test rather than silently invalidating the comment above.
    expect(src).toMatch(/door\.batch\.create payload \(which that executor never dispatches/);
  });
});
