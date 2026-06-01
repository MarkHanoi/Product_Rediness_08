/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — SyncStateEngine (Phase 5 — FULL IMPLEMENTATION)
 * File:             src/core/sync/SyncStateEngine.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.8
 *                   docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § PHASE 5
 *
 * Anti-infinite-loop design:
 *   - Writes sync state ONLY via hierarchyStore.setSyncState() (DOM CustomEvent, NOT StoreEventBus) // TODO(TASK-08)
 *   - NEVER calls hierarchyStore.update() or roomStore.update()
 *   - Re-entrancy guard: _computing Set<string> prevents re-scheduling mid-computation
 *
 * State resolution priority (lowest → highest, highest wins):
 *   no-template < planned-only < synced < partial < derived < conflict
 *
 * Trigger paths:
 *   1. StoreEventBus subscription (start() → findAffectedNodes → scheduleRecompute) // TODO(TASK-08)
 *   2. Direct call from Commands (AssignTemplateToNodeCommand etc.)
 *   3. Project load completion → resume()
 */

import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { storeEventBus, StoreChangeEvent } from '../StoreEventBus'; // TODO(TASK-08)
import { hierarchyStore } from '../hierarchy/HierarchyStore';
import { templateStore } from '../templates/TemplateStore';
import { templateAssignmentStore } from '../templates/TemplateAssignmentStore';
import type { SyncState, AnyHierarchyEntity } from '../hierarchy/HierarchyTypes';
import type {
    TemplateDefinition,
    AreaRequirement, CountRequirement,
    DoorRequirement, WindowRequirement, FinishRequirement,
    AdjacencyRequirement,
} from '../templates/TemplateTypes';
/** Minimal RoomData shape used by SyncStateEngine — rooms/ stays in src/ until Sprint H. */
type RoomData = {
    id: string;
    name?: string;
    occupancyType?: string;
    unitId?: string;
    levelId?: string;
    boundingWallIds: string[];
    computed?: { area?: number };
    finishes?: Record<string, { materialId?: string } | undefined>;
};

// ── Public result types (exported for SyncStateDetailDrawer) ──────────────────

/** A single requirement check result — human-readable for the detail drawer. */
export interface CheckResult {
    requirementKey: string;
    requirementLabel: string;
    expected: string;
    actual: string;
    passed: boolean;
    isDerived: boolean;
    delta?: string;
}

/** Per-node sync evaluation result, cached for instant access by the drawer. */
export interface SyncCheckResult {
    nodeId: string;
    state: SyncState;
    nodeName?: string;
    templateName?: string;
    checks: CheckResult[];
}

// ── Internal result types ──────────────────────────────────────────────────────

/** Per-requirement evaluation outcome. */
type RequirementOutcome = 'synced' | 'partial' | 'derived' | 'conflict';

/** Ordered severity — higher index wins when combining outcomes. */
const OUTCOME_PRIORITY: RequirementOutcome[] = ['synced', 'partial', 'derived', 'conflict'];
function maxOutcome(a: RequirementOutcome, b: RequirementOutcome): RequirementOutcome {
    return OUTCOME_PRIORITY.indexOf(a) >= OUTCOME_PRIORITY.indexOf(b) ? a : b;
}

// ── Numeric tolerance helper ───────────────────────────────────────────────────

function withinTolerance(actual: number, target: number, tolerancePercent = 5): boolean {
    const tolerance = (tolerancePercent / 100) * target;
    return actual >= target - tolerance && actual <= target + tolerance;
}

// ── Lightweight access helpers (via window globals, avoids circular imports) ───

function getRoomStore(): { getAll(): RoomData[]; getById(id: string): RoomData | undefined } | null {
    return window.roomStore ?? null; // TODO(TASK-07)
}

function getWallStore(): { getById(id: string): { openings?: Array<{ type: 'door' | 'window'; elementId: string }> } | undefined; getAll(): any[] } | null {
    return (window.wallStore as any) ?? null; // TODO(TASK-07)
}

function getDoorStore(): { getById(id: string): { fireRating?: string; doorType?: string } | undefined } | null {
    return (window.doorStore as any) ?? null; // TODO(TASK-07)
}

function getWindowStore(): { getById(id: string): { fireRating?: string; windowType?: string } | undefined } | null {
    return (window.windowStore as any) ?? null; // TODO(TASK-07)
}

// ── SyncStateEngine ────────────────────────────────────────────────────────────

class SyncStateEngine {
    private _computing   = new Set<string>();
    private _pending     = new Set<string>();
    /**
     * S85.D-finish.3: replaces the legacy `_rafHandle: number | null`.
     * Holds the cancel disposer for an in-flight `scheduleOnce()` batch
     * dispatch on the canonical L5 `getFrameScheduler()`.  Non-null while
     * a batch is queued, nulled either by `pause()` (explicit cancel) or
     * by the dispatch callback itself (just before `_processBatch()`
     * runs).  Same coalescing semantics as the pre-migration code: a
     * second `_scheduleBatch()` call while a batch is already queued is
     * a no-op (the next batch will pick up newly-pending nodes).
     */
    private _batchDispose: TickListenerDisposer | null = null;
    private _paused      = true;
    private _unsubscribe: (() => void) | null = null;
    private _resultCache = new Map<string, SyncCheckResult>();

    // ── Public lifecycle API ───────────────────────────────────────────────────

