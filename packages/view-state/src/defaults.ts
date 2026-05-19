// Default view definitions seeded into a new project.
//
// Per ADR-0016 §"Decision" — `ViewRegistry.defaults()` returns this
// list; the bootstrap calls it on a fresh project so the user always
// has at least one view to switch to.
//
// `LevelOverview.levelFilter = null` ships in S17 — true level
// filtering depends on LevelStore (S18+).  Ledger note in
// PROCESS-TRACKER §"Carried into S18".

import type { ViewDefinition, ViewId } from './ViewDefinition.js';

export const Default3DView: ViewDefinition = {
  id: 'view-default-3d' as ViewId,
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

export const LevelOverview: ViewDefinition = {
  id: 'view-level-overview' as ViewId,
  name: 'Level Overview',
  kind: '3d-orthographic',
  camera: {
    position: { x: 0, y: 50, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    orthoSize: 30,
  },
  renderMode: 'shaded',
  levelFilter: null,
  elementKindFilter: null,
};

export function defaults(): readonly ViewDefinition[] {
  return [Default3DView, LevelOverview];
}
