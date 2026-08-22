/**
 * The derived sequence AS A GRAPH — and the four things it must never become.
 *
 * §SEQUENCE-GRAPH (L-6300..L-6312) · ADR-0355 · C37 §5.7.
 *
 * ⭐ THE NEGATIVE ASSERTIONS ARE THE POINT OF THIS FILE. A dependency graph and
 * a programme look similar enough that the difference has to be tested, not
 * reviewed. The tests that matter most here assert that no axis exists, that no
 * duration ever appears, that the refusals travel WITH the payload, and that the
 * unmeasured trades are named rather than drawn as empty nodes.
 */

import { describe, it, expect } from 'vitest';
import { deriveConstructionSequence, NO_LEVEL } from './ConstructionSequence.js';
import { buildSequenceGraph, sequenceGraphTimeClaims } from './SequenceGraph.js';
import type { TakeoffLine, TakeoffResult, CoverageRow } from './TakeoffTypes.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function contribution(elementId: string, quantity: number, levelId: string | null) {
  return { elementId, quantity, levelId, mark: null, label: null, note: null };
}

function line(over: Partial<TakeoffLine> & { code: string }): TakeoffLine {
  const contributions = over.contributions ?? [contribution('e1', 10, 'L0')];
  return {
    chapter: 'walls',
    description: over.code,
    unit: 'm2',
    quantity: contributions.reduce((a, c) => a + c.quantity, 0),
    elementIds: contributions.map((c) => c.elementId),
    basis: 'test',
    qualifiers: [],
    secondary: [],
    materialBreakdown: [],
    materialGap: 'test fixture',
    ...over,
    contributions,
  } as TakeoffLine;
}

function takeoff(lines: TakeoffLine[], coverage: CoverageRow[] = []): TakeoffResult {
  return {
    generatedAt: 0,
    lines,
    coverage,
    unreadableStores: [],
    measuredElementCount: new Set(lines.flatMap((l) => l.elementIds)).size,
  };
}

const LEVELS = [
  { levelId: 'L0', name: 'Ground', elevation: 0 },
  { levelId: 'L1', name: 'First', elevation: 3 },
  { levelId: 'L2', name: 'Second', elevation: 6 },
];

const NOT_MEASURED: CoverageRow[] = [
  { family: 'Foundations', state: 'NOT_MEASURED', note: 'there is no foundation element family' },
  { family: 'Ductwork', state: 'NOT_MEASURED', note: 'no duct family is modelled' },
];

function building(coverage: CoverageRow[] = NOT_MEASURED): TakeoffResult {
  return takeoff([
    line({ code: 'SLAB.concrete.200', chapter: 'structure', unit: 'm3',
      contributions: [contribution('s0', 20, 'L0'), contribution('s1', 20, 'L1'), contribution('s2', 20, 'L2')] }),
    line({ code: 'WALL.blockwork.200', chapter: 'walls',
      contributions: [contribution('w0', 30, 'L0'), contribution('w1', 30, 'L1')] }),
    line({ code: 'DOOR.single.900x2100', chapter: 'openings', unit: 'ud',
      contributions: [contribution('d0', 1, 'L0')] }),
    line({ code: 'FIN.FLOOR.tile', chapter: 'finishes',
      contributions: [contribution('r0', 45, 'L0')] }),
    line({ code: 'STAIR.l.concrete', chapter: 'circulation', unit: 'ud',
      contributions: [contribution('st0', 1, 'L0')] }),
    line({ code: 'RAIL.glass', chapter: 'circulation', unit: 'm',
      contributions: [contribution('rl0', 4, 'L0')] }),
    line({ code: 'FURN.desk', chapter: 'furnishings', unit: 'ud',
      contributions: [contribution('f0', 1, null)] }),
  ], coverage);
}

function graphOf(t: TakeoffResult = building(), levels = LEVELS) {
  const seq = deriveConstructionSequence(t, levels);
  return { seq, graph: buildSequenceGraph(seq, t) };
}

// ═════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS GRAPH MUST NEVER BECOME
// ═════════════════════════════════════════════════════════════════════════════

