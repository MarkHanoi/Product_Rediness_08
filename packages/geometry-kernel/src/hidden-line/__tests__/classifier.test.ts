import { describe, expect, it } from 'vitest';
import { classifyHiddenLines } from '../classifier.js';

describe('classifyHiddenLines', () => {
  it('marks edges entirely behind the cut plane as hidden', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: 1.5,
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, worldZFront: 1.0, worldZBack: 1.2 },
      ],
      occluders: [],
    });
    expect(out[0]?.classification).toBe('hidden');
  });

  it('marks edges in front of the cut plane visible when no occluder covers them', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: 0,
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, worldZFront: 5, worldZBack: 5 },
      ],
      occluders: [],
    });
    expect(out[0]?.classification).toBe('visible');
  });

  it('marks edges occluded when their midpoint is inside an in-front occluder', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: 0,
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, worldZFront: 1, worldZBack: 1 },
      ],
      occluders: [{
        outer: [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: -5, y: 5 }],
        worldZ: 5,
      }],
    });
    expect(out[0]?.classification).toBe('occluded');
  });

  it('does not occlude when occluder is behind the edge', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: 0,
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, worldZFront: 5, worldZBack: 5 },
      ],
      occluders: [{
        outer: [{ x: -5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: -5, y: 5 }],
        worldZ: 1, // behind
      }],
    });
    expect(out[0]?.classification).toBe('visible');
  });

  it('does not occlude when midpoint is outside the polygon', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: 0,
      edges: [
        { a: { x: 100, y: 100 }, b: { x: 110, y: 100 }, worldZFront: 1, worldZBack: 1 },
      ],
      occluders: [{
        outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        worldZ: 5,
      }],
    });
    expect(out[0]?.classification).toBe('visible');
  });

  it('preserves input order and length', () => {
    const out = classifyHiddenLines({
      cutPlaneZ: -1,
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, worldZFront: 0, worldZBack: 0 },
        { a: { x: 2, y: 2 }, b: { x: 3, y: 3 }, worldZFront: 0, worldZBack: 0 },
        { a: { x: 4, y: 4 }, b: { x: 5, y: 5 }, worldZFront: 0, worldZBack: 0 },
      ],
      occluders: [],
    });
    expect(out).toHaveLength(3);
    expect(out[0]?.a).toEqual({ x: 0, y: 0 });
    expect(out[2]?.b).toEqual({ x: 5, y: 5 });
  });
});
