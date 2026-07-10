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
// §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221) — 2D symbol builders + pure linework.
export {
    resolveFixtureFootprint,
    buildPlanLinework,
    buildElevationLinework,
} from './PlumbingSymbolGeometry';
export type { FixtureSymbolInput, FixtureFootprint } from './PlumbingSymbolGeometry';
export { PlumbingPlanSymbolBuilder, plumbingPlanSymbolBuilder } from './PlumbingPlanSymbolBuilder';
export { PlumbingElevationSymbolBuilder, plumbingElevationSymbolBuilder } from './PlumbingElevationSymbolBuilder';
