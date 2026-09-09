/**
 * §ONE-ANSWER-TO-WHICH-BUILDING — the SINGLE resolver for spatial containment at
 * the `IfcBuilding` rung.
 *
 * ADR-0385 (founder ask, 2026-09-09) · applies ADR-0328 · amends ADR-0383 ·
 * amends C25 §1.3 · C84 EI-9 · §CONTEXT-DATA-HONESTY (L-581 / L-616) · L-8501.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * The founder asked for *"each building … a different building entity for the IFC
 * schema and the inspect tree"*. The audit that preceded ADR-0385 found FOUR
 * records that could answer *"which building is this element in"*:
 *
 *   1. `IntermediateModel.building` — a SINGULAR field hard-coded to
 *      `{id:'building-1', name:'Default Building'}`, and the only one users reach.
 *   2. `hierarchyStore.BuildingData` — live, persisted, 143 non-test reference
 *      sites across 30 files.
 *   3. `plugins/ifc-export/src/hierarchy.ts` — richer, 263 green tests, ZERO
 *      production callers (L-8333).
 *   4. `SpaceEnvelope.group` — ADR-0383 D1, minted the same morning.
 *
 * ADR-0328 had already ruled: *"hierarchyStore + parentId remains the SOLE
 * hierarchy source of truth … Do not create a second independent hierarchy source
 * of truth."* ADR-0385 §2 applies that ruling here:
 *
 *   ⭐ `hierarchyStore` is the AUTHORITY for containment. `SpaceEnvelope.group` is
 *      the massing-stage AUTHORING axis and PROJECTS into it. Nothing downstream
 *      reads `group` for containment — the IFC exporter, the PRYZM tree and the
 *      IFC tree all ask THIS function.
 *
 * That is the C84 EI-9 half of the ask: the IFC file and the inspect tree agree
 * because they call the same function, not because two implementations were
 * written carefully. [[same-rule-two-implementations]] is this repo's dominant
 * defect; a second copy of this rule is the way this lane would fail.
 *
 * ── ⛔ THREE-VALUED, AND THE THIRD VALUE IS NOT DECORATION ────────────────────
 *
 * §CONTEXT-DATA-HONESTY: a FAILURE and an EMPTINESS must never share a value.
 *
 *   `carried`  the substrate RECORDS the containment: exactly one `LevelData`
 *              carries this `bimLevelId`, and the `BuildingData` it names exists.
 *   `derived`  the substrate records NOTHING about this level. That is an
 *              emptiness, not a failure — containment falls to the single default
 *              building. ⭐ EVERY EXISTING PROJECT TAKES THIS PATH, and it is what
 *              makes ADR-0383 D3's back-compatibility guarantee hold.
 *   `unknown`  the question CANNOT be answered. Three distinct causes, each named
 *              in `why`: the substrate could not be read at all; the `LevelData`
 *              names a building that does not exist (a DANGLING reference); or two
 *              buildings both claim this `bimLevelId` (Block A "Level 1" and
 *              Block B "Level 1" — ADR-0385 §3's own example), so the level
 *              resolves but the ELEMENT does not.
 *
 * `buildingId` is `null` **only** when `kind === 'unknown'`. A caller that needs a
 * value anyway (the exporter must still write a file) uses {@link DEFAULT_BUILDING_ID}
 * and REPORTS — it never silently launders `unknown` into `derived`.
 *
 * ── ⛔ WHAT THIS FILE DELIBERATELY DOES NOT DO ────────────────────────────────
 *
 *   • It does not read `SpaceEnvelope.group`. ADR-0385 §2 point 3. It also could
 *     not: `group` lives on an L0 schema read by L7 UI, and this is L2 — but the
 *     reason is the ruling, not the layer.
 *   • It does not WRITE. The projection `massing group → BuildingData` is the
 *     authoring half (ADR-0385 §2 point 1) and belongs with the commands, behind
 *     the bus (P6). This module is pure over its snapshot and never throws.
 *   • It does not invent a building for a level the substrate has never heard of
 *     beyond the single default. N buildings come from N `BuildingData` rows.
 */

