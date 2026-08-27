/**
 * ScheduleExtractor — §SCHED156 (L-12602 · L-12604 · L-12605).
 *
 * Pins three fixes made in one lane:
 *   1. Doors/Windows now carry per-element Opening Area / Leaf (Glazed) Area /
 *      Frame Perimeter, reusing `openingVoidArea` / `openingPerimeter` /
 *      `openingClearArea` from `QuantityTakeoff.ts` (C84 EI-9 — one authority).
 *   2. The Floors schedule's `finish` and `rooms` cells previously read fields
 *      that either do not exist (`finishSpec.material`) or are incomplete
 *      (`coveredRoomIds` alone) and always rendered '—'.
 *   3. The Walls schedule's `type` cell previously read the literal element
 *      kind ("wall" on every row) instead of the resolved C15 system type.
 *
 * Environment: happy-dom (per this package's vitest.config.ts), so `window`
 * is a real global — the same access pattern ScheduleExtractor.ts itself
 * uses (`window.wallStore`, etc.), not a globalThis cast workaround.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ScheduleExtractor } from './ScheduleExtractor.js';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';

type Opening = {
  id: string;
  type: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  elementId: string;
  doorType?: 'single' | 'double';
  windowType?: 'single' | 'double';
  openingProfile?: string;
};

function wall(over: Partial<Record<string, unknown>> & { id: string; openings?: Opening[] }) {
  return {
    id: over.id,
    type: 'wall',
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    height: 2.7,
    thickness: 0.2,
    openings: over.openings ?? [],
    ...over,
  };
}

beforeEach(() => {
  (window as any).wallStore = undefined;
  (window as any).roomStore = undefined;
  (window as any).floorStore = undefined;
  (window as any).ceilingStore = undefined;
  (window as any).bimManager = undefined;
});

describe('ScheduleExtractor — Doors quantities (§SCHED156-DOORWIN, L-12605)', () => {
  it('computes Opening Area, Leaf Area (clear of frame) and Frame Perimeter from the wall Opening, not DoorData alone', () => {
    const op: Opening = { id: 'op1', type: 'door', offset: 0, width: 0.9, height: 2.1, sillHeight: 0, elementId: 'D1' };
    const w = wall({ id: 'W1', openings: [op] });
    (window as any).wallStore = {
      getAll: () => [w],
      getById: (id: string) => (id === 'W1' ? w : undefined),
      getAllDoors: () => [{
        id: 'D1', type: 'door', wallId: 'W1', openingId: 'op1',
        width: 0.9, height: 2.1, sillHeight: 0, offset: 0,
        frameThickness: 0.05, frameWidth: 0.05,
      }],
      getAllWindows: () => [],
    };
    (window as any).roomStore = { getAll: () => [] };

    const rows = ScheduleExtractor.getRows('Doors');
    expect(rows).toHaveLength(1);
    const row = rows[0];

    // Opening (rough/structural) area = width × height for a rectangular void.
    expect(row.openingArea).toBe((0.9 * 2.1).toFixed(2));
    // Frame perimeter = 2 × (width + height) for a rectangular void.
    expect(row.framePerimeter).toBe((2 * (0.9 + 2.1)).toFixed(2));
    // Leaf area = opening inset by frameWidth on all four sides —
    // STRICTLY SMALLER than the opening area (the leaf-vs-rough distinction).
    const expectedLeaf = (0.9 - 2 * 0.05) * (2.1 - 2 * 0.05);
    expect(row.leafArea).toBe(expectedLeaf.toFixed(2));
    expect(Number(row.leafArea)).toBeLessThan(Number(row.openingArea));
  });

  it('renders "not measured" — never 0.00 — when the joinery record states no frameWidth', () => {
    const op: Opening = { id: 'op1', type: 'door', offset: 0, width: 0.9, height: 2.1, sillHeight: 0, elementId: 'D1' };
    const w = wall({ id: 'W1', openings: [op] });
    (window as any).wallStore = {
      getAll: () => [w],
      getById: (id: string) => (id === 'W1' ? w : undefined),
      getAllDoors: () => [{
        id: 'D1', type: 'door', wallId: 'W1', openingId: 'op1',
        width: 0.9, height: 2.1, sillHeight: 0, offset: 0,
        frameThickness: 0, frameWidth: 0,
      }],
      getAllWindows: () => [],
    };
    (window as any).roomStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Doors')[0];
    expect(row.leafArea).toBe('not measured');
    // Opening area and frame perimeter are STILL measured — only the
    // frame-derived leaf figure is unavailable.
    expect(row.openingArea).toBe((0.9 * 2.1).toFixed(2));
    expect(row.framePerimeter).not.toBe('not measured');
  });
});

describe('ScheduleExtractor — Windows quantities (§SCHED156-DOORWIN, L-12605)', () => {
  it('computes Opening Area, Glazed Area and Frame Perimeter', () => {
    const op: Opening = { id: 'op1', type: 'window', offset: 0, width: 1.2, height: 1.5, sillHeight: 0.9, elementId: 'WN1' };
    const w = wall({ id: 'W1', openings: [op] });
    (window as any).wallStore = {
      getAll: () => [w],
      getById: (id: string) => (id === 'W1' ? w : undefined),
      getAllDoors: () => [],
      getAllWindows: () => [{
        id: 'WN1', type: 'window', wallId: 'W1', openingId: 'op1',
        width: 1.2, height: 1.5, sillHeight: 0.9, offset: 0,
        frameThickness: 0.04, frameWidth: 0.04,
      }],
    };
    (window as any).roomStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Windows')[0];
    expect(row.openingArea).toBe((1.2 * 1.5).toFixed(2));
    expect(row.framePerimeter).toBe((2 * (1.2 + 1.5)).toFixed(2));
    const expectedGlazed = (1.2 - 2 * 0.04) * (1.5 - 2 * 0.04);
    expect(row.glazedArea).toBe(expectedGlazed.toFixed(2));
    expect(Number(row.glazedArea)).toBeLessThan(Number(row.openingArea));
  });
});

describe('ScheduleExtractor — Floors finish + rooms (§SCHED156-FLOOR-ROOMS, L-12602)', () => {
  it('reads finish from the SAME fields resolveRoomFinishes uses, not the non-existent finishSpec.material/.surfaceFinish', () => {
    (window as any).floorStore = {
      getAll: () => [{
        id: 'F1', levelId: 'L0', label: 'Floor 1',
        boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }], baseOffset: 0, thickness: 0.05 },
        layers: [{ name: 'Engineered Timber', function: 'finish', thickness: 0.02 }],
        finishSpec: { exposedScreed: false, materialName: 'Fallback Name' },
        coveredRoomIds: [],
      }],
    };
    (window as any).roomStore = { getAll: () => [] };
    (window as any).wallStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Floors')[0];
    // The layers[] 'finish' entry wins (same precedence resolveRoomFinishes uses).
    expect(row.finish).toBe('Engineered Timber');
  });

  it('falls back to finishSpec.materialName when no finish layer is present', () => {
    (window as any).floorStore = {
      getAll: () => [{
        id: 'F1', levelId: 'L0', label: 'Floor 1',
        boundary: { polygon: [], baseOffset: 0, thickness: 0.05 },
        layers: [],
        finishSpec: { exposedScreed: false, materialName: 'Marble Tile' },
        coveredRoomIds: [],
      }],
    };
    (window as any).roomStore = { getAll: () => [] };
    (window as any).wallStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Floors')[0];
    expect(row.finish).toBe('Marble Tile');
  });

  it('§THE FIX — reports covered rooms via spatial containment when coveredRoomIds is empty (the common, un-linked case)', () => {
    (window as any).floorStore = {
      getAll: () => [{
        id: 'F1', levelId: 'L0', label: 'Floor 1',
        boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }], baseOffset: 0, thickness: 0.05 },
        layers: [],
        finishSpec: { exposedScreed: false },
        coveredRoomIds: [], // ← the un-linked case that used to always print '—'
      }],
    };
    (window as any).roomStore = {
      getAll: () => [
        { id: 'R1', levelId: 'L0', roomNumber: '101', name: 'Bedroom', computed: { centroid: { x: 5, z: 5 } } },
        { id: 'R2', levelId: 'L1', roomNumber: '201', name: 'Wrong level', computed: { centroid: { x: 5, z: 5 } } },
      ],
    };
    (window as any).wallStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Floors')[0];
    expect(row.rooms).toBe('1 room(s)');
  });

  it('a floor genuinely covering zero rooms still reads "—" (not a false positive)', () => {
    (window as any).floorStore = {
      getAll: () => [{
        id: 'F1', levelId: 'L0', label: 'Floor 1',
        boundary: { polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }], baseOffset: 0, thickness: 0.05 },
        layers: [],
        finishSpec: { exposedScreed: false },
        coveredRoomIds: [],
      }],
    };
    (window as any).roomStore = { getAll: () => [] };
    (window as any).wallStore = { getAll: () => [] };

    const row = ScheduleExtractor.getRows('Floors')[0];
    expect(row.rooms).toBe('—');
  });
});

describe('ScheduleExtractor — Walls type/layers/materials (§SCHED156-RICHCOLS, L-12604)', () => {
  it('a wall with no systemTypeId still reports honestly, not the bare "wall" literal masquerading as a type', () => {
    const w = wall({ id: 'W1' });
    (window as any).wallStore = { getAll: () => [w], getById: () => w };

    const row = ScheduleExtractor.getRows('Walls')[0];
    // No systemTypeId ⇒ falls back to the element-kind literal (still 'wall'
    // when nothing else is known) — but layers/materials say so honestly.
    expect(row.type).toBe('wall');
    expect(row.layers).toBe('—');
    expect(row.materials).toBe('—');
  });

  it('§THE FIX — a wall WITH a systemTypeId reports the resolved C15 type name, not the literal "wall"', () => {
    const type = wallSystemTypeStore.add({
      name: 'Interior — Partition 100mm',
      description: 'test fixture',
      layers: [
        { name: 'Plasterboard', function: 'finish-interior', thickness: 0.0125, materialId: 'mat-gyp' },
        { name: 'Timber stud',  function: 'structure',       thickness: 0.075,  materialId: 'mat-timber' },
        { name: 'Plasterboard', function: 'finish-interior', thickness: 0.0125, materialId: 'mat-gyp' },
      ],
    });
    try {
      const w = wall({ id: 'W1', systemTypeId: type.id });
      (window as any).wallStore = { getAll: () => [w], getById: () => w };

      const row = ScheduleExtractor.getRows('Walls')[0];
      expect(row.type).toBe('Interior — Partition 100mm');
      expect(row.layers).toContain('3 layer');
      expect(row.layers).toContain('100mm');
      expect(row.materials).toContain('Plasterboard');
      expect(row.materials).toContain('Timber stud');
    } finally {
      wallSystemTypeStore.remove?.(type.id);
    }
  });
});
