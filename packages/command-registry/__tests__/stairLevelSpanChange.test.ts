// @vitest-environment happy-dom
//
// ─── §STAIR-LEVEL-SPAN-CHANGE (L-1533) + §STAIR-VOID-FOLLOWS-SPAN (L-1532) ───
//
// FOUNDER (item 0.2): "Be able to change stair Base level + top level."
//
// ⛔ THESE TESTS DO NOT ASSERT THAT A FUNCTION WAS CALLED. They dispatch the real
// `UpdateStairParametersCommand` / `MoveStairCommand` and then read the stores
// the RENDERERS read: `openingStore` (what SlabFragmentBuilder triangulates into
// the slab void) and `floorStore.getById(f).serviceHoles` (the exact array
// FloorPanelBuilder feeds to THREE.Shape.holes). `FloorStore` and `CeilingStore`
// are the PRODUCTION classes, not doubles.
//
// Two defects are pinned here:
//   L-1533 — base/top level could not be changed at all after creation.
//   L-1432 — and when a stair MOVED or was re-parameterised, only its SLAB void
//            followed. The floor-finish and ceiling voids stayed at the old
//            footprint, and a void on a deck that LEFT the span stayed cut.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { UpdateStairParametersCommand } from '../src/stair/UpdateStairParametersCommand';
import { MoveStairCommand } from '../src/stair/MoveStairCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import { stairHostPierceId } from '../src/stair/StairHorizontalHostPiercing';
import { FloorStore, CeilingStore } from '@pryzm/core-app-model/stores';
import type { CommandContext } from '../src/types';

const DECK = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }];
const LEVELS = [
  { id: 'L0', elevation: 0,   name: 'Ground'  },
  { id: 'L1', elevation: 3.0, name: 'Level 1' },
  { id: 'L2', elevation: 6.0, name: 'Level 2' },
  { id: 'L3', elevation: 9.0, name: 'Level 3' },
];
const ALL = ['L1', 'L2', 'L3'];

function makeHarness() {
  const openings = new Map<string, any>();
  const stairs = new Map<string, any>();
  const slabs = new Map<string, any>();
  for (const l of ALL) {
    slabs.set(`slab-${l}`, {
      id: `slab-${l}`, levelId: l, position: { x: 0, y: 0, z: 0 },
      polygon: DECK.map(p => ({ x: p.x, y: p.z })), holes: [],
    });
  }
  const floorStore = new FloorStore();
  const ceilingStore = new CeilingStore();
  for (const l of ALL) {
    floorStore.add({
      id: `floor-${l}`, levelId: l, label: 'F', floorNumber: 'F-1',
      boundary: { polygon: DECK.map(p => ({ ...p })), baseOffset: 0, thickness: 0.05, detectionMethod: 'manual-polygon' },
      finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
      serviceHoles: [], coveredRoomIds: [], boundingWallIds: [], visible: true, properties: {},
      metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
    } as any);
    ceilingStore.add({
      id: `ceiling-${l}`, type: 'ceiling', levelId: l, label: 'C', ceilingNumber: 'C-1',
      boundary: { polygon: DECK.map(p => ({ ...p })), height: 2.6, baseOffset: 2.6, thickness: 0.02, detectionMethod: 'manual-polygon' },
      finishSpec: { finishColor: '#FFFFFF', finishPattern: 'none', exposedStructure: false },
      holeElements: [], coveredRoomIds: [], boundingWallIds: [], visible: true, properties: {},
      metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
    } as any);
  }
  const stores: any = {
    openingStore: {
      add: (o: any) => { openings.set(o.id, structuredClone(o)); },
      remove: (id: string) => { openings.delete(id); },
      update: (id: string, p: any) => { const o = openings.get(id); if (o) openings.set(id, { ...o, ...structuredClone(p) }); },
      get: (id: string) => openings.get(id),
      getById: (id: string) => openings.get(id),
      getByHostId: (h: string) => [...openings.values()].filter(o => o.hostId === h),
      getAll: () => [...openings.values()],
    },
    slabStore: {
      add: (s: any) => slabs.set(s.id, s), getAll: () => [...slabs.values()],
      getById: (id: string) => slabs.get(id), remove: (id: string) => slabs.delete(id), triggerRebuild: () => {},
    },
    stairStore: {
      add: (s: any) => { stairs.set(s.id, structuredClone(s)); },
      get: (id: string) => stairs.get(id), getById: (id: string) => stairs.get(id),
      update: (id: string, p: any) => { const s = stairs.get(id); if (s) stairs.set(id, { ...s, ...structuredClone(p) }); },
      remove: (id: string) => { stairs.delete(id); },
      restoreSnapshot: (s: any) => { stairs.set(s.id, structuredClone(s)); },
      getStairConnectingLevels: () => undefined, getAll: () => [...stairs.values()],
    },
    stairRailingStore: {
      add: () => {}, remove: () => {}, getByStairId: () => [], removeByStairId: () => {}, getAll: () => [],
    },
    floorStore, ceilingStore,
    wallStore: { getById: () => undefined, getWindow: () => undefined, getDoor: () => undefined, getLevels: () => LEVELS, getAll: () => [] },
  };
  const ctx = {
    stores,
    bimManager: { registerElement: () => {}, unregisterElement: () => {}, getLevelById: (id: string) => LEVELS.find(l => l.id === id) },
    projectContext: { activeLevelId: 'L0' },
  } as unknown as CommandContext;
  return { ctx, openings, stairs, floorStore, ceilingStore };
}

