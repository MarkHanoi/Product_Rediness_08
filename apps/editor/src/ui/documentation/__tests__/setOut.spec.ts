// §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — the four guards, at the OUTCOME.
//
//   add a door      → exactly ONE new tag, no duplicates
//   delete it       → its tag is GONE, no orphans
//   change the crop → the annotation set matches the VISIBLE set exactly
//   run it TWICE    → nothing changes the second time
//
// The whole correctness argument is IDEMPOTENCE: if a settled view writes nothing, then
// "live" is just "run it on every flush", and there is no incremental state to get wrong.
// These tests are that argument, executed.

import { describe, it, expect, beforeEach, vi } from 'vitest';

let VIEW_DEF: Record<string, unknown>;
let WALLS: unknown[];

const wallStore = { getAll: () => WALLS };

vi.mock('@pryzm/core-app-model', async (orig) => {
  const actual = await orig<typeof import('@pryzm/core-app-model')>();
  return {
    ...actual,
    storeRegistry: { getStoreForType: (t: string) => (t === 'wall' ? wallStore : undefined) },
    viewDefinitionStore: { get: (id: string) => (id === 'v1' ? VIEW_DEF : undefined), has: () => true },
    elementCodeStore: { getCode: () => undefined },
    doorSystemTypeStore: { getById: () => ({ name: 'Solid Timber' }) },
    windowSystemTypeStore: { getById: () => ({ name: 'Timber Casement' }) },
  };
});
vi.mock('@pryzm/geometry-wall', () => ({
  wallSystemTypeStore: { getById: () => ({ name: 'WallA' }) },
}));

import { annotationStore } from '@pryzm/plugin-annotations';
import { reconcileSetOutView, visibleElementIds, setOutIntentOf } from '../setOut';

const runtime = { events: { emit: vi.fn() } } as never;

const DOOR = { elementId: 'door_1', type: 'door', offset: 4, width: 1, height: 2.1, sillHeight: 0, mark: 'DO-00-001', systemTypeId: 'dt' };
const WIN = { elementId: 'win_1', type: 'window', offset: 7, width: 1.2, height: 1.4, sillHeight: 0.9, mark: 'WN-00-001', systemTypeId: 'wt' };

/** Two walls on L0: one at z=0 (x 0..10), one far away at z=40 (x 30..40). */
function walls(openings: unknown[] = [DOOR, WIN]) {
  return [
    {
      id: 'wall_1', levelId: 'L0', height: 3, systemTypeId: 'wst', properties: { mark: 'WA-00-001' },
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
      openings,
    },
    {
      id: 'wall_far', levelId: 'L0', height: 3, systemTypeId: 'wst', properties: { mark: 'WA-00-002' },
      baseLine: [{ x: 30, y: 0, z: 40 }, { x: 40, y: 0, z: 40 }],
      openings: [],
    },
  ];
}

const PLAN_VIEW = {
  id: 'v1',
  viewType: 'plan',
  spatial: { levelId: 'L0' },
  setOut: { live: true },
};

beforeEach(() => {
  annotationStore.clear();
  WALLS = walls();
  VIEW_DEF = { ...PLAN_VIEW };
  const w = window as unknown as Record<string, unknown>;
  w.annotationStore = annotationStore;
  w.wallStore = wallStore;
  w.doorStore = { getById: (id: string) => (id === 'door_1' ? DOOR : undefined) };
  w.windowStore = { getById: (id: string) => (id === 'win_1' ? WIN : undefined) };
  w.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground', elevation: 0 }] };
  w.commandManager = {
    execute: (cmd: { canExecute?: (c: unknown) => { ok: boolean }; execute: (c: unknown) => unknown }) => {
      const v = cmd.canExecute?.({});
      if (v && !v.ok) return;
      cmd.execute({});
    },
  };
  w.runtime = { bus: { ringBuffer: { push: () => {} } } };
});

const tagIds = () => annotationStore.getByView('v1').map((a) => a.parameters.elementId as string).sort();

describe('Set Out is a VIEW INTENT, not a mode flag (P7 / C09)', () => {
  it('is opt-in: a view with no opinion is not live', () => {
    expect(setOutIntentOf('v1')).toEqual({ live: true });
    VIEW_DEF = { id: 'v1', viewType: 'plan', spatial: { levelId: 'L0' } };
    expect(setOutIntentOf('v1')).toBeUndefined();
  });
});

describe('VISIBILITY is the input, not the model', () => {
  it('an uncropped plan shows every wall + opening on its level', () => {
    expect([...visibleElementIds('v1')!].sort()).toEqual(['door_1', 'wall_1', 'wall_far', 'win_1']);
  });

  it('a CROP shrinks the visible set — the far wall is no longer shown', () => {
    VIEW_DEF = { ...PLAN_VIEW, crop: { enabled: true, region: { min: [-5, -5], max: [15, 15] } } };
    expect([...visibleElementIds('v1')!].sort()).toEqual(['door_1', 'wall_1', 'win_1']);
  });
});

