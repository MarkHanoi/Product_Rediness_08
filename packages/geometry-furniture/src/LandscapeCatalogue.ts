/**
 * @file LandscapeCatalogue.ts — §LANDSCAPE-CATALOGUE (L-1380)
 *
 * The single source the **LANDSCAPE panel** renders from.
 *
 * ## The defect this closes
 *
 * The LANDSCAPE panel offered eight rows — `Plant 01` … `Plant 08` — under one
 * droplet icon, with no species, no size and no distinction of any kind. Those
 * eight are *indoor potted decor* (`FURNITURE_TYPE_TO_CATEGORY` maps every one
 * of them to `'decor'`, not `'outdoor'`).
 *
 * Meanwhile a **25-species parametric outdoor tree library** — real species
 * names, mature heights, crown radii, twelve mesh archetypes, architectural
 * plan symbols injected by `TreePlanSymbolBuilder`, and `'outdoor'` category
 * membership — has been fully built in this package since the Arbol T-01…T-25
 * work, and the LANDSCAPE panel offered **none of it**. It was reachable only
 * from the Interiors furniture *carousel*.
 *
 * That is §COMMITTED-IS-NOT-REACHABLE at family scale: the library exists, the
 * geometry exists, the plan symbols exist, and the surface a user would look on
 * does not offer them.
 *
 * ## What is AUTHORED and what is DERIVED
 *
 * ⭐ Per the standing rule (24 handrail types / 32 LOD-200 luminaires): **a row
 * authors only what cannot be computed; everything else derives, and a row
 * missing an authored field is a compile error.**
 *
 *   AUTHORED (cannot be computed)          DERIVED (never authored)
 *   ─────────────────────────────          ────────────────────────────────────
 *   species name        TreeTypes.ts       crown form      ARCHETYPE_FORM
 *   mature height       TreeTypes.ts       canopy Ø        2 × crownRadius
 *   crown radius        TreeTypes.ts       trunk clear     height × ratio
 *   archetype           TreeTypes.ts       material intent FURNITURE_TYPE_TO_…
 *   botanical class     TreeTypes.ts       category        FURNITURE_TYPE_TO_…
 *                                          plan symbol     isTreeSpeciesId()
 *
 * There is no hand-written 33-row table in this file. `LANDSCAPE_TREE_ENTRIES`
 * is `TREE_SPECIES_ORDER.map(...)`, so a species added to `TREE_SPECIES_TABLE`
 * appears in the panel with correct specifications and **cannot be forgotten**.
 *
 * ## Materials — ZERO minted, ZERO hex typed
 *
 * ⛔ This module declares no colour, no hex and no `materialId`. Tree foliage
 * and trunk colours are already owned by `TREE_SPECIES_TABLE` + the builders;
 * the semantic layer above them is the existing `FURNITURE_TYPE_TO_MATERIAL_
 * INTENT` map, which this catalogue **reads** (`materialIntent`) rather than
 * duplicating. A hand-typed hex here would resolve FIRST and silently no-op
 * every later material pick.
 *
 * ## Assets — ZERO GLBs
 *
 * Every entry in this catalogue is **parametric**: trees build through
 * `FurnitureFactory` → `TreeBuilder` → `ParametricTreeEngine`; potted plants
 * through `Plant0NBuilder`. None carries a `glbPath`, so none depends on the
 * object-storage catalogue (`/items/**` → R2, L-570). An entry here cannot
 * author-fine-and-render-nothing.
 *
 * ## Contracts
 *  - C97 §LANDSCAPE — planting + outdoor furniture families.
 *  - C84 EI-8 / EI-9 · C92 §SL-Voc-3 — `typeClass` (botanical) and `form`
 *    (visual) are ORTHOGONAL and must not share one word. See
 *    `PlantingTypeClass` for the two species where they genuinely disagree.
 *  - C16 CA-18 — a refusal names its reason and the live alternative.
 *  - Pure DTO module: no THREE, no store, no DOM, no I/O.
 */

import {
    TREE_SPECIES_TABLE,
    TREE_SPECIES_ORDER,
    ARCHETYPE_FORM,
    ARCHETYPE_TRUNK_CLEAR_RATIO,
    isTreeSpeciesId,
    type TreeSpeciesId,
    type PlantingTypeClass,
    type PlantingForm,
} from './TreeTypes';
import { FURNITURE_TYPE_TO_CATEGORY } from './FurnitureCategoryMap';
import { FURNITURE_TYPE_TO_MATERIAL_INTENT, type FurnitureMaterialIntent } from './FurnitureMaterialIntent';
import type { FurnitureType, FurnitureCategory } from './FurnitureTypes';

// ── Groups ───────────────────────────────────────────────────────────────

/**
 * The landscape panel's top-level groups.
 *
 * ⛔ `'tree'` and `'potted'` are deliberately SEPARATE groups rather than one
 * "Plants" list. A ground-planted 16 m Podocarpus and a 0.5 m glass table vase
 * are not the same family, do not go in the same place, and are not chosen by
 * the same question — collapsing them is the vocabulary defect this file exists
 * to undo.
 */
