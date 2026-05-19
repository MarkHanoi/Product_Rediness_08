/**
 * SpeculativeEngine — Phase K-2
 *
 * Phase:   K-2 (World Model Plan V3 — Consequence Preview System)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-2
 *
 * Read-only speculative state engine.
 *
 * When the user hovers over an element with a destructive tool active,
 * SpeculativeEngine.preview(action) is called:
 *
 *   1. Takes a shallow snapshot of the relevant stores (no references to
 *      live store objects — plain cloned data only).
 *   2. Applies the proposed action to the snapshot (no live store writes).
 *   3. Runs constraint validation against the snapshot.
 *   4. Diffs violations before/after.
 *   5. Returns a ConsequencePreview without touching any live state.
 *
 * Rule (non-negotiable):
 *   SpeculativeEngine does NOT modify any live store or SemanticGraph.
 *   All computation is on cloned plain objects.
 */

import { constraintEngine, type ValidationResult } from '@pryzm/constraint-solver/compliance';

export type SpeculativeActionType =
    | 'delete-element'
    | 'delete-wall'
    | 'resize-room'
    | 'move-element';

export interface SpeculativeAction {
    type:      SpeculativeActionType;
    elementId: string;
    /** Extra parameters (e.g. new area for resize-room) */
    params?:   Record<string, unknown>;
}

export interface SemanticRelationshipSnapshot {
    sourceId:   string;
    targetId:   string;
    type:       string;
}

export interface ConsequencePreview {
    newViolations:        ValidationResult[];
    resolvedViolations:   ValidationResult[];
    severedRelationships: SemanticRelationshipSnapshot[];
    affectedElements:     string[];
    computeTimeMs:        number;
}

// ── Store snapshot helpers (plain data, no live references) ──────────────────

function cloneStoreItems(store: any): any[] {
    if (!store?.getAll) return [];
    try {
        return store.getAll().map((item: any) => ({ ...item }));
    } catch {
        return [];
    }
}

function applyActionToRooms(rooms: any[], action: SpeculativeAction): any[] {
    switch (action.type) {
        case 'delete-element':
            return rooms.filter(r => r.id !== action.elementId);
        case 'resize-room': {
            const area = Number(action.params?.area ?? 0);
            return rooms.map(r => r.id === action.elementId && area > 0
                ? { ...r, computed: { ...(r.computed ?? {}), area } }
                : r
            );
        }
        default:
            return rooms;
    }
}

function applyActionToWalls(walls: any[], action: SpeculativeAction): any[] {
    if (action.type === 'delete-wall' || action.type === 'delete-element') {
        return walls.filter(w => w.id !== action.elementId);
    }
    return walls;
}

function applyActionToDoors(doors: any[], action: SpeculativeAction): any[] {
    if (action.type === 'delete-wall') {
        // Doors hosted on the deleted wall become orphaned — remove them
        return doors.filter(d => d.hostWallId !== action.elementId);
    }
    if (action.type === 'delete-element') {
        return doors.filter(d => d.id !== action.elementId);
    }
    return doors;
}

function getSemanticRelationships(elementId: string): SemanticRelationshipSnapshot[] {
    const sgm = window.semanticGraphManager;
    if (!sgm?.getEdges) return [];
    try {
        const edges = sgm.getEdges(elementId) as Array<{ targetId: string; type: string }>;
        return edges.map(e => ({ sourceId: elementId, targetId: e.targetId, type: e.type }));
    } catch {
        return [];
    }
}

function getAffectedByDeletion(elementId: string): string[] {
    const sgm = window.semanticGraphManager;
    if (!sgm?.getEdges) return [];
    try {
        const edges = sgm.getEdges(elementId) as Array<{ targetId: string }>;
        return edges.map(e => e.targetId);
    } catch {
        return [];
    }
}

// ── Main engine ───────────────────────────────────────────────────────────────

class SpeculativeEngineImpl {
    /**
     * Compute the consequences of `action` without touching any live state.
     * Must complete in < 50ms for models with ≤ 500 elements.
     */
    preview(action: SpeculativeAction): ConsequencePreview {
        const t0 = performance.now();

        // 1. Snapshot live stores (shallow clone — plain data only)
        const roomStore   = window.roomStore; // TODO(TASK-08)
        const wallStore   = window.wallStore; // TODO(TASK-08)
        const doorStore   = window.doorStore; // TODO(TASK-08)
        const windowStore = window.windowStore; // TODO(TASK-08)
        const stairStore  = window.stairStore; // TODO(TASK-08)
        const bimManager  = window.bimManager;

        const beforeRooms   = cloneStoreItems(roomStore);
        const beforeWalls   = cloneStoreItems(wallStore);
        const beforeDoors   = cloneStoreItems(doorStore);

        // 2. Compute semantic relationships that will be severed
        const severedRelationships = getSemanticRelationships(action.elementId);
        const affectedElements     = getAffectedByDeletion(action.elementId);

        // 3. Apply proposed action to cloned data (no live store writes)
        const afterRooms  = applyActionToRooms(beforeRooms,  action);
        const afterWalls  = applyActionToWalls(beforeWalls,  action);
        const afterDoors  = applyActionToDoors(beforeDoors,  action);

        // 4. Build a fake context for the constraint engine (read-only proxy)
        const makeStore = (items: any[]) => ({
            getAll:    ()      => items,
            getById:   (id: string) => items.find(i => i.id === id) ?? null,
            filter:    (fn: (x: any) => boolean) => items.filter(fn),
        });

        const beforeCtx = {
            roomStore:   makeStore(beforeRooms),
            doorStore:   makeStore(beforeDoors),
            windowStore: windowStore ?? makeStore([]),
            wallStore:   makeStore(beforeWalls),
            stairStore:  stairStore  ?? makeStore([]),
            bimManager,
        };

        const afterCtx = {
            roomStore:   makeStore(afterRooms),
            doorStore:   makeStore(afterDoors),
            windowStore: windowStore ?? makeStore([]),
            wallStore:   makeStore(afterWalls),
            stairStore:  stairStore  ?? makeStore([]),
            bimManager,
        };

        // 5. Run validation on before and after snapshots
        let beforeResults: ValidationResult[] = [];
        let afterResults:  ValidationResult[] = [];
        try {
            beforeResults = constraintEngine.validateAll(beforeCtx as any);
            afterResults  = constraintEngine.validateAll(afterCtx  as any);
        } catch (e) {
            console.warn('[SpeculativeEngine] Constraint validation error:', e);
        }

        // 6. Diff: new violations = in after but NOT in before (by ruleId+elementId)
        const beforeKeys = new Set(beforeResults.map(r => `${r.ruleId}:${r.elementId}`));
        const afterKeys  = new Set(afterResults.map(r => `${r.ruleId}:${r.elementId}`));

        const newViolations      = afterResults.filter(r => !beforeKeys.has(`${r.ruleId}:${r.elementId}`));
        const resolvedViolations = beforeResults.filter(r => !afterKeys.has(`${r.ruleId}:${r.elementId}`));

        const computeTimeMs = performance.now() - t0;

        console.log(
            `[SpeculativeEngine] preview(${action.type}) — ` +
            `+${newViolations.length}viol -${resolvedViolations.length}viol ` +
            `${severedRelationships.length}rels ${computeTimeMs.toFixed(1)}ms`
        );

        return {
            newViolations,
            resolvedViolations,
            severedRelationships,
            affectedElements,
            computeTimeMs,
        };
    }
}

export const speculativeEngine = new SpeculativeEngineImpl();