type H = ReturnType<typeof makeHarness>;

/**
 * A stair from Ground, 150 mm risers — the shape the plan tool draws.
 *
 * ⚠ `flightCount` DEFAULTS TO 2, AND THAT IS A MEASURED CONSTRAINT, NOT A STYLE
 * CHOICE. `checkStairGeometry`'s §L-1434 cap is on the rise of ONE FLIGHT
 * (`MAX_RISERS_PER_FLIGHT x MAX_RISER_HEIGHT` = 16 x 0.190 = 3.04 m). A
 * SINGLE-flight stair therefore cannot be re-pointed across a 6 m span at all —
 * the gate refuses it, correctly, and tells the user to add a landing. A
 * two-flight stair splits 6 m into 2 x 3.00 m and is accepted. The refusal is
 * exercised deliberately further down (`⭐ a span too tall for ONE flight`);
 * this helper builds the case that SHOULD succeed.
 */
function makeStair(h: H, id: string, topLevelId = 'L1', flightCount = 2): string {
  const storeys = LEVELS.findIndex(l => l.id === topLevelId);
  const total = 20 * storeys;
  const per = Math.floor(total / flightCount);
  const flights = Array.from({ length: flightCount }, (_, i) => ({
    direction: { x: 1, y: 0, z: 0 },
    riserCount: i === flightCount - 1 ? total - per * (flightCount - 1) : per,
  }));
  const input = {
    id, baseLevelId: 'L0', topLevelId, shape: 'I',
    riserHeight: 0.15, treadDepth: 0.28, width: 1.0,
    startPosition: { x: 0, y: 0, z: 0 },
    flights, landings: [],
  } as CreateStairInput;
  const res = new CreateStairCommand(input).execute(h.ctx);
  expect(res.success, `stair ${id} was not created: ${res.info?.join('; ')}`).toBe(true);
  return id;
}

const holesOf   = (h: H, l: string): string[] => h.floorStore.getById(`floor-${l}`)!.serviceHoles.map(x => x.id);
const cHolesOf  = (h: H, l: string): string[] => h.ceilingStore.getById(`ceiling-${l}`)!.holeElements.map(x => x.id);
const slabVoids = (h: H): string[] => [...h.openings.keys()].sort();

