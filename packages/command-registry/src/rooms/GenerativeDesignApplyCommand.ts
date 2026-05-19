/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase I-3
 * Files Modified:    src/commands/rooms/GenerativeDesignApplyCommand.ts
 * Classification:    A
 *
 * Single undoable step that creates all rooms from a GeneratedLayout,
 * assigns templates per brief specification, and populates the
 * SemanticGraph with adjacency relationships.
 *
 * All-or-nothing: if any room creation fails, all rooms are removed on undo.
 *
 * §11.2.b / P0 fix:
 *   - toRoomData() now returns a fully schema-compliant RoomData (no cast).
 *   - boundary.detectionMethod (was 'source'); boundary.baseOffset added.
 *   - Required identity fields: type, parentId.
 *   - Required arrays: boundingWallIds, boundingSlabIds, boundingColumnIds.
 *   - Required objects: properties, computed.boundingBox, finishes (omit nulls).
 *   - Full metadata: createdAt, modifiedAt, createdBy, version.
 *   - All previous unknown top-level keys removed.
 *
 * §15 / §07 fix:
 *   - SemanticGraph access goes through the imported singleton, not window.
 *   - addRelationship() uses sourceId/targetId/createdBy (matches the API).
 *
 * §13 / M6 fix:
 *   - affectedStores narrowed to ["room"] — wall/slab stores are not written.
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { RoomData, RoomOccupancyType } from '@pryzm/room-topology';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { GeneratedLayout, GeneratedRoom } from '@pryzm/ai-host';

// ── Occupancy type mapping ────────────────────────────────────────────────────

const ROOM_TYPE_TO_OCCUPANCY: Record<string, RoomOccupancyType> = {
    'bedroom':          'bedroom',
    'patient bedroom':  'patient-room',
    'patient room':     'patient-room',
    'hdu':              'patient-room',
    'itu':              'patient-room',
    'icu':              'patient-room',
    'staff base':       'open-office',
    'staff room':       'open-office',
    'office':           'private-office',
    'meeting room':     'meeting-room',
    'clean utility':    'utility-room',
    'dirty utility':    'utility-room',
    'utility':          'utility-room',
    'treatment room':   'consultation-room',
    'treatment':        'consultation-room',
    'consultation':     'consultation-room',
    'patient wc':       'bathroom',
    'wc':               'bathroom',
    'toilet':           'bathroom',
    'bathroom':         'bathroom',
    'kitchen':          'kitchen',
    'living room':      'living-room',
    'dining room':      'dining-room',
    'corridor':         'corridor',
    'circulation':      'corridor',
    'storage':          'storage-residential',
    'waiting room':     'waiting-room',
    'reception':        'waiting-room',
    'classroom':        'classroom',
    'library':          'library',
    'laboratory':       'laboratory',
};

function mapOccupancy(roomType: string): RoomOccupancyType {
    const lower = roomType.toLowerCase();
    for (const [key, val] of Object.entries(ROOM_TYPE_TO_OCCUPANCY)) {
        if (lower.includes(key) || key.includes(lower)) return val;
    }
    return 'unclassified';
}

// ── Shoelace area formula (same as room store) ────────────────────────────────
function shoelaceArea(polygon: Array<{ x: number; z: number }>): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].z;
        area -= polygon[j].x * polygon[i].z;
    }
    return Math.abs(area) / 2;
}

// ── Centroid helper ───────────────────────────────────────────────────────────
function centroid(polygon: Array<{ x: number; z: number }>): { x: number; z: number } {
    return {
        x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
        z: polygon.reduce((s, p) => s + p.z, 0) / polygon.length,
    };
}

// ── Convert GeneratedRoom → RoomData ─────────────────────────────────────────

function toRoomData(gr: GeneratedRoom, levelId: string, levelHeight: number): RoomData {
    const { x_m, z_m, width_m, depth_m } = gr;

    // CCW rectangle in XZ world space
    const polygon = [
        { x: x_m,           z: z_m },
        { x: x_m + width_m, z: z_m },
        { x: x_m + width_m, z: z_m + depth_m },
        { x: x_m,           z: z_m + depth_m },
    ];

    const area = shoelaceArea(polygon);
    const ctr  = centroid(polygon);
    const now  = Date.now();

    return {
        id:          gr.id,
        type:        'room',
        levelId,
        parentId:    levelId,
        name:        gr.name,
        roomNumber:  '',
        occupancyType: mapOccupancy(gr.roomType),
        boundary: {
            polygon,
            height:          levelHeight,
            baseOffset:      0,
            detectionMethod: 'ai-generated',
        },
        boundingWallIds:   [],
        boundingSlabIds:   [],
        boundingColumnIds: [],
        finishes:          {},
        properties:        {},
        computed: {
            area,
            grossArea: area,
            volume:    area * levelHeight,
            centroid:  ctr,
            perimeter: 2 * (width_m + depth_m),
            boundingBox: {
                minX: x_m,
                minZ: z_m,
                maxX: x_m + width_m,
                maxZ: z_m + depth_m,
            },
        },
        metadata: {
            createdAt:        now,
            modifiedAt:       now,
            createdBy:        'ai-agent',
            version:          1,
            aiGenerated:      true,
            detectionVersion: 0,
        },
    };
}

