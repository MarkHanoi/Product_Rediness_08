// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the executor, proved END-TO-END.
//
// The engine (reconcile / marks / anchors) is proved pure in
// packages/core-app-model/src/annotations/__tests__/tagEngine.test.ts, and the RENDER
// outcome is proved in packages/core-app-model/src/views/__tests__/tagProjection.test.ts.
// What is left — and what actually breaks in practice — is the WIRING: does pressing the
// button put the right tags, with the right marks, into the store the plan renderer
// reads, as ONE undoable unit?
//
// So this suite uses the REAL engine, the REAL commit path (CreateManyAnnotations +
// DeleteAnnotation through a CommandManager) and a REAL annotation store — and fakes
// only the live BIM stores. Every assertion is at the OUTCOME: what is in the
// annotation store afterwards, and what one Ctrl-Z would undo.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── The live BIM stores are faked; the tag ENGINE is not. ───────────────────
const wallStore = {
  getAll: () => WALLS,
};
const doorStore = { getById: (id: string) => DOOR_RECORDS[id] };
const windowStore = { getById: (id: string) => WINDOW_RECORDS[id] };

let VIEW_DEF: Record<string, unknown>;
let WALLS: unknown[];
let DOOR_RECORDS: Record<string, unknown>;
let WINDOW_RECORDS: Record<string, unknown>;

vi.mock('@pryzm/core-app-model', async (orig) => {
  const actual = await orig<typeof import('@pryzm/core-app-model')>();
  return {
    ...actual,
    // Only the STORES are faked — reconcileTagSet, resolveTagMarks, the anchor rules
    // and the intent resolver are the real ones.
    storeRegistry: { getStoreForType: (t: string) => (t === 'wall' ? wallStore : undefined) },
    viewDefinitionStore: { get: (id: string) => (id === 'v1' ? VIEW_DEF : undefined), has: () => true },
    elementCodeStore: { getCode: () => undefined },
    doorSystemTypeStore: { getById: (id: string) => (id === 'dt_1' ? { name: 'Solid Timber' } : undefined) },
    windowSystemTypeStore: { getById: (id: string) => (id === 'wt_1' ? { name: 'Timber Casement' } : undefined) },
  };
});

vi.mock('@pryzm/geometry-wall', () => ({
  wallSystemTypeStore: { getById: (id: string) => (id === 'wst_1' ? { name: 'WallA' } : undefined) },
}));

import { annotationStore } from '@pryzm/plugin-annotations';
import { autoTagActiveView, resolveAutoTagProjection } from '../autoTagActiveView';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FRONT_WALL = {
  id: 'wall_1',
  levelId: 'L0',
  height: 3,
  thickness: 0.2,
  systemTypeId: 'wst_1',
  properties: { mark: 'WA-00-001' },
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
  openings: [
    { elementId: 'door_1', type: 'door', offset: 4, width: 1, height: 2.1, sillHeight: 0 },
    { elementId: 'win_1', type: 'window', offset: 7, width: 1.2, height: 1.4, sillHeight: 0.9 },
  ],
};
/** A wall on ANOTHER level — must never be tagged on the L0 plan. */
const UPPER_WALL = {
  id: 'wall_2',
  levelId: 'L1',
  height: 3,
  systemTypeId: 'wst_1',
  properties: { mark: 'WA-01-001' },
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
  openings: [],
};

const PLAN_VIEW = {
  id: 'v1',
  viewType: 'plan',
  spatial: { levelId: 'L0' },
  // No annotationOverrides ⇒ the default intent: doors + windows + walls, TYPE marks.
};

const ELEVATION_VIEW = {
  id: 'v1',
  viewType: 'elevation',
  spatial: {
    levelId: 'L0',
    sectionPlane: { origin: { x: 5, y: 0, z: -12 }, normal: { x: 0, y: 0, z: 1 } },
  },
};

const runtime = { events: { emit: vi.fn() } } as never;

const ringPushes: unknown[] = [];

