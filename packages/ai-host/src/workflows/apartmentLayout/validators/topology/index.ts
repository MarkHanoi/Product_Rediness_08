// Barrel for the A-1 topology validator. Re-exports the public API so
// downstream callers `import { validateMandatoryAdjacency } from
// '.../validators/topology'` rather than reaching into individual files.

export type { AdjacencyEdge, TopologyViolation } from './types.js';
export { MANDATORY_ADJACENCIES, validateMandatoryAdjacency } from './mandatoryAdjacency.js';
