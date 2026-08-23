/**
 * §IFC-TREE-GROUPINGS / §IFC-TREE-BOUND / §IFC-TREE-STORY — behaviour.
 *
 * The differentiating assertions are the EMPTY-STATE ones. It is easy to write
 * a tree that renders; the thing this feature exists to get right is what it
 * says when a grouping has nothing to show, because ABSENT, NOT-EXTRACTED and
 * BOTH-AT-ONCE are three different facts that produce the same empty array.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  groupByClass,
  groupByMaterial,
  groupBySpatial,
  groupByStorey,
  groupBySystem,
  GROUPINGS,
} from '../src/tree/groupings.js';
import {
  MAX_MATERIALISED_ROWS,
  materialiseRows,
  truncationNotice,
} from '../src/tree/row-window.js';
import {
  ANSWERABLE_SLOTS,
  buildElementStory,
  openQuestions,
  withAiAnswers,
  type SlotId,
} from '../src/tree/story-model.js';
import { gateBatch, MAX_BATCH_ELEMENTS, type AiStoryRequest } from '../src/tree/ai-seam.js';
import { adaptImportedModel, adaptNativeElements, normaliseRawIfcType } from '../src/tree/adapters.js';

const REPO = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------

describe('§IFC-TREE-SOURCE — the adapter describes the REAL store, not a wish', () => {
  /**
   * ⭐ The "fake more capable than real" guard. `ImportedRecordLike` is a
   * hand-written mirror of `IfcElementRecord`. A mirror built from a header
   * cannot falsify the header — so this re-reads the header off disk.
   */
  it('ImportedRecordLike matches IfcElementRecord field-for-field', () => {
    const src = readFileSync(
      resolve(REPO, 'packages/file-format/src/import/ifc/IfcModelStore.ts'),
      'utf8',
    );
    const iface = src.slice(
      src.indexOf('export interface IfcElementRecord'),
      src.indexOf('}', src.indexOf('export interface IfcElementRecord')),
    );
    const real = new Set([...iface.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]!));

    expect(real).toEqual(
      new Set([
        'id',
        'expressID',
        'name',
        'ifcTypeName',
        'rawIfcType',
        'storeyName',
        'storeyExpressID',
        'psets',
      ]),
    );

    // The two absences the whole honesty design rests on.
    expect(real.has('material'), 'IfcElementRecord gained a material field — revisit IMPORTED_CAPABILITY').toBe(false);
    expect(real.has('system'), 'IfcElementRecord gained a system field — revisit IMPORTED_CAPABILITY').toBe(false);
  });
});

// ---------------------------------------------------------------------------

const importedModel = {
  modelId: 'm1',
  modelName: 'SG Tower.ifc',
  storeyOrder: ['Level 1', 'Level 2'],
  elements: [
    {
      id: 'i1',
      expressID: 243274,
      name: 'Basic Roof:SG Metal Panels roof:243274',
      ifcTypeName: 'IfcRoof',
      rawIfcType: 'IFCROOF',
      storeyName: 'Level 2',
      storeyExpressID: 9,
      psets: { Pset_RoofCommon: { FireRating: 'REI 60', Status: 'NEW' } },
    },
    {
      id: 'i2',
      expressID: 1180,
      name: 'M_Skylight:1180 x 1170mm',
      ifcTypeName: 'IfcWindow',
      rawIfcType: 'IFCWINDOW',
      storeyName: 'Level 2',
      storeyExpressID: 9,
      psets: {},
    },
  ],
};

const nativeElements = [
  { id: 'w1', type: 'wall', name: 'Wall 1', levelId: 'L1', levelName: 'Level 1' },
  { id: 'b1', type: 'beam', name: 'Beam 1', levelId: 'L1', levelName: 'Level 1', material: 'Steel S355' },
  { id: 'p1', type: 'pool', name: 'Pool', levelId: 'L1', levelName: 'Level 1' },
];

const imported = adaptImportedModel(importedModel);
const native = adaptNativeElements(nativeElements, 'Villa');