function installWindow(): void {
  const w = window as unknown as Record<string, unknown>;
  w.viewController = { currentViewDefinitionId: 'v1' };
  w.annotationStore = annotationStore;
  w.doorStore = doorStore;
  w.windowStore = windowStore;
  w.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground', elevation: 0 }, { id: 'L1', name: 'L1', elevation: 3 }] };
  // A CommandManager that actually EXECUTES — so the tags really land in the store
  // the renderer reads. Anything less would be testing the seam, not the outcome.
  w.commandManager = {
    execute: (cmd: { canExecute?: (c: unknown) => { ok: boolean }; execute: (c: unknown) => unknown }) => {
      const v = cmd.canExecute?.({});
      if (v && !v.ok) return;
      cmd.execute({});
    },
  };
  w.runtime = { bus: { ringBuffer: { push: (p: unknown) => { ringPushes.push(p); } } } };
}

const tagsOfType = (type: string): Record<string, unknown>[] =>
  annotationStore.getByView('v1').filter((a) => a.type === type) as never;

beforeEach(() => {
  annotationStore.clear();
  ringPushes.length = 0;
  WALLS = [FRONT_WALL, UPPER_WALL];
  DOOR_RECORDS = { door_1: { id: 'door_1', mark: 'DO-00-001', systemTypeId: 'dt_1', width: 1, height: 2.1 } };
  WINDOW_RECORDS = { win_1: { id: 'win_1', mark: 'WN-00-001', systemTypeId: 'wt_1', width: 1.2, height: 1.4 } };
  VIEW_DEF = PLAN_VIEW;
  installWindow();
});

// ── Routing: ONE button, view-aware (L-265 §6) ──────────────────────────────

describe('resolveAutoTagProjection', () => {
  it('routes plan-like views to the plan strategy and elevations to the elevation one', () => {
    expect(resolveAutoTagProjection('plan')).toBe('plan');
    expect(resolveAutoTagProjection('ceiling-plan')).toBe('plan');
    expect(resolveAutoTagProjection('elevation')).toBe('elevation');
    expect(resolveAutoTagProjection('building-elevation')).toBe('elevation');
  });

  it('refuses the views whose rules it does NOT have, rather than guessing', () => {
    expect(resolveAutoTagProjection('section')).toBe('unsupported');
    expect(resolveAutoTagProjection('3d')).toBe('unsupported');
    expect(resolveAutoTagProjection(undefined)).toBe('unsupported');
  });
});

// ── PLAN ────────────────────────────────────────────────────────────────────