describe('the four guards', () => {
  it('ADD A DOOR → exactly ONE new tag, no duplicates', () => {
    reconcileSetOutView(runtime, 'v1');
    const before = annotationStore.getByView('v1').length;

    WALLS = walls([DOOR, WIN, { ...DOOR, elementId: 'door_2', offset: 1, mark: 'DO-00-002' }]);
    const created = reconcileSetOutView(runtime, 'v1');

    expect(created).toBe(1);
    expect(annotationStore.getByView('v1')).toHaveLength(before + 1);
    expect(tagIds().filter((id) => id === 'door_2')).toHaveLength(1);
  });

  it('DELETE IT → its tag is GONE, and nothing else is touched', () => {
    reconcileSetOutView(runtime, 'v1');
    expect(tagIds()).toContain('door_1');

    WALLS = walls([WIN]);                       // the user deletes the door
    reconcileSetOutView(runtime, 'v1');

    expect(tagIds()).not.toContain('door_1');   // no orphan left behind
    expect(tagIds()).toContain('win_1');        // …and the window is untouched
  });

  it('CHANGE THE CROP → the annotation set matches the VISIBLE set exactly', () => {
    reconcileSetOutView(runtime, 'v1');
    expect(tagIds()).toContain('wall_far');

    // Crop the view down to the near wall. The far wall is no longer DRAWN, so its tag is
    // an orphan — the failure mode the brief names: reconciling against the LEVEL would
    // have left it behind.
    VIEW_DEF = { ...PLAN_VIEW, crop: { enabled: true, region: { min: [-5, -5], max: [15, 15] } } };
    reconcileSetOutView(runtime, 'v1');

    expect(tagIds()).not.toContain('wall_far');
    expect(new Set(tagIds())).toEqual(new Set([...visibleElementIds('v1')!]));

    // …and widening the crop brings it back. The set follows the DRAWING, both ways.
    VIEW_DEF = { ...PLAN_VIEW };
    reconcileSetOutView(runtime, 'v1');
    expect(tagIds()).toContain('wall_far');
  });

  it('RUN IT TWICE → nothing changes the second time (the whole correctness argument)', () => {
    reconcileSetOutView(runtime, 'v1');
    const snapshot = annotationStore.getByView('v1').map((a) => a.id).sort();

    expect(reconcileSetOutView(runtime, 'v1')).toBe(0);
    expect(reconcileSetOutView(runtime, 'v1')).toBe(0);

    // Same tags, same ids — no churn, no store events, so no re-projection feedback loop.
    expect(annotationStore.getByView('v1').map((a) => a.id).sort()).toEqual(snapshot);
  });
});

// ── §FIX-DIMENSION-DRIVES-MODEL (L-291b) — THE EDIT MUST TERMINATE ──────────
//
// Driving the model fires ViewDependencyTracker → the Set-Out reconcile (L-286) → which
// re-derives the annotations, including the one that was just edited. If that reconcile could
// itself dirty the model, the edit would re-enter itself and the editor would spin.
//
// Termination is not asserted by hoping: it is PUMPED until quiet (the L-250 harness pattern),
// and the number of writes per pump is counted. RED-FIRST: a reconcile that wrote on every
// pump — the re-entry bug — would make `writesOnPump(2)` non-zero, and this test fails.
describe('a driven edit TERMINATES — one edit, one mutation, one reconcile, settled', () => {
  it('converges: the model change reconciles ONCE and then writes nothing, forever', () => {
    // Settle the view first (the state before the user edits anything).
    reconcileSetOutView(runtime, 'v1');
    expect(reconcileSetOutView(runtime, 'v1')).toBe(0);   // already quiet

    // THE MODEL CHANGES — as a driven dimension edit changes it (the wall moved, and its
    // hosted door came with it). This is the ONE mutation the gesture is allowed to make.
    WALLS = [
      {
        id: 'wall_1', levelId: 'L0', height: 3, systemTypeId: 'wst', properties: { mark: 'WA-00-001' },
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],   // 10 m → 12 m
        openings: [DOOR, WIN],
      },
      {
        id: 'wall_far', levelId: 'L0', height: 3, systemTypeId: 'wst', properties: { mark: 'WA-00-002' },
        baseLine: [{ x: 30, y: 0, z: 40 }, { x: 40, y: 0, z: 40 }],
        openings: [],
      },
    ];

    // Pump the reconcile until quiet, counting the writes each pass makes.
    const writes: number[] = [];
    for (let pump = 0; pump < 5; pump++) {
      writes.push(reconcileSetOutView(runtime, 'v1'));
    }

    // The tags were already correct (the elements did not change identity — they MOVED), so
    // even the first pump writes nothing: the annotations follow the model by REFERENCE
    // (L-287), not by regeneration. And every subsequent pump is silent.
    expect(writes.every((w) => w === 0)).toBe(true);
    // The set is still exactly the visible set — the move did not orphan or duplicate anything.
    expect(new Set(tagIds())).toEqual(new Set([...visibleElementIds('v1')!]));
  });

  it('a model change that ADDS an element reconciles ONCE, then settles', () => {
    reconcileSetOutView(runtime, 'v1');
    WALLS = walls([DOOR, WIN, { ...DOOR, elementId: 'door_9', offset: 1, mark: 'DO-00-009' }]);

    const first = reconcileSetOutView(runtime, 'v1');
    const second = reconcileSetOutView(runtime, 'v1');
    const third = reconcileSetOutView(runtime, 'v1');

    expect(first).toBe(1);      // ONE reconcile does the work…
    expect(second).toBe(0);     // …and it is settled immediately after.
    expect(third).toBe(0);      // No oscillation. No re-entry.
  });
});
