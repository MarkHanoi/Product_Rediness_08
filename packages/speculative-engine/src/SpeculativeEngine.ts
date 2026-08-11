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

/**
 * §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3) — why the semantic read can fail to happen
 * at all, as opposed to happening and finding nothing.
 *
 * `graph-absent`     — `window.semanticGraphManager` is not installed yet. The
 *                      legacy bootstrap (`initDataPlatform.ts`) sets it; a preview
 *                      raised before that runs has no graph to consult.
 * `method-absent`    — the global IS installed but does not carry the query method
 *                      this engine needs. This is the reason the defect existed:
 *                      the guard asked for `getEdges`, which `SemanticGraphManager`
 *                      has never had, so it fired on every call for five months
 *                      and was indistinguishable from "no relationships".
 * `query-threw`      — the query was made and raised.
 */
export type SemanticReadRefusalReason = 'graph-absent' | 'method-absent' | 'query-threw';

/**
 * §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3) — a semantic read that did not happen,
 * carrying WHY.
 *
 * Follows the refusal idiom already landed in this repo — `WallOccupancyStore`'s
 * `OpeningRefusal` (a typed reason plus a human sentence naming the numbers) and
 * `planOpeningRefit`'s plan-not-mutation return. The rule it enforces here:
 * **"this element has no relationships" and "the query I made could not run" must
 * never be the same value.** Before W2-3 both were `[]`.
 */
export interface SemanticReadRefusal {
    reason:  SemanticReadRefusalReason;
    /** The element the read was about. */
    elementId: string;
    /** The method the read required, e.g. `getRelationships`. */
    requiredMethod: string;
    /** Human-readable sentence NAMING the reason — never a generic failure string. */
    detail:  string;
}

export interface ConsequencePreview {
    newViolations:        ValidationResult[];
    resolvedViolations:   ValidationResult[];
    /**
     * Relationships the action would sever. Empty ⇔ the graph was read successfully
     * and the element has none — but ONLY when `semanticReadRefusals` is also empty.
     * If a refusal is present this array is empty because nothing could be read, and
     * the caller must not present it as "no consequences".
     */
    severedRelationships: SemanticRelationshipSnapshot[];
    affectedElements:     string[];
    /**
     * §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3) — empty ⇔ every semantic read this
     * preview needed actually ran. Non-empty ⇔ `severedRelationships` and
     * `affectedElements` are UNKNOWN, not zero.
     */
    semanticReadRefusals: SemanticReadRefusal[];
    computeTimeMs:        number;
}

/** Internal — the outcome of one attempt to read the semantic graph. */
type SemanticReadResult =
    | { ok: true;  relationships: SemanticRelationshipSnapshot[] }
    | { ok: false; refusal: SemanticReadRefusal };

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

/**
 * §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3) — read every relationship touching
 * `elementId`, or REFUSE with a named reason.
 *
 * Replaces two functions that both guarded on `sgm.getEdges`, a method
 * `SemanticGraphManager` has never exposed (its query surface is
 * `getAll` / `getRelationships` / `getTargets` / `getSources`). Both guards were
 * therefore permanently true and both functions returned `[]` unconditionally —
 * the engine's entire semantic read path was dead code, and the deadness was
 * invisible because its output was identical to a legitimately unrelated element.
 * Evidence: `docs/04-reference/bim30-evidence/EV-04-semanticgraph-write-coverage.md` §5(b).
 *
 * `getRelationships` is the right method rather than `getTargets`: severance is
 * symmetric. A door is severed by deleting its host wall via `hostedBy` where the
 * door is the SOURCE, so a source-only read (`getTargets`) would miss exactly the
 * cascade this engine exists to preview.
 *
 * Read ONCE per preview — `severedRelationships` and `affectedElements` are two
 * projections of the same edge set, and reading twice let them disagree.
 */
function readSemanticRelationships(elementId: string): SemanticReadResult {
    const sgm = window.semanticGraphManager;

    if (!sgm) {
        return {
            ok: false,
            refusal: {
                reason:         'graph-absent',
                elementId,
                requiredMethod: 'getRelationships',
                detail:
                    'Semantic relationships are UNKNOWN, not absent: ' +
                    'window.semanticGraphManager is not installed, so no severance could be computed ' +
                    `for element ${elementId}.`,
            },
        };
    }

    // The global is installed by a legacy bootstrap and is not guaranteed to be the
    // current class — a runtime shape check is what makes the refusal below reachable.
    if (typeof sgm.getRelationships !== 'function') {
        return {
            ok: false,
            refusal: {
                reason:         'method-absent',
                elementId,
                requiredMethod: 'getRelationships',
                detail:
                    'Semantic relationships are UNKNOWN, not absent: ' +
                    'window.semanticGraphManager is present but exposes no getRelationships() method, ' +
                    `so no severance could be computed for element ${elementId}.`,
            },
        };
    }

    try {
        const rels = sgm.getRelationships(elementId);
        return {
            ok: true,
            relationships: rels.map(r => ({
                sourceId: r.sourceId,
                targetId: r.targetId,
                type:     r.type as string,
            })),
        };
    } catch (e) {
        return {
            ok: false,
            refusal: {
                reason:         'query-threw',
                elementId,
                requiredMethod: 'getRelationships',
                detail:
                    'Semantic relationships are UNKNOWN, not absent: ' +
                    `window.semanticGraphManager.getRelationships('${elementId}') threw ` +
                    `(${e instanceof Error ? e.message : String(e)}).`,
            },
        };
    }
}

/**
 * The elements at the FAR end of each severed edge — i.e. what else the action
 * reaches. Derived from an already-performed read so it can never disagree with
 * `severedRelationships`.
 */
function affectedFromRelationships(
    elementId: string,
    relationships: SemanticRelationshipSnapshot[],
): string[] {
    const out = new Set<string>();
    for (const r of relationships) {
        const other = r.sourceId === elementId ? r.targetId : r.sourceId;
        if (other && other !== elementId) out.add(other);
    }
    return Array.from(out);
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

        // 2. Compute semantic relationships that will be severed.
        //    §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3): a read that could not happen is
        //    reported as a typed refusal, NOT as an empty result set.
        const semanticRead = readSemanticRelationships(action.elementId);
        const severedRelationships = semanticRead.ok ? semanticRead.relationships : [];
        const affectedElements     = semanticRead.ok
            ? affectedFromRelationships(action.elementId, semanticRead.relationships)
            : [];
        const semanticReadRefusals: SemanticReadRefusal[] =
            semanticRead.ok ? [] : [semanticRead.refusal];

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

        // §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3): "0rels" used to be printed both when
        // the element genuinely had none and when the read never ran. Say which.
        const relsLabel = semanticReadRefusals.length > 0
            ? `rels=REFUSED(${semanticReadRefusals.map(r => r.reason).join(',')})`
            : `${severedRelationships.length}rels`;

        console.log(
            `[SpeculativeEngine] preview(${action.type}) — ` +
            `+${newViolations.length}viol -${resolvedViolations.length}viol ` +
            `${relsLabel} ${computeTimeMs.toFixed(1)}ms`
        );
        for (const r of semanticReadRefusals) {
            console.warn(`[SpeculativeEngine] semantic read refused: ${r.detail}`);
        }

        return {
            newViolations,
            resolvedViolations,
            severedRelationships,
            affectedElements,
            semanticReadRefusals,
            computeTimeMs,
        };
    }
}

export const speculativeEngine = new SpeculativeEngineImpl();
