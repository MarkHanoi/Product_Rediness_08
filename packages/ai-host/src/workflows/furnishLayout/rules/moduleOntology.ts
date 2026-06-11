// §ROOM-MODULE-RULE-ENGINE P1 — the KITCHEN module ontology (the reference room).
//
// Pure DATA (ADR-0071 / SPEC-ROOM-MODULE-RULE-ENGINE §2). Thresholds transcribed from the
// founder's 2026-06-11 kitchen rule corpus. Distances in mm. This seeds L1 (the ontology);
// the HARD/SCORING predicates (kitchenRules.ts, P2/P3) read these values rather than hard-
// coding them, so the rule engine, validators, and cost/MEP estimators share one source.
//
// NOT yet wired into placement — P2 wires the HARD rules over the existing kitchenLayout.

import type { ModuleMeta, RoomOntology } from './ruleSchema.js';

/** Base cabinet cabinet-type options (Level-2) — drawers score above doors (founder DR/CD rules). */
const BASE_CABINET_OPTIONS = [
    { cabinetType: 'Door',        storageVolumeL: 200, ergonomicScore: 60, costFactor: 1.0, hosts: ['pots', 'infrequent'] },
    { cabinetType: '2_Drawer',    storageVolumeL: 220, ergonomicScore: 85, costFactor: 1.1, hosts: ['cutlery', 'pots'] },
    { cabinetType: '3_Drawer',    storageVolumeL: 260, ergonomicScore: 95, costFactor: 1.25, hosts: ['cutlery', 'utensils', 'pots'] },
    { cabinetType: '4_Drawer',    storageVolumeL: 280, ergonomicScore: 95, costFactor: 1.3, hosts: ['cutlery', 'tools', 'plates', 'pots'] },
    { cabinetType: 'InternalDrawer', storageVolumeL: 250, ergonomicScore: 90, costFactor: 1.4, hosts: ['cutlery', 'utensils'] },
] as const;

