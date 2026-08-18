/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    AI / World Model (NEW FILE)
 * Phase:             Phase D — D-3
 * Files Modified:    src/ai/WorldModelAdapter.ts (new)
 * Classification:    A
 *
 * Contract:
 *   PRYZM_MASTER_ROADMAP_2026.md § D-3
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Impact Assessment:
 *   Store Reads:      YES — reads RoomStore, WallStore via lazy import (read-only)
 *   Store Writes:     NO — pure read-only projection
 *   Event Bus:        NO
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (read-only, no side effects)
 * Rationale:
 *   Extends the existing RoomWorldModelAdapter pattern to expose a full building
 *   semantic context for AI reasoning. The AI can now answer cross-element questions:
 *   - "Which patient rooms are non-compliant?"
 *   - "Which walls can I remove without disconnecting rooms?"
 *   - "What is the path-to-exit for Room 04?"
 *
 * No THREE.js imports. No store mutations. Lazy store access to avoid circular imports.
 */

import { semanticGraphManager, RelationshipType } from '@pryzm/core-app-model';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { decisionRecordStore } from '@pryzm/core-app-model';
// §C78-U-INV-4 — store reads that can REFUSE, so an unreadable store stops
// telling an LLM that the building is empty. See storeReadDetermination.ts.
import {
    determineStoreRead,
    countOrUnknown,
    sumOrUnknown,
    renderCount,
    boundingWallCountOrUnknown,
    type StoreReadDetermination,
    type CountOrUnknown,
} from './storeReadDetermination.js';

// ── Lazy store access ─────────────────────────────────────────────────────────
// Stores are project-scoped singletons published on `window` by initBuilders /
// initTools (see docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md). The
// WorldModelAdapter is a read-only projection layer and must NEVER hold direct
// module-level references to those instances — that would defeat project
// isolation (Contract 45) and create circular imports.
function _store(name: string): any {
    try { return (window as unknown as Record<string, unknown>)[name] ?? null; } catch { return null; }
}

// ── Context interfaces ────────────────────────────────────────────────────────

export interface ElementRelationshipContext {
    elementId: string;
    elementType: string;
    relationships: Array<{
        type: RelationshipType;
        direction: 'outgoing' | 'incoming';
        relatedId: string;
        metadata?: Record<string, string | number | boolean>;
    }>;
}

export interface ComplianceRuleSummary {
    ruleId: string;
    elementId: string;
    elementType: string;
    severity: string;
    message: string;
}

export interface ComplianceContext {
    checkedAt: number;
    totalElements: CountOrUnknown;
    violations: ComplianceRuleSummary[];
    warnings: ComplianceRuleSummary[];
    /**
     * §C78-U-INV-4 — `null` when compliance could not be evaluated at all.
     * This field previously returned `1` (i.e. "100% compliant") from the outer
     * catch, so an INFRASTRUCTURE FAILURE was reported to the AI as a fully
     * compliant building. A pass rate nobody computed is not 1.
     */
    passRate: number | null;
    /** Present when the check could not run; names the reason (C78 §8.1). */
    undetermined?: {
        readonly scope: string;
        readonly reason: string;
        readonly detail?: string;
    };
}

export interface ProgrammeRoomEntry {
    roomId: string;
    name: string;
    occupancyType: string;
    targetAreaM2: number;
    actualAreaM2: number;
    deviationPct: number;
    status: 'pass' | 'warning' | 'fail';
}

export interface ProgrammeContext {
    totalRooms: number;
    totalGrossAreaM2: number;
    rooms: ProgrammeRoomEntry[];
    complianceRate: number;
}

export interface LevelSummary {
    levelId: string;
    name: string;
    elevation: number;
    roomCount: number;
    totalAreaM2: number;
}

