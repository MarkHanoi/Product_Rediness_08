// Barrel for the topology validators (A-1 / A-2 / A-3). Re-exports the
// public API so downstream callers `import { validateMandatoryAdjacency }
// from '.../validators/topology'` rather than reaching into individual
// files.

export type { AdjacencyEdge, TopologyViolation } from './types.js';
export { MANDATORY_ADJACENCIES, validateMandatoryAdjacency } from './mandatoryAdjacency.js';
export { PREFERRED_ADJACENCIES, validatePreferredAdjacency } from './preferredAdjacency.js';
export { FORBIDDEN_ADJACENCIES, validateForbiddenAdjacency } from './forbiddenAdjacency.js';
