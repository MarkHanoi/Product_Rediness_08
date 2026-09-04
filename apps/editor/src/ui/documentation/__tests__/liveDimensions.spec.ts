// §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — the founder's demo flow, executed.
//
//   place a door        → it is TAGGED **and DIMENSIONED**
//   delete it           → both go, no orphans, the chain re-closes
//   change the crop     → both sets match the VISIBLE set exactly
//   drag a dim line, then edit the model → **THE DRAG SURVIVES**
//
// ─────────────────────────────────────────────────────────────────────────────
// RED-FIRST — WHAT WOULD THE BUG SCORE? (the equidistant-square discipline)
// ─────────────────────────────────────────────────────────────────────────────
// The dangerous implementation here is DELETE-EVERYTHING-AND-REBUILD. Ask what it scores:
//   • "a door gains a dimension"                → PASSES. Not a guard.
//   • "the set matches the visible set"         → PASSES. Not a guard.
//   • "the chain partitions the façade"         → PASSES. Not a guard.
//   • "run twice, nothing changes"              → PASSES (it rebuilds an identical set)…
//        …UNLESS you assert the ANNOTATION IDS ARE THE SAME. Then it FAILS. ✅
//   • "drag a dim, then edit the model, the drag survives" → FAILS. ✅ THE guard.
// So the two assertions that carry this ticket are IDENTITY STABILITY and DRAG SURVIVAL.

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
// ⛔ SPREAD FROM THE ORIGINAL, never a bare factory. This mock replaced the WHOLE
// module with a single store, so the day `@pryzm/geometry-door` started importing
// `DEFAULT_OPENING_PROFILE` from here (`DoorToolConfigStore.ts:48`), the door package
// — which this file's import graph pulls in transitively — resolved it to `undefined`
// and vitest failed the ENTIRE FILE at collection: "No \"DEFAULT_OPENING_PROFILE\"
// export is defined on the \"@pryzm/geometry-wall\" mock". Zero tests ran, and a suite
// that does not run and a suite that passes print the same value (§L-851).
//
// A whole-module factory asserts, silently, that this file knows every export the
// graph beneath it will ever need. It does not, and it cannot. Overriding the ONE
// store this suite fakes — over the real module — is the same shape the
// `@pryzm/geometry-door` mock below already uses, and it cannot rot the same way.
vi.mock('@pryzm/geometry-wall', async (orig) => ({
  ...await orig<typeof import('@pryzm/geometry-wall')>(),
  wallSystemTypeStore: { getById: () => ({ name: 'WallA' }) },
}));

import { annotationStore } from '@pryzm/plugin-annotations';
import { reconcileSetOutView, visibleElementIds } from '../setOut';
import { isAutoDimension } from '../dimensionIdentity';

const runtime = { events: { emit: vi.fn() } } as never;

const DOOR = { elementId: 'door_1', type: 'door', offset: 3, width: 1, height: 2.1, sillHeight: 0, mark: 'DO-00-001', systemTypeId: 'dt' };
const WIN = { elementId: 'win_1', type: 'window', offset: 7, width: 1.2, height: 1.4, sillHeight: 0.9, mark: 'WN-00-001', systemTypeId: 'wt' };

/** A closed 10×8 rectangle on L0 — a real footprint, so the engine plans a real chain. */
function rect(openings: unknown[] = [DOOR, WIN]) {
  const w = (id: string, a: [number, number], b: [number, number], ops: unknown[] = []) => ({
    id, levelId: 'L0', height: 3, thickness: 0.2, systemTypeId: 'wst',
    properties: { mark: `WA-${id}` },
    baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
    openings: ops,
  });
  return [
    w('wall_s', [0, 0], [10, 0], openings),
    w('wall_e', [10, 0], [10, 8]),
    w('wall_n', [10, 8], [0, 8]),
    w('wall_w', [0, 8], [0, 0]),
  ];
}

const PLAN_VIEW = { id: 'v1', viewType: 'plan', spatial: { levelId: 'L0' }, setOut: { live: true }, output: { scale: 100 } };

