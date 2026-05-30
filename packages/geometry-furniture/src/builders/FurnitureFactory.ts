/**
 * @file FurnitureFactory.ts
 *
 * CHANGE LOG — AI Element Generation Phase 0:
 *  - Added 'ai_element' case delegating to AIElementEngine.
 *
 * CONTRACT (04-BIM §3.8):
 *  - Factory returns IFurnitureBuilder — never executes mutations.
 *  - ai_element builder throws explicitly if aiElementConfig is absent.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureFragmentBuilder } from '../FurnitureFragmentBuilder';
import { DiningTableBuilder } from './DiningTableBuilder';
import { DiningTableMarbleBrassBuilder } from './DiningTableMarbleBrassBuilder';
import { BedBuilder } from './BedBuilder';
import { JapaneseBedBuilder } from './JapaneseBedBuilder';
import { BedsideTableBuilder } from './BedsideTableBuilder';
import { ChairBuilder } from './ChairBuilder';
import { WardrobeGlassBuilder } from './WardrobeGlassBuilder';
import { CornerSofaBuilder } from './CornerSofaBuilder';
import { WhiteSofaBuilder } from './WhiteSofaBuilder';
import { CoffeeTableBuilder } from './CoffeeTableBuilder';
import { TableBuilder } from './TableBuilder';
import { ShowerGlassPanelBuilder } from './ShowerGlassPanelBuilder';
import { LampBuilder } from './LampBuilder';
import { EntranceTableBuilder } from './EntranceTableBuilder';
import { ToiletRadiatorBuilder } from './ToiletRadiatorBuilder';
import { ChimneyBuilder } from './ChimneyBuilder';
import { Plant01Builder } from './Plant01Builder';
import { Plant02Builder } from './Plant02Builder';
import { Plant03Builder } from './Plant03Builder';
import { Plant04Builder } from './Plant04Builder';
import { Plant05Builder } from './Plant05Builder';
import { Plant06Builder } from './Plant06Builder';
import { Plant07Builder } from './Plant07Builder';
import { Plant08Builder } from './Plant08Builder';
import { ChevronCarpetBuilder } from './ChevronCarpetBuilder';
import { PatchworkCarpetBuilder } from './PatchworkCarpetBuilder';
import { StripeCarpetBuilder } from './StripeCarpetBuilder';
import { AIElementEngine } from '../AIElementEngine';
import { FurnitureData } from '../FurnitureTypes';
import { KitchenBuilder } from './KitchenBuilder';
import { WardrobeCabinetEngine } from '../engines/WardrobeCabinetEngine';
import { TreeBuilder } from './TreeBuilder';
import { DeskBuilder } from './DeskBuilder';
import { DeskChairBuilder } from './DeskChairBuilder';
import { BookshelfBuilder } from './BookshelfBuilder';
import { TvBuilder, TvUnitBuilder } from './MediaWallBuilder';
import {
    ShoeCabinetBuilder, CoatRackBuilder, ConsoleTableBuilder, EntryBenchBuilder,
} from './EntryStorageBuilder';
import {
    VanityUnitBuilder, BathroomMirrorBuilder, TowelRailBuilder,
} from './BathroomVanityBuilder';

export class FurnitureFactory {
    static getBuilder(
        type: string,
        fragmentBuilder: FurnitureFragmentBuilder
    ): IFurnitureBuilder {
        const materialService = fragmentBuilder.getMaterialService();
        // §01 §3.4 — DI flows through builder constructors. WardrobeEngine no
        // longer holds a static MaterialService (was unused dead state anyway).

        switch (type) {
            case 'plant_01': return new Plant01Builder(materialService);
            case 'plant_02': return new Plant02Builder(materialService);
            case 'plant_03': return new Plant03Builder(materialService);
            case 'plant_04': return new Plant04Builder(materialService);
            case 'plant_05': return new Plant05Builder(materialService);
            case 'plant_06': return new Plant06Builder(materialService);
            case 'plant_07': return new Plant07Builder(materialService);
            case 'plant_08': return new Plant08Builder(materialService);
            case 'bed':                return new BedBuilder(materialService);

            // ── Japanese Bed Collection (parametric — BedEngine via BedFactory) ─
            case 'japanese_platform_bed': return new JapaneseBedBuilder('platform', materialService);
            case 'japanese_float_bed':    return new JapaneseBedBuilder('float',    materialService);
            case 'japanese_walnut_bed':   return new JapaneseBedBuilder('walnut',   materialService);
            case 'nordic_bed':            return new JapaneseBedBuilder('nordic',   materialService);
            case 'solid_wood_bed':        return new JapaneseBedBuilder('solid_wood', materialService);

            case 'bedside_table':      return new BedsideTableBuilder(materialService);

            // F1.1 (2026-05-30) — Desk + desk chair (study workstation).
            case 'desk':               return new DeskBuilder(materialService);
            case 'desk_chair':         return new DeskChairBuilder(materialService);

            // F1.2 (2026-05-30) — Bookshelf (open + glass-front variants).
            case 'bookshelf':          return new BookshelfBuilder(materialService);
            case 'bookshelf_glass':    return new BookshelfBuilder(materialService);

            // F1.3 (2026-05-30) — Media wall (wall TV + low TV unit).
            case 'tv':                 return new TvBuilder(materialService);
            case 'tv_unit':            return new TvUnitBuilder(materialService);

            // F1.4 (2026-05-30) — Entry storage primitives (S2 activity system).
            case 'shoe_cabinet':       return new ShoeCabinetBuilder(materialService);
            case 'coat_rack':          return new CoatRackBuilder(materialService);
            case 'console_table':      return new ConsoleTableBuilder(materialService);
            case 'entry_bench':        return new EntryBenchBuilder(materialService);

            // F1.5 (2026-05-30) — Bathroom vanity primitives (S4 activity system).
            // mirror_light lives in geometry-lighting; not routed here.
            case 'vanity_unit':        return new VanityUnitBuilder(materialService);
            case 'bathroom_mirror':    return new BathroomMirrorBuilder(materialService);
            case 'towel_rail':         return new TowelRailBuilder(materialService);

            case 'table':              return new TableBuilder(materialService);
            case 'table_marble_cone':  return new TableBuilder(materialService);
            case 'table_glass_wood_cylinder': return new TableBuilder(materialService);
            case 'table_wood_double_conic': return new TableBuilder(materialService);
            case 'table_wood_4leg':    return new TableBuilder(materialService);
            case 'table_ceramic_curve': return new TableBuilder(materialService);
            case 'dining_table':       return new DiningTableBuilder(materialService);
            case 'dining_table_marble_brass':      return new DiningTableMarbleBrassBuilder();
            case 'dining_chair':       return new ChairBuilder(materialService);
            case 'chair':              return new ChairBuilder(materialService);
            case 'chair_oak_solid':    return new ChairBuilder(materialService);
            case 'chair_oak_slim':     return new ChairBuilder(materialService);
            case 'chair_oak_curved_uph': return new ChairBuilder(materialService);
            case 'chair_3leg_terracotta': return new ChairBuilder(materialService);
            case 'chair_3leg_obejita_black': return new ChairBuilder(materialService);
            case 'chair_4leg_obejita_wood': return new ChairBuilder(materialService);
            case 'chair_barcelona_black': return new ChairBuilder(materialService);
            case 'chair_barcelona_ottoman_black': return new ChairBuilder(materialService);
            case 'barcelona_sofa_1seat':  return new ChairBuilder(materialService);
            case 'barcelona_sofa_2seat':  return new ChairBuilder(materialService);
            case 'barcelona_sofa_3seat':  return new ChairBuilder(materialService);
            case 'barcelona_corner_sofa': return new ChairBuilder(materialService);
            case 'chair_cesca_tan':       return new ChairBuilder(materialService);
            case 'chair_textile_wood_arm': return new ChairBuilder(materialService);
            case 'corner_sofa':        return new CornerSofaBuilder(materialService);
            case 'white_corner_sofa':  return new CornerSofaBuilder(materialService);
            case 'white_sofa_1seat':   return new WhiteSofaBuilder(materialService);
            case 'white_sofa_2seat':   return new WhiteSofaBuilder(materialService);
            case 'white_sofa_3seat':   return new WhiteSofaBuilder(materialService);
            case 'sofa':               return new WhiteSofaBuilder(materialService);
            case 'sofa_1seat':         return new WhiteSofaBuilder(materialService);
            case 'sofa_2seat':         return new WhiteSofaBuilder(materialService);
            case 'sofa_3seat':         return new WhiteSofaBuilder(materialService);

            case 'coffee_table':       return new CoffeeTableBuilder(materialService);
            case 'shower_glass_panel': return new ShowerGlassPanelBuilder(materialService);
            case 'lamp':               return new LampBuilder(materialService);
            case 'entrance_table':     return new EntranceTableBuilder(materialService);
            case 'toilet_radiator':    return new ToiletRadiatorBuilder(materialService);
            case 'chimney':            return new ChimneyBuilder();

            // ── Soft Furnishings (parametric) ───────────────────────────────────
            case 'parametric_chevron_carpet':   return new ChevronCarpetBuilder(materialService);
            case 'parametric_patchwork_carpet': return new PatchworkCarpetBuilder(materialService);
            case 'parametric_stripe_carpet':    return new StripeCarpetBuilder(materialService);

            case 'wardrobe':           return { build: () => new THREE.Group() };
            case 'wardrobe_glass_door': return new WardrobeGlassBuilder(materialService);

            // ── Bathroom Collection — REMOVED (Services consolidation) ──────────
            // The 13 `bathroom_*` types were duplicates of the Plumbing system
            // fixtures and have been migrated. Drops are routed via the
            // `"plumbing:<family>:<variant>"` sentinel handled by
            // FurnitureDragDropHandler → CreatePlumbingFixtureCommand →
            // PlumbingFragmentBuilder. See
            // docs/01_ELEMENTS/11_Bathroom_Contract/BATHROOM-FILE-INVENTORY.md.

            // ── Parametric kitchen cabinet layouts ──────────────────────────────
            case 'kitchen_straight':
            case 'kitchen_l_shape':
            case 'kitchen_u_shape':
            case 'kitchen_island':
            case 'kitchen_straight_tall':
            case 'kitchen_l_shape_tall':
            case 'kitchen_u_shape_tall':
                return new KitchenBuilder(materialService);

            // ── Parametric wardrobe cabinet layouts ──────────────────────────────
            case 'wardrobe_straight':
            case 'wardrobe_l_shape':
            case 'wardrobe_u_shape':
            case 'wardrobe_straight_tall':
            case 'wardrobe_l_shape_tall':
            case 'wardrobe_u_shape_tall': {
                const wdEng = new WardrobeCabinetEngine();
                return {
                    build: (data: FurnitureData): THREE.Group => {
                        if (!data.wardrobeCabinetConfig) {
                            throw new Error(
                                `[FurnitureFactory] '${type}' requires wardrobeCabinetConfig (id=${data.id})`
                            );
                        }
                        return wdEng.create(data.wardrobeCabinetConfig);
                    }
                };
            }

            // ── Parametric outdoor tree library (25 species, Arbol T-01..T-25) ──
            case 'arbol_t_01': case 'arbol_t_02': case 'arbol_t_03':
            case 'arbol_t_04': case 'arbol_t_05': case 'arbol_t_06':
            case 'arbol_t_07': case 'arbol_t_08': case 'arbol_t_09':
            case 'arbol_t_10': case 'arbol_t_11': case 'arbol_t_12':
            case 'arbol_t_13': case 'arbol_t_14': case 'arbol_t_15':
            case 'arbol_t_16': case 'arbol_t_17': case 'arbol_t_18':
            case 'arbol_t_19': case 'arbol_t_20': case 'arbol_t_21':
            case 'arbol_t_22': case 'arbol_t_23': case 'arbol_t_24':
            case 'arbol_t_25':
                return new TreeBuilder(materialService);

            // ── AI-generated element ────────────────────────────────────────────
            case 'ai_element':
                return {
                    build: (data: FurnitureData): THREE.Group => {
                        // Contract §7.1: fail explicitly — no silent fallback
                        if (!data.aiElementConfig) {
                            throw new Error(
                                `[FurnitureFactory] 'ai_element' requires aiElementConfig on FurnitureData (id=${data.id})`
                            );
                        }
                        return AIElementEngine.create(data.aiElementConfig, data.color);
                    }
                };

            default:
                return { build: () => new THREE.Group() };
        }
    }
}