import { hierarchyStore, type HierarchyStore } from './HierarchyStore.js';
import type { BuildingData, LevelData } from './HierarchyTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// The default building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THIS STRING IS A PERSISTENCE FORMAT. DO NOT CHANGE IT.
 *
 * `createDefaultIntermediateModel()` has emitted `building-1` since the first
 * commit, and `IfcSpatialStructure` seeds the `IfcBuilding` GlobalId from
 * `building:${id}`. More importantly it is the SENTINEL that makes the ungrouped
 * storey key byte-identical to the pre-ADR-0385 key (see
 * `ifcIdentity.storeySlot`), which is the whole of the L-8501 back-compat pin:
 * change it and every storey GlobalId in every existing project re-churns.
 *
 * It lives HERE, next to the resolver, so the exporter and the trees cannot each
 * keep their own copy — two copies of a sentinel is the same defect as two copies
 * of a rule.
 */
export const DEFAULT_BUILDING_ID = 'building-1';
export const DEFAULT_BUILDING_NAME = 'Default Building';

// ─────────────────────────────────────────────────────────────────────────────
// The substrate, as this resolver needs to see it
// ─────────────────────────────────────────────────────────────────────────────

/** A `BuildingData` row, narrowed to what containment needs. */
export interface BuildingSubstrateBuilding {
    readonly id: string;
    readonly name: string;
    /** Persisted IFC identity, when the building came from an imported file. */
    readonly ifcGuid?: string;
}

/** A `LevelData` row, narrowed to the `bimLevelId → buildingId` edge. */
export interface BuildingSubstrateLevel {
    readonly id: string;
    readonly buildingId: string;
    readonly bimLevelId: string;
    readonly name: string;
}

/**
 * One read of `hierarchyStore`, taken ONCE and handed to every resolution in a
 * pass — so two elements in the same export can never see different vintages of
 * the store.
 *
 * ⛔ `null` is NOT `[]`. `buildings: null` means *the store could not be read*;
 * `buildings: []` means *it was read and holds none*. Collapsing those is exactly
 * the L-581/L-616 defect, and here it would be load-bearing: an unreadable store
 * reported as empty would make every element resolve `derived` into the default
 * building and look perfectly fine.
 */
export interface BuildingSubstrate {
    readonly buildings: readonly BuildingSubstrateBuilding[] | null;
    readonly levels: readonly BuildingSubstrateLevel[] | null;
    /** Why the substrate is shaped as it is — carried into every `why` string. */
    readonly note: string;
}

/** The substrate as it reads when `hierarchyStore` cannot be reached at all. */
export const UNREADABLE_SUBSTRATE: BuildingSubstrate = {
    buildings: null,
    levels: null,
    note: 'hierarchyStore could not be read',
};

/**
 * Snapshot `hierarchyStore`.
 *
 * @param store injectable for tests; defaults to the module singleton, which is
 *              the same instance `PartOfProjection` reads (ADR-0328).
 */