describe('autoTagActiveView — plan', () => {
  it('tags every door, window and wall on the ACTIVE LEVEL, and nothing on another level', () => {
    const created = autoTagActiveView(runtime);

    expect(created).toBe(3);
    expect(tagsOfType('door-tag')).toHaveLength(1);
    expect(tagsOfType('window-tag')).toHaveLength(1);
    // wall_2 is on L1 — a plan of L0 must not tag it.
    const wallTags = tagsOfType('wall-tag');
    expect(wallTags).toHaveLength(1);
    expect((wallTags[0]!.parameters as Record<string, unknown>).elementId).toBe('wall_1');
  });

  it('displays the TYPE mark and CARRIES the instance mark — the schedule join holds (C28)', () => {
    autoTagActiveView(runtime);

    const door = tagsOfType('door-tag')[0]!.parameters as Record<string, unknown>;
    expect(door.cachedLabel).toBe('Solid Timber');   // the view's intent: type marks
    expect(door.mark).toBe('DO-00-001');             // …and the instance mark rides along
    expect(door.elementId).toBe('door_1');

    const wall = tagsOfType('wall-tag')[0]!.parameters as Record<string, unknown>;
    expect(wall.cachedLabel).toBe('WallA');
    expect(wall.mark).toBe('WA-00-001');
  });

  it('honours the VIEW INTENT (P7/C09): a view that wants no wall tags gets none', () => {
    VIEW_DEF = { ...PLAN_VIEW, annotationOverrides: { wallTags: false } };
    autoTagActiveView(runtime);
    expect(tagsOfType('wall-tag')).toHaveLength(0);
    expect(tagsOfType('door-tag')).toHaveLength(1);
  });

  it('honours the VIEW INTENT: a view set to instance marks shows the instance mark', () => {
    VIEW_DEF = { ...PLAN_VIEW, output: { tagMarkSource: 'instance' } };
    autoTagActiveView(runtime);
    const door = tagsOfType('door-tag')[0]!.parameters as Record<string, unknown>;
    expect(door.cachedLabel).toBe('DO-00-001');
  });

  it('anchors the tag ON the element with a LEADER to the symbol', () => {
    autoTagActiveView(runtime);
    const geo = tagsOfType('door-tag')[0]!.geometry2D as { modelPoints: { x: number; z: number }[] };
    // The door's centre: left-edge offset 4 + width/2 → x = 4.5 on a wall along +X.
    expect(geo.modelPoints[0]!.x).toBeCloseTo(4.5, 6);
    expect(geo.modelPoints[0]!.z).toBeCloseTo(0, 6);
    // …and the bubble stands off the wall face (the leader has real length).
    expect(Math.abs(geo.modelPoints[1]!.z)).toBeGreaterThan(0.5);
  });

  it('IS IDEMPOTENT — pressing the button twice creates no duplicates', () => {
    autoTagActiveView(runtime);
    const after1 = annotationStore.getByView('v1').length;
    const created2 = autoTagActiveView(runtime);

    expect(created2).toBe(0);
    expect(annotationStore.getByView('v1')).toHaveLength(after1);
  });

  it('REMOVES the tag of a DELETED element (orphan), in the same unit of work', () => {
    autoTagActiveView(runtime);
    expect(tagsOfType('door-tag')).toHaveLength(1);

    // The user deletes the door.
    WALLS = [{ ...FRONT_WALL, openings: FRONT_WALL.openings.filter((o) => o.elementId !== 'door_1') }, UPPER_WALL];
    autoTagActiveView(runtime);

    expect(tagsOfType('door-tag')).toHaveLength(0);   // its tag is gone with it
    expect(tagsOfType('window-tag')).toHaveLength(1); // …and nothing else was touched
  });

  it('REFRESHES a tag whose element was retyped, without creating a second one', () => {
    autoTagActiveView(runtime);
    const id = tagsOfType('wall-tag')[0]!.id as string;

    WALLS = [{ ...FRONT_WALL, systemTypeId: 'unknown_type' }, UPPER_WALL];   // type cleared
    autoTagActiveView(runtime);

    const wallTags = tagsOfType('wall-tag');
    expect(wallTags).toHaveLength(1);
    expect(wallTags[0]!.id).toBe(id);   // the SAME tag, updated in place
    expect((wallTags[0]!.parameters as Record<string, unknown>).cachedLabel).toBe('WA-00-001');
  });

  it('ONE BATCH = ONE UNDO (C16): a single ring entry covers the whole reconciliation', () => {
    autoTagActiveView(runtime);
    expect(ringPushes).toHaveLength(1);

    const pair = ringPushes[0] as {
      forward: { ops: { op: string; path: string }[] };
      inverse: { ops: { op: string; path: string }[] };
      affectedStores: string[];
    };
    expect(pair.affectedStores).toEqual(['annotation']);
    expect(pair.forward.ops.filter((o) => o.op === 'add')).toHaveLength(3);
    // Undo removes exactly the three tags it added.
    expect(pair.inverse.ops.every((o) => o.op === 'remove')).toBe(true);
    expect(pair.inverse.ops).toHaveLength(3);
  });

  it('a reconciliation that DELETES rides the same single undo entry (create + remove)', () => {
    autoTagActiveView(runtime);
    ringPushes.length = 0;

    // Delete the door AND add a new window in one edit → the next run removes one tag
    // and creates another. Both halves must be ONE undo, or Ctrl-Z half-undoes the drawing.
    WALLS = [{
      ...FRONT_WALL,
      openings: [
        { elementId: 'win_2', type: 'window', offset: 1, width: 1, height: 1.2, sillHeight: 0.9 },
        FRONT_WALL.openings[1]!,
      ],
    }, UPPER_WALL];
    WINDOW_RECORDS = {
      ...WINDOW_RECORDS,
      win_2: { id: 'win_2', mark: 'WN-00-002', systemTypeId: 'wt_1', width: 1, height: 1.2 },
    };
    autoTagActiveView(runtime);

    expect(ringPushes).toHaveLength(1);
    const pair = ringPushes[0] as { forward: { ops: { op: string }[] }; inverse: { ops: { op: string }[] } };
    expect(pair.forward.ops.some((o) => o.op === 'remove')).toBe(true);  // the orphaned door tag
    expect(pair.forward.ops.some((o) => o.op === 'add')).toBe(true);     // the new window tag
    expect(pair.inverse.ops.some((o) => o.op === 'add')).toBe(true);     // …and undo restores it
  });

  it('an element with NO mark at all gets NO tag — never a blank bubble', () => {
    DOOR_RECORDS = { door_1: { id: 'door_1' } };   // no mark, no system type, no code
    autoTagActiveView(runtime);
    expect(tagsOfType('door-tag')).toHaveLength(0);
    expect(tagsOfType('window-tag')).toHaveLength(1);
  });
});