describe('§STAIR-LEVEL-SPAN-CHANGE (L-1533) — Base/Top level are editable after creation', () => {
  it('⭐ raising Top level L1 -> L2 RE-SOLVES the whole stair, it is not a field write', () => {
    const h = makeHarness();
    makeStair(h, 's1');
    expect(h.stairs.get('s1').riserCount).toBe(20);

    const cmd = new UpdateStairParametersCommand({ stairId: 's1', updates: { topLevelId: 'L2' } });
    const v = cmd.canExecute(h.ctx);
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(cmd.execute(h.ctx).success).toBe(true);

    const after = h.stairs.get('s1');
    expect(after.topLevelId).toBe('L2');
    // THE invariant CreateStairCommand.canExecute and StairValidationAuthority
    // both enforce: riserHeight x riserCount === rise, exactly. A field write
    // leaves this violated and the stair fails its own validator.
    expect(after.riserHeight * after.riserCount).toBeCloseTo(6.0, 9);
    expect(after.flights.reduce((s: number, f: any) => s + f.riserCount, 0)).toBe(after.riserCount);
    // and the riser stays near the architect's 150 mm choice, not the 175 mm default
    expect(after.riserHeight).toBeGreaterThan(0.145);
    expect(after.riserHeight).toBeLessThan(0.155);
  });

  it('changing Base level moves the stair off its old level, `levelId` included', () => {
    const h = makeHarness();
    makeStair(h, 's2', 'L2');
    expect(new UpdateStairParametersCommand({ stairId: 's2', updates: { baseLevelId: 'L1' } }).execute(h.ctx).success).toBe(true);
    const after = h.stairs.get('s2');
    expect(after.baseLevelId).toBe('L1');
    // `levelId` is what level isolation, plan projection and bimManager read —
    // leaving it behind strands the stair on a level it no longer starts from.
    expect(after.levelId).toBe('L1');
    expect(after.riserHeight * after.riserCount).toBeCloseTo(3.0, 9);
  });

  it('⭐ the voids FOLLOW to the new decks and are REMOVED from the ones the stair left', () => {
    const h = makeHarness();
    makeStair(h, 's3', 'L2');
    // Created spanning L0->L2: decks L1 and L2 are pierced, L3 is not.
    expect(slabVoids(h)).toEqual(
      [stairAutoOpeningId('s3', 'L1', 'L2'), stairAutoOpeningId('s3', 'L2', 'L2')].sort(),
    );
    expect(holesOf(h, 'L1')).toEqual([stairHostPierceId('s3', 'floor', 'floor-L1')]);
    expect(holesOf(h, 'L2')).toEqual([stairHostPierceId('s3', 'floor', 'floor-L2')]);
    expect(cHolesOf(h, 'L2')).toEqual([stairHostPierceId('s3', 'ceiling', 'ceiling-L2')]);

    // Shorten it to L0 -> L1. Everything on L2 must CLOSE.
    expect(new UpdateStairParametersCommand({ stairId: 's3', updates: { topLevelId: 'L1' } }).execute(h.ctx).success).toBe(true);

    expect(holesOf(h, 'L1'), 'L1 finish lost its void').toEqual([stairHostPierceId('s3', 'floor', 'floor-L1')]);
    expect(holesOf(h, 'L2'), 'L2 finish kept a hole for a stair that no longer reaches it').toEqual([]);
    expect(cHolesOf(h, 'L2'), 'L2 ceiling kept a hole').toEqual([]);
    expect(
      slabVoids(h),
      'a slab void stayed cut on a deck the stair left — a permanent hole in a finished floor',
    ).toEqual([stairAutoOpeningId('s3', 'L1', 'L1')]);
  });

  it('ONE undo reverts the level change AND every void it moved', () => {
    const h = makeHarness();
    makeStair(h, 's4', 'L2');
    const voidsBefore = slabVoids(h);
    const f1 = holesOf(h, 'L1');
    const f2 = holesOf(h, 'L2');
    const c2 = cHolesOf(h, 'L2');

    const cmd = new UpdateStairParametersCommand({ stairId: 's4', updates: { topLevelId: 'L1' } });
    expect(cmd.execute(h.ctx).success).toBe(true);
    expect(cmd.undo(h.ctx).success).toBe(true);

    const after = h.stairs.get('s4');
    expect(after.topLevelId).toBe('L2');
    expect(after.riserHeight * after.riserCount).toBeCloseTo(6.0, 9);
    expect(slabVoids(h), 'slab voids not restored').toEqual(voidsBefore);
    expect(holesOf(h, 'L1'), 'L1 finish void not restored').toEqual(f1);
    expect(holesOf(h, 'L2'), 'L2 finish void not restored').toEqual(f2);
    expect(cHolesOf(h, 'L2'), 'L2 ceiling void not restored').toEqual(c2);
  });

  it('redo (= re-execute) reaches the same state — CommandManager.redo never re-validates', () => {
    const h = makeHarness();
    makeStair(h, 's5', 'L2');
    const cmd = new UpdateStairParametersCommand({ stairId: 's5', updates: { topLevelId: 'L1' } });
    cmd.execute(h.ctx);
    const first = structuredClone(h.stairs.get('s5'));
    const voidsFirst = slabVoids(h);
    cmd.undo(h.ctx);
    expect(cmd.execute(h.ctx).success).toBe(true);
    expect(h.stairs.get('s5').topLevelId).toBe(first.topLevelId);
    expect(h.stairs.get('s5').riserCount).toBe(first.riserCount);
    expect(slabVoids(h)).toEqual(voidsFirst);
  });
});

