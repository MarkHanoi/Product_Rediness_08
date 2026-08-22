/**
 * §ANALYSIS-SERIES-FOCUS (L-3610) + §ANALYSIS-GRAPH-LEVEL-FILTER (L-3620).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE TWO FOUNDER SENTENCES THESE ARMS EXIST TO KEEP TRUE
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. *"when the user selects a part of the graph it should highlight this and
 *     the rest be a bit DORMANT"* — dormant, not gone. Every assertion below
 *     about focus is really an assertion that the unpicked marks are STILL
 *     THERE, because a chart that hides them is answering a different question
 *     from the one its own caption asks.
 *  2. *"filtered to Level 1" is not the same statement as "truncated at 60
 *     nodes" and they must never render identically.* One is a universe the
 *     reader chose, in which every count is EXACT. The other is the tool
 *     failing to deliver, in which every count is a FLOOR. The arms here pin
 *     that they produce different `complete` flags, different reasons and
 *     different plates.
 *
 * ⚠ happy-dom performs no layout and paints nothing. Nothing here measures an
 * opacity, a contrast ratio or a pixel. What it measures is the STATE the CSS
 * keys on — which class is set, which mark is still in the tree, which flag the
 * read model produced. The rendering itself is not established here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SeriesFocus, markSeries, dimFill, DORMANT_ALPHA } from '../seriesFocus';
import {
  projectGraph,
  scopeSentence,
  setGraphLevelFilter,
  graphLevelFilter,
  GRAPH_NODE_CAP,
  type GraphPlacement,
} from '../graphReadModel';
import { CAT_UNASSIGNED, seriesColour, ABSENCE_KEYS } from '../AnalysisTypes';

// ── Focus ────────────────────────────────────────────────────────────────────

describe('§ANALYSIS-SERIES-FOCUS — dimFill moves ALPHA and nothing else', () => {
  it('drops the alpha of a 6-digit hex without touching the hue', () => {
    expect(dimFill('#6600FF', 0.2)).toBe('rgba(102, 0, 255, 0.2)');
  });

  it('expands a 3-digit hex correctly', () => {
    expect(dimFill('#f0a', 0.5)).toBe('rgba(255, 0, 170, 0.5)');
  });

  it('re-alphas an existing rgb()/rgba() rather than nesting one', () => {
    expect(dimFill('rgb(1, 2, 3)', 0.3)).toBe('rgba(1, 2, 3, 0.3)');
    expect(dimFill('rgba(1, 2, 3, 0.9)', 0.3)).toBe('rgba(1, 2, 3, 0.3)');
  });

  it('⛔ returns an unparseable colour UNCHANGED rather than guessing one', () => {
    // A guessed fill is a MINTED colour, and ADR-0343 §D.5 forbids minting.
    // Leaving it at full strength is visually wrong and semantically honest;
    // replacing it with a grey would be the reverse, which is worse.
    expect(dimFill('color-mix(in srgb, red 50%, blue)', 0.2)).toBe('color-mix(in srgb, red 50%, blue)');
    expect(dimFill('', 0.2)).toBe('');
  });

  it('⭐ the named neutral survives a dim as the named neutral', () => {
    // ADR-0343 §D.5 / SPEC §4.1 W2 — `unassigned` / `untyped` / `unmeasured` are
    // ANSWERS about the model, never categories. A dim pass that re-tinted would
    // promote them into the categorical rotation by accident. Alpha-only cannot.
    for (const key of ABSENCE_KEYS) {
      expect(seriesColour(3, key), `${key} must take the neutral whatever its index`).toBe(CAT_UNASSIGNED);
    }
    const dimmed = dimFill('#C4CDE0'); // the resolved value of --app-cat-unassigned
    expect(dimmed).toContain('196, 205, 224');
    expect(dimmed).toContain(String(DORMANT_ALPHA));
  });
});

describe('§ANALYSIS-SERIES-FOCUS — dormant means still on screen', () => {
  let scope: HTMLElement;
  let a: HTMLElement;
  let b: HTMLElement;

  beforeEach(() => {
    scope = document.createElement('div');
    a = markSeries(document.createElement('span'), 'walls');
    b = markSeries(document.createElement('span'), 'rooms');
    scope.append(a, b);
    document.body.appendChild(scope);
  });
  afterEach(() => scope.remove());

  it('focusing one mark lights it and flags the scope', () => {
    const f = new SeriesFocus(scope);
    f.set('walls');
    expect(f.key).toBe('walls');
    expect(scope.classList.contains('anl-focus-on')).toBe(true);
    expect(a.classList.contains('anl-focused')).toBe(true);
    expect(b.classList.contains('anl-focused')).toBe(false);
  });

  it('⛔ NOTHING IS REMOVED OR HIDDEN — the unpicked mark stays in the tree', () => {
    // This is the whole rule. The card's denominator, its legend totals and its
    // percentages all describe the FULL population; hiding a mark would leave
    // those captions describing something the reader can no longer see.
    const f = new SeriesFocus(scope);
    f.set('walls');
    expect(scope.contains(b)).toBe(true);
    expect(b.hidden).toBe(false);
    expect(b.style.display).toBe('');
    expect(b.style.visibility).toBe('');
  });

  it('picking the focused series again clears the focus', () => {
    // There must always be a way BACK to the whole population by the same
    // gesture that left it, or a reader is stranded on an emphasised subset.
    const f = new SeriesFocus(scope);
    f.toggle('walls');
    f.toggle('walls');
    expect(f.key).toBeNull();
    expect(scope.classList.contains('anl-focus-on')).toBe(false);
    expect(a.classList.contains('anl-focused')).toBe(false);
  });

  it('⭐ a mark carrying SEVERAL keys lights for any of them (the graph case)', () => {
    // Picking a graph node must light the node, its incident edges AND its
    // neighbours — "what does this connect to", not "which dot is this".
    const edge = markSeries(document.createElement('span'), 'n:w1', 'n:r1', 'e:bounds');
    scope.appendChild(edge);
    const f = new SeriesFocus(scope);
    f.set('n:r1');
    expect(edge.classList.contains('anl-focused')).toBe(true);
    f.set('e:bounds');
    expect(edge.classList.contains('anl-focused')).toBe(true);
    f.set('n:elsewhere');
    expect(edge.classList.contains('anl-focused')).toBe(false);
  });
});

// ── Scope ────────────────────────────────────────────────────────────────────

interface FakeNode { id: string; kind: string; props?: Record<string, unknown> }
interface FakeEdge { from: string; to: string; type: string }

function installGraph(nodes: FakeNode[], edges: FakeEdge[]): void {
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'maintained',
    deltasApplied: 1,
    eventsObserved: 1,
    lastDelta: null,
  };
}

/** Levels for ids the census claims; `undefined` for ids it does not. */
function placement(map: Record<string, string | null>): GraphPlacement {
  return {
    levelOf: (id) => (id in map ? map[id] : undefined),
    levelNames: new Map([['L0', 'Ground floor'], ['L1', 'First floor']]),
  };
}