// ── ELEVATION ───────────────────────────────────────────────────────────────

describe('autoTagActiveView — elevation', () => {
  beforeEach(() => { VIEW_DEF = ELEVATION_VIEW; });

  it('tags the FAÇADE — and anchors every tag in the VERTICAL plane (V = world Y)', () => {
    const created = autoTagActiveView(runtime);
    expect(created).toBeGreaterThan(0);

    const door = tagsOfType('door-tag')[0]!;
    const geo = door.geometry2D as { modelPoints: { x: number; y: number; z: number }[] };
    // The anchor is at the door's real MID-HEIGHT (sill 0 + head 2.1) — not at y = 0,
    // which is what a plan-shaped executor would have produced.
    expect(geo.modelPoints[0]!.y).toBeCloseTo(2.1 / 2, 6);
    // …and the symbol sits ABOVE the head, in world Y.
    expect(geo.modelPoints[1]!.y).toBeGreaterThan(2.1);
    // The elevation tag never moves in the depth axis: it is coplanar with the façade.
    expect(geo.modelPoints[0]!.z).toBeCloseTo(geo.modelPoints[1]!.z, 6);
  });

  it('tags EVERY wall on the façade — including the storey above (an elevation is a whole-building view)', () => {
    autoTagActiveView(runtime);
    const wallTags = tagsOfType('wall-tag');
    // wall_1 (L0) and wall_2 (L1) share the façade plane, so BOTH are visible in this
    // elevation and both are tagged. A plan of L0 tags only wall_1 — that difference is
    // the point: the SCOPE is a property of the projection, not of the executor.
    expect(wallTags).toHaveLength(2);
    expect(wallTags.map((t) => (t.parameters as Record<string, unknown>).elementId).sort())
      .toEqual(['wall_1', 'wall_2']);
    expect((wallTags[0]!.parameters as Record<string, unknown>).cachedLabel).toBe('WallA');
  });

  it('IS IDEMPOTENT in elevation too', () => {
    autoTagActiveView(runtime);
    const n = annotationStore.getByView('v1').length;
    expect(autoTagActiveView(runtime)).toBe(0);
    expect(annotationStore.getByView('v1')).toHaveLength(n);
  });
});

// ── Refusals ────────────────────────────────────────────────────────────────

describe('autoTagActiveView — says so instead of guessing', () => {
  it('refuses a section (its rules are genuinely different) and tags nothing', () => {
    VIEW_DEF = { id: 'v1', viewType: 'section', spatial: {} };
    expect(autoTagActiveView(runtime)).toBe(0);
    expect(annotationStore.getByView('v1')).toHaveLength(0);
  });
});
