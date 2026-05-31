// G-class dimensional validators — barrel.
//
// Slices (G-1 area-max + G-2 width-max + G-3 aspect-ratio + G-5
// wall-usability + G-6 circulation-width + G-7 frontage + G-8 hierarchy +
// G-10 lighting) of the 10 G-classes described in
// `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table. G-4 (furniture-fit) and G-9 (kitchen-triangle) are
// deferred — both need furniture-footprint data.

export { validateAreaMax } from './areaMax.js';
export type { AreaMaxRoom } from './areaMax.js';

export { validateWidthMax } from './widthMax.js';
export type { WidthMaxRoom } from './widthMax.js';

export { validateAspect } from './aspect.js';
export type { AspectRoom } from './aspect.js';

export { validateWallUsability } from './wallUsability.js';
export type { WallUsabilityRoom } from './wallUsability.js';

export { validateCirculationWidth } from './circulationWidth.js';
export type { CirculationWidthRoom } from './circulationWidth.js';

export { validateFrontage } from './frontage.js';
export type { FrontageRoom } from './frontage.js';

export { validateHierarchy } from './hierarchy.js';
export type { HierarchyRoom } from './hierarchy.js';

export { validateLighting } from './lighting.js';
export type { LightingRoom } from './lighting.js';

export { DIMENSIONAL_LIMITS, limitsFor } from './limits.js';
export type { DimensionalLimits } from './limits.js';

export type { DimensionalViolation } from './types.js';
