// @pryzm/geometry-pool — swimming-pool geometry subsystem.
//
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124
//
// A POOL IS AN ASSEMBLY, NOT A PRIMITIVE: one user gesture composes a HOLE in the
// host slab, N pool WALLS (real `Wall` records with a negative `baseOffset`), a pool
// FLOOR (a real `Slab`) and the WATER (the one genuinely new element family).
//
// This package is PURE — no THREE, no DOM, no stores, no I/O, no id minting. It is
// arithmetic over the pool RECORD. That is deliberate and it is guarded (the vitest
// environment is `node`, so a THREE import would red the suite): a package that
// cannot see a mesh cannot take a dimension from one.
//
// P2 note: unlike `geometry-slab` / `geometry-wall`, this package does NOT import
// THREE. The pool's meshes are built by the existing wall/slab builders (that is the
// point of the ticket — compose, do not invent); only the WATER needs a new mesh, and
// that belongs in the renderer, not here.
//
// P8: every exported function below carries an OpenTelemetry span.

export {
  POOL_DIMENSION_DEFAULTS,
  resolvePoolDimensions,
  type PoolSystemType,
  type ResolvedPoolDimensions,
} from './PoolDimensions.js';

export {
  buildPoolAssembly,
  planAreaOf,
  waterVolumeOf,
  type PoolAssembly,
  type PoolPartIds,
  type PoolVertex,
} from './PoolAssembly.js';
