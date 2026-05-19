// 3 Contract-44 parity unit tests for the section-cut producer skeleton
// (post-2B closeout / ADR-0030).  Mirrors the plan-view edge-classifier
// shape so when the depth-pass arrives at S37, the test contracts above
// keep paying.

import { describe, expect, it } from 'vitest';
import {
  produceSectionCut,
  SectionViewCanvasHost,
  type AabbForSection,
  type SectionLine,
} from '../src/index.js';

const LINE: SectionLine = {
  a: { x: -10, y: 0 },
  b: { x: 10, y: 0 },
  lookDepth: 5,
};

const STRADDLING: AabbForSection = {
  id: 'wall-straddling',
  min: { x: -1, y: -1, z: 0 },
  max: { x: 1, y: 1, z: 3 },
};

const BEYOND: AabbForSection = {
  id: 'wall-beyond',
  min: { x: -1, y: 2, z: 0 },
  max: { x: 1, y: 4, z: 3 },
};

const TOO_FAR: AabbForSection = {
  id: 'wall-too-far',
  min: { x: -1, y: 10, z: 0 },
  max: { x: 1, y: 12, z: 3 },
};

const IN_FRONT: AabbForSection = {
  id: 'wall-in-front',
  min: { x: -1, y: -4, z: 0 },
  max: { x: 1, y: -2, z: 3 },
};

describe('produceSectionCut — Contract-44 parity (skeleton)', () => {
  it('emits a single cut edge for an AABB straddling the section plane', () => {
    const result = produceSectionCut(LINE, [STRADDLING]);
    expect(result.cutEdges).toHaveLength(1);
    expect(result.beyondEdges).toHaveLength(0);
    const e = result.cutEdges[0]!;
    expect(e.elementId).toBe('wall-straddling');
    expect(e.classification).toBe('cut');
    // Y axis is world-Z.
    expect(e.a.y).toBe(0);
    expect(e.b.y).toBe(3);
  });

  it('emits two beyond edges for an AABB behind the plane within look depth', () => {
    const result = produceSectionCut(LINE, [BEYOND]);
    expect(result.cutEdges).toHaveLength(0);
    expect(result.beyondEdges).toHaveLength(2);
    expect(result.beyondEdges.every((e) => e.classification === 'beyond')).toBe(true);
  });

  it('skips AABBs in front of the cut plane and AABBs beyond look depth', () => {
    const result = produceSectionCut(LINE, [IN_FRONT, TOO_FAR]);
    expect(result.cutEdges).toHaveLength(0);
    expect(result.beyondEdges).toHaveLength(0);
  });
});

describe('SectionViewCanvasHost shell', () => {
  it('runs the producer once per render() and reports the count', () => {
    const host = new SectionViewCanvasHost({
      line: LINE,
      aabbSource: { getState: () => [STRADDLING, BEYOND] },
    });
    expect(host.snapshot().renderCount).toBe(0);
    host.render();
    host.render();
    const snap = host.snapshot();
    expect(snap.renderCount).toBe(2);
    expect(snap.cutCount).toBe(1);
    expect(snap.beyondCount).toBe(2);
  });
});