export interface BuildingContext {
    projectId: string;
    snapshotAt: number;
    levels: LevelSummary[];
    // §C78-U-INV-4 — `null` is UNKNOWN, and is never `0`. A store that could not
    // be read must not be able to say "this building has no walls": these
    // counts are the values `toPromptContext` serialises into an LLM prompt, so
    // a fabricated `0` here becomes a fabricated premise in English.
    totalElements: CountOrUnknown;
    semanticRelationshipCount: number;
    wallCount: CountOrUnknown;
    roomCount: CountOrUnknown;
    doorCount: CountOrUnknown;
    windowCount: CountOrUnknown;
    /** The store reads that REFUSED, named, so a caller can render C78 §5's
     *  visible "cannot determine" rather than inferring it from a `null`. */
    undeterminedReads: ReadonlyArray<{
        readonly scope: string;
        readonly reason: string;
        readonly detail?: string;
    }>;
    rooms: Array<{
        id: string;
        name: string;
        levelId: string;
        occupancyType: string;
        areaM2: number;
        /** `null` when `boundingWallIds` was never written (C79 §7.1) — NOT 0,
         *  which would assert the room is unbounded. */
        boundingWallCount: CountOrUnknown;
        /** §GR13-ADJACENCY-READER — `null` when the graph REFUSED to answer for
         *  this room (never covered by a detection pass, or its region
         *  conclusion invalidated by a bounding element that moved or was
         *  deleted). NOT `[]`, which asserts the room touches nothing. */
        adjacentRoomIds: readonly string[] | null;
        /** §GR13-ADJACENCY-READER — `null` = undetermined. `[]` here is the
         *  strong claim "no door connects this room to another"; the two must
         *  never reach an AI prompt as the same value. */
        connectedRoomIds: readonly string[] | null;
        /** §GR13-CONTAINS-READER — `null` when the furniture writer has never
         *  covered this room. NOT `[]`, which asserts the room is empty. */
        containedElementIds: readonly string[] | null;
        /** The named refusal reasons behind any `null` above (C78 §5 — the
         *  model must be told WHAT it was not told). */
        undeterminedRelationships: ReadonlyArray<{ readonly family: string; readonly reason: string }>;
    }>;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * WorldModelAdapterImpl — full building context for AI reasoning.
 *
 * Uses lazy store access (dynamic require-like import) to avoid circular imports.
 * All methods are read-only projections of live store state + SemanticGraph.
 */
class WorldModelAdapterImpl {

    /**
     * Full building context for AI prompts.
     * Covers all levels, rooms, structural elements, and semantic relationships.
     */
    getFullBuildingContext(projectId: string): BuildingContext {
        // §C78-U-INV-4 — read each store as a DETERMINATION, so "unreadable"
        // and "empty" stop being the same value on the way into an AI prompt.
        const roomsD   = this._roomsDetermination();
        const wallsD   = this._wallsDetermination();
        const doorsD   = this._doorsDetermination();
        const windowsD = this._windowsDetermination();

        const undeterminedReads = [roomsD, wallsD, doorsD, windowsD]
            .filter((d): d is Extract<typeof d, { kind: 'undetermined' }> => d.kind === 'undetermined')
            .map((d) => ({
                scope: d.scope,
                reason: d.reason,
                ...(d.detail !== undefined ? { detail: d.detail } : {}),
            }));

        const rooms = roomsD.kind === 'determined' ? (roomsD.elements as any[]) : [];
        const levels = this._getLevels();

        const levelMap = new Map<string, LevelSummary>();
        for (const level of levels) {
            levelMap.set(level.levelId, level);
        }

        const roomSummaries = rooms.map((room: any) => {
            // §GR13-ADJACENCY-READER / §GR13-CONTAINS-READER (C71 §4.4 · C78
            // §1.4) — these three were bare `getTargets`, whose `[]` means both
            // "this room touches/contains nothing" and "nobody has ever
            // determined that", and the result went verbatim into an AI prompt
            // as fact. Same treatment the store reads above already get: the
            // refusal survives as `null` plus a NAMED reason, and the prompt
            // serialiser renders it as the word "unknown".
            const adjQ = semanticGraphManager.getAdjacentRooms(room.id);
            const connQ = semanticGraphManager.getConnectedRooms(room.id);
            const containsQ = semanticGraphManager.getContainedElements(room.id);
            const adjacentRoomIds = adjQ.ok ? adjQ.adjacentRoomIds : null;
            const connectedRoomIds = connQ.ok ? connQ.connectedRoomIds : null;
            const containedIds = containsQ.ok ? containsQ.containedIds : null;
            const undeterminedRelationships = [
                ...(adjQ.ok ? [] : [{ family: 'adjacentTo', reason: adjQ.reason }]),
                ...(connQ.ok ? [] : [{ family: 'connectedTo', reason: connQ.reason }]),
                ...(containsQ.ok ? [] : [{ family: 'contains', reason: containsQ.reason }]),
            ];

            // Update level summary area
            const levelEntry = levelMap.get(room.levelId);
            if (levelEntry) {
                levelEntry.totalAreaM2 += room.computed?.area ?? 0;
                levelEntry.roomCount += 1;
            }

            return {
                id:                   room.id,
                name:                 room.name ?? 'Unnamed Room',
                levelId:              room.levelId,
                occupancyType:        room.occupancyType ?? 'unassigned',
                areaM2:               room.computed?.area ?? 0,
                boundingWallCount:    boundingWallCountOrUnknown(room),
                adjacentRoomIds:      adjacentRoomIds,
                connectedRoomIds:     connectedRoomIds,
                containedElementIds:  containedIds,
                undeterminedRelationships,
            };
        });

        const wallCount   = countOrUnknown(wallsD);
        const roomCount   = countOrUnknown(roomsD);
        const doorCount   = countOrUnknown(doorsD);
        const windowCount = countOrUnknown(windowsD);

        return {
            projectId,
            snapshotAt:                Date.now(),
            levels:                    Array.from(levelMap.values()),
            // A total assembled from a partially-read model is not a total.
            totalElements:             sumOrUnknown([wallCount, roomCount, doorCount, windowCount]),
            semanticRelationshipCount: semanticGraphManager.size,
            wallCount,
            roomCount,
            doorCount,
            windowCount,
            undeterminedReads,
            rooms:                     roomSummaries,
        };
    }

