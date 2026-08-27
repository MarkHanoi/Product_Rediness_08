/**
 * §GRAPH154 (L-12560..) — SELECTED vs CONNECTED vs UNRELATED on the
 * relationship graph card, and proof it is the SAME ramp §HILITE140 shipped
 * for the main 3-D scene.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE ESTABLISHES
 * ═════════════════════════════════════════════════════════════════════════════
 *   1. `hopEmphasis.ts`'s four mirrored constants (`RELATED_RING_COLOUR`,
 *      `RELATED_HOP_TINT_STEP`, `RELATED_HOP_ALPHA_DECAY`,
 *      `RELATED_RING_BASE_ALPHA`) stay numerically equal to
 *      `DiagnosticMaterialManager.ts`'s `ANALYSIS_SELECTED_COLOR` /
 *      `RELATED_HOP_TINT_STEP` / `RELATED_HOP_ALPHA_DECAY` /
 *      `ANALYSIS_SELECTED_OPACITY` — read from that file's OWN SOURCE TEXT via
 *      `fs.readFileSync`, never imported (that file is a THREE consumer; this
 *      L7 UI surface must stay THREE-free, `widgetRenderers.ts`'s own header).
 *      This is the guard a copy-paste comment cannot give: if a future lane
 *      retunes the 3-D scene's ramp and forgets this file, THIS test goes red.
 *   2. `hopEmphasisFor()`'s role ladder (inactive / selected / related /
 *      unrelated) and its ramp arithmetic.
 *   3. `nodeLinkSvg.renderNodeLink()` actually draws the ring — a real DOM
 *      assertion, not merely a call-through: the selected node's ring is
 *      cyan and strongest, a connected node's ring is the violet-toward-white
 *      ramp and WEAKER with more hops, an unrelated node draws NO ring and
 *      is dimmed on FILL-OPACITY only (never fill-HUE).
 *   4. `renderNodeLegend()`'s "colour = element category" line is IDENTICAL
 *      text whether or not a selection is active — the explicit resolution
 *      to the category-colour/selection-colour channel conflict.
 *
 * ⚠ NOT ESTABLISHED HERE: the 3-D-in-card viewport's own canvas-overlay ring
 * (`GraphViewport.paintOverlay`). happy-dom's `HTMLCanvasElement.getContext`
 * does not implement 2-D drawing operations, so `ctx` is unreachable the same
 * way `graphNodeClickSelectionPath.spec.ts`'s own header already documents for
 * WebGL — the DOM-level exercise there is the 2-D SVG branch, for the same
 * reason. `GraphViewport.ts`'s call sites use the exact SAME `hopEmphasisFor()`
 * tested here, which is the type-level guarantee this suite leans on for that
 * path; a real-browser render is the only thing that could go further.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  hopEmphasisFor,
  relatedRingColour,
  relatedRingAlpha,
  relatedFillOpacity,
  lerpTowardWhite,
  SELECTED_RING_COLOUR,
  RELATED_RING_COLOUR,
  RELATED_HOP_TINT_STEP,
  RELATED_HOP_ALPHA_DECAY,
  RELATED_RING_BASE_ALPHA,
  UNRELATED_FILL_OPACITY,
} from '../hopEmphasis';
import { renderNodeLink, renderNodeLegend, type NodeLinkNode, type NodeLinkEdge } from '../nodeLinkSvg';

const DIAGNOSTIC_MATERIAL_MANAGER = readFileSync(
  resolve(__dirname, '../../../engine/inspect/DiagnosticMaterialManager.ts'),
  'utf8',
);

/** Pull a `const NAME = <number-or-hex-literal>` out of raw source text. */
function constNumber(src: string, name: string): number {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*(0x[0-9a-fA-F]+|[0-9.]+)`).exec(src);
  expect(m, `"${name}" not found in DiagnosticMaterialManager.ts — did it move or get renamed?`).not.toBeNull();
  return Number(m![1]);
}

describe('§GRAPH154 — hopEmphasis.ts MIRRORS DiagnosticMaterialManager.ts, not a rival ramp', () => {
  it('the ring colour hex matches DiagnosticMaterialManager.ts:211 GHOST_EDGE_COLOR (cyan)', () => {
    const ghostEdge = constNumber(DIAGNOSTIC_MATERIAL_MANAGER, 'GHOST_EDGE_COLOR');
    expect(SELECTED_RING_COLOUR.toLowerCase()).toBe(`#${ghostEdge.toString(16).padStart(6, '0')}`);
  });

  it('the related-ring colour hex matches DiagnosticMaterialManager.ts:245 ANALYSIS_SELECTED_COLOR (PRYZM purple)', () => {
    const selectedColour = constNumber(DIAGNOSTIC_MATERIAL_MANAGER, 'ANALYSIS_SELECTED_COLOR');
    expect(RELATED_RING_COLOUR.toLowerCase()).toBe(`#${selectedColour.toString(16).padStart(6, '0')}`);
  });

  it('the per-hop tint step matches DiagnosticMaterialManager.ts:339 RELATED_HOP_TINT_STEP', () => {
    expect(RELATED_HOP_TINT_STEP).toBe(constNumber(DIAGNOSTIC_MATERIAL_MANAGER, 'RELATED_HOP_TINT_STEP'));
  });

  it('the per-hop alpha decay matches DiagnosticMaterialManager.ts:340 RELATED_HOP_ALPHA_DECAY', () => {
    expect(RELATED_HOP_ALPHA_DECAY).toBe(constNumber(DIAGNOSTIC_MATERIAL_MANAGER, 'RELATED_HOP_ALPHA_DECAY'));
  });

  it('the ramp base alpha matches DiagnosticMaterialManager.ts:302 ANALYSIS_SELECTED_OPACITY', () => {
    expect(RELATED_RING_BASE_ALPHA).toBe(constNumber(DIAGNOSTIC_MATERIAL_MANAGER, 'ANALYSIS_SELECTED_OPACITY'));
  });

  it('relatedRingColour/relatedRingAlpha reproduce the SAME arithmetic as relatedHopColor/relatedHopAlpha', () => {
    // t = 1 - (1 - TINT_STEP) ** hop; alpha = BASE * DECAY ** hop — read
    // straight off DiagnosticMaterialManager.ts:349/355, reproduced here in
    // plain arithmetic rather than trusted by name alone.
    for (const hop of [1, 2, 3, 4]) {
      const expectedAlpha = RELATED_RING_BASE_ALPHA * Math.pow(RELATED_HOP_ALPHA_DECAY, hop);
      expect(relatedRingAlpha(hop)).toBeCloseTo(expectedAlpha, 10);
      const t = 1 - Math.pow(1 - RELATED_HOP_TINT_STEP, hop);
      expect(relatedRingColour(hop)).toBe(lerpTowardWhite(RELATED_RING_COLOUR, t));
    }
  });

  it('the ramp is monotone: alpha decays and colour lightens as hop grows', () => {
    let prevAlpha = Infinity;
    for (const hop of [1, 2, 3, 4]) {
      const a = relatedRingAlpha(hop);
      expect(a).toBeLessThan(prevAlpha);
      prevAlpha = a;
    }
    // hop 4 should read visibly lighter (closer to white) than hop 1.
    const c1 = relatedRingColour(1);
    const c4 = relatedRingColour(4);
    expect(c4.toLowerCase()).not.toBe(c1.toLowerCase());
  });
});

