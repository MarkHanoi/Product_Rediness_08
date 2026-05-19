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
 *   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
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

// ── Lazy store access ─────────────────────────────────────────────────────────
// Stores are project-scoped singletons published on `window` by initBuilders /
// initTools (see docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md). The
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
    totalElements: number;
    violations: ComplianceRuleSummary[];
    warnings: ComplianceRuleSummary[];
    passRate: number;
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
    totalElements: number;
    semanticRelationshipCount: number;
    wallCount: number;
    roomCount: number;
    doorCount: number;
    windowCount: number;
    rooms: Array<{
        id: string;
        name: string;
        levelId: string;
        occupancyType: string;
        areaM2: number;
        boundingWallCount: number;
        adjacentRoomIds: string[];
        connectedRoomIds: string[];
        containedElementIds: string[];
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
        const rooms = this._getRooms();
        const walls = this._getWalls();
        const doors = this._getDoors();
        const windows = this._getWindows();
        const levels = this._getLevels();

        const levelMap = new Map<string, LevelSummary>();
        for (const level of levels) {
            levelMap.set(level.levelId, level);
        }

        const roomSummaries = rooms.map((room: any) => {
            const adjacentRoomIds = semanticGraphManager.getTargets(room.id, 'adjacentTo');
            const connectedRoomIds = semanticGraphManager.getTargets(room.id, 'connectedTo');
            const containedIds = semanticGraphManager.getTargets(room.id, 'contains');

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
                boundingWallCount:    (room.boundingWallIds ?? []).length,
                adjacentRoomIds:      adjacentRoomIds,
                connectedRoomIds:     connectedRoomIds,
                containedElementIds:  containedIds,
            };
        });

        return {
            projectId,
            snapshotAt:                Date.now(),
            levels:                    Array.from(levelMap.values()),
            totalElements:             walls.length + rooms.length + doors.length + windows.length,
            semanticRelationshipCount: semanticGraphManager.size,
            wallCount:                 walls.length,
            roomCount:                 rooms.length,
            doorCount:                 doors.length,
            windowCount:               windows.length,
            rooms:                     roomSummaries,
        };
    }

    /**
     * Compliance context — violations and warnings from ConstraintEngine.
     * Lazy-loaded to avoid circular imports.
     */
    getComplianceContext(): ComplianceContext {
        try {
            const rooms = this._getRooms();

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

            let allResults: any[] = [];
            try {
                allResults = (constraintEngine as any).validateAll
                    ? (constraintEngine as any).validateAll(ctx)
                    : [];
            } catch {
                allResults = [];
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
        } catch {
            return {
                checkedAt:     Date.now(),
                totalElements: 0,
                violations:    [],
                warnings:      [],
                passRate:      1,
            };
        }
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
                adjacentTo:  r.adjacentRoomIds.map(id => id.substring(0, 8)),
                connectedTo: r.connectedRoomIds.map(id => id.substring(0, 8)),
            })),
            semanticRelationships: ctx.semanticRelationshipCount,
            wallCount:   ctx.wallCount,
            doorCount:   ctx.doorCount,
            windowCount: ctx.windowCount,
        }, null, 2);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _getRooms(): any[] {
        try {
            return _store('roomStore')?.getAll?.() ?? [];
        } catch { return []; }
    }

    private _getWalls(): any[] {
        try {
            return _store('wallStore')?.getAll?.() ?? [];
        } catch { return []; }
    }

    private _getDoors(): any[] {
        try {
            const ds = _store('doorStore');
            if (ds?.getAll) return ds.getAll();
            // Doors live inside WallStore as well; fall back to the wall-side accessor.
            return _store('wallStore')?.getAllDoors?.() ?? [];
        } catch { return []; }
    }

    private _getWindows(): any[] {
        try {
            const ws = _store('windowStore');
            if (ws?.getAll) return ws.getAll();
            return _store('wallStore')?.getAllWindows?.() ?? [];
        } catch { return []; }
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
