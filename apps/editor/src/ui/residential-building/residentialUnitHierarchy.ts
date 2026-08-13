// L-864 / UNIT CONTAINMENT — §RESI-UNIT-CONTAINMENT (editor half).
//
// THE FINDING (browser-observed in production 2026-08-13, C75 OBSERVED): a building generated
// as five apartments per floor shipped a model tree headed "Unassigned rooms on Level 01" —
// Corridor, Kitchen, Living Room, Bathroom, Bedroom 1, Bedroom 2, then ANOTHER Living Room,
// Kitchen, Bedroom — every room FLAT under its level. Nothing in the model knew which rooms
// formed an apartment. A `+ Unit` affordance existed for manual assignment; the generator never
// used it, never triggered the hierarchy auto-setup the panel already offers, and shipped the
// building object with `BUILDING USE —`, `STOREYS —`, all of which it knew at generation time.
//
// WHY IT MATTERS: "combine these two apartments" and "convert this 2-bed to a 3-bed" are
// meaningless instructions to a model with no concept of an apartment. C81 §8 records unit
// containment as a HARD PRECONDITION of the edit layer.
//
// WHAT THIS FILE DOES: `planUnitHierarchy` is PURE. Given (a) what already exists in
// `hierarchyStore`, (b) the BIM levels the executor just minted and (c) the per-apartment
// `PlannedUnit[]` from `@pryzm/ai-host` (`planBuildingUnits`), it returns an ORDERED list of
// EXISTING bus verbs that build the spine — plus `unitIdByKey`, the unitId each apartment's
// rooms must carry. `dispatchUnitHierarchy` executes that list in dependency order.
//
// SCOPE DISCIPLINE, stated so it is not re-litigated:
//   • NO new bus verb and NO new user-visible attribute (C67 / C68). `hierarchy.createSite`,
//     `createBuilding`, `createLevel`, `createUnit` and `updateNode` are all already registered
//     (`initBusHandlers.ts`) and already chat-classified
//     (`ChatCommandClassification.ts`). `check-chat-capability-coverage` reads identically
//     before and after this change.
//   • NO semantic-graph `partOf` edge. `check-graph-write-coverage` ledgers `partOf/writer` +
//     `partOf/reader` as DELIBERATELY DECLINED (C71 §2.5) pending a PRIOR decision — are
//     hierarchy nodes graph citizens at all, or is `hierarchyStore` + `parentId` the sole
//     hierarchy substrate? Writing a `partOf` edge here would answer that by accident. This path
//     writes the AUTHORITATIVE `room.unitId` field + `hierarchyStore` nodes, which is exactly the
//     substrate `HierarchyTreePanel`, `getRoomsForUnit`, `getUnassignedRooms`, `SyncStateEngine`
//     and the IFC writer already read.
//   • Unit AREA is deliberately NOT written as planned data. `SyncStateEngine` derives a unit's
//     actual area from its assigned rooms; asserting a planned area here would manufacture a
//     `conflict`/`synced` verdict out of a number nobody entered (C74 honesty).
//
// Contracts: C81 §8 (precondition), C20 (building & apartment aggregates), C03 §2 / C16
// (commands are the only mutation path — every write below is a registered bus command),
// C67 §1 + C68 (no new capability minted), C71 §2.5 (the declined partOf ledger, respected).

import type { PlannedUnit } from '@pryzm/ai-host';

// ── Inputs ──────────────────────────────────────────────────────────────────────────────

/** The subset of `hierarchyStore` this planner reads (injected, so the planner stays pure). */
export interface ExistingHierarchy {
    readonly sites: ReadonlyArray<{ id: string; name?: string }>;
    readonly buildings: ReadonlyArray<{ id: string; siteId: string }>;
    readonly levels: ReadonlyArray<{ id: string; buildingId: string; bimLevelId: string }>;
}

/** A BIM level the executor minted (or reused), paired with its orchestrator level index. */
export interface BimLevelRef {
    readonly bimLevelId: string;
    readonly name: string;
    /** Orchestrator level index — 0 = ground. Units reference this. */
    readonly levelIndex: number;
}

export interface UnitHierarchyInput {
    readonly existing: ExistingHierarchy;
    readonly projectName?: string;
    readonly bimLevels: readonly BimLevelRef[];
    readonly units: readonly PlannedUnit[];
    /** Storeys for the building node (`STOREYS —` in the finding). */
    readonly storeys: number;
    /** Injectable id generator (production: `crypto.randomUUID`). */
    readonly newId: () => string;
}

// ── Output ──────────────────────────────────────────────────────────────────────────────

export type HierarchyVerb =
    | 'hierarchy.createSite'
    | 'hierarchy.createBuilding'
    | 'hierarchy.createLevel'
    | 'hierarchy.createUnit'
    | 'hierarchy.updateNode';

export interface HierarchyOp {
    readonly verb: HierarchyVerb;
    readonly payload: Record<string, unknown>;
}