// ── Command ───────────────────────────────────────────────────────────────────

export class GenerativeDesignApplyCommand implements Command {
    readonly affectedStores = ["room"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.APPLY_GENERATIVE_LAYOUT;
    timestamp = Date.now();
    targetIds: string[];

    private createdIds:    string[]  = [];
    private relationIds:   string[]  = [];

    constructor(
        private readonly layout: GeneratedLayout,
        private readonly levelId: string,
        private readonly levelHeight: number = 3.0,
    ) {
        this.targetIds = layout.rooms.map(r => r.id);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const roomStore = ctx.stores.roomStore;
        if (!roomStore) return { ok: false, reason: 'RoomStore not available' };
        if (this.layout.rooms.length === 0) return { ok: false, reason: 'Layout has no rooms' };
        if (!ctx.bimManager.getLevelById(this.levelId)) {
            return { ok: false, reason: `Level '${this.levelId}' not found` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const roomStore = ctx.stores.roomStore;
        if (!roomStore) return { success: false, affectedElementIds: [], error: 'RoomStore not available' };

        this.createdIds   = [];
        this.relationIds  = [];

        try {
            // ① Create all rooms
            for (const gr of this.layout.rooms) {
                const roomData = toRoomData(gr, this.levelId, this.levelHeight);
                roomStore.add(roomData);
                ctx.bimManager.registerElement(roomData.id, this.levelId);
                elementRegistry.registerSemantic(roomData.id, 'room');
                this.createdIds.push(roomData.id);
            }

            // ② Write adjacency relationships to SemanticGraph (best-effort)
            try {
                for (const adj of this.layout.adjacencyResults) {
                    if (!adj.satisfied || !adj.neighbourId) continue;
                    const relId = semanticGraphManager.addRelationship({
                        type:       'adjacentTo',
                        sourceId:   adj.roomId,
                        targetId:   adj.neighbourId,
                        createdBy:  'system',
                        metadata:   { source: 'generative', briefType: adj.requiredType },
                    });
                    if (relId) this.relationIds.push(relId);
                }
            } catch (sgErr) {
                console.warn('[GenerativeDesignApplyCommand] SemanticGraph write failed (non-fatal):', sgErr);
            }

            console.log(
                `[GenerativeDesignApplyCommand] Applied variant #${this.layout.variantIndex}` +
                ` — ${this.createdIds.length} rooms, ${this.relationIds.length} adjacency edges`,
            );

            return { success: true, affectedElementIds: [...this.createdIds] };
        } catch (err: any) {
            // Rollback
            for (const id of this.createdIds) {
                try { roomStore.remove(id); }              catch { /* best-effort */ }
                try { ctx.bimManager.unregisterElement(id); } catch { /* best-effort */ }
                try { elementRegistry.unregister(id); }    catch { /* best-effort */ }
                try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* best-effort */ }
            }
            this.createdIds  = [];
            this.relationIds = [];
            return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
        }
    }

    undo(ctx: CommandContext): CommandResult {
        const roomStore = ctx.stores.roomStore;
        if (!roomStore || this.createdIds.length === 0) {
            return { success: false, affectedElementIds: [], error: 'Nothing to undo' };
        }

        try {
            // Remove adjacency edges first (best-effort — addRelationship is idempotent on redo)
            try {
                for (const relId of this.relationIds) {
                    semanticGraphManager.removeRelationship(relId);
                }
            } catch { /* best-effort */ }

            // Remove all rooms — also clean any lingering edges keyed off the room id.
            for (const id of this.createdIds) {
                roomStore.remove(id);
                ctx.bimManager.unregisterElement(id);
                elementRegistry.unregister(id);
                try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* best-effort */ }
            }

            const undone = [...this.createdIds];
            this.createdIds  = [];
            this.relationIds = [];
            return { success: true, affectedElementIds: undone };
        } catch (err: any) {
            return { success: false, affectedElementIds: [], error: err?.message ?? String(err) };
        }
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { layout: this.layout, levelId: this.levelId, levelHeight: this.levelHeight },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