describe('§IFC-TREE-GROUPINGS — By IFC system, the honest-empty case', () => {
  it('IMPORTED only -> NOT-EXTRACTED, and never claims the file has no systems', () => {
    const g = groupBySystem([imported]);
    expect(g.coverage.kind).toBe('empty');
    if (g.coverage.kind === 'empty') {
      expect(g.coverage.cause).toBe('not-extracted');
      expect(g.coverage.message).toContain('or system extraction is not yet enabled');
      expect(g.coverage.message).toContain('limit of the parse');
    }
  });

  it('NATIVE only -> ABSENT, a real statement about PRYZM elements', () => {
    const g = groupBySystem([native]);
    if (g.coverage.kind === 'empty') expect(g.coverage.cause).toBe('absent');
  });

  it('⭐ BOTH loaded -> names BOTH causes in one sentence, refusing to pick', () => {
    const g = groupBySystem([imported, native]);
    expect(g.coverage.kind).toBe('empty');
    if (g.coverage.kind === 'empty') {
      expect(g.coverage.cause).toBe('absent-or-not-extracted');
      expect(g.coverage.message).toContain('Both causes are in play');
      expect(g.coverage.message).toContain('different facts');
    }
  });

  it('the true total is reported even when the grouping is empty', () => {
    expect(groupBySystem([imported, native]).totalElements).toBe(5);
  });
});

describe('§IFC-TREE-GROUPINGS — By material distinguishes not-authored from not-extracted', () => {
  it('imported material is NOT-EXTRACTED, and says the parse is data-only', () => {
    const g = groupByMaterial([imported]);
    if (g.coverage.kind === 'empty') {
      expect(g.coverage.cause).toBe('not-extracted');
      expect(g.coverage.message).toContain('not yet extracted');
    }
  });

  it('native with one material groups it, and buckets the rest as NOT AUTHORED', () => {
    const g = groupByMaterial([native]);
    expect(g.coverage.kind).toBe('populated');
    const steel = g.groups.find((x) => x.label === 'Steel S355');
    expect(steel?.count).toBe(1);
    const na = g.groups.find((x) => x.deficit === 'not-authored');
    expect(na?.label).toContain('not authored on this element');
  });

  it('mixed sources separate the two deficits rather than merging them', () => {
    const g = groupByMaterial([imported, native]);
    const labels = g.groups.map((x) => x.label);
    expect(labels).toContain('Material not extracted');
    expect(labels).toContain('Material not authored on this element');
    if (g.coverage.kind === 'populated') {
      expect(g.coverage.limitNote).toContain('NOT counted as unmaterialed');
    }
  });
});

describe('§IFC-TREE-GROUPINGS — By IFC class surfaces the unmapped families', () => {
  it('an unranked native family lands in a NAMED unmapped bucket, not a proxy', () => {
    const g = groupByClass([native]);
    const unmapped = g.groups.find((x) => x.deficit === 'unmapped');
    expect(unmapped, 'pool must be visible as unmapped').toBeTruthy();
    expect(unmapped!.label).toContain('no C25 §2 row');
    expect(g.groups.map((x) => x.label)).not.toContain('IfcBuildingElementProxy');
  });

  it('imported classes come through as authored by the file', () => {
    const g = groupByClass([imported]);
    expect(g.groups.map((x) => x.label).sort()).toEqual(['IfcRoof', 'IfcWindow']);
  });

  it('deficit buckets sort last so real classes lead', () => {
    const g = groupByClass([imported, native]);
    expect(g.groups[g.groups.length - 1]!.deficit).toBe('unmapped');
  });
});

describe('§IFC-TREE-GROUPINGS — spatial reports a SHORT chain, never pads it', () => {
  it('imported depth stops at storey and says so', () => {
    const g = groupBySpatial([imported]);
    expect(g.coverage.kind).toBe('populated');
    if (g.coverage.kind === 'populated') {
      expect(g.coverage.limitNote).toContain('reaches STOREY');
      expect(g.coverage.limitNote).toContain('not a claim that the file lacks them');
    }
  });

  it('nests building -> storey and rolls counts up', () => {
    const g = groupBySpatial([imported]);
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0]!.label).toBe('SG Tower.ifc');
    expect(g.groups[0]!.count).toBe(2);
    expect(g.groups[0]!.children[0]!.label).toBe('Level 2');
  });

  it('no model -> says no model, not "absent"', () => {
    const g = groupBySpatial([]);
    if (g.coverage.kind === 'empty') expect(g.coverage.cause).toBe('no-model');
  });
});