describe('§GRAPH154 — hopEmphasisFor(): the role ladder', () => {
  it('no selection active ⇒ inactive, no ring, full strength — the pre-existing behaviour, unchanged', () => {
    const e = hopEmphasisFor(undefined, false);
    expect(e.role).toBe('inactive');
    expect(e.ringColour).toBeNull();
    expect(e.fillOpacity).toBe(1);
    expect(e.radiusScale).toBe(1);
  });

  it('hop 0 (the seed) ⇒ selected: cyan ring, full alpha, the LARGEST radius — "the selected stronger"', () => {
    const e = hopEmphasisFor(0, true);
    expect(e.role).toBe('selected');
    expect(e.ringColour).toBe(SELECTED_RING_COLOUR);
    expect(e.ringAlpha).toBe(1);
    expect(e.radiusScale).toBeGreaterThan(1);
    expect(e.fillOpacity).toBe(1); // fill never dims on the seed itself
  });

  it('hop >= 1 ⇒ related: the violet ramp, weaker than selected, radius UNCHANGED', () => {
    const selected = hopEmphasisFor(0, true);
    const hop1 = hopEmphasisFor(1, true);
    expect(hop1.role).toBe('related');
    expect(hop1.ringColour).not.toBeNull();
    expect(hop1.ringColour).not.toBe(SELECTED_RING_COLOUR);
    expect(hop1.ringAlpha).toBeLessThan(selected.ringAlpha);
    expect(hop1.radiusScale).toBe(1);
    // A more distant hop reads weaker again — the ramp, not a flat "related" state.
    const hop3 = hopEmphasisFor(3, true);
    expect(hop3.ringAlpha).toBeLessThan(hop1.ringAlpha);
    expect(hop3.fillOpacity).toBeLessThan(hop1.fillOpacity);
  });

  it('not reached at all, but a selection IS active ⇒ unrelated: no ring, dimmed fill, never invisible', () => {
    const e = hopEmphasisFor(undefined, true);
    expect(e.role).toBe('unrelated');
    expect(e.ringColour).toBeNull();
    expect(e.fillOpacity).toBe(UNRELATED_FILL_OPACITY);
    expect(e.fillOpacity).toBeGreaterThan(0); // dormant, never gone
  });

  it('relatedFillOpacity never drops the fill below the unrelated floor, however far the hop', () => {
    for (const hop of [1, 2, 5, 20]) {
      expect(relatedFillOpacity(hop)).toBeGreaterThanOrEqual(UNRELATED_FILL_OPACITY);
    }
  });
});

