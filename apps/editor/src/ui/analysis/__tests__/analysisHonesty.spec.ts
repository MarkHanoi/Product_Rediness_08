/**
 * §ANALYSIS-HONESTY (L-3011 · ADR-0343 §D.6 · SPEC §2.1) — the guard.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE ONE THING THIS FILE EXISTS TO STOP
 * ═════════════════════════════════════════════════════════════════════════════
 * "The wall store could not be read" and "this project has no walls" are the
 * SAME VALUE — zero — and must never be the SAME ANSWER. Every assertion below
 * drives that distinction through the real read model with real store doubles,
 * because it is the failure this whole surface was built to not commit and it
 * has already happened elsewhere in this product (§C78-U-INV-4: an ELEMENTS card
 * asserted "0 walls" to an architect whose store had simply not booted yet).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THESE ESTABLISH, AND WHAT THEY CANNOT
 * ═════════════════════════════════════════════════════════════════════════════
 * They exercise `analysisReadModel.ts` and `treemap.ts` for real — the census
 * runs, the axes project, the treemap lays out. The store doubles are STRUCTURAL
 * and carry real values, not header-shaped mirrors (MEMORY
 * §fake-more-capable-than-real: a fake built from the header cannot falsify the
 * header).
 *
 * They CANNOT establish that the surface renders correctly. happy-dom performs
 * no layout and paints nothing, so nothing here measures a pixel, a colour or a
 * chart. The rendering claims are pinned as shipped-text in the second describe
 * block, and that arm is explicitly the weaker one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  getCensus,
  invalidateAnalysisReadModel,
  runQuery,
  censusSourceTable,
} from '../analysisReadModel';
import { squarify } from '../treemap';
import { DEFAULT_LAYOUT, WIDGET_CATALOGUE, widgetById } from '../widgetCatalogue';
import { seriesColour, ABSENCE_KEYS } from '../AnalysisTypes';
import type { AnalysisQuery } from '../AnalysisTypes';

// ── Structural store doubles ──────────────────────────────────────────────────

interface Rec { id: string; levelId?: string; systemTypeId?: string; roomType?: string }

function listStore(rows: Rec[]): { getAll: () => Rec[] } {
  return { getAll: () => rows };
}
/** A store that is PRESENT but throws — unreachable, not empty. */
function throwingStore(): { getAll: () => Rec[] } {
  return { getAll: (): Rec[] => { throw new Error('store not ready'); } };
}

const TOUCHED = [
  'wallStore', 'roomStore', 'doorStore', 'windowStore', 'slabStore', 'floorStore',
  'ceilingStore', 'roofStore', 'columnStore', 'beamStore', 'stairStore', 'handrailStore',
  'curtainWallStore', 'furnitureStore', 'plumbingStore', 'lightingStore', 'openingStore',
  'gridStore', 'bimManager',
];

function clearStores(): void {
  for (const k of TOUCHED) delete (window as unknown as Record<string, unknown>)[k];
  invalidateAnalysisReadModel();
}

const CENSUS_CATEGORY: AnalysisQuery = {
  id: 'test:category', source: 'census', groupBy: 'category', measure: 'count', cost: 'O(n)',
};
const CENSUS_LEVEL: AnalysisQuery = {
  id: 'test:level', source: 'census', groupBy: 'level', measure: 'count', cost: 'O(n)',
};
const CENSUS_TYPE: AnalysisQuery = {
  id: 'test:type', source: 'census', groupBy: 'type', measure: 'count', cost: 'O(n)',
};

beforeEach(clearStores);
afterEach(clearStores);