/** The kitchen module ontology. Keyed by `moduleType`. */
const KITCHEN_MODULES: Record<string, ModuleMeta> = {
    Dishwasher: {
        moduleType: 'Dishwasher', widthMm: 600, depthMm: 600, heightMm: 820,
        services: { water: true, drain: true, power: true },
        clearance: { frontMm: 900, openSwingMm: 600 },
        preferredAdjacent: ['SinkUnit'], forbiddenAdjacent: ['CornerUnit'],
        forbiddenZones: ['corner'], weights: { workflow: 8, ergonomic: 7, cost: 6, visual: 4, scoreWeight: 8 },
    },
    SinkUnit: {
        moduleType: 'SinkUnit', widthMm: 800, depthMm: 600, heightMm: 900,
        services: { water: true, drain: true },
        clearance: { sideMm: 300 },   // landing each side ≥300 / ideal 600
        preferredAdjacent: ['Dishwasher'], forbiddenAdjacent: ['HobUnit'],
        forbiddenZones: ['corner'], weights: { workflow: 10, ergonomic: 8, cost: 5, visual: 6, scoreWeight: 10 },
        cabinetOptions: BASE_CABINET_OPTIONS,
    },
    HobUnit: {
        moduleType: 'HobUnit', widthMm: 600, depthMm: 600, heightMm: 900,
        services: { power: true, gas: false },
        clearance: { sideMm: 300, topMm: 300 },   // landing each side ≥300; ≥300 to tall/wall
        preferredAdjacent: ['BaseCabinet'], forbiddenAdjacent: ['Fridge', 'SinkUnit'],
        forbiddenZones: ['corner', 'roomEnd', 'underWindow'],
        weights: { workflow: 10, ergonomic: 8, cost: 5, visual: 7, scoreWeight: 10 },
    },
    Fridge: {
        moduleType: 'Fridge', widthMm: 600, depthMm: 650, heightMm: 1900,
        services: { power: true },
        clearance: { frontMm: 1000, sideMm: 25, topMm: 50, openSwingMm: 1000 },  // vent side≥25/top≥50; door≥1000
        preferredAdjacent: ['Microwave', 'TallUnit'], forbiddenAdjacent: ['CornerUnit', 'HobUnit'],
        forbiddenZones: ['corner', 'underWindow'], weights: { workflow: 9, ergonomic: 7, cost: 6, visual: 6, scoreWeight: 9 },
    },
    OvenTower: {
        moduleType: 'OvenTower', widthMm: 600, depthMm: 600, heightMm: 2100,
        services: { power: true },
        clearance: { frontMm: 600, openSwingMm: 500 },   // centreline 900-1200; ≥600 circulation when open
        preferredAdjacent: ['TallUnit'], forbiddenAdjacent: ['Fridge'],
        forbiddenZones: ['corner', 'underWindow'], weights: { workflow: 7, ergonomic: 8, cost: 7, visual: 6, scoreWeight: 7 },
    },
    Microwave: {
        moduleType: 'Microwave', widthMm: 600, depthMm: 400, heightMm: 400,
        services: { power: true }, clearance: {},   // eye-level 1100-1400
        preferredAdjacent: ['Fridge'], forbiddenAdjacent: ['HobUnit'],
        weights: { workflow: 5, ergonomic: 7, cost: 4, visual: 3, scoreWeight: 5 },
    },
    Extractor: {
        moduleType: 'Extractor', widthMm: 600, depthMm: 500, heightMm: 400,
        services: { power: true, duct: true }, clearance: {},
        preferredAdjacent: ['HobUnit'], forbiddenAdjacent: [],
        weights: { workflow: 6, ergonomic: 5, cost: 6, visual: 5, scoreWeight: 6 },
    },
    BaseCabinet: {
        moduleType: 'BaseCabinet', widthMm: 600, depthMm: 600, heightMm: 900,
        services: {}, clearance: { openSwingMm: 500 },
        preferredAdjacent: [], forbiddenAdjacent: [],
        storageVolumeL: 260, weights: { workflow: 5, ergonomic: 7, cost: 3, visual: 5, scoreWeight: 5 },
        cabinetOptions: BASE_CABINET_OPTIONS,
    },
    TallUnit: {
        moduleType: 'TallUnit', widthMm: 600, depthMm: 600, heightMm: 2100,
        services: {}, clearance: {},
        preferredAdjacent: ['TallUnit'], forbiddenAdjacent: [],
        forbiddenZones: ['underWindow'],   // T04 tall never over window; T02 prefer extremity (scored, not hard)
        storageVolumeL: 600, weights: { workflow: 5, ergonomic: 6, cost: 7, visual: 7, scoreWeight: 6 },
    },
    CornerUnit: {
        moduleType: 'CornerUnit', widthMm: 900, depthMm: 900, heightMm: 900,
        services: {}, clearance: {},
        preferredAdjacent: [], forbiddenAdjacent: ['Dishwasher', 'Fridge', 'HobUnit', 'SinkUnit', 'OvenTower'],
        storageVolumeL: 300, weights: { workflow: 4, ergonomic: 5, cost: 8, visual: 4, scoreWeight: 5 },
        cabinetOptions: [
            { cabinetType: 'CornerMagic', storageVolumeL: 320, ergonomicScore: 80, costFactor: 1.5 },
            { cabinetType: 'Lemans',      storageVolumeL: 300, ergonomicScore: 78, costFactor: 1.5 },
            { cabinetType: 'BlindCorner', storageVolumeL: 260, ergonomicScore: 55, costFactor: 1.2 },
            { cabinetType: 'LazySusan',   storageVolumeL: 290, ergonomicScore: 75, costFactor: 1.4 },
        ],
    },
    Island: {
        moduleType: 'Island', widthMm: 1200, depthMm: 900, heightMm: 900,
        services: {}, clearance: { frontMm: 900 },   // aisle ≥900 / pref 1200 / lux 1400; needs room width ≥3600
        preferredAdjacent: ['Seating'], forbiddenAdjacent: [],
        storageVolumeL: 200, weights: { workflow: 7, ergonomic: 7, cost: 8, visual: 9, scoreWeight: 7 },
    },
    Seating: {
        moduleType: 'Seating', widthMm: 600, depthMm: 350, heightMm: 1050,   // 600/person, overhang ≥300
        services: {}, clearance: {}, preferredAdjacent: ['Island'], forbiddenAdjacent: [],
        weights: { workflow: 3, ergonomic: 6, cost: 3, visual: 7, scoreWeight: 4 },
    },
    Pantry: {
        moduleType: 'Pantry', widthMm: 600, depthMm: 600, heightMm: 2100,
        services: {}, clearance: {}, preferredAdjacent: ['Fridge'], forbiddenAdjacent: [],
        forbiddenZones: ['underWindow'],
        storageVolumeL: 700, weights: { workflow: 6, ergonomic: 7, cost: 6, visual: 6, scoreWeight: 6 },
    },
};

/** The kitchen room ontology (SPEC §2 seed). */
export const KITCHEN_ONTOLOGY: RoomOntology = { roomType: 'kitchen', modules: KITCHEN_MODULES };

/** Lookup a module's metadata by type (undefined if not in the ontology). Pure. */
export function kitchenModule(moduleType: string): ModuleMeta | undefined {
    return KITCHEN_MODULES[moduleType];
}

/** The appliance types the founder forbids in a corner (Rule C01). Derived from the ontology
 *  so it can never drift from the per-module `forbiddenZones`. */
export const CORNER_FORBIDDEN_APPLIANCES: readonly string[] =
    Object.values(KITCHEN_MODULES).filter(m => m.forbiddenZones?.includes('corner')).map(m => m.moduleType);