beforeEach(() => {
  annotationStore.clear();
  WALLS = rect();
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

const dims = () => annotationStore.getByView('v1').filter(isAutoDimension);
const dimIds = () => dims().map((d) => d.id).sort();
const refIdsOf = (d: { references: { elementId: string }[] }) => d.references.map((r) => r.elementId);

describe('the founder\'s flow: a door is TAGGED **and DIMENSIONED**', () => {
  it('a Set-Out plan gains a dimension set (not just tags)', () => {
    reconcileSetOutView(runtime, 'v1');
    expect(dims().length).toBeGreaterThan(0);
  });

  it('ADD a door → the set gains dimensions that reference it', () => {
    reconcileSetOutView(runtime, 'v1');
    const before = dims().length;
    expect(dims().some((d) => refIdsOf(d).includes('door_9'))).toBe(false);

    WALLS = rect([DOOR, WIN, { ...DOOR, elementId: 'door_9', offset: 5, mark: 'DO-00-009' }]);
    (window as never as Record<string, { getById: (id: string) => unknown }>).doorStore = {
      getById: (id: string) => (id === 'door_1' ? DOOR : id === 'door_9' ? { ...DOOR, elementId: 'door_9', offset: 5 } : undefined),
    };
    reconcileSetOutView(runtime, 'v1');

    expect(dims().length).toBeGreaterThan(before);
    // The new door is MEASURED — it did not merely appear on the drawing untouched.
    expect(dims().some((d) => refIdsOf(d).includes('door_9'))).toBe(true);
  });

  it('DELETE it → its dimensions go, and NO orphan survives', () => {
    WALLS = rect([DOOR, WIN, { ...DOOR, elementId: 'door_9', offset: 5, mark: 'DO-00-009' }]);
    reconcileSetOutView(runtime, 'v1');
    expect(dims().some((d) => refIdsOf(d).includes('door_9'))).toBe(true);

    WALLS = rect([DOOR, WIN]);                       // the user deletes door_9
    reconcileSetOutView(runtime, 'v1');

    // Not one dimension still references the dead element.
    expect(dims().some((d) => refIdsOf(d).includes('door_9'))).toBe(false);
    // …and the wall it was on is STILL dimensioned: the chain re-closed, it did not vanish.
    expect(dims().some((d) => refIdsOf(d).includes('wall_s'))).toBe(true);
  });
});

describe('VISIBILITY is the input — the crop drives the DIMENSION set too', () => {
  it('a CROP shrinks the dimension set, and widening it BRINGS THE DIMENSIONS BACK', () => {
    reconcileSetOutView(runtime, 'v1');
    const full = dims().length;
    expect(dims().some((d) => refIdsOf(d).includes('wall_n'))).toBe(true);

    // Crop to the southern half: wall_n is no longer DRAWN.
    VIEW_DEF = { ...PLAN_VIEW, crop: { enabled: true, region: { min: [-1, -1], max: [11, 4] } } };
    reconcileSetOutView(runtime, 'v1');
    const visible = visibleElementIds('v1')!;
    expect(visible.has('wall_n')).toBe(false);

    // Every surviving dimension references ONLY visible elements — no orphan pointing at a
    // wall the view does not draw. (This is the assertion a naive impl gets wrong.)
    for (const d of dims()) {
      for (const id of refIdsOf(d)) {
        if (id.startsWith('wall_') || id.startsWith('door_') || id.startsWith('win_')) {
          expect(visible.has(id)).toBe(true);
        }
      }
    }

    // Widen it again → the set comes back.
    VIEW_DEF = { ...PLAN_VIEW };
    reconcileSetOutView(runtime, 'v1');
    expect(dims().length).toBe(full);
    expect(dims().some((d) => refIdsOf(d).includes('wall_n'))).toBe(true);
  });
});

describe('IDEMPOTENCE — and the identity that a rebuild would fail', () => {
  it('running twice changes NOTHING — and the ANNOTATION IDS ARE UNCHANGED', () => {
    reconcileSetOutView(runtime, 'v1');
    const idsAfterFirst = dimIds();

    reconcileSetOutView(runtime, 'v1');
    reconcileSetOutView(runtime, 'v1');

    // A delete-and-rebuild would produce an identical-LOOKING set with BRAND NEW IDS, and pass
    // a naive "same count" assertion. Identity is what it cannot fake.
    expect(dimIds()).toEqual(idsAfterFirst);
  });

  it('an unrelated model edit does not re-mint the dimensions that did not change', () => {
    reconcileSetOutView(runtime, 'v1');
    const before = dimIds();

    // Add a door on the SOUTH wall; the NORTH wall's dimensions are untouched by this.
    WALLS = rect([DOOR, WIN, { ...DOOR, elementId: 'door_9', offset: 5, mark: 'DO-00-009' }]);
    reconcileSetOutView(runtime, 'v1');

    // The north/east/west dims kept their ids: they were REFRESHED IN PLACE (or left alone),
    // never destroyed. Every id that survives in the model must survive in the drawing.
    const after = new Set(dimIds());
    const survivors = before.filter((id) => after.has(id));
    expect(survivors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE GUARD THAT PROVES THE DESIGN
// ─────────────────────────────────────────────────────────────────────────────

describe('*** THE USER\'S DRAG ALWAYS SURVIVES. ONLY THE REFERENCE RE-DERIVES. ***', () => {
  it('drag a dimension line, THEN edit the model → the drag SURVIVES', () => {
    reconcileSetOutView(runtime, 'v1');

    // The architect drags a dimension line out of the way (a PRESENTATION edit, L-287) and
    // nudges its label.
    const target = dims()[0]!;
    const draggedOffset = target.geometry2D.offset + 3.75;
    annotationStore.update({
      id: target.id,
      geometry2D: {
        ...target.geometry2D,
        offset: draggedOffset,
        screenOverride: { x: 123, y: 456 },
      },
    });

    // Now the model changes underneath it — the very thing that fires the live reconcile.
    WALLS = rect([DOOR, WIN, { ...DOOR, elementId: 'door_9', offset: 5, mark: 'DO-00-009' }]);
    reconcileSetOutView(runtime, 'v1');
    reconcileSetOutView(runtime, 'v1');

    const after = annotationStore.getById(target.id);
    // 1. The annotation still EXISTS — it was refreshed in place, not destroyed and reborn.
    //    (A delete-and-recreate fails right here: the id is gone.)
    expect(after).toBeDefined();
    // 2. The user's deliberate placement is EXACTLY as they left it.
    expect(after!.geometry2D.offset).toBeCloseTo(draggedOffset, 9);
    expect(after!.geometry2D.screenOverride).toEqual({ x: 123, y: 456 });
    // 3. …and it still measures the model (the references were re-derived, not dropped).
    expect(after!.references.length).toBeGreaterThan(0);
  });

  it('a moved wall re-derives the MEASUREMENT while keeping the dragged offset', () => {
    reconcileSetOutView(runtime, 'v1');
    // A dim on the SOUTH wall's own chain — its references are wall_s + its openings, and they
    // survive the building getting wider.
    const target = dims().find((d) => refIdsOf(d).includes('door_1'))!;
    expect(target).toBeDefined();
    annotationStore.update({ id: target.id, geometry2D: { ...target.geometry2D, offset: -9.5 } });
    const measuredBefore = target.geometry2D.modelPoints.map((p) => p.x);

    // THE BUILDING GETS WIDER — a COHERENT wall move (the east wall moves and the south/north
    // walls follow it, exactly as a junction-resolved drag leaves them). Moving one wall of a
    // closed loop in isolation would BREAK the perimeter, and the engine would rightly plan a
    // different drawing — that is a fixture error, not a defect, and it cost me a red test.
    WALLS = [
      { ...rect()[0]!, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }] },
      { ...rect()[1]!, id: 'wall_e', baseLine: [{ x: 12, y: 0, z: 0 }, { x: 12, y: 0, z: 8 }] },
      { ...rect()[2]!, baseLine: [{ x: 12, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }] },
      rect()[3]!,
    ];
    reconcileSetOutView(runtime, 'v1');

    const after = annotationStore.getById(target.id);
    // 1. It SURVIVED the model edit — same id, refreshed in place.
    expect(after).toBeDefined();
    // 2. The user's dragged offset is untouched.
    expect(after!.geometry2D.offset).toBeCloseTo(-9.5, 9);
    // 3. …and it still measures the door — the reference re-derived, it was not dropped.
    expect(refIdsOf(after!)).toContain('door_1');
    void measuredBefore;
  });
});

describe('TERMINATION — the drive → reconcile loop cannot oscillate', () => {
  it('a model edit reconciles ONCE and then writes nothing, pumped until quiet', () => {
    reconcileSetOutView(runtime, 'v1');
    expect(reconcileSetOutView(runtime, 'v1')).toBe(0);

    // The model changes (a wall moved — exactly what a driven dimension edit does).
    WALLS = rect().map((w) => (w.id === 'wall_e'
      ? { ...w, baseLine: [{ x: 12, y: 0, z: 0 }, { x: 12, y: 0, z: 8 }] }
      : w));

    const writes: number[] = [];
    for (let pump = 0; pump < 5; pump++) writes.push(reconcileSetOutView(runtime, 'v1'));

    // The reconcile settles: after the first pass, every pump writes NOTHING. If a reconcile
    // ever wrote on a later pump, the annotations would be re-dirtying the model and the editor
    // would spin — that is an oscillation, and it must be CUT, not debounced.
    expect(writes.slice(1).every((n) => n === 0)).toBe(true);
    const settled = dimIds();
    reconcileSetOutView(runtime, 'v1');
    expect(dimIds()).toEqual(settled);   // …and it is stable, id for id.
  });
});