describe('§IFC-TREE-GROUPINGS — By storey covers both halves', () => {
  it('groups imported and native storeys together', () => {
    const g = groupByStorey([imported, native]);
    const labels = g.groups.map((x) => x.label);
    expect(labels).toContain('Level 2');
    expect(labels).toContain('Level 1');
  });

  it('all five groupings are registered', () => {
    expect(GROUPINGS.map((g) => g.id)).toEqual(['spatial', 'class', 'system', 'material', 'storey']);
  });
});

// ---------------------------------------------------------------------------

describe('§IFC-TREE-BOUND — counts cover everything, rows do not', () => {
  const big = adaptNativeElements(
    Array.from({ length: 111_263 }, (_, i) => ({
      id: `e${i}`,
      type: 'wall',
      name: `Wall ${i}`,
      levelId: 'L1',
      levelName: 'Level 1',
    })),
    'Big',
  );

  it('⭐ the group COUNT is exact at 111,263 — grouping never truncates', () => {
    const g = groupByClass([big]);
    expect(g.totalElements).toBe(111_263);
    expect(g.groups.find((x) => x.label === 'IfcWall')!.count).toBe(111_263);
  });

  it('a COLLAPSED tree over 111k elements materialises no element rows', () => {
    const g = groupByClass([big]);
    const w = materialiseRows(g.groups, new Set(), (id) => id, g.totalElements);
    expect(w.renderedElements).toBe(0);
    expect(w.rows).toHaveLength(1);
    expect(w.truncated).toBe(false);
    expect(w.notice).toBeNull();
  });

  it('an EXPANDED huge group stops at the bound and states the TRUE total', () => {
    const g = groupByClass([big]);
    const w = materialiseRows(g.groups, new Set(['IfcWall']), (id) => id, g.totalElements);
    expect(w.renderedElements).toBeLessThanOrEqual(MAX_MATERIALISED_ROWS);
    expect(w.truncated).toBe(true);
    expect(w.totalElements).toBe(111_263);
    expect(w.notice).toContain('111,263');
    expect(w.notice).toContain('Counts and group actions still cover all');
  });

  it('the notice never implies the rendered count is the total', () => {
    const n = truncationNotice(300, 111_263);
    expect(n).toContain('300');
    expect(n).toContain('111,263');
    expect(n).toContain('preview');
  });
});

// ---------------------------------------------------------------------------