export function readBuildingSubstrate(store: HierarchyStore = hierarchyStore): BuildingSubstrate {
    let buildings: BuildingData[];
    let levels: LevelData[];
    try {
        buildings = store.getBuildings();
        levels = store.getLevels();
    } catch (err) {
        // A throw is a FAILURE, and a failure is not an emptiness.
        return {
            ...UNREADABLE_SUBSTRATE,
            note: `hierarchyStore threw while being read: ${String(err)}`,
        };
    }
    if (!Array.isArray(buildings) || !Array.isArray(levels)) {
        return {
            ...UNREADABLE_SUBSTRATE,
            note: 'hierarchyStore returned a non-array for buildings or levels',
        };
    }
    return {
        buildings: buildings.map((b) => ({ id: b.id, name: b.name, ifcGuid: b.ifcGuid })),
        levels: levels.map((l) => ({
            id: l.id,
            buildingId: l.buildingId,
            bimLevelId: l.bimLevelId,
            name: l.name,
        })),
        note: `hierarchyStore: ${buildings.length} building(s), ${levels.length} level row(s)`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

export type BuildingResolutionKind = 'carried' | 'derived' | 'unknown';

export interface BuildingResolution {
    readonly kind: BuildingResolutionKind;
    /** `null` if and only if `kind === 'unknown'`. */
    readonly buildingId: string | null;
    /** `null` if and only if `kind === 'unknown'`. */
    readonly name: string | null;
    /** Persisted IFC identity of the building, when the substrate carries one. */
    readonly ifcGuid?: string;
    /** Human-readable reason. Never empty — a bare kind is not an explanation. */
    readonly why: string;
    /**
     * Present only when `kind === 'unknown'` because SEVERAL buildings claim this
     * `bimLevelId`. Named rather than arbitrated: choosing one would be the
     * "answer confidently and be wrong" failure C84 §9 records.
     */
    readonly candidateBuildingIds?: readonly string[];
}

const DERIVED_DEFAULT = (why: string): BuildingResolution => ({
    kind: 'derived',
    buildingId: DEFAULT_BUILDING_ID,
    name: DEFAULT_BUILDING_NAME,
    why,
});

/**
 * Which `IfcBuilding` does this PRYZM level belong to?
 *
 * @param bimLevelId the PRYZM level id (`LevelData.bimLevelId`), NOT the
 *                   hierarchy node id. The bridge is declared in
 *                   `HierarchyTypes.ts`'s own header.
 */
export function resolveLevelBuilding(
    bimLevelId: string | null | undefined,
    substrate: BuildingSubstrate,
): BuildingResolution {
    if (substrate.buildings === null || substrate.levels === null) {
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why: `containment is unreadable — ${substrate.note}`,
        };
    }
    if (!bimLevelId) {
        return DERIVED_DEFAULT(
            'the element carries no levelId, so no level row can be matched; ' +
            'falls to the single default building',
        );
    }

    const rows = substrate.levels.filter((l) => l.bimLevelId === bimLevelId);

    if (rows.length === 0) {
        // An EMPTINESS: the substrate simply does not record this level. Every
        // project authored before ADR-0385 is in exactly this state.
        return DERIVED_DEFAULT(
            `no hierarchy level row carries bimLevelId "${bimLevelId}" ` +
            `(${substrate.levels.length} row(s) read); falls to the single default building`,
        );
    }

    const buildingIds = [...new Set(rows.map((r) => r.buildingId))];

    if (buildingIds.length > 1) {
        // ADR-0385 §3's own example, and it is a genuine failure to answer: the
        // storeys are distinguishable, the ELEMENT is not.
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why:
                `bimLevelId "${bimLevelId}" is claimed by ${buildingIds.length} buildings ` +
                `(${buildingIds.join(', ')}); an element carrying only a levelId cannot be ` +
                `routed to one of them until it carries a building axis of its own`,
            candidateBuildingIds: buildingIds,
        };
    }

    const buildingId = buildingIds[0] as string;
    const building = substrate.buildings.find((b) => b.id === buildingId);

    if (!building) {
        // A DANGLING reference. The substrate answered, and its answer is broken —
        // that is not the same as it having said nothing.
        return {
            kind: 'unknown',
            buildingId: null,
            name: null,
            why:
                `hierarchy level row for bimLevelId "${bimLevelId}" names buildingId ` +
                `"${buildingId}", which resolves to no building (${substrate.buildings.length} read)`,
        };
    }

    return {
        kind: 'carried',
        buildingId: building.id,
        name: building.name,
        ifcGuid: building.ifcGuid,
        why: `hierarchy level "${rows[0]!.name}" records building "${building.name}"`,
    };
}

/**
 * Which `IfcBuilding` does this element belong to?
 *
 * The element→building edge is not carried by any element schema today — `Wall`
 * and `Slab` have no building axis and no group axis (measured: `grep -n "group"
 * packages/schemas/src/elements/Wall.ts Slab.ts` → 0 hits). So containment is
 * resolved THROUGH the element's level, which is the edge the substrate does
 * model. `elementId` is carried only so `why` can name the subject.
 */