describe('§STAIR-LEVEL-SPAN-CHANGE — every refusal names BOTH numbers', () => {
  it('base === top is refused, and the stair is NOT mutated', () => {
    const h = makeHarness();
    makeStair(h, 'sr', 'L1');
    const cmd = new UpdateStairParametersCommand({ stairId: 'sr', updates: { topLevelId: 'L0' } });
    const v = cmd.canExecute(h.ctx);
    expect(v.ok).toBe(false);
    expect(v.reason, v.reason).toMatch(/different levels/i);
    // execute() refuses identically — the redo path never calls canExecute.
    expect(cmd.execute(h.ctx).success).toBe(false);
    expect(h.stairs.get('sr').topLevelId, 'a refused change still mutated the stair').toBe('L1');
  });

  it('a top level BELOW the base is refused with BOTH elevations, never silently flipped', () => {
    const h = makeHarness();
    makeStair(h, 'sd', 'L2');
    const v = new UpdateStairParametersCommand({ stairId: 'sd', updates: { baseLevelId: 'L3' } }).canExecute(h.ctx);
    expect(v.ok).toBe(false);
    expect(v.reason, v.reason).toContain('9.000');   // what was asked (the new base)
    expect(v.reason, v.reason).toContain('6.000');   // the limit it violates (the top)
  });

  it('an unknown level id is refused, and the message lists the levels that DO exist', () => {
    const h = makeHarness();
    makeStair(h, 'sx', 'L1');
    const v = new UpdateStairParametersCommand({ stairId: 'sx', updates: { topLevelId: 'L99' } }).canExecute(h.ctx);
    expect(v.ok).toBe(false);
    expect(v.reason, v.reason).toContain('L99');
    expect(v.reason, v.reason).toContain('L0, L1, L2, L3');
  });

  it('⭐ a span too tall for ONE flight is refused by the §L-1434 rise cap, with both metres', () => {
    // L0 -> L3 is 9 m in a single I-shape run; maxFlightRise = 16 x 0.190 = 3.04 m.
    const h = makeHarness();
    makeStair(h, 'st', 'L1', 1);   // ONE flight — the whole rise lands in Run 1
    const v = new UpdateStairParametersCommand({ stairId: 'st', updates: { topLevelId: 'L3' } }).canExecute(h.ctx);
    expect(v.ok).toBe(false);
    expect(v.reason, v.reason).toContain('9.00');     // what was asked
    expect(v.reason, v.reason).toContain('3.04');     // the limit
    expect(v.reason, v.reason).toMatch(/landing/i);   // and what to DO about it
  });

  it('⭐ a SINGLE-flight stair cannot be re-pointed a whole extra storey — and says why', () => {
    // Measured, not assumed: 6.00 m in one run is above the 3.04 m one-flight cap,
    // so "raise Top level by one storey" is only available to a stair that has a
    // landing to split the rise. The refusal is the correct answer, and it names
    // both numbers AND the action.
    const h = makeHarness();
    makeStair(h, 'sf', 'L1', 1);
    const v = new UpdateStairParametersCommand({ stairId: 'sf', updates: { topLevelId: 'L2' } }).canExecute(h.ctx);
    expect(v.ok).toBe(false);
    expect(v.reason, v.reason).toContain('6.00');
    expect(v.reason, v.reason).toContain('3.04');
    expect(v.reason, v.reason).toMatch(/add a landing/i);
  });

  it('naming the levels the stair already has is a no-op, not a refusal', () => {
    const h = makeHarness();
    makeStair(h, 'sn', 'L1');
    const cmd = new UpdateStairParametersCommand({ stairId: 'sn', updates: { baseLevelId: 'L0', topLevelId: 'L1' } });
    expect(cmd.canExecute(h.ctx).ok).toBe(true);
    expect(cmd.execute(h.ctx).success).toBe(true);
    expect(h.stairs.get('sn').riserCount).toBe(20);
  });
});