    /**
     * Compliance context — violations and warnings from ConstraintEngine.
     * Lazy-loaded to avoid circular imports.
     */
    getComplianceContext(): ComplianceContext {
        try {
            // The DENOMINATOR of passRate. If the rooms could not be read there
            // is no denominator, and a rate computed over one is fiction.
            const roomsD = this._roomsDetermination();
            if (roomsD.kind === 'undetermined') {
                return this._complianceUndetermined(roomsD.reason, roomsD.detail);
            }
            const rooms = roomsD.elements as any[];

            const violations: ComplianceRuleSummary[] = [];
            const warnings: ComplianceRuleSummary[] = [];

            // ConstraintEngine expects a full ConstraintContext (all stores) and
            // performs project-wide validation in a single pass. We then bucket
            // results by element id. This matches the engine signature defined in
            // src/constraints/ConstraintEngine.ts (validate(elementId, ctx)).
            const ctx = {
                roomStore:   _store('roomStore'),
                doorStore:   _store('doorStore'),
                windowStore: _store('windowStore'),
                wallStore:   _store('wallStore'),
                stairStore:  _store('stairStore'),
                bimManager:  _store('bimManager'),
            };

            // §C78-U-INV-4 — a validator that threw, or is not composed, has
            // NOT established that the model is compliant. Both used to become
            // `allResults = []`, i.e. "zero violations".
            let allResults: any[];
            if (!(constraintEngine as any).validateAll) {
                return this._complianceUndetermined(
                    'ENGINE_NOT_AVAILABLE',
                    'the constraint engine is not composed in this runtime, so no rule was evaluated',
                );
            }
            try {
                allResults = (constraintEngine as any).validateAll(ctx);
            } catch (e) {
                return this._complianceUndetermined(
                    'PLANNER_THREW',
                    `constraintEngine.validateAll threw: ${String((e as Error)?.message ?? e)}`,
                );
            }

            const failedElementIds = new Set<string>();
            for (const result of allResults) {
                const elementId = result.elementId ?? 'unknown';
                const entry: ComplianceRuleSummary = {
                    ruleId:      result.ruleId ?? 'unknown',
                    elementId,
                    elementType: result.elementType ?? this._inferElementType(elementId),
                    severity:    result.severity ?? 'warning',
                    message:     result.message ?? '',
                };
                if (result.severity === 'error') violations.push(entry);
                else warnings.push(entry);
                failedElementIds.add(elementId);
            }

            const total = rooms.length;
            const failedCount = failedElementIds.size;
            const passRate = total > 0 ? Math.max(0, (total - failedCount) / total) : 1;

            return {
                checkedAt:     Date.now(),
                totalElements: total,
                violations,
                warnings,
                passRate,
            };
        } catch (e) {
            // §C78-U-INV-4 — this arm used to return `passRate: 1` with zero
            // violations: an infrastructure failure reported as a fully
            // compliant building, to a user and to an LLM. ARM A by
            // construction — a caught throw is "I could not look".
            return this._complianceUndetermined(
                'PLANNER_THREW',
                `compliance evaluation threw: ${String((e as Error)?.message ?? e)}`,
            );
        }
    }

    /**
     * The honest compliance answer when nothing could be evaluated (C78 §5).
     * `passRate: null` — never `1`, never `0`: a rate nobody computed has no
     * value, and BOTH numbers would be positive claims.
     */
    private _complianceUndetermined(reason: string, detail?: string): ComplianceContext {
        return {
            checkedAt:     Date.now(),
            totalElements: null,
            violations:    [],
            warnings:      [],
            passRate:      null,
            undetermined: {
                scope: 'project compliance',
                reason,
                ...(detail !== undefined ? { detail } : {}),
            },
        };
    }

