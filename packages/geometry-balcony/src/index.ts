// @pryzm/geometry-balcony — balcony COMPOUND geometry subsystem.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 · ADR-0333
//
// A BALCONY IS A COMPOUND, NOT A PRIMITIVE: one user gesture composes a cantilever
// SLAB, its FLOOR FINISH and the RAILING runs along its free perimeter — all three
// DERIVED from ONE polygon, so a profile edit moves them together by construction.
//
// ⭐ IT MINTS NO NEW MEMBER FAMILY. Unlike the pool (which had to mint `water`),
// every member here is an existing family: a plate is a `slab`, a finish is a
// `floor`, and a guard is a `handrail` (ADR-0332 — *"the handrail is a wall with a
// different infill"*). `balcony` is the only new kind and it is the COMPOUND.
//
// This package is PURE — no THREE, no DOM, no stores, no I/O, no id minting. It is
// arithmetic over the balcony RECORD. That is deliberate and it is guarded (the
// vitest environment is `node`, so a THREE import would red the suite): a package
// that cannot see a mesh cannot take a dimension from one.
//
// P2 note: like `geometry-pool` and unlike `geometry-slab` / `geometry-wall`, this
// package does NOT import THREE. A balcony's meshes are built by the EXISTING slab,
// floor and handrail builders — that is the point of the compound — so there is no
// new mesh to own here.
//
// P8: every exported function below carries an OpenTelemetry span.

export {
  BALCONY_DIMENSION_DEFAULTS,
  SLAB_TOP_AT_LEVEL_DATUM,
  resolveBalconyDimensions,
  type BalconySystemType,
  type ResolvedBalconyDimensions,
} from './BalconyDimensions.js';

export {
  HOST_EDGE_TOLERANCE_M,
  balconyEdges,
  balconyPlanArea,
  balconyRectangle,
  distanceToSegment,
  resolveFreeEdges,
  type BalconyEdge,
  type BalconyVertex,
  type HostWallSegment,
  type PlanPoint,
} from './BalconyGeometry.js';

export {
  buildBalconyAssembly,
  type BalconyAssembly,
  type BalconyAssemblyContext,
  type BalconyMemberIds,
} from './BalconyAssembly.js';