describe('§STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — a MOVE drags EVERY family', () => {
  it('⭐ moving a stair moves its floor-finish void, not only its slab void', () => {
    const h = makeHarness();
    makeStair(h, 'sm', 'L1');
    const before = h.floorStore.getById('floor-L1')!.serviceHoles[0]!;
    expect(before, 'no floor void to begin with').toBeDefined();
    const xsBefore = before.polygon!.map(p => p.x);

    expect(new MoveStairCommand({ stairId: 'sm', delta: { x: 4, z: 0 } }).execute(h.ctx).success).toBe(true);

    const after = h.floorStore.getById('floor-L1')!.serviceHoles[0]!;
    expect(after, 'the floor void vanished instead of moving').toBeDefined();
    const xsAfter = after.polygon!.map(p => p.x);
    // Pre-fix these were IDENTICAL: MoveStairCommand re-reconciled the SLAB void
    // and never called the horizontal-host piercer at all (zero call sites).
    expect(xsAfter, 'the floor-finish void stayed at the OLD footprint').not.toEqual(xsBefore);
    for (let i = 0; i < xsAfter.length; i++) expect(xsAfter[i]!).toBeCloseTo(xsBefore[i]! + 4, 6);
    // Exactly ONE void — a re-pierce must never leave a second hole behind.
    expect(h.floorStore.getById('floor-L1')!.serviceHoles.length).toBe(1);
  });

  it('undoing the move puts every void back', () => {
    const h = makeHarness();
    makeStair(h, 'sm2', 'L1');
    const f = structuredClone(h.floorStore.getById('floor-L1')!.serviceHoles);
    const c = structuredClone(h.ceilingStore.getById('ceiling-L1')!.holeElements);
    const mv = new MoveStairCommand({ stairId: 'sm2', delta: { x: 4, z: 0 } });
    expect(mv.execute(h.ctx).success).toBe(true);
    expect(mv.undo(h.ctx).success).toBe(true);
    expect(h.floorStore.getById('floor-L1')!.serviceHoles).toEqual(f);
    expect(h.ceilingStore.getById('ceiling-L1')!.holeElements).toEqual(c);
  });

  it('MoveStairCommand DECLARES the floor + ceiling stores it now writes (C03 §4.6 U-2)', () => {
    const declared = new MoveStairCommand({ stairId: 'x', delta: { x: 0, z: 0 } }).affectedStores;
    expect([...declared]).toEqual(['stair', 'opening', 'slab', 'floor', 'ceiling']);
  });

  it('UpdateStairParametersCommand declares them too', () => {
    const declared = new UpdateStairParametersCommand({ stairId: 'x', updates: {} }).affectedStores;
    expect([...declared]).toEqual(['stair', 'opening', 'slab', 'floor', 'ceiling']);
  });
});