    /**
     * Subscribe to StoreEventBus and DOM events. // TODO(TASK-08)
     * Must be called once from EngineBootstrap after stores are wired.
     */
    start(): void {
        if (this._unsubscribe) return; // already started
        this._unsubscribe = storeEventBus.subscribe((event: StoreChangeEvent) => {
            const affected = this._findAffectedNodes(event);
            for (const nodeId of affected) {
                this.scheduleRecompute(nodeId);
            }
        });
        console.log('[SyncStateEngine] Started — subscribed to StoreEventBus'); // TODO(TASK-08)
    }

    /** Pause — called before project load. Cancels pending batch dispatch. */
    pause(): void {
        this._paused = true;
        if (this._batchDispose !== null) {
            this._batchDispose();
            this._batchDispose = null;
        }
    }

    /**
     * Resume — called after project load completes.
     * Flushes any pending recomputes that accumulated during load.
     */
    resume(): void {
        this._paused = false;
        if (this._pending.size > 0) {
            this._scheduleBatch();
        }
    }

    /** Schedule an async recompute for nodeId (queued via rAF). */
    scheduleRecompute(nodeId: string): void {
        if (this._computing.has(nodeId)) return; // re-entrancy guard
        this._pending.add(nodeId);
        if (!this._paused) {
            this._scheduleBatch();
        }
    }

    /** Fan out recompute to all nodes assigned to the given templateId. */
    scheduleRecomputeByTemplate(templateId: string): void {
        // Hierarchy / room nodes
        const assignments = templateAssignmentStore.getByTemplate(templateId);
        for (const a of assignments) {
            this.scheduleRecompute(a.nodeId);
        }
        // Phase 12: also recompute any ViewDefinition using this ViewTemplate
        const viewDefStore = window.viewDefinitionStore // TODO(TASK-07);
        if (viewDefStore?.getAll) {
            for (const view of viewDefStore.getAll()) {
                if (view.viewTemplateId === templateId) {
                    this.scheduleRecompute(view.id);
                }
            }
        }
    }

    /**
     * Synchronous recompute — computes and writes state immediately.
     * Used by commands that need immediate feedback.
     */
    recompute(nodeId: string): SyncState {
        return this._computeNode(nodeId);
    }

    /**
     * Returns the cached per-node check result from the last evaluation.
     * Used by SyncStateDetailDrawer to show requirement details without
     * re-running the full evaluation cycle.
     */
    getLastResult(nodeId: string): SyncCheckResult | undefined {
        return this._resultCache.get(nodeId);
    }

    // ── Private batch processing ───────────────────────────────────────────────

    private _scheduleBatch(): void {
        if (this._batchDispose !== null) return; // already queued
        this._batchDispose = getFrameScheduler().scheduleOnce('sync-state-batch', () => {
            this._batchDispose = null;
            this._processBatch();
        });
    }

    private _processBatch(): void {
        if (this._paused) return;
        // Snapshot current pending set — new items added during processing go
        // to the next frame (avoids unbounded batches).
        const toProcess = Array.from(this._pending);
        this._pending.clear();

        for (const nodeId of toProcess) {
            if (!this._computing.has(nodeId)) {
                this._computing.add(nodeId);
                try {
                    this._computeNode(nodeId);
                } finally {
                    this._computing.delete(nodeId);
                }
            }
        }
    }

    // ── Core compute dispatch ──────────────────────────────────────────────────

    private _computeNode(nodeId: string): SyncState {
        // ── Phase 12: View branch — check before hierarchy so view IDs don't
        //   accidentally match a hierarchy node added after-the-fact. ────────
        const viewStore = window.viewDefinitionStore // TODO(TASK-07);
        if (viewStore?.get?.(nodeId)) {
            const view = viewStore.get(nodeId);
            if (!view.viewTemplateId) {
                viewStore.updateSyncState?.(nodeId, 'no-template');
                return 'no-template';
            }
            const vTemplate = window.viewTemplateStore // TODO(TASK-07)?.get?.(view.viewTemplateId);
            const state = vTemplate
                ? this._evaluateViewTemplate(view, vTemplate, view.templateOverrides ?? {})
                : 'no-template';
            viewStore.updateSyncState?.(nodeId, state);
            return state;
        }

        // Check hierarchy node
        const node = hierarchyStore.getById(nodeId);
        if (node) {
            return this._computeHierarchyNode(node);
        }

        // Check room
        const roomStore = getRoomStore();
        const room = roomStore?.getById(nodeId);
        if (room) {
            return this._computeRoomNode(room);
        }

        // Unknown — no state to write
        return 'no-template';
    }

    // ── Phase 12: View template evaluation ────────────────────────────────────

    /**
     * Evaluates a view against its assigned ViewTemplate.
     * For each field in `template.lockedFields`:
     *   - If the view's value matches the template's value → 'synced' for that field
     *   - If mismatch AND overrides[field] is set → 'derived' (user-acknowledged)
     *   - If mismatch AND no override → 'conflict'
     * Overall result: highest-severity field outcome wins.
     */
    private _evaluateViewTemplate(
        view: any,
        template: any,
        overrides: Record<string, string>,
    ): SyncState {
        const lockedFields: string[] = template.lockedFields ?? [];
        if (lockedFields.length === 0) return 'synced';

        let hasConflict = false;
        let hasDerived  = false;

        for (const field of lockedFields) {
            const templateVal = this._vtGetTemplateFieldValue(template, field);
            if (templateVal === undefined) continue; // template doesn't set this field

            const viewVal = this._vtGetViewFieldValue(view, field);
            if (!this._vtValuesMatch(templateVal, viewVal)) {
                if (overrides[field]) {
                    hasDerived = true;
                } else {
                    hasConflict = true;
                }
            }
        }

        if (hasConflict) return 'conflict';
        if (hasDerived)  return 'derived';
        return 'synced';
    }

