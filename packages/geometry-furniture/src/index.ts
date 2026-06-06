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
export { FurnitureTool } from './FurnitureTool';
export * from './FurnitureCategoryMap';
// F8.3 (2026-05-31) — material-intent labels (substrate for future
// material-intelligence layers in cognition L4 §3.A/D).
export * from './FurnitureMaterialIntent';
export * from './TreeTypes';

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
