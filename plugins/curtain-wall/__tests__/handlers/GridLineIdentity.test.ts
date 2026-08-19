// §L-1051 / §L-1052 — GRID-LINE IDENTITY, MEASURED AT THE LAYER THE USER REACHES.
//
// C87 §11 row 5 says `migrateToGridSystem` mints `crypto.randomUUID()` at :94/:99
// and calls that a C73 §1.1 determinism violation. It is. But "the ids differ" is
// not a thing a user can see, so this file drives the two bus verbs the property
// panel actually dispatches (`CurtainGridEditor.ts:125` → `curtain-wall.addGridLine`,
// `:185` → `curtain-wall.removeGridLine`) through the REAL `CommandBus` with the
// REAL handlers and the REAL DTO store, and asks what the user gets back.
//
// TWO DEFECTS, and the second is the one that bites first:
//
//   L-1051 — NON-DETERMINISM. Two `migrateToGridSystem` calls on the same wall
//     produced disjoint id sets, so a `gridLineId` the panel read from ITS
//     migration could never match the one the handler recomputed in ITS migration.
//     The × button on a wall with no stored `gridSystem` removed nothing, reported
//     success, and said nothing.
//
//   L-1052 — A CONSTANT-UNDEFINED READ, seventh of its class in this family.
//     `AddCurtainGridLine.ts:88` and `RemoveCurtainGridLine.ts:96` read
//     `(cw as any).gridXSpacing` / `.gridYSpacing` off `ctx.stores.curtainwall` —
//     the L0-parsed DTO record, whose spacing fields are `bayWidth` / `bayHeight`
//     (`packages/schemas/src/elements/CurtainWall.ts:91,93`). `gridXSpacing` appears
//     NOWHERE on that schema. So both reads were `undefined` on EVERY execution,
//     `Math.floor(length / undefined)` is NaN, `Math.max(1, NaN)` is NaN, and
//     `for (i = 0; i <= NaN; i++)` never runs — the migration returned
//     `{uLines: [], vLines: []}`, an INVALID grid by the module's own stated
//     invariant (`CurtainGridSystem.ts:63-65`: "Must always have at least 2 uLines
//     and 2 vLines"). The `as any` at both sites is what blinded `tsc` (C84 EI-2c).
//
// The undo consequence is why this is not cosmetic. C87 §6 records `addGridLine` /
// `removeGridLine` as the two curtain-wall verbs whose 2-segment patch path
// "survives" and "works today". It does survive — and what it carries to the
// AUTHORITATIVE legacy `CurtainWallStore` on a redo is that empty grid, which
// `CurtainWallBuilder` reads as truthy and turns into zero cells.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores } from '@pryzm/plugin-sdk';
import { migrateToGridSystem, type CurtainGridSystem } from '@pryzm/geometry-curtain-wall';
import { CurtainWallStore, type CurtainWallsState } from '../../src/store.js';
import { buildCurtainWallHandlerSet } from '../../src/handlers/index.js';

function buildEnv() {
  const cw = new CurtainWallStore();
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ curtainwall: Object.fromEntries(cw.getState()) as CurtainWallsState }),
  });
  for (const h of buildCurtainWallHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, { curtainwall: cw as unknown as import('@pryzm/stores').Store<object> });
  return { cw, bus, detach };
}

const A = { x: 0, y: 0, z: 0 };
const B = { x: 6, y: 0, z: 0 };

/** Creates a wall through the REAL verb and returns the id the handler minted.
 *  The id is NOT supplied by the caller: `CurtainWall.parse` enforces
 *  `^curtainwall_<ulid>$`, so a hand-written id is rejected — which is itself a
 *  small proof that this test is driving the real schema and not a stand-in. */
async function createWall(bus: CommandBus, cw: CurtainWallStore): Promise<string> {
  const before = new Set(cw.ids());
  await bus.executeCommand('curtain-wall.create', {
    levelId: 'L0',
    baseLine: [A, B],
    height: 3,
    bayWidth: 1.5,
    bayHeight: 1.5,
  });
  const id = cw.ids().find(i => !before.has(i));
  if (!id) throw new Error('curtain-wall.create did not add a record');
  return id;
}

function gridOf(cw: CurtainWallStore, id: string): CurtainGridSystem | undefined {
  return (cw.get(id) as unknown as { gridSystem?: CurtainGridSystem } | undefined)?.gridSystem;
}

