// wall.updateHeightBatch — PROBE + PROOF (VERBS-CMD, 2026-08-11).
//
// THE SENTENCE THAT HAD NO ROUTE: "Raise all exterior walls to 3.2 m" — the
// founder's own worked example. Every height verb on the bus was
// SELECTION-SCOPED (`wall.setDimensions` / `wall.updateDimensions` take one
// `wallId`), so "all walls" had no expression at the command layer at all.
//
// WHAT THIS SUITE PROVES, AND THE TRAP IT AVOIDS:
// The W3-3 dead-verb commit (5e74b178) found tests that "passed" while
// asserting against the DETACHED plugin DTO store — the store production
// bootstrap hands the bus and which nothing renders, persists or exports.
// `wall.updateDimensions` was moved out of this plugin's handler set entirely
// for exactly that reason (§FIX-DIMS-REACH-RECORD, L-815). So this suite reads
// height back out of a stand-in for the AUTHORITATIVE geometry `wallStore`,
// through the REAL `UpdateWallHeightCommand`, and never inspects `WallsState`.

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { buildWallHandlerSet } from '../src/handlers/index.js';
import {
  WALL_HEIGHT_BATCH_REPORT_EVENT,
  type WallHeightBatchReport,
} from '../src/handlers/UpdateWallsHeightBatch.js';

interface WallRec {
  id: string;
  height: number;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  openings?: unknown[];
  childrenIds?: string[];
}

/** Stand-in for the AUTHORITATIVE geometry wallStore. `updateWall` is
 *  full-replacement and `restoreSnapshot` is what `UpdateWallHeightCommand.undo()`
 *  calls — the two methods whose symmetry its §2.2/§2.3 fix established. */
class FakeWallStore {
  private walls = new Map<string, WallRec>();
  seed(...ws: WallRec[]): void {
    for (const w of ws) this.walls.set(w.id, JSON.parse(JSON.stringify(w)) as WallRec);
  }
  getAll(): WallRec[] {
    return [...this.walls.values()].map((w) => JSON.parse(JSON.stringify(w)) as WallRec);
  }
  getById(id: string): WallRec | undefined {
    const w = this.walls.get(id);
    return w ? (JSON.parse(JSON.stringify(w)) as WallRec) : undefined;
  }
  updateWall(next: WallRec): void {
    this.walls.set(next.id, JSON.parse(JSON.stringify(next)) as WallRec);
  }
  restoreSnapshot(snap: WallRec): void {
    this.walls.set(snap.id, JSON.parse(JSON.stringify(snap)) as WallRec);
  }
  heightOf(id: string): number | undefined {
    return this.walls.get(id)?.height;
  }
}

function makeCommandManager(wallStore: FakeWallStore) {
  const stack: Array<{ undo(ctx: unknown): unknown }> = [];
  const ctx = { stores: { wallStore } };
  return {
    execute(cmd: unknown) {
      const c = cmd as {
        canExecute?(ctx: unknown): { ok: boolean; reason?: string };
        execute(ctx: unknown): { success: boolean; affectedElementIds: string[]; info?: string[] };
        undo(ctx: unknown): unknown;
      };
      const v = c.canExecute?.(ctx);
      if (v && !v.ok) return { success: false, affectedElementIds: [], error: v.reason };
      const res = c.execute(ctx);
      if (res.success) stack.push(c);
      return res;
    },
    undoLast() {
      const c = stack.pop();
      if (!c) throw new Error('nothing to undo');
      return c.undo(ctx);
    },
    depth: () => stack.length,
  };
}

function wall(id: string, height: number): WallRec {
  return {
    id,
    height,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    openings: [],
    childrenIds: [],
  };
}

function buildBus() {
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ wall: {} }),
  });
  for (const h of buildWallHandlerSet()) bus.register(h);
  return bus;
}

const g = globalThis as unknown as { window?: unknown };
const savedWindow = g.window;

/** Captures the honest-reporting CustomEvent the bridge broadcasts. */
function captureReports(): WallHeightBatchReport[] {
  const seen: WallHeightBatchReport[] = [];
  (globalThis as unknown as { window: { dispatchEvent(e: unknown): boolean } }).window.dispatchEvent =
    (e: unknown) => {
      const ev = e as { type?: string; detail?: WallHeightBatchReport };
      if (ev?.type === WALL_HEIGHT_BATCH_REPORT_EVENT && ev.detail) seen.push(ev.detail);
      return true;
    };
  return seen;
}