describe('§ANALYSIS-HONESTY — unreachable ≠ empty ≠ zero', () => {
  it('⭐ an EMPTY store and an ABSENT store produce DIFFERENT answers', () => {
    // Empty: the store answered, and the answer is "none".
    window.wallStore = listStore([]);
    const empty = getCensus();
    const wallsEmpty = empty.coverage.find((c) => c.family === 'Walls')!;
    expect(wallsEmpty.state).toBe('MEASURED');
    expect(wallsEmpty.note).toContain('contains no walls');
    expect(empty.unreachable).not.toContain('wallStore');

    // Absent: nothing on window. This is NOT "no walls".
    clearStores();
    const absent = getCensus();
    const wallsAbsent = absent.coverage.find((c) => c.family === 'Walls')!;
    expect(wallsAbsent.state).toBe('NOT_MEASURED');
    expect(wallsAbsent.note).toContain('NOT');
    expect(absent.unreachable).toContain('wallStore');

    // The two states are genuinely different objects, not the same string.
    expect(wallsEmpty.state).not.toBe(wallsAbsent.state);
  });

  it('a store that THROWS is unreachable, never empty', () => {
    window.wallStore = throwingStore();
    const c = getCensus();
    expect(c.unreachable).toContain('wallStore');
    expect(c.coverage.find((f) => f.family === 'Walls')!.state).toBe('NOT_MEASURED');
    expect(c.complete).toBe(false);
  });

  it('⛔ complete:false is set whenever ANY declared source is unreadable', () => {
    // One good store, seventeen absent ones.
    window.wallStore = listStore([{ id: 'w1' }]);
    const r = runQuery(CENSUS_CATEGORY);
    expect(r.complete).toBe(false);
    expect(r.unreachable.length).toBeGreaterThan(0);
    // …and the count it DID compute is still real, just a floor.
    expect(r.computedOverCount).toBe(1);
  });

  it('complete:true only when every declared source read', () => {
    for (const s of censusSourceTable()) {
      (window as unknown as Record<string, unknown>)[s.store] = listStore([]);
    }
    invalidateAnalysisReadModel();
    const r = runQuery(CENSUS_CATEGORY);
    expect(r.unreachable).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.computedOverCount).toBe(0);
    // ⛔ Zero elements with every store read is a REAL answer and produces no
    // figures — not an error, and not an "incomplete".
    expect(r.figures).toEqual([]);
  });
});

describe('§ANALYSIS-HONESTY — nothing is silently dropped', () => {
  it('an element with no levelId becomes a NAMED bar, never a missing one', () => {
    window.wallStore = listStore([
      { id: 'w1', levelId: 'L0' },
      { id: 'w2' },              // no level
      { id: 'w3', levelId: 'L0' },
    ]);
    const r = runQuery(CENSUS_LEVEL);
    const total = r.figures.reduce((s, f) => s + f.value, 0);
    // The bars must SUM to the census total. If unassigned were dropped, this
    // would be 2 against a headline of 3 with nothing on screen saying why.
    expect(total).toBe(3);
    const un = r.figures.find((f) => f.key === 'unassigned')!;
    expect(un).toBeDefined();
    expect(un.value).toBe(1);
    expect(un.label).toBe('No level assigned');
    // …and named absence sorts LAST, so it never leads the chart.
    expect(r.figures[r.figures.length - 1]!.key).toBe('unassigned');
  });

  it('an element with no type becomes `Untyped`, never folded into the largest slice', () => {
    window.wallStore = listStore([
      { id: 'w1', systemTypeId: 'basic-200' },
      { id: 'w2', systemTypeId: 'basic-200' },
      { id: 'w3' },
    ]);
    const r = runQuery(CENSUS_TYPE);
    expect(r.figures.reduce((s, f) => s + f.value, 0)).toBe(3);
    const untyped = r.figures.find((f) => f.key === 'untyped')!;
    expect(untyped.value).toBe(1);
    expect(untyped.label).toBe('Untyped');
  });

  it('type keys are namespaced by family, so two families cannot merge', () => {
    // A wall type id and a room type id may be the same string. Merging them
    // would invent a category that exists in neither store.
    window.wallStore = listStore([{ id: 'w1', systemTypeId: 'standard' }]);
    window.roomStore = listStore([{ id: 'r1', roomType: 'standard' }]);
    const r = runQuery(CENSUS_TYPE);
    const keys = r.figures.map((f) => f.key);
    expect(keys).toContain('walls:standard');
    expect(keys).toContain('rooms:standard');
    expect(r.figures.every((f) => f.value === 1)).toBe(true);
  });

  it('every figure carries element ids — a number you cannot open is not a figure', () => {
    window.wallStore = listStore([{ id: 'w1' }, { id: 'w2' }]);
    window.roomStore = listStore([{ id: 'r1' }]);
    for (const q of [CENSUS_CATEGORY, CENSUS_LEVEL, CENSUS_TYPE]) {
      invalidateAnalysisReadModel();
      for (const f of runQuery(q).figures) {
        expect(f.elementIds.length, `${q.id} / ${f.key} has no traceable elements`).toBe(f.value);
        expect(f.basis.length, `${q.id} / ${f.key} has no stated basis`).toBeGreaterThan(0);
      }
    }
  });

  it('an element with no id is not counted, because it cannot be traced to', () => {
    window.wallStore = listStore([{ id: 'w1' }, {} as Rec]);
    const r = runQuery(CENSUS_CATEGORY);
    expect(r.figures.find((f) => f.key === 'walls')!.value).toBe(1);
  });
});

