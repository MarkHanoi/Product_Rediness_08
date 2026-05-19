// ViewDefinition Zod-schema tests (S17-T3).

import { describe, expect, it } from 'vitest';
import { ViewDefinitionSchema, type ViewDefinition, type ViewId } from '../src/ViewDefinition.js';

const VALID_PERSPECTIVE: ViewDefinition = {
  id: 'view-1' as ViewId,
  name: 'Default 3D',
  kind: '3d-perspective',
  camera: {
    position: { x: 12, y: 12, z: 12 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovDeg: 50,
  },
  renderMode: 'shaded-with-edges',
  levelFilter: null,
  elementKindFilter: null,
};

describe('ViewDefinitionSchema (S17-T3)', () => {
  it('accepts a valid 3d-perspective view (round-trip)', () => {
    const parsed = ViewDefinitionSchema.parse(VALID_PERSPECTIVE);
    expect(parsed.id).toBe('view-1');
    expect(parsed.kind).toBe('3d-perspective');
    expect(parsed.camera.fovDeg).toBe(50);
  });

  it('rejects out-of-range fovDeg (negative / 0 / > 120)', () => {
    const negative = { ...VALID_PERSPECTIVE, camera: { ...VALID_PERSPECTIVE.camera, fovDeg: -5 } };
    const tooBig = { ...VALID_PERSPECTIVE, camera: { ...VALID_PERSPECTIVE.camera, fovDeg: 200 } };
    expect(() => ViewDefinitionSchema.parse(negative)).toThrow();
    expect(() => ViewDefinitionSchema.parse(tooBig)).toThrow();
  });

  it('rejects 3d-orthographic when camera.orthoSize is missing', () => {
    const orthoBroken: ViewDefinition = {
      ...VALID_PERSPECTIVE,
      kind: '3d-orthographic',
      camera: {
        position: { x: 0, y: 50, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 0, z: -1 },
      },
    };
    const result = ViewDefinitionSchema.safeParse(orthoBroken);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('|');
      expect(msg).toMatch(/orthoSize/);
    }
  });
});