describe('§L-1051 — migrateToGridSystem is a pure function of the model (C73 §1.1)', () => {
  it('returns the SAME grid-line ids for the same wall on every call', () => {
    const a = migrateToGridSystem(6, 3, 1.5, 1.5, 'cw-42');
    const b = migrateToGridSystem(6, 3, 1.5, 1.5, 'cw-42');
    expect(b.uLines.map(l => l.id)).toEqual(a.uLines.map(l => l.id));
    expect(b.vLines.map(l => l.id)).toEqual(a.vLines.map(l => l.id));
    // …and the topology it was already trusted for is unchanged: 6 / 1.5 = 4 bays
    // ⇒ 5 u-lines, 3 / 1.5 = 2 bays ⇒ 3 v-lines, boundaries at t=0 and t=1.
    expect(a.uLines.map(l => l.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(a.vLines.map(l => l.t)).toEqual([0, 0.5, 1]);
  });

  it('gives DIFFERENT walls different ids, so ids stay unique across a project', () => {
    const a = migrateToGridSystem(6, 3, 1.5, 1.5, 'cw-1');
    const b = migrateToGridSystem(6, 3, 1.5, 1.5, 'cw-2');
    expect(new Set([...a.uLines, ...b.uLines].map(l => l.id)).size)
      .toBe(a.uLines.length + b.uLines.length);
  });

  it('never returns an INVALID grid when the spacings are unusable', () => {
    // The module's own invariant (CurtainGridSystem.ts:63-65) is >= 2 lines per axis.
    const bad = migrateToGridSystem(6, 3, undefined as unknown as number, NaN, 'cw-bad');
    expect(bad.uLines.length).toBeGreaterThanOrEqual(2);
    expect(bad.vLines.length).toBeGreaterThanOrEqual(2);
    expect(bad.uLines[0]!.t).toBe(0);
    expect(bad.uLines[bad.uLines.length - 1]!.t).toBe(1);
  });
});

describe('§L-1052 — the grid-line verbs read the fields the DTO record actually has', () => {
  it('addGridLine on a wall with no stored gridSystem produces a VALID grid', async () => {
    const env = buildEnv();
    const id = await createWall(env.bus, env.cw);

    // Precondition, asserted rather than assumed: the DTO record carries the L0
    // spacing names and NOT the legacy ones. This is the whole defect.
    const rec = env.cw.get(id) as unknown as Record<string, unknown>;
    expect(rec.bayWidth).toBe(1.5);
    expect(rec.gridXSpacing).toBeUndefined();
    expect(rec.gridSystem).toBeUndefined();

    await env.bus.executeCommand('curtain-wall.addGridLine', {
      curtainWallId: id, axis: 'u', t: 0.6,
    });

    const grid = gridOf(env.cw, id);
    expect(grid).toBeDefined();
    // Before the fix this was `{uLines: [{t:0.6}], vLines: []}` — one orphan line
    // on an axis with no boundaries, and a v-axis with no lines at all.
    expect(grid!.vLines.length).toBeGreaterThanOrEqual(2);
    expect(grid!.uLines.map(l => l.t)).toEqual([0, 0.25, 0.5, 0.6, 0.75, 1]);
    env.detach();
  });

  it('removeGridLine removes the line the panel showed the user', async () => {
    const env = buildEnv();
    const id = await createWall(env.bus, env.cw);

    // What `CurtainGridEditor.resolveGrid()` computes for its × buttons when the
    // record has no stored gridSystem — the SAME call, from the panel's side.
    const asShownToTheUser = migrateToGridSystem(6, 3, 1.5, 1.5, id);
    const target = asShownToTheUser.uLines.find(l => l.t > 0.001 && l.t < 0.999)!;

    await env.bus.executeCommand('curtain-wall.removeGridLine', {
      curtainWallId: id, axis: 'u', gridLineId: target.id,
    });

    const grid = gridOf(env.cw, id);
    expect(grid).toBeDefined();
    // The line the user clicked is gone. Before the fix the handler recomputed a
    // migration with FRESH uuids (and, via L-1052, an empty one), so `target.id`
    // matched nothing and the click was a silent no-op reported as success.
    expect(grid!.uLines.some(l => l.id === target.id)).toBe(false);
    expect(grid!.uLines.map(l => l.t)).toEqual([0, 0.5, 0.75, 1]);
    env.detach();
  });
});