describe('§GRAPH154 — renderNodeLink() actually draws the ring, not merely computes it', () => {
  const nodes: NodeLinkNode[] = [
    { id: 'seed', label: 'Seed wall', group: 'wall' },
    { id: 'near', label: 'Near door', group: 'door' },
    { id: 'far', label: 'Far room', group: 'room' },
    { id: 'stranger', label: 'Unrelated slab', group: 'slab' },
  ];
  const edges: NodeLinkEdge[] = [];
  const groupIndex = new Map([['wall', 0], ['door', 1], ['room', 2], ['slab', 3]]);
  const edgeTypeIndex = new Map<string, number>();

  function draw(hopOf: ReadonlyMap<string, number> | null): SVGSVGElement {
    const host = document.createElement('div');
    return renderNodeLink(host, nodes, edges, {
      width: 400, height: 300, edgeTypeIndex, groupIndex, hopOf,
    });
  }

  /** The node <g>'s ring <circle> (stroked, unfilled) if one was drawn. */
  function ringOf(svg: SVGSVGElement, id: string): SVGCircleElement | null {
    const title = [...svg.querySelectorAll('title')].find((t) => (t.textContent ?? '').includes(`— ${id}`));
    const g = title!.parentElement!;
    const circles = [...g.querySelectorAll('circle')];
    // The ring is appended BEFORE the fill circle and carries `fill="none"`.
    return circles.find((c) => c.getAttribute('fill') === 'none') ?? null;
  }

  function fillOf(svg: SVGSVGElement, id: string): SVGCircleElement {
    const title = [...svg.querySelectorAll('title')].find((t) => (t.textContent ?? '').includes(`— ${id}`));
    const g = title!.parentElement!;
    return [...g.querySelectorAll('circle')].find((c) => c.getAttribute('fill') !== 'none')!;
  }

  it('hopOf === null (no selection) draws NO rings and every fill stays at full opacity — unchanged from before this option existed', () => {
    const svg = draw(null);
    for (const n of nodes) {
      expect(ringOf(svg, n.id), `${n.id} should have no ring`).toBeNull();
      expect(fillOf(svg, n.id).getAttribute('fill-opacity')).toBe('1');
    }
  });

  it('the SEED draws the cyan ring; a CONNECTED node draws a violet ring, weaker; an UNRELATED node draws none', () => {
    const hopOf = new Map([['seed', 0], ['near', 1], ['far', 2]]); // 'stranger' absent
    const svg = draw(hopOf);

    const seedRing = ringOf(svg, 'seed');
    expect(seedRing, 'the seed has no ring').not.toBeNull();
    expect(seedRing!.getAttribute('stroke')).toBe(SELECTED_RING_COLOUR);
    expect(seedRing!.getAttribute('stroke-opacity')).toBe('1');

    const nearRing = ringOf(svg, 'near');
    expect(nearRing, 'the 1-hop node has no ring').not.toBeNull();
    expect(nearRing!.getAttribute('stroke')).not.toBe(SELECTED_RING_COLOUR);
    expect(Number(nearRing!.getAttribute('stroke-opacity'))).toBeLessThan(1);

    const farRing = ringOf(svg, 'far');
    expect(farRing, 'the 2-hop node has no ring').not.toBeNull();
    // Further away reads WEAKER, not just "also related".
    expect(Number(farRing!.getAttribute('stroke-opacity'))).toBeLessThan(Number(nearRing!.getAttribute('stroke-opacity')));

    expect(ringOf(svg, 'stranger'), 'the unreached node should draw no ring at all').toBeNull();
    expect(Number(fillOf(svg, 'stranger').getAttribute('fill-opacity'))).toBeLessThan(1);
    expect(Number(fillOf(svg, 'stranger').getAttribute('fill-opacity'))).toBeGreaterThan(0);
  });

  it('⛔ the FILL colour (category) never changes because a selection is active — only opacity and the ring do', () => {
    const withoutSelection = draw(null);
    const withSelection = draw(new Map([['seed', 0]]));
    for (const n of nodes) {
      expect(fillOf(withSelection, n.id).getAttribute('fill')).toBe(fillOf(withoutSelection, n.id).getAttribute('fill'));
    }
  });
});

