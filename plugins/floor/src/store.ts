// FloorImmerStore — Immer-backed state slice for the floor finish element family (§P3.2-FL).
//
// `FloorsState` is the canonical Immer state type used by CreateFloorHandler
// and other typed bus handlers for the floor family.
//
// The LEGACY FloorStore (packages/core-app-model/src/stores/FloorStore.ts) is kept
// in service during Phase 3 so that FloorFragmentBuilder (which reads from it) continues
// to build meshes.  The initTools.ts §P3.2-FL bridge mirrors Immer mutations to the
// legacy store until FloorFragmentBuilder is migrated to read the Immer state directly.

import type { FloorData } from '@pryzm/core-app-model';

export type FloorId = string;
export type FloorsState = Record<FloorId, FloorData>;

export const INITIAL_FLOORS_STATE: FloorsState = {};
