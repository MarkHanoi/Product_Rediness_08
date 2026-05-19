// W-1C-8 — view-state 2A readiness contract test.
//
// 7 assertions that verify the `@pryzm/view-state` package surface is
// ready for the View-State-2A milestone:
//
//   1. ViewDefinitionSchema parses a valid 3d-perspective view.
//   2. ViewDefinitionSchema parses a valid 3d-orthographic view.
//   3. ViewDefinitionSchema rejects an unknown view kind.
//   4. ViewDefinitionSchema rejects a 3d-perspective view without fovDeg.
//   5. ViewRegistry can be constructed; defaults() returns ≥ 2 views.
//   6. Every default view parses cleanly through ViewDefinitionSchema.
//   7. ViewNotFoundError is an Error subclass with the expected name.
//
// This suite is PURE — it touches no THREE / FrameScheduler / store
// dependencies, only the exported TS contracts.

import { describe, expect, it } from 'vitest';
import {
  ViewDefinitionSchema,
  ViewRegistry,
  ViewController,
  ViewNotFoundError,
  type ViewId,
} from '@pryzm/view-state';

const PERSPECTIVE_VIEW = {
  id: 'view:01',
  name: '3D Perspective',
  kind: '3d-perspective',
  camera: {
    position: { x: 10, y: 8, z: 10 },
    target:   { x: 0,  y: 0, z: 0  },
    up:       { x: 0,  y: 1, z: 0  },
    fovDeg:   60,
  },
  renderMode: 'shaded',
  levelFilter: null,
  elementKindFilter: null,
};

const ORTHO_VIEW = {
  id: 'view:02',
  name: '3D Orthographic',
  kind: '3d-orthographic',
  camera: {
    position: { x: 0, y: 20, z: 0 },
    target:   { x: 0, y: 0,  z: 0 },
    up:       { x: 0, y: 0,  z: -1 },
    orthoSize: 12,
  },
  renderMode: 'wireframe',
  levelFilter: ['level:0'],
  elementKindFilter: null,
};

describe('W-1C-8 — view-state 2A readiness (7 contracts)', () => {
  it('(1) ViewDefinitionSchema accepts a valid 3d-perspective view', () => {
    const result = ViewDefinitionSchema.safeParse(PERSPECTIVE_VIEW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('3d-perspective');
      expect(result.data.camera.fovDeg).toBe(60);
    }
  });

  it('(2) ViewDefinitionSchema accepts a valid 3d-orthographic view', () => {
    const result = ViewDefinitionSchema.safeParse(ORTHO_VIEW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('3d-orthographic');
      expect(result.data.camera.orthoSize).toBe(12);
    }
  });

  it('(3) ViewDefinitionSchema rejects an unknown view kind', () => {
    const result = ViewDefinitionSchema.safeParse({ ...PERSPECTIVE_VIEW, kind: 'plan' });
    expect(result.success).toBe(false);
  });

  it('(4) ViewDefinitionSchema rejects a 3d-perspective view without fovDeg', () => {
    const nofov = { ...PERSPECTIVE_VIEW, camera: { ...PERSPECTIVE_VIEW.camera, fovDeg: undefined } };
    const result = ViewDefinitionSchema.safeParse(nofov);
    expect(result.success).toBe(false);
  });

  it('(5) ViewRegistry can be instantiated and defaults() returns ≥ 2 views', () => {
    const registry = new ViewRegistry();
    const defaults = registry.defaults();
    expect(Array.isArray(defaults)).toBe(true);
    expect(defaults.length).toBeGreaterThanOrEqual(2);
  });

  it('(6) every default view parses through ViewDefinitionSchema without errors', () => {
    const registry = new ViewRegistry();
    for (const view of registry.defaults()) {
      const result = ViewDefinitionSchema.safeParse(view);
      expect(result.success, `default view "${(view as { id: string }).id}" must parse`).toBe(true);
    }
  });

  it('(7) ViewNotFoundError is an Error subclass with name "ViewNotFoundError"', () => {
    const err = new ViewNotFoundError('view:missing' as ViewId);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ViewNotFoundError');
    expect(err.message).toContain('view:missing');
  });

  it('(bonus) ViewController is exported as a constructable class', () => {
    expect(typeof ViewController).toBe('function');
  });
});
