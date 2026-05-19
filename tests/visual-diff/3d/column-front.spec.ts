// Visual-diff 3D spec — column family, front camera (W-10).
//
// One of 24 spec files (12 element families × 2 viewing angles)
// satisfying the W-10 acceptance in
// PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md.  See
// ./harness.ts for the recording protocol.

import { describe, expect, it } from 'vitest';
import {
  FRONT_CAMERA,
  fixturePrimitive,
  record,
  serialise,
  diffScenes,
  type RecordedPrimitive,
} from './harness.js';

const FAMILY = 'column' as const;
const N = 6;

function buildFixture(): readonly RecordedPrimitive[] {
  return Array.from({ length: N }, (_, i) => fixturePrimitive(FAMILY, i));
}

describe(`visual-diff/3d — ${FAMILY} (front)`, () => {
  it('records a deterministic scene stream', () => {
    const scene = record(buildFixture(), FRONT_CAMERA);
    expect(scene.camera).toBe('front');
    expect(scene.primitives).toHaveLength(N);
    // Every primitive carries the family + a stable id derived from
    // its index — this is what proves the recorder is capturing the
    // right element family at the right slot.
    scene.primitives.forEach((p, i) => {
      expect(p.family).toBe(FAMILY);
      expect(p.elementId.startsWith(`${FAMILY}-`)).toBe(true);
      expect(p.elementId.endsWith(i.toString(16).padStart(4, '0'))).toBe(true);
    });
  });

  it('is reproducible across two recordings', () => {
    const a = record(buildFixture(), FRONT_CAMERA);
    const b = record(buildFixture(), FRONT_CAMERA);
    expect(diffScenes(a, b)).toBe(-1);
    expect(serialise(a)).toBe(serialise(b));
  });

  it('emits a non-empty serialised payload', () => {
    const s = serialise(record(buildFixture(), FRONT_CAMERA));
    expect(s.length).toBeGreaterThan(64);
    // Snapshot the deterministic JSON so a regression in the recorded
    // shape (transform, dimensions, material id, render order) trips
    // a single, reviewable change in the snapshot file.
    expect(s).toMatchSnapshot();
  });
});