    /**
     * Programme context — target vs actual areas per room.
     * Uses room.targetAreaM2 if set (from ProgrammePanel brief assignment).
     */
    getProgrammeContext(): ProgrammeContext {
        const rooms = this._getRooms();
        const programmeRooms: ProgrammeRoomEntry[] = [];
        let totalGrossAreaM2 = 0;
        let compliantCount = 0;

        for (const room of rooms) {
            const actualArea = room.computed?.area ?? 0;
            const targetArea = room.targetAreaM2 ?? 0;
            totalGrossAreaM2 += actualArea;

            let deviationPct = 0;
            let status: 'pass' | 'warning' | 'fail' = 'pass';

            if (targetArea > 0) {
                deviationPct = ((actualArea - targetArea) / targetArea) * 100;
                if (Math.abs(deviationPct) > 20) status = 'fail';
                else if (Math.abs(deviationPct) > 10) status = 'warning';
            }

            if (status === 'pass') compliantCount++;

            programmeRooms.push({
                roomId:        room.id,
                name:          room.name ?? 'Unnamed',
                occupancyType: room.occupancyType ?? 'unassigned',
                targetAreaM2:  targetArea,
                actualAreaM2:  actualArea,
                deviationPct,
                status,
            });
        }

        const complianceRate = rooms.length > 0 ? compliantCount / rooms.length : 1;

        return {
            totalRooms:       rooms.length,
            totalGrossAreaM2,
            rooms:            programmeRooms,
            complianceRate,
        };
    }

    /**
     * Relationship context for a single element — used by RelationshipExplorerPanel
     * and AI prompts that reason about specific elements.
     */
    getRelationshipContext(elementId: string): ElementRelationshipContext {
        const allRels = semanticGraphManager.getRelationships(elementId);
        const elementType = this._inferElementType(elementId);

        const relationships = allRels.map(rel => ({
            type:      rel.type,
            direction: rel.sourceId === elementId ? 'outgoing' as const : 'incoming' as const,
            relatedId: rel.sourceId === elementId ? rel.targetId : rel.sourceId,
            ...(rel.metadata !== undefined ? { metadata: rel.metadata } : {}),
        }));

        return { elementId, elementType, relationships };
    }