export function resolveElementBuilding(
    elementId: string,
    levelId: string | null | undefined,
    substrate: BuildingSubstrate,
): BuildingResolution {
    const r = resolveLevelBuilding(levelId, substrate);
    return { ...r, why: `element "${elementId}": ${r.why}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// The roster — which buildings a pass should emit
// ─────────────────────────────────────────────────────────────────────────────

export interface RosterBuilding {
    readonly id: string;
    readonly name: string;
    readonly ifcGuid?: string;
    /** The PRYZM level ids that resolved into this building, in input order. */
    readonly levelIds: readonly string[];
    /** How the levels under it got here. `derived` means the default fallback. */
    readonly kind: Exclude<BuildingResolutionKind, 'unknown'>;
}

export interface BuildingRoster {
    /**
     * ⭐ NEVER EMPTY. A pass with no readable containment still has one building —
     * the default — because "I cannot tell you which building" is not a reason to
     * emit a file with no `IfcBuilding` in it. The honesty lives in `unknown`
     * below, not in a missing entity.
     */
    readonly buildings: readonly RosterBuilding[];
    /** Levels whose building could NOT be resolved, with the reason for each. */
    readonly unknown: readonly { readonly levelId: string; readonly why: string }[];
    /**
     * Buildings the substrate holds that no level in this pass resolved into.
     * Reported, not emitted: an `IfcBuilding` owning no `IfcBuildingStorey` says
     * something the model does not.
     */
    readonly unusedBuildingIds: readonly string[];
}

/**
 * Group a pass's levels into the buildings that own them.
 *
 * ⛔ THE UNGROUPED GUARANTEE (ADR-0383 D3 / ADR-0385 §3). When nothing in the
 * substrate claims any of these levels, the roster is EXACTLY ONE building whose
 * id is {@link DEFAULT_BUILDING_ID} holding every level in input order — which is
 * bit-for-bit the shape the exporter produced before ADR-0385. A level that
 * resolves `unknown` also lands there, but is additionally listed in `unknown` so
 * the caller can raise a diagnostic. It is never silently absorbed.
 */
export function buildBuildingRoster(
    levelIds: readonly string[],
    substrate: BuildingSubstrate,
): BuildingRoster {
    const order: string[] = [];
    const acc = new Map<string, {
        id: string; name: string; ifcGuid?: string; levelIds: string[];
        kind: Exclude<BuildingResolutionKind, 'unknown'>;
    }>();
    const unknown: { levelId: string; why: string }[] = [];

    const put = (
        b: { id: string; name: string; ifcGuid?: string },
        levelId: string,
        kind: Exclude<BuildingResolutionKind, 'unknown'>,
    ) => {
        let row = acc.get(b.id);
        if (!row) {
            row = { id: b.id, name: b.name, ifcGuid: b.ifcGuid, levelIds: [], kind };
            acc.set(b.id, row);
            order.push(b.id);
        }
        // A building holding even one CARRIED level is carried: the substrate
        // spoke about it. `derived` is reserved for the pure-fallback bucket.
        if (kind === 'carried') row.kind = 'carried';
        row.levelIds.push(levelId);
    };

    for (const levelId of levelIds) {
        const r = resolveLevelBuilding(levelId, substrate);
        if (r.kind === 'unknown') {
            unknown.push({ levelId, why: r.why });
            put({ id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME }, levelId, 'derived');
            continue;
        }
        put({ id: r.buildingId!, name: r.name!, ifcGuid: r.ifcGuid }, levelId, r.kind);
    }

    if (order.length === 0) {
        // No levels at all in this pass. Still one building — see the doc above.
        order.push(DEFAULT_BUILDING_ID);
        acc.set(DEFAULT_BUILDING_ID, {
            id: DEFAULT_BUILDING_ID, name: DEFAULT_BUILDING_NAME, levelIds: [], kind: 'derived',
        });
    }

    const emitted = new Set(order);
    const unusedBuildingIds = (substrate.buildings ?? [])
        .map((b) => b.id)
        .filter((id) => !emitted.has(id));

    return {
        buildings: order.map((id) => {
            const row = acc.get(id)!;
            return {
                id: row.id, name: row.name, ifcGuid: row.ifcGuid,
                levelIds: row.levelIds, kind: row.kind,
            };
        }),
        unknown,
        unusedBuildingIds,
    };
}
