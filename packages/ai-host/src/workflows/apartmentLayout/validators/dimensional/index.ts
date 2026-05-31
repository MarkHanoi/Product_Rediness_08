// G-class dimensional validators — barrel.
//
// First slice (G-1 area-max + G-2 width-max) of the 10 G-classes described in
// `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table.

export { validateAreaMax } from './areaMax.js';
export type { AreaMaxRoom } from './areaMax.js';

export { validateWidthMax } from './widthMax.js';
export type { WidthMaxRoom } from './widthMax.js';

export { DIMENSIONAL_LIMITS, limitsFor } from './limits.js';
export type { DimensionalLimits } from './limits.js';

export type { DimensionalViolation } from './types.js';
