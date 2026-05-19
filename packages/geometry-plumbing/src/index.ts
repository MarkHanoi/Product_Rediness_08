/**
 * @pryzm/geometry-plumbing — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/plumbing/
 * Sprint S  (2026-05-11): PlumbingFragmentBuilder + PlumbingSystemTypeStore added (Great Purge)
 */

export * from './BathroomAccessoryGeometry';
export * from './ShowerGeometry';
export * from './ToiletGeometry';
export * from './PlumbingTypes';
export { PlumbingStore } from './PlumbingStore';
export { PlumbingFragmentBuilder } from './PlumbingFragmentBuilder';
export { PlumbingSystemTypeStore, plumbingSystemTypeStore } from './PlumbingSystemTypeStore';
export type { PlumbingSystemType } from './PlumbingSystemTypeStore';
export { PlumbingTool } from './PlumbingTool';