export type LandscapeGroup = 'tree' | 'potted';

// ── Entry ────────────────────────────────────────────────────────────────

/**
 * One offerable landscape element, fully specified.
 *
 * Every field is either read from `TREE_SPECIES_TABLE` / `POTTED_PLANT_SPECS`
 * or computed from one — nothing here is a guess.
 */
export interface LandscapeEntry {
    /** The `FurnitureType` the creation route is activated with. */
    readonly furnitureType: FurnitureType;
    /** Panel group. */
    readonly group: LandscapeGroup;
    /** Primary label — the real name, e.g. `A_PALMA DE CERA`. */
    readonly label: string;
    /** Catalogue reference, e.g. `Arbol T-18`. Empty for potted rows. */
    readonly reference: string;
    /** Botanical class — AUTHORED upstream. */
    readonly typeClass: PlantingTypeClass;
    /** Crown form — DERIVED from archetype. */
    readonly form: PlantingForm;
    /** Mature height, metres. */
    readonly matureHeight: number;
    /** Mature canopy / crown DIAMETER, metres (= 2 × crownRadius). */
    readonly canopyDiameter: number;
    /**
     * Clear height beneath the crown, metres — DERIVED from the built mesh
     * (`ARCHETYPE_TRUNK_CLEAR_RATIO`). `0` for potted rows, which have no
     * clear zone to pass beneath.
     */
    readonly trunkClearHeight: number;
    /** Plan / model footprint the creation route places, metres. */
    readonly footprint: { readonly width: number; readonly length: number; readonly height: number };
    /** Existing semantic material intent — READ, never authored here. */
    readonly materialIntent: FurnitureMaterialIntent;
    /** Existing category membership — READ, never authored here. */
    readonly category: FurnitureCategory;
    /**
     * True when a true architectural plan symbol is injected for this type
     * (`TreePlanSymbolBuilder` via `EdgeProjectorService`). ⚠ 2-D picking
     * hit-tests projected linework, so `false` here means the element is NOT
     * selectable in plan by its symbol.
     */
    readonly hasPlanSymbol: boolean;
}

// ── Potted rows — the ONLY hand-authored table in this file ───────────────

/**
 * The eight `plant_0N` builders differ, and the shipped catalogue hid it: every
 * one of the eight carried the identical descriptor `0.6 × 0.6 × 0.8`, which is
 * why the panel showed eight indistinguishable droplets.
 *
 * ⚠ The heights below are **read out of the builders**, not invented — each is
 * that builder's own default:
 *
 *   plant_01  Plant01Builder.ts:12   `data.height || 0.8`   pot + shrub
 *   plant_02  Plant02Builder.ts:11   `data.height || 1.8`   tall floor plant
 *   plant_03  Plant03Builder.ts:11   `data.height || 0.9`   dark pot + foliage
 *   plant_04  Plant04Builder.ts:14   `potHeight = 0.5`      wide white bowl
 *   plant_05  Plant05Builder.ts:11   `data.height || 1.2`   terracotta floor pot
 *   plant_06  Plant06Builder.ts:13   `vaseHeight = 0.5`     glass vase (tabletop)
 *   plant_07  Plant07Builder.ts:14   hanging pot            suspended
 *   plant_08  Plant08Builder.ts:11   `data.height || 1.0`   grey pot + grass
 *
 * A row here authors ONLY what no builder or map can answer: the human label
 * and the placement class. Everything else derives below.
 */
interface PottedPlantSpec {
    readonly furnitureType: FurnitureType;
    readonly label: string;
    /** Builder's own default height, metres — transcribed, see the table above. */
    readonly height: number;
    /** Spread across the foliage at its widest, metres. */
    readonly spread: number;
}

const POTTED_PLANT_SPECS: readonly PottedPlantSpec[] = Object.freeze([
    { furnitureType: 'plant_01', label: 'Shrub in round pot',     height: 0.80, spread: 0.60 },
    { furnitureType: 'plant_02', label: 'Tall floor plant',       height: 1.80, spread: 0.80 },
    { furnitureType: 'plant_03', label: 'Foliage in dark pot',    height: 0.90, spread: 0.65 },
    { furnitureType: 'plant_04', label: 'Wide white bowl',        height: 0.50, spread: 0.90 },
    { furnitureType: 'plant_05', label: 'Terracotta floor pot',   height: 1.20, spread: 0.70 },
    { furnitureType: 'plant_06', label: 'Glass vase (tabletop)',  height: 0.50, spread: 0.30 },
    { furnitureType: 'plant_07', label: 'Hanging pot',            height: 0.70, spread: 0.45 },
    { furnitureType: 'plant_08', label: 'Grass in grey pot',      height: 1.00, spread: 0.60 },
] as const);

// ── Derivation ───────────────────────────────────────────────────────────

