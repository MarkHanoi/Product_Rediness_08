// §ROOM-MODULE-RULE-ENGINE P1 — the rule-engine SCHEMA (ADR-0071 / SPEC-ROOM-MODULE-RULE-ENGINE).
//
// Pure types + data shapes for the constraint-satisfaction + scoring engine. NO geometry
// math, NO THREE/DOM, NO I/O (ADR-0061 purity) — this is the contract the ontology data,
// the HARD/SCORING rules, the solver, and the validators all read from, so there is one
// source of truth for module metadata + rule definitions across the engine, the property
// panel, and the cost/MEP estimators.
//
// This file is the FOUNDATION (P1 of §59): types + the scorecard shape. The kitchen module
// ontology DATA lives in `moduleOntology.ts`; the HARD/SCORING rule PREDICATES land in
// `kitchenRules.ts` (P2/P3) and consume these types. Not yet wired into placement.

/** Required building services a module draws (drives the MEP-cluster scoring + validity). */
export interface ModuleServices {
    readonly water?: boolean;
    readonly drain?: boolean;
    readonly power?: boolean;
    readonly duct?: boolean;   // extractor
    readonly gas?: boolean;    // gas hob
}

/** Clearances the module needs around it (mm). `openSwingMm` is the door/drawer swing depth
 *  the engine reserves in front of the module (door-/drawer-open collision simulation). */
export interface ModuleClearance {
    readonly frontMm?: number;
    readonly sideMm?: number;
    readonly topMm?: number;
    readonly openSwingMm?: number;
}

/** Zones a module must NOT occupy (HARD). Mirrors the founder's corner/window/door rules. */
export type ForbiddenZone = 'corner' | 'underWindow' | 'doorSwing' | 'roomEnd';

/** Per-axis scoring weights for a module (0..10), used to rank candidate placements. */
export interface ModuleWeights {
    readonly workflow: number;
    readonly ergonomic: number;
    readonly cost: number;
    readonly visual: number;
    /** Overall importance of placing this module well (the founder's `scoreWeight`). */
    readonly scoreWeight: number;
}

/** Level-2 — what is INSIDE a base/tall cabinet (cabinet taxonomy + internal allocation).
 *  Two geometrically-identical layouts can score differently purely on L2 (SPEC §1). */
export interface CabinetOption {
    readonly cabinetType: string;        // 'Door' | '2_Drawer' | '3_Drawer' | '4_Drawer' | 'InternalDrawer' | 'Glass' | 'Shelf' | 'Pullout' | 'Pantry' | 'CornerMagic' | …
    readonly storageVolumeL?: number;
    readonly ergonomicScore?: number;    // 0..100 (drawers > doors)
    readonly costFactor?: number;        // ×1.0 baseline
    /** Contents this option is the right home for (drives the storage-adjacency rules).
     *  `readonly` so an `as const` ontology literal (BASE_CABINET_OPTIONS) assigns cleanly —
     *  matches preferredAdjacent/forbiddenAdjacent above (was `string[]` → broke `tsc
     *  --skipLibCheck`, which the Fly build runs, so every build since regressed). */
    readonly hosts?: readonly string[];  // 'cutlery' | 'pans' | 'plates' | 'pantry' | 'cleaning' | 'glassware' | …
}

/** One placeable module's complete metadata (SPEC §2). Pure data. */
export interface ModuleMeta {
    readonly moduleType: string;
    readonly widthMm: number;
    readonly depthMm: number;
    readonly heightMm: number;
    readonly services: ModuleServices;
    readonly clearance: ModuleClearance;
    readonly preferredAdjacent: readonly string[];
    readonly forbiddenAdjacent: readonly string[];
    readonly forbiddenZones?: readonly ForbiddenZone[];
    readonly storageVolumeL?: number;
    readonly weights: ModuleWeights;
    readonly cabinetOptions?: readonly CabinetOption[];
}

/** A room's module ontology — the set of modules valid for that room type (SPEC §6). */
export interface RoomOntology {
    readonly roomType: string;           // 'kitchen' | 'bathroom' | 'bedroom' | …
    readonly modules: Readonly<Record<string, ModuleMeta>>;   // keyed by moduleType
}

// ── Rules ────────────────────────────────────────────────────────────────────
/** A HARD rule: a candidate that fails it is INVALID (never shippable). SCORING rules are
 *  graded 0..100 per axis. Both are PURE functions over a candidate + room context; their
 *  concrete implementations live in the per-room rule files (kitchenRules.ts, P2/P3). */
export type RuleKind = 'hard' | 'scoring';

/** The scorecard axes (SPEC §5) + their default weights (sum 100). The engine gates on the
 *  HARD rules, then ranks survivors by the weighted sum of these axes. */
export interface ScorecardWeights {
    readonly workflow: number;
    readonly circulation: number;
    readonly storage: number;
    readonly mep: number;
    readonly naturalLight: number;
    readonly buildability: number;
    readonly cost: number;
    readonly aesthetics: number;
}

/** SPEC §5 default kitchen scorecard weights (sum = 100). */
export const KITCHEN_SCORECARD_WEIGHTS: ScorecardWeights = {
    workflow: 25, circulation: 20, storage: 15, mep: 10,
    naturalLight: 10, buildability: 10, cost: 5, aesthetics: 5,
};

/** A scored candidate layout: HARD-valid + the per-axis sub-scores + the weighted total.
 *  The engine emits N of these and keeps the max `total`; the UI shows the sub-scores. */
export interface LayoutScore {
    readonly valid: boolean;                 // false ⇒ a HARD rule failed (excluded)
    readonly hardFailures: readonly string[];
    readonly axes: Readonly<Record<keyof ScorecardWeights, number>>;  // 0..100 each
    readonly total: number;                  // weighted 0..100
}

/** Weighted total from per-axis 0..100 scores + the scorecard weights. Pure. */
export function weightedTotal(
    axes: Readonly<Record<keyof ScorecardWeights, number>>,
    weights: ScorecardWeights = KITCHEN_SCORECARD_WEIGHTS,
): number {
    const sumW = weights.workflow + weights.circulation + weights.storage + weights.mep
        + weights.naturalLight + weights.buildability + weights.cost + weights.aesthetics;
    if (sumW <= 0) return 0;
    const num =
        axes.workflow * weights.workflow + axes.circulation * weights.circulation +
        axes.storage * weights.storage + axes.mep * weights.mep +
        axes.naturalLight * weights.naturalLight + axes.buildability * weights.buildability +
        axes.cost * weights.cost + axes.aesthetics * weights.aesthetics;
    return num / sumW;
}