    /**
     * Compact JSON string for AI prompt injection.
     * Strips geometry; keeps only semantic data.
     */
    toPromptContext(projectId: string): string {
        const ctx = this.getFullBuildingContext(projectId);
        return JSON.stringify({
            projectId: ctx.projectId,
            levels:    ctx.levels.map(l => ({ id: l.levelId, name: l.name, rooms: l.roomCount, areaMtSq: l.totalAreaM2.toFixed(1) })),
            rooms:     ctx.rooms.map(r => ({
                id:          r.id.substring(0, 8),
                name:        r.name,
                type:        r.occupancyType,
                areaMtSq:   r.areaM2.toFixed(1),
                // §GR13-ADJACENCY-READER — the LLM-facing half. `null` reaches
                // the model as the WORD "unknown", exactly as `renderCount`
                // already does for the store counts below: an empty ARRAY here
                // reads to a model as "this room borders nothing", which is a
                // conclusion no one drew.
                adjacentTo:  r.adjacentRoomIds === null ? 'unknown' : r.adjacentRoomIds.map(id => id.substring(0, 8)),
                connectedTo: r.connectedRoomIds === null ? 'unknown' : r.connectedRoomIds.map(id => id.substring(0, 8)),
                ...(r.undeterminedRelationships.length > 0
                    ? { couldNotDetermine: r.undeterminedRelationships.map(u => `${u.family} (${u.reason})`) }
                    : {}),
            })),
            semanticRelationships: ctx.semanticRelationshipCount,
            // §C78-U-INV-4 — the LLM-facing half of the fix. An unknown count
            // reaches the model as the WORD "unknown", never as a `0` it would
            // reason from. Serialising a fabricated zero here is how "the store
            // did not answer" became "the building has no walls" in English.
            wallCount:   renderCount(ctx.wallCount),
            doorCount:   renderCount(ctx.doorCount),
            windowCount: renderCount(ctx.windowCount),
            // Named, so the model is told WHAT it was not told (C78 §5).
            ...(ctx.undeterminedReads.length > 0
                ? { couldNotDetermine: ctx.undeterminedReads.map(u => `${u.scope} (${u.reason})`) }
                : {}),
        }, null, 2);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    // ── §C78-U-INV-4 · store reads that can REFUSE ────────────────────────────
    // These returned `[]` for BOTH "this project holds no walls" and "the store
    // is absent / threw". The adapter then counted the `[]` and
    // `toPromptContext` serialised the count into an LLM prompt — so an
    // infrastructure failure told the model, in JSON, that the building has no
    // walls. See storeReadDetermination.ts. The `Determination` suffix is kept
    // in the name so a future `?? []` at a call site reads as obviously wrong.

    private _roomsDetermination(): StoreReadDetermination<any> {
        return determineStoreRead<any>(_store('roomStore'), 'roomStore');
    }

    private _wallsDetermination(): StoreReadDetermination<any> {
        return determineStoreRead<any>(_store('wallStore'), 'wallStore');
    }

    /** Doors may live in their own store OR inside WallStore; either is a real
     *  answer. Only when NEITHER can be read is the count unknown. */
    private _doorsDetermination(): StoreReadDetermination<any> {
        const primary = determineStoreRead<any>(_store('doorStore'), 'doorStore');
        if (primary.kind === 'determined') return primary;
        return determineStoreRead<any>(_store('wallStore'), 'wallStore', 'getAllDoors');
    }

    private _windowsDetermination(): StoreReadDetermination<any> {
        const primary = determineStoreRead<any>(_store('windowStore'), 'windowStore');
        if (primary.kind === 'determined') return primary;
        return determineStoreRead<any>(_store('wallStore'), 'wallStore', 'getAllWindows');
    }

    /** The rooms themselves, or `[]` when unreadable — used only where the
     *  determination has ALREADY been reported, never to manufacture a count. */
    private _getRooms(): any[] {
        const d = this._roomsDetermination();
        return d.kind === 'determined' ? (d.elements as any[]) : [];
    }

    private _getLevels(): LevelSummary[] {
        try {
            const levels = _store('wallStore')?.getLevels?.() ?? [];
            return levels.map((l: any) => ({
                levelId:      l.id,
                name:         l.name ?? `Level ${l.id}`,
                elevation:    l.elevation ?? 0,
                roomCount:    0,
                totalAreaM2:  0,
            }));
        } catch { return []; }
    }

    private _inferElementType(elementId: string): string {
        try {
            return elementRegistry.getStoreType(elementId) ?? 'unknown';
        } catch { return 'unknown'; }
    }

    // ── G-3: Decision context for AI prompts ──────────────────────────────────

    /**
     * Returns all non-dismissed decision records formatted as a compact,
     * readable AI context string.
     *
     * Format per record:
     *   "[Room 14, WA042] Enlarged to 18m² (template min 12m²) — bariatric patient equipment"
     *
     * Optionally filtered by elementId scope (pass undefined for all).
     * Used by AI prompt builders to inject design rationale into the context window.
     */
    getDecisionContext(scope?: { elementId?: string; levelId?: string }): string {
        try {
            const records = (decisionRecordStore as any).getNonDismissed?.() ?? [];

            const filtered = scope?.elementId
                ? records.filter((r: any) => r.elementId === scope.elementId)
                : records;

            if (filtered.length === 0) return '';

            const lines = filtered.map((r: any) => {
                const typeLabel: Record<string, string> = {
                    deviation:  'Deviation',
                    override:   'Override',
                    preference: 'Preference',
                    external:   'External',
                };
                const label = typeLabel[r.decisionType] ?? r.decisionType;
                const rationale = r.decision ? ` — ${r.decision}` : ' (no rationale recorded)';
                const date = r.recordedAt ? new Date(r.recordedAt).toLocaleDateString() : '';
                return `[${label}] ${r.elementId}${date ? ` (${date})` : ''}${rationale}`;
            });

            return `\n\n## Recorded Design Decisions\n${lines.join('\n')}`;
        } catch { return ''; }
    }

    /**
     * Returns all non-dismissed decision records as structured objects.
     * Used by RationaleExporter to generate design justification documents.
     */
    getDecisionRecords(scope?: { elementId?: string }): Array<{
        elementId:    string;
        decisionType: string;
        decision:     string;
        dismissed:    boolean;
        triggeredAt:  number;
        recordedAt:   number;
        commandId:    string;
        constraintRuleId?: string;
    }> {
        try {
            const all = (decisionRecordStore as any).getAll?.() ?? [];
            return scope?.elementId
                ? all.filter((r: any) => r.elementId === scope.elementId)
                : all;
        } catch { return []; }
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — used by AI prompt builders and RelationshipExplorerPanel. */
export const worldModelAdapter = new WorldModelAdapterImpl();
