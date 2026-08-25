/**
 * @pryzm/geometry-furniture — public API barrel
 *
 * Sprint AF (2026-05-12): full extraction from src/engine/subsystems/furniture/
 * All 57 files — types, stores, builders, engines, tools, AI helpers.
 */

export * from './AIElementConfig';
export * from './AIElementValidator';
export * from './WardrobeCabinetTypes';
export * from './WardrobeTypes';
export * from './KitchenTypes';
export * from './FurnitureTypes';
// A.21.D15 (2026-06-06) — furniture/fixture vertical-placement datum helper.
export * from './furnitureElevation';
export { FurnitureStore } from './FurnitureStore';
export { MaterialService } from './MaterialService';
export { AIElementEngine } from './AIElementEngine';
export { FurnitureFragmentBuilder } from './FurnitureFragmentBuilder';
// ADR-0076 Axis 2 (§PERF-WEBGPU-FRAGMENT) — furniture decorative-shadow budget.
export * from './furnitureShadowBudget';
export { FurnitureTool } from './FurnitureTool';
export * from './FurnitureCategoryMap';
// F8.3 (2026-05-31) — material-intent labels (substrate for future
// material-intelligence layers in cognition L4 §3.A/D).
export * from './FurnitureMaterialIntent';
export * from './TreeTypes';
// §LANDSCAPE-CATALOGUE (L-1380) — the derived source the LANDSCAPE panel renders.
export * from './LandscapeCatalogue';

export * from './builders/BedBuilder';
export * from './builders/BedFactory';
export * from './builders/BedPlanSymbolBuilder';
export * from './builders/BedsideTableBuilder';
export * from './builders/ChairBuilder';
export * from './builders/ChairPlanSymbolBuilder';
export * from './builders/ChevronCarpetBuilder';
export * from './builders/ChimneyBuilder';
export * from './builders/CoffeeTableBuilder';
export * from './builders/CornerSofaBuilder';
export * from './builders/DiningTableBuilder';
export * from './builders/DiningTableMarbleBrassBuilder';
export * from './builders/EntranceTableBuilder';
export * from './builders/FurnitureFactory';
export * from './builders/IFurnitureBuilder';
export * from './builders/JapaneseBedBuilder';
export * from './builders/KitchenBuilder';
export * from './builders/KitchenPlanSymbolBuilder';
export * from './builders/LampBuilder';
// §CARPET97 (2026-08-25) — the ten new procedural carpets. `carpetPatterns` is
// the PURE pattern library (also consumed by the editor's carousel thumbnails so
// a card and the rug it places are drawn by the same code); `carpetTexture` is
// the THREE/DOM seam; the two builder files are the geometry.
export * from './builders/carpetPatterns';
export * from './builders/carpetTexture';
export * from './builders/ParametricCarpetBuilders';
export * from './builders/RoundBraidedCarpetBuilder';
export * from './builders/PatchworkCarpetBuilder';
export * from './builders/Plant01Builder';
export * from './builders/Plant02Builder';
export * from './builders/Plant03Builder';
export * from './builders/Plant04Builder';
export * from './builders/Plant05Builder';
export * from './builders/Plant06Builder';
export * from './builders/Plant07Builder';
export * from './builders/Plant08Builder';
export * from './builders/ShowerGlassPanelBuilder';
export * from './builders/SofaPlanSymbolBuilder';
export * from './builders/StripeCarpetBuilder';
export * from './builders/TableBuilder';
export * from './builders/ToiletRadiatorBuilder';
export * from './builders/TreeBuilder';
export * from './builders/TreePlanSymbolBuilder';
export * from './builders/WardrobeBuilder';
export * from './builders/WardrobeGlassBuilder';
export * from './builders/WardrobePlanSymbolBuilder';
export * from './builders/WhiteSofaBuilder';
export * from './builders/ApplianceBuilders';

export * from './engines/BedEngine';
export * from './engines/KitchenCabinetEngine';
export * from './engines/ParametricTreeEngine';
export * from './engines/WardrobeCabinetEngine';
export * from './engines/WardrobeEngine';
export * from './engines/WardrobeLayoutEngine';
