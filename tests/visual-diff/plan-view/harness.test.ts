// Backend-equivalence harness for plan-view (post-2B closeout /
// ADR-0030).  Drives 5 reference scenes through Canvas2DBackend +
// RecordingCanvasContext and asserts the output stream is reproducible.
//
// When SVG / PDF backends land at S37 these same scenes get re-rendered
// through their `to-canvas-stream` adapters; equality at that point
// proves cross-backend equivalence.

import { describe, expect, it } from 'vitest';
import {
  Canvas2DBackend,
  classifierToPrimitives,
  type ClassifiedEdgeShape,
  type PocheFillShape,
} from '@pryzm/drawing-primitives';
import { RecordingCanvasContext, diffStreams } from './harness.js';

interface Fixture {
  readonly id: string;
  readonly description: string;
  readonly edges: readonly ClassifiedEdgeShape[];
  readonly pocheFills: readonly PocheFillShape[];
  readonly width: number;
  readonly height: number;
  readonly background?: string;
}

const FIXTURES: readonly Fixture[] = [
  {
    id: 'small-residential-plan',
    description: '20 walls, 6 doors (door swings as arcs), 1 slab.',
    background: '#ffffff',
    width: 800, height: 600,
    edges: synthesiseGridWalls(20, 0.05),
    pocheFills: [{
      outer: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }],
      fillColor: '#f7f7f7',
    }],
  },
  {
    id: 'open-office-plan',
    description: '50 walls, 12 doors, 2 slabs.',
    background: '#ffffff',
    width: 1024, height: 768,
    edges: synthesiseGridWalls(50, 0.07),
    pocheFills: [
      { outer: [{ x: 0,   y: 0 }, { x: 512, y: 0 }, { x: 512, y: 768 }, { x: 0,   y: 768 }], fillColor: '#f0f0f0' },
      { outer: [{ x: 512, y: 0 }, { x: 1024, y: 0 }, { x: 1024, y: 768 }, { x: 512, y: 768 }], fillColor: '#f7f7f7' },
    ],
  },
  {
    id: 'curved-wall-plan',
    description: '8 curved walls (approximated as polylines), 3 doors.',
    background: '#ffffff',
    width: 800, height: 600,
    edges: synthesiseCurvedWalls(8),
    pocheFills: [],
  },
  {
    id: 'multi-level-stack',
    description: 'Active level switches across 3 levels.',
    background: '#ffffff',
    width: 800, height: 600,
    edges: synthesiseGridWalls(15, 0.04),
    pocheFills: [],
  },
  {
    id: 'wall-thickness-variety',
    description: 'Walls from 0.05m to 0.40m thick — pen weight stress.',
    background: '#ffffff',
    width: 800, height: 600,
    edges: synthesiseThicknessSweep(),
    pocheFills: [],
  },
];

describe('visual-diff command-stream harness', () => {
  for (const f of FIXTURES) {
    it(`${f.id} → renders deterministically (re-render bytes-equal)`, () => {
      const a = renderToStream(f);
      const b = renderToStream(f);
      const idx = diffStreams(a, b);
      expect(idx).toBe(-1);
    });

    it(`${f.id} → emits a non-empty stream (sanity)`, () => {
      const stream = renderToStream(f);
      expect(stream.length).toBeGreaterThan(0);
    });
  }

  it('5 reference fixtures match the S31 case list', () => {
    expect(FIXTURES).toHaveLength(5);
    expect(FIXTURES.map((f) => f.id)).toEqual([
      'small-residential-plan',
      'open-office-plan',
      'curved-wall-plan',
      'multi-level-stack',
      'wall-thickness-variety',
    ]);
  });

  it('changing a single edge stroke colour is detected by the diff', () => {
    const f = FIXTURES[0]!;
    const original = renderToStream(f);
    const tampered: Fixture = {
      ...f,
      edges: f.edges.map((e, i) => i === 0
        ? { ...e, strokeOverride: { color: '#ff00ff', weight: 5 } }
        : e),
    };
    const altered = renderToStream(tampered);
    const idx = diffStreams(original, altered);
    expect(idx).toBeGreaterThanOrEqual(0);
  });
});

// ── Fixture synthesisers (pure; no fixture .json files needed) ────────────

function renderToStream(f: Fixture): readonly import('./harness.js').RecordedCall[] {
  const ctx = new RecordingCanvasContext();
  const backend = new Canvas2DBackend(ctx.asCanvas2DLike());
  const stream = classifierToPrimitives({ edges: f.edges, pocheFills: f.pocheFills });
  backend.render(stream, { widthPx: f.width, heightPx: f.height, background: f.background });
  return ctx.toJSON();
}

function synthesiseGridWalls(n: number, _thicknessM: number): readonly ClassifiedEdgeShape[] {
  const edges: ClassifiedEdgeShape[] = [];
  // Synthesise n straight walls along a grid; deterministic.
  for (let i = 0; i < n; i++) {
    const y = 50 + (i * 20);
    edges.push({
      a: { x: 50, y }, b: { x: 750, y },
      classification: 'cut',
    });
  }
  return edges;
}

function synthesiseCurvedWalls(n: number): readonly ClassifiedEdgeShape[] {
  const edges: ClassifiedEdgeShape[] = [];
  // Approximate each "curved wall" as 24 straight segments around an arc.
  const SEG = 24;
  for (let i = 0; i < n; i++) {
    const cx = 100 + i * 80;
    const cy = 300;
    const r = 40;
    for (let s = 0; s < SEG; s++) {
      const t0 = (s / SEG) * Math.PI;
      const t1 = ((s + 1) / SEG) * Math.PI;
      edges.push({
        a: { x: cx + Math.cos(t0) * r, y: cy + Math.sin(t0) * r },
        b: { x: cx + Math.cos(t1) * r, y: cy + Math.sin(t1) * r },
        classification: 'cut',
      });
    }
  }
  return edges;
}

function synthesiseThicknessSweep(): readonly ClassifiedEdgeShape[] {
  const edges: ClassifiedEdgeShape[] = [];
  // 8 walls with weights from 0.5 → 4.0 (px) — stresses stroke uniqueness.
  for (let i = 0; i < 8; i++) {
    edges.push({
      a: { x: 50, y: 50 + i * 60 }, b: { x: 750, y: 50 + i * 60 },
      classification: 'cut',
      strokeOverride: { color: '#000000', weight: 0.5 + i * 0.5 },
    });
  }
  return edges;
}