describe('§ANALYSIS-HONESTY — the read model refuses rather than inventing', () => {
  it('⛔ an unprojected axis THROWS instead of returning an empty result', () => {
    window.wallStore = listStore([{ id: 'w1' }]);
    const bad: AnalysisQuery = {
      id: 'test:bad', source: 'census', groupBy: 'chapter', measure: 'count', cost: 'O(n)',
    };
    // An empty result would render as "no data", which is the invented-aggregate
    // failure H3 exists to prevent. A throw is caught by the surface and shown.
    expect(() => runQuery(bad)).toThrow(/does not project the axis/);
  });

  it('identical query ids are computed ONCE and share one result object', () => {
    window.wallStore = listStore([{ id: 'w1' }]);
    const a = runQuery(CENSUS_CATEGORY);
    const b = runQuery(CENSUS_CATEGORY);
    expect(b).toBe(a); // reference equality — the cache, not a re-run
  });

  it('selection queries are NOT cached, or the first selection would freeze', () => {
    window.wallStore = listStore([{ id: 'w1' }, { id: 'w2' }]);
    const q: AnalysisQuery = {
      id: 'test:sel', source: 'selection', groupBy: 'category', measure: 'count', cost: 'O(k)',
    };
    const one = runQuery(q, ['w1']);
    const two = runQuery(q, ['w1', 'w2']);
    expect(one.computedOverCount).toBe(1);
    expect(two.computedOverCount).toBe(2);
    expect(two).not.toBe(one);
  });

  it('a selected id no censused store claims is REPORTED, not dropped', () => {
    window.wallStore = listStore([{ id: 'w1' }]);
    const q: AnalysisQuery = {
      id: 'test:sel2', source: 'selection', groupBy: 'category', measure: 'count', cost: 'O(k)',
    };
    const r = runQuery(q, ['w1', 'ghost-1']);
    const unplaced = r.figures.find((f) => f.key === 'unmeasured')!;
    expect(unplaced).toBeDefined();
    expect(unplaced.value).toBe(1);
    expect(unplaced.label).toContain('not in any censused store');
    expect(r.figures.reduce((s, f) => s + f.value, 0)).toBe(2);
  });

  it('an empty selection is an empty state, not a zeroed chart', () => {
    window.wallStore = listStore([{ id: 'w1' }]);
    const q: AnalysisQuery = {
      id: 'test:sel3', source: 'selection', groupBy: 'category', measure: 'count', cost: 'O(k)',
    };
    const r = runQuery(q, []);
    expect(r.figures).toEqual([]);
    expect(r.computedOverCount).toBe(0);
  });
});

describe('§ANALYSIS-HONESTY — levels resolve through the live authority', () => {
  it('a level id resolves to its name via bimManager.getLevels()', () => {
    // `window.levelStore` is a PHANTOM — never assigned in production (ADR-0327).
    // The authority is bimManager. If this ever regresses, every bar in the
    // level chart silently renders a raw uuid.
    window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
    window.wallStore = listStore([{ id: 'w1', levelId: 'L0' }]);
    const r = runQuery(CENSUS_LEVEL);
    expect(r.figures[0]!.label).toBe('Ground floor');
  });

  it('an unreadable level table degrades to raw ids, and does NOT take the census down', () => {
    window.bimManager = { getLevels: (): never => { throw new Error('no levels'); } };
    window.wallStore = listStore([{ id: 'w1', levelId: 'L0' }]);
    const r = runQuery(CENSUS_LEVEL);
    expect(r.figures[0]!.label).toBe('L0'); // worse-looking, still TRUE
    expect(r.figures[0]!.value).toBe(1);
  });
});

