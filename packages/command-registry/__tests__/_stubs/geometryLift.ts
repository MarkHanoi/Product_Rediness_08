// THROWAWAY test stub for @pryzm/geometry-lift, used ONLY by the worktree vitest
// config (vitest.worktree.lift-cmd.mjs). The real barrel re-exports LiftMeshBuilder
// which imports THREE via @pryzm/renderer-three/three (P2). CreateVerticalCirculationCommand
// only needs the pure TYPES + DEFAULT_LIFT_PROPERTIES at module-load, none of which touch
// THREE — so we provide a minimal renderer-free surface here. On merge into the workspace
// this stub is deleted and the real package resolves via the installed symlink.

export interface Vec3 { x: number; y: number; z: number; }
export type LiftKind = 'passenger' | 'accessible' | 'goods';
export interface LiftProperties {
    mark?: string;
    material?: string;
    description?: string;
    tags?: string[];
}
export const DEFAULT_LIFT_PROPERTIES: LiftProperties = { material: 'steel', tags: [] };
export interface LiftData {
    id: string;
    type: 'verticalCirculation';
    levelId: string;
    baseLevelId: string;
    topLevelId: string;
    kind: LiftKind;
    origin: Vec3;
    rotation: number;
    shaftWidth: number;
    shaftDepth: number;
    carCapacityPersons: number;
    doorWidth: number;
    typeId?: string;
    properties: LiftProperties;
    ifcData?: { guid: string; ifcClass: 'IfcTransportElement' };
    metadata: { createdAt: string; modifiedAt: string; version: number; source: 'user' | 'import' | 'ai' };
}
