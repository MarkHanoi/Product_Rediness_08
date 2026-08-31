// @pryzm/plugin-plumbing — public surface (S26 / ADR-0026).

export { PlumbingStore, type PlumbingData, type PlumbingId, type PlumbingsState } from './store.js';
// §BATH102 — the C109 compound's ONE store (C109 §2: the pod mints exactly one new
// family — itself; every member is a record in the family that already owns
// sanitaryware).
export {
  BathroomPodStore,
  type BathroomPodData,
  type BathroomPodsState,
} from './bathroomPodStore.js';
export {
  PlumbingSystemError,
  PlumbingNotFoundError,
  PlumbingSchemaError,
  isPlumbingSystemError,
  BathroomPodFitError,
  BathroomPodSchemaError,
  BathroomPodNotFoundError,
} from './errors.js';
export { isFiniteVec3 } from './intent.js';
export {
  PLUMBING_HANDLER_TYPES,
  buildPlumbingHandlerSet,
  registerPlumbingHandlers,
  type PlumbingHandlerType,
  CreatePlumbingHandler, type CreatePlumbingPayload,
  DeletePlumbingHandler, type DeletePlumbingPayload,
  MovePlumbingHandler, type MovePlumbingPayload,
  SetPlumbingSystemHandler, type SetPlumbingSystemPayload,
  // §BATH102 — the C109 compound's two verbs, and its OWN handler set (paired with
  // its own `PluginRegistry` descriptor, so the store it declares is contributed by
  // the descriptor that registers it).
  BATHROOM_POD_HANDLER_TYPES,
  buildBathroomPodHandlerSet,
  registerBathroomPodHandlers,
  type BathroomPodHandlerType,
  CreateBathroomPodHandler, type CreateBathroomPodPayload,
  DeleteBathroomPodHandler, type DeleteBathroomPodPayload,
} from './handlers/index.js';
export {
  PlumbingCommitter,
  buildPlumbingBufferGeometry,
  disposePlumbingGeometry,
  makePlumbingMaterialFactory,
  colorOfPlumbingMaterialKey,
  type PlumbingCommitterDeps,
  type PlumbingCommitterStats,
} from './committer/index.js';
