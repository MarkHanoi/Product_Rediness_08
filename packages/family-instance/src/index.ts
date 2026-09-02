// @pryzm/family-instance — public surface (S56 D2/D3; Phase-4 lane 4D).

export {
  bakeFamilyInstance,
  FamilyBakeError,
  type FamilyInput,
  type BakeFamilyInstanceInput,
  type BakeFamilyInstanceResult,
  type BakedSolid,
  type UnsupportedSolid,
} from './bakeFamilyInstance.js';
export {
  profileToPolygon,
  segmentsForSweep,
  ProfileEvalError,
  type PolygonPoint,
} from './profileToPolygon.js';
// §4D-GEOMETRY-ADAPTER — the kernel boundary as a port (spec §17–20: *"the
// canonical model must NOT couple to one kernel … the kernel is an
// EVALUATOR"*).  Exported so a caller can inject a different evaluator, and so
// a test can prove the document→kernel TRANSLATION without running a producer.
export {
  adapterCapabilities,
  kernelGeometryAdapter,
  type GeometryAdapter,
} from './geometryAdapter.js';
// §4D-ONE-LENGTH-SEAM — the single conversion between the parameter runtime's
// canonical length unit and the document's metres.  Exported so the D3
// migration has ONE symbol to find, not two hand-written divides.
export { runtimeLengthToMetres, RUNTIME_LENGTH_UNITS_PER_METRE } from './units.js';