    private _vtGetTemplateFieldValue(template: any, field: string): any {
        switch (field) {
            case 'scale':       return template.output?.scale;
            case 'detailLevel': return template.output?.detailLevel;
            case 'visualStyle': return template.output?.visualStyle;
            case 'phaseFilter': return template.temporal?.phaseFilter;
            case 'vgTemplate':  return template.vgTemplateId;
            case 'crop':        return undefined; // not stored on template
            case 'viewRange':   return undefined;
            default:            return undefined;
        }
    }

    private _vtGetViewFieldValue(view: any, field: string): any {
        switch (field) {
            case 'scale':       return view.output?.scale;
            case 'detailLevel': return view.output?.detailLevel;
            case 'visualStyle': return view.output?.visualStyle;
            case 'discipline':  return view.discipline;
            case 'phaseFilter': return view.temporal?.phaseFilter;
            case 'vgTemplate':  return view.vgTemplateId;
            default:            return undefined;
        }
    }

    private _vtValuesMatch(a: any, b: any): boolean {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    // ── Hierarchy node evaluation ──────────────────────────────────────────────

    private _computeHierarchyNode(node: AnyHierarchyEntity): SyncState {
        const assignment = templateAssignmentStore.getForNode(node.id);
        const nodeName = (node as any).name ?? node.id;

        if (!assignment) {
            hierarchyStore.setSyncState(node.id, 'no-template');
            this._resultCache.set(node.id, { nodeId: node.id, state: 'no-template', nodeName, checks: [] });
            return 'no-template';
        }

        const template = templateStore.getById(assignment.templateId);
        if (!template) {
            // Template was deleted but assignment not cleaned up — treat as no-template
            hierarchyStore.setSyncState(node.id, 'no-template');
            this._resultCache.set(node.id, { nodeId: node.id, state: 'no-template', nodeName, checks: [] });
            return 'no-template';
        }

        // Planned-only: assignment exists but no model data
        if (this._isPlannedOnly(node)) {
            hierarchyStore.setSyncState(node.id, 'planned-only');
            this._resultCache.set(node.id, {
                nodeId: node.id,
                state: 'planned-only',
                nodeName,
                templateName: template.name,
                checks: [{
                    requirementKey: 'model-data',
                    requirementLabel: 'Model data',
                    expected: 'At least one element in model',
                    actual: 'No model elements yet',
                    passed: false,
                    isDerived: false,
                }],
            });
            return 'planned-only';
        }

        // Evaluate requirements
        const state = this._evaluateHierarchyRequirements(node, template, assignment.derivations);
        const checks = this._buildHierarchyChecks(node, template, assignment.derivations);
        this._resultCache.set(node.id, { nodeId: node.id, state, nodeName, templateName: template.name, checks });

        hierarchyStore.setSyncState(node.id, state);
        return state;
    }

    /**
     * planned-only: template assigned but no corresponding model content.
     * Definition by scope:
     *   unit     → no rooms with unitId === node.id
     *   level    → no units or rooms reference this level
     *   building → no levels in hierarchy with buildingId === node.id
     *   site     → no buildings with siteId === node.id
     */
    private _isPlannedOnly(node: AnyHierarchyEntity): boolean {
        switch (node.type) {
            case 'unit': {
                const roomStore = getRoomStore();
                if (!roomStore) return true; // can't verify — treat as planned-only
                return roomStore.getAll().filter((r: RoomData) => r.unitId === node.id).length === 0;
            }
            case 'level':
                return hierarchyStore.getChildren(node.id).length === 0;
            case 'building':
                return hierarchyStore.getChildren(node.id).length === 0;
            case 'site':
                return hierarchyStore.getChildren(node.id).length === 0;
            default:
                return false;
        }
    }

    private _evaluateHierarchyRequirements(
        node: AnyHierarchyEntity,
        template: TemplateDefinition,
        derivations: Record<string, string>,
    ): SyncState {
        const reqs = template.requirements;
        let worst: RequirementOutcome = 'synced';

        // ── Area requirement ───────────────────────────────────────────────────
        if (reqs.targetArea) {
            const actual = this._getActualArea(node);
            if (actual === null) {
                worst = maxOutcome(worst, 'partial');
            } else {
                const outcome = this._evaluateArea(actual, reqs.targetArea, derivations, 'targetArea');
                worst = maxOutcome(worst, outcome);
            }
        }

        // ── Count requirement ──────────────────────────────────────────────────
        if (reqs.targetCount) {
            const actual = this._getActualCount(node);
            if (actual === null) {
                worst = maxOutcome(worst, 'partial');
            } else {
                const outcome = this._evaluateCount(actual, reqs.targetCount, derivations, 'targetCount');
                worst = maxOutcome(worst, outcome);
            }
        }

        // ── Child node requirements ────────────────────────────────────────────
        if (reqs.childNodeRequirements) {
            for (let i = 0; i < reqs.childNodeRequirements.length; i++) {
                const req = reqs.childNodeRequirements[i];
                const key = `childNode_${i}`;
                const children = hierarchyStore.getChildren(node.id);
                const matching = req.templateCode
                    ? children.filter(c => {
                        const a = templateAssignmentStore.getForNode(c.id);
                        if (!a) return false;
                        const t = templateStore.getById(a.templateId);
                        return t?.code === req.templateCode;
                    })
                    : children.filter(c => c.type === req.childScope);

                const count = matching.length;
                const outcome = this._evaluateCount(count, {
                    minimum: req.minimumCount,
                    maximum: req.maximumCount,
                    exact: req.requiredCount,
                }, derivations, key);
                worst = maxOutcome(worst, outcome);
            }
        }

        // ── Custom requirements ────────────────────────────────────────────────
        if (reqs.customRequirements) {
            for (const req of reqs.customRequirements) {
                if (req.expectedValue === undefined) continue;
                const actual = node.plannedData.customProperties[req.key];
                const key = `custom_${req.key}`;

                if (actual === undefined || actual === null) {
                    worst = maxOutcome(worst, derivations[key] ? 'derived' : 'partial');
                } else {
                    const matches = actual === req.expectedValue;
                    if (!matches) {
                        worst = maxOutcome(worst, derivations[key] ? 'derived' : 'conflict');
                    }
                }
            }
        }

        return this._outcomeToSyncState(worst);
    }

    private _getActualArea(node: AnyHierarchyEntity): number | null {
        const roomStore = getRoomStore();
        if (!roomStore) return null;

        switch (node.type) {
            case 'unit': {
                const rooms = roomStore.getAll().filter((r: RoomData) => r.unitId === node.id);
                if (rooms.length === 0) return null;
                return rooms.reduce((sum: number, r: RoomData) => sum + (r.computed?.area ?? 0), 0);
            }
            case 'level': {
                // Sum of rooms on this level (via bimLevelId)
                const lvNode = node as import('../hierarchy/HierarchyTypes').LevelData;
                const rooms = roomStore.getAll().filter((r: RoomData) => r.levelId === lvNode.bimLevelId);
                if (rooms.length === 0) return null;
                return rooms.reduce((sum: number, r: RoomData) => sum + (r.computed?.area ?? 0), 0);
            }
            default:
                return null;
        }
    }

    private _getActualCount(node: AnyHierarchyEntity): number | null {
        const roomStore = getRoomStore();
        if (!roomStore) return null;

        switch (node.type) {
            case 'unit':
                return roomStore.getAll().filter((r: RoomData) => r.unitId === node.id).length;
            case 'level':
                return hierarchyStore.getChildren(node.id).length;
            case 'building':
                return hierarchyStore.getChildren(node.id).length;
            case 'site':
                return hierarchyStore.getChildren(node.id).length;
            default:
                return null;
        }
    }

    // ── Room evaluation ────────────────────────────────────────────────────────

    private _computeRoomNode(room: RoomData): SyncState {
        const assignment = templateAssignmentStore.getForNode(room.id);
        const nodeName = room.name ?? room.occupancyType ?? room.id;

        if (!assignment) {
            this._emitRoomSyncState(room.id, 'no-template');
            this._resultCache.set(room.id, { nodeId: room.id, state: 'no-template', nodeName, checks: [] });
            return 'no-template';
        }

        const template = templateStore.getById(assignment.templateId);
        if (!template) {
            this._emitRoomSyncState(room.id, 'no-template');
            this._resultCache.set(room.id, { nodeId: room.id, state: 'no-template', nodeName, checks: [] });
            return 'no-template';
        }

        const state = this._evaluateRoomRequirements(room, template, assignment.derivations);
        const checks = this._buildRoomChecks(room, template, assignment.derivations);
        this._resultCache.set(room.id, { nodeId: room.id, state, nodeName, templateName: template.name, checks });

        this._emitRoomSyncState(room.id, state);
        return state;
    }

    private _evaluateRoomRequirements(
        room: RoomData,
        template: TemplateDefinition,
        derivations: Record<string, string>,
    ): SyncState {
        const reqs = template.requirements;
        let worst: RequirementOutcome = 'synced';

        // ── Area ──────────────────────────────────────────────────────────────
        if (reqs.targetArea) {
            const actual = room.computed?.area ?? null;
            if (actual === null) {
                worst = maxOutcome(worst, 'partial');
            } else {
                worst = maxOutcome(worst, this._evaluateArea(actual, reqs.targetArea, derivations, 'targetArea'));
            }
        }

        // ── Doors ─────────────────────────────────────────────────────────────
        if (reqs.doorRequirements) {
            for (let i = 0; i < reqs.doorRequirements.length; i++) {
                const req = reqs.doorRequirements[i];
                const key = `door_${i}`;
                const doors = this._getDoors(room, req);
                if (doors === null) {
                    worst = maxOutcome(worst, 'partial');
                } else {
                    worst = maxOutcome(worst, this._evaluateCount(
                        doors,
                        { minimum: req.minimumCount, maximum: req.maximumCount, exact: req.requiredCount },
                        derivations, key,
                    ));
                }
            }
        }

        // ── Windows ───────────────────────────────────────────────────────────
        if (reqs.windowRequirements) {
            for (let i = 0; i < reqs.windowRequirements.length; i++) {
                const req = reqs.windowRequirements[i];
                const key = `window_${i}`;
                const windows = this._getWindows(room, req);
                if (windows === null) {
                    worst = maxOutcome(worst, 'partial');
                } else {
                    worst = maxOutcome(worst, this._evaluateCount(
                        windows,
                        { minimum: req.minimumCount, maximum: req.maximumCount, exact: req.requiredCount },
                        derivations, key,
                    ));
                }
            }
        }

        // ── Finishes ──────────────────────────────────────────────────────────
        if (reqs.finishRequirements) {
            for (let i = 0; i < reqs.finishRequirements.length; i++) {
                const req = reqs.finishRequirements[i];
                const key = `finish_${req.surface}_${i}`;
                const outcome = this._evaluateFinish(room, req, derivations, key);
                worst = maxOutcome(worst, outcome);
            }
        }

        // ── Adjacency ─────────────────────────────────────────────────────────
        if (reqs.adjacencyRequirements) {
            for (let i = 0; i < reqs.adjacencyRequirements.length; i++) {
                const req = reqs.adjacencyRequirements[i];
                const key = `adjacency_${i}`;
                const outcome = this._evaluateAdjacency(room, req, derivations, key);
                worst = maxOutcome(worst, outcome);
            }
        }

        // ── Custom ────────────────────────────────────────────────────────────
        if (reqs.customRequirements) {
            for (const req of reqs.customRequirements) {
                if (req.expectedValue === undefined) continue;
                // Custom requirements on rooms not yet supported (no room.customProperties)
                // Treat as partial — data exists but cannot evaluate
                worst = maxOutcome(worst, 'partial');
            }
        }

        return this._outcomeToSyncState(worst);
    }

    // ── Requirement evaluators ─────────────────────────────────────────────────

    private _evaluateArea(
        actual: number,
        req: AreaRequirement,
        derivations: Record<string, string>,
        key: string,
    ): RequirementOutcome {
        const tol = req.tolerancePercent ?? 5;
        let pass = true;

        if (req.minimum !== undefined && actual < req.minimum * (1 - tol / 100)) pass = false;
        if (req.maximum !== undefined && actual > req.maximum * (1 + tol / 100)) pass = false;
        if (req.target !== undefined && !withinTolerance(actual, req.target, tol)) pass = false;

        if (pass) return 'synced';
        return derivations[key] ? 'derived' : 'conflict';
    }

    private _evaluateCount(
        actual: number,
        req: Pick<CountRequirement, 'minimum' | 'maximum' | 'exact'>,
        derivations: Record<string, string>,
        key: string,
    ): RequirementOutcome {
        let pass = true;

        if (req.exact !== undefined && actual !== req.exact) pass = false;
        if (req.minimum !== undefined && actual < req.minimum) pass = false;
        if (req.maximum !== undefined && actual > req.maximum) pass = false;

        if (pass) return 'synced';
        return derivations[key] ? 'derived' : 'conflict';
    }

    private _evaluateFinish(
        room: RoomData,
        req: FinishRequirement,
        derivations: Record<string, string>,
        key: string,
    ): RequirementOutcome {
        // FinishRequirement.surface uses 'wall' (singular) but RoomFinishes uses 'walls' (plural)
        const surfaceKey = req.surface === 'wall' ? 'walls' : req.surface;
        const finishSpec = room.finishes?.[surfaceKey as 'floor' | 'ceiling' | 'walls'];

        if (!finishSpec) {
            // No finish data for this surface
            return derivations[key] ? 'derived' : 'partial';
        }

        if (req.materialId !== undefined) {
            if (!finishSpec.materialId) return derivations[key] ? 'derived' : 'partial';
            if (finishSpec.materialId !== req.materialId) {
                return derivations[key] ? 'derived' : 'conflict';
            }
        }

        if (req.materialCategory !== undefined) {
            // materialCategory is not stored on RoomFinishSpec — treat as partial
            return derivations[key] ? 'derived' : 'partial';
        }

        return 'synced';
    }

    private _evaluateAdjacency(
        room: RoomData,
        req: AdjacencyRequirement,
        derivations: Record<string, string>,
        key: string,
    ): RequirementOutcome {
        const roomStore = getRoomStore();
        if (!roomStore) return 'partial'; // can't evaluate

        const adjacent = roomStore.getAll().filter((other: RoomData) =>
            other.id !== room.id &&
            other.boundingWallIds.some((wId: string) => room.boundingWallIds.includes(wId)),
        );

        if (req.mustBeAdjacentTo !== undefined) {
            const found = adjacent.some((r: RoomData) => r.occupancyType === req.mustBeAdjacentTo);
            if (!found) return derivations[key] ? 'derived' : 'conflict';
        }

        if (req.mustNotBeAdjacentTo !== undefined) {
            const found = adjacent.some((r: RoomData) => r.occupancyType === req.mustNotBeAdjacentTo);
            if (found) return derivations[key] ? 'derived' : 'conflict';
        }

        return 'synced';
    }

    // ── Door / Window gathering ────────────────────────────────────────────────

    /**
     * Returns the count of doors on bounding walls matching the requirement filters.
     * Returns null if wallStore is unavailable (→ 'partial').
     */
    private _getDoors(room: RoomData, req: DoorRequirement): number | null {
        const wallStore = getWallStore();
        if (!wallStore) return null;

        let count = 0;
        for (const wallId of room.boundingWallIds) {
            const wall = wallStore.getById(wallId);
            if (!wall?.openings) continue;
            for (const opening of wall.openings) {
                if (opening.type !== 'door') continue;
                if (req.typeCode !== undefined) {
                    const doorStore = getDoorStore();
                    const door = doorStore?.getById(opening.elementId);
                    if (door && door.doorType !== req.typeCode) continue;
                }
                if (req.fireRating !== undefined) {
                    const doorStore = getDoorStore();
                    const door = doorStore?.getById(opening.elementId);
                    if (!door || door.fireRating !== req.fireRating) continue;
                }
                count++;
            }
        }
        return count;
    }

    /**
     * Returns the count of windows on bounding walls matching the requirement filters.
     * Returns null if wallStore is unavailable (→ 'partial').
     */
    private _getWindows(room: RoomData, req: WindowRequirement): number | null {
        const wallStore = getWallStore();
        if (!wallStore) return null;

        let count = 0;
        for (const wallId of room.boundingWallIds) {
            const wall = wallStore.getById(wallId);
            if (!wall?.openings) continue;
            for (const opening of wall.openings) {
                if (opening.type !== 'window') continue;
                if (req.typeCode !== undefined) {
                    const windowStore = getWindowStore();
                    const win = windowStore?.getById(opening.elementId);
                    if (win && win.windowType !== req.typeCode) continue;
                }
                count++;
            }
        }
        return count;
    }

    // ── Event routing ──────────────────────────────────────────────────────────

    /**
     * Maps a StoreEventBus event to the set of node IDs that need recompute. // TODO(TASK-08)
     * Routing table from Audit §1.3 / Phase 5 spec:
     *
     * | elementType           | Affected nodes                                     |
     * |-----------------------|----------------------------------------------------|
     * | 'template'            | All nodes assigned to that templateId               |
     * | 'template-assignment' | The nodeId in the assignment                        |
     * | 'room'                | The room + its unitId (if set)                      |
     * | 'door' / 'window'     | Rooms whose boundingWallIds contain the host wall    |
     * | 'site'/'building'/    | That node + its parentId                            |
     * |   'level'/'unit'      |                                                     |
     * | 'element-code'        | No recompute needed                                 |
     */
    private _findAffectedNodes(event: StoreChangeEvent): string[] {
        const { elementType, elementId } = event;
        const affected: string[] = [];

        switch (elementType) {
            case 'element-code':
                // No sync state recompute needed for code assignments
                break;

            case 'template': {
                // Fan out to all nodes using this template
                const assignments = templateAssignmentStore.getByTemplate(elementId);
                for (const a of assignments) {
                    affected.push(a.nodeId);
                }
                break;
            }

            case 'template-assignment': {
                // The elementId IS the nodeId in templateAssignmentStore events
                affected.push(elementId);
                break;
            }

            case 'room': {
                // The room itself + its parent unit (if assigned)
                affected.push(elementId);
                const roomStore = getRoomStore();
                const room = roomStore?.getById(elementId);
                if (room?.unitId) {
                    affected.push(room.unitId);
                }
                break;
            }

            case 'door':
            case 'window': {
                // Find rooms whose bounding walls contain this door/window.
                // We locate the host wall by finding the door/window in doorStore/windowStore,
                // then find rooms that include that wall in boundingWallIds.
                const wallId = this._findHostWall(elementId, elementType as 'door' | 'window');
                if (wallId) {
                    const roomStore = getRoomStore();
                    const rooms = roomStore?.getAll() ?? [];
                    for (const room of rooms as RoomData[]) {
                        if (room.boundingWallIds.includes(wallId)) {
                            affected.push(room.id);
                        }
                    }
                }
                break;
            }

            case 'site':
            case 'building':
            case 'level':
            case 'unit': {
                // The node itself + its parent
                affected.push(elementId);
                const node = hierarchyStore.getById(elementId);
                if (node?.parentId) {
                    affected.push(node.parentId);
                }
                break;
            }

            default:
                // Wall updates may affect room areas/adjacency indirectly,
                // but we don't recompute on every wall change (too expensive).
                // Wall topology changes that create/delete rooms emit 'room' events.
                break;
        }

        // Deduplicate
        return Array.from(new Set(affected));
    }

    /**
     * Locate the wall that hosts a given door or window element.
     * Searches doorStore/windowStore for the wallId field (added in Phase 5 PRE-STEP).
     */
    private _findHostWall(elementId: string, type: 'door' | 'window'): string | null {
        if (type === 'door') {
            const store = getDoorStore() as any;
            const door = store?.getById?.(elementId);
            if (door?.wallId) return door.wallId;
        } else {
            const store = getWindowStore() as any;
            const win = store?.getById?.(elementId);
            if (win?.wallId) return win.wallId;
        }
        // Fallback: search all walls for this opening's elementId
        const wallStore = getWallStore();
        if (!wallStore) return null;
        for (const wall of wallStore.getAll()) {
            if (wall.openings?.some((o: any) => o.elementId === elementId)) {
                return wall.id;
            }
        }
        return null;
    }

    // ── Check result builders (for SyncStateDetailDrawer) ─────────────────────

    private _buildHierarchyChecks(
        node: AnyHierarchyEntity,
        template: TemplateDefinition,
        derivations: Record<string, string>,
    ): CheckResult[] {
        const reqs = template.requirements;
        const checks: CheckResult[] = [];

        if (reqs.targetArea) {
            const actual = this._getActualArea(node);
            checks.push(this._checkArea(actual, reqs.targetArea, derivations, 'targetArea', 'Area'));
        }

        if (reqs.targetCount) {
            const actual = this._getActualCount(node);
            checks.push(this._checkCount(actual, reqs.targetCount, derivations, 'targetCount', 'Count'));
        }

        if (reqs.childNodeRequirements) {
            for (let i = 0; i < reqs.childNodeRequirements.length; i++) {
                const req = reqs.childNodeRequirements[i];
                const key = `childNode_${i}`;
                const children = hierarchyStore.getChildren(node.id);
                const matching = req.templateCode
                    ? children.filter(c => {
                        const a = templateAssignmentStore.getForNode(c.id);
                        if (!a) return false;
                        const t = templateStore.getById(a.templateId);
                        return t?.code === req.templateCode;
                    })
                    : children.filter(c => c.type === req.childScope);
                const label = req.templateCode
                    ? `Child (${req.templateCode})`
                    : `${String(req.childScope ?? 'child').charAt(0).toUpperCase() + String(req.childScope ?? 'child').slice(1)}s`;
                checks.push(this._checkCount(
                    matching.length,
                    { minimum: req.minimumCount, maximum: req.maximumCount, exact: req.requiredCount },
                    derivations, key, label,
                ));
            }
        }

        if (reqs.customRequirements) {
            for (const req of reqs.customRequirements) {
                if (req.expectedValue === undefined) continue;
                const key = `custom_${req.key}`;
                const actual = node.plannedData.customProperties[req.key];
                const hasValue = actual !== undefined && actual !== null;
                const pass = hasValue && actual === req.expectedValue;
                checks.push({
                    requirementKey: key,
                    requirementLabel: req.key,
                    expected: String(req.expectedValue),
                    actual: hasValue ? String(actual) : 'Not set',
                    passed: pass,
                    isDerived: !pass && !!derivations[key],
                });
            }
        }

        return checks;
    }

    private _buildRoomChecks(
        room: RoomData,
        template: TemplateDefinition,
        derivations: Record<string, string>,
    ): CheckResult[] {
        const reqs = template.requirements;
        const checks: CheckResult[] = [];

        if (reqs.targetArea) {
            const actual = room.computed?.area ?? null;
            checks.push(this._checkArea(actual, reqs.targetArea, derivations, 'targetArea', 'Area'));
        }

        if (reqs.doorRequirements) {
            for (let i = 0; i < reqs.doorRequirements.length; i++) {
                const req = reqs.doorRequirements[i];
                const key = `door_${i}`;
                const count = this._getDoors(room, req);
                const label = req.fireRating
                    ? `Door (FR ${req.fireRating})`
                    : req.typeCode ? `Door (${req.typeCode})` : 'Door';
                checks.push(this._checkCount(
                    count,
                    { minimum: req.minimumCount, maximum: req.maximumCount, exact: req.requiredCount },
                    derivations, key, label,
                ));
            }
        }

        if (reqs.windowRequirements) {
            for (let i = 0; i < reqs.windowRequirements.length; i++) {
                const req = reqs.windowRequirements[i];
                const key = `window_${i}`;
                const count = this._getWindows(room, req);
                const label = req.typeCode ? `Window (${req.typeCode})` : 'Window';
                checks.push(this._checkCount(
                    count,
                    { minimum: req.minimumCount, maximum: req.maximumCount, exact: req.requiredCount },
                    derivations, key, label,
                ));
            }
        }

        if (reqs.finishRequirements) {
            for (let i = 0; i < reqs.finishRequirements.length; i++) {
                const req = reqs.finishRequirements[i];
                const key = `finish_${req.surface}_${i}`;
                const surfaceKey = req.surface === 'wall' ? 'walls' : req.surface;
                const finishSpec = room.finishes?.[surfaceKey as 'floor' | 'ceiling' | 'walls'];
                const expectedVal = req.materialId ?? req.materialCategory ?? 'Specified material';
                const actualVal = finishSpec?.materialId ?? 'Not set';
                const pass = !!(finishSpec && (
                    req.materialId === undefined || finishSpec.materialId === req.materialId
                ));
                const surface = req.surface.charAt(0).toUpperCase() + req.surface.slice(1);
                checks.push({
                    requirementKey: key,
                    requirementLabel: `${surface} finish`,
                    expected: String(expectedVal),
                    actual: actualVal,
                    passed: pass,
                    isDerived: !pass && !!derivations[key],
                });
            }
        }

        if (reqs.adjacencyRequirements) {
            for (let i = 0; i < reqs.adjacencyRequirements.length; i++) {
                const req = reqs.adjacencyRequirements[i];
                const key = `adjacency_${i}`;
                const roomStore = getRoomStore();
                const adjacent = roomStore?.getAll().filter((other: RoomData) =>
                    other.id !== room.id &&
                    other.boundingWallIds.some((wId: string) => room.boundingWallIds.includes(wId))
                ) ?? [];

                if (req.mustBeAdjacentTo !== undefined) {
                    const found = adjacent.some((r: RoomData) => r.occupancyType === req.mustBeAdjacentTo);
                    checks.push({
                        requirementKey: key,
                        requirementLabel: `Must adjoin ${req.mustBeAdjacentTo}`,
                        expected: `Adjacent to: ${req.mustBeAdjacentTo}`,
                        actual: found ? `Found adjacent ${req.mustBeAdjacentTo}` : `No ${req.mustBeAdjacentTo} adjacent`,
                        passed: found,
                        isDerived: !found && !!derivations[key],
                    });
                }

                if (req.mustNotBeAdjacentTo !== undefined) {
                    const found = adjacent.some((r: RoomData) => r.occupancyType === req.mustNotBeAdjacentTo);
                    checks.push({
                        requirementKey: `${key}_not`,
                        requirementLabel: `Must not adjoin ${req.mustNotBeAdjacentTo}`,
                        expected: `Not adjacent to: ${req.mustNotBeAdjacentTo}`,
                        actual: found ? `Conflicts: ${req.mustNotBeAdjacentTo} is adjacent` : 'No conflict',
                        passed: !found,
                        isDerived: found && !!derivations[key],
                    });
                }
            }
        }

        return checks;
    }

    // ── Check helper: area ─────────────────────────────────────────────────────

    private _checkArea(
        actual: number | null,
        req: AreaRequirement,
        derivations: Record<string, string>,
        key: string,
        label: string,
    ): CheckResult {
        const expectedStr = this._formatAreaExpected(req);

        if (actual === null) {
            return {
                requirementKey: key,
                requirementLabel: label,
                expected: expectedStr,
                actual: 'No data',
                passed: false,
                isDerived: !!derivations[key],
            };
        }

        const tol = req.tolerancePercent ?? 5;
        let pass = true;
        if (req.minimum !== undefined && actual < req.minimum * (1 - tol / 100)) pass = false;
        if (req.maximum !== undefined && actual > req.maximum * (1 + tol / 100)) pass = false;
        if (req.target !== undefined && !withinTolerance(actual, req.target, tol)) pass = false;

        let delta: string | undefined;
        if (!pass) {
            if (req.minimum !== undefined && actual < req.minimum) {
                const diff = actual - req.minimum;
                const pct = (diff / req.minimum) * 100;
                delta = `${diff.toFixed(1)} m² (${pct.toFixed(1)}%)`;
            } else if (req.maximum !== undefined && actual > req.maximum) {
                const diff = actual - req.maximum;
                const pct = (diff / req.maximum) * 100;
                delta = `+${diff.toFixed(1)} m² (+${pct.toFixed(1)}%)`;
            } else if (req.target !== undefined) {
                const diff = actual - req.target;
                const pct = (diff / req.target) * 100;
                delta = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} m² (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
            }
        }

        return {
            requirementKey: key,
            requirementLabel: label,
            expected: expectedStr,
            actual: `${actual.toFixed(1)} m²`,
            passed: pass,
            isDerived: !pass && !!derivations[key],
            delta,
        };
    }

    private _formatAreaExpected(req: AreaRequirement): string {
        const parts: string[] = [];
        if (req.minimum !== undefined) parts.push(`min ${req.minimum.toFixed(1)} m²`);
        if (req.target !== undefined) parts.push(`target ${req.target.toFixed(1)} m²`);
        if (req.maximum !== undefined) parts.push(`max ${req.maximum.toFixed(1)} m²`);
        if (req.tolerancePercent !== undefined && req.tolerancePercent !== 5) {
            parts.push(`±${req.tolerancePercent}%`);
        }
        return parts.join(', ') || 'Area requirement';
    }

    // ── Check helper: count ────────────────────────────────────────────────────

    private _checkCount(
        actual: number | null,
        req: Pick<CountRequirement, 'minimum' | 'maximum' | 'exact'>,
        derivations: Record<string, string>,
        key: string,
        label: string,
    ): CheckResult {
        const expectedStr = this._formatCountExpected(req);

        if (actual === null) {
            return {
                requirementKey: key,
                requirementLabel: label,
                expected: expectedStr,
                actual: 'No data',
                passed: false,
                isDerived: !!derivations[key],
            };
        }

        let pass = true;
        if (req.exact !== undefined && actual !== req.exact) pass = false;
        if (req.minimum !== undefined && actual < req.minimum) pass = false;
        if (req.maximum !== undefined && actual > req.maximum) pass = false;

        let delta: string | undefined;
        if (!pass) {
            if (req.minimum !== undefined && actual < req.minimum) {
                const need = req.minimum - actual;
                delta = `−${need} (need ${need} more)`;
            } else if (req.maximum !== undefined && actual > req.maximum) {
                const excess = actual - req.maximum;
                delta = `+${excess} (${excess} too many)`;
            } else if (req.exact !== undefined) {
                const diff = actual - req.exact;
                delta = `${diff >= 0 ? '+' : ''}${diff}`;
            }
        }

        return {
            requirementKey: key,
            requirementLabel: label,
            expected: expectedStr,
            actual: String(actual),
            passed: pass,
            isDerived: !pass && !!derivations[key],
            delta,
        };
    }

    private _formatCountExpected(req: Pick<CountRequirement, 'minimum' | 'maximum' | 'exact'>): string {
        if (req.exact !== undefined) return `exactly ${req.exact}`;
        const parts: string[] = [];
        if (req.minimum !== undefined) parts.push(`min ${req.minimum}`);
        if (req.maximum !== undefined) parts.push(`max ${req.maximum}`);
        return parts.join(', ') || 'Count requirement';
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private _outcomeToSyncState(outcome: RequirementOutcome): SyncState {
        return outcome; // RequirementOutcome values are a subset of SyncState
    }

    private _emitRoomSyncState(roomId: string, state: SyncState): void {
        window.dispatchEvent(new CustomEvent('pryzm-room-sync-state-changed', { // TODO(TASK-15)
            detail: { nodeId: roomId, state },
        }));
    }
}

export const syncStateEngine = new SyncStateEngine();