export interface UnitHierarchyPlan {
    /** Ordered: site → building → (building attributes) → levels → units. */
    readonly ops: readonly HierarchyOp[];
    readonly siteId: string;
    readonly buildingId: string;
    /** `${levelIndex}:${indexOnLevel}` → hierarchy unit id, for stamping `room.unitId`. */
    readonly unitIdByKey: ReadonlyMap<string, string>;
}

/** The key `unitIdByKey` is indexed by — the apartment's (level, position-among-placed). */
export function unitKey(levelIndex: number, indexOnLevel: number): string {
    return `${levelIndex}:${indexOnLevel}`;
}

// ── The planner ─────────────────────────────────────────────────────────────────────────

/**
 * Plan the hierarchy spine for a generated residential building. PURE + deterministic given
 * `newId`. Reuses any existing site / building / level rather than minting a rival, so a second
 * generation in the same project does not duplicate the spine. Returns an EMPTY plan when there
 * are no units to contain (nothing to say ⇒ say nothing).
 */
export function planUnitHierarchy(input: UnitHierarchyInput): UnitHierarchyPlan {
    const ops: HierarchyOp[] = [];
    const unitIdByKey = new Map<string, string>();

    if (!input.units || input.units.length === 0) {
        return { ops, siteId: '', buildingId: '', unitIdByKey };
    }

    // ── Site ────────────────────────────────────────────────────────────────────────────
    const existingSite = input.existing.sites[0];
    const siteId = existingSite?.id ?? input.newId();
    if (!existingSite) {
        ops.push({
            verb: 'hierarchy.createSite',
            payload: { id: siteId, name: input.projectName?.trim() || 'Site A' },
        });
    }

    // ── Building ────────────────────────────────────────────────────────────────────────
    const existingBuilding = input.existing.buildings.find(b => b.siteId === siteId)
        ?? input.existing.buildings[0];
    const buildingId = existingBuilding?.id ?? input.newId();
    if (!existingBuilding) {
        ops.push({
            verb: 'hierarchy.createBuilding',
            payload: { id: buildingId, siteId, name: 'Building 1', code: 'B1' },
        });
    }
    // The finding's `BUILDING USE —` / `STOREYS —`: both were known at generation time. The
    // create verb forwards only id/siteId/name/code, so the two attributes are set through the
    // registered `hierarchy.updateNode` verb rather than by widening a bus handler.
    ops.push({
        verb: 'hierarchy.updateNode',
        payload: { id: buildingId, updates: { buildingUse: 'Residential', numberOfStoreys: input.storeys } },
    });

    // ── Levels ──────────────────────────────────────────────────────────────────────────
    // One hierarchy level per BIM level, reusing any that already points at that bimLevelId.
    const hierarchyLevelIdByIndex = new Map<number, string>();
    for (const bim of input.bimLevels) {
        const existingLevel = input.existing.levels.find(l => l.bimLevelId === bim.bimLevelId);
        if (existingLevel) {
            hierarchyLevelIdByIndex.set(bim.levelIndex, existingLevel.id);
            continue;
        }
        const id = input.newId();
        hierarchyLevelIdByIndex.set(bim.levelIndex, id);
        ops.push({
            verb: 'hierarchy.createLevel',
            payload: {
                id,
                buildingId,
                bimLevelId: bim.bimLevelId,
                name: bim.name,
                levelNumber: String(bim.levelIndex).padStart(2, '0'),
            },
        });
    }

    // ── Units ───────────────────────────────────────────────────────────────────────────
    for (const u of input.units) {
        const levelId = hierarchyLevelIdByIndex.get(u.levelIndex);
        // A unit with no hierarchy level cannot be parented. Skip it rather than orphan it —
        // its rooms then stay honestly unassigned instead of pointing at a unit that is not
        // in the tree (C74: a wrong containment is worse than a missing one).
        if (!levelId) continue;
        const id = input.newId();
        unitIdByKey.set(unitKey(u.levelIndex, u.indexOnLevel), id);
        ops.push({
            verb: 'hierarchy.createUnit',
            payload: {
                id,
                levelId,
                name: u.name,
                unitNumber: u.unitNumber,
                unitType: u.unitType,
            },
        });
    }

    return { ops, siteId, buildingId, unitIdByKey };
}

// ── Dispatch ────────────────────────────────────────────────────────────────────────────

/** The bus surface this module needs (a `PryzmRuntime['bus']` satisfies it). */
export interface HierarchyBusLike {
    executeCommand(command: string, payload: unknown): unknown;
}

/**
 * Execute a plan in dependency order (site → building → levels → units), awaiting each step so
 * a child never races its parent. Never throws: a failed op is warned and the rest continue —
 * a missing unit node degrades to "unassigned rooms", which is exactly today's behaviour, and
 * must never abort a building that is otherwise built.
 */
export async function dispatchUnitHierarchy(bus: HierarchyBusLike, plan: UnitHierarchyPlan): Promise<number> {
    let done = 0;
    for (const op of plan.ops) {
        try {
            await Promise.resolve(bus.executeCommand(op.verb, op.payload));
            done++;
        } catch (e) {
            console.warn('[resi-building] §RESI-UNIT-CONTAINMENT —', op.verb, 'failed', e);
        }
    }
    return done;
}