function deriveTreeEntry(id: TreeSpeciesId): LandscapeEntry {
    const def = TREE_SPECIES_TABLE[id];
    const canopyDiameter = def.crownRadius * 2;
    return {
        furnitureType:    id,
        group:            'tree',
        label:            def.speciesName,
        reference:        def.label,
        typeClass:        def.typeClass,
        form:             ARCHETYPE_FORM[def.archetype],
        matureHeight:     def.height,
        canopyDiameter,
        trunkClearHeight: round2(def.height * ARCHETYPE_TRUNK_CLEAR_RATIO[def.archetype]),
        footprint:        { width: canopyDiameter, length: canopyDiameter, height: def.height },
        materialIntent:   FURNITURE_TYPE_TO_MATERIAL_INTENT[id],
        category:         FURNITURE_TYPE_TO_CATEGORY[id],
        // Every tree species routes through TreePlanSymbolBuilder, which keys
        // on isTreeSpeciesId — so this is READ from the same predicate the
        // renderer uses, not asserted.
        hasPlanSymbol:    isTreeSpeciesId(id),
    };
}

function derivePottedEntry(spec: PottedPlantSpec): LandscapeEntry {
    return {
        furnitureType:    spec.furnitureType,
        group:            'potted',
        label:            spec.label,
        reference:        '',
        typeClass:        'potted',
        form:             'rounded',
        matureHeight:     spec.height,
        canopyDiameter:   spec.spread,
        trunkClearHeight: 0,
        footprint:        { width: spec.spread, length: spec.spread, height: spec.height },
        materialIntent:   FURNITURE_TYPE_TO_MATERIAL_INTENT[spec.furnitureType],
        category:         FURNITURE_TYPE_TO_CATEGORY[spec.furnitureType],
        // ⚠ HONEST: potted plants get the GENERIC canopy glyph from
        // furniturePlanIcon's keyword test, not a species plan symbol. They are
        // drawn in plan and therefore selectable, but the symbol carries no
        // species information.
        hasPlanSymbol:    false,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ── The catalogue ────────────────────────────────────────────────────────

/** 25 ground-planted parametric tree species, derived from `TREE_SPECIES_ORDER`. */
export const LANDSCAPE_TREE_ENTRIES: readonly LandscapeEntry[] =
    Object.freeze(TREE_SPECIES_ORDER.map(deriveTreeEntry));

/** 8 container plantings, derived from `POTTED_PLANT_SPECS`. */
export const LANDSCAPE_POTTED_ENTRIES: readonly LandscapeEntry[] =
    Object.freeze(POTTED_PLANT_SPECS.map(derivePottedEntry));

/** Everything the LANDSCAPE panel offers, in panel order. */
export const LANDSCAPE_CATALOGUE: readonly LandscapeEntry[] =
    Object.freeze([...LANDSCAPE_TREE_ENTRIES, ...LANDSCAPE_POTTED_ENTRIES]);

/** Lookup by furniture type. `undefined` when the type is not a landscape element. */
export function getLandscapeEntry(t: string): LandscapeEntry | undefined {
    return LANDSCAPE_CATALOGUE.find(e => e.furnitureType === t);
}

// ── Presentation helpers (pure strings — no DOM) ──────────────────────────

const TYPE_CLASS_LABEL: Readonly<Record<PlantingTypeClass, string>> = {
    'deciduous':            'Deciduous',
    'evergreen-broadleaf':  'Evergreen broadleaf',
    'conifer':              'Conifer',
    'palm':                 'Palm',
    'ornamental-flowering': 'Ornamental flowering',
    'hedge-screen':         'Hedge / screen',
    'potted':               'Container planting',
};

const FORM_LABEL: Readonly<Record<PlantingForm, string>> = {
    'spreading':      'spreading',
    'rounded':        'rounded',
    'open-branched':  'open-branched',
    'formal-clipped': 'formal clipped',
    'columnar':       'columnar',
    'conical':        'conical',
    'weeping':        'weeping',
    'multi-stemmed':  'multi-stemmed',
    'fronded':        'fronded',
};

/**
 * The one-line specification a designer actually chooses on, e.g.
 *
 *   `Conifer · columnar · 16 m H × 2.8 m Ø · 1.6 m clear`
 *   `Container planting · rounded · 1.8 m H × 0.8 m Ø`
 *
 * ⛔ Deliberately carries NO hardiness / climate-zone / code claim. A lane
 * measured this week that **no layer in this repo evaluates a planting code
 * rule**; printing a suitability here would manufacture a compliance claim the
 * product cannot defend. See C97 §LANDSCAPE for the ADVISORY bound.
 */
export function formatLandscapeSpec(e: LandscapeEntry): string {
    const size = `${fmt(e.matureHeight)} m H × ${fmt(e.canopyDiameter)} m Ø`;
    const clear = e.trunkClearHeight > 0 ? ` · ${fmt(e.trunkClearHeight)} m clear` : '';
    return `${TYPE_CLASS_LABEL[e.typeClass]} · ${FORM_LABEL[e.form]} · ${size}${clear}`;
}

/** Panel row label, e.g. `A_PALMA DE CERA (Arbol T-18)`. */
export function formatLandscapeLabel(e: LandscapeEntry): string {
    return e.reference ? `${e.label} (${e.reference})` : e.label;
}

function fmt(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