describe('wall.updateHeightBatch', () => {
  afterEach(() => {
    if (savedWindow === undefined) delete g.window;
    else g.window = savedWindow;
  });

  // ── THE PROBE ──────────────────────────────────────────────────────────────
  it('is registered as a bus verb at all', () => {
    expect(buildBus().has('wall.updateHeightBatch')).toBe(true);
  });

  it("scope 'all' raises EVERY wall in the AUTHORITATIVE store", async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4), wall('w2', 2.4), wall('w3', 3.0));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };
    captureReports();

    // BEFORE — the founder's sentence has no effect anyone can point at.
    expect(wallStore.heightOf('w1')).toBe(2.4);

    await buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 });

    // AFTER — read back out of the geometry store, not the plugin DTO store.
    expect(wallStore.heightOf('w1')).toBe(3.2);
    expect(wallStore.heightOf('w2')).toBe(3.2);
    expect(wallStore.heightOf('w3')).toBe(3.2);
  });

  it('an explicit id list raises ONLY those walls (the "exterior walls" subset)', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('ext1', 2.4), wall('ext2', 2.4), wall('int1', 2.4));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };
    captureReports();

    await buildBus().executeCommand('wall.updateHeightBatch', {
      wallIds: ['ext1', 'ext2'],
      height: 3.2,
    });

    expect(wallStore.heightOf('ext1')).toBe(3.2);
    expect(wallStore.heightOf('ext2')).toBe(3.2);
    expect(wallStore.heightOf('int1')).toBe(2.4); // untouched
  });

  // ── ONE UNDO ENTRY, REVERSING THE RIGHT THING (brief rule 2) ───────────────
  it('the whole batch is ONE undo entry and undo restores every prior height', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4), wall('w2', 2.7), wall('w3', 3.0));
    const cm = makeCommandManager(wallStore);
    g.window = { __pryzmInitComplete: true, commandManager: cm, wallStore };
    captureReports();

    await buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 });
    expect(cm.depth()).toBe(1); // ← N walls, ONE history entry
    expect(wallStore.heightOf('w2')).toBe(3.2);

    cm.undoLast();
    // Each wall returns to its OWN prior height, not a shared one.
    expect(wallStore.heightOf('w1')).toBe(2.4);
    expect(wallStore.heightOf('w2')).toBe(2.7);
    expect(wallStore.heightOf('w3')).toBe(3.0);
  });

  // ── REFUSALS — with BOTH numbers, never a silent clamp (brief rule 5) ──────
  it('refuses a height above the maximum, naming both numbers', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };

    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 50 }),
    ).rejects.toThrow(/cannot be taller than 20 m; 50 m was requested/);
    expect(wallStore.heightOf('w1')).toBe(2.4); // nothing written
  });

  it('refuses a height below the minimum, naming both numbers', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };

    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 0.1 }),
    ).rejects.toThrow(/cannot be shorter than 0.3 m; 0.1 m was requested/);
    expect(wallStore.heightOf('w1')).toBe(2.4);
  });

  it('refuses a malformed scope', async () => {
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => {} }, wallStore: new FakeWallStore() };
    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'everything', height: 3 }),
    ).rejects.toThrow(/wallIds must be/);
  });

  // ── HONEST REPORTING (§CONTEXT-DATA-HONESTY) ───────────────────────────────
  it('an empty project is a VISIBLE decline, not a silent success', async () => {
    const wallStore = new FakeWallStore(); // no walls
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };
    const reports = captureReports();

    // §FIX-BATCH-REFUSAL-DISCARDED (L-1141) — the DISCRIMINANT. This used to
    // RESOLVE, so at the dispatch site "no walls exist" was indistinguishable
    // from "every wall was raised".
    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 }),
    ).rejects.toThrow(/no walls in this project/);

    // The event was never the defect — its detail is byte-identical to before.
    expect(reports).toHaveLength(1);
    expect(reports[0]?.success).toBe(false);
    expect(reports[0]?.outcome).toBe('refused');
    expect(reports[0]?.info[0]).toMatch(/no walls in this project/);
  });

  it('unknown ids are reported as skipped, and the known ones still apply', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };
    const reports = captureReports();

    await buildBus().executeCommand('wall.updateHeightBatch', {
      wallIds: ['w1', 'w_ghost'],
      height: 3.2,
    });

    expect(wallStore.heightOf('w1')).toBe(3.2);
    expect(reports[0]?.success).toBe(true);
    expect(reports[0]?.info.join(' ')).toMatch(/Raised 1 of 2 walls to 3.2 m — 1 skipped/);
    expect(reports[0]?.info.join(' ')).toMatch(/1× wall not found/);
  });

  // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — an absent sink used to emit NOTHING,
  // and ZeroTokenChatBridge read "no report" as { ok: true } and printed "Done"
  // over a model nothing had touched (C68 §5.g).
  it('a missing command manager reports INDETERMINATE, never silence', async () => {
    g.window = { __pryzmInitComplete: true };
    const reports = captureReports();

    // §FIX-BATCH-REFUSAL-DISCARDED (L-1141) — an absent sink must reach the BUS
    // CALLER, not only the CustomEvent listener.
    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 }),
    ).rejects.toThrow(/command manager is not available/);

    expect(reports).toHaveLength(1);
    expect(reports[0]?.outcome).toBe('indeterminate');
    expect(reports[0]?.info[0]).toMatch(/did not run/);
    expect(reports[0]?.info[0]).toMatch(/nothing about the model is confirmed/);
  });

  it('a missing wall store cannot resolve "all" and reports INDETERMINATE', async () => {
    g.window = { __pryzmInitComplete: true, commandManager: { execute: () => ({ success: true, affectedElementIds: [] }) } };
    const reports = captureReports();

    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 }),
    ).rejects.toThrow(/"all walls" could not be resolved/);

    expect(reports[0]?.outcome).toBe('indeterminate');
    expect(reports[0]?.info[0]).toMatch(/"all walls" could not be resolved/);
  });

  // ── §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18) ──────────────────
  //
  // THE CASE THE SUITE NEVER HAD. `CommandManagerImpl.execute` returns a legacy
  // refusal as `{success:false, info:[reason]}` WITHOUT THROWING (:172-185). The
  // bridge ignored that return value, so a batch the command refused OUTRIGHT
  // reached the bus as the same `{forward:[],inverse:[]}` a full success
  // returns. Only ZeroTokenChatBridge — which happens to subscribe to the
  // CustomEvent — could tell the two apart; BatchCoordinator, a plan step and
  // every script read unconditional success.
  //
  // The assertion is on the DISCRIMINANT (rejected vs resolved) and on the
  // command's OWN sentence. Never "it did not throw" — that is precisely the
  // assertion that let this defect live.
  it('a sink that REFUSES WITHOUT THROWING rejects, carrying the command’s own sentence', async () => {
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4));
    const REASON = 'A raked wall cannot take a uniform height.';
    g.window = {
      __pryzmInitComplete: true,
      wallStore,
      commandManager: {
        // Returns a refusal as a VALUE — the real legacy shape.
        execute: () => ({ success: false, affectedElementIds: [], info: [REASON] }),
      },
    };
    const reports = captureReports();

    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: ['w1'], height: 3.2 }),
    ).rejects.toThrow(REASON);

    // The refusal names the VERB too, so a caller can route it.
    const err = await buildBus()
      .executeCommand('wall.updateHeightBatch', { wallIds: ['w1'], height: 3.2 })
      .then(() => null, (e: unknown) => e as Error);
    expect(err?.message).toContain('wall.updateHeightBatch');

    // The model is untouched, and the event still carried the verdict.
    expect(wallStore.heightOf('w1')).toBe(2.4);
    expect(reports[0]?.success).toBe(false);
    expect(reports[0]?.outcome).toBe('refused');
  });

  it('an UNREADABLE result rejects as INDETERMINATE — not as a refusal, not as success', async () => {
    // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO. The sink returns something with no
    // readable `affectedElementIds`. "WHICH walls changed is not known" must not
    // reach the caller as a clean success.
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4));
    g.window = {
      __pryzmInitComplete: true,
      wallStore,
      commandManager: { execute: () => undefined },
    };
    const reports = captureReports();

    await expect(
      buildBus().executeCommand('wall.updateHeightBatch', { wallIds: ['w1'], height: 3.2 }),
    ).rejects.toThrow(/no readable result/);

    expect(reports[0]?.outcome).toBe('indeterminate');
  });

  it('SUCCESS PATH UNCHANGED — an applied batch still RESOLVES and still reports', async () => {
    // The other half of the proof: the fix must be invisible on the happy path.
    const wallStore = new FakeWallStore();
    wallStore.seed(wall('w1', 2.4), wall('w2', 2.4));
    g.window = { __pryzmInitComplete: true, commandManager: makeCommandManager(wallStore), wallStore };
    const reports = captureReports();

    await buildBus().executeCommand('wall.updateHeightBatch', { wallIds: 'all', height: 3.2 });

    expect(wallStore.heightOf('w1')).toBe(3.2);
    expect(wallStore.heightOf('w2')).toBe(3.2);
    expect(reports[0]?.success).toBe(true);
    expect(reports[0]?.outcome).toBe('applied');
  });
});