describe('§ANALYSIS-TREEMAP — area encodes quantity, or the item is not a tile', () => {
  it('tiles fill the unit square and their areas are proportional to value', () => {
    const layout = squarify([
      { key: 'a', label: 'A', value: 50 },
      { key: 'b', label: 'B', value: 30 },
      { key: 'c', label: 'C', value: 20 },
    ]);
    expect(layout.tiles).toHaveLength(3);
    const area = layout.tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(1, 5);
    const byKey = new Map(layout.tiles.map((t) => [t.key, t.w * t.h]));
    expect(byKey.get('a')!).toBeCloseTo(0.5, 5);
    expect(byKey.get('b')!).toBeCloseTo(0.3, 5);
    expect(byKey.get('c')!).toBeCloseTo(0.2, 5);
  });

  it('every tile stays inside the unit square', () => {
    const items = Array.from({ length: 17 }, (_, i) => ({ key: `k${i}`, label: `K${i}`, value: (i + 1) * 3 }));
    for (const t of squarify(items).tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('⛔ a zero or negative value is OMITTED and REPORTED, never drawn as a sliver', () => {
    const layout = squarify([
      { key: 'a', label: 'A', value: 10 },
      { key: 'z', label: 'Z', value: 0 },
      { key: 'n', label: 'N', value: -4 },
      { key: 'x', label: 'X', value: Number.NaN },
    ]);
    expect(layout.tiles.map((t) => t.key)).toEqual(['a']);
    expect(layout.omitted.map((o) => o.key).sort()).toEqual(['n', 'x', 'z']);
  });

  it('an all-empty input produces no tiles and no exception', () => {
    const layout = squarify([]);
    expect(layout.tiles).toEqual([]);
    expect(layout.laidOutTotal).toBe(0);
  });
});

describe('§ANALYSIS-CATALOGUE — the refusals name their gap', () => {
  it('every NOT BUILT widget names what is missing and why a fake would be worse', () => {
    const refusals = WIDGET_CATALOGUE.filter((w) => w.notBuilt);
    // The five the SPEC tiers T3: change table, GFA/NIA, SIA 416, unit mix, tenure.
    expect(refusals.length).toBeGreaterThanOrEqual(5);
    for (const w of refusals) {
      expect(w.kind, `${w.id} must render as not-built`).toBe('not-built');
      expect(w.query, `${w.id} must have NO query — a refusal computes nothing`).toBeNull();
      expect(w.notBuilt!.need.length, `${w.id} names no missing input`).toBeGreaterThan(0);
      expect(w.notBuilt!.close.length, `${w.id} does not say why a plausible version is worse`).toBeGreaterThan(40);
      // H7: not "no data" — a specific, named absence.
      expect(w.notBuilt!.lede.toLowerCase()).not.toBe('no data');
    }
  });

  it('the five T3 rows the SPEC names are all present', () => {
    for (const id of ['change-table', 'gfa-nia', 'sia-416', 'unit-mix', 'tenure']) {
      expect(widgetById(id), `${id} is missing from the catalogue`).toBeDefined();
      expect(widgetById(id)!.notBuilt, `${id} must be a refusal, not a chart`).not.toBeNull();
    }
  });

  it('every BUILT widget declares a query with a cost and a projected axis', () => {
    const projected = new Set(['category', 'level', 'type', 'chapter', 'unit']);
    for (const w of WIDGET_CATALOGUE.filter((x) => !x.notBuilt)) {
      expect(w.query, `${w.id} is built but has no query`).not.toBeNull();
      expect(projected.has(w.query!.groupBy), `${w.id} groups by an unprojected axis`).toBe(true);
      expect(w.query!.cost.length).toBeGreaterThan(0);
      // Take-off widgets are O(n·m) and MUST be manual — never on-commit.
      if (w.query!.source === 'takeoff') expect(w.refresh, `${w.id} runs an O(n·m) scan on commit`).toBe('manual');
    }
  });

  it('the default layout shows at least one refusal on first open', () => {
    // So the surface's honesty is visible immediately, not only to somebody who
    // goes looking in the picker.
    const refusalsInDefault = DEFAULT_LAYOUT.filter((id) => widgetById(id)?.notBuilt);
    expect(refusalsInDefault.length).toBeGreaterThanOrEqual(1);
    for (const id of DEFAULT_LAYOUT) expect(widgetById(id), `${id} is not in the catalogue`).toBeDefined();
  });

  it('a quantity widget never mixes two units in one figure set', () => {
    for (const w of WIDGET_CATALOGUE) {
      if (w.query?.measure === 'quantity') {
        expect(w.query.unit, `${w.id} measures a quantity without naming its unit`).toBeDefined();
      }
    }
  });
});

describe('§ANALYSIS-COLOUR — absence never borrows a category colour', () => {
  it('absence keys always resolve to the named neutral, whatever their index', () => {
    for (const key of ABSENCE_KEYS) {
      for (let i = 0; i < 12; i++) {
        expect(seriesColour(i, key)).toBe('var(--app-cat-unassigned)');
      }
    }
  });

  it('real categories rotate through the eight series and never reach the neutral', () => {
    for (let i = 0; i < 24; i++) {
      const c = seriesColour(i, 'walls');
      expect(c).not.toBe('var(--app-cat-unassigned)');
      expect(c).toMatch(/^var\(--app-cat-[1-8]\)$/);
    }
  });
});

describe('§ANALYSIS-REACHABILITY — committed is not the same as reachable', () => {
  // MEMORY §committed-is-not-reachable: four fixes in one session ran nowhere.
  // These are SHIPPED-TEXT assertions — they cannot prove the panel appears, and
  // are not dressed up as if they could. What they DO pin is the wiring that,
  // if it silently reverted, would leave a fully-tested surface that never
  // mounts — which is the exact failure mode that memory records.
  const REPO = resolve(__dirname, '../../../../../..');
  const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

  it('engineLauncher side-effect imports the surface, or nothing ever constructs it', () => {
    expect(read('apps/editor/src/engine/engineLauncher.ts')).toContain("import '../ui/analysis/AnalysisSurface'");
  });

  it("⭐ the runtime-event flush runs BEFORE restoreFromStorage — the ordering the mode listener depends on", () => {
    // AnalysisSurface is a module-load singleton, so its subscription is QUEUED
    // by onRuntimeEvent() and only applies at flushRuntimeEventListeners().
    // restoreFromStorage() is what emits `pryzm-workspace-mode` at boot for a
    // user whose saved mode is `analysis`. If restore ever moved AHEAD of the
    // flush, that user would land in analysis mode with a canvas at 50% and NO
    // panel beside it — the whole feature, silently absent, with every unit
    // test still green. Measured at HEAD: flush 1053, restore 1056.
    const src = read('apps/editor/src/engine/engineLauncher.ts');
    const flushAt = src.indexOf('flushRuntimeEventListeners()');
    const restoreAt = src.indexOf('workspaceController.restoreFromStorage()');
    expect(flushAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeGreaterThan(-1);
    expect(flushAt, 'restoreFromStorage now runs BEFORE the flush — the Analysis panel will not appear at boot')
      .toBeLessThan(restoreAt);
  });

  it('the analysis mode is in the registry with a half canvas, or the panel covers a hidden viewport', () => {
    const modes = read('apps/editor/src/ui/platform/workspaceModes.ts');
    expect(modes).toContain("id: 'analysis'");
    expect(/id: 'analysis',[\s\S]{0,400}?canvas: 'half'/.test(modes)).toBe(true);
  });

  it('WorkspaceController lays out the analysis mode explicitly', () => {
    // The canvas half is registry-driven; the workbench half is a per-mode
    // branch, and a mode missing from that switch keeps the DataWorkbench in
    // whatever state the previous mode left it.
    expect(read('apps/editor/src/ui/WorkspaceController.ts')).toContain("case 'analysis':");
  });

  it('the anl- stylesheet is concatenated into the injected theme', () => {
    const theme = read('apps/editor/src/ui/styles/AppTheme.ts');
    expect(theme).toContain("from './panels/analysisSurface'");
    expect(theme).toContain('+ ANALYSIS_SURFACE_STYLES');
  });
});