describe('§ANALYSIS-GRAPH-LEVEL-FILTER — a filter is not a truncation', () => {
  afterEach(() => {
    setGraphLevelFilter(null);
    delete (window as unknown as Record<string, unknown>).__pryzmBuildingGraph;
    delete (window as unknown as Record<string, unknown>).__pryzmUbgLiveness;
  });

  it('with no filter the whole model is the universe, and it says so', () => {
    installGraph(
      [{ id: 'w1', kind: 'wall' }, { id: 'w2', kind: 'wall' }],
      [{ from: 'w1', to: 'w2', type: 'bounds' }],
    );
    const g = projectGraph(placement({ w1: 'L0', w2: 'L1' }), null);
    expect(g.scope.levelId).toBeNull();
    expect(g.totalNodes).toBe(2);
    expect(scopeSentence(g.scope)).toContain('EVERY STOREY');
  });

  it('⭐ a filtered graph is COMPLETE — its counts are exact for the storey named', () => {
    // The founder's rule, at the flag that drives the "≥" prefix. `L1` here is
    // legitimately excluded — the reader asked for it to be — so nothing about
    // the remaining figures is a lower bound and printing "≥" would put doubt
    // on a number that is not in doubt.
    installGraph(
      [{ id: 'w1', kind: 'wall' }, { id: 'w2', kind: 'wall' }, { id: 'w9', kind: 'wall' }],
      [{ from: 'w1', to: 'w2', type: 'bounds' }, { from: 'w2', to: 'w9', type: 'bounds' }],
    );
    const g = projectGraph(placement({ w1: 'L0', w2: 'L0', w9: 'L1' }), 'L0');
    expect(g.totalNodes).toBe(2);
    expect(g.totalEdges).toBe(1);
    expect(g.complete, 'a scope is not a lower bound').toBe(true);
    expect(g.incompleteReason).toEqual([]);
    expect(g.scope.excludedOtherLevel).toBe(1);
  });

  it('⛔ a SEVERED relation is reported — connectivity here is lower than the building\'s', () => {
    installGraph(
      [{ id: 'w1', kind: 'wall' }, { id: 'w2', kind: 'wall' }, { id: 'w9', kind: 'wall' }],
      [{ from: 'w1', to: 'w2', type: 'bounds' }, { from: 'w2', to: 'w9', type: 'connectsTo' }],
    );
    const g = projectGraph(placement({ w1: 'L0', w2: 'L0', w9: 'L1' }), 'L0');
    expect(g.scope.severedEdges).toBe(1);
    expect(scopeSentence(g.scope)).toContain('cross this storey');
  });

  it('⛔ an UNPLACEABLE node DOES make the filtered figures a floor', () => {
    // The one exclusion that is not a choice: the census does not claim this id
    // at all (a synthetic `rule` node, or a store outside the declared table),
    // so it MIGHT belong to the storey being shown. Distinct from "on L1".
    installGraph(
      [{ id: 'w1', kind: 'wall' }, { id: 'rule-x', kind: 'rule' }],
      [{ from: 'w1', to: 'rule-x', type: 'violates' }],
    );
    const g = projectGraph(placement({ w1: 'L0' }), 'L0');
    expect(g.scope.excludedUnplaceable).toBe(1);
    expect(g.scope.excludedOtherLevel).toBe(0);
    expect(g.complete).toBe(false);
    expect(g.incompleteReason.join(' ')).toContain('no level the element census can resolve');
  });

  it('⛔ a claimed-but-levelless node is a THIRD answer, and not a floor', () => {
    installGraph(
      [{ id: 'w1', kind: 'wall' }, { id: 'w0', kind: 'wall' }],
      [],
    );
    const g = projectGraph(placement({ w1: 'L0', w0: null }), 'L0');
    expect(g.scope.excludedNoLevel).toBe(1);
    expect(g.scope.excludedUnplaceable).toBe(0);
    expect(g.complete, 'the census KNOWS this element has no storey — that is a fact, not a gap').toBe(true);
    expect(scopeSentence(g.scope)).toContain('carry no storey at all');
  });

  it('⭐ the scope sentence and the truncation reason are DIFFERENT statements', () => {
    // The rule, at the strings. One says what universe you asked for; the other
    // says the tool could not deliver it. They may never read the same.
    const many: FakeNode[] = [];
    const edges: FakeEdge[] = [];
    for (let i = 0; i < GRAPH_NODE_CAP + 5; i++) many.push({ id: `w${i}`, kind: 'wall' });
    for (let i = 1; i < many.length; i++) edges.push({ from: 'w0', to: `w${i}`, type: 'bounds' });
    installGraph(many, edges);
    const map: Record<string, string> = {};
    for (const n of many) map[n.id] = 'L0';

    const g = projectGraph(placement(map), 'L0');
    expect(g.truncated).toBe(true);
    const reason = g.incompleteReason.join(' ');
    expect(reason).toContain('node cap');
    expect(reason).not.toContain('Scope:');
    expect(scopeSentence(g.scope)).toContain('not a truncation of the model');
    expect(scopeSentence(g.scope)).not.toContain('node cap');
  });

  it('the module-level scope is shared, so all three relationship widgets agree', () => {
    expect(graphLevelFilter()).toBeNull();
    setGraphLevelFilter('L1');
    expect(graphLevelFilter()).toBe('L1');
    setGraphLevelFilter(null);
  });

  it('an unreachable graph still reports a NAMED scope, not a blank one', () => {
    delete (window as unknown as Record<string, unknown>).__pryzmBuildingGraph;
    const g = projectGraph(placement({}), 'L1');
    expect(g.scope.levelId).toBe('L1');
    expect(g.scope.levelName).toBe('First floor');
    expect(g.unreachable).toContain('window.__pryzmBuildingGraph');
  });
});
