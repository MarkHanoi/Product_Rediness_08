/**
 * PlumbingSystemTypeStore — Registry of plumbing fixture variants.
 *
 * Side-system store (mirrors DoorSystemTypeStore / WallSystemTypeStore):
 *   §01 CORE       — Commands read from this store; never write directly.
 *   §03 SEMANTIC   — The variant id is the persisted handle on the DTO; the
 *                    builder rebuilds geometry deterministically from it.
 *   §39 PLUMBING-FIXTURE-TYPE-PATTERN — see docs/00_Contracts.
 *
 * Today the store covers:
 *   • toilet — 4 LOD400 sub-families (mirrors the catalogue image).
 *   • bath   — 1 default entry (extension point for future variants).
 *   • sink   — 1 default entry (extension point for future variants).
 *
 * Singleton export: plumbingSystemTypeStore
 */

import {
    TOILET_VARIANTS,
    TOILET_VARIANT_LABELS,
    ToiletVariant,
} from './ToiletGeometry';
import {
    SHOWER_VARIANTS,
    SHOWER_VARIANT_LABELS,
    ShowerVariant,
} from './ShowerGeometry';
import {
    ACCESSORY_VARIANTS,
    ACCESSORY_VARIANT_LABELS,
    BathroomAccessoryVariant,
} from './BathroomAccessoryGeometry';
import { PlumbingFixtureType } from './PlumbingTypes';

export interface PlumbingSystemType {
    /** Stable id, e.g. "pf-toilet-wall_hung_square". */
    id: string;
    /** Family this variant belongs to. */
    family: PlumbingFixtureType;
    /** Variant slug stored on the DTO (toiletVariant when family === 'toilet'). */
    variant: string;
    name: string;
    description: string;
    /** Signature ceramic body colour (CSS string). */
    ceramicColor: string;
    /** Signature metal/chrome accent colour (CSS string). */
    metalColor: string;
    isBuiltIn: boolean;
}

const TOILET_DESCRIPTIONS: Record<ToiletVariant, string> = {
    wall_hung_square:     'Concealed cistern, square D-shape seat — modern.',
    wall_hung_round:      'Concealed cistern, full-round seat — minimal.',
    close_coupled_square: 'Visible square tank, dual flush buttons.',
    close_coupled_round:  'Visible rounded tank, single dome flush.',
};

const SHOWER_DESCRIPTIONS: Record<ShowerVariant, string> = {
    shower_system_shelf:    'Wall column, round rain-head, shelf and handheld.',
    shower_system_simple:   'Wall column, round rain-head, thermostat and handheld.',
    shower_cabinet_sliding: 'Glass enclosure with sliding front door and tray.',
    shower_cabinet_open:    'Open glass enclosure with low ceramic tray.',
};

const ACCESSORY_DESCRIPTIONS: Record<BathroomAccessoryVariant, string> = {
    washing_machine: 'Front-loading washing machine with porthole door.',
    toilet_brush:    'Toilet brush in cylindrical holder.',
    toilet_paper:    'Wall-mounted paper holder with roll.',
    laundry_bag:     'Cylindrical fabric hamper with rope handles.',
    iron:            'Steam iron resting on its base.',
    ironing_board:   'Folding ironing board on splayed legs.',
};

function freezeType(t: PlumbingSystemType): PlumbingSystemType {
    return Object.freeze({ ...t });
}

const BUILT_IN: PlumbingSystemType[] = [
    ...TOILET_VARIANTS.map<PlumbingSystemType>(v => freezeType({
        id:           `pf-toilet-${v}`,
        family:       'toilet',
        variant:      v,
        name:         TOILET_VARIANT_LABELS[v],
        description:  TOILET_DESCRIPTIONS[v],
        ceramicColor: '#ffffff',
        metalColor:   '#aaaaaa',
        isBuiltIn:    true,
    })),
    freezeType({
        id:           'pf-bath-default',
        family:       'bath',
        variant:      'default',
        name:         'Standard Tub',
        description:  'Rectangular extruded rim tub.',
        ceramicColor: '#ffffff',
        metalColor:   '#aaaaaa',
        isBuiltIn:    true,
    }),
    freezeType({
        id:           'pf-sink-default',
        family:       'sink',
        variant:      'default',
        name:         'Pedestal Basin',
        description:  'Pedestal-mounted ceramic basin with chrome spout.',
        ceramicColor: '#ffffff',
        metalColor:   '#aaaaaa',
        isBuiltIn:    true,
    }),
    ...SHOWER_VARIANTS.map<PlumbingSystemType>(v => freezeType({
        id:           `pf-shower-${v}`,
        family:       'shower',
        variant:      v,
        name:         SHOWER_VARIANT_LABELS[v],
        description:  SHOWER_DESCRIPTIONS[v],
        ceramicColor: '#ffffff',
        metalColor:   '#222222', // matt-black per catalogue references
        isBuiltIn:    true,
    })),
    ...ACCESSORY_VARIANTS.map<PlumbingSystemType>(v => freezeType({
        id:           `pf-accessory-${v}`,
        family:       'accessory',
        variant:      v,
        name:         ACCESSORY_VARIANT_LABELS[v],
        description:  ACCESSORY_DESCRIPTIONS[v],
        ceramicColor: '#f5f5f5',
        metalColor:   '#b8b8b8',
        isBuiltIn:    true,
    })),
];

export class PlumbingSystemTypeStore {
    private _types = new Map<string, PlumbingSystemType>();

    constructor() {
        for (const t of BUILT_IN) this._types.set(t.id, t);
    }

    getAll(): PlumbingSystemType[] {
        return Array.from(this._types.values());
    }

    getById(id: string): PlumbingSystemType | undefined {
        return this._types.get(id);
    }

    /** All variants for a fixture family (toilet / sink / bath / …). */
    getByFamily(family: PlumbingFixtureType | string): PlumbingSystemType[] {
        return this.getAll().filter(t => t.family === family);
    }

    /** Lookup by variant slug (e.g. 'wall_hung_square'). */
    getByVariant(variant: string): PlumbingSystemType | undefined {
        return this.getAll().find(t => t.variant === variant);
    }
}

export const plumbingSystemTypeStore = new PlumbingSystemTypeStore();

// Expose on window so widgets / debug consoles can introspect the catalogue
// without hard-importing the singleton (Contract 39 §4 — discovery channel).
if (typeof window !== 'undefined') {
    window.plumbingSystemTypeStore = plumbingSystemTypeStore; // TODO(TASK-08)
}