describe('§IFC-TREE-STORY — eight slots, and provenance that cannot lie', () => {
  const el = imported.elements[0]!;
  const story = buildElementStory(el);

  it('the denominator is 8 — "How we know" is the ledger, not a ninth question', () => {
    expect(ANSWERABLE_SLOTS).toHaveLength(8);
    expect(story.completeness.total).toBe(8);
    expect(story.completeness.headline).toMatch(/^\d of 8 answered$/);
  });

  it('a model-grounded answer carries a "from the model" chip', () => {
    const where = story.slots.find((s) => s.id === 'where')!;
    expect(where.state).toBe('answered');
    if (where.state === 'answered') expect(where.provenance[0]!.kind).toBe('model');
  });

  it('a native element cites the MAPPING, not the model, for its class', () => {
    const s = buildElementStory(native.elements[0]!);
    const what = s.slots.find((x) => x.id === 'what-it-is')!;
    if (what.state === 'answered') {
      expect(what.provenance[0]!.kind).toBe('mapping');
      expect(what.provenance[0]!.detail).toContain('C25 §2');
    }
  });

  it('unknown slots distinguish not-in-model from not-extracted', () => {
    const s = buildElementStory(imported.elements[1]!);
    const partOf = s.slots.find((x) => x.id === 'part-of-and-made-of')!;
    expect(partOf.state).toBe('unknown');
    if (partOf.state === 'unknown') {
      expect(partOf.reason).toBe('not-extracted');
      expect(partOf.note).toContain('data-only parse');
    }
    const nativeStory = buildElementStory(native.elements[0]!);
    const nPartOf = nativeStory.slots.find((x) => x.id === 'part-of-and-made-of')!;
    if (nPartOf.state === 'unknown') {
      expect(nPartOf.reason).toBe('not-in-model');
      expect(nPartOf.note).toContain('not authored on this element');
    }
  });

  it('⛔ an AI answer is stamped ai, is EXCLUDED from grounded, and is flagged', () => {
    const before = story.completeness;
    const after = withAiAnswers(story, new Map<SlotId, string>([['why-it-exists', 'Weather envelope.']]));
    expect(after.completeness.answered).toBe(before.answered + 1);
    expect(after.completeness.grounded).toBe(before.grounded); // NOT incremented
    expect(after.completeness.aiOnly).toBe(1);
    const slot = after.slots.find((s) => s.id === 'why-it-exists')!;
    if (slot.state === 'answered') {
      expect(slot.provenance[0]!.kind).toBe('ai');
      expect(slot.provenance[0]!.chip).toContain('not from the model');
    }
    expect(after.howWeKnow.summary).toContain('not a fact about the building');
  });

  it('⛔ AI can never overwrite a model-grounded slot', () => {
    const after = withAiAnswers(story, new Map<SlotId, string>([['where', 'Somewhere else entirely']]));
    const where = after.slots.find((s) => s.id === 'where')!;
    if (where.state === 'answered') {
      expect(where.provenance[0]!.kind).toBe('model');
      expect(where.text).not.toContain('Somewhere else');
    }
  });

  it('open questions exclude NOT-EXTRACTED slots — asking AI cannot fix our parser', () => {
    const s = buildElementStory(imported.elements[1]!);
    expect(openQuestions(s)).not.toContain('part-of-and-made-of');
    expect(openQuestions(s)).toContain('why-it-exists');
  });

  it('an element with nothing known says so plainly', () => {
    const bare = buildElementStory(native.elements[2]!); // pool, unmapped
    expect(bare.completeness.grounded).toBeLessThan(8);
    expect(bare.slots.find((s) => s.id === 'what-it-is')!.state).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------

describe('§IFC-TREE-AI-SEAM — the fan-out bound', () => {
  const req = (id: string): AiStoryRequest => ({ elementId: id, slots: ['why-it-exists'], grounding: {} });
  const port = {
    answerOne: async () => new Map(),
    estimate: async () => null,
    answerBatch: async () => new Map(),
  };

  it('⛔ refuses a run over the cap and names the reason', () => {
    const d = gateBatch(
      Array.from({ length: MAX_BATCH_ELEMENTS + 1 }, (_, i) => req(`e${i}`)),
      null,
      port,
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.reason).toContain('Refused');
      expect(d.reason).toContain('no "research every element" action');
    }
  });

  it('⛔ with no AI wired, asking is unavailable — there is no fallback path', () => {
    const d = gateBatch([req('a')], null, null);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toContain('not wired');
  });

  it('⭐ a missing estimate says so — it never invents a number', () => {
    const d = gateBatch([req('a')], null, port);
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.estimate).toBeNull();
      expect(d.confirmation).toContain('Cost is not estimated');
      expect(d.confirmation).not.toMatch(/\$\d/);
    }
  });

  it('a permitted run names the element count and labels answers AI-inferred', () => {
    const d = gateBatch([req('a'), req('b')], null, port);
    if (d.allowed) {
      expect(d.confirmation).toContain('2 elements');
      expect(d.confirmation).toContain('not facts about the building');
    }
  });
});

describe('§IFC-TREE-ADAPTERS', () => {
  it('carries an imported class through instead of filtering it to a known list', () => {
    expect(normaliseRawIfcType('IFCPILE', 'x')).toBe('IfcPile');
    expect(normaliseRawIfcType('IfcWallStandardCase', 'x')).toBe('IfcWallStandardCase');
    expect(normaliseRawIfcType('', 'IfcRoof')).toBe('IfcRoof');
  });

  it('imported elements declare material/system/globalId NOT-EXTRACTED', () => {
    const e = imported.elements[0]!;
    expect(e.material.kind).toBe('not-extracted');
    expect(e.system.kind).toBe('not-extracted');
    expect(e.globalId.kind).toBe('not-extracted');
  });
});