describe('§GRAPH154 — renderNodeLegend(): the claim stays honest in BOTH states', () => {
  it('"colour = element category" is IDENTICAL text whether or not a selection is active', () => {
    const hostA = document.createElement('div');
    renderNodeLegend(hostA, new Map([['wall', 0]]), new Map([['wall', 3]]), undefined, false);
    const hostB = document.createElement('div');
    renderNodeLegend(hostB, new Map([['wall', 0]]), new Map([['wall', 3]]), undefined, true);

    const leadOf = (h: HTMLElement): string => h.querySelector('.anl-nodelink-legend-lead')!.textContent ?? '';
    expect(leadOf(hostA)).toBe('Node colour = element category');
    expect(leadOf(hostB)).toBe('Node colour = element category');
  });

  it('the ring note is ADDITIVE — present only while a selection is active, never replacing the category line', () => {
    const hostInactive = document.createElement('div');
    renderNodeLegend(hostInactive, new Map([['wall', 0]]), new Map([['wall', 1]]), undefined, false);
    expect(hostInactive.querySelector('.anl-nodelink-legend-ring-note')).toBeNull();

    const hostActive = document.createElement('div');
    renderNodeLegend(hostActive, new Map([['wall', 0]]), new Map([['wall', 1]]), undefined, true);
    const note = hostActive.querySelector('.anl-nodelink-legend-ring-note');
    expect(note).not.toBeNull();
    expect(note!.textContent ?? '').toMatch(/cyan/i);
    expect(note!.textContent ?? '').toMatch(/violet/i);
    // Both lines present, category line first.
    const leads = [...hostActive.querySelectorAll('.anl-nodelink-legend-lead')];
    expect(leads).toHaveLength(2);
    expect(leads[0]!.textContent).toBe('Node colour = element category');
  });
});