describe('the graph refuses time, permanently', () => {
  it('declares NO time axis, and the gate agrees', () => {
    const { seq, graph } = graphOf();
    expect(graph.timeAxis).toBeNull();
    expect(sequenceGraphTimeClaims(graph, seq)).toEqual([]);
  });

  it('no node carries a duration, a date, a float or a critical-path flag', () => {
    const { graph } = graphOf();
    for (const n of graph.nodes) {
      const keys = Object.keys(n);
      for (const banned of ['duration', 'durationDays', 'start', 'end', 'date', 'float', 'critical', 'x', 'y']) {
        expect(keys).not.toContain(banned);
      }
    }
  });

  it('every node still carries the duration REFUSAL, verbatim', () => {
    const { graph } = graphOf();
    expect(graph.nodes.length).toBeGreaterThan(0);
    for (const n of graph.nodes) {
      expect(n.durationNote).toContain('output rate');
    }
  });

  it('the refusals travel WITH the payload, so a view cannot render without them', () => {
    const { graph } = graphOf();
    const all = graph.refusals.join(' ');
    expect(graph.refusals.length).toBe(4);
    expect(all).toContain('DEPENDENCY GRAPH, not a programme');
    expect(all).toContain('no time axis');
    expect(all).toContain('DEPENDENCY DEPTH');
    expect(all).toContain('critical path');
  });

  it('the gate goes RED if the refusals are stripped', () => {
    const { seq, graph } = graphOf();
    const stripped = { ...graph, refusals: [] as readonly string[] };
    expect(sequenceGraphTimeClaims(stripped, seq).length).toBe(1);
  });

  it('the gate goes RED if an activity acquires a duration', () => {
    const { seq, graph } = graphOf();
    const poisoned = {
      ...seq,
      activities: seq.activities.map((a, i) =>
        i === 1 ? { ...a, durationDays: 5 as unknown as null } : a),
    };
    expect(sequenceGraphTimeClaims(graph, poisoned).length).toBe(1);
    expect(sequenceGraphTimeClaims(graph, poisoned)[0]).toContain('carries a duration');
  });

  it('carries the sequence coverage statement UNCHANGED — one string, two views', () => {
    const { seq, graph } = graphOf();
    expect(graph.coverageStatement).toBe(seq.coverageStatement);
    expect(graph.coverageStatement).toContain('NO ACTIVITY HAS A DURATION');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE GRAPH IS A DAG, AND THE EDGES CARRY THEIR REASON
// ═════════════════════════════════════════════════════════════════════════════

describe('the DAG', () => {
  it('every edge points from an earlier rank to a later one — no back edges', () => {
    const { graph } = graphOf();
    const rank = new Map(graph.nodes.map((n) => [n.id, n.rank]));
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const e of graph.edges) {
      expect(rank.get(e.from)!).toBeLessThan(rank.get(e.to)!);
    }
  });

  it('every edge names an existing node at BOTH ends — no arrow into nothing', () => {
    const { graph } = graphOf();
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it('⭐ EVERY edge carries a non-empty WHY — the reasoning is the deliverable', () => {
    const { graph } = graphOf();
    for (const e of graph.edges) {
      expect(e.why.length).toBeGreaterThan(0);
    }
  });

  it('the WHY matches the engine word-for-word — the graph invents no rationale', () => {
    const { seq, graph } = graphOf();
    for (const a of seq.activities) {
      a.dependsOn.forEach((dep, i) => {
        const edge = graph.edges.find((e) => e.from === dep && e.to === a.id)!;
        expect(edge.why).toBe(a.dependencyReasons[i]);
      });
    }
  });

  it('the hard one is present and says why: a level follows the level below', () => {
    const { graph } = graphOf();
    const hard = graph.edges.find((e) => e.why.includes('cannot stand on a slab'));
    expect(hard).toBeDefined();
    expect(hard!.from).toContain('STRUCTURE@L0');
    expect(hard!.to).toContain('STRUCTURE@L1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEPTH IS DEPENDENCY DEPTH, NOT TIME
// ═════════════════════════════════════════════════════════════════════════════

describe('depth', () => {
  it('SUBSTRUCTURE is the root at depth 0', () => {
    const { graph } = graphOf();
    const root = graph.nodes.find((n) => n.stage === 'SUBSTRUCTURE')!;
    expect(root.depth).toBe(0);
    expect(graph.rootId).toBe(root.id);
  });

  it('depth increases along every edge — it is a longest-path layering', () => {
    const { graph } = graphOf();
    const depth = new Map(graph.nodes.map((n) => [n.id, n.depth]));
    for (const e of graph.edges) {
      expect(depth.get(e.to)!).toBeGreaterThan(depth.get(e.from)!);
    }
  });

  it('a higher storey is DEEPER than the one below it', () => {
    const { graph } = graphOf();
    const d = (id: string) => graph.nodes.find((n) => n.id === id)!.depth;
    expect(d('STRUCTURE@L1')).toBeGreaterThan(d('STRUCTURE@L0'));
    expect(d('STRUCTURE@L2')).toBeGreaterThan(d('STRUCTURE@L1'));
  });

  it('maxDepth equals the deepest node, so the view can size its rings', () => {
    const { graph } = graphOf();
    expect(graph.maxDepth).toBe(Math.max(...graph.nodes.map((n) => n.depth)));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ HONEST ABSENCE — the two states that must stay visible
// ═════════════════════════════════════════════════════════════════════════════

describe('absence is a first-class state', () => {
  it('SUBSTRUCTURE is DRAWN and flagged MEASURES NOTHING — never dropped', () => {
    const { graph } = graphOf();
    const root = graph.nodes.find((n) => n.stage === 'SUBSTRUCTURE')!;
    expect(root.measuresNothing).toBe(true);
    expect(root.elementCount).toBe(0);
    expect(root.quantityLabel).toBe('');
    expect(root.note).toContain('MEASURES NOTHING');
  });

  it('⛔ unmeasured trades are NAMED, and are NOT nodes', () => {
    const { graph } = graphOf();
    expect(graph.absentTrades.map((t) => t.family)).toEqual(['Foundations', 'Ductwork']);
    for (const t of graph.absentTrades) {
      expect(graph.nodes.some((n) => n.label === t.family)).toBe(false);
      expect(t.note.length).toBeGreaterThan(0);
    }
  });

  it('an element with NO level is kept and labelled, never assumed onto a storey', () => {
    const { graph } = graphOf();
    const orphan = graph.nodes.find((n) => n.id.endsWith(NO_LEVEL) && !n.measuresNothing)!;
    expect(orphan).toBeDefined();
    expect(orphan.sublabel).toBe('no level stated');
    expect(orphan.note).toContain('NO LEVEL');
  });

  it('with no level order the storey dependency is ABSENT, and the statement says so', () => {
    const { graph } = graphOf(building(), []);
    expect(graph.edges.some((e) => e.why.includes('cannot stand on a slab'))).toBe(false);
    expect(graph.coverageStatement).toContain('NO LEVEL ORDER WAS SUPPLIED');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LEGEND + DETERMINISM
// ═════════════════════════════════════════════════════════════════════════════

describe('legend and determinism', () => {
  it('stagesPresent is in BUILD ORDER and contains only stages that are drawn', () => {
    const { graph } = graphOf();
    const drawn = new Set(graph.nodes.map((n) => n.stage));
    expect(graph.stagesPresent.length).toBe(drawn.size);
    for (const s of graph.stagesPresent) expect(drawn.has(s)).toBe(true);
    expect(graph.stagesPresent[0]).toBe('SUBSTRUCTURE');
  });

  it('is deterministic — the same take-off gives a byte-identical graph', () => {
    const a = graphOf().graph;
    const b = graphOf().graph;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('an empty take-off still draws the substructure and still refuses', () => {
    const t = takeoff([], []);
    const seq = deriveConstructionSequence(t, LEVELS);
    const graph = buildSequenceGraph(seq, t);
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0]!.measuresNothing).toBe(true);
    expect(graph.edges).toEqual([]);
    expect(sequenceGraphTimeClaims(graph, seq)).toEqual([]);
  });
});
